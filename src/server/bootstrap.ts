import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ServerConfig } from './config.js';
import type { WorkspaceRepository as PostgresDatabase } from './platform/workspace-repository.js';
import {
  account,
  instanceBootstrap,
  user,
  workspace,
  workspaceMembership,
} from './db/schema.js';

const bootstrapInputSchema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  workspaceName: z.string().trim().min(1).max(120),
  workspaceSlug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

function tokenDigest(token: string) {
  return createHash('sha256').update(token).digest();
}

function tokensMatch(provided: string, expected: string) {
  const providedDigest = tokenDigest(provided);
  const expectedDigest = tokenDigest(expected);
  return timingSafeEqual(providedDigest, expectedDigest);
}

export class BootstrapError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'BootstrapError';
  }
}

export async function needsBootstrap(database: PostgresDatabase) {
  const rows = await database
    .select({ id: instanceBootstrap.id })
    .from(instanceBootstrap)
    .where(eq(instanceBootstrap.id, 'instance'))
    .limit(1);
  return rows.length === 0;
}

export async function bootstrapInstance(
  database: PostgresDatabase,
  config: ServerConfig,
  input: unknown,
) {
  const parsed = bootstrapInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new BootstrapError(parsed.error.issues[0]?.message || 'Invalid bootstrap request.', 400);
  }
  if (!tokensMatch(parsed.data.token, config.bootstrapToken)) {
    throw new BootstrapError('Invalid bootstrap token.', 403);
  }

  const now = new Date();
  const userId = randomUUID();
  const accountId = randomUUID();
  const workspaceId = randomUUID();
  const passwordHash = await hashPassword(parsed.data.password);

  try {
    await database.transaction(async (transaction) => {
      await transaction.insert(user).values({
        id: userId,
        name: parsed.data.name,
        email: parsed.data.email,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });
      await transaction.insert(account).values({
        id: accountId,
        accountId: userId,
        providerId: 'credential',
        userId,
        password: passwordHash,
        createdAt: now,
        updatedAt: now,
      });
      await transaction.insert(workspace).values({
        id: workspaceId,
        name: parsed.data.workspaceName,
        slug: parsed.data.workspaceSlug,
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
      await transaction.insert(instanceBootstrap).values({
        id: 'instance',
        completedAt: now,
        completedByUserId: userId,
      });
    });
  } catch (error) {
    if (!(await needsBootstrap(database))) {
      throw new BootstrapError('This Replofy OS instance is already bootstrapped.', 409);
    }
    throw error;
  }

  return {
    user: { id: userId, email: parsed.data.email, name: parsed.data.name },
    workspace: { id: workspaceId, name: parsed.data.workspaceName, slug: parsed.data.workspaceSlug },
  };
}
