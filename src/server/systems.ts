import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { postgresErrorCode } from './db/errors.js';
import type { WorkspaceRepository as PostgresDatabase } from './platform/workspace-repository.js';
import { apiEndpoint, environment, environmentDeployment } from './db/schema.js';
import type { WorkspaceActor } from './execution/tasks.js';

const apiEndpointMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;
const apiEndpointStatuses = ['draft', 'active', 'deprecated'] as const;
const environmentNames = ['Local', 'Staging', 'Production'] as const;
const environmentStatuses = ['healthy', 'deploying', 'failed'] as const;

const endpointCreateSchema = z.object({
  method: z.enum(apiEndpointMethods).default('GET'),
  path: z.string().trim().min(1).max(400).refine((value) => value.startsWith('/'), 'Path must start with /.').transform((value) => value.replace(/\/{2,}/g, '/')),
  description: z.string().trim().min(1).max(2_000),
  status: z.enum(apiEndpointStatuses).default('active'),
});
const endpointUpdateSchema = endpointCreateSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one endpoint field is required.');
const endpointFiltersSchema = z.object({
  method: z.enum(apiEndpointMethods).optional(),
  status: z.enum(apiEndpointStatuses).optional(),
});
const environmentCreateSchema = z.object({
  name: z.enum(environmentNames),
  status: z.enum(environmentStatuses).default('healthy'),
  version: z.string().trim().min(1).max(40).default('v0.0.0'),
  lastSync: z.string().datetime().optional(),
});
const environmentUpdateSchema = z.object({
  name: z.enum(environmentNames).optional(),
  status: z.enum(environmentStatuses).optional(),
  version: z.string().trim().min(1).max(40).optional(),
  lastSync: z.string().datetime().optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one environment field is required.');
const environmentFiltersSchema = z.object({
  name: z.enum(environmentNames).optional(),
  status: z.enum(environmentStatuses).optional(),
});
const environmentIdSchema = z.string().uuid();
const deploymentInputSchema = z.object({
  version: z.string().trim().min(1).max(40).optional(),
  message: z.string().trim().max(2_000).default(''),
});
const rollbackInputSchema = z.object({
  targetVersion: z.string().trim().min(1).max(40).optional(),
  message: z.string().trim().max(2_000).default(''),
});
const deploymentFiltersSchema = z.object({
  environmentId: z.string().uuid().optional(),
});

export class SystemsError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'SystemsError';
  }
}

function parse<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new SystemsError(result.error.issues[0]?.message || message, 400);
  return result.data;
}

function isUniqueViolation(error: unknown) {
  return postgresErrorCode(error) === '23505';
}

function serializeEndpoint(row: typeof apiEndpoint.$inferSelect) {
  return {
    id: row.id,
    method: row.method,
    path: row.path,
    description: row.description,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

function serializeEnvironment(row: typeof environment.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    lastSync: row.lastSync.toISOString(),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

function serializeDeployment(row: typeof environmentDeployment.$inferSelect) {
  return {
    id: row.id,
    environmentId: row.environmentId,
    action: row.action,
    status: row.status,
    version: row.version,
    previousVersion: row.previousVersion,
    message: row.message,
    requestedByUserId: row.requestedByUserId,
    createdAt: row.createdAt.toISOString(),
    companyId: row.workspaceId,
  };
}

function nextEnvironmentVersion(currentVersion: string) {
  const match = currentVersion.match(/^v(\d+)\.(\d+)\.(\d+)$/);
  if (match) return `v${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
  return `v${Date.now()}`;
}

function parseQuery<T>(schema: z.ZodType<T>, query: Record<string, unknown>, message: string) {
  return parse(schema, query, message);
}

export async function listApiEndpoints(database: PostgresDatabase, actor: WorkspaceActor, query: Record<string, unknown> = {}) {
  const filters = parseQuery(endpointFiltersSchema, query, 'API endpoint filters are invalid.');
  const rows = await database.select().from(apiEndpoint).where(and(
    eq(apiEndpoint.workspaceId, actor.workspaceId),
    filters.method ? eq(apiEndpoint.method, filters.method) : undefined,
    filters.status ? eq(apiEndpoint.status, filters.status) : undefined,
  )).orderBy(desc(apiEndpoint.updatedAt)).limit(500);
  return rows.map(serializeEndpoint);
}

export async function getApiEndpoint(database: PostgresDatabase, actor: WorkspaceActor, endpointId: string) {
  const id = parse(environmentIdSchema, endpointId, 'API endpoint id is invalid.');
  const rows = await database.select().from(apiEndpoint).where(and(
    eq(apiEndpoint.workspaceId, actor.workspaceId), eq(apiEndpoint.id, id),
  )).limit(1);
  if (!rows[0]) throw new SystemsError('API endpoint not found.', 404);
  return serializeEndpoint(rows[0]);
}

export async function createApiEndpoint(database: PostgresDatabase, actor: WorkspaceActor, input: unknown) {
  const data = parse(endpointCreateSchema, input, 'API endpoint is invalid.');
  try {
    const rows = await database.insert(apiEndpoint).values({
      workspaceId: actor.workspaceId,
      createdByUserId: actor.userId,
      method: data.method,
      path: data.path || '/',
      description: data.description,
      status: data.status,
    }).returning();
    return serializeEndpoint(rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) throw new SystemsError('An endpoint with this method and path already exists.', 409);
    throw error;
  }
}

export async function updateApiEndpoint(database: PostgresDatabase, actor: WorkspaceActor, endpointId: string, input: unknown) {
  const id = parse(environmentIdSchema, endpointId, 'API endpoint id is invalid.');
  const data = parse(endpointUpdateSchema, input, 'API endpoint update is invalid.');
  try {
    const rows = await database.update(apiEndpoint).set({ ...data, updatedAt: new Date() }).where(and(
      eq(apiEndpoint.workspaceId, actor.workspaceId), eq(apiEndpoint.id, id),
    )).returning();
    if (!rows[0]) throw new SystemsError('API endpoint not found.', 404);
    return serializeEndpoint(rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) throw new SystemsError('An endpoint with this method and path already exists.', 409);
    throw error;
  }
}

export async function deleteApiEndpoint(database: PostgresDatabase, actor: WorkspaceActor, endpointId: string) {
  const id = parse(environmentIdSchema, endpointId, 'API endpoint id is invalid.');
  const rows = await database.delete(apiEndpoint).where(and(
    eq(apiEndpoint.workspaceId, actor.workspaceId), eq(apiEndpoint.id, id),
  )).returning({ id: apiEndpoint.id });
  if (!rows[0]) throw new SystemsError('API endpoint not found.', 404);
  return { id: rows[0].id, deleted: true as const };
}

export async function listEnvironments(database: PostgresDatabase, actor: WorkspaceActor, query: Record<string, unknown> = {}) {
  const filters = parseQuery(environmentFiltersSchema, query, 'Environment filters are invalid.');
  const rows = await database.select().from(environment).where(and(
    eq(environment.workspaceId, actor.workspaceId),
    filters.name ? eq(environment.name, filters.name) : undefined,
    filters.status ? eq(environment.status, filters.status) : undefined,
  )).orderBy(desc(environment.updatedAt)).limit(100);
  return rows.map(serializeEnvironment);
}

export async function getEnvironment(database: PostgresDatabase, actor: WorkspaceActor, environmentId: string) {
  const id = parse(environmentIdSchema, environmentId, 'Environment id is invalid.');
  const rows = await database.select().from(environment).where(and(
    eq(environment.workspaceId, actor.workspaceId), eq(environment.id, id),
  )).limit(1);
  if (!rows[0]) throw new SystemsError('Environment not found.', 404);
  return serializeEnvironment(rows[0]);
}

export async function createEnvironment(database: PostgresDatabase, actor: WorkspaceActor, input: unknown) {
  const data = parse(environmentCreateSchema, input, 'Environment is invalid.');
  try {
    const rows = await database.insert(environment).values({
      workspaceId: actor.workspaceId,
      createdByUserId: actor.userId,
      name: data.name,
      status: data.status,
      version: data.version,
      ...(data.lastSync ? { lastSync: new Date(data.lastSync) } : {}),
    }).returning();
    return serializeEnvironment(rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) throw new SystemsError('An environment with this name already exists.', 409);
    throw error;
  }
}

export async function updateEnvironment(database: PostgresDatabase, actor: WorkspaceActor, environmentId: string, input: unknown) {
  const id = parse(environmentIdSchema, environmentId, 'Environment id is invalid.');
  const data = parse(environmentUpdateSchema, input, 'Environment update is invalid.');
  try {
    const { lastSync, ...patch } = data;
    const rows = await database.update(environment).set({
      ...patch,
      ...(lastSync ? { lastSync: new Date(lastSync) } : {}),
      updatedAt: new Date(),
    }).where(and(eq(environment.workspaceId, actor.workspaceId), eq(environment.id, id))).returning();
    if (!rows[0]) throw new SystemsError('Environment not found.', 404);
    return serializeEnvironment(rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) throw new SystemsError('An environment with this name already exists.', 409);
    throw error;
  }
}

async function getEnvironmentForUpdate(transaction: Parameters<Parameters<PostgresDatabase['transaction']>[0]>[0], actor: WorkspaceActor, environmentId: string) {
  const id = parse(environmentIdSchema, environmentId, 'Environment id is invalid.');
  const rows = await transaction.select().from(environment).where(and(
    eq(environment.workspaceId, actor.workspaceId), eq(environment.id, id),
  )).limit(1).for('update');
  if (!rows[0]) throw new SystemsError('Environment not found.', 404);
  if (rows[0].status === 'deploying') throw new SystemsError('Environment already has a deployment in progress.', 409);
  return rows[0];
}

export async function deployEnvironment(database: PostgresDatabase, actor: WorkspaceActor, environmentId: string, input: unknown) {
  const data = parse(deploymentInputSchema, input ?? {}, 'Deployment request is invalid.');
  return database.transaction(async (transaction) => {
    const current = await getEnvironmentForUpdate(transaction, actor, environmentId);
    const version = data.version || nextEnvironmentVersion(current.version);
    if (current.version === version) throw new SystemsError('Environment is already on this version.', 409);
    const now = new Date();
    const updated = await transaction.update(environment).set({
      status: 'healthy', version, lastSync: now, updatedAt: now,
    }).where(and(eq(environment.workspaceId, actor.workspaceId), eq(environment.id, current.id))).returning();
    const history = await transaction.insert(environmentDeployment).values({
      workspaceId: actor.workspaceId,
      environmentId: current.id,
      action: 'deploy',
      status: 'succeeded',
      version,
      previousVersion: current.version,
      message: data.message,
      requestedByUserId: actor.userId,
    }).returning();
    const serializedEnvironment = serializeEnvironment(updated[0]);
    return {
      action: 'deploy' as const,
      data: serializedEnvironment,
      environment: serializedEnvironment,
      deployment: serializeDeployment(history[0]),
    };
  });
}

export async function rollbackEnvironment(database: PostgresDatabase, actor: WorkspaceActor, environmentId: string, input: unknown = {}) {
  const data = parse(rollbackInputSchema, input, 'Rollback request is invalid.');
  return database.transaction(async (transaction) => {
    const current = await getEnvironmentForUpdate(transaction, actor, environmentId);
    let targetVersion = data.targetVersion;
    if (!targetVersion) {
      const history = await transaction.select().from(environmentDeployment).where(and(
        eq(environmentDeployment.workspaceId, actor.workspaceId),
        eq(environmentDeployment.environmentId, current.id),
      )).orderBy(desc(environmentDeployment.createdAt)).limit(100);
      targetVersion = history.find((entry) => entry.version === current.version && entry.previousVersion)?.previousVersion ?? undefined;
    }
    if (!targetVersion) throw new SystemsError('No previous version is available; provide targetVersion.', 409);
    if (targetVersion === current.version) throw new SystemsError('Environment is already on the rollback target.', 409);
    const now = new Date();
    const updated = await transaction.update(environment).set({
      status: 'healthy', version: targetVersion, lastSync: now, updatedAt: now,
    }).where(and(eq(environment.workspaceId, actor.workspaceId), eq(environment.id, current.id))).returning();
    const history = await transaction.insert(environmentDeployment).values({
      workspaceId: actor.workspaceId,
      environmentId: current.id,
      action: 'rollback',
      status: 'succeeded',
      version: targetVersion,
      previousVersion: current.version,
      message: data.message,
      requestedByUserId: actor.userId,
    }).returning();
    const serializedEnvironment = serializeEnvironment(updated[0]);
    return {
      action: 'rollback' as const,
      data: serializedEnvironment,
      environment: serializedEnvironment,
      deployment: serializeDeployment(history[0]),
    };
  });
}

export async function listEnvironmentDeployments(database: PostgresDatabase, actor: WorkspaceActor, query: Record<string, unknown> = {}) {
  const filters = parseQuery(deploymentFiltersSchema, query, 'Deployment filters are invalid.');
  const rows = await database.select().from(environmentDeployment).where(and(
    eq(environmentDeployment.workspaceId, actor.workspaceId),
    filters.environmentId ? eq(environmentDeployment.environmentId, filters.environmentId) : undefined,
  )).orderBy(desc(environmentDeployment.createdAt)).limit(500);
  return rows.map(serializeDeployment);
}
