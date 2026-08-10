import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkspaceRepository as PostgresDatabase } from '../platform/workspace-repository.js';
import { postgresErrorCode } from '../db/errors.js';
import { cycleGoal, task } from '../db/schema.js';
import type { WorkspaceActor } from './tasks.js';
import { pickProvided } from '../validation.js';

const goalStatusSchema = z.enum(['active', 'completed', 'archived']);

const createGoalSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(20_000).default(''),
  outcome: z.string().trim().max(4_000).default(''),
  successCriteria: z.array(z.string().trim().min(1).max(1_000)).max(100).default([]),
  targetDate: z.string().datetime().nullable().optional(),
  status: goalStatusSchema.default('active'),
});

const updateGoalSchema = createGoalSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be updated.');

const listGoalQuerySchema = z.object({
  status: goalStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export class CycleGoalError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'CycleGoalError';
  }
}

function parseOrThrow<T>(result: z.ZodSafeParseResult<T>) {
  if (!result.success) {
    throw new CycleGoalError(result.error.issues[0]?.message || 'Invalid cycle goal request.', 400);
  }
  return result.data;
}

function asApiCycleGoal(row: typeof cycleGoal.$inferSelect) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    companyId: row.workspaceId,
    authorId: row.createdByUserId,
    title: row.title,
    description: row.description,
    outcome: row.outcome,
    successCriteria: row.successCriteria,
    targetDate: row.targetDate?.toISOString() ?? null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.sourceLineage || {}),
  };
}

export async function listCycleGoals(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  query: unknown,
) {
  const parsed = parseOrThrow(listGoalQuerySchema.safeParse(query));
  const condition = parsed.status
    ? and(eq(cycleGoal.workspaceId, actor.workspaceId), eq(cycleGoal.status, parsed.status))
    : eq(cycleGoal.workspaceId, actor.workspaceId);
  const rows = await database
    .select()
    .from(cycleGoal)
    .where(condition)
    .orderBy(desc(cycleGoal.createdAt))
    .limit(parsed.limit);
  return rows.map(asApiCycleGoal);
}

export async function getCycleGoal(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  goalId: string,
) {
  const parsedGoalId = parseOrThrow(z.string().uuid().safeParse(goalId));
  const rows = await database
    .select()
    .from(cycleGoal)
    .where(and(eq(cycleGoal.id, parsedGoalId), eq(cycleGoal.workspaceId, actor.workspaceId)))
    .limit(1);
  if (!rows[0]) throw new CycleGoalError('Cycle goal not found.', 404);
  return asApiCycleGoal(rows[0]);
}

export async function createCycleGoal(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  input: unknown,
) {
  const parsed = parseOrThrow(createGoalSchema.safeParse(input));
  const rows = await database
    .insert(cycleGoal)
    .values({
      workspaceId: actor.workspaceId,
      createdByUserId: actor.userId,
      ...parsed,
      targetDate: parsed.targetDate ? new Date(parsed.targetDate) : null,
    })
    .returning();
  return asApiCycleGoal(rows[0]);
}

export async function updateCycleGoal(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  goalId: string,
  input: unknown,
) {
  const parsedGoalId = parseOrThrow(z.string().uuid().safeParse(goalId));
  const parsed = parseOrThrow(updateGoalSchema.safeParse(input));
  const provided = pickProvided(input, parsed);
  const { targetDate, ...patch } = provided;
  const datePatch = targetDate !== undefined
    ? { targetDate: targetDate ? new Date(targetDate) : null }
    : {};
  const rows = await database
    .update(cycleGoal)
    .set({ ...patch, ...datePatch, updatedAt: new Date() })
    .where(
      and(eq(cycleGoal.id, parsedGoalId), eq(cycleGoal.workspaceId, actor.workspaceId)),
    )
    .returning();
  if (rows.length === 0) throw new CycleGoalError('Cycle goal not found.', 404);
  return asApiCycleGoal(rows[0]);
}

export async function deleteCycleGoal(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  goalId: string,
) {
  const parsedGoalId = parseOrThrow(z.string().uuid().safeParse(goalId));
  const linkedTasks = await database
    .select({ id: task.id })
    .from(task)
    .where(and(eq(task.workspaceId, actor.workspaceId), eq(task.cycleGoalId, parsedGoalId)))
    .limit(1);
  if (linkedTasks[0]) {
    throw new CycleGoalError('Move or delete linked tasks before deleting this cycle goal.', 409);
  }
  try {
    const rows = await database
      .delete(cycleGoal)
      .where(
        and(eq(cycleGoal.id, parsedGoalId), eq(cycleGoal.workspaceId, actor.workspaceId)),
      )
      .returning({ id: cycleGoal.id });
    if (rows.length === 0) throw new CycleGoalError('Cycle goal not found.', 404);
    return { id: rows[0].id, deleted: true };
  } catch (error) {
    if (postgresErrorCode(error) === '23503') {
      throw new CycleGoalError('Move or delete linked tasks before deleting this cycle goal.', 409);
    }
    throw error;
  }
}
