import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkspaceRepository as PostgresDatabase } from '../platform/workspace-repository.js';
import { vision } from '../db/schema.js';
import type { WorkspaceActor } from './tasks.js';

const createVisionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(20_000),
  focusItems: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
});

const updateVisionSchema = createVisionSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be updated.');

const listVisionQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export class VisionError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'VisionError';
  }
}

function parseOrThrow<T>(result: z.ZodSafeParseResult<T>) {
  if (!result.success) {
    throw new VisionError(result.error.issues[0]?.message || 'Invalid vision request.', 400);
  }
  return result.data;
}

function asApiVision(row: typeof vision.$inferSelect) {
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
    ...(row.sourceLineage || {}),
  };
}

export async function listVisions(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  query: unknown,
) {
  const parsed = parseOrThrow(listVisionQuerySchema.safeParse(query));
  const rows = await database
    .select()
    .from(vision)
    .where(eq(vision.workspaceId, actor.workspaceId))
    .orderBy(desc(vision.createdAt))
    .limit(parsed.limit);
  return rows.map(asApiVision);
}

export async function getVision(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  visionId: string,
) {
  const parsedVisionId = parseOrThrow(z.string().uuid().safeParse(visionId));
  const rows = await database
    .select()
    .from(vision)
    .where(and(eq(vision.id, parsedVisionId), eq(vision.workspaceId, actor.workspaceId)))
    .limit(1);
  if (!rows[0]) throw new VisionError('Vision not found.', 404);
  return asApiVision(rows[0]);
}

export async function createVision(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  input: unknown,
) {
  const parsed = parseOrThrow(createVisionSchema.safeParse(input));
  const rows = await database
    .insert(vision)
    .values({
      workspaceId: actor.workspaceId,
      createdByUserId: actor.userId,
      ...parsed,
    })
    .returning();
  return asApiVision(rows[0]);
}

export async function updateVision(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  visionId: string,
  input: unknown,
) {
  const parsedVisionId = parseOrThrow(z.string().uuid().safeParse(visionId));
  const parsed = parseOrThrow(updateVisionSchema.safeParse(input));
  const rows = await database
    .update(vision)
    .set({ ...parsed, updatedAt: new Date() })
    .where(and(eq(vision.id, parsedVisionId), eq(vision.workspaceId, actor.workspaceId)))
    .returning();
  if (rows.length === 0) throw new VisionError('Vision not found.', 404);
  return asApiVision(rows[0]);
}

export async function deleteVision(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  visionId: string,
) {
  const parsedVisionId = parseOrThrow(z.string().uuid().safeParse(visionId));
  const rows = await database
    .delete(vision)
    .where(and(eq(vision.id, parsedVisionId), eq(vision.workspaceId, actor.workspaceId)))
    .returning({ id: vision.id });
  if (rows.length === 0) throw new VisionError('Vision not found.', 404);
  return { id: rows[0].id, deleted: true };
}
