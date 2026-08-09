import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { postgresErrorCode } from './db/errors.js';
import type { WorkspaceRepository as PostgresDatabase } from './platform/workspace-repository.js';
import { blogArticle, workspaceMembership } from './db/schema.js';
import type { WorkspaceActor } from './execution/tasks.js';
import { pickProvided } from './validation.js';

const articleStatuses = [
  'idea',
  'planned',
  'researching',
  'drafting',
  'review',
  'scheduled',
  'published',
  'archived',
  'rejected',
] as const;
const roadmapPhases = ['now', 'next', 'later'] as const;
const priorities = ['low', 'medium', 'high'] as const;
const nullableDate = z.string().datetime().nullable();
const textList = (maxLength: number) => z.array(z.string().trim().min(1).max(maxLength)).max(200);

const briefSchema = z.object({
  audience: z.string().max(2_000).default(''),
  painPoint: z.string().max(2_000).default(''),
  buyingTrigger: z.string().max(2_000).default(''),
  brokenBelief: z.string().max(2_000).default(''),
  replofyAngle: z.string().max(2_000).default(''),
  thesis: z.string().max(2_000).default(''),
  cta: z.string().max(2_000).default(''),
  contentCluster: z.string().max(500).default(''),
});
const evidenceSchema = z.object({
  id: z.string().trim().min(1).max(200).default(() => randomUUID()),
  claim: z.string().trim().min(1).max(4_000),
  value: z.string().max(4_000).optional(),
  sourceId: z.string().max(200).optional(),
  sourceUrl: z.string().url().max(2_000).optional(),
  quote: z.string().max(8_000).optional(),
  confidence: z.enum(['unverified', 'supported', 'verified']).default('unverified'),
  usedInDraft: z.boolean().default(false),
});
const distributionSchema = z.object({
  seoTitle: z.string().max(240).default(''),
  metaDescription: z.string().max(500).default(''),
  primaryKeyword: z.string().max(240).default(''),
  channels: textList(120).default([]),
  publicationUrl: z.union([z.literal(''), z.string().url().max(2_000)]).default(''),
});
const articleCreateSchema = z.object({
  title: z.string().trim().min(1).max(240),
  slug: z.string().trim().min(1).max(280).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  summary: z.string().max(4_000).default(''),
  content: z.string().max(40_000).default(''),
  status: z.enum(articleStatuses).default('idea'),
  roadmapPhase: z.enum(roadmapPhases).default('next'),
  priority: z.enum(priorities).default('medium'),
  ownerId: z.string().min(1).nullable().optional(),
  targetPublishAt: nullableDate.optional(),
  scheduledFor: nullableDate.optional(),
  brief: briefSchema.partial().default({}),
  evidence: z.array(evidenceSchema).max(200).default([]),
  linkedSourceIds: textList(200).default([]),
  distribution: distributionSchema.partial().default({}),
  tags: textList(60).default([]),
  dataPoints: textList(500).default([]),
  docLinks: textList(2_000).default([]),
  validationNotes: textList(2_000).default([]),
  validatedAt: nullableDate.optional(),
  publishedAt: nullableDate.optional(),
  rejectedAt: nullableDate.optional(),
});
const articleUpdateSchema = articleCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field is required.',
);

export class ContentError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'ContentError';
  }
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ContentError(parsed.error.issues[0]?.message || 'Invalid article.', 400);
  return parsed.data;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 280) || 'article';
}

function toDate(value: string | null | undefined) {
  return value ? new Date(value) : null;
}

function serialize(row: typeof blogArticle.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    content: row.content,
    status: row.status,
    roadmapPhase: row.roadmapPhase,
    priority: row.priority,
    ownerId: row.ownerUserId,
    targetPublishAt: row.targetPublishAt?.toISOString() ?? null,
    scheduledFor: row.scheduledFor?.toISOString() ?? null,
    brief: row.brief,
    evidence: row.evidence,
    linkedSourceIds: row.linkedSourceIds,
    distribution: row.distribution,
    tags: row.tags,
    dataPoints: row.dataPoints,
    docLinks: row.docLinks,
    validationNotes: row.validationNotes,
    validatedAt: row.validatedAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    rejectedAt: row.rejectedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

async function assertOwner(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  ownerId: string | null,
) {
  if (!ownerId) return;
  const rows = await database
    .select({ userId: workspaceMembership.userId })
    .from(workspaceMembership)
    .where(and(
      eq(workspaceMembership.workspaceId, actor.workspaceId),
      eq(workspaceMembership.userId, ownerId),
    ))
    .limit(1);
  if (!rows[0]) throw new ContentError('ownerId must be a workspace member.', 422);
}

function handleConflict(error: unknown): never {
  if (postgresErrorCode(error) === '23505') {
    throw new ContentError('An article with this slug already exists in the workspace.', 409);
  }
  throw error;
}

export async function listBlogArticles(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  query: Record<string, unknown>,
) {
  const status = z.enum(articleStatuses).optional().safeParse(query.status);
  const roadmapPhase = z.enum(roadmapPhases).optional().safeParse(query.roadmapPhase);
  const priority = z.enum(priorities).optional().safeParse(query.priority);
  const limit = z.coerce.number().int().min(1).max(200).default(50).safeParse(query.limit);
  if (!status.success || !roadmapPhase.success || !priority.success || !limit.success) {
    throw new ContentError('Article filters are invalid.', 400);
  }
  const rows = await database
    .select()
    .from(blogArticle)
    .where(and(
      eq(blogArticle.workspaceId, actor.workspaceId),
      status.data ? eq(blogArticle.status, status.data) : undefined,
      roadmapPhase.data ? eq(blogArticle.roadmapPhase, roadmapPhase.data) : undefined,
      priority.data ? eq(blogArticle.priority, priority.data) : undefined,
      typeof query.ownerId === 'string' ? eq(blogArticle.ownerUserId, query.ownerId) : undefined,
    ))
    .orderBy(desc(blogArticle.updatedAt))
    .limit(limit.data);
  return rows.map(serialize);
}

export async function getBlogArticle(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  articleId: string,
) {
  const id = parse(z.string().uuid(), articleId);
  const rows = await database
    .select()
    .from(blogArticle)
    .where(and(eq(blogArticle.id, id), eq(blogArticle.workspaceId, actor.workspaceId)))
    .limit(1);
  if (!rows[0]) throw new ContentError('Article not found.', 404);
  return serialize(rows[0]);
}

export async function createBlogArticle(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  input: unknown,
) {
  const data = parse(articleCreateSchema, input);
  const ownerId = data.ownerId === undefined ? actor.userId : data.ownerId;
  await assertOwner(database, actor, ownerId);
  try {
    const rows = await database
      .insert(blogArticle)
      .values({
        workspaceId: actor.workspaceId,
        createdByUserId: actor.userId,
        title: data.title,
        slug: data.slug || slugify(data.title),
        summary: data.summary,
        content: data.content,
        status: data.status,
        roadmapPhase: data.roadmapPhase,
        priority: data.priority,
        ownerUserId: ownerId,
        targetPublishAt: toDate(data.targetPublishAt),
        scheduledFor: toDate(data.scheduledFor),
        brief: briefSchema.parse(data.brief),
        evidence: data.evidence,
        linkedSourceIds: [...new Set(data.linkedSourceIds)],
        distribution: distributionSchema.parse(data.distribution),
        tags: [...new Set(data.tags)],
        dataPoints: data.dataPoints,
        docLinks: [...new Set(data.docLinks)],
        validationNotes: data.validationNotes,
        validatedAt: toDate(data.validatedAt),
        publishedAt: data.status === 'published'
          ? toDate(data.publishedAt) || new Date()
          : toDate(data.publishedAt),
        rejectedAt: data.status === 'rejected'
          ? toDate(data.rejectedAt) || new Date()
          : toDate(data.rejectedAt),
      })
      .returning();
    return serialize(rows[0]);
  } catch (error) {
    handleConflict(error);
  }
}

export async function updateBlogArticle(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  articleId: string,
  input: unknown,
) {
  const id = parse(z.string().uuid(), articleId);
  const data = parse(articleUpdateSchema, input);
  const patch = pickProvided(input, data);
  if (patch.ownerId !== undefined) await assertOwner(database, actor, patch.ownerId);
  const datePatch = {
    ...(patch.targetPublishAt !== undefined && { targetPublishAt: toDate(patch.targetPublishAt) }),
    ...(patch.scheduledFor !== undefined && { scheduledFor: toDate(patch.scheduledFor) }),
    ...(patch.validatedAt !== undefined && { validatedAt: toDate(patch.validatedAt) }),
    ...(patch.publishedAt !== undefined && { publishedAt: toDate(patch.publishedAt) }),
    ...(patch.rejectedAt !== undefined && { rejectedAt: toDate(patch.rejectedAt) }),
  };
  try {
    const rows = await database
      .update(blogArticle)
      .set({
        ...(patch.title !== undefined && { title: patch.title }),
        ...(patch.slug !== undefined && { slug: patch.slug }),
        ...(patch.summary !== undefined && { summary: patch.summary }),
        ...(patch.content !== undefined && { content: patch.content }),
        ...(patch.status !== undefined && {
          status: patch.status,
          ...(patch.status === 'published' && patch.publishedAt === undefined && { publishedAt: new Date() }),
          ...(patch.status === 'rejected' && patch.rejectedAt === undefined && { rejectedAt: new Date() }),
        }),
        ...(patch.roadmapPhase !== undefined && { roadmapPhase: patch.roadmapPhase }),
        ...(patch.priority !== undefined && { priority: patch.priority }),
        ...(patch.ownerId !== undefined && { ownerUserId: patch.ownerId }),
        ...(patch.brief !== undefined && { brief: briefSchema.parse(patch.brief) }),
        ...(patch.evidence !== undefined && { evidence: patch.evidence }),
        ...(patch.linkedSourceIds !== undefined && { linkedSourceIds: [...new Set(patch.linkedSourceIds)] }),
        ...(patch.distribution !== undefined && { distribution: distributionSchema.parse(patch.distribution) }),
        ...(patch.tags !== undefined && { tags: [...new Set(patch.tags)] }),
        ...(patch.dataPoints !== undefined && { dataPoints: patch.dataPoints }),
        ...(patch.docLinks !== undefined && { docLinks: [...new Set(patch.docLinks)] }),
        ...(patch.validationNotes !== undefined && { validationNotes: patch.validationNotes }),
        ...datePatch,
        updatedAt: new Date(),
      })
      .where(and(eq(blogArticle.id, id), eq(blogArticle.workspaceId, actor.workspaceId)))
      .returning();
    if (!rows[0]) throw new ContentError('Article not found.', 404);
    return serialize(rows[0]);
  } catch (error) {
    handleConflict(error);
  }
}

export async function deleteBlogArticle(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  articleId: string,
) {
  const id = parse(z.string().uuid(), articleId);
  const rows = await database
    .delete(blogArticle)
    .where(and(eq(blogArticle.id, id), eq(blogArticle.workspaceId, actor.workspaceId)))
    .returning({ id: blogArticle.id });
  if (!rows[0]) throw new ContentError('Article not found.', 404);
  return { id: rows[0].id, deleted: true as const };
}
