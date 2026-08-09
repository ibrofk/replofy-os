import { z } from 'zod';
import type { WorkspaceRepository as PostgresDatabase } from '../platform/workspace-repository.js';
import { cycleGoal, task, vision } from '../db/schema.js';
import type { WorkspaceActor } from './tasks.js';

const effortPoints = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(5),
  z.literal(8),
]);

const focusStackSchema = z.object({
  visionTitle: z.string().trim().min(1).max(200),
  visionDescription: z.string().trim().max(20_000),
  cycleGoalTitle: z.string().trim().min(1).max(200),
  cycleGoalDescription: z.string().trim().max(20_000).default(''),
  focusItems: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  taskTitles: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
  taskEffortPoints: effortPoints.default(1),
  isLeadIndicator: z.boolean().default(false),
});

export class FocusStackError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'FocusStackError';
  }
}

function parse(input: unknown) {
  const result = focusStackSchema.safeParse(input);
  if (!result.success) throw new FocusStackError(result.error.issues[0]?.message || 'Focus stack is invalid.', 400);
  return result.data;
}

function serializeVision(row: typeof vision.$inferSelect) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    companyId: row.workspaceId,
    authorId: row.createdByUserId,
    title: row.title,
    description: row.description,
    focusItems: row.focusItems,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeCycleGoal(row: typeof cycleGoal.$inferSelect) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    companyId: row.workspaceId,
    authorId: row.createdByUserId,
    title: row.title,
    description: row.description,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeTask(row: typeof task.$inferSelect) {
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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Create the complete vision -> cycle goal -> task graph atomically. */
export async function createFocusStack(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  input: unknown,
) {
  const data = parse(input);
  return database.transaction(async (transaction) => {
    const visionRows = await transaction.insert(vision).values({
      workspaceId: actor.workspaceId,
      createdByUserId: actor.userId,
      title: data.visionTitle,
      description: data.visionDescription,
      focusItems: data.focusItems,
    }).returning();
    const createdVision = visionRows[0];

    const goalRows = await transaction.insert(cycleGoal).values({
      workspaceId: actor.workspaceId,
      createdByUserId: actor.userId,
      title: data.cycleGoalTitle,
      description: data.cycleGoalDescription,
      status: 'active',
    }).returning();
    const createdGoal = goalRows[0];

    const taskRows = data.taskTitles.length === 0
      ? []
      : await transaction.insert(task).values(data.taskTitles.map((title) => ({
        workspaceId: actor.workspaceId,
        createdByUserId: actor.userId,
        title,
        status: 'todo' as const,
        effortPoints: data.taskEffortPoints,
        isLeadIndicator: data.isLeadIndicator,
        cycleGoalId: createdGoal.id,
        executionNotes: '',
      }))).returning();

    return {
      vision: serializeVision(createdVision),
      cycleGoal: serializeCycleGoal(createdGoal),
      tasks: taskRows.map(serializeTask),
      relatedContext: { attached: [], suggestions: [], hasMore: false },
      routing: {
        strategy: 'standalone-transaction',
        resource: 'focus-stack',
        workspaceIsolated: true,
      },
    };
  });
}
