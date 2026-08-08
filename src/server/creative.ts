import { randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkspaceRepository as PostgresDatabase } from './platform/workspace-repository.js';
import { creativeAsset, creativeItem, workspaceMembership } from './db/schema.js';
import type { WorkspaceActor } from './execution/tasks.js';
import type { AssetStore, AssetStoreProvider, StoredAsset } from './platform/asset-store.js';

const platforms = ['Instagram', 'LinkedIn', 'X', 'TikTok', 'YouTube', 'Blog', 'Email', 'Other'] as const;
const formats = ['single-post', 'carousel', 'reel', 'story-sequence', 'motion-brief', 'static-ad', 'thread', 'other'] as const;
const statuses = ['idea', 'brief', 'draft', 'in-review', 'changes-requested', 'approved', 'scheduled', 'published', 'rejected', 'archived'] as const;
const assetTypes = ['image', 'video', 'document', 'source', 'other'] as const;
const assetStatuses = ['uploading', 'active', 'archived', 'error'] as const;
const text = (max: number) => z.string().trim().max(max);
const nullableDate = z.string().datetime().nullable();

const itemCreateSchema = z.object({
  title: text(200).min(1),
  platform: z.enum(platforms).default('Instagram'),
  format: z.enum(formats).default('single-post'),
  campaign: text(500).default(''),
  audience: text(2_000).default(''),
  objective: text(2_000).default(''),
  hook: text(8_000).default(''),
  brief: text(40_000).default(''),
  caption: text(40_000).default(''),
  visualDirection: text(20_000).default(''),
  productionNotes: text(20_000).default(''),
  cta: text(4_000).default(''),
  status: z.enum(statuses).default('idea'),
  ownerId: z.string().min(1).max(200).nullable().optional(),
  approverId: z.string().min(1).max(200).nullable().optional(),
  targetPublishAt: nullableDate.optional(),
  scheduledFor: nullableDate.optional(),
  publishedAt: nullableDate.optional(),
  submittedAt: nullableDate.optional(),
  approvalNotes: text(8_000).default(''),
  tags: z.array(text(100).min(1)).max(100).default([]),
  sourceLineage: z.record(z.string(), z.unknown()).default({}),
});
const itemUpdateSchema = itemCreateSchema.partial();
const assetUploadSchema = z.object({
  fileName: text(220).min(1),
  mimeType: text(160).min(1),
  fileSize: z.number().int().min(1).max(250 * 1024 * 1024),
  title: text(200).min(1).optional(),
  creativeId: z.string().uuid().nullable().optional(),
  assetType: z.enum(assetTypes).optional(),
});
const assetUpdateSchema = z.object({
  title: text(200).min(1).optional(),
  creativeId: z.string().uuid().nullable().optional(),
  status: z.enum(assetStatuses).optional(),
});

export class CreativeError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'CreativeError';
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new CreativeError(result.error.issues[0]?.message || 'Invalid creative data.', 400);
  return result.data;
}

function date(value: string | null | undefined) {
  return value ? new Date(value) : null;
}

function inferAssetType(mimeType: string): typeof assetTypes[number] {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf' || mimeType.startsWith('text/')) return 'document';
  return 'other';
}

function safeFileName(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 160) || 'asset';
}

function serializeItem(row: typeof creativeItem.$inferSelect, assetIds: string[]) {
  return {
    id: row.id,
    title: row.title,
    platform: row.platform,
    format: row.format,
    campaign: row.campaign,
    audience: row.audience,
    objective: row.objective,
    hook: row.hook,
    brief: row.brief,
    caption: row.caption,
    visualDirection: row.visualDirection,
    productionNotes: row.productionNotes,
    cta: row.cta,
    status: row.status,
    ownerId: row.ownerUserId,
    approverId: row.approverUserId,
    targetPublishAt: row.targetPublishAt?.toISOString() ?? null,
    scheduledFor: row.scheduledFor?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    approvalNotes: row.approvalNotes,
    assetIds,
    tags: row.tags,
    sourceLineage: row.sourceLineage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

function serializeAsset(row: typeof creativeAsset.$inferSelect, provider: AssetStoreProvider = 'filesystem') {
  return {
    id: row.id,
    creativeId: row.creativeId,
    title: row.title,
    fileName: row.fileName,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    assetType: row.assetType,
    storagePath: row.objectKey,
    provider,
    status: row.status,
    uploadedAt: row.uploadedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

async function assertWorkspaceUser(database: PostgresDatabase, actor: WorkspaceActor, userId: string | null | undefined) {
  if (!userId) return;
  const rows = await database.select({ userId: workspaceMembership.userId }).from(workspaceMembership).where(and(
    eq(workspaceMembership.workspaceId, actor.workspaceId),
    eq(workspaceMembership.userId, userId),
  )).limit(1);
  if (!rows[0]) throw new CreativeError('Selected user is unavailable in this workspace.', 422);
}

async function assertCreative(database: PostgresDatabase, actor: WorkspaceActor, creativeId: string | null | undefined) {
  if (!creativeId) return;
  const rows = await database.select({ id: creativeItem.id }).from(creativeItem).where(and(
    eq(creativeItem.workspaceId, actor.workspaceId),
    eq(creativeItem.id, creativeId),
  )).limit(1);
  if (!rows[0]) throw new CreativeError('Creative item not found.', 422);
}

async function assetIdsByCreative(database: PostgresDatabase, actor: WorkspaceActor) {
  const rows = await database.select({ id: creativeAsset.id, creativeId: creativeAsset.creativeId })
    .from(creativeAsset).where(and(
      eq(creativeAsset.workspaceId, actor.workspaceId),
      inArray(creativeAsset.status, ['uploading', 'active']),
    ));
  const result = new Map<string, string[]>();
  for (const row of rows) {
    if (row.creativeId) result.set(row.creativeId, [...(result.get(row.creativeId) || []), row.id]);
  }
  return result;
}

export async function listCreativeItems(database: PostgresDatabase, actor: WorkspaceActor) {
  const [rows, ids] = await Promise.all([
    database.select().from(creativeItem).where(eq(creativeItem.workspaceId, actor.workspaceId))
      .orderBy(desc(creativeItem.updatedAt)).limit(200),
    assetIdsByCreative(database, actor),
  ]);
  return rows.map((row) => serializeItem(row, ids.get(row.id) || []));
}

export async function getCreativeItem(database: PostgresDatabase, actor: WorkspaceActor, itemId: string) {
  const id = parse(z.string().uuid(), itemId);
  const rows = await database.select().from(creativeItem).where(and(
    eq(creativeItem.workspaceId, actor.workspaceId), eq(creativeItem.id, id),
  )).limit(1);
  if (!rows[0]) throw new CreativeError('Creative item not found.', 404);
  const assets = await database.select({ id: creativeAsset.id }).from(creativeAsset).where(and(
    eq(creativeAsset.workspaceId, actor.workspaceId),
    eq(creativeAsset.creativeId, id),
    inArray(creativeAsset.status, ['uploading', 'active']),
  ));
  return serializeItem(rows[0], assets.map((asset) => asset.id));
}

export async function createCreativeItem(database: PostgresDatabase, actor: WorkspaceActor, input: unknown) {
  const data = parse(itemCreateSchema, input);
  await Promise.all([
    assertWorkspaceUser(database, actor, data.ownerId),
    assertWorkspaceUser(database, actor, data.approverId),
  ]);
  const rows = await database.insert(creativeItem).values({
    workspaceId: actor.workspaceId,
    createdByUserId: actor.userId,
    title: data.title,
    platform: data.platform,
    format: data.format,
    campaign: data.campaign,
    audience: data.audience,
    objective: data.objective,
    hook: data.hook,
    brief: data.brief,
    caption: data.caption,
    visualDirection: data.visualDirection,
    productionNotes: data.productionNotes,
    cta: data.cta,
    status: data.status,
    ownerUserId: data.ownerId ?? actor.userId,
    approverUserId: data.approverId ?? null,
    targetPublishAt: date(data.targetPublishAt),
    scheduledFor: date(data.scheduledFor),
    publishedAt: date(data.publishedAt),
    submittedAt: date(data.submittedAt),
    approvalNotes: data.approvalNotes,
    tags: [...new Set(data.tags)],
    sourceLineage: data.sourceLineage,
  }).returning();
  return serializeItem(rows[0], []);
}

export async function updateCreativeItem(database: PostgresDatabase, actor: WorkspaceActor, itemId: string, input: unknown) {
  const id = parse(z.string().uuid(), itemId);
  const data = parse(itemUpdateSchema, input);
  await Promise.all([
    assertWorkspaceUser(database, actor, data.ownerId),
    assertWorkspaceUser(database, actor, data.approverId),
  ]);
  const rows = await database.update(creativeItem).set({
    ...(data.title !== undefined && { title: data.title }),
    ...(data.platform !== undefined && { platform: data.platform }),
    ...(data.format !== undefined && { format: data.format }),
    ...(data.campaign !== undefined && { campaign: data.campaign }),
    ...(data.audience !== undefined && { audience: data.audience }),
    ...(data.objective !== undefined && { objective: data.objective }),
    ...(data.hook !== undefined && { hook: data.hook }),
    ...(data.brief !== undefined && { brief: data.brief }),
    ...(data.caption !== undefined && { caption: data.caption }),
    ...(data.visualDirection !== undefined && { visualDirection: data.visualDirection }),
    ...(data.productionNotes !== undefined && { productionNotes: data.productionNotes }),
    ...(data.cta !== undefined && { cta: data.cta }),
    ...(data.status !== undefined && { status: data.status }),
    ...(data.ownerId !== undefined && { ownerUserId: data.ownerId }),
    ...(data.approverId !== undefined && { approverUserId: data.approverId }),
    ...(data.targetPublishAt !== undefined && { targetPublishAt: date(data.targetPublishAt) }),
    ...(data.scheduledFor !== undefined && { scheduledFor: date(data.scheduledFor) }),
    ...(data.publishedAt !== undefined && { publishedAt: date(data.publishedAt) }),
    ...(data.submittedAt !== undefined && { submittedAt: date(data.submittedAt) }),
    ...(data.approvalNotes !== undefined && { approvalNotes: data.approvalNotes }),
    ...(data.tags !== undefined && { tags: [...new Set(data.tags)] }),
    ...(data.sourceLineage !== undefined && { sourceLineage: data.sourceLineage }),
    updatedAt: new Date(),
  }).where(and(eq(creativeItem.workspaceId, actor.workspaceId), eq(creativeItem.id, id))).returning();
  if (!rows[0]) throw new CreativeError('Creative item not found.', 404);
  return getCreativeItem(database, actor, rows[0].id);
}

export async function deleteCreativeItem(database: PostgresDatabase, actor: WorkspaceActor, itemId: string) {
  const id = parse(z.string().uuid(), itemId);
  const linkedAssets = await database.select({ id: creativeAsset.id }).from(creativeAsset).where(and(
    eq(creativeAsset.workspaceId, actor.workspaceId),
    eq(creativeAsset.creativeId, id),
    inArray(creativeAsset.status, ['uploading', 'active']),
  )).limit(1);
  if (linkedAssets[0]) {
    throw new CreativeError('Archive or detach active assets before deleting this creative item.', 409);
  }
  const rows = await database.delete(creativeItem).where(and(
    eq(creativeItem.workspaceId, actor.workspaceId), eq(creativeItem.id, id),
  )).returning({ id: creativeItem.id });
  if (!rows[0]) throw new CreativeError('Creative item not found.', 404);
  return { id: rows[0].id, deleted: true as const };
}

export async function listCreativeAssets(database: PostgresDatabase, actor: WorkspaceActor, assetStore?: AssetStore) {
  const rows = await database.select().from(creativeAsset)
    .where(eq(creativeAsset.workspaceId, actor.workspaceId))
    .orderBy(desc(creativeAsset.updatedAt)).limit(300);
  return rows.map((row) => serializeAsset(row, assetStore?.provider));
}

export async function getCreativeAsset(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  assetId: string,
  assetStore?: AssetStore,
) {
  const id = parse(z.string().uuid(), assetId);
  const rows = await database.select().from(creativeAsset).where(and(
    eq(creativeAsset.workspaceId, actor.workspaceId),
    eq(creativeAsset.id, id),
  )).limit(1);
  if (!rows[0]) throw new CreativeError('Creative asset not found.', 404);
  return serializeAsset(rows[0], assetStore?.provider);
}

export async function uploadCreativeAsset(
  database: PostgresDatabase,
  assetStore: AssetStore,
  actor: WorkspaceActor,
  metadata: unknown,
  body: Readable,
) {
  const data = parse(assetUploadSchema, metadata);
  await assertCreative(database, actor, data.creativeId);
  const id = randomUUID();
  const objectKey = `${id}-${safeFileName(data.fileName)}`;
  let streamedBytes = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      streamedBytes += chunk.length;
      callback(
        streamedBytes > 250 * 1024 * 1024
          ? new CreativeError('Asset body exceeds 250 MB.', 413)
          : null,
        chunk,
      );
    },
  });
  const stored = await assetStore.put({
    workspaceId: actor.workspaceId,
    objectKey,
    contentType: data.mimeType,
    size: data.fileSize,
    body: body.pipe(limiter),
  });
  if (stored.size !== data.fileSize) {
    await assetStore.delete(actor.workspaceId, objectKey);
    throw new CreativeError('Asset body size does not match X-File-Size.', 400);
  }
  try {
    const rows = await database.insert(creativeAsset).values({
      id,
      workspaceId: actor.workspaceId,
      creativeId: data.creativeId ?? null,
      title: data.title || data.fileName.replace(/\.[^.]+$/, ''),
      fileName: data.fileName,
      mimeType: data.mimeType,
      fileSize: stored.size,
      assetType: data.assetType || inferAssetType(data.mimeType),
      objectKey,
      status: 'active',
      uploadedAt: new Date(),
      createdByUserId: actor.userId,
    }).returning();
    return serializeAsset(rows[0], assetStore.provider);
  } catch (error) {
    await assetStore.delete(actor.workspaceId, objectKey);
    throw error;
  }
}

export async function updateCreativeAsset(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  assetId: string,
  input: unknown,
  assetStore?: AssetStore,
) {
  const id = parse(z.string().uuid(), assetId);
  const data = parse(assetUpdateSchema, input);
  await assertCreative(database, actor, data.creativeId);
  const rows = await database.update(creativeAsset).set({
    ...(data.title !== undefined && { title: data.title }),
    ...(data.creativeId !== undefined && { creativeId: data.creativeId }),
    ...(data.status !== undefined && { status: data.status }),
    updatedAt: new Date(),
  }).where(and(eq(creativeAsset.workspaceId, actor.workspaceId), eq(creativeAsset.id, id))).returning();
  if (!rows[0]) throw new CreativeError('Creative asset not found.', 404);
  return serializeAsset(rows[0], assetStore?.provider);
}

export async function getCreativeAssetDownload(
  database: PostgresDatabase,
  assetStore: AssetStore,
  actor: WorkspaceActor,
  assetId: string,
): Promise<StoredAsset & { fileName: string }> {
  const id = parse(z.string().uuid(), assetId);
  const rows = await database.select().from(creativeAsset).where(and(
    eq(creativeAsset.workspaceId, actor.workspaceId),
    eq(creativeAsset.id, id),
    eq(creativeAsset.status, 'active'),
  )).limit(1);
  if (!rows[0]) throw new CreativeError('Creative asset not found.', 404);
  const stored = await assetStore.get(actor.workspaceId, rows[0].objectKey);
  if (!stored) throw new CreativeError('Creative asset content is unavailable.', 410);
  return { ...stored, fileName: rows[0].fileName };
}
