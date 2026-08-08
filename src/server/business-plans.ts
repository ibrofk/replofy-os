import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { createBusinessPlanTemplate } from '../utils/businessPlanTemplate.js';
import type { WorkspaceRepository as PostgresDatabase } from './platform/workspace-repository.js';
import { businessPlan, businessPlanEditingSession } from './db/schema.js';
import type { WorkspaceActor } from './execution/tasks.js';

const statuses = ['draft', 'review', 'active', 'archived'] as const;
const linkTypes = [
  'task', 'cycleGoal', 'vision', 'blogArticle', 'contextSource', 'apiEndpoint',
  'feedback', 'socialPost', 'prompt', 'timeBlock', 'environment', 'teamMember',
] as const;
const blockTypes = ['heading', 'paragraph', 'list-item', 'quote', 'code', 'divider', 'card'] as const;
const linkSchema = z.object({
  id: z.string().trim().min(1).max(120),
  type: z.enum(linkTypes),
  recordId: z.string().trim().min(1).max(200),
  createdAt: z.string().datetime(),
  createdBy: z.string().trim().min(1).max(200),
});
const blockMapSchema = z.object({ id: z.string().trim().min(1).max(120), type: z.enum(blockTypes) });
const planCreateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  summary: z.string().max(1_000).default(''),
  content: z.string().max(100_000).default(''),
  status: z.enum(statuses).default('draft'),
  tags: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  links: z.array(linkSchema).max(200).default([]),
  contentRevision: z.number().int().min(0).max(1_000_000).default(0),
  blockMap: z.array(blockMapSchema).max(2_000).default([]),
});
const planUpdateSchema = planCreateSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one business plan field is required.');
const planFiltersSchema = z.object({ status: z.enum(statuses).optional() });
const sessionSchema = z.object({
  sessionId: z.string().trim().min(1).max(160),
  planId: z.string().uuid(),
  displayName: z.string().trim().min(1).max(160),
  color: z.string().trim().min(1).max(40),
  activeBlockId: z.string().trim().min(1).max(160),
});
const sessionUpdateSchema = sessionSchema.pick({ displayName: true, color: true, activeBlockId: true }).partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one editing session field is required.');

export class BusinessPlanError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'BusinessPlanError';
  }
}

function parse<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BusinessPlanError(result.error.issues[0]?.message || message, 400);
  return result.data;
}

function serializePlan(row: typeof businessPlan.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    content: row.content,
    status: row.status,
    tags: row.tags,
    links: row.links,
    contentRevision: row.contentRevision,
    blockMap: row.blockMap,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

function serializeSession(row: typeof businessPlanEditingSession.$inferSelect) {
  return {
    sessionId: row.id,
    userId: row.userId,
    displayName: row.displayName,
    color: row.color,
    planId: row.planId,
    activeBlockId: row.activeBlockId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listBusinessPlans(database: PostgresDatabase, actor: WorkspaceActor, query: Record<string, unknown> = {}) {
  const filters = parse(planFiltersSchema, query, 'Business plan filters are invalid.');
  const rows = await database.select().from(businessPlan).where(and(
    eq(businessPlan.workspaceId, actor.workspaceId),
    filters.status ? eq(businessPlan.status, filters.status) : undefined,
  )).orderBy(desc(businessPlan.updatedAt)).limit(200);
  return rows.map(serializePlan);
}

export async function getBusinessPlan(database: PostgresDatabase, actor: WorkspaceActor, planId: string) {
  const id = parse(z.string().uuid(), planId, 'Business plan id is invalid.');
  const rows = await database.select().from(businessPlan).where(and(
    eq(businessPlan.workspaceId, actor.workspaceId), eq(businessPlan.id, id),
  )).limit(1);
  if (!rows[0]) throw new BusinessPlanError('Business plan not found.', 404);
  return serializePlan(rows[0]);
}

export async function createBusinessPlan(database: PostgresDatabase, actor: WorkspaceActor, input: unknown) {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const template = createBusinessPlanTemplate({ title: typeof raw.title === 'string' ? raw.title : undefined });
  const data = parse(planCreateSchema, {
    ...template,
    ...raw,
    tags: Array.isArray(raw.tags) ? raw.tags : template.tags,
    links: Array.isArray(raw.links) ? raw.links : template.links,
  }, 'Business plan is invalid.');
  const rows = await database.insert(businessPlan).values({
    workspaceId: actor.workspaceId,
    createdByUserId: actor.userId,
    ...data,
  }).returning();
  return serializePlan(rows[0]);
}

export async function updateBusinessPlan(database: PostgresDatabase, actor: WorkspaceActor, planId: string, input: unknown) {
  const id = parse(z.string().uuid(), planId, 'Business plan id is invalid.');
  const data = parse(planUpdateSchema, input, 'Business plan update is invalid.');
  const current = await database.select({ revision: businessPlan.contentRevision }).from(businessPlan).where(and(
    eq(businessPlan.workspaceId, actor.workspaceId), eq(businessPlan.id, id),
  )).limit(1);
  if (!current[0]) throw new BusinessPlanError('Business plan not found.', 404);
  const revision = data.content === undefined
    ? data.contentRevision
    : Math.max(current[0].revision + 1, data.contentRevision ?? 0);
  const { contentRevision: _requestedRevision, ...patch } = data;
  const rows = await database.update(businessPlan).set({
    ...patch,
    ...(revision !== undefined ? { contentRevision: revision } : {}),
    updatedAt: new Date(),
  }).where(and(eq(businessPlan.workspaceId, actor.workspaceId), eq(businessPlan.id, id))).returning();
  return serializePlan(rows[0]);
}

export async function deleteBusinessPlan(database: PostgresDatabase, actor: WorkspaceActor, planId: string) {
  const id = parse(z.string().uuid(), planId, 'Business plan id is invalid.');
  const rows = await database.delete(businessPlan).where(and(
    eq(businessPlan.workspaceId, actor.workspaceId), eq(businessPlan.id, id),
  )).returning({ id: businessPlan.id });
  if (!rows[0]) throw new BusinessPlanError('Business plan not found.', 404);
  return { id: rows[0].id, deleted: true as const };
}

export async function listBusinessPlanSessions(database: PostgresDatabase, actor: WorkspaceActor, planId: string) {
  const id = parse(z.string().uuid(), planId, 'Business plan id is invalid.');
  const rows = await database.select().from(businessPlanEditingSession).where(and(
    eq(businessPlanEditingSession.workspaceId, actor.workspaceId), eq(businessPlanEditingSession.planId, id),
  )).orderBy(desc(businessPlanEditingSession.updatedAt)).limit(100);
  return rows.map(serializeSession);
}

export async function upsertBusinessPlanSession(database: PostgresDatabase, actor: WorkspaceActor, input: unknown) {
  const data = parse(sessionSchema, input, 'Editing session is invalid.');
  const existingSession = await database.select({ workspaceId: businessPlanEditingSession.workspaceId })
    .from(businessPlanEditingSession)
    .where(eq(businessPlanEditingSession.id, data.sessionId))
    .limit(1);
  if (existingSession[0] && existingSession[0].workspaceId !== actor.workspaceId) {
    throw new BusinessPlanError('Editing session id is already in use.', 409);
  }
  const plan = await database.select({ id: businessPlan.id }).from(businessPlan).where(and(
    eq(businessPlan.workspaceId, actor.workspaceId), eq(businessPlan.id, data.planId),
  )).limit(1);
  if (!plan[0]) throw new BusinessPlanError('Business plan not found.', 404);
  const now = new Date();
  const rows = await database.insert(businessPlanEditingSession).values({
    id: data.sessionId,
    workspaceId: actor.workspaceId,
    planId: data.planId,
    userId: actor.userId,
    displayName: data.displayName,
    color: data.color,
    activeBlockId: data.activeBlockId,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: businessPlanEditingSession.id,
    set: {
      planId: data.planId,
      userId: actor.userId,
      displayName: data.displayName,
      color: data.color,
      activeBlockId: data.activeBlockId,
      updatedAt: now,
    },
  }).returning();
  return serializeSession(rows[0]);
}

export async function updateBusinessPlanSession(database: PostgresDatabase, actor: WorkspaceActor, sessionId: string, input: unknown) {
  const id = parse(z.string().trim().min(1).max(160), sessionId, 'Editing session id is invalid.');
  const data = parse(sessionUpdateSchema, input, 'Editing session update is invalid.');
  const rows = await database.update(businessPlanEditingSession).set({ ...data, updatedAt: new Date() }).where(and(
    eq(businessPlanEditingSession.workspaceId, actor.workspaceId), eq(businessPlanEditingSession.id, id),
  )).returning();
  if (!rows[0]) throw new BusinessPlanError('Editing session not found.', 404);
  return serializeSession(rows[0]);
}

export async function deleteBusinessPlanSession(database: PostgresDatabase, actor: WorkspaceActor, sessionId: string) {
  const id = parse(z.string().trim().min(1).max(160), sessionId, 'Editing session id is invalid.');
  const rows = await database.delete(businessPlanEditingSession).where(and(
    eq(businessPlanEditingSession.workspaceId, actor.workspaceId), eq(businessPlanEditingSession.id, id),
  )).returning({ id: businessPlanEditingSession.id });
  if (!rows[0]) throw new BusinessPlanError('Editing session not found.', 404);
  return { sessionId: rows[0].id, deleted: true as const };
}
