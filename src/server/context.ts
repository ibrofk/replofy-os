import { createHash } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { IngestionItem, IngestionPayload } from '../services/geminiServer.js';
import type { WorkspaceRepository as PostgresDatabase } from './platform/workspace-repository.js';
import { GeminiAIProvider } from './platform/gemini-ai-provider.js';
import type { AIProvider } from './platform/ai-provider.js';
import {
  contextSource,
  contextSourceFolder,
  contextSourceItem,
  contextSourceVersion,
} from './db/schema.js';
import type { WorkspaceActor } from './execution/tasks.js';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FULL_TEXT_SIZE_BYTES = 500 * 1024;
const ingestionKinds = ['task', 'vision', 'cycleGoal', 'review', 'plannerItem', 'video', 'creative', 'lead', 'account'] as const;
const sourceStatuses = ['active', 'archived'] as const;
const itemStatuses = ['proposed', 'accepted', 'rejected', 'archived'] as const;

const payloadItemSchema = z.object({
  kind: z.enum(ingestionKinds),
  title: z.string().trim().min(1).max(240),
  summary: z.string().max(4_000).default(''),
}).passthrough();
const ingestionPayloadSchema = z.object({
  source: z.object({
    title: z.string().trim().min(1).max(240),
    aliases: z.array(z.string().trim().min(1).max(240)).max(100).default([]),
    summary: z.string().max(4_000).default(''),
  }),
  items: z.array(payloadItemSchema).max(500).default([]),
});
const ingestionRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(260),
  content: z.string().min(1).max(MAX_FILE_SIZE_BYTES),
  mimeType: z.string().trim().min(1).max(100).default('text/plain'),
  fileSize: z.number().int().positive().max(MAX_FILE_SIZE_BYTES).optional(),
  payload: ingestionPayloadSchema.optional(),
});
const sourceFiltersSchema = z.object({ status: z.enum(sourceStatuses).optional() });
const itemFiltersSchema = z.object({ sourceId: z.string().uuid().optional(), status: z.enum(itemStatuses).optional() });
const sourceUpdateSchema = z.object({
  status: z.enum(sourceStatuses).optional(),
  folderId: z.string().uuid().nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one context source field is required.');
const folderSchema = z.object({ name: z.string().trim().min(1).max(120) });
const itemUpdateSchema = z.object({ status: z.enum(itemStatuses) });
const defaultAIProvider: AIProvider = new GeminiAIProvider();

export class ContextError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'ContextError';
  }
}

function parse<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ContextError(result.error.issues[0]?.message || message, 400);
  return result.data;
}

function normalizeKey(value: string) {
  return value.toLowerCase().trim().replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 240);
}

function stripExtension(value: string) {
  return value.replace(/\.[^.]+$/, '');
}

function hashContent(content: string) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function shouldStoreFullContent(fileName: string, mimeType: string, byteSize: number) {
  return byteSize <= MAX_FULL_TEXT_SIZE_BYTES && (
    mimeType === 'text/plain' || mimeType === 'text/markdown' || /\.(txt|md|markdown)$/i.test(fileName)
  );
}

function serializeSource(row: typeof contextSource.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    normalizedTitle: row.normalizedTitle,
    aliases: row.aliases,
    sourceKey: row.sourceKey,
    latestVersion: row.latestVersion,
    latestFileName: row.latestFileName,
    latestMimeType: row.latestMimeType,
    latestSummary: row.latestSummary,
    linkedTaskIds: row.linkedTaskIds,
    linkedVisionIds: row.linkedVisionIds,
    linkedCycleGoalIds: row.linkedCycleGoalIds,
    linkedFeedbackIds: row.linkedFeedbackIds,
    linkedSocialPostIds: row.linkedSocialPostIds,
    linkedCreativeItemIds: row.linkedCreativeItemIds,
    linkedLeadIds: row.linkedLeadIds,
    linkedAccountIds: row.linkedAccountIds,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastUploadedAt: row.lastUploadedAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
    status: row.status,
    folderId: row.folderId,
  };
}

function serializeVersion(row: typeof contextSourceVersion.$inferSelect) {
  return {
    id: row.id,
    sourceId: row.sourceId,
    sourceKey: row.sourceKey,
    version: row.version,
    fileName: row.fileName,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    contentHash: row.contentHash,
    contentPreview: row.contentPreview,
    ...(row.fullContent !== null ? { fullContent: row.fullContent } : {}),
    contentStorage: row.contentStorage,
    routingContentAvailable: row.routingContentAvailable,
    payload: row.payload,
    linkedTaskIds: row.linkedTaskIds,
    linkedVisionIds: row.linkedVisionIds,
    linkedCycleGoalIds: row.linkedCycleGoalIds,
    linkedFeedbackIds: row.linkedFeedbackIds,
    linkedSocialPostIds: row.linkedSocialPostIds,
    linkedCreativeItemIds: row.linkedCreativeItemIds,
    linkedLeadIds: row.linkedLeadIds,
    linkedAccountIds: row.linkedAccountIds,
    createdAt: row.createdAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
    status: row.status,
  };
}

function serializeItem(row: typeof contextSourceItem.$inferSelect) {
  return {
    id: row.id,
    sourceId: row.sourceId,
    sourceVersionId: row.sourceVersionId,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    payload: row.payload,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

function serializeFolder(row: typeof contextSourceFolder.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

function parseIngestionRequest(input: unknown) {
  const request = parse(ingestionRequestSchema, input, 'Context ingestion request is invalid.');
  const contentSize = Buffer.byteLength(request.content, 'utf8');
  const fileSize = request.fileSize ?? contentSize;
  if (contentSize > MAX_FILE_SIZE_BYTES) throw new ContextError('Context file is too large.', 413);
  if (fileSize !== contentSize) throw new ContextError('fileSize must match the UTF-8 content size.', 400);
  return { ...request, fileSize };
}

function parsePayload(input: unknown) {
  return parse(ingestionPayloadSchema, input, 'Extracted context payload is invalid.') as IngestionPayload;
}

export async function extractContextPayload(input: unknown, aiProvider: AIProvider = defaultAIProvider) {
  const request = parseIngestionRequest(input);
  const extraction = await aiProvider.extractContext({ fileName: request.fileName, content: request.content });
  return {
    fileName: request.fileName,
    mimeType: request.mimeType,
    fileSize: request.fileSize,
    contentHash: hashContent(request.content),
    payload: extraction.payload,
    usedGemini: extraction.usedGemini,
    model: extraction.model,
    warning: extraction.warning,
    rateLimit: extraction.rateLimit,
  };
}

export async function ingestContext(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  input: unknown,
  aiProvider: AIProvider = defaultAIProvider,
) {
  const request = parseIngestionRequest(input);
  const extraction = request.payload
    ? null
    : await aiProvider.extractContext({ fileName: request.fileName, content: request.content });
  const payload = parsePayload(request.payload ?? extraction?.payload);
  const contentHash = hashContent(request.content);
  const sourceTitle = payload.source.title || stripExtension(request.fileName);
  const normalizedTitle = normalizeKey(sourceTitle || request.fileName);
  const aliases = [...new Set([sourceTitle, request.fileName, stripExtension(request.fileName), ...payload.source.aliases].map((item) => item.trim()).filter(Boolean))];

  const result = await database.transaction(async (transaction) => {
    const candidates = await transaction.select().from(contextSource).where(eq(contextSource.workspaceId, actor.workspaceId));
    const existing = candidates.find((row) => row.sourceKey === normalizedTitle || row.normalizedTitle === normalizedTitle || row.aliases.some((alias) => normalizeKey(alias) === normalizedTitle));
    const now = new Date();
    const sourceRows = existing
      ? await transaction.update(contextSource).set({
          title: sourceTitle,
          normalizedTitle,
          aliases: [...new Set([...existing.aliases, ...aliases])],
          latestVersion: existing.latestVersion + 1,
          latestFileName: request.fileName,
          latestMimeType: request.mimeType,
          latestSummary: payload.source.summary || request.content.slice(0, 500),
          lastUploadedAt: now,
          status: 'active',
          updatedAt: now,
        }).where(and(eq(contextSource.workspaceId, actor.workspaceId), eq(contextSource.id, existing.id))).returning()
      : await transaction.insert(contextSource).values({
          workspaceId: actor.workspaceId,
          title: sourceTitle,
          normalizedTitle,
          aliases,
          sourceKey: normalizedTitle,
          latestVersion: 1,
          latestFileName: request.fileName,
          latestMimeType: request.mimeType,
          latestSummary: payload.source.summary || request.content.slice(0, 500),
          createdByUserId: actor.userId,
          lastUploadedAt: now,
          status: 'active',
        }).returning();
    const source = sourceRows[0];
    const storesFullContent = shouldStoreFullContent(request.fileName, request.mimeType, request.fileSize);
    const versionRows = await transaction.insert(contextSourceVersion).values({
      workspaceId: actor.workspaceId,
      sourceId: source.id,
      sourceKey: source.sourceKey,
      version: source.latestVersion,
      fileName: request.fileName,
      mimeType: request.mimeType,
      fileSize: request.fileSize,
      contentHash,
      contentPreview: request.content.slice(0, 1_800),
      fullContent: storesFullContent ? request.content : null,
      contentStorage: storesFullContent ? 'full' : 'preview-only',
      routingContentAvailable: storesFullContent,
      payload: payload as unknown as Record<string, unknown>,
      createdByUserId: actor.userId,
      status: 'processed',
      createdAt: now,
    }).returning();
    const version = versionRows[0];
    const priorItems = await transaction.select().from(contextSourceItem).where(and(
      eq(contextSourceItem.workspaceId, actor.workspaceId), eq(contextSourceItem.sourceId, source.id),
    ));
    const actions: Array<{ title: string; kind: IngestionItem['kind']; action: 'created' | 'updated'; id: string }> = [];
    for (const item of payload.items) {
      const itemKey = typeof item.matchKey === 'string' && item.matchKey.trim() ? item.matchKey.trim() : normalizeKey(`${item.kind}-${item.title}`);
      const previous = priorItems.find((candidate) => candidate.kind === item.kind && candidate.payload && (candidate.payload as { matchKey?: unknown }).matchKey === itemKey && candidate.status !== 'archived');
      const itemPayload = { ...(item as unknown as Record<string, unknown>), matchKey: itemKey };
      if (previous) {
        const updated = await transaction.update(contextSourceItem).set({
          sourceVersionId: version.id,
          title: item.title,
          summary: item.summary || '',
          payload: itemPayload,
          status: 'proposed',
          updatedAt: now,
        }).where(and(eq(contextSourceItem.workspaceId, actor.workspaceId), eq(contextSourceItem.id, previous.id))).returning();
        actions.push({ title: item.title, kind: item.kind, action: 'updated', id: updated[0].id });
      } else {
        const created = await transaction.insert(contextSourceItem).values({
          workspaceId: actor.workspaceId,
          sourceId: source.id,
          sourceVersionId: version.id,
          kind: item.kind,
          title: item.title,
          summary: item.summary || '',
          payload: itemPayload,
          status: 'proposed',
          createdByUserId: actor.userId,
        }).returning();
        actions.push({ title: item.title, kind: item.kind, action: 'created', id: created[0].id });
      }
    }
    return { source, version, actions };
  });

  return {
    result: {
      fileName: request.fileName,
      status: 'done' as const,
      sourceId: result.source.id,
      sourceVersionId: result.version.id,
      sourceTitle: result.source.title,
      sourceVersion: result.source.latestVersion,
      linkedTaskIds: [],
      linkedVisionIds: [],
      linkedCycleGoalIds: [],
      linkedFeedbackIds: [],
      linkedSocialPostIds: [],
      linkedCreativeItemIds: [],
      linkedLeadIds: [],
      linkedAccountIds: [],
      actions: result.actions,
      createdAt: result.version.createdAt.toISOString(),
      proposedItemsOnly: true,
    },
    extraction: extraction ? {
      usedGemini: extraction.usedGemini,
      model: extraction.model,
      warning: extraction.warning,
      rateLimit: extraction.rateLimit,
    } : null,
  };
}

export async function listContextSources(database: PostgresDatabase, actor: WorkspaceActor, query: Record<string, unknown> = {}) {
  const filters = parse(sourceFiltersSchema, query, 'Context source filters are invalid.');
  const rows = await database.select().from(contextSource).where(and(
    eq(contextSource.workspaceId, actor.workspaceId),
    filters.status ? eq(contextSource.status, filters.status) : undefined,
  )).orderBy(desc(contextSource.updatedAt)).limit(300);
  return rows.map(serializeSource);
}

export async function getContextSource(database: PostgresDatabase, actor: WorkspaceActor, sourceId: string) {
  const id = parse(z.string().uuid(), sourceId, 'Context source id is invalid.');
  const rows = await database.select().from(contextSource).where(and(eq(contextSource.workspaceId, actor.workspaceId), eq(contextSource.id, id))).limit(1);
  if (!rows[0]) throw new ContextError('Context source not found.', 404);
  return serializeSource(rows[0]);
}

export async function updateContextSource(database: PostgresDatabase, actor: WorkspaceActor, sourceId: string, input: unknown) {
  const id = parse(z.string().uuid(), sourceId, 'Context source id is invalid.');
  const data = parse(sourceUpdateSchema, input, 'Context source update is invalid.');
  const rows = await database.update(contextSource).set({ ...data, updatedAt: new Date() }).where(and(
    eq(contextSource.workspaceId, actor.workspaceId), eq(contextSource.id, id),
  )).returning();
  if (!rows[0]) throw new ContextError('Context source not found.', 404);
  return serializeSource(rows[0]);
}

export async function listContextSourceVersions(database: PostgresDatabase, actor: WorkspaceActor, sourceId: string) {
  const id = parse(z.string().uuid(), sourceId, 'Context source id is invalid.');
  const rows = await database.select().from(contextSourceVersion).where(and(
    eq(contextSourceVersion.workspaceId, actor.workspaceId), eq(contextSourceVersion.sourceId, id),
  )).orderBy(desc(contextSourceVersion.version)).limit(100);
  return rows.map(serializeVersion);
}

export async function getContextSourceVersion(database: PostgresDatabase, actor: WorkspaceActor, versionId: string) {
  const id = parse(z.string().uuid(), versionId, 'Context source version id is invalid.');
  const rows = await database.select().from(contextSourceVersion).where(and(eq(contextSourceVersion.workspaceId, actor.workspaceId), eq(contextSourceVersion.id, id))).limit(1);
  if (!rows[0]) throw new ContextError('Context source version not found.', 404);
  return serializeVersion(rows[0]);
}

export async function listContextSourceItems(database: PostgresDatabase, actor: WorkspaceActor, query: Record<string, unknown> = {}) {
  const filters = parse(itemFiltersSchema, query, 'Context item filters are invalid.');
  const rows = await database.select().from(contextSourceItem).where(and(
    eq(contextSourceItem.workspaceId, actor.workspaceId),
    filters.sourceId ? eq(contextSourceItem.sourceId, filters.sourceId) : undefined,
    filters.status ? eq(contextSourceItem.status, filters.status) : undefined,
  )).orderBy(desc(contextSourceItem.updatedAt)).limit(500);
  return rows.map(serializeItem);
}

export async function updateContextSourceItem(database: PostgresDatabase, actor: WorkspaceActor, itemId: string, input: unknown) {
  const id = parse(z.string().uuid(), itemId, 'Context item id is invalid.');
  const data = parse(itemUpdateSchema, input, 'Context item update is invalid.');
  const rows = await database.update(contextSourceItem).set({ ...data, updatedAt: new Date() }).where(and(
    eq(contextSourceItem.workspaceId, actor.workspaceId), eq(contextSourceItem.id, id),
  )).returning();
  if (!rows[0]) throw new ContextError('Context item not found.', 404);
  return serializeItem(rows[0]);
}

export async function listContextSourceFolders(database: PostgresDatabase, actor: WorkspaceActor) {
  const rows = await database.select().from(contextSourceFolder).where(eq(contextSourceFolder.workspaceId, actor.workspaceId)).orderBy(contextSourceFolder.name).limit(200);
  return rows.map(serializeFolder);
}

export async function createContextSourceFolder(database: PostgresDatabase, actor: WorkspaceActor, input: unknown) {
  const data = parse(folderSchema, input, 'Context source folder is invalid.');
  try {
    const rows = await database.insert(contextSourceFolder).values({ workspaceId: actor.workspaceId, createdByUserId: actor.userId, name: data.name }).returning();
    return serializeFolder(rows[0]);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new ContextError('A folder with this name already exists.', 409);
    throw error;
  }
}
