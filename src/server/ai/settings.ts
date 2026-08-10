import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ServerConfig } from '../config.js';
import type { WorkspaceRepository as PostgresDatabase } from '../platform/workspace-repository.js';
import type { WorkspaceActor } from '../execution/tasks.js';
import { aiAgentProfile, aiProviderCredential, aiWorkspaceSettings } from '../db/schema.js';
import { decryptSecret, encryptSecret } from './crypto.js';
import { aiProviderIds, aiEngineStatuses, type AIEngineStatus, type AIProviderId } from './types.js';

const providerSchema = z.enum(aiProviderIds);
const settingsPatchSchema = z.object({
  defaultProvider: providerSchema.nullable().optional(),
  defaultModel: z.string().trim().max(200).nullable().optional(),
  fallbackEnabled: z.boolean().optional(),
  memoryServiceUrl: z.string().url().nullable().optional(),
});
const credentialSchema = z.object({
  provider: providerSchema,
  apiKey: z.string().trim().min(10).max(20_000),
  label: z.string().trim().min(1).max(100).optional(),
});
const agentSchema = z.object({
  name: z.string().trim().min(1).max(160),
  slug: z.string().trim().min(1).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  mission: z.string().max(4_000).default(''),
  instructions: z.string().max(12_000).default(''),
  allowedResourceTypes: z.array(z.string().max(120)).max(200).default([]),
  allowedTools: z.array(z.string().max(120)).max(200).default([]),
  provider: providerSchema.nullable().optional(),
  model: z.string().trim().max(200).nullable().optional(),
  status: z.enum(['active', 'paused', 'archived']).optional(),
});

export class AISettingsError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'AISettingsError';
  }
}

export function computeAIActivation(input: {
  defaultProvider: AIProviderId | null;
  defaultModel: string | null;
  credentialId: string | null;
  fallbackEnabled: boolean;
}): {
  status: AIEngineStatus;
  provider: AIProviderId | null;
  model: string | null;
  credentialId: string | null;
  fallbackEnabled: boolean;
} {
  if (!input.defaultProvider) {
    return {
      status: input.defaultModel ? 'inactive_missing_provider_key' : 'inactive_missing_model',
      provider: null,
      model: input.defaultModel,
      credentialId: null,
      fallbackEnabled: input.fallbackEnabled,
    };
  }
  if (!input.defaultModel) {
    return {
      status: 'inactive_missing_model',
      provider: input.defaultProvider,
      model: null,
      credentialId: null,
      fallbackEnabled: input.fallbackEnabled,
    };
  }
  return {
    status: input.credentialId ? 'active' : 'inactive_missing_provider_key',
    provider: input.defaultProvider,
    model: input.defaultModel,
    credentialId: input.credentialId,
    fallbackEnabled: input.fallbackEnabled,
  };
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new AISettingsError(result.error.issues[0]?.message || 'Invalid AI settings.');
  return result.data;
}

function assertAdmin(actor: WorkspaceActor) {
  if (actor.role === 'member') throw new AISettingsError('Workspace admin access is required.', 403);
}

export async function getOrCreateAISettings(database: PostgresDatabase, actor: WorkspaceActor) {
  const existing = await database
    .select()
    .from(aiWorkspaceSettings)
    .where(eq(aiWorkspaceSettings.workspaceId, actor.workspaceId))
    .limit(1);
  if (existing[0]) return existing[0];
  const rows = await database.insert(aiWorkspaceSettings).values({
    workspaceId: actor.workspaceId,
    createdByUserId: actor.userId,
  }).onConflictDoNothing({ target: aiWorkspaceSettings.workspaceId }).returning();
  if (rows[0]) return rows[0];
  return (await database
    .select()
    .from(aiWorkspaceSettings)
    .where(eq(aiWorkspaceSettings.workspaceId, actor.workspaceId))
    .limit(1))[0];
}

export async function getAIActivation(
  database: PostgresDatabase,
  actor: WorkspaceActor,
): Promise<{
  status: AIEngineStatus;
  provider: AIProviderId | null;
  model: string | null;
  credentialId: string | null;
  fallbackEnabled: boolean;
}> {
  const settings = await getOrCreateAISettings(database, actor);
  const credential = await database
    .select({ id: aiProviderCredential.id })
    .from(aiProviderCredential)
    .where(settings.defaultProvider ? and(
      eq(aiProviderCredential.workspaceId, actor.workspaceId),
      eq(aiProviderCredential.provider, settings.defaultProvider),
    ) : eq(aiProviderCredential.workspaceId, actor.workspaceId))
    .limit(1);
  return computeAIActivation({
    defaultProvider: settings.defaultProvider,
    defaultModel: settings.defaultModel,
    credentialId: credential[0]?.id ?? null,
    fallbackEnabled: settings.fallbackEnabled,
  });
}

export async function getAISettings(database: PostgresDatabase, actor: WorkspaceActor) {
  const settings = await getOrCreateAISettings(database, actor);
  const credentials = await database
    .select({
      id: aiProviderCredential.id,
      provider: aiProviderCredential.provider,
      label: aiProviderCredential.label,
      lastTestedAt: aiProviderCredential.lastTestedAt,
      lastError: aiProviderCredential.lastError,
      createdAt: aiProviderCredential.createdAt,
    })
    .from(aiProviderCredential)
    .where(eq(aiProviderCredential.workspaceId, actor.workspaceId))
    .orderBy(asc(aiProviderCredential.provider));
  const activation = await getAIActivation(database, actor);
  return {
    settings: {
      defaultProvider: settings.defaultProvider,
      defaultModel: settings.defaultModel,
      fallbackEnabled: settings.fallbackEnabled,
      memoryServiceUrl: settings.memoryServiceUrl,
      memoryServiceStatus: settings.memoryServiceStatus,
    },
    activation,
    credentials: credentials.map((credential) => ({
      id: credential.id,
      provider: credential.provider,
      label: credential.label,
      configured: true,
      lastTestedAt: credential.lastTestedAt?.toISOString() ?? null,
      lastError: credential.lastError,
      createdAt: credential.createdAt.toISOString(),
    })),
  };
}

export async function updateAISettings(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  input: unknown,
) {
  assertAdmin(actor);
  const parsed = parse(settingsPatchSchema, input);
  const current = await getOrCreateAISettings(database, actor);
  const patch: Partial<typeof aiWorkspaceSettings.$inferInsert> = { updatedAt: new Date() };
  if (parsed.defaultProvider !== undefined) patch.defaultProvider = parsed.defaultProvider;
  if (parsed.defaultModel !== undefined) patch.defaultModel = parsed.defaultModel;
  if (parsed.fallbackEnabled !== undefined) patch.fallbackEnabled = parsed.fallbackEnabled;
  if (parsed.memoryServiceUrl !== undefined) patch.memoryServiceUrl = parsed.memoryServiceUrl;
  const rows = await database
    .update(aiWorkspaceSettings)
    .set(patch)
    .where(eq(aiWorkspaceSettings.workspaceId, current.workspaceId))
    .returning();
  return rows[0];
}

export async function upsertAIProviderCredential(
  database: PostgresDatabase,
  config: ServerConfig,
  actor: WorkspaceActor,
  input: unknown,
) {
  assertAdmin(actor);
  const parsed = parse(credentialSchema, input);
  const encrypted = encryptSecret(config, parsed.apiKey);
  const existing = await database
    .select({ id: aiProviderCredential.id })
    .from(aiProviderCredential)
    .where(and(
      eq(aiProviderCredential.workspaceId, actor.workspaceId),
      eq(aiProviderCredential.provider, parsed.provider),
    ))
    .limit(1);
  const row = existing[0]
    ? (await database.update(aiProviderCredential).set({
      label: parsed.label || 'Workspace key',
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      keyVersion: encrypted.keyVersion,
      lastError: null,
      updatedAt: new Date(),
    }).where(eq(aiProviderCredential.id, existing[0].id)).returning())[0]
    : (await database.insert(aiProviderCredential).values({
      workspaceId: actor.workspaceId,
      provider: parsed.provider,
      label: parsed.label || 'Workspace key',
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      keyVersion: encrypted.keyVersion,
      createdByUserId: actor.userId,
    }).returning())[0];
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    configured: true,
    lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
    lastError: row.lastError,
  };
}

export async function deleteAIProviderCredential(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  provider: AIProviderId,
) {
  assertAdmin(actor);
  const rows = await database.delete(aiProviderCredential).where(and(
    eq(aiProviderCredential.workspaceId, actor.workspaceId),
    eq(aiProviderCredential.provider, provider),
  )).returning({ id: aiProviderCredential.id });
  return { id: rows[0]?.id ?? null, deleted: rows.length > 0 };
}

export async function getProviderCredential(
  database: PostgresDatabase,
  config: ServerConfig,
  actor: WorkspaceActor,
  provider: AIProviderId,
) {
  const row = await database
    .select()
    .from(aiProviderCredential)
    .where(and(
      eq(aiProviderCredential.workspaceId, actor.workspaceId),
      eq(aiProviderCredential.provider, provider),
    ))
    .limit(1);
  if (!row[0]) throw new AISettingsError('No provider API key is configured for this workspace.', 409);
  let apiKey: string;
  try {
    apiKey = decryptSecret(config, row[0]);
  } catch (error) {
    if (error instanceof Error) {
      throw new AISettingsError(
        `The saved ${provider} provider key cannot be decrypted with the current instance key. Set REPLOFY_AI_SECRETS_KEY to the original value, or replace this provider key in AI settings.`,
        409,
      );
    }
    throw error;
  }
  return {
    row: row[0],
    apiKey,
  };
}

export async function markProviderTest(
  database: PostgresDatabase,
  credentialId: string,
  error: string | null,
) {
  await database.update(aiProviderCredential).set({
    lastTestedAt: new Date(),
    lastError: error,
    updatedAt: new Date(),
  }).where(eq(aiProviderCredential.id, credentialId));
}

export async function listAIAgentProfiles(database: PostgresDatabase, actor: WorkspaceActor) {
  const rows = await database.select().from(aiAgentProfile).where(eq(aiAgentProfile.workspaceId, actor.workspaceId)).orderBy(asc(aiAgentProfile.name));
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function createAIAgentProfile(database: PostgresDatabase, actor: WorkspaceActor, input: unknown) {
  assertAdmin(actor);
  const parsed = parse(agentSchema, input);
  const rows = await database.insert(aiAgentProfile).values({
    workspaceId: actor.workspaceId,
    name: parsed.name,
    slug: parsed.slug,
    mission: parsed.mission,
    instructions: parsed.instructions,
    allowedResourceTypes: parsed.allowedResourceTypes,
    allowedTools: parsed.allowedTools,
    provider: parsed.provider ?? null,
    model: parsed.model ?? null,
    status: parsed.status ?? 'active',
    createdByUserId: actor.userId,
  }).returning();
  return { ...rows[0], createdAt: rows[0].createdAt.toISOString(), updatedAt: rows[0].updatedAt.toISOString() };
}

export async function updateAIAgentProfile(database: PostgresDatabase, actor: WorkspaceActor, id: string, input: unknown) {
  assertAdmin(actor);
  const parsed = parse(agentSchema.partial(), input);
  const rows = await database.update(aiAgentProfile).set({
    ...parsed,
    updatedAt: new Date(),
  }).where(and(eq(aiAgentProfile.id, id), eq(aiAgentProfile.workspaceId, actor.workspaceId))).returning();
  if (!rows[0]) throw new AISettingsError('AI agent profile not found.', 404);
  return { ...rows[0], createdAt: rows[0].createdAt.toISOString(), updatedAt: rows[0].updatedAt.toISOString() };
}
