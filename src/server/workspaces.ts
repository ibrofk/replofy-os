import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { session, workspace, workspaceMembership } from './db/schema.js';
import type { WorkspaceRepository } from './platform/workspace-repository.js';

const workspaceInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export class WorkspaceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'WorkspaceError';
  }
}

export async function listUserWorkspaces(database: WorkspaceRepository, userId: string) {
  return database
    .select({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      role: workspaceMembership.role,
      createdAt: workspace.createdAt,
    })
    .from(workspaceMembership)
    .innerJoin(workspace, eq(workspace.id, workspaceMembership.workspaceId))
    .where(eq(workspaceMembership.userId, userId))
    .orderBy(workspace.name);
}

export async function createWorkspace(database: WorkspaceRepository, userId: string, input: unknown) {
  const parsed = workspaceInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new WorkspaceError(parsed.error.issues[0]?.message || 'Invalid workspace.', 400);
  }

  const workspaceId = randomUUID();
  const now = new Date();

  try {
    await database.transaction(async (transaction) => {
      await transaction.insert(workspace).values({
        id: workspaceId,
        name: parsed.data.name,
        slug: parsed.data.slug,
        createdAt: now,
        updatedAt: now,
      });
      await transaction.insert(workspaceMembership).values({
        workspaceId,
        userId,
        role: 'owner',
        createdAt: now,
        updatedAt: now,
      });
    });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new WorkspaceError('A workspace with this slug already exists.', 409);
    }
    throw error;
  }

  return {
    id: workspaceId,
    name: parsed.data.name,
    slug: parsed.data.slug,
    role: 'owner' as const,
    createdAt: now,
  };
}

export async function activateWorkspace(
  database: WorkspaceRepository,
  userId: string,
  sessionId: string,
  workspaceId: string,
) {
  const parsedWorkspaceId = z.string().uuid().safeParse(workspaceId);
  if (!parsedWorkspaceId.success) {
    throw new WorkspaceError('Workspace id is invalid.', 400);
  }

  const membership = await database
    .select({ role: workspaceMembership.role })
    .from(workspaceMembership)
    .where(
      and(
        eq(workspaceMembership.workspaceId, parsedWorkspaceId.data),
        eq(workspaceMembership.userId, userId),
      ),
    )
    .limit(1);

  if (membership.length === 0) {
    throw new WorkspaceError('Workspace not found.', 404);
  }

  const updated = await database
    .update(session)
    .set({
      activeWorkspaceId: parsedWorkspaceId.data,
      updatedAt: new Date(),
    })
    .where(and(eq(session.id, sessionId), eq(session.userId, userId)))
    .returning({ id: session.id });

  if (updated.length === 0) {
    throw new WorkspaceError('Session is no longer active.', 401);
  }

  return { activeWorkspaceId: parsedWorkspaceId.data, role: membership[0].role };
}

export async function resolveWorkspaceActor(
  database: WorkspaceRepository,
  userId: string,
  activeWorkspaceId: string | null | undefined,
) {
  const parsedWorkspaceId = z.string().uuid().safeParse(activeWorkspaceId);
  if (!parsedWorkspaceId.success) {
    throw new WorkspaceError('Select an active workspace before using workspace data.', 409);
  }

  const memberships = await database
    .select({ role: workspaceMembership.role })
    .from(workspaceMembership)
    .where(
      and(
        eq(workspaceMembership.workspaceId, parsedWorkspaceId.data),
        eq(workspaceMembership.userId, userId),
      ),
    )
    .limit(1);

  if (memberships.length === 0) {
    throw new WorkspaceError('Active workspace is unavailable.', 403);
  }

  return {
    userId,
    workspaceId: parsedWorkspaceId.data,
    role: memberships[0].role,
  };
}
