import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkspaceRepository as PostgresDatabase } from '../platform/workspace-repository.js';
import { cycleGoal, task } from '../db/schema.js';
import type { WorkspaceActor } from './tasks.js';

export class ReportError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'ReportError';
  }
}

function parseWeek(value: unknown) {
  const result = z.enum(['current', 'last']).safeParse(value);
  if (!result.success) throw new ReportError('week must be current or last.', 400);
  return result.data;
}

function getWeekBounds(selection: 'current' | 'last') {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  if (selection === 'last') start.setUTCDate(start.getUTCDate() - 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

function serializeTask(row: typeof task.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    effortPoints: row.effortPoints,
    isLeadIndicator: row.isLeadIndicator,
    cycleGoalId: row.cycleGoalId,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function buildWeeklyChangelog(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  selection: unknown,
) {
  const week = parseWeek(selection);
  const { start, end } = getWeekBounds(week);
  const rows = await database.select().from(task).where(and(
    eq(task.workspaceId, actor.workspaceId),
    eq(task.status, 'done'),
  )).orderBy(desc(task.completedAt), desc(task.createdAt)).limit(500);
  const completed = rows
    .filter((row) => {
      const completedAt = row.completedAt ?? row.createdAt;
      return completedAt >= start && completedAt < end;
    })
    .map(serializeTask);
  const leadTasks = completed.filter((item) => item.isLeadIndicator);
  const otherTasks = completed.filter((item) => !item.isLeadIndicator);
  const lines = ['# Weekly Changelog', ''];
  if (leadTasks.length > 0) {
    lines.push('## Lead Indicators Achieved');
    for (const item of leadTasks) lines.push(`- **${item.title}** (${item.effortPoints} pts)`);
    lines.push('');
  }
  if (otherTasks.length > 0) {
    lines.push('## Other Tasks Completed');
    for (const item of otherTasks) lines.push(`- ${item.title} (${item.effortPoints} pts)`);
  }
  if (completed.length === 0) lines.push('No tasks completed in this window yet.');
  return {
    week,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    markdown: lines.join('\n'),
    tasks: completed,
    count: completed.length,
  };
}

export async function startNextCycle(
  database: PostgresDatabase,
  actor: WorkspaceActor,
) {
  return database.transaction(async (transaction) => {
    const tasks = await transaction.select().from(task).where(eq(task.workspaceId, actor.workspaceId));
    const unfinished = tasks.filter((item) => item.status !== 'done' && item.status !== 'icebox');
    const goals = await transaction.select().from(cycleGoal).where(and(
      eq(cycleGoal.workspaceId, actor.workspaceId),
      eq(cycleGoal.status, 'active'),
    ));
    const now = new Date();
    if (unfinished.length > 0) {
      await transaction.update(task).set({
        status: 'icebox',
        completedAt: null,
        updatedAt: now,
      }).where(and(
        eq(task.workspaceId, actor.workspaceId),
        inArray(task.id, unfinished.map((item) => item.id)),
      ));
    }
    if (goals.length > 0) {
      await transaction.update(cycleGoal).set({
        status: 'archived',
        updatedAt: now,
      }).where(and(
        eq(cycleGoal.workspaceId, actor.workspaceId),
        inArray(cycleGoal.id, goals.map((item) => item.id)),
      ));
    }
    return {
      archivedGoals: goals.length,
      movedTasksToIcebox: unfinished.length,
      startedAt: now.toISOString(),
    };
  });
}
