import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkspaceRepository as PostgresDatabase } from '../platform/workspace-repository.js';
import { postgresErrorCode } from '../db/errors.js';
import { task } from '../db/schema.js';
import { pickProvided } from '../validation.js';

export type WorkspaceActor = {
  userId: string;
  workspaceId: string;
  role: 'owner' | 'admin' | 'member';
};

const effortPointsSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(5),
  z.literal(8),
]);
const taskStatusSchema = z.enum(['todo', 'in-progress', 'done', 'icebox']);
const nullableUuid = z.string().uuid().nullable();

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  status: taskStatusSchema.optional(),
  effortPoints: effortPointsSchema.default(1),
  isLeadIndicator: z.boolean().default(false),
  cycleGoalId: nullableUuid.optional(),
  assigneeId: nullableUuid.optional(),
  completedAt: z.string().datetime().nullable().optional(),
  executionNotes: z.string().max(20_000).default(''),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(1_000)).max(100).default([]),
  planOrder: z.number().int().nullable().optional(),
});

const updateTaskSchema = createTaskSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be updated.');

const listTaskQuerySchema = z.object({
  status: taskStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export class TaskError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'TaskError';
  }
}

function asApiTask(row: typeof task.$inferSelect) {
  const sourceLineage = row.sourceLineage || {};
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    companyId: row.workspaceId,
    authorId: row.createdByUserId,
    title: row.title,
    status: row.status,
    effortPoints: row.effortPoints,
    isLeadIndicator: row.isLeadIndicator,
    cycleGoalId: row.cycleGoalId,
    assigneeId: row.assigneeUserId,
    completedAt: row.completedAt?.toISOString() ?? null,
    executionNotes: row.executionNotes,
    acceptanceCriteria: row.acceptanceCriteria,
    planOrder: row.planOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...sourceLineage,
  };
}

function parseOrThrow<T>(result: z.ZodSafeParseResult<T>) {
  if (!result.success) {
    throw new TaskError(result.error.issues[0]?.message || 'Invalid task request.', 400);
  }
  return result.data;
}

export async function listTasks(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  query: unknown,
) {
  const parsed = parseOrThrow(listTaskQuerySchema.safeParse(query));
  const condition = parsed.status
    ? and(eq(task.workspaceId, actor.workspaceId), eq(task.status, parsed.status))
    : eq(task.workspaceId, actor.workspaceId);
  const rows = await database
    .select()
    .from(task)
    .where(condition)
    .orderBy(desc(task.createdAt))
    .limit(parsed.limit);
  return rows.map(asApiTask);
}

export async function getTask(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  taskId: string,
) {
  const parsedTaskId = parseOrThrow(z.string().uuid().safeParse(taskId));
  const rows = await database
    .select()
    .from(task)
    .where(and(eq(task.id, parsedTaskId), eq(task.workspaceId, actor.workspaceId)))
    .limit(1);
  if (!rows[0]) throw new TaskError('Task not found.', 404);
  return asApiTask(rows[0]);
}

export async function createTask(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  input: unknown,
) {
  const parsed = parseOrThrow(createTaskSchema.safeParse(input));
  const cycleGoalId = parsed.cycleGoalId ?? null;
  const status = parsed.status ?? (cycleGoalId ? 'todo' : 'icebox');
  const completedAt =
    parsed.completedAt === null
      ? null
      : parsed.completedAt
        ? new Date(parsed.completedAt)
        : status === 'done'
          ? new Date()
          : null;

  try {
    const rows = await database
      .insert(task)
      .values({
        workspaceId: actor.workspaceId,
        createdByUserId: actor.userId,
        title: parsed.title,
        status,
        effortPoints: parsed.effortPoints,
        isLeadIndicator: parsed.isLeadIndicator,
        cycleGoalId,
        assigneeUserId: parsed.assigneeId ?? null,
        completedAt,
        executionNotes: parsed.executionNotes,
        acceptanceCriteria: parsed.acceptanceCriteria,
        planOrder: parsed.planOrder ?? null,
      })
      .returning();
    return asApiTask(rows[0]);
  } catch (error) {
    if (postgresErrorCode(error) === '23503') {
      throw new TaskError('A linked goal or assignee is not available in this workspace.', 422);
    }
    throw error;
  }
}

export async function updateTask(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  taskId: string,
  input: unknown,
) {
  const parsedTaskId = parseOrThrow(z.string().uuid().safeParse(taskId));
  const parsed = parseOrThrow(updateTaskSchema.safeParse(input));
  const existing = await database
    .select()
    .from(task)
    .where(and(eq(task.id, parsedTaskId), eq(task.workspaceId, actor.workspaceId)))
    .limit(1);
  if (existing.length === 0) throw new TaskError('Task not found.', 404);
  const provided = pickProvided(input, parsed);

  const patch: Partial<typeof task.$inferInsert> = { updatedAt: new Date() };
  if (provided.title !== undefined) patch.title = provided.title;
  if (provided.effortPoints !== undefined) patch.effortPoints = provided.effortPoints;
  if (provided.isLeadIndicator !== undefined) patch.isLeadIndicator = provided.isLeadIndicator;
  if (provided.cycleGoalId !== undefined) patch.cycleGoalId = provided.cycleGoalId;
  if (provided.assigneeId !== undefined) patch.assigneeUserId = provided.assigneeId;
  if (provided.executionNotes !== undefined) patch.executionNotes = provided.executionNotes;
  if (provided.acceptanceCriteria !== undefined) patch.acceptanceCriteria = provided.acceptanceCriteria;
  if (provided.planOrder !== undefined) patch.planOrder = provided.planOrder;

  if (provided.status !== undefined) {
    patch.status = provided.status;
    patch.completedAt =
      provided.completedAt === null
        ? null
        : provided.completedAt
          ? new Date(provided.completedAt)
          : provided.status === 'done'
            ? existing[0].completedAt ?? new Date()
            : null;
  } else if (provided.completedAt !== undefined) {
    patch.completedAt = provided.completedAt === null ? null : new Date(provided.completedAt);
  }

  try {
    const rows = await database
      .update(task)
      .set(patch)
      .where(and(eq(task.id, parsedTaskId), eq(task.workspaceId, actor.workspaceId)))
      .returning();
    return asApiTask(rows[0]);
  } catch (error) {
    if (postgresErrorCode(error) === '23503') {
      throw new TaskError('A linked goal or assignee is not available in this workspace.', 422);
    }
    throw error;
  }
}

export async function deleteTask(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  taskId: string,
) {
  const parsedTaskId = parseOrThrow(z.string().uuid().safeParse(taskId));
  const deleted = await database
    .delete(task)
    .where(and(eq(task.id, parsedTaskId), eq(task.workspaceId, actor.workspaceId)))
    .returning({ id: task.id });
  if (deleted.length === 0) throw new TaskError('Task not found.', 404);
  return { id: deleted[0].id, deleted: true };
}
