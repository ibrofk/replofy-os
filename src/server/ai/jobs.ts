import { and, eq, lte, lt } from 'drizzle-orm';
import type { ServerConfig } from '../config.js';
import type { WorkspaceRepository as PostgresDatabase } from '../platform/workspace-repository.js';
import type { WorkspaceActor } from '../execution/tasks.js';
import { aiJob, contextSourceVersion } from '../db/schema.js';
import { AIEngine } from './engine.js';
import { getAIActivation } from './settings.js';
import { applyAutonomousMemoryMutations, listAIMemories } from './memory.js';
import { MemoryProjectionClient, type MemoryProjectionRecord } from './memory-projection.js';
import type { SourceReference } from './types.js';

export async function enqueueAIJob(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  type: typeof aiJob.$inferInsert.type,
  payload: Record<string, unknown>,
  options: { runId?: string; idempotencyKey?: string; maxAttempts?: number } = {},
) {
  if (options.idempotencyKey) {
    const existing = await database.select().from(aiJob).where(and(
      eq(aiJob.workspaceId, actor.workspaceId),
      eq(aiJob.idempotencyKey, options.idempotencyKey),
    )).limit(1);
    if (existing[0]) return existing[0];
  }
  const activation = await getAIActivation(database, actor);
  const rows = await database.insert(aiJob).values({
    workspaceId: actor.workspaceId,
    runId: options.runId || null,
    type,
    status: activation.status === 'active' ? 'queued' : 'blocked',
    payload: { ...payload, userId: actor.userId },
    idempotencyKey: options.idempotencyKey || null,
    maxAttempts: options.maxAttempts || 3,
    lastError: activation.status === 'active' ? null : 'AI engine inactive: configure a workspace provider key and selected model.',
  }).returning();
  return rows[0];
}

export class AIJobRunner {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly workerId = `replofy-ai-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

  constructor(
    private readonly database: PostgresDatabase,
    private readonly config: ServerConfig,
    private readonly engine: AIEngine,
    private readonly resolveActor: (userId: string, workspaceId: string) => Promise<WorkspaceActor>,
  ) {}

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), 1_500);
    this.timer.unref();
    void this.recoverStaleJobs().catch((error) => {
      console.error('[replofy-os] AI worker stale-job recovery failed', error);
    });
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async recoverStaleJobs() {
    const cutoff = new Date(Date.now() - 5 * 60_000);
    await this.database.update(aiJob).set({
      status: 'queued',
      lockedAt: null,
      lockedBy: null,
      availableAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(aiJob.status, 'running'), lt(aiJob.lockedAt, cutoff)));
  }

  private async claimOne() {
    const candidate = (await this.database.select().from(aiJob).where(and(
      eq(aiJob.status, 'queued'),
      lte(aiJob.availableAt, new Date()),
    )).limit(1))[0];
    if (!candidate) return null;
    const claimed = (await this.database.update(aiJob).set({
      status: 'running',
      lockedAt: new Date(),
      lockedBy: this.workerId,
      attemptCount: candidate.attemptCount + 1,
      updatedAt: new Date(),
    }).where(and(eq(aiJob.id, candidate.id), eq(aiJob.status, 'queued'))).returning())[0];
    return claimed || null;
  }

  private async unblockEligibleJobs() {
    const blocked = await this.database.select().from(aiJob).where(eq(aiJob.status, 'blocked')).limit(25);
    for (const job of blocked) {
      const payload = job.payload as Record<string, unknown>;
      try {
        const actor = await this.resolveActor(String(payload.userId), job.workspaceId);
        const activation = await getAIActivation(this.database, actor);
        if (activation.status === 'active') {
          await this.database.update(aiJob).set({
            status: 'queued',
            availableAt: new Date(),
            lastError: null,
            updatedAt: new Date(),
          }).where(and(eq(aiJob.id, job.id), eq(aiJob.status, 'blocked')));
        }
      } catch {
        // Membership or database errors must not stop other workspaces from being polled.
      }
    }
  }

  private async tick() {
    if (this.running || !this.config.aiWorkerEnabled) return;
    this.running = true;
    try {
      await this.unblockEligibleJobs();
      const job = await this.claimOne();
      if (!job) return;
      const payload = job.payload as Record<string, unknown>;
      try {
        const actor = await this.resolveActor(String(payload.userId), job.workspaceId);
        const activation = await getAIActivation(this.database, actor);
        if (activation.status !== 'active') {
          await this.database.update(aiJob).set({
            status: 'blocked',
            lastError: 'AI engine inactive: configure a workspace provider key and selected model.',
            lockedAt: null,
            lockedBy: null,
            updatedAt: new Date(),
          }).where(eq(aiJob.id, job.id));
          return;
        }
        if (job.type === 'analyze_source' || job.type === 'generate_proposal') {
          const result = await this.engine.run(
            actor,
            job.type === 'analyze_source' ? 'analyze' : 'inline',
            payload.context,
            typeof payload.agentProfileId === 'string' ? payload.agentProfileId : undefined,
          );
          await this.database.update(aiJob).set({
            status: 'succeeded',
            result: result as unknown as Record<string, unknown>,
            lockedAt: null,
            lockedBy: null,
            updatedAt: new Date(),
          }).where(eq(aiJob.id, job.id));
        } else if (job.type === 'apply_memory_mutations') {
          const result = await applyAutonomousMemoryMutations(this.database, actor, job.runId, payload.mutations);
          await this.database.update(aiJob).set({
            status: 'succeeded',
            result: { memoryResults: result },
            lockedAt: null,
            lockedBy: null,
            updatedAt: new Date(),
          }).where(eq(aiJob.id, job.id));
        } else if (job.type === 'index_memory' || job.type === 'index_context') {
          const projection = new MemoryProjectionClient(this.config);
          if (!projection.enabled) throw new Error('Memory projection is not configured.');
          let records = Array.isArray(payload.records) ? payload.records as unknown as MemoryProjectionRecord[] : [];
          if (job.type === 'index_context' && records.length === 0 && typeof payload.sourceVersionId === 'string') {
            const source = (await this.database.select().from(contextSourceVersion).where(and(
              eq(contextSourceVersion.workspaceId, job.workspaceId),
              eq(contextSourceVersion.id, payload.sourceVersionId),
            )).limit(1))[0];
            if (source) records = [{
              id: source.id,
              type: 'context-source',
              content: source.fullContent || source.contentPreview,
              metadata: {
                sourceId: source.sourceId,
                sourceVersionId: source.id,
                title: source.fileName,
                ...source.payload,
              },
              sourceReferences: [{ sourceId: source.sourceId, sourceVersionId: source.id, title: source.fileName }],
            }];
          }
          const result = await projection.upsert(job.workspaceId, records);
          await this.database.update(aiJob).set({
            status: 'succeeded',
            result: result as unknown as Record<string, unknown>,
            lockedAt: null,
            lockedBy: null,
            updatedAt: new Date(),
          }).where(eq(aiJob.id, job.id));
        } else if (job.type === 'delete_source_projection') {
          const projection = new MemoryProjectionClient(this.config);
          if (!projection.enabled) throw new Error('Memory projection is not configured.');
          const sourceVersionId = String(payload.sourceVersionId || '');
          if (!sourceVersionId) throw new Error('A source version is required for projection deletion.');
          const result = await projection.removeSource(job.workspaceId, sourceVersionId);
          await this.database.update(aiJob).set({
            status: 'succeeded',
            result: result as unknown as Record<string, unknown>,
            lockedAt: null,
            lockedBy: null,
            updatedAt: new Date(),
          }).where(eq(aiJob.id, job.id));
        } else if (job.type === 'reindex_workspace') {
          const projection = new MemoryProjectionClient(this.config);
          if (!projection.enabled) throw new Error('Memory projection is not configured.');
          const memories = Array.isArray(payload.records)
            ? payload.records as unknown as MemoryProjectionRecord[]
            : (await listAIMemories(this.database, actor, { limit: 200 })).map((memory) => ({
              id: String(memory.id),
              type: `memory:${String(memory.memoryType)}`,
              content: String(memory.content),
              metadata: {
                ...(memory.sourceMetadata as Record<string, unknown> || {}),
                state: memory.state,
                pinned: memory.pinned,
              },
              sourceReferences: ((memory.sourceMetadata as Record<string, unknown> || {}).sourceReferences || []) as SourceReference[],
            }));
          const result = await projection.reindex(job.workspaceId, memories);
          await this.database.update(aiJob).set({
            status: 'succeeded',
            result: result as unknown as Record<string, unknown>,
            lockedAt: null,
            lockedBy: null,
            updatedAt: new Date(),
          }).where(eq(aiJob.id, job.id));
        } else if (job.type === 'learn_patterns') {
          await this.database.update(aiJob).set({
            status: 'succeeded',
            result: { learned: false, message: 'Pattern learning awaits domain-specific signals; no provider call was made.' },
            lockedAt: null,
            lockedBy: null,
            updatedAt: new Date(),
          }).where(eq(aiJob.id, job.id));
        } else {
          await this.database.update(aiJob).set({
            status: 'succeeded',
            result: { skipped: true, message: `Job type ${job.type} has no worker handler yet.` },
            lockedAt: null,
            lockedBy: null,
            updatedAt: new Date(),
          }).where(eq(aiJob.id, job.id));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'AI job failed.';
        const activationBlocked = error instanceof Error && 'statusCode' in error
          && (error as { statusCode?: unknown }).statusCode === 409
          && /configure|select|inactive|key|model/i.test(error.message);
        const terminal = !activationBlocked && job.attemptCount >= job.maxAttempts;
        await this.database.update(aiJob).set({
          status: activationBlocked ? 'blocked' : terminal ? 'failed' : 'queued',
          lastError: message.slice(0, 2_000),
          availableAt: new Date(Date.now() + Math.min(60_000, 1_500 * 2 ** job.attemptCount)),
          lockedAt: null,
          lockedBy: null,
          updatedAt: new Date(),
        }).where(eq(aiJob.id, job.id));
      }
    } catch (error) {
      console.error('[replofy-os] AI worker tick failed', error);
    } finally {
      this.running = false;
    }
  }
}
