import { GoogleGenAI, type GenerateContentResponse } from '@google/genai';

export type IngestionKind = 'task' | 'vision' | 'cycleGoal' | 'review' | 'plannerItem' | 'video' | 'creative' | 'lead' | 'account';

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
};

type GeminiRateLimitBucket = {
  used: number;
  limit: number;
  resetAt: string;
};

export type GeminiRateLimitSnapshot = {
  requestsPerMinute: GeminiRateLimitBucket;
  tokensPerMinute: GeminiRateLimitBucket;
  requestsPerDay: GeminiRateLimitBucket;
};

export type GeminiIngestionResponse = {
  payload: IngestionPayload;
  usedGemini: boolean;
  model: string;
  rateLimit: GeminiRateLimitSnapshot;
  warning?: string;
};

type GeminiRequestBody = {
  content?: unknown;
  fileName?: unknown;
};

class GeminiRequestError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'GeminiRequestError';
    this.statusCode = statusCode;
  }
}

const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';
const MAX_CONTENT_CHARS = 18_000;
const GEMINI_REQUESTS_PER_MINUTE = 15;
const GEMINI_TOKENS_PER_MINUTE = 250_000;
const GEMINI_REQUESTS_PER_DAY = 500;
const REQUEST_WINDOW_MS = 60_000;
const OUTPUT_TOKEN_RESERVE = 4_096;
const MAX_RETRY_ATTEMPTS = 4;
const BASE_RETRY_DELAY_MS = 1_500;
const MAX_RETRY_DELAY_MS = 12_000;

const INGESTION_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['source', 'items'],
  properties: {
    source: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'aliases', 'summary'],
      properties: {
        title: { type: 'string' },
        aliases: {
          type: 'array',
          items: { type: 'string' },
        },
        summary: { type: 'string' },
      },
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'title', 'summary'],
        properties: {
          kind: {
            type: 'string',
            enum: ['task', 'vision', 'cycleGoal', 'review', 'plannerItem', 'video', 'creative', 'lead', 'account'],
          },
          title: { type: 'string' },
          summary: { type: 'string' },
          description: { type: 'string' },
          matchKey: { type: 'string' },
          aliases: {
            type: 'array',
            items: { type: 'string' },
          },
          status: {
            type: 'string',
            enum: [
              'todo',
              'in-progress',
              'done',
              'icebox',
              'active',
              'completed',
              'archived',
              'idea',
              'brief',
              'draft',
              'in-review',
              'changes-requested',
              'approved',
              'scheduled',
              'published',
              'rejected',
              'positive',
              'neutral',
              'negative',
              'prospect',
              'customer',
              'partner',
              'inactive',
              'new',
              'qualified',
              'contacted',
              'demo-booked',
              'proposal',
              'won',
              'lost',
            ],
          },
          stage: {
            type: 'string',
            enum: ['new', 'qualified', 'contacted', 'demo-booked', 'proposal', 'won', 'lost'],
          },
          effortPoints: {
            type: 'number',
            enum: [1, 2, 3, 5, 8],
          },
          isLeadIndicator: { type: 'boolean' },
          focusItems: {
            type: 'array',
            items: { type: 'string' },
          },
          platform: {
            type: 'string',
            enum: ['Twitter', 'LinkedIn', 'Loom'],
          },
          source: {
            type: 'string',
            enum: ['Discord', 'Twitter', 'Email', 'inbound', 'referral', 'cold-outreach', 'waitlist', 'twitter', 'linkedin', 'email', 'other'],
          },
          sentiment: {
            type: 'string',
            enum: ['positive', 'neutral', 'negative'],
          },
          scheduledFor: { type: 'string' },
          email: { type: 'string' },
          companyName: { type: 'string' },
          accountId: { type: 'string' },
          website: { type: 'string' },
          industry: { type: 'string' },
          size: { type: 'string' },
          notes: { type: 'string' },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
          },
          ownerId: { type: 'string' },
          nextAction: { type: 'string' },
          nextActionAt: { type: 'string' },
          linkedTaskIds: {
            type: 'array',
            items: { type: 'string' },
          },
          creativePlatform: {
            type: 'string',
            enum: ['Instagram', 'LinkedIn', 'X', 'TikTok', 'YouTube', 'Blog', 'Email', 'Other'],
          },
          format: {
            type: 'string',
            enum: ['single-post', 'carousel', 'reel', 'story-sequence', 'motion-brief', 'static-ad', 'thread', 'other'],
          },
          campaign: { type: 'string' },
          audience: { type: 'string' },
          objective: { type: 'string' },
          hook: { type: 'string' },
          brief: { type: 'string' },
          caption: { type: 'string' },
          visualDirection: { type: 'string' },
          productionNotes: { type: 'string' },
          cta: { type: 'string' },
          targetPublishAt: { type: 'string' },
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
  },
} as const;

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

type RateEntry = {
  id: string;
  startedAt: number;
  reservedTokens: number;
};

type RateLimiterState = {
  dayKey: string;
  dailyRequests: number;
  entries: RateEntry[];
};

type GeminiServerGlobals = typeof globalThis & {
  __replofyGeminiClient?: GoogleGenAI;
  __replofyGeminiLimiter?: RateLimiterState;
  __replofyGeminiLock?: Promise<void>;
};

const globalState = globalThis as GeminiServerGlobals;

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

function truncate(value: string, max = MAX_CONTENT_CHARS): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

function uniq(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
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

function getDayKey(now: number) {
  return new Date(now).toISOString().slice(0, 10);
}

function createDefaultState(now: number): RateLimiterState {
  return {
    dayKey: getDayKey(now),
    dailyRequests: 0,
    entries: [],
  };
}

function pruneState(state: RateLimiterState, now: number) {
  const currentDayKey = getDayKey(now);

  if (state.dayKey !== currentDayKey) {
    state.dayKey = currentDayKey;
    state.dailyRequests = 0;
  }

  state.entries = state.entries.filter((entry) => now - entry.startedAt < REQUEST_WINDOW_MS);
  return state;
}

function readState(now: number) {
  if (!globalState.__replofyGeminiLimiter) {
    globalState.__replofyGeminiLimiter = createDefaultState(now);
  }

  return pruneState(globalState.__replofyGeminiLimiter, now);
}

function writeState(state: RateLimiterState) {
  globalState.__replofyGeminiLimiter = state;
}

async function withStateLock<T>(callback: () => T | Promise<T>) {
  const previousLock = globalState.__replofyGeminiLock ?? Promise.resolve();
  let releaseLock: () => void = () => {};

  globalState.__replofyGeminiLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  await previousLock;

  try {
    return await callback();
  } finally {
    releaseLock();
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function estimateTokens(value: unknown) {
  if (value == null) {
    return 0;
  }

  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return Math.max(1, Math.ceil(text.length / 4));
}

function estimateRequestTokens(prompt: string) {
  return estimateTokens(prompt) + OUTPUT_TOKEN_RESERVE;
}

function getRetryDelayMs(attempt: number) {
  const exponentialDelay = Math.min(
    MAX_RETRY_DELAY_MS,
    BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attempt - 1),
  );
  const jitter = Math.floor(Math.random() * 400);
  return exponentialDelay + jitter;
}

function isRetryableError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return [
    '429',
    '503',
    'rate limit',
    'quota',
    'resource exhausted',
    'resource_exhausted',
    'temporarily unavailable',
    'deadline exceeded',
    'timed out',
    'networkerror',
    'failed to fetch',
  ].some((pattern) => message.includes(pattern));
}

function getNextUtcMidnightIso(now: number) {
  const nextMidnight = new Date(now);
  nextMidnight.setUTCHours(24, 0, 0, 0);
  return nextMidnight.toISOString();
}

function getResetAtForWindow(entries: RateEntry[], now: number) {
  if (!entries.length) {
    return new Date(now).toISOString();
  }

  return new Date(entries[0].startedAt + REQUEST_WINDOW_MS).toISOString();
}

function getWaitMsForReservation(state: RateLimiterState, reservedTokens: number, now: number) {
  if (state.dailyRequests >= GEMINI_REQUESTS_PER_DAY) {
    throw new GeminiRequestError(
      `Gemini daily request limit reached (${GEMINI_REQUESTS_PER_DAY} requests per UTC day).`,
      429,
    );
  }

  const recentEntries = [...state.entries].sort((left, right) => left.startedAt - right.startedAt);
  const requestWaitMs =
    recentEntries.length >= GEMINI_REQUESTS_PER_MINUTE
      ? Math.max(0, recentEntries[0].startedAt + REQUEST_WINDOW_MS - now)
      : 0;

  const activeTokenCount = recentEntries.reduce((total, entry) => total + entry.reservedTokens, 0);
  let tokenWaitMs = 0;

  if (activeTokenCount + reservedTokens > GEMINI_TOKENS_PER_MINUTE) {
    let overflow = activeTokenCount + reservedTokens - GEMINI_TOKENS_PER_MINUTE;

    for (const entry of recentEntries) {
      overflow -= entry.reservedTokens;
      tokenWaitMs = Math.max(0, entry.startedAt + REQUEST_WINDOW_MS - now);
      if (overflow <= 0) {
        break;
      }
    }
  }

  return Math.max(requestWaitMs, tokenWaitMs);
}

async function reserveBudget(reservedTokens: number) {
  while (true) {
    const result = await withStateLock<{ id: string } | { waitMs: number }>(() => {
      const now = Date.now();
      const state = readState(now);
      const waitMs = getWaitMsForReservation(state, reservedTokens, now);

      if (waitMs > 0) {
        writeState(state);
        return { waitMs };
      }

      const id = `${now}-${Math.random().toString(36).slice(2, 10)}`;
      state.entries.push({
        id,
        startedAt: now,
        reservedTokens,
      });
      state.dailyRequests += 1;
      writeState(state);
      return { id };
    });

    if ('waitMs' in result) {
      await sleep(result.waitMs + 50);
      continue;
    }

    return result.id;
  }
}

async function updateReservation(reservationId: string, reservedTokens: number) {
  await withStateLock(() => {
    const now = Date.now();
    const state = readState(now);
    const entry = state.entries.find((item) => item.id === reservationId);

    if (entry) {
      entry.reservedTokens = Math.max(1, reservedTokens);
      writeState(state);
    }
  });
}

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new GeminiRequestError('GEMINI_API_KEY is not configured on the server.', 503);
  }

  if (!globalState.__replofyGeminiClient) {
    globalState.__replofyGeminiClient = new GoogleGenAI({ apiKey });
  }

  return globalState.__replofyGeminiClient;
}

function getUsedTokenCount(response: GenerateContentResponse, fallbackTokens: number) {
  const totalTokenCount = response.usageMetadata?.totalTokenCount;
  const promptTokenCount = response.usageMetadata?.promptTokenCount;

  return Math.max(1, totalTokenCount || promptTokenCount || fallbackTokens);
}

function cleanJsonText(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  }
  return trimmed;
}

function safeParsePayload(text: string, fileName: string): IngestionPayload | null {
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

function buildIngestionPrompt(content: string, fileName: string) {
  return `
You are an operations context engine.
Read the document and return strict JSON only.

Return this schema:
{
  "source": {
    "title": "string",
    "aliases": ["string"],
    "summary": "string"
  },
  "items": [
    {
      "kind": "task | vision | cycleGoal | review | plannerItem | video | creative | lead | account",
      "title": "string",
      "summary": "string",
      "description": "string",
      "matchKey": "string",
      "aliases": ["string"],
      "status": "string",
      "stage": "new | qualified | contacted | demo-booked | proposal | won | lost",
      "effortPoints": 1,
      "isLeadIndicator": false,
      "focusItems": ["string"],
      "platform": "Twitter | LinkedIn | Loom",
      "source": "Discord | Twitter | Email | inbound | referral | cold-outreach | waitlist | twitter | linkedin | email | other",
      "sentiment": "positive | neutral | negative",
      "scheduledFor": "ISO-8601 string",
      "email": "string",
      "companyName": "string",
      "accountId": "string",
      "website": "string",
      "industry": "string",
      "size": "string",
      "notes": "string",
      "priority": "low | medium | high",
      "ownerId": "string",
      "nextAction": "string",
      "nextActionAt": "ISO-8601 string",
      "linkedTaskIds": ["string"],
      "creativePlatform": "Instagram | LinkedIn | X | TikTok | YouTube | Blog | Email | Other",
      "format": "single-post | carousel | reel | story-sequence | motion-brief | static-ad | thread | other",
      "campaign": "string",
      "audience": "string",
      "objective": "string",
      "hook": "string",
      "brief": "string",
      "caption": "string",
      "visualDirection": "string",
      "productionNotes": "string",
      "cta": "string",
      "targetPublishAt": "ISO-8601 string",
      "tags": ["string"]
    }
  ]
}

Rules:
- Extract only concrete, atomic work items.
- Never turn headings, section labels, explanatory prose, or implementation options into tasks.
- If the document is mostly informational or outline-like, return an empty items array rather than inventing tasks.
- Use "task" only for explicit actions someone must do. Use other kinds only when the document clearly supports them.
- Use "lead" only when the document clearly names a prospect/contact, demo request, outreach target, waitlist signup, sales-call participant, or customer buying signal.
- Use "account" only when the document clearly identifies a company/account with enough context to track it separately.
- Use "creative" for concrete content ideas, briefs, scripts, campaign concepts, or production directions that belong in Creative Hub.
- Do not infer leads/accounts from vague market categories, personas, competitor names, headings, or examples.
- Prefer updating existing items with the same intent or title, so use a stable matchKey when the file clearly references an existing item.
- Keep summaries short and actionable.
- source.title should be the stable human-readable title for this file.
- source.aliases should include close alternate names and the file stem.

Document name:
${fileName}

Document content:
${truncate(content, MAX_CONTENT_CHARS)}
`;
}

function buildRateLimitSnapshot(now = Date.now()): GeminiRateLimitSnapshot {
  const state = readState(now);
  const minuteUsed = state.entries.length;
  const minuteTokens = state.entries.reduce((total, entry) => total + entry.reservedTokens, 0);

  return {
    requestsPerMinute: {
      used: minuteUsed,
      limit: GEMINI_REQUESTS_PER_MINUTE,
      resetAt: getResetAtForWindow(state.entries, now),
    },
    tokensPerMinute: {
      used: minuteTokens,
      limit: GEMINI_TOKENS_PER_MINUTE,
      resetAt: getResetAtForWindow(state.entries, now),
    },
    requestsPerDay: {
      used: state.dailyRequests,
      limit: GEMINI_REQUESTS_PER_DAY,
      resetAt: getNextUtcMidnightIso(now),
    },
  };
}

function parseRequestBody(input: unknown): { content: string; fileName: string } {
  if (!input || typeof input !== 'object') {
    throw new GeminiRequestError('Request body must be a JSON object.', 400);
  }

  const body = input as GeminiRequestBody;

  if (typeof body.content !== 'string' || !body.content.trim()) {
    throw new GeminiRequestError('content is required.', 400);
  }

  if (typeof body.fileName !== 'string' || !body.fileName.trim()) {
    throw new GeminiRequestError('fileName is required.', 400);
  }

  return {
    content: body.content.trim(),
    fileName: body.fileName.trim(),
  };
}

function buildFallbackResponse(content: string, fileName: string, warning: string): GeminiIngestionResponse {
  return {
    payload: fallbackPayload(content, fileName),
    usedGemini: false,
    model: GEMINI_MODEL,
    rateLimit: buildRateLimitSnapshot(),
    warning,
  };
}

export function getGeminiRateLimitSnapshot() {
  return buildRateLimitSnapshot();
}

export async function handleGeminiIngestionRequest(input: unknown): Promise<GeminiIngestionResponse> {
  const request = parseRequestBody(input);

  if (!process.env.GEMINI_API_KEY) {
    return buildFallbackResponse(
      request.content,
      request.fileName,
      'GEMINI_API_KEY is not configured on the server. Using local parsing.',
    );
  }

  const prompt = buildIngestionPrompt(request.content, request.fileName);
  const estimatedTokens = estimateRequestTokens(prompt);

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const reservationId = await reserveBudget(estimatedTokens);

      try {
        const response = await getClient().models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseJsonSchema: INGESTION_RESPONSE_SCHEMA,
            temperature: 0.2,
            topP: 0.1,
            maxOutputTokens: 2048,
          },
        });

        await updateReservation(reservationId, getUsedTokenCount(response, estimatedTokens));

        const payload = safeParsePayload(response.text || '', request.fileName);
        if (payload) {
          return {
            payload,
            usedGemini: true,
            model: GEMINI_MODEL,
            rateLimit: buildRateLimitSnapshot(),
          };
        }

        const warning = 'Gemini returned invalid JSON. Using local parsing.';
        console.warn(warning);
        return buildFallbackResponse(request.content, request.fileName, warning);
      } catch (error) {
        lastError = error;

        if (attempt < MAX_RETRY_ATTEMPTS && isRetryableError(error)) {
          await sleep(getRetryDelayMs(attempt));
          continue;
        }

        const warning = error instanceof Error ? error.message : 'Gemini request failed.';
        console.warn('Gemini request failed, using local parsing.', error);
        return buildFallbackResponse(request.content, request.fileName, warning);
      }
    } catch (error) {
      lastError = error;

      if (error instanceof GeminiRequestError && error.statusCode === 429) {
        console.warn('Gemini quota exhausted, using local parsing.', error.message);
        return buildFallbackResponse(request.content, request.fileName, error.message);
      }

      const warning = error instanceof Error ? error.message : 'Gemini request failed.';
      console.warn('Gemini reservation failed, using local parsing.', error);
      return buildFallbackResponse(request.content, request.fileName, warning);
    }
  }

  const warning = lastError instanceof Error ? lastError.message : 'Gemini request failed.';
  return buildFallbackResponse(request.content, request.fileName, warning);
}
