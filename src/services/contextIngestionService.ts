import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { requestGeminiIngestion } from './geminiClient';
import { classifyContextDocument, ContextExtractionProposal } from '../utils/contextDocumentClassification';

export type IngestionKind = 'task' | 'vision' | 'cycleGoal' | 'review' | 'plannerItem' | 'video' | 'creative' | 'lead' | 'account';

export type IngestionStatus = 'queued' | 'processing' | 'done' | 'error';

export type IngestionActor = {
  userId: string;
  companyId?: string | null;
};

export type IngestionItem = {
  kind: IngestionKind;
  title: string;
  summary: string;
  description?: string;
  aliases?: string[];
  matchKey?: string;
  status?: 'todo' | 'in-progress' | 'done' | 'icebox' | 'active' | 'completed' | 'archived' | 'idea' | 'brief' | 'draft' | 'in-review' | 'changes-requested' | 'approved' | 'scheduled' | 'published' | 'rejected' | 'positive' | 'neutral' | 'negative' | 'prospect' | 'customer' | 'partner' | 'inactive' | 'new' | 'qualified' | 'contacted' | 'demo-booked' | 'proposal' | 'won' | 'lost';
  stage?: 'new' | 'qualified' | 'contacted' | 'demo-booked' | 'proposal' | 'won' | 'lost';
  effortPoints?: 1 | 2 | 3 | 5 | 8;
  isLeadIndicator?: boolean;
  focusItems?: string[];
  platform?: 'Twitter' | 'LinkedIn' | 'Loom';
  source?: 'Discord' | 'Twitter' | 'Email' | 'inbound' | 'referral' | 'cold-outreach' | 'waitlist' | 'twitter' | 'linkedin' | 'email' | 'other';
  sentiment?: 'positive' | 'neutral' | 'negative';
  scheduledFor?: string;
  email?: string;
  companyName?: string;
  accountId?: string;
  website?: string;
  industry?: string;
  size?: string;
  notes?: string;
  priority?: 'low' | 'medium' | 'high';
  ownerId?: string;
  nextAction?: string;
  nextActionAt?: string;
  linkedTaskIds?: string[];
  creativePlatform?: 'Instagram' | 'LinkedIn' | 'X' | 'TikTok' | 'YouTube' | 'Blog' | 'Email' | 'Other';
  format?: 'single-post' | 'carousel' | 'reel' | 'story-sequence' | 'motion-brief' | 'static-ad' | 'thread' | 'other';
  campaign?: string;
  audience?: string;
  objective?: string;
  hook?: string;
  brief?: string;
  caption?: string;
  visualDirection?: string;
  productionNotes?: string;
  cta?: string;
  targetPublishAt?: string;
  tags?: string[];
};

export type IngestionPayload = {
  source: {
    title: string;
    aliases: string[];
    summary: string;
  };
  items: IngestionItem[];
  contextExtraction?: ContextExtractionProposal;
};

export type IngestionItemAction = {
  title: string;
  kind: IngestionKind;
  action: 'created' | 'updated';
  id: string;
};

export type IngestionResult = {
  fileName: string;
  status: IngestionStatus;
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

type LinkedDoc = {
  id: string;
  title?: string;
  description?: string;
  content?: string;
  sourceIds?: string[];
  sourceVersionIds?: string[];
  sourceKey?: string;
  sourceTitle?: string;
  aliases?: string[];
  matchKey?: string;
  [key: string]: unknown;
};

type ScopeKey = 'authorId' | 'companyId';

const FILE_SUPPORTED_TEXT_TYPES = ['text/plain', 'text/markdown', 'application/json', 'text/csv'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FULL_TEXT_SIZE = 500 * 1024;
const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';

function shouldStoreFullContent(fileName: string, mimeType: string): boolean {
  return mimeType === 'text/plain' || mimeType === 'text/markdown' || /\.(txt|md)$/i.test(fileName);
}

function utf8ByteLength(content: string): number {
  return new TextEncoder().encode(content).byteLength;
}

function validateIngestionSize(fileName: string, mimeType: string, content: string, fileSize: number) {
  if (shouldStoreFullContent(fileName, mimeType)) {
    if (utf8ByteLength(content) > MAX_FULL_TEXT_SIZE) {
      throw new Error('Markdown and TXT content must be 500KB or smaller');
    }
    return;
  }

  if (fileSize > MAX_FILE_SIZE) {
    throw new Error('File size must be 10MB or smaller');
  }
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDomain(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withProtocol).hostname.replace(/^www\./, '');
  } catch {
    return trimmed.replace(/^https?:\/\//i, '').replace(/^www\./, '').split('/')[0];
  }
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

function truncate(value: string, max = 1600): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

function uniq(values: Array<string | undefined | null>): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))
  );
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stripMarkdownDecoration(value: string): string {
  return collapseWhitespace(
    value
      .replace(/^\s*#{1,6}\s+/, '')
      .replace(/^\s*>\s+/, '')
      .replace(/^\s*[-*+]\s+/, '')
      .replace(/^\s*\d+[.)]\s+/, '')
      .replace(/^\s*\[[ xX]\]\s+/, '')
      .replace(/\*\*/g, '')
  );
}

function isSentenceLike(value: string): boolean {
  const words = collapseWhitespace(value).split(/\s+/).filter(Boolean);
  return words.length >= 8 && /[.!?]$/.test(value.trim());
}

function isStructuralNoise(value: string): boolean {
  const trimmed = value.trim();
  const normalized = stripMarkdownDecoration(trimmed);

  if (!normalized) {
    return true;
  }

  if (/^#{1,6}\s+/.test(trimmed)) {
    return true;
  }

  if (/^\*+\s*\*\*[^*]+\*\*\s*:\s*/.test(trimmed)) {
    return true;
  }

  if (/^[A-Za-z][A-Za-z0-9 &/()+,-]{0,40}:\s+.+$/.test(normalized)) {
    return true;
  }

  return isSentenceLike(normalized);
}

const ACTION_VERB_PREFIXES = [
  'add',
  'analyze',
  'audit',
  'build',
  'check',
  'clean up',
  'configure',
  'create',
  'deploy',
  'design',
  'document',
  'evaluate',
  'fix',
  'finalize',
  'harden',
  'implement',
  'improve',
  'instrument',
  'investigate',
  'launch',
  'migrate',
  'monitor',
  'optimize',
  'plan',
  'prepare',
  'refactor',
  'remove',
  'review',
  'schedule',
  'ship',
  'set up',
  'simplify',
  'split',
  'test',
  'triage',
  'update',
  'validate',
  'verify',
  'wire up',
  'write',
] as const;

function looksLikeTaskTitle(value: string): boolean {
  const normalized = stripMarkdownDecoration(value);
  if (!normalized || isStructuralNoise(value)) {
    return false;
  }

  const lower = normalized.toLowerCase();
  if (ACTION_VERB_PREFIXES.some((prefix) => lower === prefix || lower.startsWith(`${prefix} `))) {
    return true;
  }

  return /^\[[ xX]\]\s+/.test(value.trim());
}

function getSourceTitle(fileName: string, sourceTitle?: string) {
  return collapseWhitespace(sourceTitle || stripExtension(fileName) || fileName);
}

function normalizeExtractedItem(item: unknown, sourceTitle: string): IngestionItem | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const normalizedItem = item as Partial<IngestionItem>;
  const kind = normalizedItem.kind;
  const title = typeof normalizedItem.title === 'string' ? collapseWhitespace(normalizedItem.title) : '';

  if (!title || !kind || !['task', 'vision', 'cycleGoal', 'review', 'plannerItem', 'video', 'creative', 'lead', 'account'].includes(kind)) {
    return null;
  }

  if (kind !== 'creative' && normalizeKey(title) === normalizeKey(sourceTitle)) {
    return null;
  }

  if (kind === 'task' && !looksLikeTaskTitle(title)) {
    return null;
  }

  if (kind !== 'task' && isStructuralNoise(title)) {
    return null;
  }

  const summary = typeof normalizedItem.summary === 'string'
    ? collapseWhitespace(normalizedItem.summary)
    : typeof normalizedItem.description === 'string'
      ? collapseWhitespace(normalizedItem.description)
      : '';

  return {
    ...normalizedItem,
    kind,
    title,
    summary,
    description: typeof normalizedItem.description === 'string' ? collapseWhitespace(normalizedItem.description) : undefined,
    aliases: Array.isArray(normalizedItem.aliases) ? uniq(normalizedItem.aliases) : [],
    matchKey: normalizedItem.matchKey || normalizeKey(title),
  } as IngestionItem;
}

function normalizeExtractedPayload(payload: IngestionPayload, fileName: string): IngestionPayload {
  const sourceTitle = getSourceTitle(fileName, payload.source.title);

  return {
    source: {
      title: sourceTitle,
      aliases: uniq([payload.source.title, fileName, stripExtension(fileName), ...payload.source.aliases, sourceTitle]),
      summary: collapseWhitespace(payload.source.summary || `Imported from ${fileName}`),
    },
    items: Array.isArray(payload.items)
      ? payload.items
          .map((item) => normalizeExtractedItem(item, sourceTitle))
          .filter((item): item is IngestionItem => Boolean(item))
      : [],
  };
}

function getScope(actor: IngestionActor): { field: ScopeKey; value: string } {
  if (actor.companyId) {
    return { field: 'companyId', value: actor.companyId };
  }

  return { field: 'authorId', value: actor.userId };
}

async function sha256(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function readPdfAsText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  (pdfjs as any).GlobalWorkerOptions.workerSrc = workerUrl;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await (pdfjs as any).getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item: any) => (typeof item?.str === 'string' ? item.str : ''))
      .join(' ');
    if (text.trim()) {
      pages.push(text.trim());
    }
  }

  return pages.join('\n\n');
}

async function readFileContent(file: File): Promise<{ content: string; mimeType: string }> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return { content: await readPdfAsText(file), mimeType: 'application/pdf' };
  }

  if (!FILE_SUPPORTED_TEXT_TYPES.includes(file.type) && !/\.(txt|md|csv|json)$/i.test(file.name)) {
    throw new Error('Only PDF, text, markdown, CSV, and JSON files are supported');
  }

  const content = await file.text();
  return {
    content,
    mimeType: file.type || 'text/plain',
  };
}

function fallbackPayload(content: string, fileName: string): IngestionPayload {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const title = stripExtension(fileName);
  const summary = lines
    .filter((line) => !/^#{1,6}\s+/.test(line))
    .slice(0, 5)
    .join(' ')
    .slice(0, 400) || `Imported from ${fileName}`;

  const actionableItems = lines
    .filter((line) => /^[-*+]\s+/.test(line) || /^\d+[.)]\s+/.test(line) || /^\[[ xX]\]\s+/.test(line))
    .map((line) => stripMarkdownDecoration(line))
    .filter((line) => looksLikeTaskTitle(line))
    .slice(0, 10);

  return {
    source: {
      title,
      aliases: uniq([fileName, title]),
      summary: collapseWhitespace(summary),
    },
    items: actionableItems.map((line, index) => ({
      kind: 'task',
      title: collapseWhitespace(line).slice(0, 120),
      summary: collapseWhitespace(line).slice(0, 240),
      matchKey: normalizeKey(line),
      effortPoints: index === 0 ? 3 : 1,
      isLeadIndicator: index === 0,
      status: 'todo',
      aliases: [line],
    })),
  };
}

function cleanJsonText(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  }
  return trimmed;
}

function safeParsePayload(text: string, fileName = ''): IngestionPayload | null {
  try {
    const parsed = JSON.parse(cleanJsonText(text));
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const payload = parsed as Partial<IngestionPayload>;
    const source = (payload.source ?? {}) as Partial<IngestionPayload['source']>;
    return normalizeExtractedPayload(
      {
        source: {
          title: typeof source.title === 'string' && source.title.trim() ? collapseWhitespace(source.title) : stripExtension(fileName),
          aliases: Array.isArray(source.aliases) ? source.aliases.filter((alias) => typeof alias === 'string') : [],
          summary: typeof source.summary === 'string' ? collapseWhitespace(source.summary) : '',
        },
        items: Array.isArray(payload.items) ? payload.items : [],
      },
      fileName,
    );
  } catch {
    return null;
  }
}

async function extractPayload(content: string, fileName: string): Promise<IngestionPayload> {
  try {
    const response = await requestGeminiIngestion({
      content,
      fileName,
    });

    return response.payload;
  } catch (error) {
    console.warn('Gemini extraction failed, falling back to local parsing.', error);
    return fallbackPayload(content, fileName);
  }
}

function resolveFieldName(kind: IngestionKind) {
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

function scopeQuery(collectionName: string, actor: IngestionActor) {
  const scope = getScope(actor);
  return query(collection(db, collectionName), where(scope.field, '==', scope.value));
}

async function loadScopedDocs(collectionName: string, actor: IngestionActor): Promise<LinkedDoc[]> {
  const snapshot = await getDocs(scopeQuery(collectionName, actor));
  return snapshot.docs.map((snap) => ({
    id: snap.id,
    ...snap.data(),
  })) as LinkedDoc[];
}

function appendUnique(list: string[] | undefined, value: string): string[] {
  return uniq([...(list || []), value]);
}

function matchBySourceOrTitle(docs: LinkedDoc[], item: IngestionItem, sourceId: string, sourceVersionId: string, collectionName = ''): LinkedDoc | undefined {
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

  // Only reuse an existing document when the item is an explicit title or match-key hit.
  // Never fall back to the first source-linked doc, because that collapses distinct items
  // from the same file into one record.
  const sourceLinkedMatches = docs.filter((doc) => {
    const docSourceIds = Array.isArray(doc.sourceIds) ? doc.sourceIds : [];
    const docVersionIds = Array.isArray(doc.sourceVersionIds) ? doc.sourceVersionIds : [];
    return docSourceIds.includes(sourceId) || docVersionIds.includes(sourceVersionId);
  });

  const linkedTitleMatch = sourceLinkedMatches.find((doc) => normalizeKey(String(doc.title || doc.name || '')) === normalizedTitle);
  if (linkedTitleMatch) {
    return linkedTitleMatch;
  }

  // Only match on explicit matchKey (user-provided stable identifier)
  if (item.matchKey && normalizedMatchKey) {
    const sourceLinkedMatchKeyMatch = sourceLinkedMatches.find((doc) => {
      const docMatchKey = normalizeKey(String(doc.matchKey || ''));
      return docMatchKey === normalizedMatchKey;
    });
    if (sourceLinkedMatchKeyMatch) {
      return sourceLinkedMatchKeyMatch;
    }

    const matchKeyMatch = docs.find((doc) => {
      const docMatchKey = normalizeKey(String(doc.matchKey || ''));
      return docMatchKey === normalizedMatchKey;
    });
    if (matchKeyMatch) return matchKeyMatch;
  }

  // No fuzzy matching — if nothing matches explicitly, create new
  return undefined;
}

function buildCommonLinkPayload(
  sourceId: string,
  sourceVersionId: string,
  sourceKey: string,
  sourceTitle: string,
  sourceVersion: number,
  existing?: LinkedDoc
) {
  return {
    sourceIds: uniq([...(Array.isArray(existing?.sourceIds) ? existing?.sourceIds : []), sourceId]),
    sourceVersionIds: uniq([...(Array.isArray(existing?.sourceVersionIds) ? existing?.sourceVersionIds : []), sourceVersionId]),
    sourceKey,
    sourceTitle,
    sourceVersion,
    sourceUpdatedAt: new Date().toISOString(),
  };
}

function buildTaskPayload(item: IngestionItem, sourceMeta: ReturnType<typeof buildCommonLinkPayload>, existing?: LinkedDoc) {
  const status = item.status && ['todo', 'in-progress', 'done', 'icebox'].includes(item.status) ? item.status : 'todo';
  return {
    title: item.title,
    aliases: uniq([...(item.aliases || []), item.title, item.matchKey]),
    matchKey: item.matchKey || normalizeKey(item.title),
    status,
    effortPoints: item.effortPoints || ((existing?.effortPoints as 1 | 2 | 3 | 5 | 8 | undefined) || 3),
    isLeadIndicator: typeof item.isLeadIndicator === 'boolean' ? item.isLeadIndicator : Boolean(existing?.isLeadIndicator),
    completedAt: status === 'done' ? new Date().toISOString() : null,
    ...sourceMeta,
  };
}

function buildVisionPayload(item: IngestionItem, sourceMeta: ReturnType<typeof buildCommonLinkPayload>) {
  return {
    title: item.title,
    aliases: uniq([...(item.aliases || []), item.title, item.matchKey]),
    matchKey: item.matchKey || normalizeKey(item.title),
    description: item.description || item.summary,
    focusItems: item.focusItems || [item.summary].filter(Boolean),
    ...sourceMeta,
  };
}

function buildCycleGoalPayload(item: IngestionItem, sourceMeta: ReturnType<typeof buildCommonLinkPayload>, existing?: LinkedDoc) {
  const status = item.status && ['active', 'completed', 'archived'].includes(item.status) ? item.status : 'active';
  return {
    title: item.title,
    aliases: uniq([...(item.aliases || []), item.title, item.matchKey]),
    matchKey: item.matchKey || normalizeKey(item.title),
    description: item.description || item.summary,
    status,
    ...sourceMeta,
  };
}

function buildFeedbackPayload(item: IngestionItem, sourceMeta: ReturnType<typeof buildCommonLinkPayload>, existing?: LinkedDoc) {
  return {
    source: item.source || ((existing?.source as string) || 'Email'),
    aliases: uniq([...(item.aliases || []), item.title, item.matchKey]),
    matchKey: item.matchKey || normalizeKey(item.title),
    content: item.description || item.summary,
    sentiment: item.sentiment || ((existing?.sentiment as string) || 'neutral'),
    ...sourceMeta,
  };
}

function buildSocialPostPayload(item: IngestionItem, sourceMeta: ReturnType<typeof buildCommonLinkPayload>, existing?: LinkedDoc) {
  const scheduledFor = item.scheduledFor || (existing?.scheduledFor as string | undefined) || new Date().toISOString();
  return {
    platform: item.platform || ((existing?.platform as string) || 'Loom'),
    aliases: uniq([...(item.aliases || []), item.title, item.matchKey]),
    matchKey: item.matchKey || normalizeKey(item.title),
    content: item.description || item.summary,
    scheduledFor,
    status: item.status && ['draft', 'scheduled', 'published'].includes(item.status)
      ? item.status
      : ((existing?.status as string) || 'draft'),
    ...sourceMeta,
  };
}

function buildCreativeItemPayload(item: IngestionItem, sourceMeta: ReturnType<typeof buildCommonLinkPayload>, existing?: LinkedDoc) {
  const creativeStatuses = ['idea', 'brief', 'draft', 'in-review', 'changes-requested', 'approved', 'scheduled', 'published', 'rejected', 'archived'];
  const status = item.status && creativeStatuses.includes(item.status)
    ? item.status
    : ((existing?.status as string) || 'idea');
  return {
    title: item.title,
    platform: item.creativePlatform || ((existing?.platform as string) || 'Other'),
    format: item.format || ((existing?.format as string) || 'other'),
    campaign: item.campaign || ((existing?.campaign as string) || ''),
    audience: item.audience || ((existing?.audience as string) || ''),
    objective: item.objective || ((existing?.objective as string) || ''),
    hook: item.hook || ((existing?.hook as string) || ''),
    brief: item.brief || item.description || item.summary || ((existing?.brief as string) || ''),
    caption: item.caption || ((existing?.caption as string) || ''),
    visualDirection: item.visualDirection || ((existing?.visualDirection as string) || ''),
    productionNotes: item.productionNotes || item.notes || ((existing?.productionNotes as string) || ''),
    cta: item.cta || ((existing?.cta as string) || ''),
    status,
    ownerId: item.ownerId || ((existing?.ownerId as string) || null),
    approverId: (existing?.approverId as string) || null,
    targetPublishAt: item.targetPublishAt || ((existing?.targetPublishAt as string) || null),
    scheduledFor: item.scheduledFor || ((existing?.scheduledFor as string) || null),
    publishedAt: (existing?.publishedAt as string) || null,
    submittedAt: (existing?.submittedAt as string) || null,
    approvalNotes: (existing?.approvalNotes as string) || '',
    assetIds: Array.isArray(existing?.assetIds) ? existing.assetIds : [],
    tags: uniq([...(Array.isArray(existing?.tags) ? existing.tags as string[] : []), ...(item.tags || [])]),
    aliases: uniq([...(item.aliases || []), item.title, item.matchKey]),
    matchKey: item.matchKey || normalizeKey(item.title),
    updatedAt: new Date().toISOString(),
    ...sourceMeta,
  };
}

function buildAccountPayload(item: IngestionItem, sourceMeta: ReturnType<typeof buildCommonLinkPayload>, existing?: LinkedDoc) {
  const status = item.status && ['prospect', 'customer', 'partner', 'inactive'].includes(item.status)
    ? item.status
    : ((existing?.status as string) || 'prospect');
  return {
    name: item.title,
    website: item.website || ((existing?.website as string) || ''),
    industry: item.industry || ((existing?.industry as string) || ''),
    size: item.size || ((existing?.size as string) || ''),
    notes: item.notes || item.description || item.summary || ((existing?.notes as string) || ''),
    status,
    linkedLeadIds: Array.isArray(existing?.linkedLeadIds) ? existing.linkedLeadIds : [],
    aliases: uniq([...(item.aliases || []), item.title, item.matchKey, item.website]),
    matchKey: item.matchKey || normalizeDomain(item.website || '') || normalizeKey(item.title),
    updatedAt: new Date().toISOString(),
    ...sourceMeta,
  };
}

function buildLeadPayload(item: IngestionItem, sourceMeta: ReturnType<typeof buildCommonLinkPayload>, existing?: LinkedDoc) {
  const stage = item.stage && ['new', 'qualified', 'contacted', 'demo-booked', 'proposal', 'won', 'lost'].includes(item.stage)
    ? item.stage
    : item.status && ['new', 'qualified', 'contacted', 'demo-booked', 'proposal', 'won', 'lost'].includes(item.status)
      ? item.status
      : ((existing?.stage as string) || 'new');
  const source = item.source && ['inbound', 'referral', 'cold-outreach', 'waitlist', 'twitter', 'linkedin', 'email', 'other'].includes(item.source)
    ? item.source
    : ((existing?.source as string) || 'inbound');
  const priority = item.priority && ['low', 'medium', 'high'].includes(item.priority)
    ? item.priority
    : ((existing?.priority as string) || 'medium');
  const email = item.email ? item.email.trim().toLowerCase() : ((existing?.email as string) || '');

  return {
    name: item.title,
    email,
    companyName: item.companyName || ((existing?.companyName as string) || ''),
    accountId: item.accountId || ((existing?.accountId as string) || null),
    source,
    stage,
    priority,
    ownerId: item.ownerId || ((existing?.ownerId as string) || null),
    nextAction: item.nextAction || ((existing?.nextAction as string) || ''),
    nextActionAt: item.nextActionAt || ((existing?.nextActionAt as string) || null),
    notes: item.notes || item.description || item.summary || ((existing?.notes as string) || ''),
    linkedTaskIds: Array.isArray(item.linkedTaskIds)
      ? uniq(item.linkedTaskIds)
      : (Array.isArray(existing?.linkedTaskIds) ? existing.linkedTaskIds : []),
    aliases: uniq([...(item.aliases || []), item.title, item.matchKey, email]),
    matchKey: item.matchKey || email || normalizeKey(item.title),
    updatedAt: new Date().toISOString(),
    ...sourceMeta,
  };
}

async function upsertEntity(
  collectionName: string,
  actor: IngestionActor,
  item: IngestionItem,
  sourceId: string,
  sourceVersionId: string,
  sourceKey: string,
  sourceTitle: string,
  sourceVersion: number
) {
  const docs = await loadScopedDocs(collectionName, actor);
  const existing = matchBySourceOrTitle(docs, item, sourceId, sourceVersionId, collectionName);
  const docRef = existing ? doc(db, collectionName, existing.id) : doc(collection(db, collectionName));
  const sourceMeta = buildCommonLinkPayload(
    sourceId,
    sourceVersionId,
    sourceKey,
    sourceTitle,
    sourceVersion,
    existing
  );

  let payload: Record<string, unknown>;

  switch (collectionName) {
    case 'tasks':
      payload = buildTaskPayload(item, sourceMeta, existing);
      break;
    case 'visions':
      payload = buildVisionPayload(item, sourceMeta);
      break;
    case 'cycleGoals':
      payload = buildCycleGoalPayload(item, sourceMeta, existing);
      break;
    case 'feedbacks':
      payload = buildFeedbackPayload(item, sourceMeta, existing);
      break;
    case 'socialPosts':
      payload = buildSocialPostPayload(item, sourceMeta, existing);
      break;
    case 'creativeItems':
      payload = buildCreativeItemPayload(item, sourceMeta, existing);
      break;
    case 'accounts':
      payload = buildAccountPayload(item, sourceMeta, existing);
      break;
    case 'leads':
      payload = buildLeadPayload(item, sourceMeta, existing);
      break;
    default:
      payload = {
        title: item.title,
        description: item.description || item.summary,
        ...sourceMeta,
      };
  }

  if (existing) {
    await updateDoc(docRef, {
      ...payload,
      authorId: actor.userId,
      companyId: actor.companyId ?? null,
    });
    return { id: existing.id, action: 'updated' as const };
  }

  const createdAt = new Date().toISOString();
  const createPayload = {
    ...payload,
    createdAt,
    authorId: actor.userId,
    companyId: actor.companyId ?? null,
  };

  await setDoc(docRef, createPayload);
  return { id: docRef.id, action: 'created' as const };
}

async function upsertSourceRecord(
  actor: IngestionActor,
  payload: IngestionPayload,
  fileName: string,
  mimeType: string,
  fileSize: number,
  contentHash: string,
  sourceText: string
) {
  const scope = getScope(actor);
  const normalizedTitle = normalizeKey(payload.source.title || stripExtension(fileName));
  const aliases = uniq([payload.source.title, fileName, stripExtension(fileName), ...payload.source.aliases]);
  const sourceSnapshot = await getDocs(scopeQuery('contextSources', actor));
  const existing = sourceSnapshot.docs
    .map((snap) => ({ id: snap.id, ...snap.data() }) as LinkedDoc)
    .find((docSnap) => {
      const docAliases = Array.isArray(docSnap.aliases) ? docSnap.aliases.map((alias) => normalizeKey(alias)) : [];
      return (
        normalizeKey(String(docSnap.normalizedTitle || docSnap.title || '')) === normalizedTitle ||
        normalizeKey(String(docSnap.sourceKey || '')) === normalizedTitle ||
        docAliases.includes(normalizedTitle) ||
        docAliases.includes(normalizeKey(fileName))
      );
    });

  const sourceRef = existing ? doc(db, 'contextSources', existing.id) : doc(collection(db, 'contextSources'));
  const sourceId = sourceRef.id;
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
    linkedTaskIds: existing?.linkedTaskIds || [],
    linkedVisionIds: existing?.linkedVisionIds || [],
    linkedCycleGoalIds: existing?.linkedCycleGoalIds || [],
    linkedFeedbackIds: existing?.linkedFeedbackIds || [],
    linkedSocialPostIds: existing?.linkedSocialPostIds || [],
    linkedCreativeItemIds: existing?.linkedCreativeItemIds || [],
    linkedLeadIds: existing?.linkedLeadIds || [],
    linkedAccountIds: existing?.linkedAccountIds || [],
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastUploadedAt: new Date().toISOString(),
    authorId: actor.userId,
    companyId: actor.companyId ?? null,
    status: 'active' as const,
  };

  if (existing) {
    await updateDoc(sourceRef, {
      ...sourceMeta,
      aliases: Array.from(new Set([...(existing.aliases || []), ...aliases])),
    });
  } else {
    await setDoc(sourceRef, sourceMeta);
  }

  return {
    sourceId,
    sourceKey: normalizedTitle,
    sourceTitle: sourceMeta.title,
    sourceVersion: nextVersion,
    linkedTaskIds: Array.isArray(existing?.linkedTaskIds) ? existing.linkedTaskIds : [],
    linkedVisionIds: Array.isArray(existing?.linkedVisionIds) ? existing.linkedVisionIds : [],
    linkedCycleGoalIds: Array.isArray(existing?.linkedCycleGoalIds) ? existing.linkedCycleGoalIds : [],
    linkedFeedbackIds: Array.isArray(existing?.linkedFeedbackIds) ? existing.linkedFeedbackIds : [],
    linkedSocialPostIds: Array.isArray(existing?.linkedSocialPostIds) ? existing.linkedSocialPostIds : [],
    linkedCreativeItemIds: Array.isArray(existing?.linkedCreativeItemIds) ? existing.linkedCreativeItemIds : [],
    linkedLeadIds: Array.isArray(existing?.linkedLeadIds) ? existing.linkedLeadIds : [],
    linkedAccountIds: Array.isArray(existing?.linkedAccountIds) ? existing.linkedAccountIds : [],
  };
}

async function createSourceVersion(
  actor: IngestionActor,
  sourceId: string,
  sourceKey: string,
  sourceVersion: number,
  fileName: string,
  mimeType: string,
  fileSize: number,
  contentHash: string,
  content: string,
  payload: IngestionPayload
) {
  const versionRef = doc(collection(db, 'contextSourceVersions'));
  const versionId = versionRef.id;
  const storesFullContent = shouldStoreFullContent(fileName, mimeType);
  const versionDoc = {
    sourceId,
    sourceKey,
    version: sourceVersion,
    fileName,
    mimeType,
    fileSize,
    contentHash,
    contentPreview: truncate(content, 1800),
    ...(storesFullContent ? { fullContent: content } : {}),
    contentStorage: storesFullContent ? 'full' as const : 'preview-only' as const,
    routingContentAvailable: storesFullContent,
    payload,
    linkedTaskIds: [] as string[],
    linkedVisionIds: [] as string[],
    linkedCycleGoalIds: [] as string[],
    linkedFeedbackIds: [] as string[],
    linkedSocialPostIds: [] as string[],
    linkedCreativeItemIds: [] as string[],
    linkedLeadIds: [] as string[],
    linkedAccountIds: [] as string[],
    createdAt: new Date().toISOString(),
    authorId: actor.userId,
    companyId: actor.companyId ?? null,
    status: 'processed' as const,
  };

  await setDoc(versionRef, versionDoc);
  return { versionId };
}

export async function extractFilePayload(file: File): Promise<{ payload: IngestionPayload; content: string; mimeType: string; contentHash: string; fileSize: number }> {
  const { content, mimeType } = await readFileContent(file);
  validateIngestionSize(file.name, mimeType, content, file.size);
  const contentHash = await sha256(content);
  const payload = await extractPayload(content, file.name);
  payload.contextExtraction = classifyContextDocument(file.name, content);
  return { payload, content, mimeType, contentHash, fileSize: file.size };
}

export async function processPayload(
  file: File,
  actor: IngestionActor,
  payload: IngestionPayload,
  content: string,
  mimeType: string,
  contentHash: string,
  fileSize: number
): Promise<IngestionResult> {
  const resultBase: IngestionResult = {
    fileName: file.name,
    status: 'queued',
    linkedTaskIds: [],
    linkedVisionIds: [],
    linkedCycleGoalIds: [],
    linkedFeedbackIds: [],
    linkedSocialPostIds: [],
    linkedCreativeItemIds: [],
    linkedLeadIds: [],
    linkedAccountIds: [],
    actions: [],
    createdAt: new Date().toISOString(),
  };

  try {
    const source = await upsertSourceRecord(actor, payload, file.name, mimeType, fileSize, contentHash, content);
    const version = await createSourceVersion(
      actor,
      source.sourceId,
      source.sourceKey,
      source.sourceVersion,
      file.name,
      mimeType,
      fileSize,
      contentHash,
      content,
      payload
    );

    const sourceMeta = buildCommonLinkPayload(
      source.sourceId,
      version.versionId,
      source.sourceKey,
      source.sourceTitle,
      source.sourceVersion
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
      const kind = item.kind;
      const collectionName = resolveFieldName(kind);
      const upserted = await upsertEntity(
        collectionName,
        actor,
        item,
        source.sourceId,
        version.versionId,
        source.sourceKey,
        source.sourceTitle,
        source.sourceVersion
      );

      actions.push({ title: item.title, kind, action: upserted.action, id: upserted.id });

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

    await updateDoc(doc(db, 'contextSources', source.sourceId), {
      linkedTaskIds: uniq([...(source.linkedTaskIds || []), ...linkedTaskIds]),
      linkedVisionIds: uniq([...(source.linkedVisionIds || []), ...linkedVisionIds]),
      linkedCycleGoalIds: uniq([...(source.linkedCycleGoalIds || []), ...linkedCycleGoalIds]),
      linkedFeedbackIds: uniq([...(source.linkedFeedbackIds || []), ...linkedFeedbackIds]),
      linkedSocialPostIds: uniq([...(source.linkedSocialPostIds || []), ...linkedSocialPostIds]),
      linkedCreativeItemIds: uniq([...(source.linkedCreativeItemIds || []), ...linkedCreativeItemIds]),
      linkedLeadIds: uniq([...(source.linkedLeadIds || []), ...linkedLeadIds]),
      linkedAccountIds: uniq([...(source.linkedAccountIds || []), ...linkedAccountIds]),
      updatedAt: new Date().toISOString(),
    });

    await updateDoc(doc(db, 'contextSourceVersions', version.versionId), {
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
      error: error instanceof Error ? error.message : 'Failed to process file',
    };
  }
}

export async function processContextFile(file: File, actor: IngestionActor): Promise<IngestionResult> {
  const resultBase: IngestionResult = {
    fileName: file.name,
    status: 'queued',
    linkedTaskIds: [],
    linkedVisionIds: [],
    linkedCycleGoalIds: [],
    linkedFeedbackIds: [],
    linkedSocialPostIds: [],
    linkedCreativeItemIds: [],
    linkedLeadIds: [],
    linkedAccountIds: [],
    actions: [],
    createdAt: new Date().toISOString(),
  };

  try {
    const { content, mimeType } = await readFileContent(file);
    validateIngestionSize(file.name, mimeType, content, file.size);
    const contentHash = await sha256(content);
    const payload = await extractPayload(content, file.name);
    payload.contextExtraction = classifyContextDocument(file.name, content);
    const source = await upsertSourceRecord(actor, payload, file.name, mimeType, file.size, contentHash, content);
    const version = await createSourceVersion(
      actor,
      source.sourceId,
      source.sourceKey,
      source.sourceVersion,
      file.name,
      mimeType,
      file.size,
      contentHash,
      content,
      payload
    );

    const sourceMeta = buildCommonLinkPayload(
      source.sourceId,
      version.versionId,
      source.sourceKey,
      source.sourceTitle,
      source.sourceVersion
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
      const kind = item.kind;
      const collectionName = resolveFieldName(kind);
      const upserted = await upsertEntity(
        collectionName,
        actor,
        item,
        source.sourceId,
        version.versionId,
        source.sourceKey,
        source.sourceTitle,
        source.sourceVersion
      );

      actions.push({ title: item.title, kind, action: upserted.action, id: upserted.id });

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

    await updateDoc(doc(db, 'contextSources', source.sourceId), {
      linkedTaskIds: uniq([...(source.linkedTaskIds || []), ...linkedTaskIds]),
      linkedVisionIds: uniq([...(source.linkedVisionIds || []), ...linkedVisionIds]),
      linkedCycleGoalIds: uniq([...(source.linkedCycleGoalIds || []), ...linkedCycleGoalIds]),
      linkedFeedbackIds: uniq([...(source.linkedFeedbackIds || []), ...linkedFeedbackIds]),
      linkedSocialPostIds: uniq([...(source.linkedSocialPostIds || []), ...linkedSocialPostIds]),
      linkedCreativeItemIds: uniq([...(source.linkedCreativeItemIds || []), ...linkedCreativeItemIds]),
      linkedLeadIds: uniq([...(source.linkedLeadIds || []), ...linkedLeadIds]),
      linkedAccountIds: uniq([...(source.linkedAccountIds || []), ...linkedAccountIds]),
      updatedAt: new Date().toISOString(),
    });

    await updateDoc(doc(db, 'contextSourceVersions', version.versionId), {
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
      error: error instanceof Error ? error.message : 'Failed to process file',
    };
  }
}

export async function processContextFiles(files: File[], actor: IngestionActor): Promise<IngestionResult[]> {
  const results: IngestionResult[] = [];

  for (const file of files) {
    results.push(await processContextFile(file, actor));
  }

  return results;
}
