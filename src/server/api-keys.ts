import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkspaceRepository as PostgresDatabase } from './platform/workspace-repository.js';
import { standaloneApiKey, workspaceMembership } from './db/schema.js';
import type { WorkspaceActor } from './execution/tasks.js';

export const standaloneApiKeyScopes = [
  'workspace:read',
  'workspace:write',
  'execution:read',
  'execution:write',
  'members:read',
  'events:read',
  'chat:read',
  'chat:write',
  'content:read',
  'content:write',
  'operators:read',
  'operators:write',
  'creative:read',
  'creative:write',
  'growth:read',
  'growth:write',
  'technical:read',
  'technical:write',
  'systems:read',
  'systems:write',
] as const;
export type StandaloneApiKeyScope = typeof standaloneApiKeyScopes[number];

const createKeySchema = z.object({
  label: z.string().trim().min(3).max(80),
  scopes: z.array(z.enum(standaloneApiKeyScopes)).min(1).default([...standaloneApiKeyScopes]),
  expiresAt: z.string().datetime().optional(),
});

export class StandaloneApiKeyError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'StandaloneApiKeyError';
  }
}

function keyHash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function assertCanManage(actor: WorkspaceActor) {
  if (actor.role === 'member') {
    throw new StandaloneApiKeyError('Admin access is required.', 403);
  }
}

export async function listStandaloneApiKeys(database: PostgresDatabase, actor: WorkspaceActor) {
  assertCanManage(actor);
  const rows = await database
    .select({
      id: standaloneApiKey.id,
      label: standaloneApiKey.label,
      prefix: standaloneApiKey.prefix,
      scopes: standaloneApiKey.scopes,
      expiresAt: standaloneApiKey.expiresAt,
      lastUsedAt: standaloneApiKey.lastUsedAt,
      revokedAt: standaloneApiKey.revokedAt,
      createdAt: standaloneApiKey.createdAt,
    })
    .from(standaloneApiKey)
    .where(eq(standaloneApiKey.workspaceId, actor.workspaceId))
    .orderBy(standaloneApiKey.createdAt);
  return rows.map((row) => ({
    ...row,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function createStandaloneApiKey(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  input: unknown,
) {
  assertCanManage(actor);
  const parsed = createKeySchema.safeParse(input);
  if (!parsed.success) {
    throw new StandaloneApiKeyError(parsed.error.issues[0]?.message || 'Invalid API key.', 400);
  }
  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (expiresAt && expiresAt <= new Date()) {
    throw new StandaloneApiKeyError('API key expiry must be in the future.', 400);
  }
  const rawKey = `rpo_local_${randomBytes(32).toString('base64url')}`;
  const rows = await database
    .insert(standaloneApiKey)
    .values({
      workspaceId: actor.workspaceId,
      ownerUserId: actor.userId,
      label: parsed.data.label,
      prefix: rawKey.slice(0, 18),
      keyHash: keyHash(rawKey),
      scopes: [...new Set(parsed.data.scopes)],
      expiresAt,
    })
    .returning({ id: standaloneApiKey.id, createdAt: standaloneApiKey.createdAt });
  return {
    id: rows[0].id,
    label: parsed.data.label,
    prefix: rawKey.slice(0, 18),
    scopes: [...new Set(parsed.data.scopes)],
    expiresAt: expiresAt?.toISOString() ?? null,
    createdAt: rows[0].createdAt.toISOString(),
    key: rawKey,
  };
}

export async function revokeStandaloneApiKey(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  keyId: string,
) {
  assertCanManage(actor);
  const parsedId = z.string().uuid().safeParse(keyId);
  if (!parsedId.success) throw new StandaloneApiKeyError('API key id is invalid.', 400);
  const rows = await database
    .update(standaloneApiKey)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(standaloneApiKey.id, parsedId.data),
      eq(standaloneApiKey.workspaceId, actor.workspaceId),
      isNull(standaloneApiKey.revokedAt),
    ))
    .returning({ id: standaloneApiKey.id });
  if (!rows[0]) throw new StandaloneApiKeyError('API key not found.', 404);
  return { id: rows[0].id, revoked: true };
}

export async function authorizeStandaloneApiKey(
  database: PostgresDatabase,
  rawKey: string,
  requiredScope: StandaloneApiKeyScope,
) {
  if (!rawKey.startsWith('rpo_local_')) {
    throw new StandaloneApiKeyError('Unauthorized.', 401);
  }
  const rows = await database
    .select({
      id: standaloneApiKey.id,
      workspaceId: standaloneApiKey.workspaceId,
      userId: standaloneApiKey.ownerUserId,
      scopes: standaloneApiKey.scopes,
      expiresAt: standaloneApiKey.expiresAt,
      revokedAt: standaloneApiKey.revokedAt,
      role: workspaceMembership.role,
    })
    .from(standaloneApiKey)
    .innerJoin(
      workspaceMembership,
      and(
        eq(workspaceMembership.workspaceId, standaloneApiKey.workspaceId),
        eq(workspaceMembership.userId, standaloneApiKey.ownerUserId),
      ),
    )
    .where(eq(standaloneApiKey.keyHash, keyHash(rawKey)))
    .limit(1);
  const key = rows[0];
  if (!key || key.revokedAt || (key.expiresAt && key.expiresAt <= new Date())) {
    throw new StandaloneApiKeyError('Unauthorized.', 401);
  }
  if (!key.scopes.includes(requiredScope)) {
    throw new StandaloneApiKeyError(`API key requires the ${requiredScope} scope.`, 403);
  }
  await database
    .update(standaloneApiKey)
    .set({ lastUsedAt: new Date(), updatedAt: new Date() })
    .where(eq(standaloneApiKey.id, key.id));
  return {
    userId: key.userId,
    workspaceId: key.workspaceId,
    role: key.role,
  };
}
