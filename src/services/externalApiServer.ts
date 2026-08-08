import { createHash, randomUUID } from 'crypto';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import type { ApiKeyScope, ApprovalAction, CreativeAsset } from '../types.js';
import { createBusinessPlanTemplate } from '../utils/businessPlanTemplate.js';
import { generateOpenApiSpec } from '../utils/openApiSpec.js';
import {
  buildRoutingRules,
  DANGEROUS_ACTION_RULES,
  DUPLICATE_PREVENTION_RULES,
  ENABLED_ROUTING_DESTINATIONS,
  OPERATOR_MCP_REGISTRY_ACTIONS,
  OUTPUT_ROUTING,
} from '../utils/operatorDeskTemplates.js';
import { operatorActionRequiresApproval } from '../utils/operatorApprovalPolicy.js';
import { ApiKeyServerError, authorizeExternalApiKey, getAdminFirestore, type AuthorizedApiKeyActor } from './apiKeyServer.js';
import { authorizeOAuthAccessToken } from './chatgptApp/oauthServer.js';
import { createCloudinaryDeliveryUrl } from './creativeAssetServer.js';
import {
  assertContextDebugAuthorized,
  CONTEXT_ROUTING_POLICY_VERSION,
  CONTEXT_ROUTING_REGISTRY_VERSION,
  CONTEXT_ROUTING_THRESHOLDS,
  getContextRoutingReadScope,
  invalidateContextRoutingCacheForActor,
  isContextRoutingResource,
  routeWorkspaceObjectContext,
} from './contextRoutingService.js';
import { handleGeminiIngestionRequest, type GeminiRateLimitSnapshot, type IngestionItem, type IngestionKind, type IngestionPayload } from './geminiServer.js';

type HeaderBag = Record<string, string | string[] | undefined> | undefined;

type ExternalApiResponse = {
  statusCode: number;
  body: unknown;
  headers?: Record<string, string>;
};

type ResourceName =
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
  | 'creative-items'
  | 'creative-assets'
  | 'seo-keywords'
  | 'feedbacks'
  | 'accounts'
  | 'leads'
  | 'time-blocks'
  | 'team-chat-channels'
  | 'team-chat-participants'
  | 'team-chat-messages'
  | 'context-sources'
  | 'context-source-versions'
  | 'operator-desks'
  | 'operator-work-orders'
  | 'operator-context-packs'
  | 'operator-memories'
  | 'operator-checkins'
  | 'operator-outputs'
  | 'operator-injections'
  | 'operator-approvals'
  | 'users'
  | 'companies'
  | 'invitations';

type ScopeMode = 'companyOrAuthor' | 'companyOrNull' | 'companyMembers' | 'companyOnly' | 'currentCompany';

type ResourceConfig = {
  resource: ResourceName;
  collection: string;
  readScope: ApiKeyScope;
  writeScope?: ApiKeyScope;
  scopeMode: ScopeMode;
  allowList?: boolean;
  allowGet?: boolean;
  allowCreate?: boolean;
  allowUpdate?: boolean;
  allowDelete?: boolean;
  requireCompanyAdminForWrite?: boolean;
  filterFields?: readonly string[];
  listOmitFields?: readonly string[];
  sort?: (left: Record<string, unknown>, right: Record<string, unknown>) => number;
  create?: (
    body: Record<string, unknown>,
    actor: AuthorizedApiKeyActor,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
  update?: (
    body: Record<string, unknown>,
    actor: AuthorizedApiKeyActor,
    existing: Record<string, unknown>,
    id: string,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
};

type IngestionItemAction = {
  title: string;
  kind: IngestionKind;
  action: 'created' | 'updated';
  id: string;
};

type IngestionResult = {
  fileName: string;
  status: 'queued' | 'processing' | 'done' | 'error';
  sourceId?: string;
  sourceVersionId?: string;
  sourceTitle?: string;
  sourceVersion?: number;
  linkedTaskIds: string[];
  linkedVisionIds: string[];
  linkedCycleGoalIds: string[];
  linkedFeedbackIds: string[];
  linkedSocialPostIds: string[];
  linkedCreativeItemIds: string[];
  linkedLeadIds: string[];
  linkedAccountIds: string[];
  actions: IngestionItemAction[];
  createdAt: string;
  error?: string;
};

type IngestionRequest = {
  fileName: string;
  content: string;
  mimeType: string;
  fileSize: number;
  payload?: IngestionPayload;
};

type LinkedDoc = Record<string, unknown> & {
  id: string;
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FULL_TEXT_SIZE_BYTES = 500 * 1024;
const TASK_STATUSES = ['todo', 'in-progress', 'done', 'icebox'] as const;
const BLOG_ARTICLE_STATUSES = [
  'idea',
  'planned',
  'researching',
  'drafting',
  'review',
  'scheduled',
  'published',
  'archived',
  'brainstorming',
  'collecting-data',
  'collecting-docs',
  'validating',
  'progressing',
  'finished',
  'rejected',
] as const;
const BLOG_ROADMAP_PHASES = ['now', 'next', 'later'] as const;
const BLOG_PRIORITIES = ['low', 'medium', 'high'] as const;
const BLOG_EVIDENCE_CONFIDENCE = ['unverified', 'supported', 'verified'] as const;
const BUG_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
const BUG_STATUSES = ['open', 'triaged', 'in-progress', 'blocked', 'resolved', 'closed'] as const;
const BUG_CODE_LINK_TYPES = ['repository', 'directory'] as const;
const ROADMAP_PHASES = ['now', 'next', 'later'] as const;
const ROADMAP_PRIORITIES = ['low', 'medium', 'high'] as const;
const ROADMAP_STATUSES = ['planned', 'building', 'blocked', 'shipped'] as const;
const BUSINESS_PLAN_STATUSES = ['draft', 'review', 'active', 'archived'] as const;
const OPERATOR_WORK_ORDER_STATUSES = ['draft', 'ready', 'claimed', 'in_progress', 'submitted', 'needs_review', 'approved', 'rejected', 'archived', 'cancelled'] as const;
const OPERATOR_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
const OPERATOR_DESK_TYPES = ['ops', 'content', 'creative', 'bug', 'feature', 'research', 'growth', 'feedback'] as const;
const OPERATOR_DESK_STATUSES = ['active', 'paused', 'archived'] as const;
const OPERATOR_CHECK_FREQUENCIES = ['manual', 'daily', 'weekly', 'monthly', 'event'] as const;
const OPERATOR_APPROVAL_MODES = ['action_based', 'draft_only', 'propose_injection', 'approve_before_write', 'safe_auto_write'] as const;
const OPERATOR_CLAIM_POLICIES = ['single_agent', 'multi_agent', 'manual_assignment'] as const;
const OPERATOR_CHECKIN_TYPES = ['manifest_requested', 'work_order_claimed', 'work_started', 'output_submitted', 'needs_more_context', 'work_skipped', 'work_failed', 'work_completed'] as const;
const OPERATOR_OUTPUT_TYPES = ['launch_summary', 'focus_recommendation', 'blog_idea', 'blog_article', 'social_post', 'creative_brief', 'creative_item', 'campaign_idea', 'bug_report', 'bug_triage', 'feature_spec', 'roadmap_item', 'execution_task', 'implementation_brief', 'research_brief', 'seo_keyword', 'content_refresh', 'growth_task', 'feedback_signal', 'memory_suggestion', 'weekly_summary', 'team_chat_update', 'time_block', 'risk_note', 'prompt'] as const;
const OPERATOR_MEMORY_TYPES = ['fact', 'preference', 'decision', 'style', 'constraint', 'lesson', 'avoid', 'source_note', 'workflow_rule'] as const;
const OPERATOR_MEMORY_SCOPES = ['global', 'operator', 'hub', 'goal', 'artifact', 'work_order', 'checkin'] as const;
const OPERATOR_MEMORY_CONFIDENCE = ['low', 'medium', 'high'] as const;
const OPERATOR_MEMORY_STATES = ['suggested', 'active', 'pinned', 'rejected', 'expired', 'archived'] as const;
const OPERATOR_APPROVAL_STATUSES = ['pending', 'approved', 'rejected', 'edited', 'expired', 'completed', 'failed'] as const;
const OPERATOR_APPROVAL_PATCH_STATUSES = ['edited', 'expired'] as const;
const BUSINESS_PLAN_LINK_TYPES = [
  'task',
  'cycleGoal',
  'vision',
  'blogArticle',
  'contextSource',
  'apiEndpoint',
  'feedback',
  'socialPost',
  'prompt',
  'timeBlock',
  'environment',
  'teamMember',
] as const;
const GOAL_STATUSES = ['active', 'completed', 'archived'] as const;
const POST_STATUSES = ['draft', 'scheduled', 'published'] as const;
const CREATIVE_PLATFORMS = ['Instagram', 'LinkedIn', 'X', 'TikTok', 'YouTube', 'Blog', 'Email', 'Other'] as const;
const CREATIVE_FORMATS = ['single-post', 'carousel', 'reel', 'story-sequence', 'motion-brief', 'static-ad', 'thread', 'other'] as const;
const CREATIVE_STATUSES = ['idea', 'brief', 'draft', 'in-review', 'changes-requested', 'approved', 'scheduled', 'published', 'rejected', 'archived'] as const;
const FEEDBACK_SOURCES = ['Discord', 'Twitter', 'Email'] as const;
const FEEDBACK_SENTIMENTS = ['positive', 'neutral', 'negative'] as const;
const ACCOUNT_STATUSES = ['prospect', 'customer', 'partner', 'inactive'] as const;
const LEAD_STAGES = ['new', 'qualified', 'contacted', 'demo-booked', 'proposal', 'won', 'lost'] as const;
const LEAD_SOURCES = ['inbound', 'referral', 'cold-outreach', 'waitlist', 'twitter', 'linkedin', 'email', 'other'] as const;
const LEAD_PRIORITIES = ['low', 'medium', 'high'] as const;
const SOCIAL_PLATFORMS = ['Twitter', 'LinkedIn', 'Loom'] as const;
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;
const API_ENDPOINT_STATUSES = ['draft', 'active', 'deprecated'] as const;
const ENVIRONMENT_NAMES = ['Local', 'Staging', 'Production'] as const;
const ENVIRONMENT_STATUSES = ['healthy', 'deploying', 'failed'] as const;
const SEO_INTENTS = ['high', 'medium', 'low'] as const;
const TIME_BLOCK_TYPES = ['strategic', 'buffer', 'breakout'] as const;
const TEAM_CHAT_CHANNEL_STATUSES = ['active', 'archived'] as const;
const TEAM_CHAT_PARTICIPANT_TYPES = ['team-member', 'ai-agent'] as const;
const TEAM_CHAT_PARTICIPANT_STATUSES = ['active', 'inactive'] as const;
const MEMBER_ROLES = ['admin', 'member'] as const;
const EFFORT_POINTS = [1, 2, 3, 5, 8] as const;

const RESOURCE_ALIASES: Record<string, ResourceName> = {
  tasks: 'tasks',
  bugs: 'bugs',
  bug: 'bugs',
  'roadmap-items': 'roadmap-items',
  roadmapItems: 'roadmap-items',
  roadmapItem: 'roadmap-items',
  roadmap: 'roadmap-items',
  'technical-roadmap': 'roadmap-items',
  technicalRoadmap: 'roadmap-items',
  'blog-articles': 'blog-articles',
  blogArticles: 'blog-articles',
  'business-plans': 'business-plans',
  businessPlans: 'business-plans',
  visions: 'visions',
  'cycle-goals': 'cycle-goals',
  cycleGoals: 'cycle-goals',
  prompts: 'prompts',
  'api-endpoints': 'api-endpoints',
  apiEndpoints: 'api-endpoints',
  environments: 'environments',
  'social-posts': 'social-posts',
  socialPosts: 'social-posts',
  'creative-items': 'creative-items',
  creativeItems: 'creative-items',
  creativeItem: 'creative-items',
  creatives: 'creative-items',
  'creative-assets': 'creative-assets',
  creativeAssets: 'creative-assets',
  creativeAsset: 'creative-assets',
  'seo-keywords': 'seo-keywords',
  seoKeywords: 'seo-keywords',
  feedbacks: 'feedbacks',
  accounts: 'accounts',
  account: 'accounts',
  leads: 'leads',
  lead: 'leads',
  prospects: 'leads',
  prospect: 'leads',
  'time-blocks': 'time-blocks',
  timeBlocks: 'time-blocks',
  'team-chat-channels': 'team-chat-channels',
  teamChatChannels: 'team-chat-channels',
  teamChatChannel: 'team-chat-channels',
  channels: 'team-chat-channels',
  'team-chat-participants': 'team-chat-participants',
  teamChatParticipants: 'team-chat-participants',
  teamChatParticipant: 'team-chat-participants',
  participants: 'team-chat-participants',
  'team-chat-messages': 'team-chat-messages',
  teamChatMessages: 'team-chat-messages',
  teamChatMessage: 'team-chat-messages',
  messages: 'team-chat-messages',
  'context-sources': 'context-sources',
  contextSources: 'context-sources',
  'context-source-versions': 'context-source-versions',
  contextSourceVersions: 'context-source-versions',
  'operator-desks': 'operator-desks',
  operatorDesks: 'operator-desks',
  'operator-work-orders': 'operator-work-orders',
  operatorWorkOrders: 'operator-work-orders',
  'operator-context-packs': 'operator-context-packs',
  operatorContextPacks: 'operator-context-packs',
  'operator-memories': 'operator-memories',
  operatorMemories: 'operator-memories',
  'operator-checkins': 'operator-checkins',
  operatorCheckins: 'operator-checkins',
  'operator-outputs': 'operator-outputs',
  operatorOutputs: 'operator-outputs',
  'operator-injections': 'operator-injections',
  operatorInjections: 'operator-injections',
  'operator-approvals': 'operator-approvals',
  operatorApprovals: 'operator-approvals',
  users: 'users',
  companies: 'companies',
  invitations: 'invitations',
};

const SOURCE_LINEAGE_FIELDS = [
  'sourceIds',
  'sourceVersionIds',
  'sourceKey',
  'sourceTitle',
  'sourceVersion',
  'sourceUpdatedAt',
  'aliases',
  'matchKey',
] as const;

function nowIso() {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown) {
  return isRecord(value) ? value : {};
}

function expectObject(value: unknown, message = 'Request body must be a JSON object.') {
  if (!isRecord(value)) {
    throw new ApiKeyServerError(message, 400);
  }

  return value;
}

const DELETE_LOOKUP_KEYS = ['id', 'recordId', 'sourceKey', 'title', 'name', 'label', 'slug', 'fileName', 'latestFileName'] as const;

function assertAllowedKeys(input: Record<string, unknown>, allowed: readonly string[]) {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(input).filter((key) => !allowedSet.has(key));

  if (unexpected.length > 0) {
    throw new ApiKeyServerError(`Unexpected field: ${unexpected[0]}.`, 400);
  }
}

function hasOwn(input: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function requireString(
  input: Record<string, unknown>,
  key: string,
  options: { min?: number; max?: number; trim?: boolean } = {},
) {
  const value = input[key];
  const trim = options.trim !== false;

  if (typeof value !== 'string') {
    throw new ApiKeyServerError(`${key} is required.`, 400);
  }

  const normalized = trim ? value.trim() : value;
  if (!normalized) {
    throw new ApiKeyServerError(`${key} is required.`, 400);
  }

  if (typeof options.min === 'number' && normalized.length < options.min) {
    throw new ApiKeyServerError(`${key} must be at least ${options.min} characters.`, 400);
  }

  if (typeof options.max === 'number' && normalized.length > options.max) {
    throw new ApiKeyServerError(`${key} must be ${options.max} characters or fewer.`, 400);
  }

  return normalized;
}

function optionalString(
  input: Record<string, unknown>,
  key: string,
  options: { max?: number; trim?: boolean; allowNull?: boolean } = {},
) {
  if (!hasOwn(input, key)) {
    return undefined;
  }

  const value = input[key];
  if (value === null && options.allowNull) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new ApiKeyServerError(`${key} must be a string.`, 400);
  }

  const normalized = options.trim === false ? value : value.trim();
  if (typeof options.max === 'number' && normalized.length > options.max) {
    throw new ApiKeyServerError(`${key} must be ${options.max} characters or fewer.`, 400);
  }

  return normalized;
}

function optionalNullableId(input: Record<string, unknown>, key: string) {
  const value = optionalString(input, key, { max: 200, allowNull: true });
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return value;
}

function optionalEnum<T extends readonly string[]>(
  input: Record<string, unknown>,
  key: string,
  values: T,
) {
  if (!hasOwn(input, key)) {
    return undefined;
  }

  const value = input[key];
  if (typeof value !== 'string' || !values.includes(value)) {
    throw new ApiKeyServerError(`${key} is invalid.`, 400);
  }

  return value as T[number];
}

function optionalBoolean(input: Record<string, unknown>, key: string) {
  if (!hasOwn(input, key)) {
    return undefined;
  }

  if (typeof input[key] !== 'boolean') {
    throw new ApiKeyServerError(`${key} must be a boolean.`, 400);
  }

  return input[key] as boolean;
}

function optionalNumberEnum<T extends readonly number[]>(
  input: Record<string, unknown>,
  key: string,
  values: T,
) {
  if (!hasOwn(input, key)) {
    return undefined;
  }

  const value = input[key];
  if (typeof value !== 'number' || !values.includes(value)) {
    throw new ApiKeyServerError(`${key} is invalid.`, 400);
  }

  return value as T[number];
}

function optionalIntegerRange(input: Record<string, unknown>, key: string, min: number, max: number) {
  if (!hasOwn(input, key)) {
    return undefined;
  }

  const value = input[key];
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new ApiKeyServerError(`${key} must be between ${min} and ${max}.`, 400);
  }

  return value as number;
}

function optionalStringArray(input: Record<string, unknown>, key: string) {
  if (!hasOwn(input, key)) {
    return undefined;
  }

  const value = input[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new ApiKeyServerError(`${key} must be an array of strings.`, 400);
  }

  return value.map((item) => item.trim()).filter(Boolean);
}

function optionalUniqueStringArray(input: Record<string, unknown>, key: string) {
  const values = optionalStringArray(input, key);
  if (values === undefined) {
    return undefined;
  }

  return Array.from(new Set(values));
}

function inferBugCodeLinkType(url: string): (typeof BUG_CODE_LINK_TYPES)[number] {
  const normalized = url.toLowerCase();
  return normalized.includes('github.com/') ||
    normalized.includes('gitlab.com/') ||
    normalized.includes('bitbucket.org/') ||
    normalized.endsWith('.git')
    ? 'repository'
    : 'directory';
}

function normalizeBugCodeLinksValue(value: unknown) {
  if (!Array.isArray(value)) {
    throw new ApiKeyServerError('codeLinks must be an array.', 400);
  }

  if (value.length > 25) {
    throw new ApiKeyServerError('codeLinks must contain 25 items or fewer.', 400);
  }

  const seen = new Set<string>();
  const links: Array<{ type: (typeof BUG_CODE_LINK_TYPES)[number]; url: string; label?: string; notes?: string }> = [];

  for (const item of value) {
    if (!isRecord(item)) {
      throw new ApiKeyServerError('codeLinks items must be objects.', 400);
    }

    assertAllowedKeys(item, ['type', 'url', 'label', 'notes']);
    const url = optionalString(item, 'url', { max: 1000 });
    if (!url) continue;

    const type = optionalEnum(item, 'type', BUG_CODE_LINK_TYPES) ?? inferBugCodeLinkType(url);
    const label = optionalString(item, 'label', { max: 160 });
    const notes = optionalString(item, 'notes', { max: 1000, trim: false });
    const dedupeKey = `${type}:${url.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    links.push({
      type,
      url,
      ...(label ? { label } : {}),
      ...(notes ? { notes: notes.trim() } : {}),
    });
  }

  return links;
}

function optionalBugCodeLinks(input: Record<string, unknown>, key = 'codeLinks') {
  return hasOwn(input, key) ? normalizeBugCodeLinksValue(input[key]) : undefined;
}

function mergeBugCodeLinks(...values: unknown[]) {
  return normalizeBugCodeLinksValue(values.flatMap((value) => Array.isArray(value) ? value : []).slice(0, 25));
}

function optionalIsoDate(input: Record<string, unknown>, key: string, options: { allowNull?: boolean } = {}) {
  if (!hasOwn(input, key)) {
    return undefined;
  }

  const value = input[key];
  if (value === null && options.allowNull) {
    return null;
  }

  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new ApiKeyServerError(`${key} must be a valid ISO-8601 string.`, 400);
  }

  return new Date(value).toISOString();
}

function optionalTimeOfDay(input: Record<string, unknown>, key: string) {
  if (!hasOwn(input, key)) {
    return undefined;
  }

  const value = input[key];
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) {
    throw new ApiKeyServerError(`${key} must use HH:MM format.`, 400);
  }

  return value;
}

function requireEmail(input: Record<string, unknown>, key: string) {
  const email = requireString(input, key, { max: 320 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiKeyServerError(`${key} must be a valid email address.`, 400);
  }
  return email;
}

function optionalEmail(input: Record<string, unknown>, key: string) {
  const value = optionalString(input, key, { max: 320 });
  if (value === undefined || value === '') return value;
  const email = value.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiKeyServerError(`${key} must be a valid email address.`, 400);
  }
  return email;
}

function ensureNonEmptyPatch(patch: Record<string, unknown>) {
  if (Object.keys(patch).length === 0) {
    throw new ApiKeyServerError('At least one field is required.', 400);
  }
  return patch;
}

function normalizePath(path: string) {
  const trimmed = path.trim();
  if (!trimmed.startsWith('/')) {
    throw new ApiKeyServerError('path must start with /.', 400);
  }
  return trimmed;
}

function normalizeKeyword(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDomain(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withProtocol).hostname.replace(/^www\./, '');
  } catch {
    return trimmed.replace(/^https?:\/\//i, '').replace(/^www\./, '').split('/')[0];
  }
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '');
}

function truncate(value: string, max = 1_800) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

function uniq(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function readSourceLineage(input: Record<string, unknown>, existing: Record<string, unknown> = {}) {
  const patch: Record<string, unknown> = {};
  if (hasOwn(input, 'sourceIds')) {
    patch.sourceIds = uniq([
      ...(Array.isArray(existing.sourceIds) ? existing.sourceIds as string[] : []),
      ...(optionalStringArray(input, 'sourceIds') ?? []),
    ]);
  }
  if (hasOwn(input, 'sourceVersionIds')) {
    patch.sourceVersionIds = uniq([
      ...(Array.isArray(existing.sourceVersionIds) ? existing.sourceVersionIds as string[] : []),
      ...(optionalStringArray(input, 'sourceVersionIds') ?? []),
    ]);
  }
  if (hasOwn(input, 'sourceKey')) patch.sourceKey = optionalString(input, 'sourceKey', { max: 200 }) ?? '';
  if (hasOwn(input, 'sourceTitle')) patch.sourceTitle = optionalString(input, 'sourceTitle', { max: 260 }) ?? '';
  if (hasOwn(input, 'sourceVersion')) patch.sourceVersion = optionalIntegerRange(input, 'sourceVersion', 0, 1_000_000) ?? 0;
  if (hasOwn(input, 'sourceUpdatedAt')) patch.sourceUpdatedAt = optionalIsoDate(input, 'sourceUpdatedAt', { allowNull: true });
  if (hasOwn(input, 'aliases')) {
    patch.aliases = uniq([
      ...(Array.isArray(existing.aliases) ? existing.aliases as string[] : []),
      ...(optionalStringArray(input, 'aliases') ?? []),
    ]);
  }
  if (hasOwn(input, 'matchKey')) patch.matchKey = optionalString(input, 'matchKey', { max: 260 }) ?? '';
  return patch;
}

function hashContent(content: string) {
  return createHash('sha256').update(content).digest('hex');
}

function versionSortField(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function createdAtDesc(left: Record<string, unknown>, right: Record<string, unknown>) {
  return versionSortField(right.createdAt).localeCompare(versionSortField(left.createdAt));
}

function scheduledAtDesc(left: Record<string, unknown>, right: Record<string, unknown>) {
  return versionSortField(right.scheduledFor).localeCompare(versionSortField(left.scheduledFor));
}

function timeBlockSort(left: Record<string, unknown>, right: Record<string, unknown>) {
  const leftDay = typeof left.dayOfWeek === 'number' ? left.dayOfWeek : 0;
  const rightDay = typeof right.dayOfWeek === 'number' ? right.dayOfWeek : 0;
  if (leftDay !== rightDay) return leftDay - rightDay;
  return versionSortField(left.startTime).localeCompare(versionSortField(right.startTime));
}

function sourceUpdatedDesc(left: Record<string, unknown>, right: Record<string, unknown>) {
  return versionSortField(right.updatedAt).localeCompare(versionSortField(left.updatedAt));
}

function updatedAtDesc(left: Record<string, unknown>, right: Record<string, unknown>) {
  const leftUpdatedAt = versionSortField(left.updatedAt || left.createdAt);
  const rightUpdatedAt = versionSortField(right.updatedAt || right.createdAt);
  return rightUpdatedAt.localeCompare(leftUpdatedAt);
}

function versionDesc(left: Record<string, unknown>, right: Record<string, unknown>) {
  const leftVersion = typeof left.version === 'number' ? left.version : 0;
  const rightVersion = typeof right.version === 'number' ? right.version : 0;
  if (leftVersion !== rightVersion) return rightVersion - leftVersion;
  return createdAtDesc(left, right);
}

function requirePayload(input: unknown) {
  if (!isRecord(input)) {
    throw new ApiKeyServerError('payload must be a JSON object.', 400);
  }

  const source = asRecord(input.source);
  const items = Array.isArray(input.items) ? input.items : null;

  if (!items) {
    throw new ApiKeyServerError('payload.items must be an array.', 400);
  }

  return {
    source: {
      title: typeof source.title === 'string' ? source.title.trim() : '',
      aliases: Array.isArray(source.aliases) ? source.aliases.filter((value): value is string => typeof value === 'string') : [],
      summary: typeof source.summary === 'string' ? source.summary : '',
    },
    items: items.map((item) => normalizeIngestionItem(item)).filter((item): item is IngestionItem => item !== null),
  } satisfies IngestionPayload;
}

function normalizeIngestionItem(value: unknown): IngestionItem | null {
  if (!isRecord(value) || typeof value.title !== 'string' || !value.title.trim()) {
    return null;
  }

  const kind = typeof value.kind === 'string' ? value.kind : 'task';
  if (!['task', 'vision', 'cycleGoal', 'review', 'plannerItem', 'video', 'creative', 'lead', 'account'].includes(kind)) {
    throw new ApiKeyServerError('payload.items.kind is invalid.', 400);
  }

  return Object.fromEntries(Object.entries({
    kind: kind as IngestionKind,
    title: value.title.trim(),
    summary: typeof value.summary === 'string' ? value.summary : '',
    description: typeof value.description === 'string' ? value.description : undefined,
    aliases: Array.isArray(value.aliases) ? value.aliases.filter((alias): alias is string => typeof alias === 'string') : undefined,
    matchKey: typeof value.matchKey === 'string' && value.matchKey.trim() ? value.matchKey.trim() : undefined,
    status: typeof value.status === 'string' ? value.status as IngestionItem['status'] : undefined,
    effortPoints:
      typeof value.effortPoints === 'number' && EFFORT_POINTS.includes(value.effortPoints as 1 | 2 | 3 | 5 | 8)
        ? value.effortPoints as 1 | 2 | 3 | 5 | 8
        : undefined,
    isLeadIndicator: typeof value.isLeadIndicator === 'boolean' ? value.isLeadIndicator : undefined,
    focusItems: Array.isArray(value.focusItems) ? value.focusItems.filter((item): item is string => typeof item === 'string') : undefined,
    platform: typeof value.platform === 'string' ? value.platform as IngestionItem['platform'] : undefined,
    source: typeof value.source === 'string' ? value.source as IngestionItem['source'] : undefined,
    sentiment: typeof value.sentiment === 'string' ? value.sentiment as IngestionItem['sentiment'] : undefined,
    scheduledFor: typeof value.scheduledFor === 'string' ? value.scheduledFor : undefined,
    stage: typeof value.stage === 'string' ? value.stage as IngestionItem['stage'] : undefined,
    email: typeof value.email === 'string' ? value.email : undefined,
    companyName: typeof value.companyName === 'string' ? value.companyName : undefined,
    accountId: typeof value.accountId === 'string' ? value.accountId : undefined,
    website: typeof value.website === 'string' ? value.website : undefined,
    industry: typeof value.industry === 'string' ? value.industry : undefined,
    size: typeof value.size === 'string' ? value.size : undefined,
    notes: typeof value.notes === 'string' ? value.notes : undefined,
    priority: typeof value.priority === 'string' ? value.priority as IngestionItem['priority'] : undefined,
    ownerId: typeof value.ownerId === 'string' ? value.ownerId : undefined,
    nextAction: typeof value.nextAction === 'string' ? value.nextAction : undefined,
    nextActionAt: typeof value.nextActionAt === 'string' ? value.nextActionAt : undefined,
    linkedTaskIds: Array.isArray(value.linkedTaskIds) ? value.linkedTaskIds.filter((item): item is string => typeof item === 'string') : undefined,
    creativePlatform: typeof value.creativePlatform === 'string' ? value.creativePlatform as IngestionItem['creativePlatform'] : undefined,
    format: typeof value.format === 'string' ? value.format as IngestionItem['format'] : undefined,
    campaign: typeof value.campaign === 'string' ? value.campaign : undefined,
    audience: typeof value.audience === 'string' ? value.audience : undefined,
    objective: typeof value.objective === 'string' ? value.objective : undefined,
    hook: typeof value.hook === 'string' ? value.hook : undefined,
    brief: typeof value.brief === 'string' ? value.brief : undefined,
    caption: typeof value.caption === 'string' ? value.caption : undefined,
    visualDirection: typeof value.visualDirection === 'string' ? value.visualDirection : undefined,
    productionNotes: typeof value.productionNotes === 'string' ? value.productionNotes : undefined,
    cta: typeof value.cta === 'string' ? value.cta : undefined,
    targetPublishAt: typeof value.targetPublishAt === 'string' ? value.targetPublishAt : undefined,
    tags: Array.isArray(value.tags) ? value.tags.filter((item): item is string => typeof item === 'string') : undefined,
  }).filter(([, item]) => item !== undefined)) as IngestionItem;
}

function buildTaskCreate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, ['title', 'status', 'effortPoints', 'isLeadIndicator', 'cycleGoalId', 'assigneeId', 'completedAt']);
  const title = requireString(body, 'title', { max: 200 });
  const cycleGoalId = optionalNullableId(body, 'cycleGoalId') ?? null;
  const status = optionalEnum(body, 'status', TASK_STATUSES) ?? (cycleGoalId ? 'todo' : 'icebox');
  const completedAt = optionalIsoDate(body, 'completedAt', { allowNull: true });

  return {
    title,
    status,
    effortPoints: optionalNumberEnum(body, 'effortPoints', EFFORT_POINTS) ?? 1,
    isLeadIndicator: optionalBoolean(body, 'isLeadIndicator') ?? false,
    cycleGoalId,
    assigneeId: optionalNullableId(body, 'assigneeId') ?? null,
    createdAt: nowIso(),
    completedAt: status === 'done' ? completedAt ?? nowIso() : completedAt ?? null,
    authorId: actor.ownerUid,
    companyId: actor.companyId ?? null,
  };
}

function buildTaskUpdate(body: Record<string, unknown>, _actor: AuthorizedApiKeyActor, existing: Record<string, unknown>) {
  assertAllowedKeys(body, ['title', 'status', 'effortPoints', 'isLeadIndicator', 'cycleGoalId', 'assigneeId', 'completedAt']);
  const patch: Record<string, unknown> = {};

  if (hasOwn(body, 'title')) patch.title = requireString(body, 'title', { max: 200 });
  if (hasOwn(body, 'effortPoints')) patch.effortPoints = optionalNumberEnum(body, 'effortPoints', EFFORT_POINTS);
  if (hasOwn(body, 'isLeadIndicator')) patch.isLeadIndicator = optionalBoolean(body, 'isLeadIndicator');
  if (hasOwn(body, 'cycleGoalId')) patch.cycleGoalId = optionalNullableId(body, 'cycleGoalId');
  if (hasOwn(body, 'assigneeId')) patch.assigneeId = optionalNullableId(body, 'assigneeId');

  const status = optionalEnum(body, 'status', TASK_STATUSES);
  const completedAt = optionalIsoDate(body, 'completedAt', { allowNull: true });
  const existingCompletedAt = typeof existing.completedAt === 'string' ? existing.completedAt : null;

  if (status) {
    patch.status = status;
    if (completedAt !== undefined) patch.completedAt = completedAt;
    else if (status === 'done') patch.completedAt = existingCompletedAt ?? nowIso();
    else patch.completedAt = null;
  } else if (completedAt !== undefined) {
    patch.completedAt = completedAt;
  }

  return ensureNonEmptyPatch(patch);
}

function buildBugCreate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, ['title', 'description', 'severity', 'status', 'resolutionNotes', 'linkedTaskIds', 'codeLinks', ...SOURCE_LINEAGE_FIELDS]);
  const title = requireString(body, 'title', { max: 200 });
  return {
    title,
    description: optionalString(body, 'description', { max: 8_000, trim: false }) ?? '',
    severity: optionalEnum(body, 'severity', BUG_SEVERITIES) ?? 'medium',
    status: optionalEnum(body, 'status', BUG_STATUSES) ?? 'open',
    resolutionNotes: optionalString(body, 'resolutionNotes', { max: 8_000, trim: false }) ?? '',
    linkedTaskIds: optionalUniqueStringArray(body, 'linkedTaskIds') ?? [],
    codeLinks: optionalBugCodeLinks(body) ?? [],
    matchKey: optionalString(body, 'matchKey', { max: 260 }) || normalizeKey(title),
    ...readSourceLineage(body),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    authorId: actor.ownerUid,
    companyId: actor.companyId ?? null,
  };
}

function buildBugUpdate(body: Record<string, unknown>, _existing: Record<string, unknown>) {
  assertAllowedKeys(body, ['title', 'description', 'severity', 'status', 'resolutionNotes', 'linkedTaskIds', 'codeLinks', ...SOURCE_LINEAGE_FIELDS]);
  const patch: Record<string, unknown> = {};

  if (hasOwn(body, 'title')) patch.title = requireString(body, 'title', { max: 200 });
  if (hasOwn(body, 'description')) patch.description = optionalString(body, 'description', { max: 8_000, trim: false }) ?? '';
  if (hasOwn(body, 'severity')) patch.severity = optionalEnum(body, 'severity', BUG_SEVERITIES);
  if (hasOwn(body, 'status')) patch.status = optionalEnum(body, 'status', BUG_STATUSES);
  if (hasOwn(body, 'resolutionNotes')) {
    patch.resolutionNotes = optionalString(body, 'resolutionNotes', { max: 8_000, trim: false }) ?? '';
  }
  if (hasOwn(body, 'linkedTaskIds')) patch.linkedTaskIds = optionalUniqueStringArray(body, 'linkedTaskIds') ?? [];
  if (hasOwn(body, 'codeLinks')) patch.codeLinks = optionalBugCodeLinks(body) ?? [];
  Object.assign(patch, readSourceLineage(body, _existing));
  patch.updatedAt = nowIso();

  return ensureNonEmptyPatch(patch);
}

function buildRoadmapItemCreate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, ['title', 'description', 'phase', 'priority', 'status', 'linkedTaskIds']);
  return {
    title: requireString(body, 'title', { max: 200 }),
    description: optionalString(body, 'description', { max: 8_000, trim: false }) ?? '',
    phase: optionalEnum(body, 'phase', ROADMAP_PHASES) ?? 'next',
    priority: optionalEnum(body, 'priority', ROADMAP_PRIORITIES) ?? 'medium',
    status: optionalEnum(body, 'status', ROADMAP_STATUSES) ?? 'planned',
    linkedTaskIds: optionalUniqueStringArray(body, 'linkedTaskIds') ?? [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    authorId: actor.ownerUid,
    companyId: actor.companyId ?? null,
  };
}

function buildRoadmapItemUpdate(body: Record<string, unknown>, _existing: Record<string, unknown>) {
  assertAllowedKeys(body, ['title', 'description', 'phase', 'priority', 'status', 'linkedTaskIds']);
  const patch: Record<string, unknown> = {};

  if (hasOwn(body, 'title')) patch.title = requireString(body, 'title', { max: 200 });
  if (hasOwn(body, 'description')) patch.description = optionalString(body, 'description', { max: 8_000, trim: false }) ?? '';
  if (hasOwn(body, 'phase')) patch.phase = optionalEnum(body, 'phase', ROADMAP_PHASES);
  if (hasOwn(body, 'priority')) patch.priority = optionalEnum(body, 'priority', ROADMAP_PRIORITIES);
  if (hasOwn(body, 'status')) patch.status = optionalEnum(body, 'status', ROADMAP_STATUSES);
  if (hasOwn(body, 'linkedTaskIds')) patch.linkedTaskIds = optionalUniqueStringArray(body, 'linkedTaskIds') ?? [];
  patch.updatedAt = nowIso();

  return ensureNonEmptyPatch(patch);
}

function buildVisionCreate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, ['title', 'description', 'focusItems']);
  return {
    title: requireString(body, 'title', { max: 200 }),
    description: requireString(body, 'description', { max: 8_000 }),
    focusItems: optionalStringArray(body, 'focusItems') ?? [],
    createdAt: nowIso(),
    authorId: actor.ownerUid,
    companyId: actor.companyId ?? null,
  };
}

function buildVisionUpdate(body: Record<string, unknown>) {
  assertAllowedKeys(body, ['title', 'description', 'focusItems']);
  const patch: Record<string, unknown> = {};
  if (hasOwn(body, 'title')) patch.title = requireString(body, 'title', { max: 200 });
  if (hasOwn(body, 'description')) patch.description = requireString(body, 'description', { max: 8_000 });
  if (hasOwn(body, 'focusItems')) patch.focusItems = optionalStringArray(body, 'focusItems') ?? [];
  return ensureNonEmptyPatch(patch);
}

function buildCycleGoalCreate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, ['title', 'description', 'status']);
  return {
    title: requireString(body, 'title', { max: 200 }),
    description: optionalString(body, 'description', { max: 8_000 }) ?? '',
    status: optionalEnum(body, 'status', GOAL_STATUSES) ?? 'active',
    createdAt: nowIso(),
    authorId: actor.ownerUid,
    companyId: actor.companyId ?? null,
  };
}

function buildCycleGoalUpdate(body: Record<string, unknown>) {
  assertAllowedKeys(body, ['title', 'description', 'status']);
  const patch: Record<string, unknown> = {};
  if (hasOwn(body, 'title')) patch.title = requireString(body, 'title', { max: 200 });
  if (hasOwn(body, 'description')) patch.description = optionalString(body, 'description', { max: 8_000 }) ?? '';
  if (hasOwn(body, 'status')) patch.status = optionalEnum(body, 'status', GOAL_STATUSES);
  return ensureNonEmptyPatch(patch);
}

function buildPromptCreate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, ['title', 'version', 'content']);
  return {
    title: requireString(body, 'title', { max: 200 }),
    version: optionalString(body, 'version', { max: 40 }) ?? 'v1.0',
    content: requireString(body, 'content', { max: 50_000, trim: false }),
    createdAt: nowIso(),
    authorId: actor.ownerUid,
    companyId: actor.companyId ?? null,
  };
}

function buildPromptUpdate(body: Record<string, unknown>) {
  assertAllowedKeys(body, ['title', 'version', 'content']);
  const patch: Record<string, unknown> = {};
  if (hasOwn(body, 'title')) patch.title = requireString(body, 'title', { max: 200 });
  if (hasOwn(body, 'version')) patch.version = optionalString(body, 'version', { max: 40 }) ?? 'v1.0';
  if (hasOwn(body, 'content')) patch.content = requireString(body, 'content', { max: 50_000, trim: false });
  return ensureNonEmptyPatch(patch);
}

function optionalBusinessPlanLinks(input: Record<string, unknown>, key: string) {
  if (!hasOwn(input, key)) {
    return undefined;
  }

  const value = input[key];
  if (!Array.isArray(value)) {
    throw new ApiKeyServerError(`${key} must be an array.`, 400);
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new ApiKeyServerError(`${key}[${index}] must be an object.`, 400);
    }

    const type = optionalEnum(item, 'type', BUSINESS_PLAN_LINK_TYPES);
    if (!type) {
      throw new ApiKeyServerError(`${key}[${index}].type is invalid.`, 400);
    }

    return {
      id: requireString(item, 'id', { max: 120 }),
      type,
      recordId: requireString(item, 'recordId', { max: 200 }),
      createdAt: optionalIsoDate(item, 'createdAt') ?? nowIso(),
      createdBy: requireString(item, 'createdBy', { max: 200 }),
    };
  });
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeTextList(input: Record<string, unknown>, key: string, limit = 2_000) {
  const values = optionalStringArray(input, key) ?? [];
  return values.map((value) => value.slice(0, limit));
}

function normalizeBlogBrief(value: unknown) {
  const input = expectObject(value, 'brief must be a JSON object.');
  assertAllowedKeys(input, ['audience', 'painPoint', 'buyingTrigger', 'brokenBelief', 'replofyAngle', 'thesis', 'cta', 'contentCluster']);
  return {
    audience: optionalString(input, 'audience', { max: 500 }) ?? '',
    painPoint: optionalString(input, 'painPoint', { max: 4_000 }) ?? '',
    buyingTrigger: optionalString(input, 'buyingTrigger', { max: 2_000 }) ?? '',
    brokenBelief: optionalString(input, 'brokenBelief', { max: 2_000 }) ?? '',
    replofyAngle: optionalString(input, 'replofyAngle', { max: 2_000 }) ?? '',
    thesis: optionalString(input, 'thesis', { max: 4_000 }) ?? '',
    cta: optionalString(input, 'cta', { max: 1_000 }) ?? '',
    contentCluster: optionalString(input, 'contentCluster', { max: 240 }) ?? '',
  };
}

function emptyBlogBrief() {
  return normalizeBlogBrief({});
}

function normalizeBlogEvidence(value: unknown) {
  if (!Array.isArray(value)) {
    throw new ApiKeyServerError('evidence must be an array.', 400);
  }
  if (value.length > 500) {
    throw new ApiKeyServerError('evidence must contain 500 items or fewer.', 400);
  }

  return value.map((entry, index) => {
    const input = expectObject(entry, 'Each evidence item must be a JSON object.');
    assertAllowedKeys(input, ['id', 'claim', 'value', 'sourceId', 'sourceUrl', 'quote', 'confidence', 'usedInDraft']);
    return {
      id: optionalString(input, 'id', { max: 200 }) || `evidence-${Date.now()}-${index}`,
      claim: requireString(input, 'claim', { max: 2_000 }),
      value: optionalString(input, 'value', { max: 500 }) ?? '',
      sourceId: optionalString(input, 'sourceId', { max: 200 }) ?? '',
      sourceUrl: optionalString(input, 'sourceUrl', { max: 2_000 }) ?? '',
      quote: optionalString(input, 'quote', { max: 4_000 }) ?? '',
      confidence: optionalEnum(input, 'confidence', BLOG_EVIDENCE_CONFIDENCE) ?? 'unverified',
      usedInDraft: optionalBoolean(input, 'usedInDraft') ?? false,
    };
  });
}

function normalizeBlogDistribution(value: unknown) {
  const input = expectObject(value, 'distribution must be a JSON object.');
  assertAllowedKeys(input, ['seoTitle', 'metaDescription', 'primaryKeyword', 'channels', 'publicationUrl']);
  return {
    seoTitle: optionalString(input, 'seoTitle', { max: 500 }) ?? '',
    metaDescription: optionalString(input, 'metaDescription', { max: 1_000 }) ?? '',
    primaryKeyword: optionalString(input, 'primaryKeyword', { max: 240 }) ?? '',
    channels: normalizeTextList(input, 'channels', 120),
    publicationUrl: optionalString(input, 'publicationUrl', { max: 2_000 }) ?? '',
  };
}

function emptyBlogDistribution() {
  return normalizeBlogDistribution({});
}

function buildBlogArticleCreate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, [
    'title',
    'slug',
    'summary',
    'content',
    'status',
    'roadmapPhase',
    'priority',
    'ownerId',
    'targetPublishAt',
    'scheduledFor',
    'brief',
    'evidence',
    'linkedSourceIds',
    'distribution',
    'tags',
    'dataPoints',
    'docLinks',
    'validationNotes',
    'validatedAt',
    'publishedAt',
    'rejectedAt',
  ]);

  const title = requireString(body, 'title', { max: 240 });
  const status = optionalEnum(body, 'status', BLOG_ARTICLE_STATUSES) ?? 'idea';

  return {
    title,
    slug: optionalString(body, 'slug', { max: 280 }) ?? slugify(title),
    summary: optionalString(body, 'summary', { max: 4_000 }) ?? '',
    content: optionalString(body, 'content', { max: 40_000, trim: false }) ?? '',
    status,
    roadmapPhase: optionalEnum(body, 'roadmapPhase', BLOG_ROADMAP_PHASES) ?? 'next',
    priority: optionalEnum(body, 'priority', BLOG_PRIORITIES) ?? 'medium',
    ownerId: optionalNullableId(body, 'ownerId') ?? actor.ownerUid,
    targetPublishAt: optionalIsoDate(body, 'targetPublishAt', { allowNull: true }) ?? null,
    scheduledFor: optionalIsoDate(body, 'scheduledFor', { allowNull: true }) ?? null,
    brief: hasOwn(body, 'brief') ? normalizeBlogBrief(body.brief) : emptyBlogBrief(),
    evidence: hasOwn(body, 'evidence') ? normalizeBlogEvidence(body.evidence) : [],
    linkedSourceIds: optionalUniqueStringArray(body, 'linkedSourceIds') ?? [],
    distribution: hasOwn(body, 'distribution') ? normalizeBlogDistribution(body.distribution) : emptyBlogDistribution(),
    tags: normalizeTextList(body, 'tags', 60),
    dataPoints: normalizeTextList(body, 'dataPoints', 500),
    docLinks: normalizeTextList(body, 'docLinks', 2_000),
    validationNotes: normalizeTextList(body, 'validationNotes', 2_000),
    validatedAt: optionalIsoDate(body, 'validatedAt', { allowNull: true }) ?? null,
    publishedAt: optionalIsoDate(body, 'publishedAt', { allowNull: true }) ?? null,
    rejectedAt: optionalIsoDate(body, 'rejectedAt', { allowNull: true }) ?? null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    authorId: actor.ownerUid,
    companyId: actor.companyId ?? null,
  };
}

function buildBlogArticleUpdate(body: Record<string, unknown>, existing: Record<string, unknown>) {
  assertAllowedKeys(body, [
    'title',
    'slug',
    'summary',
    'content',
    'status',
    'roadmapPhase',
    'priority',
    'ownerId',
    'targetPublishAt',
    'scheduledFor',
    'brief',
    'evidence',
    'linkedSourceIds',
    'distribution',
    'tags',
    'dataPoints',
    'docLinks',
    'validationNotes',
    'validatedAt',
    'publishedAt',
    'rejectedAt',
  ]);

  const patch: Record<string, unknown> = {};
  if (hasOwn(body, 'title')) patch.title = requireString(body, 'title', { max: 240 });
  if (hasOwn(body, 'slug')) patch.slug = optionalString(body, 'slug', { max: 280 }) ?? slugify(String(existing.title || 'article'));
  if (hasOwn(body, 'summary')) patch.summary = optionalString(body, 'summary', { max: 4_000 }) ?? '';
  if (hasOwn(body, 'content')) patch.content = optionalString(body, 'content', { max: 40_000, trim: false }) ?? '';
  if (hasOwn(body, 'roadmapPhase')) patch.roadmapPhase = optionalEnum(body, 'roadmapPhase', BLOG_ROADMAP_PHASES);
  if (hasOwn(body, 'priority')) patch.priority = optionalEnum(body, 'priority', BLOG_PRIORITIES);
  if (hasOwn(body, 'ownerId')) patch.ownerId = optionalNullableId(body, 'ownerId') ?? null;
  if (hasOwn(body, 'targetPublishAt')) patch.targetPublishAt = optionalIsoDate(body, 'targetPublishAt', { allowNull: true });
  if (hasOwn(body, 'scheduledFor')) patch.scheduledFor = optionalIsoDate(body, 'scheduledFor', { allowNull: true });
  if (hasOwn(body, 'brief')) patch.brief = normalizeBlogBrief(body.brief);
  if (hasOwn(body, 'evidence')) patch.evidence = normalizeBlogEvidence(body.evidence);
  if (hasOwn(body, 'linkedSourceIds')) patch.linkedSourceIds = optionalUniqueStringArray(body, 'linkedSourceIds') ?? [];
  if (hasOwn(body, 'distribution')) patch.distribution = normalizeBlogDistribution(body.distribution);
  if (hasOwn(body, 'status')) {
    const status = optionalEnum(body, 'status', BLOG_ARTICLE_STATUSES);
    patch.status = status;
    if (status === 'review' || status === 'progressing') {
      patch.validatedAt = optionalIsoDate(body, 'validatedAt', { allowNull: true }) ?? (typeof existing.validatedAt === 'string' ? existing.validatedAt : nowIso());
      patch.rejectedAt = null;
    } else if (status === 'scheduled') {
      patch.validatedAt = optionalIsoDate(body, 'validatedAt', { allowNull: true }) ?? (typeof existing.validatedAt === 'string' ? existing.validatedAt : nowIso());
      patch.scheduledFor = optionalIsoDate(body, 'scheduledFor', { allowNull: true }) ?? (typeof existing.targetPublishAt === 'string' ? existing.targetPublishAt : null);
      patch.rejectedAt = null;
    } else if (status === 'published' || status === 'finished') {
      patch.validatedAt = optionalIsoDate(body, 'validatedAt', { allowNull: true }) ?? (typeof existing.validatedAt === 'string' ? existing.validatedAt : nowIso());
      patch.publishedAt = optionalIsoDate(body, 'publishedAt', { allowNull: true }) ?? (typeof existing.publishedAt === 'string' ? existing.publishedAt : nowIso());
      patch.rejectedAt = null;
    } else if (status === 'rejected') {
      patch.rejectedAt = optionalIsoDate(body, 'rejectedAt', { allowNull: true }) ?? nowIso();
      patch.publishedAt = null;
    }
  }
  if (hasOwn(body, 'tags')) patch.tags = normalizeTextList(body, 'tags', 60);
  if (hasOwn(body, 'dataPoints')) patch.dataPoints = normalizeTextList(body, 'dataPoints', 500);
  if (hasOwn(body, 'docLinks')) patch.docLinks = normalizeTextList(body, 'docLinks', 2_000);
  if (hasOwn(body, 'validationNotes')) patch.validationNotes = normalizeTextList(body, 'validationNotes', 2_000);
  if (hasOwn(body, 'validatedAt')) patch.validatedAt = optionalIsoDate(body, 'validatedAt', { allowNull: true });
  if (hasOwn(body, 'publishedAt')) patch.publishedAt = optionalIsoDate(body, 'publishedAt', { allowNull: true });
  if (hasOwn(body, 'rejectedAt')) patch.rejectedAt = optionalIsoDate(body, 'rejectedAt', { allowNull: true });
  patch.updatedAt = nowIso();
  return ensureNonEmptyPatch(patch);
}

function buildBusinessPlanCreate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, ['title', 'summary', 'content', 'status', 'tags', 'links']);
  const title = requireString(body, 'title', { max: 120 });
  const template = createBusinessPlanTemplate({ title });

  return {
    title,
    summary: optionalString(body, 'summary', { max: 1_000 }) ?? template.summary,
    content: optionalString(body, 'content', { max: 50_000, trim: false }) ?? template.content,
    status: optionalEnum(body, 'status', BUSINESS_PLAN_STATUSES) ?? template.status,
    tags: normalizeTextList(body, 'tags', 60).slice(0, 20),
    links: optionalBusinessPlanLinks(body, 'links') ?? template.links,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    authorId: actor.ownerUid,
    companyId: actor.companyId ?? null,
  };
}

function buildBusinessPlanUpdate(body: Record<string, unknown>) {
  assertAllowedKeys(body, ['title', 'summary', 'content', 'status', 'tags', 'links']);
  const patch: Record<string, unknown> = {};
  if (hasOwn(body, 'title')) patch.title = requireString(body, 'title', { max: 120 });
  if (hasOwn(body, 'summary')) patch.summary = optionalString(body, 'summary', { max: 1_000 }) ?? '';
  if (hasOwn(body, 'content')) patch.content = optionalString(body, 'content', { max: 50_000, trim: false }) ?? '';
  if (hasOwn(body, 'status')) patch.status = optionalEnum(body, 'status', BUSINESS_PLAN_STATUSES);
  if (hasOwn(body, 'tags')) patch.tags = normalizeTextList(body, 'tags', 60).slice(0, 20);
  if (hasOwn(body, 'links')) patch.links = optionalBusinessPlanLinks(body, 'links') ?? [];
  patch.updatedAt = nowIso();
  return ensureNonEmptyPatch(patch);
}

function buildApiEndpointCreate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, ['method', 'path', 'description', 'status']);
  return {
    method: optionalEnum(body, 'method', HTTP_METHODS) ?? 'GET',
    path: normalizePath(requireString(body, 'path', { max: 400 })),
    description: requireString(body, 'description', { max: 2_000 }),
    status: optionalEnum(body, 'status', API_ENDPOINT_STATUSES) ?? 'active',
    createdAt: nowIso(),
    authorId: actor.ownerUid,
    companyId: actor.companyId ?? null,
  };
}

function buildApiEndpointUpdate(body: Record<string, unknown>) {
  assertAllowedKeys(body, ['method', 'path', 'description', 'status']);
  const patch: Record<string, unknown> = {};
  if (hasOwn(body, 'method')) patch.method = optionalEnum(body, 'method', HTTP_METHODS);
  if (hasOwn(body, 'path')) patch.path = normalizePath(requireString(body, 'path', { max: 400 }));
  if (hasOwn(body, 'description')) patch.description = requireString(body, 'description', { max: 2_000 });
  if (hasOwn(body, 'status')) patch.status = optionalEnum(body, 'status', API_ENDPOINT_STATUSES);
  return ensureNonEmptyPatch(patch);
}

function buildEnvironmentUpdate(body: Record<string, unknown>) {
  assertAllowedKeys(body, ['name', 'status', 'lastSync', 'version']);
  const patch: Record<string, unknown> = {};
  if (hasOwn(body, 'name')) patch.name = optionalEnum(body, 'name', ENVIRONMENT_NAMES);
  if (hasOwn(body, 'status')) patch.status = optionalEnum(body, 'status', ENVIRONMENT_STATUSES);
  if (hasOwn(body, 'lastSync')) patch.lastSync = optionalIsoDate(body, 'lastSync');
  if (hasOwn(body, 'version')) patch.version = requireString(body, 'version', { max: 40 });
  return ensureNonEmptyPatch(patch);
}

function buildSocialPostCreate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, ['platform', 'content', 'scheduledFor', 'status']);
  return {
    platform: optionalEnum(body, 'platform', SOCIAL_PLATFORMS) ?? 'Twitter',
    content: requireString(body, 'content', { max: 20_000, trim: false }),
    scheduledFor: optionalIsoDate(body, 'scheduledFor') ?? nowIso(),
    status: optionalEnum(body, 'status', POST_STATUSES) ?? 'scheduled',
    createdAt: nowIso(),
    authorId: actor.ownerUid,
    companyId: actor.companyId ?? null,
  };
}

function buildSocialPostUpdate(body: Record<string, unknown>) {
  assertAllowedKeys(body, ['platform', 'content', 'scheduledFor', 'status']);
  const patch: Record<string, unknown> = {};
  if (hasOwn(body, 'platform')) patch.platform = optionalEnum(body, 'platform', SOCIAL_PLATFORMS);
  if (hasOwn(body, 'content')) patch.content = requireString(body, 'content', { max: 20_000, trim: false });
  if (hasOwn(body, 'scheduledFor')) patch.scheduledFor = optionalIsoDate(body, 'scheduledFor');
  if (hasOwn(body, 'status')) patch.status = optionalEnum(body, 'status', POST_STATUSES);
  return ensureNonEmptyPatch(patch);
}

const CREATIVE_ITEM_FIELDS = [
  'title',
  'platform',
  'format',
  'campaign',
  'audience',
  'objective',
  'hook',
  'brief',
  'caption',
  'visualDirection',
  'productionNotes',
  'cta',
  'status',
  'ownerId',
  'approverId',
  'targetPublishAt',
  'scheduledFor',
  'publishedAt',
  'submittedAt',
  'approvalNotes',
  'assetIds',
  'tags',
] as const;

function buildCreativeItemCreate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, CREATIVE_ITEM_FIELDS);
  const status = optionalEnum(body, 'status', CREATIVE_STATUSES) ?? 'idea';
  const scheduledFor = optionalIsoDate(body, 'scheduledFor', { allowNull: true }) ?? null;

  if (status === 'scheduled' && !scheduledFor) {
    throw new ApiKeyServerError('scheduledFor is required when status is scheduled.', 400);
  }

  const now = nowIso();
  return {
    title: requireString(body, 'title', { max: 200 }),
    platform: optionalEnum(body, 'platform', CREATIVE_PLATFORMS) ?? 'Other',
    format: optionalEnum(body, 'format', CREATIVE_FORMATS) ?? 'other',
    campaign: optionalString(body, 'campaign', { max: 500 }) ?? '',
    audience: optionalString(body, 'audience', { max: 2_000 }) ?? '',
    objective: optionalString(body, 'objective', { max: 2_000 }) ?? '',
    hook: optionalString(body, 'hook', { max: 4_000 }) ?? '',
    brief: optionalString(body, 'brief', { max: 20_000, trim: false }) ?? '',
    caption: optionalString(body, 'caption', { max: 20_000, trim: false }) ?? '',
    visualDirection: optionalString(body, 'visualDirection', { max: 8_000, trim: false }) ?? '',
    productionNotes: optionalString(body, 'productionNotes', { max: 8_000, trim: false }) ?? '',
    cta: optionalString(body, 'cta', { max: 2_000 }) ?? '',
    status,
    ownerId: optionalNullableId(body, 'ownerId') ?? actor.ownerUid,
    approverId: optionalNullableId(body, 'approverId') ?? null,
    targetPublishAt: optionalIsoDate(body, 'targetPublishAt', { allowNull: true }) ?? null,
    scheduledFor,
    publishedAt: optionalIsoDate(body, 'publishedAt', { allowNull: true }) ?? (status === 'published' ? now : null),
    submittedAt: optionalIsoDate(body, 'submittedAt', { allowNull: true }) ?? (status === 'in-review' ? now : null),
    approvalNotes: optionalString(body, 'approvalNotes', { max: 8_000, trim: false }) ?? '',
    assetIds: optionalUniqueStringArray(body, 'assetIds') ?? [],
    tags: normalizeTextList(body, 'tags', 80).slice(0, 50),
    createdAt: now,
    updatedAt: now,
    authorId: actor.ownerUid,
    companyId: actor.companyId ?? null,
  };
}

function buildCreativeItemUpdate(body: Record<string, unknown>, _actor: AuthorizedApiKeyActor, existing: Record<string, unknown>) {
  assertAllowedKeys(body, CREATIVE_ITEM_FIELDS);
  const patch: Record<string, unknown> = {};
  if (hasOwn(body, 'title')) patch.title = requireString(body, 'title', { max: 200 });
  if (hasOwn(body, 'platform')) patch.platform = optionalEnum(body, 'platform', CREATIVE_PLATFORMS);
  if (hasOwn(body, 'format')) patch.format = optionalEnum(body, 'format', CREATIVE_FORMATS);
  if (hasOwn(body, 'campaign')) patch.campaign = optionalString(body, 'campaign', { max: 500 }) ?? '';
  if (hasOwn(body, 'audience')) patch.audience = optionalString(body, 'audience', { max: 2_000 }) ?? '';
  if (hasOwn(body, 'objective')) patch.objective = optionalString(body, 'objective', { max: 2_000 }) ?? '';
  if (hasOwn(body, 'hook')) patch.hook = optionalString(body, 'hook', { max: 4_000 }) ?? '';
  if (hasOwn(body, 'brief')) patch.brief = optionalString(body, 'brief', { max: 20_000, trim: false }) ?? '';
  if (hasOwn(body, 'caption')) patch.caption = optionalString(body, 'caption', { max: 20_000, trim: false }) ?? '';
  if (hasOwn(body, 'visualDirection')) patch.visualDirection = optionalString(body, 'visualDirection', { max: 8_000, trim: false }) ?? '';
  if (hasOwn(body, 'productionNotes')) patch.productionNotes = optionalString(body, 'productionNotes', { max: 8_000, trim: false }) ?? '';
  if (hasOwn(body, 'cta')) patch.cta = optionalString(body, 'cta', { max: 2_000 }) ?? '';
  if (hasOwn(body, 'status')) patch.status = optionalEnum(body, 'status', CREATIVE_STATUSES);
  if (hasOwn(body, 'ownerId')) patch.ownerId = optionalNullableId(body, 'ownerId') ?? null;
  if (hasOwn(body, 'approverId')) patch.approverId = optionalNullableId(body, 'approverId') ?? null;
  if (hasOwn(body, 'targetPublishAt')) patch.targetPublishAt = optionalIsoDate(body, 'targetPublishAt', { allowNull: true }) ?? null;
  if (hasOwn(body, 'scheduledFor')) patch.scheduledFor = optionalIsoDate(body, 'scheduledFor', { allowNull: true }) ?? null;
  if (hasOwn(body, 'publishedAt')) patch.publishedAt = optionalIsoDate(body, 'publishedAt', { allowNull: true }) ?? null;
  if (hasOwn(body, 'submittedAt')) patch.submittedAt = optionalIsoDate(body, 'submittedAt', { allowNull: true }) ?? null;
  if (hasOwn(body, 'approvalNotes')) patch.approvalNotes = optionalString(body, 'approvalNotes', { max: 8_000, trim: false }) ?? '';
  if (hasOwn(body, 'assetIds')) patch.assetIds = optionalUniqueStringArray(body, 'assetIds') ?? [];
  if (hasOwn(body, 'tags')) patch.tags = normalizeTextList(body, 'tags', 80).slice(0, 50);

  const nextStatus = typeof patch.status === 'string' ? patch.status : existing.status;
  const nextScheduledFor = hasOwn(patch, 'scheduledFor') ? patch.scheduledFor : existing.scheduledFor;
  if (nextStatus === 'scheduled' && !nextScheduledFor) {
    throw new ApiKeyServerError('scheduledFor is required when status is scheduled.', 400);
  }
  if (hasOwn(body, 'status') && patch.status === 'published' && !hasOwn(body, 'publishedAt')) {
    patch.publishedAt = nowIso();
  }
  if (hasOwn(body, 'status') && patch.status === 'in-review' && !hasOwn(body, 'submittedAt')) {
    patch.submittedAt = nowIso();
  }

  patch.updatedAt = nowIso();
  return ensureNonEmptyPatch(patch);
}

function buildSeoKeywordCreate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, ['keyword', 'intent', 'cycleGoalId']);
  return {
    keyword: normalizeKeyword(requireString(body, 'keyword', { max: 200 })),
    intent: optionalEnum(body, 'intent', SEO_INTENTS) ?? 'high',
    cycleGoalId: optionalNullableId(body, 'cycleGoalId') ?? null,
    createdAt: nowIso(),
    authorId: actor.ownerUid,
    companyId: actor.companyId ?? null,
  };
}

function buildSeoKeywordUpdate(body: Record<string, unknown>) {
  assertAllowedKeys(body, ['keyword', 'intent', 'cycleGoalId']);
  const patch: Record<string, unknown> = {};
  if (hasOwn(body, 'keyword')) patch.keyword = normalizeKeyword(requireString(body, 'keyword', { max: 200 }));
  if (hasOwn(body, 'intent')) patch.intent = optionalEnum(body, 'intent', SEO_INTENTS);
  if (hasOwn(body, 'cycleGoalId')) patch.cycleGoalId = optionalNullableId(body, 'cycleGoalId');
  return ensureNonEmptyPatch(patch);
}

function buildFeedbackCreate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, ['source', 'content', 'sentiment']);
  return {
    source: optionalEnum(body, 'source', FEEDBACK_SOURCES) ?? 'Email',
    content: requireString(body, 'content', { max: 8_000, trim: false }),
    sentiment: optionalEnum(body, 'sentiment', FEEDBACK_SENTIMENTS) ?? 'neutral',
    createdAt: nowIso(),
    authorId: actor.ownerUid,
    companyId: actor.companyId ?? null,
  };
}

function buildFeedbackUpdate(body: Record<string, unknown>) {
  assertAllowedKeys(body, ['source', 'content', 'sentiment']);
  const patch: Record<string, unknown> = {};
  if (hasOwn(body, 'source')) patch.source = optionalEnum(body, 'source', FEEDBACK_SOURCES);
  if (hasOwn(body, 'content')) patch.content = requireString(body, 'content', { max: 8_000, trim: false });
  if (hasOwn(body, 'sentiment')) patch.sentiment = optionalEnum(body, 'sentiment', FEEDBACK_SENTIMENTS);
  return ensureNonEmptyPatch(patch);
}

function buildAccountCreate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, ['name', 'website', 'industry', 'size', 'notes', 'status', 'linkedLeadIds']);
  return {
    name: requireString(body, 'name', { max: 200 }),
    website: optionalString(body, 'website', { max: 500 }) ?? '',
    industry: optionalString(body, 'industry', { max: 120 }) ?? '',
    size: optionalString(body, 'size', { max: 120 }) ?? '',
    notes: optionalString(body, 'notes', { max: 8_000, trim: false }) ?? '',
    status: optionalEnum(body, 'status', ACCOUNT_STATUSES) ?? 'prospect',
    linkedLeadIds: optionalUniqueStringArray(body, 'linkedLeadIds') ?? [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    authorId: actor.ownerUid,
    companyId: actor.companyId ?? null,
  };
}

function buildAccountUpdate(body: Record<string, unknown>) {
  assertAllowedKeys(body, ['name', 'website', 'industry', 'size', 'notes', 'status', 'linkedLeadIds']);
  const patch: Record<string, unknown> = {};
  if (hasOwn(body, 'name')) patch.name = requireString(body, 'name', { max: 200 });
  if (hasOwn(body, 'website')) patch.website = optionalString(body, 'website', { max: 500 }) ?? '';
  if (hasOwn(body, 'industry')) patch.industry = optionalString(body, 'industry', { max: 120 }) ?? '';
  if (hasOwn(body, 'size')) patch.size = optionalString(body, 'size', { max: 120 }) ?? '';
  if (hasOwn(body, 'notes')) patch.notes = optionalString(body, 'notes', { max: 8_000, trim: false }) ?? '';
  if (hasOwn(body, 'status')) patch.status = optionalEnum(body, 'status', ACCOUNT_STATUSES);
  if (hasOwn(body, 'linkedLeadIds')) patch.linkedLeadIds = optionalUniqueStringArray(body, 'linkedLeadIds') ?? [];
  patch.updatedAt = nowIso();
  return ensureNonEmptyPatch(patch);
}

function buildLeadCreate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, [
    'name',
    'email',
    'companyName',
    'accountId',
    'source',
    'stage',
    'priority',
    'ownerId',
    'nextAction',
    'nextActionAt',
    'notes',
    'linkedTaskIds',
  ]);
  return {
    name: requireString(body, 'name', { max: 200 }),
    email: optionalEmail(body, 'email') ?? '',
    companyName: optionalString(body, 'companyName', { max: 200 }) ?? '',
    accountId: optionalNullableId(body, 'accountId') ?? null,
    source: optionalEnum(body, 'source', LEAD_SOURCES) ?? 'inbound',
    stage: optionalEnum(body, 'stage', LEAD_STAGES) ?? 'new',
    priority: optionalEnum(body, 'priority', LEAD_PRIORITIES) ?? 'medium',
    ownerId: optionalNullableId(body, 'ownerId') ?? null,
    nextAction: optionalString(body, 'nextAction', { max: 500 }) ?? '',
    nextActionAt: optionalIsoDate(body, 'nextActionAt', { allowNull: true }) ?? null,
    notes: optionalString(body, 'notes', { max: 8_000, trim: false }) ?? '',
    linkedTaskIds: optionalUniqueStringArray(body, 'linkedTaskIds') ?? [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    authorId: actor.ownerUid,
    companyId: actor.companyId ?? null,
  };
}

function buildLeadUpdate(body: Record<string, unknown>) {
  assertAllowedKeys(body, [
    'name',
    'email',
    'companyName',
    'accountId',
    'source',
    'stage',
    'priority',
    'ownerId',
    'nextAction',
    'nextActionAt',
    'notes',
    'linkedTaskIds',
  ]);
  const patch: Record<string, unknown> = {};
  if (hasOwn(body, 'name')) patch.name = requireString(body, 'name', { max: 200 });
  if (hasOwn(body, 'email')) patch.email = optionalEmail(body, 'email') ?? '';
  if (hasOwn(body, 'companyName')) patch.companyName = optionalString(body, 'companyName', { max: 200 }) ?? '';
  if (hasOwn(body, 'accountId')) patch.accountId = optionalNullableId(body, 'accountId') ?? null;
  if (hasOwn(body, 'source')) patch.source = optionalEnum(body, 'source', LEAD_SOURCES);
  if (hasOwn(body, 'stage')) patch.stage = optionalEnum(body, 'stage', LEAD_STAGES);
  if (hasOwn(body, 'priority')) patch.priority = optionalEnum(body, 'priority', LEAD_PRIORITIES);
  if (hasOwn(body, 'ownerId')) patch.ownerId = optionalNullableId(body, 'ownerId') ?? null;
  if (hasOwn(body, 'nextAction')) patch.nextAction = optionalString(body, 'nextAction', { max: 500 }) ?? '';
  if (hasOwn(body, 'nextActionAt')) patch.nextActionAt = optionalIsoDate(body, 'nextActionAt', { allowNull: true }) ?? null;
  if (hasOwn(body, 'notes')) patch.notes = optionalString(body, 'notes', { max: 8_000, trim: false }) ?? '';
  if (hasOwn(body, 'linkedTaskIds')) patch.linkedTaskIds = optionalUniqueStringArray(body, 'linkedTaskIds') ?? [];
  patch.updatedAt = nowIso();
  return ensureNonEmptyPatch(patch);
}

function buildTimeBlockCreate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, ['title', 'type', 'startTime', 'endTime', 'dayOfWeek']);
  return {
    title: requireString(body, 'title', { max: 200 }),
    type: optionalEnum(body, 'type', TIME_BLOCK_TYPES) ?? 'strategic',
    startTime: optionalTimeOfDay(body, 'startTime') ?? requireString(body, 'startTime'),
    endTime: optionalTimeOfDay(body, 'endTime') ?? requireString(body, 'endTime'),
    dayOfWeek: optionalIntegerRange(body, 'dayOfWeek', 0, 6) ?? 1,
    createdAt: nowIso(),
    authorId: actor.ownerUid,
    companyId: actor.companyId ?? null,
  };
}

function buildTimeBlockUpdate(body: Record<string, unknown>) {
  assertAllowedKeys(body, ['title', 'type', 'startTime', 'endTime', 'dayOfWeek']);
  const patch: Record<string, unknown> = {};
  if (hasOwn(body, 'title')) patch.title = requireString(body, 'title', { max: 200 });
  if (hasOwn(body, 'type')) patch.type = optionalEnum(body, 'type', TIME_BLOCK_TYPES);
  if (hasOwn(body, 'startTime')) patch.startTime = optionalTimeOfDay(body, 'startTime');
  if (hasOwn(body, 'endTime')) patch.endTime = optionalTimeOfDay(body, 'endTime');
  if (hasOwn(body, 'dayOfWeek')) patch.dayOfWeek = optionalIntegerRange(body, 'dayOfWeek', 0, 6);
  return ensureNonEmptyPatch(patch);
}

function buildCompanyUpdate(body: Record<string, unknown>) {
  assertAllowedKeys(body, ['name']);
  return ensureNonEmptyPatch({
    name: requireString(body, 'name', { max: 200 }),
  });
}

function buildInvitationCreate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, ['email', 'role']);
  if (!actor.companyId) {
    throw new ApiKeyServerError('Invitations require a company-scoped API key.', 403);
  }

  return {
    email: requireEmail(body, 'email'),
    companyId: actor.companyId,
    role: optionalEnum(body, 'role', MEMBER_ROLES) ?? 'member',
    invitedBy: actor.ownerUid,
    createdAt: nowIso(),
  };
}

async function assertAccessibleTeamChatParticipantIds(actor: AuthorizedApiKeyActor, participantIds: string[]) {
  await Promise.all(
    participantIds.map((participantId) =>
      getResourceById(RESOURCE_CONFIGS['team-chat-participants'], actor, participantId),
    ),
  );
}

function readTeamChatParticipantIds(body: Record<string, unknown>) {
  const participantIds = optionalUniqueStringArray(body, 'participantIds') ?? [];
  if (participantIds.length > 200) {
    throw new ApiKeyServerError('participantIds must contain 200 items or fewer.', 400);
  }
  return participantIds;
}

async function buildTeamChatChannelCreate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, ['name', 'topic', 'status', 'participantIds']);
  const participantIds = readTeamChatParticipantIds(body);
  await assertAccessibleTeamChatParticipantIds(actor, participantIds);
  const now = nowIso();
  return {
    name: requireString(body, 'name', { max: 120 }),
    topic: optionalString(body, 'topic', { max: 500 }) ?? '',
    status: optionalEnum(body, 'status', TEAM_CHAT_CHANNEL_STATUSES) ?? 'active',
    participantIds,
    createdAt: now,
    updatedAt: now,
    authorId: actor.ownerUid,
    companyId: actor.companyId ?? null,
  };
}

async function buildTeamChatChannelUpdate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, ['name', 'topic', 'status', 'participantIds']);
  const patch: Record<string, unknown> = {};
  if (hasOwn(body, 'name')) patch.name = requireString(body, 'name', { max: 120 });
  if (hasOwn(body, 'topic')) patch.topic = optionalString(body, 'topic', { max: 500 }) ?? '';
  if (hasOwn(body, 'status')) patch.status = optionalEnum(body, 'status', TEAM_CHAT_CHANNEL_STATUSES);
  if (hasOwn(body, 'participantIds')) {
    const participantIds = readTeamChatParticipantIds(body);
    await assertAccessibleTeamChatParticipantIds(actor, participantIds);
    patch.participantIds = participantIds;
  }
  patch.updatedAt = nowIso();
  return ensureNonEmptyPatch(patch);
}

function buildTeamChatParticipantCreate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, ['displayName', 'participantType', 'linkedUserId', 'description', 'status']);
  const participantType = optionalEnum(body, 'participantType', TEAM_CHAT_PARTICIPANT_TYPES) ?? 'ai-agent';
  const now = nowIso();
  return {
    displayName: requireString(body, 'displayName', { max: 120 }),
    participantType,
    linkedUserId: participantType === 'team-member' ? optionalNullableId(body, 'linkedUserId') ?? actor.ownerUid : null,
    description: optionalString(body, 'description', { max: 500 }) ?? '',
    status: optionalEnum(body, 'status', TEAM_CHAT_PARTICIPANT_STATUSES) ?? 'active',
    createdAt: now,
    updatedAt: now,
    authorId: actor.ownerUid,
    companyId: actor.companyId ?? null,
  };
}

function buildTeamChatParticipantUpdate(body: Record<string, unknown>) {
  assertAllowedKeys(body, ['displayName', 'linkedUserId', 'description', 'status']);
  const patch: Record<string, unknown> = {};
  if (hasOwn(body, 'displayName')) patch.displayName = requireString(body, 'displayName', { max: 120 });
  if (hasOwn(body, 'linkedUserId')) patch.linkedUserId = optionalNullableId(body, 'linkedUserId') ?? null;
  if (hasOwn(body, 'description')) patch.description = optionalString(body, 'description', { max: 500 }) ?? '';
  if (hasOwn(body, 'status')) patch.status = optionalEnum(body, 'status', TEAM_CHAT_PARTICIPANT_STATUSES);
  patch.updatedAt = nowIso();
  return ensureNonEmptyPatch(patch);
}

async function buildTeamChatMessageCreate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, ['channelId', 'participantId', 'content', 'replyToMessageId']);
  const channelId = requireString(body, 'channelId', { max: 200 });
  const participantId = requireString(body, 'participantId', { max: 200 });
  const channel = await getResourceById(RESOURCE_CONFIGS['team-chat-channels'], actor, channelId);
  const participant = await getResourceById(RESOURCE_CONFIGS['team-chat-participants'], actor, participantId);
  if (!Array.isArray(channel.participantIds) || !channel.participantIds.includes(participantId)) {
    throw new ApiKeyServerError('participantId must be assigned to the channel before posting.', 400);
  }
  if (participant.status !== 'active') {
    throw new ApiKeyServerError('participantId must reference an active identity.', 400);
  }

  const replyToMessageId = optionalNullableId(body, 'replyToMessageId') ?? null;
  if (replyToMessageId) {
    const reply = await getResourceById(RESOURCE_CONFIGS['team-chat-messages'], actor, replyToMessageId);
    if (reply.channelId !== channelId) {
      throw new ApiKeyServerError('replyToMessageId must belong to the same channel.', 400);
    }
  }

  return {
    channelId,
    participantId,
    participantType: participant.participantType,
    senderName: participant.displayName,
    content: requireString(body, 'content', { max: 8_000, trim: false }),
    replyToMessageId,
    createdAt: nowIso(),
    authorId: actor.ownerUid,
    companyId: actor.companyId ?? null,
  };
}

const RESOURCE_CONFIGS: Record<ResourceName, ResourceConfig> = {
  tasks: {
    resource: 'tasks',
    collection: 'tasks',
    readScope: 'workspace:read',
    writeScope: 'workspace:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: true,
    allowUpdate: true,
    allowDelete: true,
    filterFields: ['status', 'cycleGoalId', 'assigneeId', 'isLeadIndicator'],
    sort: createdAtDesc,
    create: buildTaskCreate,
    update: buildTaskUpdate,
  },
  bugs: {
    resource: 'bugs',
    collection: 'bugs',
    readScope: 'workspace:read',
    writeScope: 'workspace:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: true,
    allowUpdate: true,
    allowDelete: true,
    filterFields: ['status', 'severity'],
    sort: updatedAtDesc,
    create: buildBugCreate,
    update: (body, _actor, existing) => buildBugUpdate(body, existing),
  },
  'roadmap-items': {
    resource: 'roadmap-items',
    collection: 'roadmapItems',
    readScope: 'workspace:read',
    writeScope: 'workspace:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: true,
    allowUpdate: true,
    allowDelete: true,
    filterFields: ['phase', 'priority', 'status'],
    sort: updatedAtDesc,
    create: buildRoadmapItemCreate,
    update: (body, _actor, existing) => buildRoadmapItemUpdate(body, existing),
  },
  'blog-articles': {
    resource: 'blog-articles',
    collection: 'blogArticles',
    readScope: 'workspace:read',
    writeScope: 'workspace:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: true,
    allowUpdate: true,
    allowDelete: true,
    filterFields: ['status', 'roadmapPhase', 'priority', 'ownerId'],
    sort: updatedAtDesc,
    create: buildBlogArticleCreate,
    update: (body, actor, existing) => buildBlogArticleUpdate(body, existing),
  },
  'business-plans': {
    resource: 'business-plans',
    collection: 'businessPlans',
    readScope: 'workspace:read',
    writeScope: 'workspace:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: true,
    allowUpdate: true,
    allowDelete: true,
    filterFields: ['status'],
    sort: updatedAtDesc,
    create: buildBusinessPlanCreate,
    update: (body) => buildBusinessPlanUpdate(body),
  },
  visions: {
    resource: 'visions',
    collection: 'visions',
    readScope: 'workspace:read',
    writeScope: 'workspace:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: true,
    allowUpdate: true,
    allowDelete: true,
    sort: createdAtDesc,
    create: buildVisionCreate,
    update: (body) => buildVisionUpdate(body),
  },
  'cycle-goals': {
    resource: 'cycle-goals',
    collection: 'cycleGoals',
    readScope: 'workspace:read',
    writeScope: 'workspace:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: true,
    allowUpdate: true,
    allowDelete: true,
    filterFields: ['status'],
    sort: createdAtDesc,
    create: buildCycleGoalCreate,
    update: (body) => buildCycleGoalUpdate(body),
  },
  prompts: {
    resource: 'prompts',
    collection: 'prompts',
    readScope: 'workspace:read',
    writeScope: 'workspace:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: true,
    allowUpdate: true,
    allowDelete: true,
    sort: createdAtDesc,
    create: buildPromptCreate,
    update: (body) => buildPromptUpdate(body),
  },
  'api-endpoints': {
    resource: 'api-endpoints',
    collection: 'apiEndpoints',
    readScope: 'systems:read',
    writeScope: 'systems:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: true,
    allowUpdate: true,
    allowDelete: true,
    filterFields: ['method', 'status'],
    sort: createdAtDesc,
    create: buildApiEndpointCreate,
    update: (body) => buildApiEndpointUpdate(body),
  },
  environments: {
    resource: 'environments',
    collection: 'environments',
    readScope: 'systems:read',
    writeScope: 'systems:write',
    scopeMode: 'companyOrNull',
    allowList: true,
    allowGet: true,
    allowCreate: false,
    allowUpdate: true,
    allowDelete: false,
    filterFields: ['name', 'status'],
    sort: createdAtDesc,
    update: (body) => buildEnvironmentUpdate(body),
  },
  'social-posts': {
    resource: 'social-posts',
    collection: 'socialPosts',
    readScope: 'workspace:read',
    writeScope: 'workspace:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: true,
    allowUpdate: true,
    allowDelete: true,
    filterFields: ['platform', 'status'],
    sort: scheduledAtDesc,
    create: buildSocialPostCreate,
    update: (body) => buildSocialPostUpdate(body),
  },
  'creative-items': {
    resource: 'creative-items',
    collection: 'creativeItems',
    readScope: 'workspace:read',
    writeScope: 'workspace:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: true,
    allowUpdate: true,
    allowDelete: true,
    requireCompanyAdminForWrite: true,
    filterFields: ['platform', 'format', 'status', 'ownerId', 'campaign'],
    sort: updatedAtDesc,
    create: buildCreativeItemCreate,
    update: buildCreativeItemUpdate,
  },
  'creative-assets': {
    resource: 'creative-assets',
    collection: 'creativeAssets',
    readScope: 'workspace:read',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: false,
    allowUpdate: false,
    allowDelete: false,
    filterFields: ['creativeId', 'assetType', 'status'],
    sort: updatedAtDesc,
  },
  'seo-keywords': {
    resource: 'seo-keywords',
    collection: 'seoKeywords',
    readScope: 'workspace:read',
    writeScope: 'workspace:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: true,
    allowUpdate: true,
    allowDelete: true,
    filterFields: ['intent', 'cycleGoalId'],
    sort: createdAtDesc,
    create: buildSeoKeywordCreate,
    update: (body) => buildSeoKeywordUpdate(body),
  },
  feedbacks: {
    resource: 'feedbacks',
    collection: 'feedbacks',
    readScope: 'workspace:read',
    writeScope: 'workspace:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: true,
    allowUpdate: true,
    allowDelete: true,
    filterFields: ['source', 'sentiment'],
    sort: createdAtDesc,
    create: buildFeedbackCreate,
    update: (body) => buildFeedbackUpdate(body),
  },
  accounts: {
    resource: 'accounts',
    collection: 'accounts',
    readScope: 'workspace:read',
    writeScope: 'workspace:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: true,
    allowUpdate: true,
    allowDelete: true,
    filterFields: ['status'],
    sort: updatedAtDesc,
    create: buildAccountCreate,
    update: (body) => buildAccountUpdate(body),
  },
  leads: {
    resource: 'leads',
    collection: 'leads',
    readScope: 'workspace:read',
    writeScope: 'workspace:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: true,
    allowUpdate: true,
    allowDelete: true,
    filterFields: ['stage', 'source', 'priority', 'ownerId', 'accountId'],
    sort: updatedAtDesc,
    create: buildLeadCreate,
    update: (body) => buildLeadUpdate(body),
  },
  'time-blocks': {
    resource: 'time-blocks',
    collection: 'timeBlocks',
    readScope: 'workspace:read',
    writeScope: 'workspace:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: true,
    allowUpdate: true,
    allowDelete: true,
    filterFields: ['type', 'dayOfWeek'],
    sort: timeBlockSort,
    create: buildTimeBlockCreate,
    update: (body) => buildTimeBlockUpdate(body),
  },
  'team-chat-channels': {
    resource: 'team-chat-channels',
    collection: 'teamChatChannels',
    readScope: 'workspace:read',
    writeScope: 'workspace:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: true,
    allowUpdate: true,
    allowDelete: true,
    filterFields: ['status'],
    sort: updatedAtDesc,
    create: buildTeamChatChannelCreate,
    update: (body, actor) => buildTeamChatChannelUpdate(body, actor),
  },
  'team-chat-participants': {
    resource: 'team-chat-participants',
    collection: 'teamChatParticipants',
    readScope: 'workspace:read',
    writeScope: 'workspace:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: true,
    allowUpdate: true,
    allowDelete: true,
    filterFields: ['participantType', 'status', 'linkedUserId'],
    sort: updatedAtDesc,
    create: buildTeamChatParticipantCreate,
    update: (body) => buildTeamChatParticipantUpdate(body),
  },
  'team-chat-messages': {
    resource: 'team-chat-messages',
    collection: 'teamChatMessages',
    readScope: 'workspace:read',
    writeScope: 'workspace:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: true,
    allowUpdate: false,
    allowDelete: false,
    filterFields: ['channelId', 'participantId', 'participantType', 'senderName'],
    sort: createdAtDesc,
    create: buildTeamChatMessageCreate,
  },
  'context-sources': {
    resource: 'context-sources',
    collection: 'contextSources',
    readScope: 'systems:read',
    writeScope: 'systems:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: false,
    allowUpdate: false,
    allowDelete: true,
    filterFields: ['status', 'sourceKey'],
    sort: sourceUpdatedDesc,
  },
  'context-source-versions': {
    resource: 'context-source-versions',
    collection: 'contextSourceVersions',
    readScope: 'systems:read',
    writeScope: 'systems:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: false,
    allowUpdate: false,
    allowDelete: true,
    filterFields: ['sourceId', 'sourceKey', 'status'],
    listOmitFields: ['fullContent'],
    sort: versionDesc,
  },
  'operator-desks': {
    resource: 'operator-desks',
    collection: 'operatorDesks',
    readScope: 'workspace:read',
    writeScope: 'workspace:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: true,
    allowUpdate: true,
    allowDelete: false,
    filterFields: ['slug', 'status', 'type'],
    sort: createdAtDesc,
    create: buildOperatorDeskCreate,
    update: buildOperatorDeskUpdate,
  },
  'operator-work-orders': {
    resource: 'operator-work-orders',
    collection: 'operatorWorkOrders',
    readScope: 'workspace:read',
    writeScope: 'workspace:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: true,
    allowUpdate: true,
    allowDelete: false,
    filterFields: ['operatorDeskId', 'status', 'priority', 'claimedBy'],
    sort: createdAtDesc,
    create: buildOperatorWorkOrderCreate,
    update: buildOperatorWorkOrderUpdate,
  },
  'operator-context-packs': {
    resource: 'operator-context-packs',
    collection: 'operatorContextPacks',
    readScope: 'workspace:read',
    writeScope: 'workspace:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: true,
    allowUpdate: false,
    allowDelete: true,
    filterFields: ['scope', 'scopeId'],
    sort: createdAtDesc,
    create: buildOperatorContextPackCreate,
  },
  'operator-memories': {
    resource: 'operator-memories',
    collection: 'operatorMemories',
    readScope: 'workspace:read',
    writeScope: 'workspace:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: true,
    allowUpdate: true,
    allowDelete: false,
    filterFields: ['scope', 'scopeId', 'state', 'memoryType'],
    sort: createdAtDesc,
    create: buildOperatorMemoryCreate,
    update: buildOperatorMemoryUpdate,
  },
  'operator-checkins': {
    resource: 'operator-checkins',
    collection: 'operatorCheckins',
    readScope: 'workspace:read',
    writeScope: 'workspace:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: true,
    allowUpdate: false,
    allowDelete: false,
    filterFields: ['operatorDeskId', 'workOrderId', 'externalAgentName', 'type'],
    sort: createdAtDesc,
    create: buildOperatorCheckinCreate,
  },
  'operator-outputs': {
    resource: 'operator-outputs',
    collection: 'operatorOutputs',
    readScope: 'workspace:read',
    writeScope: 'workspace:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: true,
    allowUpdate: false,
    allowDelete: false,
    filterFields: ['operatorDeskId', 'workOrderId', 'externalAgentName', 'outputType', 'status'],
    sort: createdAtDesc,
    create: buildOperatorOutputCreate,
  },
  'operator-injections': {
    resource: 'operator-injections',
    collection: 'operatorInjections',
    readScope: 'workspace:read',
    writeScope: 'workspace:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: false,
    allowUpdate: false,
    allowDelete: false,
    filterFields: ['outputId', 'targetHub', 'status', 'riskLevel'],
    sort: createdAtDesc,
  },
  'operator-approvals': {
    resource: 'operator-approvals',
    collection: 'operatorApprovals',
    readScope: 'workspace:read',
    writeScope: 'workspace:write',
    scopeMode: 'companyOrAuthor',
    allowList: true,
    allowGet: true,
    allowCreate: false,
    allowUpdate: true,
    allowDelete: false,
    filterFields: ['operatorDeskId', 'workOrderId', 'outputId', 'status', 'riskLevel'],
    sort: createdAtDesc,
    update: buildOperatorApprovalUpdate,
  },
  users: {
    resource: 'users',
    collection: 'users',
    readScope: 'identity:read',
    scopeMode: 'companyMembers',
    allowList: true,
    allowGet: true,
    allowCreate: false,
    allowUpdate: false,
    allowDelete: false,
    filterFields: ['role', 'companyId'],
    sort: createdAtDesc,
  },
  companies: {
    resource: 'companies',
    collection: 'companies',
    readScope: 'identity:read',
    writeScope: 'identity:write',
    scopeMode: 'currentCompany',
    allowList: true,
    allowGet: true,
    allowCreate: false,
    allowUpdate: true,
    allowDelete: false,
    requireCompanyAdminForWrite: true,
    sort: createdAtDesc,
    update: (body) => buildCompanyUpdate(body),
  },
  invitations: {
    resource: 'invitations',
    collection: 'invitations',
    readScope: 'identity:read',
    writeScope: 'identity:write',
    scopeMode: 'companyOnly',
    allowList: true,
    allowGet: true,
    allowCreate: true,
    allowUpdate: false,
    allowDelete: true,
    requireCompanyAdminForWrite: true,
    filterFields: ['email', 'role'],
    sort: createdAtDesc,
    create: buildInvitationCreate,
  },
};

function assertCompanyAdmin(actor: AuthorizedApiKeyActor) {
  if (actor.companyId && actor.ownerRole !== 'admin') {
    throw new ApiKeyServerError('This API key no longer has company admin access.', 403);
  }
}

function getScopedQuery(collectionName: string, scopeMode: ScopeMode, actor: AuthorizedApiKeyActor) {
  const collection = getAdminFirestore().collection(collectionName);

  switch (scopeMode) {
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
    default:
      return collection.where(FieldPath.documentId(), '==', '__never__');
  }
}

function canAccessDocument(scopeMode: ScopeMode, id: string, data: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  switch (scopeMode) {
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
    default:
      return false;
  }
}

function serializeSnapshot(id: string, data: Record<string, unknown>): LinkedDoc {
  return {
    id,
    ...data,
  };
}

function omitFields(item: LinkedDoc, fields: readonly string[] | undefined): LinkedDoc {
  if (!fields?.length) return item;
  const result = { ...item };
  for (const field of fields) delete result[field];
  return result;
}

function applyFilters(items: LinkedDoc[], searchParams: URLSearchParams, fields: readonly string[] | undefined) {
  if (!fields?.length) {
    return items;
  }

  return items.filter((item) =>
    fields.every((field) => {
      const filterValues = searchParams.getAll(field);
      if (filterValues.length === 0) {
        return true;
      }

      const fieldValue = item[field];
      const normalizedFieldValue =
        typeof fieldValue === 'boolean' ? String(fieldValue) : fieldValue == null ? 'null' : String(fieldValue);

      return filterValues.includes(normalizedFieldValue);
    }),
  );
}

async function listResource(config: ResourceConfig, actor: AuthorizedApiKeyActor, searchParams: URLSearchParams) {
  const snapshot = await getScopedQuery(config.collection, config.scopeMode, actor).get();
  let items: LinkedDoc[] = snapshot.docs.map((doc) =>
    omitFields(serializeSnapshot(doc.id, asRecord(doc.data())), config.listOmitFields),
  );

  items = applyFilters(items, searchParams, config.filterFields);
  if (config.resource === 'operator-memories' && searchParams.getAll('state').length === 0) {
    items = items.filter((item) => !['archived', 'rejected', 'expired'].includes(String(item.state || '')));
  }
  if (config.sort) {
    items = items.sort(config.sort);
  }

  const limit = searchParams.get('limit');
  if (limit) {
    const parsedLimit = Number.parseInt(limit, 10);
    if (!Number.isNaN(parsedLimit) && parsedLimit > 0) {
      items = items.slice(0, Math.min(parsedLimit, 500));
    }
  }

  return {
    data: items,
    count: items.length,
  };
}

function parseTeamChatLimit(value: string | null) {
  const parsed = value ? Number.parseInt(value, 10) : 50;
  return Number.isNaN(parsed) || parsed <= 0 ? 50 : Math.min(parsed, 200);
}

async function listTeamChatMessages(actor: AuthorizedApiKeyActor, searchParams: URLSearchParams) {
  const snapshot = await getScopedQuery('teamChatMessages', 'companyOrAuthor', actor).get();
  let items = snapshot.docs.map((doc) => serializeSnapshot(doc.id, asRecord(doc.data())));
  items = applyFilters(items, searchParams, ['channelId', 'participantId', 'participantType', 'senderName']);

  const after = searchParams.get('after');
  const before = searchParams.get('before');
  const queryText = searchParams.get('query')?.trim().toLowerCase();
  if (after && Number.isNaN(Date.parse(after))) throw new ApiKeyServerError('after must be a valid ISO-8601 string.', 400);
  if (before && Number.isNaN(Date.parse(before))) throw new ApiKeyServerError('before must be a valid ISO-8601 string.', 400);
  if (after && before && Date.parse(after) >= Date.parse(before)) {
    throw new ApiKeyServerError('after must be earlier than before.', 400);
  }

  items = items
    .filter((item) => typeof item.createdAt === 'string')
    .filter((item) => !after || String(item.createdAt) > new Date(after).toISOString())
    .filter((item) => !before || String(item.createdAt) < new Date(before).toISOString())
    .filter((item) => !queryText || `${item.senderName || ''} ${item.content || ''}`.toLowerCase().includes(queryText))
    .sort(createdAtDesc);

  const limit = parseTeamChatLimit(searchParams.get('limit'));
  const page = items.slice(0, limit);
  return {
    data: page,
    count: page.length,
    hasMore: items.length > page.length,
    nextBefore: items.length > page.length ? page[page.length - 1]?.createdAt ?? null : null,
    filters: {
      channelId: searchParams.get('channelId'),
      participantId: searchParams.get('participantId'),
      participantType: searchParams.get('participantType'),
      senderName: searchParams.get('senderName'),
      after,
      before,
      query: searchParams.get('query'),
      limit,
    },
  };
}

async function addTeamChatParticipantToChannel(actor: AuthorizedApiKeyActor, channelId: string, body: unknown) {
  const input = expectObject(body);
  assertAllowedKeys(input, ['participantId']);
  const participantId = requireString(input, 'participantId', { max: 200 });
  const channel = await getResourceById(RESOURCE_CONFIGS['team-chat-channels'], actor, channelId);
  await getResourceById(RESOURCE_CONFIGS['team-chat-participants'], actor, participantId);
  if (channel.status !== 'active') {
    throw new ApiKeyServerError('Participants can only be added to active channels.', 400);
  }

  const ref = getAdminFirestore().collection('teamChatChannels').doc(channelId);
  await ref.update({
    participantIds: FieldValue.arrayUnion(participantId),
    updatedAt: nowIso(),
  });
  const updated = await ref.get();
  return {
    data: serializeSnapshot(updated.id, asRecord(updated.data())),
  };
}

function actorScope(actor: AuthorizedApiKeyActor) {
  return actor.companyId ? { companyId: actor.companyId } : {};
}

function actorOwnedBase(actor: AuthorizedApiKeyActor) {
  return {
    authorId: actor.ownerUid,
    ...actorScope(actor),
  };
}

function operatorSlug(value: string) {
  const slug = normalizeOperatorKey(value);
  if (!slug) throw new ApiKeyServerError('slug must contain at least one letter or number.', 400);
  if (slug.length > 120) throw new ApiKeyServerError('slug must be 120 characters or fewer.', 400);
  return slug;
}

function assertActiveOperatorDesk(desk: Record<string, unknown>) {
  if (desk.status === 'archived') {
    throw new ApiKeyServerError('Archived Operator Desks cannot be run or mutated through MCP.', 409);
  }
}

function assertGlobalMemoryWriteAllowed(actor: AuthorizedApiKeyActor, scope: string) {
  if (scope === 'global' && actor.companyId && actor.ownerRole !== 'admin') {
    throw new ApiKeyServerError('Writing global Operator Memory requires company admin permission.', 403, ['workspace:write']);
  }
}

async function assertOperatorDeskSlugAvailable(actor: AuthorizedApiKeyActor, slug: string, excludeId?: string) {
  const snapshot = await getScopedQuery('operatorDesks', 'companyOrAuthor', actor).get();
  const duplicate = snapshot.docs
    .map((doc) => serializeSnapshot(doc.id, asRecord(doc.data())))
    .find((desk) => desk.id !== excludeId && desk.slug === slug && desk.status !== 'archived');
  if (duplicate) {
    throw new ApiKeyServerError(`Operator Desk slug "${slug}" already exists in this workspace.`, 409);
  }
}

async function assertOperatorMemoryScope(actor: AuthorizedApiKeyActor, scope: string, scopeId: string | null) {
  assertGlobalMemoryWriteAllowed(actor, scope);
  if (scope === 'operator') {
    if (!scopeId) throw new ApiKeyServerError('scopeId is required for operator-scoped memory.', 400);
    const desk = await getResourceById(RESOURCE_CONFIGS['operator-desks'], actor, scopeId);
    assertActiveOperatorDesk(desk);
  }
}

async function assertOperatorMemoryDuplicateFree(
  actor: AuthorizedApiKeyActor,
  scope: string,
  scopeId: string | null,
  content: string,
  excludeId?: string,
) {
  const normalizedContent = normalizeKey(content);
  if (!normalizedContent) return;
  const snapshot = await getScopedQuery('operatorMemories', 'companyOrAuthor', actor).get();
  const duplicate = snapshot.docs
    .map((doc) => serializeSnapshot(doc.id, asRecord(doc.data())))
    .find((memory) =>
      memory.id !== excludeId &&
      memory.scope === scope &&
      (memory.scopeId ?? null) === scopeId &&
      !['archived', 'rejected', 'expired'].includes(String(memory.state || '')) &&
      normalizeKey(String(memory.content || '')) === normalizedContent
    );
  if (duplicate) {
    throw new ApiKeyServerError('An active Operator Memory with the same scope and content already exists.', 409);
  }
}

async function writeOperatorAuditLog(actor: AuthorizedApiKeyActor, action: string, details: Record<string, unknown>) {
  const timestamp = nowIso();
  await getAdminFirestore().collection('operatorAuditLogs').doc().set({
    action,
    details,
    actorUid: actor.ownerUid,
    actorEmail: actor.ownerEmail,
    apiKeyId: actor.key.id,
    companyId: actor.companyId ?? null,
    createdAt: timestamp,
  });
}

function optionalUnknownArray(input: Record<string, unknown>, key: string) {
  if (!hasOwn(input, key)) return undefined;
  const value = input[key];
  if (!Array.isArray(value)) throw new ApiKeyServerError(`${key} must be an array.`, 400);
  return value;
}

async function buildOperatorDeskCreate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, ['name', 'slug', 'type', 'mission', 'defaultCheckFrequency', 'status', 'connectedExternalAgents', 'allowedSources', 'allowedOutputTypes', 'approvalMode', 'routingRules', 'dangerousActionRules']);
  const name = requireString(body, 'name', { max: 160 });
  const slug = operatorSlug(optionalString(body, 'slug', { max: 120 }) || name);
  await assertOperatorDeskSlugAvailable(actor, slug);
  const allowedOutputTypes = optionalStringArray(body, 'allowedOutputTypes') || ['execution_task', 'risk_note', 'memory_suggestion'];
  const timestamp = nowIso();
  return {
    name,
    slug,
    type: optionalEnum(body, 'type', OPERATOR_DESK_TYPES) || 'ops',
    mission: requireString(body, 'mission', { max: 8_000 }),
    defaultCheckFrequency: optionalEnum(body, 'defaultCheckFrequency', OPERATOR_CHECK_FREQUENCIES) || 'manual',
    status: optionalEnum(body, 'status', OPERATOR_DESK_STATUSES) || 'active',
    connectedExternalAgents: optionalStringArray(body, 'connectedExternalAgents') || [],
    allowedSources: optionalStringArray(body, 'allowedSources') || [],
    allowedOutputTypes,
    approvalMode: optionalEnum(body, 'approvalMode', OPERATOR_APPROVAL_MODES) || 'action_based',
    routingRules: isRecord(body.routingRules) ? body.routingRules : buildRoutingRules(allowedOutputTypes as any),
    dangerousActionRules: optionalStringArray(body, 'dangerousActionRules') || DANGEROUS_ACTION_RULES,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...actorOwnedBase(actor),
  };
}

async function buildOperatorDeskUpdate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor, existing: Record<string, unknown>, id: string) {
  assertAllowedKeys(body, ['name', 'type', 'mission', 'defaultCheckFrequency', 'status', 'connectedExternalAgents', 'allowedSources', 'allowedOutputTypes', 'approvalMode', 'routingRules', 'dangerousActionRules']);
  if (existing.status === 'archived' && body.status !== 'active') {
    throw new ApiKeyServerError('Archived Operator Desks can only be restored before other edits are applied.', 409);
  }

  const patch: Record<string, unknown> = {};
  if (hasOwn(body, 'name')) patch.name = requireString(body, 'name', { max: 160 });
  if (hasOwn(body, 'type')) patch.type = optionalEnum(body, 'type', OPERATOR_DESK_TYPES);
  if (hasOwn(body, 'mission')) patch.mission = requireString(body, 'mission', { max: 8_000 });
  if (hasOwn(body, 'defaultCheckFrequency')) patch.defaultCheckFrequency = optionalEnum(body, 'defaultCheckFrequency', OPERATOR_CHECK_FREQUENCIES);
  if (hasOwn(body, 'status')) patch.status = optionalEnum(body, 'status', OPERATOR_DESK_STATUSES);
  if (hasOwn(body, 'connectedExternalAgents')) patch.connectedExternalAgents = optionalStringArray(body, 'connectedExternalAgents') || [];
  if (hasOwn(body, 'allowedSources')) patch.allowedSources = optionalStringArray(body, 'allowedSources') || [];
  if (hasOwn(body, 'allowedOutputTypes')) {
    const allowedOutputTypes = optionalStringArray(body, 'allowedOutputTypes') || [];
    patch.allowedOutputTypes = allowedOutputTypes;
    if (!hasOwn(body, 'routingRules')) patch.routingRules = buildRoutingRules(allowedOutputTypes as any);
  }
  if (hasOwn(body, 'approvalMode')) patch.approvalMode = optionalEnum(body, 'approvalMode', OPERATOR_APPROVAL_MODES);
  if (hasOwn(body, 'routingRules')) {
    if (!isRecord(body.routingRules)) throw new ApiKeyServerError('routingRules must be an object.', 400);
    patch.routingRules = body.routingRules;
  }
  if (hasOwn(body, 'dangerousActionRules')) patch.dangerousActionRules = optionalStringArray(body, 'dangerousActionRules') || [];
  patch.updatedAt = nowIso();

  if (patch.status === 'active') {
    await assertOperatorDeskSlugAvailable(actor, String(existing.slug || id), id);
  }
  return ensureNonEmptyPatch(patch);
}

async function buildOperatorMemoryCreate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, ['scope', 'scopeId', 'memoryType', 'state', 'content', 'confidence', 'sourceCheckInId', 'sourceOutputId', 'expiresAt', 'pinned', 'source', 'sourceMetadata']);
  const scope = optionalEnum(body, 'scope', OPERATOR_MEMORY_SCOPES) || 'operator';
  const scopeId = optionalString(body, 'scopeId', { max: 200, allowNull: true }) || null;
  const state = optionalEnum(body, 'state', OPERATOR_MEMORY_STATES) || 'active';
  const content = requireString(body, 'content', { max: 8_000 });
  await assertOperatorMemoryScope(actor, scope, scopeId);
  await assertOperatorMemoryDuplicateFree(actor, scope, scopeId, content);
  const timestamp = nowIso();
  return {
    scope,
    scopeId,
    memoryType: optionalEnum(body, 'memoryType', OPERATOR_MEMORY_TYPES) || 'lesson',
    state,
    content,
    confidence: optionalEnum(body, 'confidence', OPERATOR_MEMORY_CONFIDENCE) || 'medium',
    sourceCheckInId: optionalString(body, 'sourceCheckInId', { max: 200, allowNull: true }) || null,
    sourceOutputId: optionalString(body, 'sourceOutputId', { max: 200, allowNull: true }) || null,
    pinned: optionalBoolean(body, 'pinned') || state === 'pinned',
    expiresAt: optionalString(body, 'expiresAt', { max: 80, allowNull: true }) || null,
    source: optionalString(body, 'source', { max: 80 }) || 'api',
    sourceMetadata: isRecord(body.sourceMetadata) ? body.sourceMetadata : {},
    createdAt: timestamp,
    updatedAt: timestamp,
    lastUsedAt: null,
    usedCount: 0,
    ...actorOwnedBase(actor),
  };
}

async function buildOperatorMemoryUpdate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor, existing: Record<string, unknown>, id: string) {
  assertAllowedKeys(body, ['scope', 'scopeId', 'memoryType', 'state', 'content', 'confidence', 'sourceCheckInId', 'sourceOutputId', 'expiresAt', 'pinned', 'sourceMetadata']);
  const nextScope = hasOwn(body, 'scope') ? optionalEnum(body, 'scope', OPERATOR_MEMORY_SCOPES) || 'operator' : String(existing.scope || 'operator');
  const nextScopeId = hasOwn(body, 'scopeId')
    ? optionalString(body, 'scopeId', { max: 200, allowNull: true }) || null
    : (typeof existing.scopeId === 'string' ? existing.scopeId : null);
  const nextContent = hasOwn(body, 'content') ? requireString(body, 'content', { max: 8_000 }) : String(existing.content || '');
  await assertOperatorMemoryScope(actor, nextScope, nextScopeId);
  await assertOperatorMemoryDuplicateFree(actor, nextScope, nextScopeId, nextContent, id);

  const patch: Record<string, unknown> = {};
  if (hasOwn(body, 'scope')) patch.scope = nextScope;
  if (hasOwn(body, 'scopeId')) patch.scopeId = nextScopeId;
  if (hasOwn(body, 'memoryType')) patch.memoryType = optionalEnum(body, 'memoryType', OPERATOR_MEMORY_TYPES);
  if (hasOwn(body, 'state')) patch.state = optionalEnum(body, 'state', OPERATOR_MEMORY_STATES);
  if (hasOwn(body, 'content')) patch.content = nextContent;
  if (hasOwn(body, 'confidence')) patch.confidence = optionalEnum(body, 'confidence', OPERATOR_MEMORY_CONFIDENCE);
  if (hasOwn(body, 'sourceCheckInId')) patch.sourceCheckInId = optionalString(body, 'sourceCheckInId', { max: 200, allowNull: true }) || null;
  if (hasOwn(body, 'sourceOutputId')) patch.sourceOutputId = optionalString(body, 'sourceOutputId', { max: 200, allowNull: true }) || null;
  if (hasOwn(body, 'expiresAt')) patch.expiresAt = optionalString(body, 'expiresAt', { max: 80, allowNull: true }) || null;
  if (hasOwn(body, 'pinned')) patch.pinned = optionalBoolean(body, 'pinned');
  if (hasOwn(body, 'sourceMetadata')) {
    if (!isRecord(body.sourceMetadata)) throw new ApiKeyServerError('sourceMetadata must be an object.', 400);
    patch.sourceMetadata = body.sourceMetadata;
  }
  if (patch.state === 'pinned') patch.pinned = true;
  if (patch.state === 'active' && existing.state === 'archived') patch.restoredAt = nowIso();
  if (patch.state === 'archived') patch.archivedAt = nowIso();
  patch.updatedAt = nowIso();
  return ensureNonEmptyPatch(patch);
}

function buildOperatorWorkOrderCreate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, ['operatorDeskId', 'title', 'brief', 'status', 'priority', 'contextPackIds', 'expectedOutputTypes', 'approvalMode', 'claimPolicy', 'assignedExternalAgent', 'availableFrom', 'dueAt']);
  const timestamp = nowIso();
  return {
    operatorDeskId: requireString(body, 'operatorDeskId', { max: 200 }),
    title: requireString(body, 'title', { max: 240 }),
    brief: requireString(body, 'brief', { max: 8000 }),
    status: optionalEnum(body, 'status', OPERATOR_WORK_ORDER_STATUSES) || 'ready',
    priority: optionalEnum(body, 'priority', OPERATOR_PRIORITIES) || 'medium',
    contextPackIds: optionalStringArray(body, 'contextPackIds') || [],
    expectedOutputTypes: optionalStringArray(body, 'expectedOutputTypes') || [],
    approvalMode: optionalEnum(body, 'approvalMode', OPERATOR_APPROVAL_MODES) || 'action_based',
    claimPolicy: optionalEnum(body, 'claimPolicy', OPERATOR_CLAIM_POLICIES) || 'single_agent',
    assignedExternalAgent: optionalString(body, 'assignedExternalAgent', { max: 200, allowNull: true }) || null,
    claimedBy: null,
    claimedAt: null,
    availableFrom: optionalString(body, 'availableFrom', { max: 80, allowNull: true }) || null,
    dueAt: optionalString(body, 'dueAt', { max: 80, allowNull: true }) || null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...actorOwnedBase(actor),
  };
}

function buildOperatorWorkOrderUpdate(body: Record<string, unknown>) {
  assertAllowedKeys(body, ['title', 'brief', 'status', 'priority', 'contextPackIds', 'expectedOutputTypes', 'approvalMode', 'claimPolicy', 'assignedExternalAgent', 'claimedBy', 'claimedAt', 'availableFrom', 'dueAt']);
  const patch: Record<string, unknown> = { updatedAt: nowIso() };
  if (hasOwn(body, 'title')) patch.title = requireString(body, 'title', { max: 240 });
  if (hasOwn(body, 'brief')) patch.brief = requireString(body, 'brief', { max: 8000 });
  if (hasOwn(body, 'status')) patch.status = optionalEnum(body, 'status', OPERATOR_WORK_ORDER_STATUSES);
  if (hasOwn(body, 'priority')) patch.priority = optionalEnum(body, 'priority', OPERATOR_PRIORITIES);
  if (hasOwn(body, 'contextPackIds')) patch.contextPackIds = optionalStringArray(body, 'contextPackIds') || [];
  if (hasOwn(body, 'expectedOutputTypes')) patch.expectedOutputTypes = optionalStringArray(body, 'expectedOutputTypes') || [];
  if (hasOwn(body, 'approvalMode')) patch.approvalMode = optionalEnum(body, 'approvalMode', OPERATOR_APPROVAL_MODES);
  if (hasOwn(body, 'claimPolicy')) patch.claimPolicy = optionalEnum(body, 'claimPolicy', OPERATOR_CLAIM_POLICIES);
  if (hasOwn(body, 'assignedExternalAgent')) patch.assignedExternalAgent = optionalString(body, 'assignedExternalAgent', { max: 200, allowNull: true });
  if (hasOwn(body, 'claimedBy')) patch.claimedBy = optionalString(body, 'claimedBy', { max: 200, allowNull: true });
  if (hasOwn(body, 'claimedAt')) patch.claimedAt = optionalString(body, 'claimedAt', { max: 80, allowNull: true });
  if (hasOwn(body, 'availableFrom')) patch.availableFrom = optionalString(body, 'availableFrom', { max: 80, allowNull: true });
  if (hasOwn(body, 'dueAt')) patch.dueAt = optionalString(body, 'dueAt', { max: 80, allowNull: true });
  return patch;
}

function buildOperatorContextPackCreate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, ['title', 'description', 'scope', 'scopeId', 'sourceIds', 'sourceSnapshots', 'instructions', 'constraints', 'expectedUse']);
  const timestamp = nowIso();
  return {
    title: requireString(body, 'title', { max: 240 }),
    description: requireString(body, 'description', { max: 4000 }),
    scope: optionalString(body, 'scope', { max: 80 }) || 'global',
    scopeId: optionalString(body, 'scopeId', { max: 200, allowNull: true }) || null,
    sourceIds: optionalStringArray(body, 'sourceIds') || [],
    sourceSnapshots: optionalUnknownArray(body, 'sourceSnapshots') || [],
    instructions: optionalString(body, 'instructions', { max: 8000 }) || '',
    constraints: optionalStringArray(body, 'constraints') || [],
    expectedUse: optionalString(body, 'expectedUse', { max: 2000 }) || '',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...actorOwnedBase(actor),
  };
}

function buildOperatorMemorySuggestionCreate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, ['scope', 'scopeId', 'memoryType', 'content', 'confidence', 'sourceCheckInId', 'sourceOutputId', 'expiresAt']);
  const timestamp = nowIso();
  return {
    scope: optionalEnum(body, 'scope', OPERATOR_MEMORY_SCOPES) || 'operator',
    scopeId: optionalString(body, 'scopeId', { max: 200, allowNull: true }) || null,
    memoryType: optionalEnum(body, 'memoryType', OPERATOR_MEMORY_TYPES) || 'lesson',
    state: 'suggested',
    content: requireString(body, 'content', { max: 8000 }),
    confidence: optionalEnum(body, 'confidence', OPERATOR_MEMORY_CONFIDENCE) || 'medium',
    sourceCheckInId: optionalString(body, 'sourceCheckInId', { max: 200, allowNull: true }) || null,
    sourceOutputId: optionalString(body, 'sourceOutputId', { max: 200, allowNull: true }) || null,
    pinned: false,
    expiresAt: optionalString(body, 'expiresAt', { max: 80, allowNull: true }) || null,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastUsedAt: null,
    usedCount: 0,
    ...actorOwnedBase(actor),
  };
}

function buildOperatorCheckinCreate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, ['operatorDeskId', 'workOrderId', 'externalAgentName', 'externalAgentProvider', 'type', 'summary', 'payload']);
  return {
    operatorDeskId: requireString(body, 'operatorDeskId', { max: 200 }),
    workOrderId: optionalString(body, 'workOrderId', { max: 200, allowNull: true }) || null,
    externalAgentName: requireString(body, 'externalAgentName', { max: 200 }),
    externalAgentProvider: optionalString(body, 'externalAgentProvider', { max: 200, allowNull: true }) || null,
    type: optionalEnum(body, 'type', OPERATOR_CHECKIN_TYPES) || 'manifest_requested',
    summary: requireString(body, 'summary', { max: 4000 }),
    payload: asRecord(body.payload),
    createdAt: nowIso(),
    ...actorOwnedBase(actor),
  };
}

function buildOperatorOutputCreate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, ['operatorDeskId', 'workOrderId', 'externalAgentName', 'outputType', 'title', 'summary', 'content', 'structuredPayload', 'suggestedDestinations', 'sourceReferences', 'memorySuggestions', 'confidence']);
  const timestamp = nowIso();
  const outputType = optionalEnum(body, 'outputType', OPERATOR_OUTPUT_TYPES) || 'execution_task';
  return {
    operatorDeskId: requireString(body, 'operatorDeskId', { max: 200 }),
    workOrderId: optionalString(body, 'workOrderId', { max: 200, allowNull: true }) || null,
    externalAgentName: requireString(body, 'externalAgentName', { max: 200 }),
    outputType,
    title: requireString(body, 'title', { max: 240 }),
    summary: requireString(body, 'summary', { max: 4000 }),
    content: requireString(body, 'content', { max: 50000, trim: false }),
    structuredPayload: asRecord(body.structuredPayload),
    suggestedDestinations: optionalStringArray(body, 'suggestedDestinations') || (OUTPUT_ROUTING[outputType] || []),
    sourceReferences: optionalUnknownArray(body, 'sourceReferences') || [],
    memorySuggestions: optionalUnknownArray(body, 'memorySuggestions') || [],
    confidence: optionalEnum(body, 'confidence', OPERATOR_MEMORY_CONFIDENCE) || 'medium',
    status: 'submitted',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...actorOwnedBase(actor),
  };
}

function buildOperatorApprovalUpdate(body: Record<string, unknown>, actor: AuthorizedApiKeyActor) {
  assertAllowedKeys(body, ['status', 'summary']);
  const status = optionalEnum(body, 'status', OPERATOR_APPROVAL_PATCH_STATUSES);
  const patch: Record<string, unknown> = { updatedAt: nowIso() };
  if (status) {
    patch.status = status;
  }
  if (hasOwn(body, 'summary')) patch.summary = requireString(body, 'summary', { max: 8000 });
  return patch;
}

async function submitOperatorCheckin(actor: AuthorizedApiKeyActor, body: unknown) {
  const payload = buildOperatorCheckinCreate(expectObject(body), actor);
  const desk = await getResourceById(RESOURCE_CONFIGS['operator-desks'], actor, String(payload.operatorDeskId));
  assertActiveOperatorDesk(desk);
  if (payload.workOrderId) await getResourceById(RESOURCE_CONFIGS['operator-work-orders'], actor, String(payload.workOrderId));
  const ref = getAdminFirestore().collection('operatorCheckins').doc();
  await ref.set(payload);
  await writeOperatorAuditLog(actor, 'operator-checkins.create', { operatorDeskId: payload.operatorDeskId, workOrderId: payload.workOrderId || null, checkinId: ref.id });
  return { data: { id: ref.id, ...payload } };
}

async function claimOrReleaseWorkOrder(actor: AuthorizedApiKeyActor, workOrderId: string, body: unknown, action: 'claim' | 'release') {
  const input = expectObject(body);
  assertAllowedKeys(input, ['externalAgentName']);
  const externalAgentName = requireString(input, 'externalAgentName', { max: 200 });
  const workOrder = await getResourceById(RESOURCE_CONFIGS['operator-work-orders'], actor, workOrderId);
  const desk = await getResourceById(RESOURCE_CONFIGS['operator-desks'], actor, String(workOrder.operatorDeskId || ''));
  assertActiveOperatorDesk(desk);
  const timestamp = nowIso();
  const ref = getAdminFirestore().collection('operatorWorkOrders').doc(workOrderId);
  if (action === 'claim') {
    if (!['ready', 'draft'].includes(String(workOrder.status))) {
      throw new ApiKeyServerError('Only ready Work Orders can be claimed.', 409);
    }
    await ref.update({ status: 'claimed', claimedBy: externalAgentName, claimedAt: timestamp, updatedAt: timestamp });
    await submitOperatorCheckin(actor, { operatorDeskId: workOrder.operatorDeskId, workOrderId, externalAgentName, type: 'work_order_claimed', summary: `${externalAgentName} claimed ${workOrder.title}.`, payload: {} });
  } else {
    if (workOrder.claimedBy && workOrder.claimedBy !== externalAgentName) {
      throw new ApiKeyServerError('Only the claiming external agent can release this Work Order.', 409);
    }
    await ref.update({ status: 'ready', claimedBy: null, claimedAt: null, updatedAt: timestamp });
    await submitOperatorCheckin(actor, { operatorDeskId: workOrder.operatorDeskId, workOrderId, externalAgentName, type: 'work_skipped', summary: `${externalAgentName} released ${workOrder.title}.`, payload: {} });
  }
  await writeOperatorAuditLog(actor, `operator-work-orders.${action}`, { workOrderId, operatorDeskId: workOrder.operatorDeskId, externalAgentName });
  const updated = await ref.get();
  return { data: serializeSnapshot(updated.id, asRecord(updated.data())) };
}

function injectionActionForHub(targetHub: string) {
  return targetHub === 'operator-memories' ? 'remember' : 'create';
}

function approvalActionForHub(targetHub: string): ApprovalAction {
  return targetHub === 'operator-memories' ? 'remember' : targetHub === 'team-chat-messages' ? 'send' : 'create';
}

function riskForOperatorOutput(output: Record<string, unknown>, targetHub: string) {
  if (targetHub === 'team-chat-messages') return 'medium';
  const payload = asRecord(output.structuredPayload);
  if (output.outputType === 'bug_triage' && (payload.severity === 'high' || payload.severity === 'critical')) return payload.severity;
  return 'low';
}

async function likelyOperatorDuplicate(actor: AuthorizedApiKeyActor, output: Record<string, unknown>, targetHub: string) {
  const collectionName = HUB_COLLECTIONS_FOR_OPERATOR[targetHub];
  if (!collectionName) return null;
  const items = (await getScopedQuery(collectionName, 'companyOrAuthor', actor).get()).docs.map((doc) => serializeSnapshot(doc.id, asRecord(doc.data())));
  const key = normalizeOperatorKey(String(output.title || ''));
  return items.find((item) =>
    normalizeOperatorKey(String(item.title || item.keyword || item.slug || item.matchKey || '')) === key ||
    matchesOperatorTarget(item, output)
  ) || null;
}

const HUB_COLLECTIONS_FOR_OPERATOR: Record<string, string> = {
  tasks: 'tasks',
  bugs: 'bugs',
  'roadmap-items': 'roadmapItems',
  'blog-articles': 'blogArticles',
  'social-posts': 'socialPosts',
  'creative-items': 'creativeItems',
  'seo-keywords': 'seoKeywords',
  prompts: 'prompts',
};

function normalizeOperatorKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function operatorStructuredPayload(output: Record<string, unknown>) {
  return asRecord(output.structuredPayload);
}

function stringFromRecord(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function outputSourceReferences(output: Record<string, unknown>) {
  return Array.isArray(output.sourceReferences)
    ? output.sourceReferences.map((item) => asRecord(item))
    : [];
}

function operatorLineageFromOutput(output: Record<string, unknown>) {
  const payload = operatorStructuredPayload(output);
  const references = outputSourceReferences(output);
  const sourceIds = uniq([
    stringFromRecord(payload, ['sourceId']),
    ...references.map((reference) => stringFromRecord(reference, ['sourceId', 'id'])),
  ]);
  const sourceVersionIds = uniq([
    stringFromRecord(payload, ['sourceVersionId']),
    ...references.map((reference) => stringFromRecord(reference, ['sourceVersionId', 'versionId'])),
  ]);
  const sourceKey = stringFromRecord(payload, ['sourceKey']) || stringFromRecord(references[0] || {}, ['sourceKey', 'key']);
  const sourceTitle = stringFromRecord(payload, ['sourceTitle']) || stringFromRecord(references[0] || {}, ['sourceTitle', 'title']);
  const explicitMatchKey = stringFromRecord(payload, ['matchKey', 'dedupeKey', 'sourceKey']);
  const titleKey = normalizeKey(String(output.title || ''));
  return {
    sourceIds,
    sourceVersionIds,
    sourceKey,
    sourceTitle,
    aliases: uniq([
      String(output.title || ''),
      String(output.summary || ''),
      explicitMatchKey,
      ...references.map((reference) => stringFromRecord(reference, ['title', 'sourceTitle', 'sourceKey'])),
    ]),
    matchKey: explicitMatchKey || titleKey,
  };
}

function operatorDedupeKey(actor: AuthorizedApiKeyActor, targetHub: string, output: Record<string, unknown>) {
  const payload = operatorStructuredPayload(output);
  const lineage = operatorLineageFromOutput(output);
  const explicit =
    stringFromRecord(payload, ['bugId', 'targetRecordId', 'sourceId', 'sourceVersionId', 'sourceKey', 'matchKey', 'dedupeKey']) ||
    lineage.matchKey ||
    String(output.workOrderId || '') ||
    String(output.id || output.title || '');
  const scope = actor.companyId || actor.ownerUid;
  return createHash('sha256').update(`${scope}:${targetHub}:${normalizeKey(explicit) || explicit}`).digest('hex').slice(0, 28);
}

function deterministicOperatorTargetId(actor: AuthorizedApiKeyActor, targetHub: string, output: Record<string, unknown>) {
  return `mcp-${normalizeOperatorKey(targetHub)}-${operatorDedupeKey(actor, targetHub, output)}`;
}

async function getOptionalResourceById(config: ResourceConfig, actor: AuthorizedApiKeyActor, id: string) {
  if (!id) return null;
  const snapshot = await getAdminFirestore().collection(config.collection).doc(id).get();
  if (!snapshot.exists) return null;
  const data = asRecord(snapshot.data());
  if (!canAccessDocument(config.scopeMode, snapshot.id, data, actor)) return null;
  return serializeSnapshot(snapshot.id, data);
}

function matchesOperatorTarget(candidate: LinkedDoc, output: Record<string, unknown>) {
  const payload = operatorStructuredPayload(output);
  const lineage = operatorLineageFromOutput(output);
  const normalizedKeys = [
    stringFromRecord(payload, ['sourceId']),
    stringFromRecord(payload, ['sourceVersionId']),
    stringFromRecord(payload, ['sourceKey']),
    stringFromRecord(payload, ['matchKey', 'dedupeKey']),
    lineage.matchKey,
    String(output.workOrderId || ''),
    String(output.title || ''),
  ].map(normalizeKey).filter(Boolean);
  const candidateValues = [
    String(candidate.matchKey || ''),
    String(candidate.sourceKey || ''),
    String(candidate.title || candidate.keyword || candidate.slug || ''),
    String(candidate.workOrderId || ''),
  ].map(normalizeKey).filter(Boolean);
  if (candidateValues.some((value) => normalizedKeys.includes(value))) return true;

  const sourceIds = Array.isArray(candidate.sourceIds) ? candidate.sourceIds.map(String) : [];
  const sourceVersionIds = Array.isArray(candidate.sourceVersionIds) ? candidate.sourceVersionIds.map(String) : [];
  return lineage.sourceIds.some((id) => sourceIds.includes(id)) ||
    lineage.sourceVersionIds.some((id) => sourceVersionIds.includes(id));
}

async function findOperatorTargetRecord(actor: AuthorizedApiKeyActor, targetHub: string, output: Record<string, unknown>, injection: Record<string, unknown> | null) {
  const collectionName = HUB_COLLECTIONS_FOR_OPERATOR[targetHub];
  if (!collectionName) return null;
  const config = Object.values(RESOURCE_CONFIGS).find((item) => item.collection === collectionName);
  if (!config) return null;

  const targetRecordId = typeof injection?.targetRecordId === 'string' ? injection.targetRecordId : '';
  const linkedTarget = await getOptionalResourceById(config, actor, targetRecordId);
  if (linkedTarget) return linkedTarget;

  const payload = operatorStructuredPayload(output);
  const explicitBugId = targetHub === 'bugs' ? stringFromRecord(payload, ['bugId', 'targetRecordId', 'id']) : '';
  const explicitTarget = await getOptionalResourceById(config, actor, explicitBugId);
  if (explicitTarget) return explicitTarget;

  const deterministicId = deterministicOperatorTargetId(actor, targetHub, output);
  const deterministicTarget = await getOptionalResourceById(config, actor, deterministicId);
  if (deterministicTarget) return deterministicTarget;

  const snapshot = await getScopedQuery(collectionName, 'companyOrAuthor', actor).get();
  return snapshot.docs
    .map((doc) => serializeSnapshot(doc.id, asRecord(doc.data())))
    .find((candidate) => matchesOperatorTarget(candidate, output)) || null;
}

function severityRank(severity: unknown) {
  const value = String(severity || 'medium');
  const rank = { low: 0, medium: 1, high: 2, critical: 3 } as Record<string, number>;
  return rank[value] ?? rank.medium;
}

function maxBugSeverity(left: unknown, right: unknown) {
  return severityRank(left) >= severityRank(right) ? String(left || 'medium') : String(right || 'medium');
}

function appendUniqueOperatorNote(existingNotes: unknown, note: string, marker: string) {
  const current = typeof existingNotes === 'string' ? existingNotes : '';
  if (current.includes(marker)) return current;
  return truncate([current.trim(), note.trim()].filter(Boolean).join('\n\n'), 8_000);
}

function approvedBugPayload(
  actor: AuthorizedApiKeyActor,
  output: Record<string, unknown>,
  approval: Record<string, unknown>,
  existing?: LinkedDoc | null,
) {
  const timestamp = nowIso();
  const payload = operatorStructuredPayload(output);
  const lineage = operatorLineageFromOutput(output);
  const linkedTaskIds = uniq([
    ...(Array.isArray(existing?.linkedTaskIds) ? existing?.linkedTaskIds as string[] : []),
    ...(Array.isArray(payload.linkedTaskIds) ? payload.linkedTaskIds.map(String) : []),
  ]);
  const codeLinks = mergeBugCodeLinks(existing?.codeLinks, payload.codeLinks);
  const marker = `operatorApproval:${String(approval.id || '')}`;
  const note = [
    marker,
    `Operator output ${String(output.id || '')}: ${String(output.summary || output.title || '')}`,
    truncate(String(output.content || ''), 2_400),
  ].filter(Boolean).join('\n');
  const base = {
    title: String(existing?.title || output.title || 'Operator bug output'),
    description: String(existing?.description || output.content || ''),
    severity: maxBugSeverity(existing?.severity, payload.severity || (output.outputType === 'bug_triage' ? 'high' : 'medium')),
    status: existing?.status || (typeof payload.status === 'string' && BUG_STATUSES.includes(payload.status as any) ? payload.status : 'triaged'),
    resolutionNotes: appendUniqueOperatorNote(existing?.resolutionNotes, note, marker),
    linkedTaskIds,
    codeLinks,
    sourceIds: uniq([...(Array.isArray(existing?.sourceIds) ? existing?.sourceIds as string[] : []), ...lineage.sourceIds]),
    sourceVersionIds: uniq([...(Array.isArray(existing?.sourceVersionIds) ? existing?.sourceVersionIds as string[] : []), ...lineage.sourceVersionIds]),
    sourceKey: lineage.sourceKey || existing?.sourceKey || '',
    sourceTitle: lineage.sourceTitle || existing?.sourceTitle || '',
    aliases: uniq([...(Array.isArray(existing?.aliases) ? existing?.aliases as string[] : []), ...lineage.aliases]),
    matchKey: lineage.matchKey || existing?.matchKey || normalizeKey(String(output.title || '')),
    updatedAt: timestamp,
  };
  return existing ? base : {
    ...base,
    createdAt: timestamp,
    ...actorOwnedBase(actor),
  };
}

function approvedHubPayload(actor: AuthorizedApiKeyActor, output: Record<string, unknown>, targetHub: string, approval: Record<string, unknown>, existing?: LinkedDoc | null) {
  const timestamp = nowIso();
  const payload = operatorStructuredPayload(output);
  const title = String(output.title || 'Operator output');
  const content = String(output.content || '');
  const base = { createdAt: timestamp, updatedAt: timestamp, ...actorOwnedBase(actor) };
  if (targetHub === 'bugs') return approvedBugPayload(actor, output, approval, existing);
  if (existing) return { updatedAt: timestamp };
  if (targetHub === 'tasks') return { ...base, title, isLeadIndicator: false, effortPoints: Number(payload.effortPoints || 3), status: 'todo', executionNotes: content, matchKey: normalizeKey(title) };
  if (targetHub === 'blog-articles') return { ...base, title, slug: normalizeOperatorKey(title), summary: String(output.summary || ''), content, status: output.outputType === 'blog_idea' ? 'idea' : 'drafting', roadmapPhase: 'next', priority: 'medium' };
  if (targetHub === 'seo-keywords') return { ...base, keyword: String(payload.keyword || title), intent: payload.intent || 'medium' };
  if (targetHub === 'social-posts') return { ...base, platform: payload.platform || 'LinkedIn', content, scheduledFor: '', status: 'draft', matchKey: normalizeKey(title) };
  if (targetHub === 'creative-items') return { ...base, title, platform: payload.platform || 'LinkedIn', format: payload.format || 'single-post', campaign: '', audience: '', objective: '', hook: String(output.summary || ''), brief: content, caption: '', visualDirection: content, productionNotes: '', cta: '', status: 'brief', approvalNotes: '', assetIds: [], tags: [], matchKey: normalizeKey(title) };
  if (targetHub === 'roadmap-items') return { ...base, title, description: content, phase: 'next', priority: 'medium', status: 'planned', linkedTaskIds: [] };
  if (targetHub === 'prompts') return { ...base, title, version: '1.0.0', content };
  return null;
}

async function normalizeLegacyCompletedApproval(approvalId: string, approval: Record<string, unknown>, timestamp: string) {
  const patch: Record<string, unknown> = {
    status: 'approved',
    writeBackStatus: 'completed',
    writeBackCompletedAt: typeof approval.writeBackCompletedAt === 'string'
      ? approval.writeBackCompletedAt
      : (typeof approval.reviewedAt === 'string' ? approval.reviewedAt : timestamp),
    updatedAt: timestamp,
  };
  if (!approval.reviewedAt) patch.reviewedAt = timestamp;
  await getAdminFirestore().collection('operatorApprovals').doc(approvalId).update(patch);
  const updated = await getAdminFirestore().collection('operatorApprovals').doc(approvalId).get();
  return {
    data: serializeSnapshot(updated.id, asRecord(updated.data())),
    idempotent: true,
    note: 'Approval was already completed; normalized legacy status to approved.',
  };
}

async function approveOperatorApproval(actor: AuthorizedApiKeyActor, approvalId: string, body: unknown) {
  const input = expectObject(body || {});
  assertAllowedKeys(input, ['summary']);
  const approval = await getResourceById(RESOURCE_CONFIGS['operator-approvals'], actor, approvalId);
  const timestamp = nowIso();
  if (approval.status === 'approved') {
    return { data: approval, idempotent: true, note: 'Approval was already approved.' };
  }
  if (approval.status === 'completed') {
    return normalizeLegacyCompletedApproval(approvalId, approval, timestamp);
  }
  if (!['pending', 'edited'].includes(String(approval.status))) {
    throw new ApiKeyServerError(`Approval is ${String(approval.status || 'not pending')}; only pending or edited approvals can be approved.`, 409);
  }
  if (!approval.outputId || !approval.injectionId) {
    throw new ApiKeyServerError('Approval is missing output or injection linkage.', 400);
  }

  const output = await getResourceById(RESOURCE_CONFIGS['operator-outputs'], actor, String(approval.outputId));
  const injection = await getResourceById(RESOURCE_CONFIGS['operator-injections'], actor, String(approval.injectionId));
  const desk = await getResourceById(RESOURCE_CONFIGS['operator-desks'], actor, String(approval.operatorDeskId));
  assertActiveOperatorDesk(desk);

  const targetHub = String(approval.targetHub || injection.targetHub || '');
  const targetCollection = HUB_COLLECTIONS_FOR_OPERATOR[targetHub];
  if (!targetCollection) {
    throw new ApiKeyServerError(`Approved destination ${targetHub} is not enabled for hub writes.`, 400);
  }

  const existingTarget = await findOperatorTargetRecord(actor, targetHub, output, injection);
  if (approval.action === 'link' && !existingTarget) {
    throw new ApiKeyServerError('Approval was marked as a link, but no canonical target record could be found.', 409);
  }
  const targetRef = existingTarget
    ? getAdminFirestore().collection(targetCollection).doc(existingTarget.id)
    : getAdminFirestore().collection(targetCollection).doc(deterministicOperatorTargetId(actor, targetHub, output));
  const latestTarget = await getOptionalResourceById(
    Object.values(RESOURCE_CONFIGS).find((item) => item.collection === targetCollection) as ResourceConfig,
    actor,
    targetRef.id,
  );
  const targetPayload = approvedHubPayload(actor, output, targetHub, { ...approval, id: approvalId }, latestTarget || existingTarget);
  if (!targetPayload) throw new ApiKeyServerError(`Approved destination ${targetHub} is not enabled for hub writes.`, 400);

  const batch = getAdminFirestore().batch();
  if (latestTarget || existingTarget) batch.update(targetRef, targetPayload);
  else batch.set(targetRef, targetPayload);
  batch.update(getAdminFirestore().collection('operatorApprovals').doc(approvalId), {
    status: 'approved',
    reviewedBy: actor.ownerUid,
    reviewedAt: timestamp,
    updatedAt: timestamp,
    writeBackStatus: 'completed',
    writeBackCompletedAt: timestamp,
    targetRecordId: targetRef.id,
    summary: hasOwn(input, 'summary') ? requireString(input, 'summary', { max: 8_000 }) : approval.summary,
  });
  batch.update(getAdminFirestore().collection('operatorInjections').doc(String(approval.injectionId)), {
    status: 'completed',
    completedAt: timestamp,
    targetRecordId: targetRef.id,
  });
  batch.update(getAdminFirestore().collection('operatorOutputs').doc(String(approval.outputId)), {
    status: 'injected',
    updatedAt: timestamp,
  });
  await batch.commit();
  await writeOperatorAuditLog(actor, 'operator-approvals.approve', {
    approvalId,
    outputId: approval.outputId,
    targetHub,
    targetRecordId: targetRef.id,
    idempotentTarget: Boolean(latestTarget || existingTarget),
  });

  const updated = await getAdminFirestore().collection('operatorApprovals').doc(approvalId).get();
  return {
    data: serializeSnapshot(updated.id, asRecord(updated.data())),
    target: { hub: targetHub, id: targetRef.id, updated: Boolean(latestTarget || existingTarget) },
    idempotent: false,
  };
}

async function rejectOperatorApproval(actor: AuthorizedApiKeyActor, approvalId: string, body: unknown) {
  const input = expectObject(body || {});
  assertAllowedKeys(input, ['reason']);
  const approval = await getResourceById(RESOURCE_CONFIGS['operator-approvals'], actor, approvalId);
  if (approval.status === 'rejected') return { data: approval, idempotent: true, note: 'Approval was already rejected.' };
  if (!['pending', 'edited'].includes(String(approval.status))) {
    throw new ApiKeyServerError(`Approval is ${String(approval.status || 'not pending')}; only pending or edited approvals can be rejected.`, 409);
  }
  const timestamp = nowIso();
  const batch = getAdminFirestore().batch();
  batch.update(getAdminFirestore().collection('operatorApprovals').doc(approvalId), {
    status: 'rejected',
    reviewedBy: actor.ownerUid,
    reviewedAt: timestamp,
    updatedAt: timestamp,
    rejectionReason: hasOwn(input, 'reason') ? requireString(input, 'reason', { max: 2_000 }) : '',
  });
  if (approval.injectionId) batch.update(getAdminFirestore().collection('operatorInjections').doc(String(approval.injectionId)), { status: 'rejected' });
  if (approval.outputId) batch.update(getAdminFirestore().collection('operatorOutputs').doc(String(approval.outputId)), { status: 'rejected', updatedAt: timestamp });
  await batch.commit();
  await writeOperatorAuditLog(actor, 'operator-approvals.reject', { approvalId, outputId: approval.outputId || null });
  const updated = await getAdminFirestore().collection('operatorApprovals').doc(approvalId).get();
  return { data: serializeSnapshot(updated.id, asRecord(updated.data())), idempotent: false };
}

async function updateOperatorMemoryStateAction(
  actor: AuthorizedApiKeyActor,
  memoryId: string,
  state: typeof OPERATOR_MEMORY_STATES[number],
  auditAction: string,
  body: unknown = {},
) {
  const input = expectObject(body || {});
  assertAllowedKeys(input, ['reason']);
  const memory = await getResourceById(RESOURCE_CONFIGS['operator-memories'], actor, memoryId);
  if (memory.state === state) {
    return { data: memory, idempotent: true, note: `Memory is already ${state}.` };
  }
  if (state === 'active' && !['suggested', 'archived', 'expired'].includes(String(memory.state || ''))) {
    throw new ApiKeyServerError(`Only suggested, archived, or expired memory can be activated from ${String(memory.state || 'this state')}.`, 409);
  }
  await assertOperatorMemoryScope(actor, String(memory.scope || 'operator'), typeof memory.scopeId === 'string' ? memory.scopeId : null);

  const timestamp = nowIso();
  const patch: Record<string, unknown> = {
    state,
    updatedAt: timestamp,
  };
  if (state === 'active') {
    patch.pinned = false;
    patch.approvedBy = actor.ownerUid;
    patch.approvedAt = timestamp;
    patch.restoredAt = memory.state === 'archived' ? timestamp : memory.restoredAt || null;
  }
  if (state === 'rejected') {
    patch.rejectedBy = actor.ownerUid;
    patch.rejectedAt = timestamp;
    patch.rejectionReason = hasOwn(input, 'reason') ? requireString(input, 'reason', { max: 2_000 }) : '';
  }
  if (state === 'archived') {
    patch.archivedBy = actor.ownerUid;
    patch.archivedAt = timestamp;
    patch.archiveReason = hasOwn(input, 'reason') ? requireString(input, 'reason', { max: 2_000 }) : '';
  }
  await getAdminFirestore().collection('operatorMemories').doc(memoryId).update(patch);
  await writeOperatorAuditLog(actor, auditAction, { memoryId, previousState: memory.state || null, nextState: state });
  const updated = await getAdminFirestore().collection('operatorMemories').doc(memoryId).get();
  return { data: serializeSnapshot(updated.id, asRecord(updated.data())), idempotent: false };
}

async function routeOperatorOutput(actor: AuthorizedApiKeyActor, outputId: string, outputData: Record<string, unknown>) {
  const suggested = Array.isArray(outputData.suggestedDestinations) ? outputData.suggestedDestinations.map(String) : [];
  const destinations = (suggested.length ? suggested : OUTPUT_ROUTING[String(outputData.outputType) as keyof typeof OUTPUT_ROUTING] || [])
    .filter((destination) => ENABLED_ROUTING_DESTINATIONS.includes(destination as any));
  if (destinations.length === 0) {
    await getAdminFirestore().collection('operatorOutputs').doc(outputId).update({
      routingWarning: `No supported Smart Routing destination for ${String(outputData.outputType || 'output')}.`,
      updatedAt: nowIso(),
    });
    return [];
  }

  const created: LinkedDoc[] = [];
  let pendingApprovalCount = 0;
  for (const targetHub of destinations) {
    const duplicate = await likelyOperatorDuplicate(actor, outputData, targetHub);
    const injectionRef = getAdminFirestore().collection('operatorInjections').doc();
    const riskLevel = riskForOperatorOutput(outputData, targetHub);
    const approvalAction: ApprovalAction = duplicate ? 'link' : approvalActionForHub(targetHub);
    const requiresApproval = operatorActionRequiresApproval(approvalAction);
    const injection = {
      outputId,
      targetHub,
      targetRecordId: duplicate?.id || null,
      action: duplicate ? 'link' : injectionActionForHub(targetHub),
      riskLevel,
      status: requiresApproval ? 'pending_approval' : 'proposed',
      createdAt: nowIso(),
      completedAt: null,
      ...actorOwnedBase(actor),
    };
    await injectionRef.set(injection);

    if (requiresApproval) {
      pendingApprovalCount += 1;
      created.push({ id: injectionRef.id, ...injection });
      const approvalRef = getAdminFirestore().collection('operatorApprovals').doc();
      await approvalRef.set({
        operatorDeskId: outputData.operatorDeskId,
        workOrderId: outputData.workOrderId || null,
        outputId,
        injectionId: injectionRef.id,
        title: outputData.title,
        summary: duplicate ? `Likely duplicate found. Review linking to ${targetHub}.` : outputData.summary,
        targetHub,
        action: approvalAction,
        riskLevel,
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        expiresAt: null,
        ...actorOwnedBase(actor),
      });
      continue;
    }

    const targetCollection = HUB_COLLECTIONS_FOR_OPERATOR[targetHub];
    if (!targetCollection) throw new ApiKeyServerError(`Internal destination ${targetHub} is not enabled for hub writes.`, 400);
    const existingTarget = duplicate || await findOperatorTargetRecord(actor, targetHub, outputData, injection);
    const targetRef = existingTarget
      ? getAdminFirestore().collection(targetCollection).doc(existingTarget.id)
      : getAdminFirestore().collection(targetCollection).doc(deterministicOperatorTargetId(actor, targetHub, outputData));
    const targetConfig = Object.values(RESOURCE_CONFIGS).find((item) => item.collection === targetCollection);
    if (!targetConfig) throw new ApiKeyServerError(`Internal destination ${targetHub} has no resource configuration.`, 500);
    const latestTarget = await getOptionalResourceById(targetConfig, actor, targetRef.id);
    const targetPayload = approvedHubPayload(
      actor,
      { ...outputData, id: outputId },
      targetHub,
      { id: `auto-${injectionRef.id}` },
      latestTarget || existingTarget,
    );
    if (!targetPayload) throw new ApiKeyServerError(`Internal destination ${targetHub} is not enabled for hub writes.`, 400);

    const timestamp = nowIso();
    const batch = getAdminFirestore().batch();
    if (latestTarget || existingTarget) batch.update(targetRef, targetPayload);
    else batch.set(targetRef, targetPayload);
    batch.update(injectionRef, { status: 'completed', completedAt: timestamp, targetRecordId: targetRef.id });
    await batch.commit();
    await writeOperatorAuditLog(actor, 'operator-injections.auto-apply', {
      outputId,
      injectionId: injectionRef.id,
      targetHub,
      targetRecordId: targetRef.id,
      updated: Boolean(latestTarget || existingTarget),
    });
    created.push({
      id: injectionRef.id,
      ...injection,
      status: 'completed',
      completedAt: timestamp,
      targetRecordId: targetRef.id,
    });
  }

  await getAdminFirestore().collection('operatorOutputs').doc(outputId).update({
    status: pendingApprovalCount > 0 ? 'pending_approval' : 'injected',
    updatedAt: nowIso(),
  });
  return created;
}

async function submitOperatorOutput(actor: AuthorizedApiKeyActor, body: unknown) {
  const payload = buildOperatorOutputCreate(expectObject(body), actor);
  const desk = await getResourceById(RESOURCE_CONFIGS['operator-desks'], actor, String(payload.operatorDeskId));
  assertActiveOperatorDesk(desk);
  if (payload.workOrderId) {
    const workOrder = await getResourceById(RESOURCE_CONFIGS['operator-work-orders'], actor, String(payload.workOrderId));
    if (workOrder.status === 'archived' || workOrder.status === 'cancelled') {
      throw new ApiKeyServerError('Operator Outputs cannot be submitted for archived or cancelled Work Orders.', 409);
    }
  }
  const ref = getAdminFirestore().collection('operatorOutputs').doc();
  await ref.set(payload);
  await submitOperatorCheckin(actor, { operatorDeskId: payload.operatorDeskId, workOrderId: payload.workOrderId, externalAgentName: payload.externalAgentName, type: 'output_submitted', summary: `Submitted ${payload.outputType}: ${payload.title}`, payload: { outputId: ref.id } });
  if (payload.workOrderId) {
    await getAdminFirestore().collection('operatorWorkOrders').doc(String(payload.workOrderId)).update({ status: 'submitted', updatedAt: nowIso() });
  }
  let injections: LinkedDoc[] = [];
  if (desk.approvalMode === 'draft_only') {
    await getAdminFirestore().collection('operatorOutputs').doc(ref.id).update({
      routingWarning: 'Desk approval mode is draft_only; output was saved but not routed for workspace writes.',
      updatedAt: nowIso(),
    });
  } else {
    injections = await routeOperatorOutput(actor, ref.id, payload);
  }
  await writeOperatorAuditLog(actor, 'operator-outputs.submit', { outputId: ref.id, operatorDeskId: payload.operatorDeskId, workOrderId: payload.workOrderId || null, routedInjections: injections.length });
  return { data: { id: ref.id, ...payload }, injections };
}

async function buildOperatorManifest(actor: AuthorizedApiKeyActor, searchParams: URLSearchParams) {
  const deskKey = searchParams.get('operatorDeskId') || searchParams.get('deskId') || searchParams.get('slug');
  if (!deskKey) throw new ApiKeyServerError('operatorDeskId or slug is required.', 400);
  const externalAgentName = searchParams.get('externalAgentName');
  const desks = (await getScopedQuery('operatorDesks', 'companyOrAuthor', actor).get()).docs.map((doc) => serializeSnapshot(doc.id, asRecord(doc.data())));
  const operatorDesk = desks.find((desk) => desk.id === deskKey || desk.slug === deskKey);
  if (!operatorDesk) throw new ApiKeyServerError('Operator Desk not found.', 404);
  assertActiveOperatorDesk(operatorDesk);
  const [workOrdersSnap, packsSnap, memoriesSnap, outputsSnap, checkinsSnap] = await Promise.all([
    getScopedQuery('operatorWorkOrders', 'companyOrAuthor', actor).get(),
    getScopedQuery('operatorContextPacks', 'companyOrAuthor', actor).get(),
    getScopedQuery('operatorMemories', 'companyOrAuthor', actor).get(),
    getScopedQuery('operatorOutputs', 'companyOrAuthor', actor).get(),
    getScopedQuery('operatorCheckins', 'companyOrAuthor', actor).get(),
  ]);
  const workOrders = workOrdersSnap.docs.map((doc) => serializeSnapshot(doc.id, asRecord(doc.data()))).filter((item) => item.operatorDeskId === operatorDesk.id);
  const contextPacks = packsSnap.docs.map((doc) => serializeSnapshot(doc.id, asRecord(doc.data()))).filter((item) => item.scope === 'global' || item.scopeId === operatorDesk.id);
  const memories = memoriesSnap.docs.map((doc) => serializeSnapshot(doc.id, asRecord(doc.data()))).filter((item) => (item.scope === 'global' || item.scopeId === operatorDesk.id) && item.state !== 'rejected' && item.state !== 'archived' && item.state !== 'expired');
  const outputs = outputsSnap.docs.map((doc) => serializeSnapshot(doc.id, asRecord(doc.data()))).filter((item) => item.operatorDeskId === operatorDesk.id).sort(createdAtDesc).slice(0, 10);
  const checkins = checkinsSnap.docs.map((doc) => serializeSnapshot(doc.id, asRecord(doc.data()))).filter((item) => item.operatorDeskId === operatorDesk.id).sort(createdAtDesc).slice(0, 10);
  return {
    operatorDesk,
    readyWorkOrders: workOrders.filter((item) => item.status === 'ready'),
    claimedWorkOrders: workOrders.filter((item) => ['claimed', 'in_progress'].includes(String(item.status)) && (!externalAgentName || item.claimedBy === externalAgentName)),
    contextPacks,
    activeMemory: memories.filter((item) => item.state === 'active'),
    pinnedMemory: memories.filter((item) => item.state === 'pinned'),
    allowedSources: operatorDesk.allowedSources || [],
    allowedOutputTypes: operatorDesk.allowedOutputTypes || [],
    routingRules: operatorDesk.routingRules || {},
    approvalRules: { approvalMode: operatorDesk.approvalMode, dangerousActionRules: operatorDesk.dangerousActionRules || DANGEROUS_ACTION_RULES },
    recentOutputs: outputs,
    recentCheckins: checkins,
    duplicatePreventionRules: DUPLICATE_PREVENTION_RULES,
    submissionSchema: {
      required: ['operatorDeskId', 'externalAgentName', 'outputType', 'title', 'summary', 'content'],
      optional: ['workOrderId', 'structuredPayload', 'suggestedDestinations', 'sourceReferences', 'memorySuggestions', 'confidence'],
    },
  };
}

async function getResourceById(config: ResourceConfig, actor: AuthorizedApiKeyActor, id: string) {
  const snapshot = await getAdminFirestore().collection(config.collection).doc(id).get();
  if (!snapshot.exists) {
    throw new ApiKeyServerError('Resource not found.', 404);
  }

  const data = asRecord(snapshot.data());
  if (!canAccessDocument(config.scopeMode, snapshot.id, data, actor)) {
    throw new ApiKeyServerError('Resource not found.', 404);
  }

  return serializeSnapshot(snapshot.id, data);
}

async function getCreativeAssetDownload(actor: AuthorizedApiKeyActor, assetId: string) {
  const asset = await getResourceById(RESOURCE_CONFIGS['creative-assets'], actor, assetId);
  if (asset.status !== 'active') {
    throw new ApiKeyServerError('Creative asset is not available for download.', 409);
  }

  return {
    assetId,
    fileName: asset.fileName ?? null,
    mimeType: asset.mimeType ?? null,
    assetType: asset.assetType ?? null,
    url: createCloudinaryDeliveryUrl(asset as unknown as CreativeAsset),
  };
}

function extractDeleteLookupValues(searchParams: URLSearchParams, body: unknown) {
  const values: Record<string, string> = {};
  const bodyObject = isRecord(body) ? body : {};

  for (const key of DELETE_LOOKUP_KEYS) {
    const queryValue = searchParams.get(key);
    if (queryValue?.trim()) {
      values[key] = queryValue.trim();
    }

    const bodyValue = bodyObject[key];
    if (typeof bodyValue === 'string' && bodyValue.trim()) {
      values[key] = bodyValue.trim();
    }
  }

  return values;
}

async function resolveDeleteRecordId(
  config: ResourceConfig,
  actor: AuthorizedApiKeyActor,
  searchParams: URLSearchParams,
  body: unknown,
) {
  const directId =
    searchParams.get('id')?.trim() ||
    searchParams.get('recordId')?.trim() ||
    (isRecord(body) && typeof body.id === 'string' && body.id.trim()) ||
    (isRecord(body) && typeof body.recordId === 'string' && body.recordId.trim()) ||
    '';
  if (directId) return directId;

  const lookupValues = extractDeleteLookupValues(searchParams, body);
  const lookupEntries = Object.entries(lookupValues);
  if (lookupEntries.length === 0) {
    return null;
  }

  const snapshot = await getScopedQuery(config.collection, config.scopeMode, actor).get();
  const matches = snapshot.docs
    .map((doc) => serializeSnapshot(doc.id, asRecord(doc.data())))
    .filter((record) =>
      lookupEntries.every(([key, value]) => {
        if (key === 'id' || key === 'recordId') {
          return record.id === value;
        }

        return String(record[key] ?? '') === value;
      }),
    );

  if (matches.length === 1) {
    return matches[0].id;
  }

  if (matches.length > 1) {
    throw new ApiKeyServerError('Delete lookup matched multiple records. Provide a unique id instead.', 409);
  }

  return null;
}

async function createResource(config: ResourceConfig, actor: AuthorizedApiKeyActor, body: unknown) {
  if (!config.create) {
    throw new ApiKeyServerError('Method not allowed.', 405);
  }

  if (config.requireCompanyAdminForWrite) {
    assertCompanyAdmin(actor);
  }

  const input = expectObject(body);
  const payload = await config.create(input, actor);
  const ref = getAdminFirestore().collection(config.collection).doc();
  await ref.set(payload);
  if (config.resource.startsWith('operator-')) {
    await writeOperatorAuditLog(actor, `${config.resource}.create`, { resource: config.resource, recordId: ref.id });
  }

  return {
    data: {
      id: ref.id,
      ...payload,
    },
  };
}

async function updateResource(config: ResourceConfig, actor: AuthorizedApiKeyActor, id: string, body: unknown) {
  if (!config.update) {
    throw new ApiKeyServerError('Method not allowed.', 405);
  }

  if (config.requireCompanyAdminForWrite) {
    assertCompanyAdmin(actor);
  }

  const ref = getAdminFirestore().collection(config.collection).doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    throw new ApiKeyServerError('Resource not found.', 404);
  }

  const existing = asRecord(snapshot.data());
  if (!canAccessDocument(config.scopeMode, snapshot.id, existing, actor)) {
    throw new ApiKeyServerError('Resource not found.', 404);
  }

  const patch = await config.update(expectObject(body), actor, existing, id);
  await ref.update(patch);
  if (config.resource.startsWith('operator-')) {
    await writeOperatorAuditLog(actor, `${config.resource}.update`, { resource: config.resource, recordId: id, fields: Object.keys(patch) });
  }

  return {
    data: {
      id,
      ...existing,
      ...patch,
    },
  };
}

async function deleteResource(config: ResourceConfig, actor: AuthorizedApiKeyActor, id: string) {
  if (config.requireCompanyAdminForWrite) {
    assertCompanyAdmin(actor);
  }

  const ref = getAdminFirestore().collection(config.collection).doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    throw new ApiKeyServerError('Resource not found.', 404);
  }

  const existing = asRecord(snapshot.data());
  if (!canAccessDocument(config.scopeMode, snapshot.id, existing, actor)) {
    throw new ApiKeyServerError('Resource not found.', 404);
  }

  await ref.delete();
  invalidateContextRoutingCacheForActor(actor);
  return {
    data: {
      id,
      deleted: true,
    },
  };
}

function buildResourceMetadata() {
  return Object.values(RESOURCE_CONFIGS).map((config) => ({
    resource: config.resource,
    collection: config.collection,
    methods: [
      config.allowList || config.allowGet ? 'GET' : null,
      config.allowCreate ? 'POST' : null,
      config.allowUpdate ? 'PATCH' : null,
      config.allowDelete ? 'DELETE' : null,
    ].filter(Boolean),
    readScope: config.readScope,
    writeScope: config.writeScope ?? null,
  }));
}

function getReportWeekBounds(selection: 'current' | 'last') {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(now.getDate() - now.getDay());

  if (selection === 'last') {
    start.setDate(start.getDate() - 7);
  }

  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  return {
    start,
    end,
  };
}

async function buildWeeklyChangelog(actor: AuthorizedApiKeyActor, searchParams: URLSearchParams) {
  const week = searchParams.get('week') === 'last' ? 'last' : 'current';
  const { start, end } = getReportWeekBounds(week);
  const snapshot = await getScopedQuery('tasks', 'companyOrAuthor', actor).get();
  const tasks: LinkedDoc[] = snapshot.docs
    .map((doc) => serializeSnapshot(doc.id, asRecord(doc.data())))
    .filter((task) => task.status === 'done')
    .filter((task) => {
      const completedAt =
        typeof task.completedAt === 'string' && !Number.isNaN(Date.parse(task.completedAt))
          ? new Date(task.completedAt)
          : typeof task.createdAt === 'string'
            ? new Date(task.createdAt)
            : null;
      return Boolean(completedAt && completedAt >= start && completedAt < end);
    });

  const leadTasks = tasks.filter((task) => task.isLeadIndicator === true);
  const lagTasks = tasks.filter((task) => task.isLeadIndicator !== true);
  const lines: string[] = ['# Weekly Changelog', ''];

  if (leadTasks.length > 0) {
    lines.push('## Lead Indicators Achieved');
    for (const task of leadTasks) {
      lines.push(`- **${String(task.title || '')}** (${String(task.effortPoints || 0)} pts)`);
    }
    lines.push('');
  }

  if (lagTasks.length > 0) {
    lines.push('## Other Tasks Completed');
    for (const task of lagTasks) {
      lines.push(`- ${String(task.title || '')} (${String(task.effortPoints || 0)} pts)`);
    }
  }

  if (tasks.length === 0) {
    lines.push('No tasks completed in this window yet.');
  }

  return {
    week,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    markdown: lines.join('\n'),
    tasks,
    count: tasks.length,
  };
}

function generateEnvironmentVersion() {
  return `v${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}`;
}

async function executeEnvironmentAction(actor: AuthorizedApiKeyActor, id: string, action: 'deploy' | 'rollback') {
  const config = RESOURCE_CONFIGS.environments;
  const ref = getAdminFirestore().collection(config.collection).doc(id);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    throw new ApiKeyServerError('Environment not found.', 404);
  }

  const existing = asRecord(snapshot.data());
  if (!canAccessDocument(config.scopeMode, snapshot.id, existing, actor)) {
    throw new ApiKeyServerError('Environment not found.', 404);
  }

  const patch = {
    status: 'healthy',
    lastSync: nowIso(),
    version: generateEnvironmentVersion(),
  };

  await ref.update(patch);

  return {
    action,
    data: {
      id,
      ...existing,
      ...patch,
    },
  };
}

async function startNextCycle(actor: AuthorizedApiKeyActor) {
  const [tasksSnapshot, goalsSnapshot] = await Promise.all([
    getScopedQuery('tasks', 'companyOrAuthor', actor).get(),
    getScopedQuery('cycleGoals', 'companyOrAuthor', actor).get(),
  ]);

  const unfinishedTasks = tasksSnapshot.docs.filter((doc) => {
    const data = asRecord(doc.data());
    return data.status !== 'done' && data.status !== 'icebox';
  });

  const activeGoals = goalsSnapshot.docs.filter((doc) => asRecord(doc.data()).status === 'active');
  const batch = getAdminFirestore().batch();

  for (const task of unfinishedTasks) {
    batch.update(task.ref, { status: 'icebox', completedAt: null });
  }

  for (const goal of activeGoals) {
    batch.update(goal.ref, { status: 'archived' });
  }

  if (unfinishedTasks.length || activeGoals.length) {
    await batch.commit();
  }

  return {
    archivedGoals: activeGoals.length,
    movedTasksToIcebox: unfinishedTasks.length,
    startedAt: nowIso(),
  };
}

function parseIngestionRequest(body: unknown) {
  const input = expectObject(body);
  assertAllowedKeys(input, ['fileName', 'content', 'mimeType', 'fileSize', 'payload']);

  const fileName = requireString(input, 'fileName', { max: 260 });
  const content = requireString(input, 'content', { trim: false, max: MAX_FILE_SIZE_BYTES });
  const mimeType = optionalString(input, 'mimeType', { max: 100 }) ?? 'text/plain';
  const contentSize = Buffer.byteLength(content, 'utf8');
  const fileSize = optionalIntegerRange(input, 'fileSize', 1, MAX_FILE_SIZE_BYTES) ?? contentSize;
  const storesFullContent =
    mimeType === 'text/plain' || mimeType === 'text/markdown' || /\.(txt|md)$/i.test(fileName);

  if (storesFullContent && contentSize > MAX_FULL_TEXT_SIZE_BYTES) {
    throw new ApiKeyServerError('Markdown and TXT content must be 500KB or smaller.', 400);
  }

  if (!storesFullContent && (contentSize > MAX_FILE_SIZE_BYTES || fileSize > MAX_FILE_SIZE_BYTES)) {
    throw new ApiKeyServerError('File size must be 10MB or smaller.', 400);
  }

  return {
    fileName,
    content,
    mimeType,
    fileSize,
    payload: hasOwn(input, 'payload') ? requirePayload(input.payload) : undefined,
  } satisfies IngestionRequest;
}

function getActorScope(actor: AuthorizedApiKeyActor) {
  return actor.companyId
    ? { field: 'companyId', value: actor.companyId }
    : { field: 'authorId', value: actor.ownerUid };
}

async function loadScopedDocs(collectionName: string, actor: AuthorizedApiKeyActor) {
  const scope = getActorScope(actor);
  const snapshot = await getAdminFirestore().collection(collectionName).where(scope.field, '==', scope.value).get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...asRecord(doc.data()),
  })) as LinkedDoc[];
}

function resolveIngestionCollection(kind: IngestionKind) {
  switch (kind) {
    case 'task':
      return 'tasks';
    case 'vision':
      return 'visions';
    case 'cycleGoal':
    case 'plannerItem':
      return 'cycleGoals';
    case 'review':
      return 'feedbacks';
    case 'video':
      return 'socialPosts';
    case 'creative':
      return 'creativeItems';
    case 'lead':
      return 'leads';
    case 'account':
      return 'accounts';
    default:
      return 'tasks';
  }
}

function matchBySourceOrTitle(docs: LinkedDoc[], item: IngestionItem, sourceId: string, sourceVersionId: string, collectionName = '') {
  const normalizedTitle = normalizeKey(item.title);
  const normalizedMatchKey = normalizeKey(item.matchKey || '');

  if (collectionName === 'accounts') {
    if (item.matchKey && normalizedMatchKey) {
      const matchKeyMatch = docs.find((doc) => normalizeKey(String(doc.matchKey || '')) === normalizedMatchKey);
      if (matchKeyMatch) return matchKeyMatch;
    }

    const itemDomain = normalizeDomain(item.website || '');
    if (itemDomain) {
      const domainMatch = docs.find((doc) => normalizeDomain(String(doc.website || '')) === itemDomain);
      if (domainMatch) return domainMatch;
    }

    return docs.find((doc) => normalizeKey(String(doc.name || doc.title || '')) === normalizedTitle);
  }

  if (collectionName === 'leads') {
    if (item.matchKey && normalizedMatchKey) {
      const matchKeyMatch = docs.find((doc) => normalizeKey(String(doc.matchKey || '')) === normalizedMatchKey);
      if (matchKeyMatch) return matchKeyMatch;
    }

    const email = (item.email || '').trim().toLowerCase();
    if (email) {
      const emailMatch = docs.find((doc) => String(doc.email || '').trim().toLowerCase() === email);
      if (emailMatch) return emailMatch;
    }
  }

  const sourceLinkedMatches = docs.filter((doc) => {
    const docSourceIds = Array.isArray(doc.sourceIds) ? doc.sourceIds : [];
    const docVersionIds = Array.isArray(doc.sourceVersionIds) ? doc.sourceVersionIds : [];
    return docSourceIds.includes(sourceId) || docVersionIds.includes(sourceVersionId);
  });

  const linkedTitleMatch = sourceLinkedMatches.find((doc) => normalizeKey(String(doc.title || doc.name || '')) === normalizedTitle);
  if (linkedTitleMatch) {
    return linkedTitleMatch;
  }

  if (item.matchKey && normalizedMatchKey) {
    const linkedMatchKeyMatch = sourceLinkedMatches.find((doc) => normalizeKey(String(doc.matchKey || '')) === normalizedMatchKey);
    if (linkedMatchKeyMatch) {
      return linkedMatchKeyMatch;
    }

    const globalMatchKeyMatch = docs.find((doc) => normalizeKey(String(doc.matchKey || '')) === normalizedMatchKey);
    if (globalMatchKeyMatch) {
      return globalMatchKeyMatch;
    }
  }

  return undefined;
}

function buildCommonLinkPayload(
  sourceId: string,
  sourceVersionId: string,
  sourceKey: string,
  sourceTitle: string,
  sourceVersion: number,
  existing?: LinkedDoc,
) {
  return {
    sourceIds: uniq([...(Array.isArray(existing?.sourceIds) ? existing.sourceIds as string[] : []), sourceId]),
    sourceVersionIds: uniq([...(Array.isArray(existing?.sourceVersionIds) ? existing.sourceVersionIds as string[] : []), sourceVersionId]),
    sourceKey,
    sourceTitle,
    sourceVersion,
    sourceUpdatedAt: nowIso(),
  };
}

function buildIngestionTaskPayload(item: IngestionItem, sourceMeta: Record<string, unknown>, existing?: LinkedDoc) {
  const status = item.status && TASK_STATUSES.includes(item.status as typeof TASK_STATUSES[number]) ? item.status : 'todo';
  return {
    title: item.title,
    aliases: uniq([...(item.aliases || []), item.title, item.matchKey]),
    matchKey: item.matchKey || normalizeKey(item.title),
    status,
    effortPoints: item.effortPoints || (typeof existing?.effortPoints === 'number' ? existing.effortPoints : 3),
    isLeadIndicator: typeof item.isLeadIndicator === 'boolean' ? item.isLeadIndicator : Boolean(existing?.isLeadIndicator),
    completedAt: status === 'done' ? nowIso() : null,
    ...sourceMeta,
  };
}

function buildIngestionVisionPayload(item: IngestionItem, sourceMeta: Record<string, unknown>) {
  return {
    title: item.title,
    aliases: uniq([...(item.aliases || []), item.title, item.matchKey]),
    matchKey: item.matchKey || normalizeKey(item.title),
    description: item.description || item.summary,
    focusItems: item.focusItems || [item.summary].filter(Boolean),
    ...sourceMeta,
  };
}

function buildIngestionCycleGoalPayload(item: IngestionItem, sourceMeta: Record<string, unknown>) {
  const status = item.status && GOAL_STATUSES.includes(item.status as typeof GOAL_STATUSES[number]) ? item.status : 'active';
  return {
    title: item.title,
    aliases: uniq([...(item.aliases || []), item.title, item.matchKey]),
    matchKey: item.matchKey || normalizeKey(item.title),
    description: item.description || item.summary,
    status,
    ...sourceMeta,
  };
}

function buildIngestionFeedbackPayload(item: IngestionItem, sourceMeta: Record<string, unknown>, existing?: LinkedDoc) {
  return {
    source: item.source || (typeof existing?.source === 'string' ? existing.source : 'Email'),
    aliases: uniq([...(item.aliases || []), item.title, item.matchKey]),
    matchKey: item.matchKey || normalizeKey(item.title),
    content: item.description || item.summary,
    sentiment: item.sentiment || (typeof existing?.sentiment === 'string' ? existing.sentiment : 'neutral'),
    ...sourceMeta,
  };
}

function buildIngestionSocialPostPayload(item: IngestionItem, sourceMeta: Record<string, unknown>, existing?: LinkedDoc) {
  return {
    platform: item.platform || (typeof existing?.platform === 'string' ? existing.platform : 'Loom'),
    aliases: uniq([...(item.aliases || []), item.title, item.matchKey]),
    matchKey: item.matchKey || normalizeKey(item.title),
    content: item.description || item.summary,
    scheduledFor: item.scheduledFor || (typeof existing?.scheduledFor === 'string' ? existing.scheduledFor : nowIso()),
    status:
      item.status && POST_STATUSES.includes(item.status as typeof POST_STATUSES[number])
        ? item.status
        : (typeof existing?.status === 'string' ? existing.status : 'draft'),
    ...sourceMeta,
  };
}

function buildIngestionCreativeItemPayload(item: IngestionItem, sourceMeta: Record<string, unknown>, existing?: LinkedDoc) {
  const status = item.status && CREATIVE_STATUSES.includes(item.status as typeof CREATIVE_STATUSES[number])
    ? item.status
    : (typeof existing?.status === 'string' ? existing.status : 'idea');
  return {
    title: item.title,
    platform: item.creativePlatform || (typeof existing?.platform === 'string' ? existing.platform : 'Other'),
    format: item.format || (typeof existing?.format === 'string' ? existing.format : 'other'),
    campaign: item.campaign || (typeof existing?.campaign === 'string' ? existing.campaign : ''),
    audience: item.audience || (typeof existing?.audience === 'string' ? existing.audience : ''),
    objective: item.objective || (typeof existing?.objective === 'string' ? existing.objective : ''),
    hook: item.hook || (typeof existing?.hook === 'string' ? existing.hook : ''),
    brief: item.brief || item.description || item.summary || (typeof existing?.brief === 'string' ? existing.brief : ''),
    caption: item.caption || (typeof existing?.caption === 'string' ? existing.caption : ''),
    visualDirection: item.visualDirection || (typeof existing?.visualDirection === 'string' ? existing.visualDirection : ''),
    productionNotes: item.productionNotes || item.notes || (typeof existing?.productionNotes === 'string' ? existing.productionNotes : ''),
    cta: item.cta || (typeof existing?.cta === 'string' ? existing.cta : ''),
    status,
    ownerId: item.ownerId || (typeof existing?.ownerId === 'string' ? existing.ownerId : null),
    approverId: typeof existing?.approverId === 'string' ? existing.approverId : null,
    targetPublishAt: item.targetPublishAt || (typeof existing?.targetPublishAt === 'string' ? existing.targetPublishAt : null),
    scheduledFor: item.scheduledFor || (typeof existing?.scheduledFor === 'string' ? existing.scheduledFor : null),
    publishedAt: typeof existing?.publishedAt === 'string' ? existing.publishedAt : null,
    submittedAt: typeof existing?.submittedAt === 'string' ? existing.submittedAt : null,
    approvalNotes: typeof existing?.approvalNotes === 'string' ? existing.approvalNotes : '',
    assetIds: Array.isArray(existing?.assetIds) ? existing.assetIds : [],
    tags: uniq([...(Array.isArray(existing?.tags) ? existing.tags as string[] : []), ...(item.tags || [])]),
    aliases: uniq([...(item.aliases || []), item.title, item.matchKey]),
    matchKey: item.matchKey || normalizeKey(item.title),
    updatedAt: nowIso(),
    ...sourceMeta,
  };
}

function buildIngestionAccountPayload(item: IngestionItem, sourceMeta: Record<string, unknown>, existing?: LinkedDoc) {
  const status = item.status && ACCOUNT_STATUSES.includes(item.status as typeof ACCOUNT_STATUSES[number])
    ? item.status
    : (typeof existing?.status === 'string' ? existing.status : 'prospect');
  return {
    name: item.title,
    website: item.website || (typeof existing?.website === 'string' ? existing.website : ''),
    industry: item.industry || (typeof existing?.industry === 'string' ? existing.industry : ''),
    size: item.size || (typeof existing?.size === 'string' ? existing.size : ''),
    notes: item.notes || item.description || item.summary || (typeof existing?.notes === 'string' ? existing.notes : ''),
    status,
    linkedLeadIds: Array.isArray(existing?.linkedLeadIds) ? existing.linkedLeadIds : [],
    aliases: uniq([...(item.aliases || []), item.title, item.matchKey, item.website]),
    matchKey: item.matchKey || normalizeDomain(item.website || '') || normalizeKey(item.title),
    updatedAt: nowIso(),
    ...sourceMeta,
  };
}

function buildIngestionLeadPayload(item: IngestionItem, sourceMeta: Record<string, unknown>, existing?: LinkedDoc) {
  const stage = item.stage && LEAD_STAGES.includes(item.stage as typeof LEAD_STAGES[number])
    ? item.stage
    : item.status && LEAD_STAGES.includes(item.status as typeof LEAD_STAGES[number])
      ? item.status
      : (typeof existing?.stage === 'string' ? existing.stage : 'new');
  const source = item.source && LEAD_SOURCES.includes(item.source as typeof LEAD_SOURCES[number])
    ? item.source
    : (typeof existing?.source === 'string' ? existing.source : 'inbound');
  const priority = item.priority && LEAD_PRIORITIES.includes(item.priority as typeof LEAD_PRIORITIES[number])
    ? item.priority
    : (typeof existing?.priority === 'string' ? existing.priority : 'medium');
  const email = item.email ? item.email.trim().toLowerCase() : (typeof existing?.email === 'string' ? existing.email : '');

  return {
    name: item.title,
    email,
    companyName: item.companyName || (typeof existing?.companyName === 'string' ? existing.companyName : ''),
    accountId: item.accountId || (typeof existing?.accountId === 'string' ? existing.accountId : null),
    source,
    stage,
    priority,
    ownerId: item.ownerId || (typeof existing?.ownerId === 'string' ? existing.ownerId : null),
    nextAction: item.nextAction || (typeof existing?.nextAction === 'string' ? existing.nextAction : ''),
    nextActionAt: item.nextActionAt || (typeof existing?.nextActionAt === 'string' ? existing.nextActionAt : null),
    notes: item.notes || item.description || item.summary || (typeof existing?.notes === 'string' ? existing.notes : ''),
    linkedTaskIds: Array.isArray(item.linkedTaskIds)
      ? uniq(item.linkedTaskIds)
      : (Array.isArray(existing?.linkedTaskIds) ? existing.linkedTaskIds : []),
    aliases: uniq([...(item.aliases || []), item.title, item.matchKey, email]),
    matchKey: item.matchKey || email || normalizeKey(item.title),
    updatedAt: nowIso(),
    ...sourceMeta,
  };
}

async function upsertIngestionEntity(
  collectionName: string,
  actor: AuthorizedApiKeyActor,
  item: IngestionItem,
  sourceId: string,
  sourceVersionId: string,
  sourceKey: string,
  sourceTitle: string,
  sourceVersion: number,
) {
  const docs = await loadScopedDocs(collectionName, actor);
  const existing = matchBySourceOrTitle(docs, item, sourceId, sourceVersionId, collectionName);
  const ref = existing
    ? getAdminFirestore().collection(collectionName).doc(existing.id)
    : getAdminFirestore().collection(collectionName).doc();

  const sourceMeta = buildCommonLinkPayload(sourceId, sourceVersionId, sourceKey, sourceTitle, sourceVersion, existing);
  let payload: Record<string, unknown>;

  switch (collectionName) {
    case 'tasks':
      payload = buildIngestionTaskPayload(item, sourceMeta, existing);
      break;
    case 'visions':
      payload = buildIngestionVisionPayload(item, sourceMeta);
      break;
    case 'cycleGoals':
      payload = buildIngestionCycleGoalPayload(item, sourceMeta);
      break;
    case 'feedbacks':
      payload = buildIngestionFeedbackPayload(item, sourceMeta, existing);
      break;
    case 'socialPosts':
      payload = buildIngestionSocialPostPayload(item, sourceMeta, existing);
      break;
    case 'creativeItems':
      payload = buildIngestionCreativeItemPayload(item, sourceMeta, existing);
      break;
    case 'accounts':
      payload = buildIngestionAccountPayload(item, sourceMeta, existing);
      break;
    case 'leads':
      payload = buildIngestionLeadPayload(item, sourceMeta, existing);
      break;
    default:
      payload = {
        title: item.title,
        description: item.description || item.summary,
        ...sourceMeta,
      };
  }

  if (existing) {
    await ref.update({
      ...payload,
      authorId: actor.ownerUid,
      companyId: actor.companyId ?? null,
    });

    return {
      id: existing.id,
      action: 'updated' as const,
    };
  }

  await ref.set({
    ...payload,
    createdAt: nowIso(),
    authorId: actor.ownerUid,
    companyId: actor.companyId ?? null,
  });

  return {
    id: ref.id,
    action: 'created' as const,
  };
}

async function upsertContextSource(
  actor: AuthorizedApiKeyActor,
  payload: IngestionPayload,
  fileName: string,
  mimeType: string,
  fileSize: number,
  contentHash: string,
  sourceText: string,
) {
  void fileSize;
  void contentHash;

  const normalizedTitle = normalizeKey(payload.source.title || stripExtension(fileName));
  const aliases = uniq([payload.source.title, fileName, stripExtension(fileName), ...payload.source.aliases]);
  const existingDocs = await loadScopedDocs('contextSources', actor);

  const existing = existingDocs.find((doc) => {
    const docAliases = Array.isArray(doc.aliases) ? (doc.aliases as string[]).map((alias) => normalizeKey(alias)) : [];
    return (
      normalizeKey(String(doc.normalizedTitle || doc.title || '')) === normalizedTitle ||
      normalizeKey(String(doc.sourceKey || '')) === normalizedTitle ||
      docAliases.includes(normalizedTitle) ||
      docAliases.includes(normalizeKey(fileName))
    );
  });

  const ref = existing
    ? getAdminFirestore().collection('contextSources').doc(existing.id)
    : getAdminFirestore().collection('contextSources').doc();

  const nextVersion = existing ? Number(existing.latestVersion || 0) + 1 : 1;
  const sourceMeta = {
    title: payload.source.title || stripExtension(fileName),
    normalizedTitle,
    aliases,
    sourceKey: normalizedTitle,
    latestVersion: nextVersion,
    latestFileName: fileName,
    latestMimeType: mimeType,
    latestSummary: payload.source.summary || truncate(sourceText, 500),
    linkedTaskIds: Array.isArray(existing?.linkedTaskIds) ? existing.linkedTaskIds : [],
    linkedVisionIds: Array.isArray(existing?.linkedVisionIds) ? existing.linkedVisionIds : [],
    linkedCycleGoalIds: Array.isArray(existing?.linkedCycleGoalIds) ? existing.linkedCycleGoalIds : [],
    linkedFeedbackIds: Array.isArray(existing?.linkedFeedbackIds) ? existing.linkedFeedbackIds : [],
    linkedSocialPostIds: Array.isArray(existing?.linkedSocialPostIds) ? existing.linkedSocialPostIds : [],
    linkedCreativeItemIds: Array.isArray(existing?.linkedCreativeItemIds) ? existing.linkedCreativeItemIds : [],
    linkedLeadIds: Array.isArray(existing?.linkedLeadIds) ? existing.linkedLeadIds : [],
    linkedAccountIds: Array.isArray(existing?.linkedAccountIds) ? existing.linkedAccountIds : [],
    createdAt: typeof existing?.createdAt === 'string' ? existing.createdAt : nowIso(),
    updatedAt: nowIso(),
    lastUploadedAt: nowIso(),
    authorId: actor.ownerUid,
    companyId: actor.companyId ?? null,
    status: 'active' as const,
  };

  if (existing) {
    await ref.update({
      ...sourceMeta,
      aliases: Array.from(new Set([...(Array.isArray(existing.aliases) ? existing.aliases as string[] : []), ...aliases])),
    });
  } else {
    await ref.set(sourceMeta);
  }

  return {
    sourceId: ref.id,
    sourceKey: normalizedTitle,
    sourceTitle: sourceMeta.title,
    sourceVersion: nextVersion,
    linkedTaskIds: Array.isArray(existing?.linkedTaskIds) ? existing.linkedTaskIds as string[] : [],
    linkedVisionIds: Array.isArray(existing?.linkedVisionIds) ? existing.linkedVisionIds as string[] : [],
    linkedCycleGoalIds: Array.isArray(existing?.linkedCycleGoalIds) ? existing.linkedCycleGoalIds as string[] : [],
    linkedFeedbackIds: Array.isArray(existing?.linkedFeedbackIds) ? existing.linkedFeedbackIds as string[] : [],
    linkedSocialPostIds: Array.isArray(existing?.linkedSocialPostIds) ? existing.linkedSocialPostIds as string[] : [],
    linkedCreativeItemIds: Array.isArray(existing?.linkedCreativeItemIds) ? existing.linkedCreativeItemIds as string[] : [],
    linkedLeadIds: Array.isArray(existing?.linkedLeadIds) ? existing.linkedLeadIds as string[] : [],
    linkedAccountIds: Array.isArray(existing?.linkedAccountIds) ? existing.linkedAccountIds as string[] : [],
  };
}

async function createContextSourceVersion(
  actor: AuthorizedApiKeyActor,
  sourceId: string,
  sourceKey: string,
  sourceVersion: number,
  fileName: string,
  mimeType: string,
  fileSize: number,
  contentHash: string,
  content: string,
  payload: IngestionPayload,
) {
  const ref = getAdminFirestore().collection('contextSourceVersions').doc();
  const storesFullContent =
    mimeType === 'text/plain' || mimeType === 'text/markdown' || /\.(txt|md)$/i.test(fileName);
  await ref.set({
    sourceId,
    sourceKey,
    version: sourceVersion,
    fileName,
    mimeType,
    fileSize,
    contentHash,
    contentPreview: truncate(content, 1_800),
    ...(storesFullContent ? { fullContent: content } : {}),
    contentStorage: storesFullContent ? 'full' : 'preview-only',
    routingContentAvailable: storesFullContent,
    payload,
    linkedTaskIds: [],
    linkedVisionIds: [],
    linkedCycleGoalIds: [],
    linkedFeedbackIds: [],
    linkedSocialPostIds: [],
    linkedCreativeItemIds: [],
    linkedLeadIds: [],
    linkedAccountIds: [],
    createdAt: nowIso(),
    authorId: actor.ownerUid,
    companyId: actor.companyId ?? null,
    status: 'processed',
  });

  return {
    versionId: ref.id,
  };
}

async function processContextIngestion(
  actor: AuthorizedApiKeyActor,
  request: IngestionRequest,
  payload: IngestionPayload,
): Promise<IngestionResult> {
  const resultBase: IngestionResult = {
    fileName: request.fileName,
    status: 'processing',
    linkedTaskIds: [],
    linkedVisionIds: [],
    linkedCycleGoalIds: [],
    linkedFeedbackIds: [],
    linkedSocialPostIds: [],
    linkedCreativeItemIds: [],
    linkedLeadIds: [],
    linkedAccountIds: [],
    actions: [],
    createdAt: nowIso(),
  };

  try {
    const contentHash = hashContent(request.content);
    const source = await upsertContextSource(actor, payload, request.fileName, request.mimeType, request.fileSize, contentHash, request.content);
    const version = await createContextSourceVersion(
      actor,
      source.sourceId,
      source.sourceKey,
      source.sourceVersion,
      request.fileName,
      request.mimeType,
      request.fileSize,
      contentHash,
      request.content,
      payload,
    );

    const linkedTaskIds: string[] = [];
    const linkedVisionIds: string[] = [];
    const linkedCycleGoalIds: string[] = [];
    const linkedFeedbackIds: string[] = [];
    const linkedSocialPostIds: string[] = [];
    const linkedCreativeItemIds: string[] = [];
    const linkedLeadIds: string[] = [];
    const linkedAccountIds: string[] = [];
    const actions: IngestionItemAction[] = [];

    for (const item of payload.items) {
      const collectionName = resolveIngestionCollection(item.kind);
      const upserted = await upsertIngestionEntity(
        collectionName,
        actor,
        item,
        source.sourceId,
        version.versionId,
        source.sourceKey,
        source.sourceTitle,
        source.sourceVersion,
      );

      actions.push({ title: item.title, kind: item.kind, action: upserted.action, id: upserted.id });

      switch (collectionName) {
        case 'tasks':
          linkedTaskIds.push(upserted.id);
          break;
        case 'visions':
          linkedVisionIds.push(upserted.id);
          break;
        case 'cycleGoals':
          linkedCycleGoalIds.push(upserted.id);
          break;
        case 'feedbacks':
          linkedFeedbackIds.push(upserted.id);
          break;
        case 'socialPosts':
          linkedSocialPostIds.push(upserted.id);
          break;
        case 'creativeItems':
          linkedCreativeItemIds.push(upserted.id);
          break;
        case 'leads':
          linkedLeadIds.push(upserted.id);
          break;
        case 'accounts':
          linkedAccountIds.push(upserted.id);
          break;
      }
    }

    await getAdminFirestore().collection('contextSources').doc(source.sourceId).update({
      linkedTaskIds: uniq([...source.linkedTaskIds, ...linkedTaskIds]),
      linkedVisionIds: uniq([...source.linkedVisionIds, ...linkedVisionIds]),
      linkedCycleGoalIds: uniq([...source.linkedCycleGoalIds, ...linkedCycleGoalIds]),
      linkedFeedbackIds: uniq([...source.linkedFeedbackIds, ...linkedFeedbackIds]),
      linkedSocialPostIds: uniq([...source.linkedSocialPostIds, ...linkedSocialPostIds]),
      linkedCreativeItemIds: uniq([...source.linkedCreativeItemIds, ...linkedCreativeItemIds]),
      linkedLeadIds: uniq([...source.linkedLeadIds, ...linkedLeadIds]),
      linkedAccountIds: uniq([...source.linkedAccountIds, ...linkedAccountIds]),
      updatedAt: nowIso(),
    });

    await getAdminFirestore().collection('contextSourceVersions').doc(version.versionId).update({
      linkedTaskIds,
      linkedVisionIds,
      linkedCycleGoalIds,
      linkedFeedbackIds,
      linkedSocialPostIds,
      linkedCreativeItemIds,
      linkedLeadIds,
      linkedAccountIds,
    });

    return {
      ...resultBase,
      status: 'done',
      sourceId: source.sourceId,
      sourceVersionId: version.versionId,
      sourceTitle: source.sourceTitle,
      sourceVersion: source.sourceVersion,
      linkedTaskIds,
      linkedVisionIds,
      linkedCycleGoalIds,
      linkedFeedbackIds,
      linkedSocialPostIds,
      linkedCreativeItemIds,
      linkedLeadIds,
      linkedAccountIds,
      actions,
    };
  } catch (error) {
    return {
      ...resultBase,
      status: 'error',
      error: error instanceof Error ? error.message : 'Failed to process context ingestion.',
    };
  }
}

async function extractContextPayload(body: unknown) {
  const request = parseIngestionRequest(body);
  const extraction = await handleGeminiIngestionRequest({
    fileName: request.fileName,
    content: request.content,
  });

  return {
    statusCode: 200,
    body: {
      fileName: request.fileName,
      mimeType: request.mimeType,
      fileSize: request.fileSize,
      contentHash: hashContent(request.content),
      payload: extraction.payload,
      usedGemini: extraction.usedGemini,
      model: extraction.model,
      warning: extraction.warning,
      rateLimit: extraction.rateLimit,
    },
  } satisfies ExternalApiResponse;
}

async function ingestContextPayload(actor: AuthorizedApiKeyActor, body: unknown) {
  const request = parseIngestionRequest(body);
  const extraction = request.payload
    ? null
    : await handleGeminiIngestionRequest({
        fileName: request.fileName,
        content: request.content,
      });
  const payload = request.payload ?? extraction?.payload;

  if (!payload) {
    throw new ApiKeyServerError('Failed to extract payload.', 500);
  }

  const result = await processContextIngestion(actor, request, payload);
  return {
    statusCode: result.status === 'done' ? 201 : 422,
    body: {
      result,
      extraction: extraction
        ? {
            usedGemini: extraction.usedGemini,
            model: extraction.model,
            warning: extraction.warning,
            rateLimit: extraction.rateLimit as GeminiRateLimitSnapshot,
          }
        : null,
    },
  } satisfies ExternalApiResponse;
}

function getResourceConfig(resourceSegment: string | undefined) {
  if (!resourceSegment) {
    return null;
  }

  const canonicalName = RESOURCE_ALIASES[resourceSegment];
  return canonicalName ? RESOURCE_CONFIGS[canonicalName] : null;
}

function getExternalHeaderValue(headers: HeaderBag, name: string) {
  if (!headers) return undefined;

  const lowerCaseName = name.toLowerCase();
  const directValue = headers[lowerCaseName];
  if (Array.isArray(directValue)) return directValue[0];
  if (typeof directValue === 'string') return directValue;

  const fallbackKey = Object.keys(headers).find((key) => key.toLowerCase() === lowerCaseName);
  if (!fallbackKey) return undefined;

  const value = headers[fallbackKey];
  return Array.isArray(value) ? value[0] : value;
}

function getRequestOrigin(headers: HeaderBag, url: URL) {
  if (url.origin !== 'http://localhost') {
    return url.origin;
  }

  const host = getExternalHeaderValue(headers, 'x-forwarded-host') || getExternalHeaderValue(headers, 'host') || 'localhost:4000';
  const proto =
    getExternalHeaderValue(headers, 'x-forwarded-proto') ||
    (host.includes('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');

  return `${proto}://${host}`;
}

async function authorizeExternalCredential(headers: HeaderBag, requiredScopes: ApiKeyScope[] = []) {
  const authorization = getExternalHeaderValue(headers, 'authorization');
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  if (bearer?.startsWith('roa_')) {
    return authorizeOAuthAccessToken(headers, requiredScopes);
  }

  return authorizeExternalApiKey(headers, requiredScopes);
}

function getExternalAuthMode(headers: HeaderBag) {
  const authorization = getExternalHeaderValue(headers, 'authorization');
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer?.startsWith('roa_') ? 'oauth' : 'api-key';
}

function emptyRelatedContext() {
  return {
    attached: [],
    suggestions: [],
    hasMore: false,
  };
}

async function addRoutedContext(
  resource: ResourceName,
  actor: AuthorizedApiKeyActor,
  authMode: string,
  payload: Record<string, unknown>,
  debug = false,
) {
  const data = isRecord(payload.data) ? payload.data : null;
  if (!data || typeof data.id !== 'string' || !isContextRoutingResource(resource)) {
    return payload;
  }

  try {
    const routed = await routeWorkspaceObjectContext({
      actor,
      authMode,
      anchorResource: resource,
      anchor: data as Record<string, unknown> & { id: string },
      debug,
    });
    return {
      ...payload,
      ...routed,
    };
  } catch (error) {
    const traceId = randomUUID();
    console.warn(
      '[replofy-os][context-routing] unavailable',
      JSON.stringify({
        traceId,
        errorType: error instanceof Error ? error.name : 'UnknownError',
      }),
    );
    return {
      ...payload,
      relatedContext: emptyRelatedContext(),
      routing: {
        policyVersion: CONTEXT_ROUTING_POLICY_VERSION,
        registryVersion: CONTEXT_ROUTING_REGISTRY_VERSION,
        generatedAt: nowIso(),
        traceId,
        thresholds: CONTEXT_ROUTING_THRESHOLDS,
        warning: 'Related context is temporarily unavailable.',
      },
    };
  }
}

async function handleResourceRequest(
  config: ResourceConfig,
  method: string,
  id: string | undefined,
  actor: AuthorizedApiKeyActor,
  authMode: string,
  searchParams: URLSearchParams,
  body: unknown,
) {
  switch (method) {
    case 'GET':
      if (id) {
        if (!config.allowGet) throw new ApiKeyServerError('Method not allowed.', 405);
        return {
          statusCode: 200,
          body: {
            data: await getResourceById(config, actor, id),
          },
        } satisfies ExternalApiResponse;
      }

      if (!config.allowList) throw new ApiKeyServerError('Method not allowed.', 405);
      return {
        statusCode: 200,
        body: await listResource(config, actor, searchParams),
      } satisfies ExternalApiResponse;
    case 'POST':
      if (id || !config.allowCreate) throw new ApiKeyServerError('Method not allowed.', 405);
      {
        const created = await createResource(config, actor, body);
        invalidateContextRoutingCacheForActor(actor);
        return {
          statusCode: 201,
          body: await addRoutedContext(config.resource, actor, authMode, created),
        } satisfies ExternalApiResponse;
      }
    case 'PATCH':
      if (!id || !config.allowUpdate) throw new ApiKeyServerError('Method not allowed.', 405);
      {
        const updated = await updateResource(config, actor, id, body);
        invalidateContextRoutingCacheForActor(actor);
        return {
          statusCode: 200,
          body: await addRoutedContext(config.resource, actor, authMode, updated),
        } satisfies ExternalApiResponse;
      }
    case 'DELETE':
      if (!config.allowDelete) throw new ApiKeyServerError('Method not allowed.', 405);
      {
        const resolvedId = id || (await resolveDeleteRecordId(config, actor, searchParams, body));
        if (!resolvedId) {
          throw new ApiKeyServerError('Record id or unique lookup is required for DELETE.', 400);
        }
        return {
          statusCode: 200,
          body: await deleteResource(config, actor, resolvedId),
        } satisfies ExternalApiResponse;
      }
    default:
      throw new ApiKeyServerError('Method not allowed.', 405);
  }
}

export async function handleExternalApiRequest(
  headers: HeaderBag,
  method: string | undefined,
  requestUrl: string | undefined,
  body: unknown,
): Promise<ExternalApiResponse> {
  const normalizedMethod = method?.toUpperCase() || 'GET';
  const url = new URL(requestUrl || '/api/v1', 'http://localhost');
  const path = url.pathname.replace(/^\/api\/v1\/?/, '');
  const segments = path ? path.split('/').filter(Boolean) : [];

  if (segments[0] === 'openapi.json') {
    if (normalizedMethod !== 'GET') {
      throw new ApiKeyServerError('Method not allowed.', 405);
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: generateOpenApiSpec(getRequestOrigin(headers, url)),
    };
  }

  if (segments.length === 0) {
    if (normalizedMethod !== 'GET') {
      throw new ApiKeyServerError('Method not allowed.', 405);
    }

    await authorizeExternalCredential(headers, []);
    return {
      statusCode: 200,
      body: {
        ok: true,
        version: 'v1',
        resources: buildResourceMetadata(),
        actions: [
          ...OPERATOR_MCP_REGISTRY_ACTIONS.map((action) => ({
            action: action.actionName,
            scope: action.permissionLevel === 'read' ? 'workspace:read' : 'workspace:write',
            riskLevel: action.riskLevel,
          })),
          { method: 'POST', path: '/api/v1/context-ingestions/extract', scope: 'systems:read' },
          { method: 'POST', path: '/api/v1/context-ingestions', scope: 'systems:write' },
          { method: 'GET', path: '/api/v1/context-routing/:resource/:id', scope: 'resource read scope' },
          { method: 'GET', path: '/api/v1/blog-articles', scope: 'workspace:read' },
          { method: 'POST', path: '/api/v1/blog-articles', scope: 'workspace:write' },
          { method: 'PATCH', path: '/api/v1/blog-articles/:id', scope: 'workspace:write' },
          { method: 'DELETE', path: '/api/v1/blog-articles/:id', scope: 'workspace:write' },
          { method: 'GET', path: '/api/v1/business-plans', scope: 'workspace:read' },
          { method: 'POST', path: '/api/v1/business-plans', scope: 'workspace:write' },
          { method: 'PATCH', path: '/api/v1/business-plans/:id', scope: 'workspace:write' },
          { method: 'DELETE', path: '/api/v1/business-plans/:id', scope: 'workspace:write' },
          { method: 'GET', path: '/api/v1/creative-assets/:id/download', scope: 'workspace:read' },
          { method: 'POST', path: '/api/v1/environments/:id/deploy', scope: 'systems:write' },
          { method: 'POST', path: '/api/v1/environments/:id/rollback', scope: 'systems:write' },
          { method: 'POST', path: '/api/v1/cycles/start-next', scope: 'workspace:write' },
          { method: 'GET', path: '/api/v1/reports/changelog?week=current|last', scope: 'workspace:read' },
          { method: 'GET', path: '/api/v1/team-chat/messages?channelId=:id&after=:iso&before=:iso&query=:text&limit=50', scope: 'workspace:read' },
          { method: 'POST', path: '/api/v1/team-chat/channels/:id/participants', scope: 'workspace:write' },
        ],
      },
    };
  }

  if (segments[0] === 'context-routing') {
    if (normalizedMethod !== 'GET') {
      throw new ApiKeyServerError('Method not allowed.', 405);
    }
    if (segments.length !== 3) {
      throw new ApiKeyServerError('Resource not found.', 404);
    }

    const config = getResourceConfig(segments[1]);
    if (!config || !isContextRoutingResource(config.resource)) {
      throw new ApiKeyServerError('Resource not found.', 404);
    }

    const actor = await authorizeExternalCredential(headers, [getContextRoutingReadScope(config.resource)]);
    const debug = url.searchParams.get('debug') === 'true';
    if (debug) {
      assertContextDebugAuthorized(actor);
    }
    const anchor = await getResourceById(config, actor, segments[2]);
    return {
      statusCode: 200,
      body: await addRoutedContext(
        config.resource,
        actor,
        getExternalAuthMode(headers),
        { data: anchor },
        debug,
      ),
    };
  }

  if (segments[0] === 'context-ingestions' && segments[1] === 'extract') {
    if (normalizedMethod !== 'POST') {
      throw new ApiKeyServerError('Method not allowed.', 405);
    }

    await authorizeExternalCredential(headers, ['systems:read']);
    return extractContextPayload(body);
  }

  if (segments[0] === 'operator-mcp-registry') {
    if (normalizedMethod !== 'GET') throw new ApiKeyServerError('Method not allowed.', 405);
    await authorizeExternalCredential(headers, ['workspace:read']);
    return { statusCode: 200, body: { data: OPERATOR_MCP_REGISTRY_ACTIONS, count: OPERATOR_MCP_REGISTRY_ACTIONS.length } };
  }

  if (segments[0] === 'operator-manifest') {
    if (normalizedMethod !== 'GET') throw new ApiKeyServerError('Method not allowed.', 405);
    const actor = await authorizeExternalCredential(headers, ['workspace:read']);
    return { statusCode: 200, body: await buildOperatorManifest(actor, url.searchParams) };
  }

  if (segments[0] === 'operator-work-orders' && segments[1] && (segments[2] === 'claim' || segments[2] === 'release')) {
    if (normalizedMethod !== 'POST') throw new ApiKeyServerError('Method not allowed.', 405);
    const actor = await authorizeExternalCredential(headers, ['workspace:write']);
    return { statusCode: 200, body: await claimOrReleaseWorkOrder(actor, segments[1], body, segments[2]) };
  }

  if (segments[0] === 'operator-approvals' && segments[1] && (segments[2] === 'approve' || segments[2] === 'reject')) {
    if (normalizedMethod !== 'POST') throw new ApiKeyServerError('Method not allowed.', 405);
    const actor = await authorizeExternalCredential(headers, ['workspace:write']);
    return {
      statusCode: 200,
      body: segments[2] === 'approve'
        ? await approveOperatorApproval(actor, segments[1], body)
        : await rejectOperatorApproval(actor, segments[1], body),
    };
  }

  if (segments[0] === 'operator-memories' && segments[1] && ['approve', 'reject', 'archive', 'restore'].includes(String(segments[2]))) {
    if (normalizedMethod !== 'POST') throw new ApiKeyServerError('Method not allowed.', 405);
    const actor = await authorizeExternalCredential(headers, ['workspace:write']);
    const action = String(segments[2]);
    const nextState = action === 'approve' || action === 'restore' ? 'active' : action === 'reject' ? 'rejected' : 'archived';
    return {
      statusCode: 200,
      body: await updateOperatorMemoryStateAction(actor, segments[1], nextState, `operator-memories.${action}`, body),
    };
  }

  if (segments[0] === 'operator-checkins' && normalizedMethod === 'POST') {
    const actor = await authorizeExternalCredential(headers, ['workspace:write']);
    return { statusCode: 200, body: await submitOperatorCheckin(actor, body) };
  }

  if (segments[0] === 'operator-outputs' && normalizedMethod === 'POST') {
    const actor = await authorizeExternalCredential(headers, ['workspace:write']);
    return { statusCode: 200, body: await submitOperatorOutput(actor, body) };
  }

  if (segments[0] === 'context-ingestions') {
    if (normalizedMethod !== 'POST') {
      throw new ApiKeyServerError('Method not allowed.', 405);
    }

    const actor = await authorizeExternalCredential(headers, ['systems:write']);
    const result = await ingestContextPayload(actor, body);
    invalidateContextRoutingCacheForActor(actor);
    return result;
  }

  if (segments[0] === 'environments' && segments[1] && (segments[2] === 'deploy' || segments[2] === 'rollback')) {
    if (normalizedMethod !== 'POST') {
      throw new ApiKeyServerError('Method not allowed.', 405);
    }

    const actor = await authorizeExternalCredential(headers, ['systems:write']);
    const result = await executeEnvironmentAction(actor, segments[1], segments[2]);
    invalidateContextRoutingCacheForActor(actor);
    return {
      statusCode: 200,
      body: await addRoutedContext(
        'environments',
        actor,
        getExternalAuthMode(headers),
        result,
      ),
    };
  }

  if (segments[0] === 'cycles' && segments[1] === 'start-next') {
    if (normalizedMethod !== 'POST') {
      throw new ApiKeyServerError('Method not allowed.', 405);
    }

    const actor = await authorizeExternalCredential(headers, ['workspace:write']);
    const result = await startNextCycle(actor);
    invalidateContextRoutingCacheForActor(actor);
    return {
      statusCode: 200,
      body: result,
    };
  }

  if (segments[0] === 'reports' && segments[1] === 'changelog') {
    if (normalizedMethod !== 'GET') {
      throw new ApiKeyServerError('Method not allowed.', 405);
    }

    const actor = await authorizeExternalCredential(headers, ['workspace:read']);
    return {
      statusCode: 200,
      body: await buildWeeklyChangelog(actor, url.searchParams),
    };
  }

  if (segments[0] === 'team-chat' && segments[1] === 'messages') {
    if (normalizedMethod !== 'GET') {
      throw new ApiKeyServerError('Method not allowed.', 405);
    }

    const actor = await authorizeExternalCredential(headers, ['workspace:read']);
    return {
      statusCode: 200,
      body: await listTeamChatMessages(actor, url.searchParams),
    };
  }

  if (segments[0] === 'team-chat' && segments[1] === 'channels' && segments[2] && segments[3] === 'participants') {
    if (normalizedMethod !== 'POST') {
      throw new ApiKeyServerError('Method not allowed.', 405);
    }

    const actor = await authorizeExternalCredential(headers, ['workspace:write']);
    return {
      statusCode: 200,
      body: await addTeamChatParticipantToChannel(actor, segments[2], body),
    };
  }

  if (segments[0] === 'creative-assets' && segments[1] && segments[2] === 'download') {
    if (normalizedMethod !== 'GET' || segments.length !== 3) {
      throw new ApiKeyServerError('Method not allowed.', 405);
    }

    const actor = await authorizeExternalCredential(headers, ['workspace:read']);
    return {
      statusCode: 200,
      body: await getCreativeAssetDownload(actor, segments[1]),
    };
  }

  const config = getResourceConfig(segments[0]);
  if (!config) {
    throw new ApiKeyServerError('Resource not found.', 404);
  }

  if (segments.length > 2) {
    throw new ApiKeyServerError('Resource not found.', 404);
  }

  const requiredScopes =
    normalizedMethod === 'GET' ? [config.readScope] : config.writeScope ? [config.writeScope] : [];
  if (requiredScopes.length === 0) {
    throw new ApiKeyServerError('Method not allowed.', 405);
  }

  const actor = await authorizeExternalCredential(headers, requiredScopes);
  return handleResourceRequest(
    config,
    normalizedMethod,
    segments[1],
    actor,
    getExternalAuthMode(headers),
    url.searchParams,
    body,
  );
}
