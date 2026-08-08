import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ServerConfig } from './config.js';
import { postgresErrorCode } from './db/errors.js';
import type { WorkspaceRepository as PostgresDatabase } from './platform/workspace-repository.js';
import {
  account,
  user,
  workspace,
  workspaceInvitation,
  workspaceMembership,
} from './db/schema.js';
import type { WorkspaceActor } from './execution/tasks.js';

const createInvitationSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  role: z.enum(['admin', 'member']).default('member'),
});

const acceptInvitationSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  password: z.string().min(12).max(128).optional(),
});

export class MemberError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'MemberError';
  }
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function assertCanInvite(actor: WorkspaceActor, role: 'admin' | 'member') {
  if (actor.role === 'member') throw new MemberError('Admin access is required.', 403);
  if (actor.role === 'admin' && role === 'admin') {
    throw new MemberError('Only workspace owners can invite another admin.', 403);
  }
}

export async function listWorkspaceMembers(
  database: PostgresDatabase,
  actor: WorkspaceActor,
) {
  const rows = await database
    .select({
      id: user.id,
      email: user.email,
      displayName: user.name,
      role: workspaceMembership.role,
      createdAt: workspaceMembership.createdAt,
    })
    .from(workspaceMembership)
    .innerJoin(user, eq(user.id, workspaceMembership.userId))
    .where(eq(workspaceMembership.workspaceId, actor.workspaceId))
    .orderBy(user.name);
  return rows.map((row) => ({
    ...row,
    workspaceId: actor.workspaceId,
    companyId: actor.workspaceId,
    onboardingCompleted: true,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function createWorkspaceInvitation(
  database: PostgresDatabase,
  config: ServerConfig,
  actor: WorkspaceActor,
  input: unknown,
) {
  const parsed = createInvitationSchema.safeParse(input);
  if (!parsed.success) throw new MemberError(parsed.error.issues[0]?.message || 'Invalid invitation.', 400);
  assertCanInvite(actor, parsed.data.role);

  const existingMember = await database
    .select({ id: user.id })
    .from(user)
    .innerJoin(
      workspaceMembership,
      and(
        eq(workspaceMembership.userId, user.id),
        eq(workspaceMembership.workspaceId, actor.workspaceId),
      ),
    )
    .where(eq(user.email, parsed.data.email))
    .limit(1);
  if (existingMember.length > 0) throw new MemberError('This email is already a workspace member.', 409);

  const clearToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.invitationTtlHours * 60 * 60 * 1000);
  try {
    const rows = await database
      .insert(workspaceInvitation)
      .values({
        workspaceId: actor.workspaceId,
        email: parsed.data.email,
        role: parsed.data.role,
        tokenHash: tokenHash(clearToken),
        invitedByUserId: actor.userId,
        expiresAt,
      })
      .returning({
        id: workspaceInvitation.id,
        email: workspaceInvitation.email,
        role: workspaceInvitation.role,
        status: workspaceInvitation.status,
        expiresAt: workspaceInvitation.expiresAt,
      });
    return {
      ...rows[0],
      expiresAt: rows[0].expiresAt.toISOString(),
      acceptUrl: `${config.appUrl}/join?token=${encodeURIComponent(clearToken)}`,
    };
  } catch (error) {
    if (postgresErrorCode(error) === '23505') {
      throw new MemberError('Could not create a unique invitation. Try again.', 409);
    }
    throw error;
  }
}

export async function listWorkspaceInvitations(
  database: PostgresDatabase,
  actor: WorkspaceActor,
) {
  if (actor.role === 'member') throw new MemberError('Admin access is required.', 403);
  const rows = await database
    .select({
      id: workspaceInvitation.id,
      email: workspaceInvitation.email,
      role: workspaceInvitation.role,
      status: workspaceInvitation.status,
      expiresAt: workspaceInvitation.expiresAt,
      createdAt: workspaceInvitation.createdAt,
    })
    .from(workspaceInvitation)
    .where(eq(workspaceInvitation.workspaceId, actor.workspaceId))
    .orderBy(workspaceInvitation.createdAt);
  return rows.map((row) => ({
    ...row,
    status: row.status === 'pending' && row.expiresAt <= new Date() ? 'expired' as const : row.status,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }));
}

async function findInvitation(database: PostgresDatabase, clearToken: string) {
  const rows = await database
    .select({
      id: workspaceInvitation.id,
      workspaceId: workspaceInvitation.workspaceId,
      workspaceName: workspace.name,
      email: workspaceInvitation.email,
      role: workspaceInvitation.role,
      status: workspaceInvitation.status,
      expiresAt: workspaceInvitation.expiresAt,
    })
    .from(workspaceInvitation)
    .innerJoin(workspace, eq(workspace.id, workspaceInvitation.workspaceId))
    .where(eq(workspaceInvitation.tokenHash, tokenHash(clearToken)))
    .limit(1);
  if (rows.length === 0) throw new MemberError('Invitation not found.', 404);
  const invitation = rows[0];
  if (invitation.status !== 'pending') throw new MemberError('Invitation is no longer available.', 409);
  if (invitation.expiresAt <= new Date()) {
    await database
      .update(workspaceInvitation)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(eq(workspaceInvitation.id, invitation.id));
    throw new MemberError('Invitation has expired.', 410);
  }
  return invitation;
}

export async function getWorkspaceInvitation(
  database: PostgresDatabase,
  clearToken: string,
) {
  const invitation = await findInvitation(database, clearToken);
  return {
    email: invitation.email,
    role: invitation.role,
    workspaceName: invitation.workspaceName,
    expiresAt: invitation.expiresAt.toISOString(),
  };
}

export async function acceptWorkspaceInvitation(
  database: PostgresDatabase,
  clearToken: string,
  input: unknown,
  authenticatedUser?: { id: string; email: string } | null,
) {
  const parsed = acceptInvitationSchema.safeParse(input);
  if (!parsed.success) throw new MemberError(parsed.error.issues[0]?.message || 'Invalid acceptance.', 400);
  const digest = tokenHash(clearToken);

  return database.transaction(async (transaction) => {
    const invitations = await transaction
      .select()
      .from(workspaceInvitation)
      .where(eq(workspaceInvitation.tokenHash, digest))
      .limit(1)
      .for('update');
    if (invitations.length === 0) throw new MemberError('Invitation not found.', 404);
    const invitation = invitations[0];
    if (invitation.status !== 'pending') throw new MemberError('Invitation is no longer available.', 409);
    if (invitation.expiresAt <= new Date()) {
      await transaction
        .update(workspaceInvitation)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(workspaceInvitation.id, invitation.id));
      throw new MemberError('Invitation has expired.', 410);
    }

    const existingUsers = await transaction
      .select({ id: user.id, email: user.email, name: user.name })
      .from(user)
      .where(eq(user.email, invitation.email))
      .limit(1);

    let acceptedUser: { id: string; email: string; name: string };
    if (existingUsers[0]) {
      if (
        !authenticatedUser ||
        authenticatedUser.id !== existingUsers[0].id ||
        authenticatedUser.email.toLowerCase() !== invitation.email
      ) {
        throw new MemberError('Sign in with the invited email before accepting this invitation.', 401);
      }
      acceptedUser = existingUsers[0];
    } else {
      if (!parsed.data.name || !parsed.data.password) {
        throw new MemberError('Name and password are required for a new account.', 400);
      }
      const userId = randomUUID();
      const now = new Date();
      await transaction.insert(user).values({
        id: userId,
        name: parsed.data.name,
        email: invitation.email,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });
      await transaction.insert(account).values({
        id: randomUUID(),
        accountId: userId,
        providerId: 'credential',
        userId,
        password: await hashPassword(parsed.data.password),
        createdAt: now,
        updatedAt: now,
      });
      acceptedUser = { id: userId, email: invitation.email, name: parsed.data.name };
    }

    await transaction
      .insert(workspaceMembership)
      .values({
        workspaceId: invitation.workspaceId,
        userId: acceptedUser.id,
        role: invitation.role,
      })
      .onConflictDoNothing();
    await transaction
      .update(workspaceInvitation)
      .set({
        status: 'accepted',
        acceptedByUserId: acceptedUser.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workspaceInvitation.id, invitation.id),
          eq(workspaceInvitation.status, 'pending'),
        ),
      );

    return {
      user: acceptedUser,
      workspaceId: invitation.workspaceId,
      role: invitation.role,
    };
  });
}
