import { and, asc, desc, eq, gt, ilike, inArray, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkspaceRepository as PostgresDatabase } from '../platform/workspace-repository.js';
import type { WorkspaceActor } from '../execution/tasks.js';
import { operatorMemory, operatorMemoryRevision } from '../db/schema.js';
import { memoryMutationSchema, type MemoryMutation, type SourceReference } from './types.js';

export class AIMemoryError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'AIMemoryError';
  }
}

function serializeMemory(row: typeof operatorMemory.$inferSelect) {
  return {
    id: row.id,
    scope: row.scope,
    scopeId: row.scopeId,
    memoryType: row.memoryType,
    state: row.state,
    content: row.content,
    confidence: row.confidence,
    sourceCheckInId: row.sourceCheckinId,
    sourceOutputId: row.sourceOutputId,
    pinned: row.pinned,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    usedCount: row.usedCount,
    source: row.source,
    sourceMetadata: row.sourceMetadata,
    sourceRunId: row.sourceRunId,
    supersededMemoryId: row.supersededMemoryId,
    evidenceMetadata: row.evidenceMetadata,
    revision: row.revision,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

function snapshot(row: typeof operatorMemory.$inferSelect | null) {
  return row ? serializeMemory(row) : {};
}

export async function listAIMemories(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  input: { query?: string; includeArchived?: boolean; limit?: number } = {},
) {
  const query = input.query?.trim();
  const states = input.includeArchived ? ['suggested', 'active', 'pinned', 'rejected', 'expired', 'archived'] as const : ['suggested', 'active', 'pinned'] as const;
  const rows = await database
    .select()
    .from(operatorMemory)
    .where(and(
      eq(operatorMemory.workspaceId, actor.workspaceId),
      eq(operatorMemory.scope, 'global'),
      inArray(operatorMemory.state, states),
      input.includeArchived ? undefined : or(isNull(operatorMemory.expiresAt), gt(operatorMemory.expiresAt, new Date())),
      query ? ilike(operatorMemory.content, `%${query.replace(/[%_]/g, '\\$&')}%`) : undefined,
    ))
    .orderBy(desc(operatorMemory.updatedAt))
    .limit(Math.min(Math.max(input.limit || 100, 1), 200));
  return rows.map(serializeMemory);
}

export async function retrieveAIMemories(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  query: string,
  limit = 20,
) {
  const words = [...new Set(query.toLowerCase().split(/\W+/).filter((word) => word.length >= 3))].slice(0, 8);
  const rows = await database
    .select()
    .from(operatorMemory)
    .where(and(
      eq(operatorMemory.workspaceId, actor.workspaceId),
      inArray(operatorMemory.scope, ['global', 'operator', 'hub', 'goal', 'artifact', 'work_order', 'checkin']),
      inArray(operatorMemory.state, ['active', 'pinned']),
      or(isNull(operatorMemory.expiresAt), gt(operatorMemory.expiresAt, new Date())),
      words.length
        ? or(...words.map((word) => ilike(operatorMemory.content, `%${word.replace(/[%_]/g, '\\$&')}%`)))
        : undefined,
    ))
    .orderBy(desc(operatorMemory.pinned), desc(operatorMemory.updatedAt))
    .limit(Math.min(Math.max(limit, 1), 50));
  return rows.map(serializeMemory);
}

function mutationValue<T>(mutation: MemoryMutation, value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value;
}

async function recordRevision(
  transaction: any,
  actor: WorkspaceActor,
  memoryId: string,
  aiRunId: string | null,
  operation: 'create' | 'update' | 'merge' | 'expire' | 'archive' | 'restore',
  beforeState: Record<string, unknown>,
  afterState: Record<string, unknown>,
  reason: string,
  sourceReferences: SourceReference[],
) {
  await transaction.insert(operatorMemoryRevision).values({
    workspaceId: actor.workspaceId,
    memoryId,
    aiRunId,
    operation,
    beforeState,
    afterState,
    reason,
    sourceReferences,
    revisionNumber: Number(afterState.revision || 1),
    createdByUserId: actor.userId,
  });
}

export async function applyAutonomousMemoryMutations(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  aiRunId: string | null,
  input: unknown,
) {
  const parsed = z.array(memoryMutationSchema).max(50).safeParse(input);
  if (!parsed.success) throw new AIMemoryError(parsed.error.issues[0]?.message || 'Invalid autonomous memory mutation.');
  const mutations = parsed.data;
  if (mutations.length === 0) return [];

  return database.transaction(async (transaction) => {
    const results: Array<Record<string, unknown>> = [];
    for (const mutation of mutations) {
      const target = mutation.memoryId
        ? (await transaction.select().from(operatorMemory).where(and(
          eq(operatorMemory.workspaceId, actor.workspaceId),
          eq(operatorMemory.id, mutation.memoryId),
        )).limit(1))[0]
        : undefined;
      if (mutation.memoryId && !target) {
        throw new AIMemoryError('AI memory target was not found in this workspace.', 409);
      }

      if (mutation.operation === 'create' && !target) {
        const normalized = mutation.content.trim().toLowerCase();
        const duplicate = (await transaction.select().from(operatorMemory).where(and(
          eq(operatorMemory.workspaceId, actor.workspaceId),
          eq(operatorMemory.scope, mutation.scope),
          mutation.scopeId !== null && mutation.scopeId !== undefined
            ? eq(operatorMemory.scopeId, mutation.scopeId)
            : isNull(operatorMemory.scopeId),
          inArray(operatorMemory.state, ['active', 'pinned']),
        ))).find((row: typeof operatorMemory.$inferSelect) => row.content.trim().toLowerCase() === normalized);
        if (duplicate) {
          const before = snapshot(duplicate);
          const updated = (await transaction.update(operatorMemory).set({
            confidence: mutation.confidence,
            source: 'ai_engine',
            sourceRunId: aiRunId,
            sourceMetadata: {
              ...(duplicate.sourceMetadata || {}),
              aiRunId,
              autonomous: true,
              reason: mutation.reason,
              sourceReferences: mutation.sourceReferences,
            },
            evidenceMetadata: {
              sourceReferences: mutation.sourceReferences,
              reason: mutation.reason,
            },
            revision: duplicate.revision + 1,
            archivedAt: null,
            updatedAt: new Date(),
          }).where(eq(operatorMemory.id, duplicate.id)).returning())[0];
          await recordRevision(transaction, actor, duplicate.id, aiRunId, 'update', before, snapshot(updated), mutation.reason, mutation.sourceReferences);
          results.push({ operation: 'update', memoryId: duplicate.id, duplicate: true });
          continue;
        }
        const created = (await transaction.insert(operatorMemory).values({
          workspaceId: actor.workspaceId,
          scope: mutation.scope,
          scopeId: mutation.scopeId ?? null,
          memoryType: mutation.memoryType,
          state: 'active',
          content: mutation.content,
          confidence: mutation.confidence,
          expiresAt: mutation.expiresAt ? new Date(mutation.expiresAt) : null,
          pinned: mutation.pinned ?? false,
          source: 'ai_engine',
          sourceRunId: aiRunId,
          sourceMetadata: {
            aiRunId,
            autonomous: true,
            reason: mutation.reason,
            sourceReferences: mutation.sourceReferences,
          },
          evidenceMetadata: {
            sourceReferences: mutation.sourceReferences,
            reason: mutation.reason,
          },
          revision: 1,
          archivedAt: null,
          createdByUserId: actor.userId,
        }).returning())[0];
        await recordRevision(transaction, actor, created.id, aiRunId, 'create', {}, snapshot(created), mutation.reason, mutation.sourceReferences);
        results.push({ operation: 'create', memoryId: created.id });
        continue;
      }

      if (!target) throw new AIMemoryError(`Memory ${mutation.operation} requires a memoryId.`, 422);
      const before = snapshot(target);
      if (mutation.operation === 'merge') {
        const mergeIds = Array.from(new Set(mutation.mergeMemoryIds.filter((id) => id !== target.id)));
        const mergeTargets = mergeIds.length > 0
          ? await transaction.select().from(operatorMemory).where(and(
            eq(operatorMemory.workspaceId, actor.workspaceId),
            inArray(operatorMemory.id, mergeIds),
          ))
          : [];
        for (const mergeTarget of mergeTargets) {
          const archived = (await transaction.update(operatorMemory).set({
            state: 'archived',
            supersededMemoryId: target.id,
            archivedAt: new Date(),
            revision: mergeTarget.revision + 1,
            updatedAt: new Date(),
          }).where(and(
            eq(operatorMemory.workspaceId, actor.workspaceId),
            eq(operatorMemory.id, mergeTarget.id),
          )).returning())[0];
          await recordRevision(transaction, actor, mergeTarget.id, aiRunId, 'merge', snapshot(mergeTarget), snapshot(archived || null), mutation.reason, mutation.sourceReferences);
        }
      }
      const nextState = mutation.operation === 'expire' ? 'expired'
        : mutation.operation === 'archive' ? 'archived'
          : 'active';
      const updated = (await transaction.update(operatorMemory).set({
        scope: mutation.scope,
        scopeId: mutation.scopeId ?? target.scopeId,
        memoryType: mutation.memoryType,
        state: nextState,
        content: mutation.content,
        confidence: mutation.confidence,
        sourceRunId: aiRunId,
        expiresAt: mutation.expiresAt === undefined ? target.expiresAt : mutation.expiresAt ? new Date(mutation.expiresAt) : null,
        pinned: mutation.pinned ?? target.pinned,
        source: 'ai_engine',
        sourceMetadata: {
          ...(target.sourceMetadata || {}),
          aiRunId,
          autonomous: true,
          reason: mutation.reason,
          sourceReferences: mutation.sourceReferences,
          mergedMemoryIds: mutation.mergeMemoryIds,
        },
        evidenceMetadata: {
          sourceReferences: mutation.sourceReferences,
          reason: mutation.reason,
          mergedMemoryIds: mutation.mergeMemoryIds,
        },
        revision: target.revision + 1,
        archivedAt: nextState === 'archived' || nextState === 'expired' ? new Date() : null,
        updatedAt: new Date(),
      }).where(eq(operatorMemory.id, target.id)).returning())[0];
      await recordRevision(
        transaction,
        actor,
        target.id,
        aiRunId,
        mutation.operation,
        before,
        snapshot(updated),
        mutation.reason,
        mutation.sourceReferences,
      );
      results.push({ operation: mutation.operation, memoryId: target.id, mergedMemoryIds: mutation.mergeMemoryIds });
    }
    return results;
  });
}

export async function listMemoryRevisions(database: PostgresDatabase, actor: WorkspaceActor, memoryId: string) {
  const rows = await database.select().from(operatorMemoryRevision).where(and(
    eq(operatorMemoryRevision.workspaceId, actor.workspaceId),
    eq(operatorMemoryRevision.memoryId, memoryId),
  )).orderBy(asc(operatorMemoryRevision.createdAt));
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function undoMemoryRevision(database: PostgresDatabase, actor: WorkspaceActor, revisionId: string, memoryId?: string) {
  return database.transaction(async (transaction) => {
    const revision = (await transaction.select().from(operatorMemoryRevision).where(and(
      eq(operatorMemoryRevision.workspaceId, actor.workspaceId),
      eq(operatorMemoryRevision.id, revisionId),
    )).limit(1))[0];
    if (!revision) throw new AIMemoryError('Memory revision not found.', 404);
    if (memoryId && revision.memoryId !== memoryId) throw new AIMemoryError('Memory revision does not belong to this memory.', 409);
    const current = (await transaction.select().from(operatorMemory).where(and(
      eq(operatorMemory.workspaceId, actor.workspaceId),
      eq(operatorMemory.id, revision.memoryId),
    )).limit(1))[0];
    if (!current) throw new AIMemoryError('Memory record no longer exists.', 404);
    const previous = revision.beforeState as Record<string, unknown>;
    if (Object.keys(previous).length === 0) {
      const archived = (await transaction.update(operatorMemory).set({
        state: 'archived',
        sourceRunId: revision.aiRunId,
        source: 'ai_engine_undo',
        sourceMetadata: {
          ...(current.sourceMetadata || {}),
          undoOfRevisionId: revision.id,
        },
        evidenceMetadata: {
          ...(current.evidenceMetadata || {}),
          undoOfRevisionId: revision.id,
        },
        revision: current.revision + 1,
        archivedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(operatorMemory.id, current.id)).returning())[0];
      await recordRevision(transaction, actor, current.id, revision.aiRunId, 'restore', snapshot(current), snapshot(archived || null), `Undo memory revision ${revision.id}.`, revision.sourceReferences as SourceReference[]);
    } else {
      const state = previous.state;
      const restored = await transaction.update(operatorMemory).set({
        scope: previous.scope as typeof operatorMemory.$inferInsert.scope,
        scopeId: (previous.scopeId as string | null | undefined) ?? null,
        memoryType: previous.memoryType as typeof operatorMemory.$inferInsert.memoryType,
        state: state as typeof operatorMemory.$inferInsert.state,
        content: String(previous.content || current.content),
        confidence: previous.confidence as typeof operatorMemory.$inferInsert.confidence,
        pinned: Boolean(previous.pinned),
        sourceRunId: revision.aiRunId,
        supersededMemoryId: (previous.supersededMemoryId as string | null | undefined) ?? null,
        evidenceMetadata: (previous.evidenceMetadata as Record<string, unknown> | undefined) || {},
        revision: current.revision + 1,
        archivedAt: previous.archivedAt ? new Date(String(previous.archivedAt)) : null,
        expiresAt: previous.expiresAt ? new Date(String(previous.expiresAt)) : null,
        source: 'ai_engine_undo',
        sourceMetadata: {
          ...(current.sourceMetadata || {}),
          undoOfRevisionId: revision.id,
        },
        updatedAt: new Date(),
      }).where(eq(operatorMemory.id, current.id)).returning();
      await recordRevision(transaction, actor, current.id, revision.aiRunId, 'restore', snapshot(current), snapshot(restored[0]), `Undo memory revision ${revision.id}.`, revision.sourceReferences as SourceReference[]);
    }
    return { memoryId: current.id, undoneRevisionId: revision.id };
  });
}
