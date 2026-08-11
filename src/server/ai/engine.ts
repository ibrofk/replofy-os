import { createHash } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { ServerConfig } from '../config.js';
import type { WorkspaceRepository as PostgresDatabase } from '../platform/workspace-repository.js';
import type { WorkspaceActor } from '../execution/tasks.js';
import { aiAgentProfile, aiProposal, aiProposalAction, aiProviderCredential, aiRun, aiSourceAnalysis, contextSourceVersion } from '../db/schema.js';
import { AIProviderGatewayError, ProviderGateway, SYSTEM_INSTRUCTION } from './provider-gateway.js';
import {
  getAIActivation,
  getOrCreateAISettings,
  getProviderCredential,
} from './settings.js';
import { applyAutonomousMemoryMutations, retrieveAIMemories } from './memory.js';
import { MemoryProjectionClient } from './memory-projection.js';
import { buildDomainContext, getAITools, normalizeAIAction } from './domain-registry.js';
import { loadCurrentRecordContext } from './context-loader.js';
import { getAIContextStrategy } from './context-strategy.js';
import { enforceAIActionability } from './actionability.js';
import {
  aiContextEnvelopeSchema,
  aiEngineOutputSchema,
  type AIContextEnvelope,
  type AIContextStats,
  type AIEngineOutput,
  type AIProviderId,
  type AISurface,
  type SourceReference,
} from './types.js';

export class AIEngineError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'AIEngineError';
  }
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseContext(input: unknown) {
  const parsed = aiContextEnvelopeSchema.safeParse(input);
  if (!parsed.success) throw new AIEngineError(parsed.error.issues[0]?.message || 'Invalid AI context.');
  return parsed.data;
}

function sourceRefsForContext(context: AIContextEnvelope): SourceReference[] {
  return [
    ...context.attachments.map((attachment) => ({
      title: attachment.fileName,
      locator: `attachment:${attachment.id}`,
    })),
    ...context.sourceIds.map((sourceId) => ({ sourceId })),
    ...context.sourceVersionIds.map((sourceVersionId) => ({ sourceVersionId })),
    ...(context.resourceId && context.resourceType ? [{
      locator: `${context.resourceType}:${context.resourceId}`,
      title: context.resourceType,
    }] : []),
  ];
}

function sourceRefsForSources(sources: Array<Record<string, unknown>>): SourceReference[] {
  const seen = new Set<string>();
  return sources.flatMap((source) => {
    const sourceId = typeof source.sourceId === 'string' && source.sourceId ? source.sourceId : undefined;
    const sourceVersionId = typeof source.sourceVersionId === 'string' && source.sourceVersionId ? source.sourceVersionId : undefined;
    const key = sourceVersionId || sourceId;
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [{
      ...(sourceId ? { sourceId } : {}),
      ...(sourceVersionId ? { sourceVersionId } : {}),
      ...(typeof source.fileName === 'string' && source.fileName ? { title: source.fileName } : {}),
    }];
  });
}

async function loadSourceContext(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  context: AIContextEnvelope,
) {
  if (context.sourceVersionIds.length === 0 && context.sourceIds.length === 0) return [];
  const explicitRows = context.sourceVersionIds.length > 0
    ? await database.select().from(contextSourceVersion).where(and(
      eq(contextSourceVersion.workspaceId, actor.workspaceId),
      inArray(contextSourceVersion.id, context.sourceVersionIds),
    ))
    : [];
  const latestBySource = new Map<string, typeof contextSourceVersion.$inferSelect>();
  if (context.sourceIds.length > 0) {
    const sourceRows = await database.select().from(contextSourceVersion).where(and(
      eq(contextSourceVersion.workspaceId, actor.workspaceId),
      inArray(contextSourceVersion.sourceId, context.sourceIds),
    )).orderBy(desc(contextSourceVersion.createdAt));
    for (const row of sourceRows) {
      if (!latestBySource.has(row.sourceId)) latestBySource.set(row.sourceId, row);
    }
  }
  const rows = [...explicitRows, ...latestBySource.values()].filter((row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index);
  return rows.map((row) => ({
    sourceId: row.sourceId,
    sourceVersionId: row.id,
    fileName: row.fileName,
    content: truncate(row.fullContent || row.contentPreview, 25_000),
    payload: row.payload,
  }));
}

async function resolveModel(
  database: PostgresDatabase,
  config: ServerConfig,
  actor: WorkspaceActor,
  agentProfileId?: string,
) {
  const settings = await getOrCreateAISettings(database, actor);
  const activation = await getAIActivation(database, actor);
  if (activation.status !== 'active') {
    throw new AIEngineError(activation.status === 'inactive_missing_model'
      ? 'Select a workspace model before using the AI context engine.'
      : 'Configure a workspace provider API key before using the AI context engine.', 409);
  }
  let provider = settings.defaultProvider as AIProviderId | null;
  let model = settings.defaultModel;
  let agentInstructions = '';
  let selectedAgentProfileId: string | null = null;
  let allowedResourceTypes: string[] = [];
  if (agentProfileId) {
    const profile = (await database.select().from(aiAgentProfile).where(and(
      eq(aiAgentProfile.id, agentProfileId),
      eq(aiAgentProfile.workspaceId, actor.workspaceId),
    )).limit(1))[0];
    if (!profile) throw new AIEngineError('AI agent profile was not found in this workspace.', 404);
    if (profile.status !== 'active') throw new AIEngineError('This AI agent profile is not active.', 409);
    provider = (profile.provider || provider) as AIProviderId | null;
    model = profile.model || model;
    agentInstructions = profile.instructions;
    selectedAgentProfileId = profile.id;
    allowedResourceTypes = profile.allowedResourceTypes;
  }
  if (!provider) throw new AIEngineError('Configure a provider API key before using the AI context engine.', 409);
  if (!model) throw new AIEngineError('Select a model before using the AI context engine.', 409);
  const credential = await getProviderCredential(database, config, actor, provider);
  const fallbackCandidates: Array<{ provider: AIProviderId; model: string; apiKey: string }> = [];
  if (settings.fallbackEnabled) {
    const fallbackCredentials = await database.select({ provider: aiProviderCredential.provider })
      .from(aiProviderCredential)
      .where(eq(aiProviderCredential.workspaceId, actor.workspaceId));
    for (const fallback of fallbackCredentials) {
      if (fallback.provider === provider) continue;
      const fallbackCredential = await getProviderCredential(database, config, actor, fallback.provider);
      fallbackCandidates.push({ provider: fallback.provider, model, apiKey: fallbackCredential.apiKey });
    }
  }
  return {
    provider,
    model,
    apiKey: credential.apiKey,
    agentInstructions,
    agentProfileId: selectedAgentProfileId,
    fallbackEnabled: settings.fallbackEnabled,
    fallbackCandidates,
    allowedResourceTypes,
  };
}

function buildPrompt(
  context: AIContextEnvelope,
  contextStats: AIContextStats,
  memories: Array<Record<string, unknown>>,
  sources: Array<Record<string, unknown>>,
  agentInstructions: string,
  domainParts: Array<Record<string, unknown>>,
  tools: Array<Record<string, unknown>>,
  permissions: { role: string },
  strategy: ReturnType<typeof getAIContextStrategy>,
) {
  const contextText = JSON.stringify({
    route: context.route,
    resourceType: context.resourceType,
    resourceId: context.resourceId,
    selectedRecords: context.selectedRecords,
    attachments: context.attachments.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
    })),
    conversationHistory: context.conversationHistory,
    metadata: context.metadata,
    permissions,
  });
  return `${agentInstructions ? `Agent instructions:\n${agentInstructions}\n\n` : ''}Context recipe:\n${strategy.label} — ${strategy.description}\nContext collected: ${JSON.stringify(contextStats)}\n\n` +
    `Workspace context:\n${truncate(contextText, 25_000)}\n\n` +
    `Recent conversation (short-term context, not durable memory):\n${truncate(JSON.stringify(context.conversationHistory), strategy.historyChars)}\n\n` +
    `Relevant memories:\n${truncate(JSON.stringify(memories), strategy.memoryChars)}\n\n` +
    `Source documents:\n${truncate(JSON.stringify(sources), strategy.sourceChars)}\n\n` +
    `Available domain context:\n${truncate(JSON.stringify(domainParts), strategy.domainChars)}\n\n` +
    `Available tools:\n${truncate(JSON.stringify(tools), strategy.toolChars)}\n\n` +
    `User request:\n${context.userPrompt}\n\n` +
    `Use only the supplied or retrieved context. State when evidence is missing or conflicting. Set actionability to insufficient_evidence and return no actions or memory mutations when the source lacks valuable, reliable information. Return structured actions only for relevant Replofy resource types when the evidence supports them. Domain record changes must require approval. Memory mutations may be autonomous only when they are concrete and supported by the supplied context.`;
}

function persistedContext(context: AIContextEnvelope) {
  return {
    ...context,
    attachments: context.attachments.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
    })),
  };
}

async function saveSourceAnalyses(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  runId: string,
  context: AIContextEnvelope,
  output: AIEngineOutput,
) {
  if (context.sourceVersionIds.length === 0) return;
  const sources = await database.select({
    id: contextSourceVersion.id,
    sourceId: contextSourceVersion.sourceId,
    contentHash: contextSourceVersion.contentHash,
  }).from(contextSourceVersion).where(and(
    eq(contextSourceVersion.workspaceId, actor.workspaceId),
    inArray(contextSourceVersion.id, context.sourceVersionIds),
  ));
  for (const source of sources) {
    const existing = await database.select({ id: aiSourceAnalysis.id }).from(aiSourceAnalysis).where(and(
      eq(aiSourceAnalysis.workspaceId, actor.workspaceId),
      eq(aiSourceAnalysis.sourceVersionId, source.id),
    )).limit(1);
    const analysis = {
      summary: output.summary,
      answer: output.answer,
      assumptions: output.assumptions,
      actions: output.actions,
      memoryMutations: output.memoryMutations,
      sourceReferences: output.sourceReferences,
    };
    if (existing[0]) {
      await database.update(aiSourceAnalysis).set({
        runId,
        contentHash: source.contentHash,
        analysis,
        updatedAt: new Date(),
      }).where(eq(aiSourceAnalysis.id, existing[0].id));
    } else {
      await database.insert(aiSourceAnalysis).values({
        workspaceId: actor.workspaceId,
        sourceId: source.sourceId,
        sourceVersionId: source.id,
        runId,
        contentHash: source.contentHash,
        analysis,
        createdByUserId: actor.userId,
      });
    }
  }
}

async function createProposalRecords(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  runId: string,
  surface: AISurface,
  context: AIContextEnvelope,
  output: AIEngineOutput,
) {
  const actions = output.actions.map((action) => ({
    ...action,
    requiresApproval: action.operation === 'remember' ? false : true,
  })).filter((action) => action.requiresApproval);
  if (actions.length === 0) return null;
  const proposal = (await database.insert(aiProposal).values({
    workspaceId: actor.workspaceId,
    runId,
    surface,
    title: truncate(context.userPrompt, 180),
    summary: output.summary || output.answer,
    assumptions: output.assumptions,
    sourceReferences: output.sourceReferences,
    createdByUserId: actor.userId,
  }).returning())[0];
  await database.insert(aiProposalAction).values(actions.map((action) => ({
    workspaceId: actor.workspaceId,
    proposalId: proposal.id,
    operation: action.operation,
    resourceType: action.resourceType,
    targetId: action.targetId || null,
    payload: action.payload,
    rationale: action.rationale,
    confidence: action.confidence,
    sourceReferences: action.sourceReferences,
    requiresApproval: true,
  })));
  return proposal.id;
}

export type AIRunResult = {
  runId: string;
  status: 'succeeded';
  output: AIEngineOutput;
  proposalId: string | null;
  memoryResults: Array<Record<string, unknown>>;
  usage: Record<string, unknown>;
  contextStats: AIContextStats;
};

export class AIEngine {
  private readonly gateway: ProviderGateway;
  private readonly projection: MemoryProjectionClient;

  constructor(
    private readonly database: PostgresDatabase,
    private readonly config: ServerConfig,
  ) {
    this.gateway = new ProviderGateway();
    this.projection = new MemoryProjectionClient(config);
  }

  async status(actor: WorkspaceActor) {
    const activation = await getAIActivation(this.database, actor);
    const projectionHealthy = this.projection.enabled ? await this.projection.health() : false;
    const status = activation.status === 'active' && this.projection.enabled && !projectionHealthy
      ? 'degraded_memory' as const
      : activation.status;
    return {
      ...activation,
      status,
      memoryProjection: this.projection.enabled ? projectionHealthy ? 'healthy' : 'degraded' : 'database_fallback',
      active: status === 'active' || status === 'degraded_memory',
    };
  }

  async run(
    actor: WorkspaceActor,
    surface: AISurface,
    rawContext: unknown,
    agentProfileId?: string,
  ): Promise<AIRunResult> {
    const context = parseContext(rawContext);
    const strategy = getAIContextStrategy(context);
    const model = await resolveModel(this.database, this.config, actor, agentProfileId);
    const memories = await retrieveAIMemories(this.database, actor, `${context.userPrompt} ${context.resourceType || ''}`, strategy.memoryLimit);
    let sourceContext = await loadSourceContext(this.database, actor, context);
    let projectedSourceCount = 0;
    let projection: AIContextStats['projection'] = this.projection.enabled ? 'enabled' : 'database-fallback';
    if (this.projection.enabled) {
      try {
        const projected = await this.projection.search(actor.workspaceId, context.userPrompt, strategy.projectionLimit);
        const knownSourceKeys = new Set(sourceContext.map((source) => String(source.sourceVersionId || source.sourceId || '')));
        const projectedSources = projected.data.map((record) => ({
          sourceId: String(record.metadata.sourceId || ''),
          sourceVersionId: String(record.metadata.sourceVersionId || ''),
          fileName: String(record.metadata.title || record.id),
          content: record.content,
          payload: record.metadata,
        })).filter((source) => {
          const key = source.sourceVersionId || source.sourceId;
          if (!key || knownSourceKeys.has(key)) return false;
          knownSourceKeys.add(key);
          return true;
        });
        projectedSourceCount = projectedSources.length;
        sourceContext = [...sourceContext, ...projectedSources];
      } catch {
        // PostgreSQL remains the canonical fallback when the projection is down.
        projection = 'degraded';
      }
    }
    const domainParts = [
      ...(await buildDomainContext(context)),
      ...(await loadCurrentRecordContext(this.database, actor, context)),
    ];
    const tools = getAITools({
      workspaceId: actor.workspaceId,
      actorId: actor.userId,
      surface,
      allowMemoryWrites: true,
    });
    const contextStats: AIContextStats = {
      mode: strategy.mode,
      memoryCount: memories.length,
      sourceCount: sourceContext.length,
      projectedSourceCount,
      selectedRecordCount: context.selectedRecords.length,
      conversationMessageCount: context.conversationHistory.length,
      domainPartCount: domainParts.length,
      projection,
    };
    const contextReferences = [...sourceRefsForContext(context), ...sourceRefsForSources(sourceContext)];
    const prompt = buildPrompt(context, contextStats, memories, sourceContext, model.agentInstructions, domainParts, tools, { role: actor.role }, strategy);
    const run = (await this.database.insert(aiRun).values({
      workspaceId: actor.workspaceId,
      surface,
      status: 'running',
      provider: model.provider,
      model: model.model,
      agentProfileId: model.agentProfileId,
      input: { context: { ...persistedContext(context), userPrompt: truncate(context.userPrompt, 20_000) }, contextStats },
      sourceReferences: contextReferences,
      contextDigest: digest({ context, memories, sourceContext }),
      startedAt: new Date(),
      createdByUserId: actor.userId,
    }).returning())[0];

    try {
      let usedProvider = model.provider;
      let completion: Awaited<ReturnType<ProviderGateway['complete']>> | null = null;
      let lastProviderError: unknown = null;
      const candidates = [
        { provider: model.provider, model: model.model, apiKey: model.apiKey },
        ...(model.fallbackEnabled ? model.fallbackCandidates : []),
      ];
      for (const candidate of candidates) {
        try {
          completion = await this.gateway.complete({
            provider: candidate.provider,
            model: candidate.model,
            apiKey: candidate.apiKey,
            system: SYSTEM_INSTRUCTION,
            user: prompt,
            attachments: context.attachments,
          });
          usedProvider = candidate.provider;
          break;
        } catch (error) {
          lastProviderError = error;
          if (!(error instanceof AIProviderGatewayError) || !model.fallbackEnabled) throw error;
        }
      }
      if (!completion) throw lastProviderError instanceof Error ? lastProviderError : new AIEngineError('All configured AI providers failed.', 502);
      const normalizedActions = completion.output.actions
        .map(normalizeAIAction)
        .filter((action) => model.allowedResourceTypes.length === 0
          || action.operation === 'remember'
          || model.allowedResourceTypes.includes(action.resourceType));
      const normalizedOutput = enforceAIActionability({
        ...completion.output,
        sourceReferences: [...contextReferences, ...completion.output.sourceReferences],
        actions: normalizedActions.map((action) => ({
          ...action,
          sourceReferences: [...contextReferences, ...action.sourceReferences],
        })),
        memoryMutations: completion.output.memoryMutations.map((mutation) => ({
          ...mutation,
          sourceReferences: [...contextReferences, ...mutation.sourceReferences],
        })),
      });
      const memoryResults = normalizedOutput.memoryMutations.length > 0
        ? await applyAutonomousMemoryMutations(this.database, actor, run.id, normalizedOutput.memoryMutations)
        : [];
      const proposalId = await createProposalRecords(this.database, actor, run.id, surface, context, normalizedOutput);
      await saveSourceAnalyses(this.database, actor, run.id, context, normalizedOutput);
      await this.database.update(aiRun).set({
        status: 'succeeded',
        provider: usedProvider,
        output: normalizedOutput,
        sourceReferences: normalizedOutput.sourceReferences,
        usage: completion.usage,
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(aiRun.id, run.id));
      if (this.projection.enabled && sourceContext.length > 0) {
        void this.projection.upsert(actor.workspaceId, sourceContext.map((source, index) => ({
          id: String(source.sourceVersionId || source.sourceId || `source-${index}`),
          type: 'context-source',
          content: String(source.content || ''),
          metadata: {
            sourceId: source.sourceId,
            sourceVersionId: source.sourceVersionId,
            title: source.fileName,
            ...(asRecord(source.payload)),
          },
          sourceReferences: [{
            ...(source.sourceId ? { sourceId: source.sourceId } : {}),
            ...(source.sourceVersionId ? { sourceVersionId: source.sourceVersionId } : {}),
            title: source.fileName,
          }],
        }))).catch(() => undefined);
      }
      if (this.projection.enabled && memoryResults.length > 0) {
        const updatedMemories = await retrieveAIMemories(this.database, actor, context.userPrompt, 50);
        void this.projection.upsert(actor.workspaceId, updatedMemories.map((memory) => ({
          id: String(memory.id),
          type: `memory:${String(memory.memoryType)}`,
          content: String(memory.content),
          metadata: memory.sourceMetadata as Record<string, unknown>,
          sourceReferences: ((memory.sourceMetadata as Record<string, unknown>)?.sourceReferences || []) as SourceReference[],
        }))).catch(() => undefined);
        for (const result of memoryResults) {
          const operation = String(result.operation || '');
          const recordIds = operation === 'archive' || operation === 'expire'
            ? [String(result.memoryId || '')]
            : operation === 'merge' && Array.isArray(result.mergedMemoryIds)
              ? result.mergedMemoryIds.map(String)
              : [];
          for (const recordId of recordIds.filter(Boolean)) {
            void this.projection.removeRecord(actor.workspaceId, recordId).catch(() => undefined);
          }
        }
      }
      return {
        runId: run.id,
        status: 'succeeded',
        output: normalizedOutput,
        proposalId,
        memoryResults,
        usage: completion.usage,
        contextStats,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI run failed.';
      await this.database.update(aiRun).set({
        status: 'failed',
        error: truncate(message, 2_000),
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(aiRun.id, run.id));
      if (error instanceof AIProviderGatewayError) throw error;
      throw new AIEngineError(message, 502);
    }
  }

  async getRun(actor: WorkspaceActor, runId: string) {
    const row = (await this.database.select().from(aiRun).where(and(
      eq(aiRun.workspaceId, actor.workspaceId),
      eq(aiRun.id, runId),
    )).limit(1))[0];
    if (!row) throw new AIEngineError('AI run not found.', 404);
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
    };
  }

  async listRuns(actor: WorkspaceActor, limit = 50) {
    const rows = await this.database.select().from(aiRun).where(eq(aiRun.workspaceId, actor.workspaceId)).orderBy(desc(aiRun.createdAt)).limit(Math.min(Math.max(limit, 1), 100));
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
    }));
  }
}
