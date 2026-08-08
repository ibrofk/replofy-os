import { createHash, randomUUID } from 'crypto';
import { FieldPath } from 'firebase-admin/firestore';
import type { ApiKeyScope } from '../types.js';
import { ApiKeyServerError, getAdminFirestore, type AuthorizedApiKeyActor } from './apiKeyServer.js';

export type ContextRoutingResource =
  | 'tasks'
  | 'bugs'
  | 'roadmap-items'
  | 'blog-articles'
  | 'business-plans'
  | 'visions'
  | 'cycle-goals'
  | 'prompts'
  | 'api-endpoints'
  | 'environments'
  | 'social-posts'
  | 'seo-keywords'
  | 'feedbacks'
  | 'accounts'
  | 'leads'
  | 'time-blocks'
  | 'operator-desks'
  | 'work-orders'
  | 'operator-context-packs'
  | 'operator-memories'
  | 'operator-checkins'
  | 'operator-outputs'
  | 'operator-injections'
  | 'operator-approvals'
  | 'context-sources'
  | 'context-source-versions'
  | 'users'
  | 'companies'
  | 'invitations';

type ScopeMode = 'companyOrAuthor' | 'companyOrNull' | 'companyMembers' | 'companyOnly' | 'currentCompany';
type RelationRole = 'relationship' | 'parent' | 'owner';

type RelationDefinition = {
  field: string;
  target: ContextRoutingResource;
  many?: boolean;
  role?: RelationRole;
};

type RoutingResourceDefinition = {
  resource: ContextRoutingResource;
  collection: string;
  readScope: ApiKeyScope;
  scopeMode: ScopeMode;
  labelFields: string[];
  summaryFields: string[];
  textFields: string[];
  dateFields: string[];
  statusField?: string;
  aliasFields?: string[];
  relations?: RelationDefinition[];
  dynamicRelations?: 'business-plan-links';
};

type AccessMetadata = {
  companyId?: string | null;
  authorId?: string | null;
  ownerId?: string | null;
};

export type ProjectedContextRecord = {
  resource: ContextRoutingResource;
  id: string;
  label: string;
  summary: string;
  searchText: string;
  aliases: string[];
  metadataKeys: string[];
  sourceIds: string[];
  sourceVersionIds: string[];
  relationships: Array<{ resource: ContextRoutingResource; id: string }>;
  parentKeys: string[];
  ownerKeys: string[];
  status: string;
  recencyAt: string | null;
  access: AccessMetadata;
};

export type ContextRoutingEvidence = {
  code: string;
  score: number;
  reason: string;
  lexical: boolean;
};

export type ContextRoutingScore = {
  score: number;
  tier: 'attached' | 'suggested' | 'ignored';
  evidence: ContextRoutingEvidence[];
  modifiers: Array<{ code: string; score: number; reason: string }>;
  lexicalOnly: boolean;
};

export type ContextCatalogCacheKeyInput = {
  workspaceId: string;
  actorIdentity: string;
  authMode: string;
  scopes: string[];
  permissions: string[];
  registryVersion: string;
  queryShape: Record<string, unknown>;
};

type CacheKeyResult = {
  hash: string;
  diagnostics: {
    authMode: string;
    scopeCount: number;
    permissionCount: number;
    registryVersion: string;
    queryShapeHash: string;
  };
};

type CandidateCatalogCacheEntry = {
  expiresAt: number;
  workspaceId: string;
  actorIdentity: string;
  records: ProjectedContextRecord[];
};

type RouteContextOptions = {
  actor: AuthorizedApiKeyActor;
  authMode: string;
  anchorResource: ContextRoutingResource;
  anchor: Record<string, unknown> & { id: string };
  debug?: boolean;
};

export const CONTEXT_ROUTING_REGISTRY_VERSION = '2026-06-06.3';
export const CONTEXT_ROUTING_POLICY_VERSION = 'deterministic-v2';
export const CONTEXT_ROUTING_THRESHOLDS = {
  attached: 80,
  suggested: 50,
} as const;

const ROUTING_LIMITS = {
  attached: 4,
  suggestions: 3,
  perResource: 2,
  lexicalCandidates: 200,
  catalogPerResource: 200,
  reversePerRelation: 50,
  debugCandidates: 25,
} as const;

const BUSINESS_PLAN_LINK_RESOURCES: Record<string, ContextRoutingResource> = {
  task: 'tasks',
  cycleGoal: 'cycle-goals',
  vision: 'visions',
  blogArticle: 'blog-articles',
  contextSource: 'context-sources',
  apiEndpoint: 'api-endpoints',
  feedback: 'feedbacks',
  socialPost: 'social-posts',
  prompt: 'prompts',
  timeBlock: 'time-blocks',
  environment: 'environments',
  teamMember: 'users',
};

const SOURCE_RELATIONS: RelationDefinition[] = [
  { field: 'sourceIds', target: 'context-sources', many: true },
  { field: 'sourceVersionIds', target: 'context-source-versions', many: true },
];

const DOMAIN_RECORD_RELATIONS: RelationDefinition[] = [
  { field: 'linkedTaskIds', target: 'tasks', many: true },
  { field: 'linkedBugIds', target: 'bugs', many: true },
  { field: 'linkedRoadmapItemIds', target: 'roadmap-items', many: true },
  { field: 'linkedBusinessPlanIds', target: 'business-plans', many: true },
  { field: 'linkedVisionIds', target: 'visions', many: true },
  { field: 'linkedCycleGoalIds', target: 'cycle-goals', many: true },
  { field: 'linkedPromptIds', target: 'prompts', many: true },
  { field: 'linkedFeedbackIds', target: 'feedbacks', many: true },
  { field: 'linkedAccountIds', target: 'accounts', many: true },
  { field: 'linkedLeadIds', target: 'leads', many: true },
];

const ROUTING_REGISTRY: Record<ContextRoutingResource, RoutingResourceDefinition> = {
  tasks: {
    resource: 'tasks',
    collection: 'tasks',
    readScope: 'workspace:read',
    scopeMode: 'companyOrAuthor',
    labelFields: ['title'],
    summaryFields: ['executionNotes', 'title'],
    textFields: ['title', 'executionNotes'],
    dateFields: ['completedAt', 'createdAt'],
    statusField: 'status',
    aliasFields: ['sourceKey', 'matchKey', 'aliases'],
    relations: [
      { field: 'cycleGoalId', target: 'cycle-goals', role: 'parent' },
      { field: 'assigneeId', target: 'users', role: 'owner' },
      ...SOURCE_RELATIONS,
    ],
  },
  bugs: {
    resource: 'bugs',
    collection: 'bugs',
    readScope: 'workspace:read',
    scopeMode: 'companyOrAuthor',
    labelFields: ['title'],
    summaryFields: ['resolutionNotes', 'description', 'title'],
    textFields: ['title', 'description', 'resolutionNotes'],
    dateFields: ['updatedAt', 'createdAt'],
    statusField: 'status',
    relations: [{ field: 'linkedTaskIds', target: 'tasks', many: true }],
  },
  'roadmap-items': {
    resource: 'roadmap-items',
    collection: 'roadmapItems',
    readScope: 'workspace:read',
    scopeMode: 'companyOrAuthor',
    labelFields: ['title'],
    summaryFields: ['description', 'title'],
    textFields: ['title', 'description', 'phase', 'priority'],
    dateFields: ['updatedAt', 'createdAt'],
    statusField: 'status',
    relations: [{ field: 'linkedTaskIds', target: 'tasks', many: true }],
  },
  'blog-articles': {
    resource: 'blog-articles',
    collection: 'blogArticles',
    readScope: 'workspace:read',
    scopeMode: 'companyOrAuthor',
    labelFields: ['title', 'slug'],
    summaryFields: ['summary', 'content', 'title'],
    textFields: ['title', 'slug', 'summary', 'content', 'tags', 'dataPoints', 'validationNotes'],
    dateFields: ['updatedAt', 'publishedAt', 'createdAt'],
    statusField: 'status',
  },
  'business-plans': {
    resource: 'business-plans',
    collection: 'businessPlans',
    readScope: 'workspace:read',
    scopeMode: 'companyOrAuthor',
    labelFields: ['title'],
    summaryFields: ['summary', 'content', 'title'],
    textFields: ['title', 'summary', 'content', 'tags'],
    dateFields: ['updatedAt', 'createdAt'],
    statusField: 'status',
    dynamicRelations: 'business-plan-links',
  },
  visions: {
    resource: 'visions',
    collection: 'visions',
    readScope: 'workspace:read',
    scopeMode: 'companyOrAuthor',
    labelFields: ['title'],
    summaryFields: ['description', 'title'],
    textFields: ['title', 'description', 'focusItems'],
    dateFields: ['createdAt'],
    aliasFields: ['sourceKey', 'matchKey', 'aliases'],
    relations: SOURCE_RELATIONS,
  },
  'cycle-goals': {
    resource: 'cycle-goals',
    collection: 'cycleGoals',
    readScope: 'workspace:read',
    scopeMode: 'companyOrAuthor',
    labelFields: ['title'],
    summaryFields: ['description', 'title'],
    textFields: ['title', 'description'],
    dateFields: ['createdAt'],
    statusField: 'status',
    aliasFields: ['sourceKey', 'matchKey', 'aliases'],
    relations: SOURCE_RELATIONS,
  },
  prompts: {
    resource: 'prompts',
    collection: 'prompts',
    readScope: 'workspace:read',
    scopeMode: 'companyOrAuthor',
    labelFields: ['title'],
    summaryFields: ['content', 'title'],
    textFields: ['title', 'version', 'content'],
    dateFields: ['createdAt'],
  },
  'api-endpoints': {
    resource: 'api-endpoints',
    collection: 'apiEndpoints',
    readScope: 'systems:read',
    scopeMode: 'companyOrAuthor',
    labelFields: ['path', 'description'],
    summaryFields: ['description', 'path'],
    textFields: ['method', 'path', 'description'],
    dateFields: ['createdAt'],
    statusField: 'status',
  },
  environments: {
    resource: 'environments',
    collection: 'environments',
    readScope: 'systems:read',
    scopeMode: 'companyOrNull',
    labelFields: ['name'],
    summaryFields: ['version', 'name'],
    textFields: ['name', 'version'],
    dateFields: ['lastSync', 'createdAt'],
    statusField: 'status',
  },
  'social-posts': {
    resource: 'social-posts',
    collection: 'socialPosts',
    readScope: 'workspace:read',
    scopeMode: 'companyOrAuthor',
    labelFields: ['content', 'platform'],
    summaryFields: ['content'],
    textFields: ['platform', 'content'],
    dateFields: ['scheduledFor', 'createdAt'],
    statusField: 'status',
    aliasFields: ['sourceKey', 'matchKey', 'aliases'],
    relations: SOURCE_RELATIONS,
  },
  'seo-keywords': {
    resource: 'seo-keywords',
    collection: 'seoKeywords',
    readScope: 'workspace:read',
    scopeMode: 'companyOrAuthor',
    labelFields: ['keyword'],
    summaryFields: ['keyword'],
    textFields: ['keyword', 'intent'],
    dateFields: ['createdAt'],
    relations: [{ field: 'cycleGoalId', target: 'cycle-goals', role: 'parent' }],
  },
  feedbacks: {
    resource: 'feedbacks',
    collection: 'feedbacks',
    readScope: 'workspace:read',
    scopeMode: 'companyOrAuthor',
    labelFields: ['content', 'source'],
    summaryFields: ['content'],
    textFields: ['source', 'content', 'sentiment'],
    dateFields: ['createdAt'],
    aliasFields: ['sourceKey', 'matchKey', 'aliases'],
    relations: SOURCE_RELATIONS,
  },
  accounts: {
    resource: 'accounts',
    collection: 'accounts',
    readScope: 'workspace:read',
    scopeMode: 'companyOrAuthor',
    labelFields: ['name'],
    summaryFields: ['notes', 'website', 'name'],
    textFields: ['name', 'website', 'industry', 'size', 'notes'],
    dateFields: ['updatedAt', 'createdAt'],
    statusField: 'status',
    aliasFields: ['sourceKey', 'matchKey', 'aliases'],
    relations: [
      { field: 'linkedLeadIds', target: 'leads', many: true },
      ...SOURCE_RELATIONS,
    ],
  },
  leads: {
    resource: 'leads',
    collection: 'leads',
    readScope: 'workspace:read',
    scopeMode: 'companyOrAuthor',
    labelFields: ['name', 'email'],
    summaryFields: ['nextAction', 'notes', 'companyName', 'name'],
    textFields: ['name', 'email', 'companyName', 'nextAction', 'notes'],
    dateFields: ['nextActionAt', 'updatedAt', 'createdAt'],
    statusField: 'stage',
    aliasFields: ['sourceKey', 'matchKey', 'aliases'],
    relations: [
      { field: 'accountId', target: 'accounts', role: 'parent' },
      { field: 'ownerId', target: 'users', role: 'owner' },
      { field: 'linkedTaskIds', target: 'tasks', many: true },
      ...SOURCE_RELATIONS,
    ],
  },
  'time-blocks': {
    resource: 'time-blocks',
    collection: 'timeBlocks',
    readScope: 'workspace:read',
    scopeMode: 'companyOrAuthor',
    labelFields: ['title'],
    summaryFields: ['title'],
    textFields: ['title', 'type', 'startTime', 'endTime'],
    dateFields: ['createdAt'],
  },
  'operator-desks': {
    resource: 'operator-desks',
    collection: 'operatorDesks',
    readScope: 'workspace:read',
    scopeMode: 'companyOrAuthor',
    labelFields: ['name', 'title', 'slug'],
    summaryFields: ['description', 'purpose', 'instructions', 'name'],
    textFields: ['name', 'title', 'slug', 'description', 'purpose', 'instructions', 'tags', 'keywords'],
    dateFields: ['updatedAt', 'createdAt'],
    statusField: 'status',
    aliasFields: ['slug', 'aliases', 'tags', 'keywords'],
    relations: DOMAIN_RECORD_RELATIONS,
  },
  'work-orders': {
    resource: 'work-orders',
    collection: 'operatorWorkOrders',
    readScope: 'workspace:read',
    scopeMode: 'companyOrAuthor',
    labelFields: ['title', 'name'],
    summaryFields: ['summary', 'description', 'objective', 'payload', 'title'],
    textFields: [
      'title',
      'name',
      'summary',
      'description',
      'objective',
      'payload',
      'instructions',
      'result',
      'notes',
      'priority',
      'tags',
    ],
    dateFields: ['updatedAt', 'completedAt', 'createdAt'],
    statusField: 'status',
    aliasFields: ['sourceKey', 'matchKey', 'aliases', 'tags'],
    relations: [
      { field: 'operatorDeskId', target: 'operator-desks', role: 'parent' },
      { field: 'deskId', target: 'operator-desks', role: 'parent' },
      { field: 'assignedToId', target: 'users', role: 'owner' },
      { field: 'contextPackIds', target: 'operator-context-packs', many: true },
      ...DOMAIN_RECORD_RELATIONS,
      ...SOURCE_RELATIONS,
    ],
  },
  'operator-context-packs': {
    resource: 'operator-context-packs',
    collection: 'operatorContextPacks',
    readScope: 'workspace:read',
    scopeMode: 'companyOrAuthor',
    labelFields: ['title', 'name', 'label'],
    summaryFields: ['summary', 'description', 'content', 'context', 'title', 'name'],
    textFields: [
      'title',
      'name',
      'label',
      'summary',
      'description',
      'content',
      'context',
      'instructions',
      'tags',
      'keywords',
      'aliases',
    ],
    dateFields: ['updatedAt', 'createdAt'],
    statusField: 'status',
    aliasFields: ['sourceKey', 'matchKey', 'aliases', 'tags', 'keywords'],
    relations: [
      { field: 'operatorDeskId', target: 'operator-desks', role: 'parent' },
      { field: 'workOrderIds', target: 'work-orders', many: true },
      ...DOMAIN_RECORD_RELATIONS,
      ...SOURCE_RELATIONS,
    ],
  },
  'operator-memories': {
    resource: 'operator-memories',
    collection: 'operatorMemories',
    readScope: 'workspace:read',
    scopeMode: 'companyOrAuthor',
    labelFields: ['title', 'name', 'type'],
    summaryFields: ['content', 'summary', 'description', 'title'],
    textFields: ['title', 'name', 'content', 'summary', 'description', 'scope', 'type', 'tags', 'keywords'],
    dateFields: ['updatedAt', 'createdAt'],
    statusField: 'status',
    aliasFields: ['sourceKey', 'matchKey', 'aliases', 'tags', 'keywords'],
    relations: [
      { field: 'operatorDeskId', target: 'operator-desks', role: 'parent' },
      { field: 'workOrderId', target: 'work-orders', role: 'parent' },
      ...DOMAIN_RECORD_RELATIONS,
      ...SOURCE_RELATIONS,
    ],
  },
  'operator-checkins': {
    resource: 'operator-checkins',
    collection: 'operatorCheckins',
    readScope: 'workspace:read',
    scopeMode: 'companyOrAuthor',
    labelFields: ['title', 'name', 'status'],
    summaryFields: ['summary', 'content', 'message', 'notes', 'title'],
    textFields: ['title', 'name', 'summary', 'content', 'message', 'notes', 'status', 'tags'],
    dateFields: ['createdAt'],
    statusField: 'status',
    relations: [
      { field: 'operatorDeskId', target: 'operator-desks', role: 'parent' },
      { field: 'workOrderId', target: 'work-orders', role: 'parent' },
      ...DOMAIN_RECORD_RELATIONS,
    ],
  },
  'operator-outputs': {
    resource: 'operator-outputs',
    collection: 'operatorOutputs',
    readScope: 'workspace:read',
    scopeMode: 'companyOrAuthor',
    labelFields: ['title', 'name', 'outputType'],
    summaryFields: ['summary', 'content', 'output', 'result', 'title'],
    textFields: ['title', 'name', 'summary', 'content', 'output', 'result', 'notes', 'externalAgentName', 'outputType', 'tags'],
    dateFields: ['updatedAt', 'createdAt'],
    statusField: 'status',
    relations: [
      { field: 'operatorDeskId', target: 'operator-desks', role: 'parent' },
      { field: 'workOrderId', target: 'work-orders', role: 'parent' },
      ...DOMAIN_RECORD_RELATIONS,
      ...SOURCE_RELATIONS,
    ],
  },
  'operator-injections': {
    resource: 'operator-injections',
    collection: 'operatorInjections',
    readScope: 'workspace:read',
    scopeMode: 'companyOrAuthor',
    labelFields: ['title', 'action', 'targetHub'],
    summaryFields: ['summary', 'content', 'payload', 'result', 'title'],
    textFields: ['title', 'summary', 'content', 'payload', 'result', 'notes', 'targetHub', 'action'],
    dateFields: ['updatedAt', 'createdAt'],
    statusField: 'status',
    relations: [
      { field: 'outputId', target: 'operator-outputs', role: 'parent' },
      ...DOMAIN_RECORD_RELATIONS,
    ],
  },
  'operator-approvals': {
    resource: 'operator-approvals',
    collection: 'operatorApprovals',
    readScope: 'workspace:read',
    scopeMode: 'companyOrAuthor',
    labelFields: ['title', 'action', 'targetHub'],
    summaryFields: ['summary', 'description', 'reason', 'notes', 'title'],
    textFields: ['title', 'summary', 'description', 'reason', 'notes', 'targetHub', 'action', 'riskLevel'],
    dateFields: ['updatedAt', 'resolvedAt', 'createdAt'],
    statusField: 'status',
    relations: [
      { field: 'operatorDeskId', target: 'operator-desks', role: 'parent' },
      { field: 'workOrderId', target: 'work-orders', role: 'parent' },
      { field: 'outputId', target: 'operator-outputs', role: 'parent' },
      ...DOMAIN_RECORD_RELATIONS,
    ],
  },
  'context-sources': {
    resource: 'context-sources',
    collection: 'contextSources',
    readScope: 'systems:read',
    scopeMode: 'companyOrAuthor',
    labelFields: ['title', 'latestFileName'],
    summaryFields: ['latestSummary', 'title'],
    textFields: ['title', 'latestFileName', 'latestSummary', 'aliases', 'sourceKey'],
    dateFields: ['updatedAt', 'lastUploadedAt', 'createdAt'],
    statusField: 'status',
    aliasFields: ['sourceKey', 'normalizedTitle', 'aliases'],
    relations: [
      { field: 'linkedTaskIds', target: 'tasks', many: true },
      { field: 'linkedVisionIds', target: 'visions', many: true },
      { field: 'linkedCycleGoalIds', target: 'cycle-goals', many: true },
      { field: 'linkedFeedbackIds', target: 'feedbacks', many: true },
      { field: 'linkedSocialPostIds', target: 'social-posts', many: true },
      { field: 'linkedLeadIds', target: 'leads', many: true },
      { field: 'linkedAccountIds', target: 'accounts', many: true },
    ],
  },
  'context-source-versions': {
    resource: 'context-source-versions',
    collection: 'contextSourceVersions',
    readScope: 'systems:read',
    scopeMode: 'companyOrAuthor',
    labelFields: ['fileName', 'sourceKey'],
    summaryFields: ['contentPreview', 'fileName'],
    textFields: ['fileName', 'contentPreview', 'fullContent', 'sourceKey'],
    dateFields: ['createdAt'],
    statusField: 'status',
    aliasFields: ['sourceKey'],
    relations: [
      { field: 'sourceId', target: 'context-sources' },
      { field: 'linkedTaskIds', target: 'tasks', many: true },
      { field: 'linkedVisionIds', target: 'visions', many: true },
      { field: 'linkedCycleGoalIds', target: 'cycle-goals', many: true },
      { field: 'linkedFeedbackIds', target: 'feedbacks', many: true },
      { field: 'linkedSocialPostIds', target: 'social-posts', many: true },
      { field: 'linkedLeadIds', target: 'leads', many: true },
      { field: 'linkedAccountIds', target: 'accounts', many: true },
    ],
  },
  users: {
    resource: 'users',
    collection: 'users',
    readScope: 'identity:read',
    scopeMode: 'companyMembers',
    labelFields: ['displayName', 'email'],
    summaryFields: ['email', 'displayName'],
    textFields: ['displayName', 'email', 'role'],
    dateFields: ['createdAt'],
    statusField: 'role',
  },
  companies: {
    resource: 'companies',
    collection: 'companies',
    readScope: 'identity:read',
    scopeMode: 'currentCompany',
    labelFields: ['name'],
    summaryFields: ['name'],
    textFields: ['name'],
    dateFields: ['createdAt'],
  },
  invitations: {
    resource: 'invitations',
    collection: 'invitations',
    readScope: 'identity:read',
    scopeMode: 'companyOnly',
    labelFields: ['email'],
    summaryFields: ['email'],
    textFields: ['email', 'role'],
    dateFields: ['createdAt'],
    statusField: 'role',
  },
};

export const CONTEXT_ROUTING_RESOURCES = Object.freeze(
  Object.keys(ROUTING_REGISTRY) as ContextRoutingResource[],
);

const candidateCatalogCache = new Map<string, CandidateCatalogCacheEntry>();
const STOP_WORDS = new Set([
  'and',
  'are',
  'for',
  'from',
  'into',
  'that',
  'the',
  'this',
  'with',
  'your',
  'you',
  'was',
  'were',
  'will',
  'have',
  'has',
  'not',
  'but',
  'its',
  'our',
  'about',
]);
const ACTIVE_STATUSES = new Set([
  'active',
  'open',
  'triaged',
  'in-progress',
  'building',
  'todo',
  'blocked',
  'qualified',
  'contacted',
  'demo-booked',
  'proposal',
  'prospect',
  'customer',
  'scheduled',
]);
const TERMINAL_STATUSES = new Set([
  'done',
  'resolved',
  'closed',
  'shipped',
  'completed',
  'archived',
  'won',
  'lost',
  'inactive',
  'published',
  'rejected',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()));
  }
  return typeof value === 'string' && value.trim() ? [value] : [];
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function textFromFields(record: Record<string, unknown>, fields: string[], maxLength = 2400) {
  const text = fields
    .flatMap((field) => asStringArray(record[field]))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, maxLength);
}

function firstText(record: Record<string, unknown>, fields: string[], fallback: string) {
  for (const field of fields) {
    const value = asStringArray(record[field])[0];
    if (value) return value;
  }
  return fallback;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(value: string) {
  return new Set(
    normalizeText(value)
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
  );
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

function stableStringify(value: unknown) {
  return JSON.stringify(stableValue(value));
}

function hashValue(value: unknown) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function buildContextCatalogCacheKey(input: ContextCatalogCacheKeyInput): CacheKeyResult {
  const normalized = {
    workspaceId: input.workspaceId,
    actorIdentity: input.actorIdentity,
    authMode: input.authMode,
    scopes: [...input.scopes].sort(),
    permissions: [...input.permissions].sort(),
    registryVersion: input.registryVersion,
    queryShape: stableValue(input.queryShape),
  };
  return {
    hash: hashValue(normalized),
    diagnostics: {
      authMode: input.authMode,
      scopeCount: normalized.scopes.length,
      permissionCount: normalized.permissions.length,
      registryVersion: input.registryVersion,
      queryShapeHash: hashValue(normalized.queryShape),
    },
  };
}

export function assertContextDebugAuthorized(actor: AuthorizedApiKeyActor) {
  if (actor.ownerRole !== 'admin') {
    throw new ApiKeyServerError('Context routing debug access requires an admin actor.', 403);
  }
}

function getScopedQuery(definition: RoutingResourceDefinition, actor: AuthorizedApiKeyActor) {
  const collection = getAdminFirestore().collection(definition.collection);
  switch (definition.scopeMode) {
    case 'companyOrAuthor':
      return actor.companyId
        ? collection.where('companyId', '==', actor.companyId)
        : collection.where('authorId', '==', actor.ownerUid);
    case 'companyOrNull':
      return actor.companyId
        ? collection.where('companyId', '==', actor.companyId)
        : collection.where('companyId', '==', null);
    case 'companyMembers':
      return actor.companyId
        ? collection.where('companyId', '==', actor.companyId)
        : collection.where(FieldPath.documentId(), '==', actor.ownerUid);
    case 'companyOnly':
      return actor.companyId
        ? collection.where('companyId', '==', actor.companyId)
        : collection.where('companyId', '==', '__no-company__');
    case 'currentCompany':
      return actor.companyId
        ? collection.where(FieldPath.documentId(), '==', actor.companyId)
        : collection.where('ownerId', '==', actor.ownerUid);
  }
}

export function canAccessContextRecord(
  definition: Pick<RoutingResourceDefinition, 'scopeMode'>,
  actor: AuthorizedApiKeyActor,
  id: string,
  data: AccessMetadata,
) {
  switch (definition.scopeMode) {
    case 'companyOrAuthor':
      return actor.companyId ? data.companyId === actor.companyId : data.authorId === actor.ownerUid;
    case 'companyOrNull':
      return actor.companyId ? data.companyId === actor.companyId : data.companyId == null;
    case 'companyMembers':
      return actor.companyId ? data.companyId === actor.companyId : id === actor.ownerUid;
    case 'companyOnly':
      return Boolean(actor.companyId) && data.companyId === actor.companyId;
    case 'currentCompany':
      return actor.companyId ? id === actor.companyId : data.ownerId === actor.ownerUid;
  }
}

function relationValues(record: Record<string, unknown>, relation: RelationDefinition) {
  return relation.many ? asStringArray(record[relation.field]) : asStringArray(record[relation.field]).slice(0, 1);
}

function dynamicRelationships(
  definition: RoutingResourceDefinition,
  record: Record<string, unknown>,
): Array<{ resource: ContextRoutingResource; id: string }> {
  if (definition.dynamicRelations !== 'business-plan-links' || !Array.isArray(record.links)) return [];
  return record.links.flatMap((link) => {
    if (!isRecord(link) || typeof link.type !== 'string' || typeof link.recordId !== 'string') return [];
    const resource = BUSINESS_PLAN_LINK_RESOURCES[link.type];
    return resource ? [{ resource, id: link.recordId }] : [];
  });
}

export function projectContextRecord(
  resource: ContextRoutingResource,
  record: Record<string, unknown> & { id: string },
): ProjectedContextRecord {
  const definition = ROUTING_REGISTRY[resource];
  const relationships = [
    ...(definition.relations || []).flatMap((relation) =>
      relationValues(record, relation).map((id) => ({ resource: relation.target, id })),
    ),
    ...dynamicRelationships(definition, record),
  ];
  const parentKeys = (definition.relations || []).flatMap((relation) =>
    relation.role === 'parent'
      ? relationValues(record, relation).map((id) => `${relation.target}:${id}`)
      : [],
  );
  const ownerKeys = (definition.relations || []).flatMap((relation) =>
    relation.role === 'owner'
      ? relationValues(record, relation).map((id) => `${relation.target}:${id}`)
      : [],
  );
  const aliases = unique((definition.aliasFields || []).flatMap((field) => asStringArray(record[field])));
  const metadataKeys = unique(
    (definition.aliasFields || [])
      .filter((field) => field !== 'aliases')
      .flatMap((field) => asStringArray(record[field]))
      .concat(aliases),
  ).map(normalizeText).filter(Boolean);
  const recencyAt =
    definition.dateFields
      .map((field) => record[field])
      .find((value) => typeof value === 'string' && !Number.isNaN(Date.parse(value))) as string | undefined;
  const sourceIds = unique([
    ...asStringArray(record.sourceIds),
    ...(resource === 'context-source-versions' ? asStringArray(record.sourceId) : []),
  ]);
  const sourceVersionIds = unique([
    ...asStringArray(record.sourceVersionIds),
    ...(resource === 'context-source-versions' ? [record.id] : []),
  ]);
  const label = firstText(record, definition.labelFields, `${resource}:${record.id}`).slice(0, 160);
  const summary = firstText(record, definition.summaryFields, label).replace(/\s+/g, ' ').trim().slice(0, 240);
  const searchTextLimit = resource === 'context-source-versions' ? 500 * 1024 : 2400;

  return {
    resource,
    id: record.id,
    label,
    summary,
    searchText: textFromFields(record, definition.textFields, searchTextLimit),
    aliases,
    metadataKeys,
    sourceIds,
    sourceVersionIds,
    relationships,
    parentKeys: unique(parentKeys),
    ownerKeys: unique(ownerKeys),
    status: definition.statusField && typeof record[definition.statusField] === 'string'
      ? String(record[definition.statusField])
      : '',
    recencyAt: recencyAt || null,
    access: {
      companyId: typeof record.companyId === 'string' ? record.companyId : record.companyId == null ? null : undefined,
      authorId: typeof record.authorId === 'string' ? record.authorId : null,
      ownerId: typeof record.ownerId === 'string' ? record.ownerId : null,
    },
  };
}

function intersects(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function exactIdentifierReference(text: string, id: string) {
  if (!text || !id) return false;
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_-])${escaped}([^A-Za-z0-9_-]|$)`).test(text);
}

function lexicalEvidence(anchor: ProjectedContextRecord, candidate: ProjectedContextRecord) {
  const evidence: ContextRoutingEvidence[] = [];
  const anchorNormalized = normalizeText(`${anchor.label} ${anchor.searchText}`);
  const candidateNormalized = normalizeText(`${candidate.label} ${candidate.searchText}`);
  const candidateLabel = normalizeText(candidate.label);
  const anchorLabel = normalizeText(anchor.label);

  if (
    candidateLabel.length >= 4 &&
    anchorLabel.length >= 4 &&
    (anchorNormalized.includes(candidateLabel) || candidateNormalized.includes(anchorLabel))
  ) {
    evidence.push({
      code: 'exact-title-phrase',
      score: 35,
      reason: 'The title appears as an exact phrase in the other object.',
      lexical: true,
    });
  }

  const anchorTokens = tokenize(anchorNormalized);
  const candidateTokens = tokenize(candidateNormalized);
  const smallerSize = Math.min(anchorTokens.size, candidateTokens.size);
  if (smallerSize > 0) {
    let overlap = 0;
    for (const token of anchorTokens) {
      if (candidateTokens.has(token)) overlap += 1;
    }
    if (overlap > 0) {
      evidence.push({
        code: 'token-overlap',
        score: Math.min(20, Math.max(1, Math.round((overlap / smallerSize) * 20))),
        reason: 'The objects share meaningful text terms.',
        lexical: true,
      });
    }
  }

  return evidence;
}

function statusAndRecencyModifiers(candidate: ProjectedContextRecord, nowMs: number) {
  const modifiers: Array<{ code: string; score: number; reason: string }> = [];
  const normalizedStatus = candidate.status.toLowerCase();
  if (ACTIVE_STATUSES.has(normalizedStatus)) {
    modifiers.push({ code: 'active-status', score: 5, reason: 'The related object is currently active.' });
  } else if (TERMINAL_STATUSES.has(normalizedStatus)) {
    modifiers.push({ code: 'terminal-status', score: -5, reason: 'The related object is in a terminal state.' });
  }

  if (candidate.recencyAt) {
    const ageDays = (nowMs - Date.parse(candidate.recencyAt)) / 86_400_000;
    if (ageDays <= 30) {
      modifiers.push({ code: 'recent-30d', score: 5, reason: 'The related object was updated recently.' });
    } else if (ageDays <= 90) {
      modifiers.push({ code: 'recent-90d', score: 2, reason: 'The related object was updated within 90 days.' });
    } else if (ageDays > 365) {
      modifiers.push({ code: 'stale-365d', score: -5, reason: 'The related object has been inactive for over a year.' });
    }
  }
  return modifiers;
}

export function scoreContextCandidate(
  anchor: ProjectedContextRecord,
  candidate: ProjectedContextRecord,
  options: { allowLexical?: boolean; nowMs?: number } = {},
): ContextRoutingScore {
  const evidence: ContextRoutingEvidence[] = [];
  const anchorTargetsCandidate = anchor.relationships.some(
    (relation) => relation.resource === candidate.resource && relation.id === candidate.id,
  );
  const candidateTargetsAnchor = candidate.relationships.some(
    (relation) => relation.resource === anchor.resource && relation.id === anchor.id,
  );
  if (anchorTargetsCandidate || candidateTargetsAnchor) {
    evidence.push({
      code: anchorTargetsCandidate && candidateTargetsAnchor ? 'bidirectional-link' : 'exact-id-link',
      score: 100,
      reason: anchorTargetsCandidate && candidateTargetsAnchor
        ? 'Both records explicitly reference each other.'
        : 'One record explicitly references the other by ID.',
      lexical: false,
    });
  }

  if (intersects(anchor.sourceVersionIds, candidate.sourceVersionIds)) {
    evidence.push({
      code: 'shared-source-version',
      score: 90,
      reason: 'Both records were derived from the same saved source version.',
      lexical: false,
    });
  }
  if (intersects(anchor.sourceIds, candidate.sourceIds)) {
    evidence.push({
      code: 'shared-source',
      score: 80,
      reason: 'Both records were derived from the same saved source.',
      lexical: false,
    });
  }
  if (
    exactIdentifierReference(anchor.searchText, candidate.id) ||
    exactIdentifierReference(candidate.searchText, anchor.id)
  ) {
    evidence.push({
      code: 'explicit-id-reference',
      score: 80,
      reason: 'One record explicitly names the other record ID.',
      lexical: false,
    });
  }
  if (intersects(anchor.metadataKeys, candidate.metadataKeys)) {
    evidence.push({
      code: 'saved-metadata-key',
      score: 65,
      reason: 'The records share an exact saved source key, match key, or alias.',
      lexical: false,
    });
  }
  if (intersects(anchor.parentKeys, candidate.parentKeys)) {
    evidence.push({
      code: 'shared-parent',
      score: 55,
      reason: 'The records share the same existing structural parent.',
      lexical: false,
    });
  }
  if (intersects(anchor.ownerKeys, candidate.ownerKeys)) {
    evidence.push({
      code: 'shared-owner',
      score: 25,
      reason: 'The records share the same saved owner or assignee.',
      lexical: false,
    });
  }
  if (options.allowLexical !== false) {
    evidence.push(...lexicalEvidence(anchor, candidate));
  }

  const nonLexicalScore = evidence
    .filter((item) => !item.lexical)
    .reduce((maximum, item) => Math.max(maximum, item.score), 0);
  const lexicalScore = Math.min(
    55,
    evidence.filter((item) => item.lexical).reduce((total, item) => total + item.score, 0),
  );
  const lexicalOnly = nonLexicalScore === 0 && lexicalScore > 0;
  const modifiers = statusAndRecencyModifiers(candidate, options.nowMs ?? Date.now());
  const modifierScore = Math.max(
    -10,
    Math.min(10, modifiers.reduce((total, modifier) => total + modifier.score, 0)),
  );
  let score = Math.max(nonLexicalScore, lexicalScore);
  if (score > 0) score = Math.max(0, Math.min(100, score + modifierScore));
  if (lexicalOnly) score = Math.min(79, score);

  return {
    score,
    tier:
      score >= CONTEXT_ROUTING_THRESHOLDS.attached
        ? 'attached'
        : score >= CONTEXT_ROUTING_THRESHOLDS.suggested
          ? 'suggested'
          : 'ignored',
    evidence: evidence.sort((left, right) => right.score - left.score || left.code.localeCompare(right.code)),
    modifiers,
    lexicalOnly,
  };
}

function cacheTtlMs() {
  const seconds = Number.parseInt(process.env.REPLOFY_CONTEXT_ROUTING_CACHE_SECONDS || '30', 10);
  return Math.min(120, Math.max(5, Number.isNaN(seconds) ? 30 : seconds)) * 1000;
}

function actorWorkspaceId(actor: AuthorizedApiKeyActor) {
  return actor.companyId || `personal:${actor.ownerUid}`;
}

function actorIdentity(actor: AuthorizedApiKeyActor) {
  return `${actor.ownerUid}:${actor.key.id}`;
}

function actorPermissions(actor: AuthorizedApiKeyActor) {
  return [
    `role:${actor.ownerRole}`,
    actor.companyId ? 'workspace:company' : 'workspace:personal',
  ];
}

function routingQueryShape(anchorResource: ContextRoutingResource, actor: AuthorizedApiKeyActor) {
  const candidateResources = CONTEXT_ROUTING_RESOURCES
    .filter((resource) => actor.key.scopes.includes(ROUTING_REGISTRY[resource].readScope))
    .sort();
  return {
    anchorResource,
    candidateResources,
    filters: {},
    limits: ROUTING_LIMITS,
    thresholds: CONTEXT_ROUTING_THRESHOLDS,
    policyVersion: CONTEXT_ROUTING_POLICY_VERSION,
  };
}

function buildActorCacheIdentity(
  actor: AuthorizedApiKeyActor,
  authMode: string,
  anchorResource: ContextRoutingResource,
) {
  const workspaceId = actorWorkspaceId(actor);
  const identity = actorIdentity(actor);
  const key = buildContextCatalogCacheKey({
    workspaceId,
    actorIdentity: identity,
    authMode,
    scopes: actor.key.scopes,
    permissions: actorPermissions(actor),
    registryVersion: CONTEXT_ROUTING_REGISTRY_VERSION,
    queryShape: routingQueryShape(anchorResource, actor),
  });
  return { workspaceId, identity, key };
}

async function loadAuthorizedCandidateCatalog(
  actor: AuthorizedApiKeyActor,
  authMode: string,
  anchorResource: ContextRoutingResource,
) {
  const cacheIdentity = buildActorCacheIdentity(actor, authMode, anchorResource);
  const cached = candidateCatalogCache.get(cacheIdentity.key.hash);
  if (cached && cached.expiresAt > Date.now()) {
    return { records: cached.records, cacheHit: true, cacheKey: cacheIdentity.key };
  }
  if (cached) candidateCatalogCache.delete(cacheIdentity.key.hash);

  const resources = CONTEXT_ROUTING_RESOURCES.filter((resource) =>
    actor.key.scopes.includes(ROUTING_REGISTRY[resource].readScope),
  );
  const batches = await Promise.all(
    resources.map(async (resource) => {
      const definition = ROUTING_REGISTRY[resource];
      const snapshot = await getScopedQuery(definition, actor).limit(ROUTING_LIMITS.catalogPerResource).get();
      return snapshot.docs.flatMap((doc) => {
        const data = doc.data() as Record<string, unknown>;
        if (!canAccessContextRecord(definition, actor, doc.id, data)) return [];
        return [projectContextRecord(resource, { id: doc.id, ...data })];
      });
    }),
  );
  const records = batches.flat();
  candidateCatalogCache.set(cacheIdentity.key.hash, {
    expiresAt: Date.now() + cacheTtlMs(),
    workspaceId: cacheIdentity.workspaceId,
    actorIdentity: cacheIdentity.identity,
    records,
  });
  return { records, cacheHit: false, cacheKey: cacheIdentity.key };
}

async function loadDirectTargets(anchor: ProjectedContextRecord, actor: AuthorizedApiKeyActor) {
  const uniqueTargets = new Map<string, { resource: ContextRoutingResource; id: string }>();
  for (const target of anchor.relationships) {
    uniqueTargets.set(`${target.resource}:${target.id}`, target);
  }
  const loaded = await Promise.all(
    Array.from(uniqueTargets.values()).map(async ({ resource, id }) => {
      const definition = ROUTING_REGISTRY[resource];
      if (!actor.key.scopes.includes(definition.readScope)) return null;
      const snapshot = await getAdminFirestore().collection(definition.collection).doc(id).get();
      if (!snapshot.exists) return null;
      const data = snapshot.data() as Record<string, unknown>;
      if (!canAccessContextRecord(definition, actor, snapshot.id, data)) return null;
      return projectContextRecord(resource, { id: snapshot.id, ...data });
    }),
  );
  return loaded.filter((record): record is ProjectedContextRecord => Boolean(record));
}

async function loadReverseTargets(anchor: ProjectedContextRecord, actor: AuthorizedApiKeyActor) {
  const lookups = CONTEXT_ROUTING_RESOURCES.flatMap((resource) => {
    const definition = ROUTING_REGISTRY[resource];
    if (!actor.key.scopes.includes(definition.readScope)) return [];
    return (definition.relations || [])
      .filter((relation) => relation.target === anchor.resource)
      .map((relation) => ({ definition, relation }));
  });
  const batches = await Promise.all(
    lookups.map(async ({ definition, relation }) => {
      const query = getAdminFirestore()
        .collection(definition.collection)
        .where(relation.field, relation.many ? 'array-contains' : '==', anchor.id)
        .limit(ROUTING_LIMITS.reversePerRelation);
      const snapshot = await query.get();
      return snapshot.docs.flatMap((doc) => {
        const data = doc.data() as Record<string, unknown>;
        if (!canAccessContextRecord(definition, actor, doc.id, data)) return [];
        return [projectContextRecord(definition.resource, { id: doc.id, ...data })];
      });
    }),
  );
  return batches.flat();
}

async function loadLineageMatches(anchor: ProjectedContextRecord, actor: AuthorizedApiKeyActor) {
  const lookups = CONTEXT_ROUTING_RESOURCES.flatMap((resource) => {
    const definition = ROUTING_REGISTRY[resource];
    if (!actor.key.scopes.includes(definition.readScope)) return [];
    return (definition.relations || []).flatMap((relation) => {
      if (relation.target === 'context-sources') {
        return anchor.sourceIds.map((id) => ({ definition, relation, id }));
      }
      if (relation.target === 'context-source-versions') {
        return anchor.sourceVersionIds.map((id) => ({ definition, relation, id }));
      }
      return [];
    });
  });
  const batches = await Promise.all(
    lookups.map(async ({ definition, relation, id }) => {
      const query = getAdminFirestore()
        .collection(definition.collection)
        .where(relation.field, relation.many ? 'array-contains' : '==', id)
        .limit(ROUTING_LIMITS.reversePerRelation);
      const snapshot = await query.get();
      return snapshot.docs.flatMap((doc) => {
        const data = doc.data() as Record<string, unknown>;
        if (!canAccessContextRecord(definition, actor, doc.id, data)) return [];
        return [projectContextRecord(definition.resource, { id: doc.id, ...data })];
      });
    }),
  );
  return batches.flat();
}

export function invalidateContextRoutingCacheForActor(actor: AuthorizedApiKeyActor) {
  const workspaceId = actorWorkspaceId(actor);
  for (const [key, entry] of candidateCatalogCache.entries()) {
    if (entry.workspaceId === workspaceId) {
      candidateCatalogCache.delete(key);
    }
  }
}

function recencyTimestamp(record: ProjectedContextRecord) {
  return record.recencyAt ? Date.parse(record.recencyAt) || 0 : 0;
}

function rankScoredCandidates(
  left: { record: ProjectedContextRecord; result: ContextRoutingScore },
  right: { record: ProjectedContextRecord; result: ContextRoutingScore },
) {
  const leftEvidence = left.result.evidence[0]?.score || 0;
  const rightEvidence = right.result.evidence[0]?.score || 0;
  return (
    right.result.score - left.result.score ||
    rightEvidence - leftEvidence ||
    recencyTimestamp(right.record) - recencyTimestamp(left.record) ||
    left.record.resource.localeCompare(right.record.resource) ||
    left.record.id.localeCompare(right.record.id)
  );
}

function selectBounded(
  candidates: Array<{ record: ProjectedContextRecord; result: ContextRoutingScore }>,
  limit: number,
) {
  const selected: typeof candidates = [];
  const counts = new Map<ContextRoutingResource, number>();
  for (const candidate of candidates) {
    const count = counts.get(candidate.record.resource) || 0;
    if (count >= ROUTING_LIMITS.perResource) continue;
    selected.push(candidate);
    counts.set(candidate.record.resource, count + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}

function outputItem(candidate: { record: ProjectedContextRecord; result: ContextRoutingScore }) {
  return {
    resource: candidate.record.resource,
    id: candidate.record.id,
    label: candidate.record.label,
    summary: candidate.record.summary,
    score: candidate.result.score,
    evidence: candidate.result.evidence.map((item) => item.code),
    reasons: [
      ...candidate.result.evidence.map((item) => item.reason),
      ...candidate.result.modifiers.map((item) => item.reason),
    ].slice(0, 3),
    deeperRead: {
      tools: [
        {
          name: 'get_workspace_object',
          arguments: {
            resource: candidate.record.resource,
            id: candidate.record.id,
          },
        },
        {
          name: 'get_record',
          arguments: {
            resource: candidate.record.resource,
            record_id: candidate.record.id,
          },
        },
      ],
      resourceUri: `replofy://record/${candidate.record.resource}/${candidate.record.id}`,
      apiPath: `/api/v1/context-routing/${candidate.record.resource}/${candidate.record.id}`,
    },
  };
}

export async function routeWorkspaceObjectContext(options: RouteContextOptions) {
  const startedAt = Date.now();
  const traceId = randomUUID();
  const anchor = projectContextRecord(options.anchorResource, options.anchor);
  const catalog = await loadAuthorizedCandidateCatalog(options.actor, options.authMode, options.anchorResource);
  const [directTargets, reverseTargets, lineageMatches] = await Promise.all([
    loadDirectTargets(anchor, options.actor),
    loadReverseTargets(anchor, options.actor),
    loadLineageMatches(anchor, options.actor),
  ]);
  const deduped = new Map<string, ProjectedContextRecord>();
  for (const candidate of [...catalog.records, ...directTargets, ...reverseTargets, ...lineageMatches]) {
    if (candidate.resource === anchor.resource && candidate.id === anchor.id) continue;
    const definition = ROUTING_REGISTRY[candidate.resource];
    if (!options.actor.key.scopes.includes(definition.readScope)) continue;
    if (!canAccessContextRecord(definition, options.actor, candidate.id, candidate.access)) continue;
    deduped.set(`${candidate.resource}:${candidate.id}`, candidate);
  }

  const candidates = Array.from(deduped.values());
  const lexicalKeys = new Set(
    [...candidates]
      .sort(
        (left, right) =>
          recencyTimestamp(right) - recencyTimestamp(left) ||
          left.resource.localeCompare(right.resource) ||
          left.id.localeCompare(right.id),
      )
      .slice(0, ROUTING_LIMITS.lexicalCandidates)
      .map((record) => `${record.resource}:${record.id}`),
  );
  const scored = candidates
    .map((record) => ({
      record,
      result: scoreContextCandidate(anchor, record, {
        allowLexical: lexicalKeys.has(`${record.resource}:${record.id}`),
      }),
    }))
    .sort(rankScoredCandidates);
  const attachedPool = scored.filter((candidate) => candidate.result.tier === 'attached');
  const suggestionPool = scored.filter((candidate) => candidate.result.tier === 'suggested');
  const attached = selectBounded(attachedPool, ROUTING_LIMITS.attached);
  const suggestions = selectBounded(suggestionPool, ROUTING_LIMITS.suggestions);
  const selectedCount = attached.length + suggestions.length;
  const eligibleCount = attachedPool.length + suggestionPool.length;

  const routing: Record<string, unknown> = {
    policyVersion: CONTEXT_ROUTING_POLICY_VERSION,
    registryVersion: CONTEXT_ROUTING_REGISTRY_VERSION,
    generatedAt: new Date().toISOString(),
    traceId,
    thresholds: CONTEXT_ROUTING_THRESHOLDS,
  };
  if (options.debug) {
    routing.debug = {
      cache: {
        hit: catalog.cacheHit,
        keyHash: catalog.cacheKey.hash,
        ...catalog.cacheKey.diagnostics,
      },
      evaluated: scored.slice(0, ROUTING_LIMITS.debugCandidates).map(({ record, result }) => ({
        resource: record.resource,
        id: record.id,
        label: record.label,
        score: result.score,
        tier: result.tier,
        lexicalOnly: result.lexicalOnly,
        evidence: result.evidence,
        modifiers: result.modifiers,
        rejectionReason:
          result.tier === 'ignored' ? 'Score is below the suggestion threshold.' : undefined,
      })),
    };
  }

  console.info(
    '[replofy-os][context-routing] decision',
    JSON.stringify({
      traceId,
      durationMs: Date.now() - startedAt,
      cacheHit: catalog.cacheHit,
      candidateCount: candidates.length,
      attachedCount: attached.length,
      suggestionCount: suggestions.length,
      ignoredCount: scored.length - eligibleCount,
    }),
  );

  return {
    relatedContext: {
      attached: attached.map(outputItem),
      suggestions: suggestions.map(outputItem),
      hasMore: eligibleCount > selectedCount,
    },
    routing,
  };
}

export function isContextRoutingResource(value: string): value is ContextRoutingResource {
  return Object.prototype.hasOwnProperty.call(ROUTING_REGISTRY, value);
}

export function getContextRoutingReadScope(resource: ContextRoutingResource) {
  return ROUTING_REGISTRY[resource].readScope;
}
