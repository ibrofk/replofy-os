import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkspaceRepository as PostgresDatabase } from './platform/workspace-repository.js';
import { bug, roadmapItem, task } from './db/schema.js';
import type { WorkspaceActor } from './execution/tasks.js';
import { pickProvided } from './validation.js';

const bugSeverities = ['low', 'medium', 'high', 'critical'] as const;
const bugStatuses = ['open', 'triaged', 'in-progress', 'blocked', 'resolved', 'closed'] as const;
const roadmapPhases = ['now', 'next', 'later'] as const;
const priorities = ['low', 'medium', 'high'] as const;
const roadmapStatuses = ['planned', 'building', 'blocked', 'shipped'] as const;
const codeLinkSchema = z.object({
  type: z.enum(['repository', 'directory']),
  url: z.string().trim().url().max(2_000),
  label: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2_000).optional(),
});
const bugCreateSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().max(20_000).default(''),
  severity: z.enum(bugSeverities).default('medium'),
  status: z.enum(bugStatuses).default('open'),
  resolutionNotes: z.string().max(20_000).default(''),
  linkedTaskIds: z.array(z.string().uuid()).max(100).default([]),
  codeLinks: z.array(codeLinkSchema).max(50).default([]),
  sourceLineage: z.record(z.string(), z.unknown()).default({}),
});
const roadmapCreateSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().max(20_000).default(''),
  phase: z.enum(roadmapPhases).default('next'),
  priority: z.enum(priorities).default('medium'),
  status: z.enum(roadmapStatuses).default('planned'),
  linkedTaskIds: z.array(z.string().uuid()).max(100).default([]),
});

export class TechnicalError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'TechnicalError';
  }
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new TechnicalError(result.error.issues[0]?.message || 'Invalid technical record.', 400);
  return result.data;
}

async function validateTaskIds(database: PostgresDatabase, actor: WorkspaceActor, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return unique;
  const rows = await database.select({ id: task.id }).from(task).where(and(
    eq(task.workspaceId, actor.workspaceId), inArray(task.id, unique),
  ));
  if (rows.length !== unique.length) throw new TechnicalError('One or more linked tasks are unavailable in this workspace.', 422);
  return unique;
}

function serializeBug(row: typeof bug.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    severity: row.severity,
    status: row.status,
    resolutionNotes: row.resolutionNotes,
    linkedTaskIds: row.linkedTaskIds,
    codeLinks: row.codeLinks,
    sourceLineage: row.sourceLineage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

function serializeRoadmap(row: typeof roadmapItem.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    phase: row.phase,
    priority: row.priority,
    status: row.status,
    linkedTaskIds: row.linkedTaskIds,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

export async function listBugs(database: PostgresDatabase, actor: WorkspaceActor, query: Record<string, unknown> = {}) {
  const filters = z.object({
    status: z.enum(bugStatuses).optional(),
    severity: z.enum(bugSeverities).optional(),
  }).safeParse(query);
  if (!filters.success) throw new TechnicalError('Bug filters are invalid.', 400);
  const rows = await database.select().from(bug).where(and(
    eq(bug.workspaceId, actor.workspaceId),
    filters.data.status ? eq(bug.status, filters.data.status) : undefined,
    filters.data.severity ? eq(bug.severity, filters.data.severity) : undefined,
  )).orderBy(desc(bug.updatedAt)).limit(300);
  return rows.map(serializeBug);
}

export async function getBug(database: PostgresDatabase, actor: WorkspaceActor, bugId: string) {
  const id = parse(z.string().uuid(), bugId);
  const rows = await database.select().from(bug).where(and(eq(bug.workspaceId, actor.workspaceId), eq(bug.id, id))).limit(1);
  if (!rows[0]) throw new TechnicalError('Bug not found.', 404);
  return serializeBug(rows[0]);
}

export async function createBug(database: PostgresDatabase, actor: WorkspaceActor, input: unknown) {
  const data = parse(bugCreateSchema, input);
  const linkedTaskIds = await validateTaskIds(database, actor, data.linkedTaskIds);
  const rows = await database.insert(bug).values({
    workspaceId: actor.workspaceId, createdByUserId: actor.userId, ...data, linkedTaskIds,
  }).returning();
  return serializeBug(rows[0]);
}

export async function updateBug(database: PostgresDatabase, actor: WorkspaceActor, bugId: string, input: unknown) {
  const id = parse(z.string().uuid(), bugId);
  const data = parse(bugCreateSchema.partial(), input);
  const patch = pickProvided(input, data);
  const linkedTaskIds = patch.linkedTaskIds === undefined ? undefined : await validateTaskIds(database, actor, patch.linkedTaskIds);
  const rows = await database.update(bug).set({
    ...patch,
    ...(linkedTaskIds !== undefined && { linkedTaskIds }),
    updatedAt: new Date(),
  }).where(and(eq(bug.workspaceId, actor.workspaceId), eq(bug.id, id))).returning();
  if (!rows[0]) throw new TechnicalError('Bug not found.', 404);
  return serializeBug(rows[0]);
}

export async function deleteBug(database: PostgresDatabase, actor: WorkspaceActor, bugId: string) {
  const id = parse(z.string().uuid(), bugId);
  const rows = await database.delete(bug).where(and(eq(bug.workspaceId, actor.workspaceId), eq(bug.id, id))).returning({ id: bug.id });
  if (!rows[0]) throw new TechnicalError('Bug not found.', 404);
  return { id: rows[0].id, deleted: true as const };
}

export async function listRoadmapItems(database: PostgresDatabase, actor: WorkspaceActor, query: Record<string, unknown> = {}) {
  const filters = z.object({
    phase: z.enum(roadmapPhases).optional(),
    priority: z.enum(priorities).optional(),
    status: z.enum(roadmapStatuses).optional(),
  }).safeParse(query);
  if (!filters.success) throw new TechnicalError('Roadmap filters are invalid.', 400);
  const rows = await database.select().from(roadmapItem).where(and(
    eq(roadmapItem.workspaceId, actor.workspaceId),
    filters.data.phase ? eq(roadmapItem.phase, filters.data.phase) : undefined,
    filters.data.priority ? eq(roadmapItem.priority, filters.data.priority) : undefined,
    filters.data.status ? eq(roadmapItem.status, filters.data.status) : undefined,
  )).orderBy(desc(roadmapItem.updatedAt)).limit(300);
  return rows.map(serializeRoadmap);
}

export async function getRoadmapItem(database: PostgresDatabase, actor: WorkspaceActor, itemId: string) {
  const id = parse(z.string().uuid(), itemId);
  const rows = await database.select().from(roadmapItem).where(and(
    eq(roadmapItem.workspaceId, actor.workspaceId), eq(roadmapItem.id, id),
  )).limit(1);
  if (!rows[0]) throw new TechnicalError('Roadmap item not found.', 404);
  return serializeRoadmap(rows[0]);
}

export async function createRoadmapItem(database: PostgresDatabase, actor: WorkspaceActor, input: unknown) {
  const data = parse(roadmapCreateSchema, input);
  const linkedTaskIds = await validateTaskIds(database, actor, data.linkedTaskIds);
  const rows = await database.insert(roadmapItem).values({
    workspaceId: actor.workspaceId, createdByUserId: actor.userId, ...data, linkedTaskIds,
  }).returning();
  return serializeRoadmap(rows[0]);
}

export async function updateRoadmapItem(database: PostgresDatabase, actor: WorkspaceActor, itemId: string, input: unknown) {
  const id = parse(z.string().uuid(), itemId);
  const data = parse(roadmapCreateSchema.partial(), input);
  const patch = pickProvided(input, data);
  const linkedTaskIds = patch.linkedTaskIds === undefined ? undefined : await validateTaskIds(database, actor, patch.linkedTaskIds);
  const rows = await database.update(roadmapItem).set({
    ...patch,
    ...(linkedTaskIds !== undefined && { linkedTaskIds }),
    updatedAt: new Date(),
  }).where(and(eq(roadmapItem.workspaceId, actor.workspaceId), eq(roadmapItem.id, id))).returning();
  if (!rows[0]) throw new TechnicalError('Roadmap item not found.', 404);
  return serializeRoadmap(rows[0]);
}

export async function deleteRoadmapItem(database: PostgresDatabase, actor: WorkspaceActor, itemId: string) {
  const id = parse(z.string().uuid(), itemId);
  const rows = await database.delete(roadmapItem).where(and(
    eq(roadmapItem.workspaceId, actor.workspaceId), eq(roadmapItem.id, id),
  )).returning({ id: roadmapItem.id });
  if (!rows[0]) throw new TechnicalError('Roadmap item not found.', 404);
  return { id: rows[0].id, deleted: true as const };
}
