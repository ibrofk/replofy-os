import type { Request, Response, NextFunction, Express } from 'express';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ServerConfig } from '../config.js';
import type { WorkspaceRepository as PostgresDatabase } from '../platform/workspace-repository.js';
import type { WorkspaceActor } from '../execution/tasks.js';
import type { StandaloneApiKeyScope } from '../api-keys.js';
import { aiChatMessage, aiChatSession } from '../db/schema.js';
import { AIEngine, AIEngineError } from './engine.js';
import {
  AISettingsError,
  createAIAgentProfile,
  deleteAIProviderCredential,
  getAIActivation,
  getAISettings,
  getProviderCredential,
  listAIAgentProfiles,
  markProviderTest,
  updateAIAgentProfile,
  updateAISettings,
  upsertAIProviderCredential,
} from './settings.js';
import { AIMemoryError, listAIMemories, listMemoryRevisions, undoMemoryRevision } from './memory.js';
import {
  AIProposalError,
  applyAIProposal,
  applyAIProposalAction,
  approveAIProposalAction,
  editAIProposalAction,
  getAIProposal,
  listAIProposals,
  rejectAIProposalAction,
} from './proposals.js';
import { AIProviderGatewayError, ProviderGateway } from './provider-gateway.js';
import { MemoryProjectionClient } from './memory-projection.js';
import { enqueueAIJob } from './jobs.js';
import { aiProviderIds, aiContextEnvelopeSchema, type AIProviderId, type SourceReference } from './types.js';

type GetActor = (request: Request, scope: StandaloneApiKeyScope) => Promise<WorkspaceActor>;

export type AIRouteDependencies = {
  database: PostgresDatabase;
  config: ServerConfig;
  getActor: GetActor;
};

function asyncRoute(handler: (request: Request, response: Response, next: NextFunction) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction) => {
    void handler(request, response, next).catch(next);
  };
}

export function registerAIRoutes(app: Express, dependencies: AIRouteDependencies) {
  const { database, config, getActor } = dependencies;
  const engine = new AIEngine(database, config);
  const gateway = new ProviderGateway();
  const projection = new MemoryProjectionClient(config);

  app.get('/api/v1/ai/status', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:read');
    response.status(200).json(await engine.status(actor));
  }));

  app.get('/api/v1/ai/settings', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:read');
    response.status(200).json(await getAISettings(database, actor));
  }));

  app.get('/api/v1/ai/providers', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:read');
    const settings = await getAISettings(database, actor);
    response.status(200).json({ data: aiProviderIds.map((provider) => ({
      provider,
      configured: settings.credentials.some((credential) => credential.provider === provider),
      credential: settings.credentials.find((credential) => credential.provider === provider) || null,
    })) });
  }));

  app.put('/api/v1/ai/settings', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:admin');
    await updateAISettings(database, actor, request.body);
    response.status(200).json(await getAISettings(database, actor));
  }));

  app.put('/api/v1/ai/providers/:provider', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:admin');
    const provider = z.enum(aiProviderIds).parse(request.params.provider);
    const result = await upsertAIProviderCredential(database, config, actor, { ...request.body, provider });
    response.status(200).json(result);
  }));

  app.get('/api/v1/ai/providers/:provider/models', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:admin');
    const provider = z.enum(aiProviderIds).parse(request.params.provider) as AIProviderId;
    const credential = await getProviderCredential(database, config, actor, provider);
    const models = await gateway.listModels(provider, credential.apiKey);
    response.status(200).json({ data: models, provider, fetchedAt: new Date().toISOString() });
  }));

  app.delete('/api/v1/ai/providers/:provider', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:admin');
    const provider = z.enum(aiProviderIds).parse(request.params.provider);
    response.status(200).json(await deleteAIProviderCredential(database, actor, provider));
  }));

  app.post('/api/v1/ai/providers/:provider/test', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:admin');
    const provider = z.enum(aiProviderIds).parse(request.params.provider) as AIProviderId;
    const model = z.object({ model: z.string().trim().min(1).max(200) }).parse(request.body).model;
    const activation = await getAIActivation(database, actor);
    if (activation.status !== 'active' || activation.provider !== provider || activation.model !== model) {
      throw new AISettingsError('Save this workspace provider and selected model before testing it.', 409);
    }
    const credential = await getProviderCredential(database, config, actor, provider);
    try {
      await gateway.test(provider, model, credential.apiKey);
      await markProviderTest(database, credential.row.id, null);
      response.status(200).json({ ok: true, provider, model });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Provider test failed.';
      await markProviderTest(database, credential.row.id, message.slice(0, 2_000));
      throw error;
    }
  }));

  app.get('/api/v1/ai/agents', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:read');
    response.status(200).json({ data: await listAIAgentProfiles(database, actor) });
  }));

  app.post('/api/v1/ai/agents', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:admin');
    response.status(201).json(await createAIAgentProfile(database, actor, request.body));
  }));

  app.patch('/api/v1/ai/agents/:agentId', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:admin');
    response.status(200).json(await updateAIAgentProfile(database, actor, request.params.agentId, request.body));
  }));

  app.get('/api/v1/ai/runs', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:read');
    const result = await engine.listRuns(actor, Number(request.query.limit || 50));
    response.status(200).json({ data: result });
  }));

  app.get('/api/v1/ai/runs/:runId', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:read');
    response.status(200).json(await engine.getRun(actor, request.params.runId));
  }));

  app.post('/api/v1/ai/jobs', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:admin');
    const input = z.object({
      type: z.enum(['analyze_source', 'generate_proposal', 'apply_memory_mutations', 'index_memory', 'index_context', 'reindex_workspace', 'delete_source_projection', 'learn_patterns']),
      payload: z.record(z.string(), z.unknown()).default({}),
      runId: z.string().uuid().optional(),
      idempotencyKey: z.string().trim().max(200).optional(),
    }).parse(request.body);
    const job = await enqueueAIJob(database, actor, input.type, input.payload, {
      runId: input.runId,
      idempotencyKey: input.idempotencyKey,
    });
    response.status(202).json(job);
  }));

  app.post('/api/v1/ai/runs', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:write');
    const body = z.object({
      surface: z.enum(['chat', 'analyze', 'inline', 'operator', 'system']).default('inline'),
      agentProfileId: z.string().uuid().optional(),
      context: aiContextEnvelopeSchema,
    }).parse(request.body);
    response.status(200).json(await engine.run(actor, body.surface, body.context, body.agentProfileId));
  }));

  app.post('/api/v1/ai/chat/sessions', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:write');
    const input = z.object({ title: z.string().trim().max(200).optional(), context: z.record(z.string(), z.unknown()).default({}) }).parse(request.body || {});
    const row = (await database.insert(aiChatSession).values({
      workspaceId: actor.workspaceId,
      title: input.title || 'New AI conversation',
      context: input.context,
      createdByUserId: actor.userId,
    }).returning())[0];
    response.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  }));

  app.get('/api/v1/ai/chat/sessions', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:read');
    const rows = await database.select().from(aiChatSession).where(eq(aiChatSession.workspaceId, actor.workspaceId)).orderBy(asc(aiChatSession.updatedAt));
    response.status(200).json({ data: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })) });
  }));

  app.get('/api/v1/ai/chat/sessions/:sessionId/messages', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:read');
    const rows = await database.select().from(aiChatMessage).where(and(
      eq(aiChatMessage.workspaceId, actor.workspaceId),
      eq(aiChatMessage.sessionId, request.params.sessionId),
    )).orderBy(asc(aiChatMessage.createdAt));
    response.status(200).json({ data: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })) });
  }));

  app.post('/api/v1/ai/chat/sessions/:sessionId/messages', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:write');
    const session = (await database.select().from(aiChatSession).where(and(
      eq(aiChatSession.workspaceId, actor.workspaceId),
      eq(aiChatSession.id, request.params.sessionId),
    )).limit(1))[0];
    if (!session) throw new AIEngineError('AI chat session not found.', 404);
    const body = z.object({
      content: z.string().trim().min(1).max(20_000),
      context: aiContextEnvelopeSchema.partial().default({}),
      agentProfileId: z.string().uuid().optional(),
    }).parse(request.body);
    const userMessage = (await database.insert(aiChatMessage).values({
      workspaceId: actor.workspaceId,
      sessionId: session.id,
      role: 'user',
      content: body.content,
      createdByUserId: actor.userId,
    }).returning())[0];
    const context = {
      ...session.context,
      ...body.context,
      conversationHistory: (await database.select({ role: aiChatMessage.role, content: aiChatMessage.content })
        .from(aiChatMessage)
        .where(and(
          eq(aiChatMessage.workspaceId, actor.workspaceId),
          eq(aiChatMessage.sessionId, session.id),
        ))
        .orderBy(desc(aiChatMessage.createdAt))
        .limit(13)).reverse().slice(0, 12),
      userPrompt: body.content,
    };
    const result = await engine.run(actor, 'chat', context, body.agentProfileId);
    const assistantMessage = (await database.insert(aiChatMessage).values({
      workspaceId: actor.workspaceId,
      sessionId: session.id,
      role: 'assistant',
      content: result.output.answer,
      structuredPayload: result.output as unknown as Record<string, unknown>,
      sourceReferences: result.output.sourceReferences,
      aiRunId: result.runId,
      createdByUserId: actor.userId,
    }).returning())[0];
    await database.update(aiChatSession).set({ updatedAt: new Date() }).where(eq(aiChatSession.id, session.id));
    response.status(200).json({
      userMessage: { ...userMessage, createdAt: userMessage.createdAt.toISOString(), updatedAt: userMessage.updatedAt.toISOString() },
      assistantMessage: { ...assistantMessage, createdAt: assistantMessage.createdAt.toISOString(), updatedAt: assistantMessage.updatedAt.toISOString() },
      run: result,
    });
  }));

  app.post('/api/v1/ai/analyze', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:write');
    const body = z.object({
      context: aiContextEnvelopeSchema,
      agentProfileId: z.string().uuid().optional(),
    }).parse(request.body);
    response.status(200).json(await engine.run(actor, 'analyze', body.context, body.agentProfileId));
  }));

  app.get('/api/v1/ai/proposals', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:read');
    response.status(200).json({ data: await listAIProposals(database, actor, Number(request.query.limit || 50)) });
  }));

  app.get('/api/v1/ai/proposals/:proposalId', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:read');
    response.status(200).json(await getAIProposal(database, actor, request.params.proposalId));
  }));

  app.post('/api/v1/ai/proposals/:proposalId/actions/:actionId/approve', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:approve');
    response.status(200).json(await approveAIProposalAction(database, actor, request.params.proposalId, request.params.actionId));
  }));

  app.post('/api/v1/ai/proposals/:proposalId/actions/:actionId/reject', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:approve');
    response.status(200).json(await rejectAIProposalAction(database, actor, request.params.proposalId, request.params.actionId));
  }));

  app.patch('/api/v1/ai/proposals/:proposalId/actions/:actionId', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:approve');
    response.status(200).json(await editAIProposalAction(database, actor, request.params.proposalId, request.params.actionId, request.body));
  }));

  app.post('/api/v1/ai/proposals/:proposalId/actions/:actionId/apply', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:approve');
    response.status(200).json(await applyAIProposalAction(database, actor, request.params.proposalId, request.params.actionId));
  }));

  app.post('/api/v1/ai/proposals/:proposalId/apply', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:approve');
    response.status(200).json(await applyAIProposal(database, actor, request.params.proposalId));
  }));

  app.get('/api/v1/ai/memory', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:read');
    response.status(200).json({ data: await listAIMemories(database, actor, {
      query: typeof request.query.query === 'string' ? request.query.query : undefined,
      includeArchived: request.query.includeArchived === 'true',
      limit: Number(request.query.limit || 100),
    }) });
  }));

  app.get('/api/v1/ai/memory/:memoryId/history', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:read');
    response.status(200).json({ data: await listMemoryRevisions(database, actor, request.params.memoryId) });
  }));

  const undoMemory = asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:write');
    const revisionId = typeof request.params.revisionId === 'string'
      ? request.params.revisionId
      : z.object({ revisionId: z.string().uuid() }).parse(request.body).revisionId;
    response.status(200).json(await undoMemoryRevision(database, actor, revisionId, request.params.memoryId));
  });
  app.post('/api/v1/ai/memory/:memoryId/undo', undoMemory);
  app.post('/api/v1/ai/memory/:memoryId/undo/:revisionId', undoMemory);

  app.post('/api/v1/ai/memory/reindex', asyncRoute(async (request, response) => {
    const actor = await getActor(request, 'ai:admin');
    if (!projection.enabled) {
      response.status(200).json({ ok: true, status: 'database_fallback' });
      return;
    }
    const memories = await listAIMemories(database, actor, { limit: 200 });
    response.status(200).json(await projection.reindex(actor.workspaceId, memories.map((memory) => ({
      id: String(memory.id),
      type: `memory:${String(memory.memoryType)}`,
      content: String(memory.content),
      metadata: {
        ...(memory.sourceMetadata as Record<string, unknown> || {}),
        state: memory.state,
        pinned: memory.pinned,
      },
      sourceReferences: ((memory.sourceMetadata as Record<string, unknown> || {}).sourceReferences || []) as SourceReference[],
    }))));
  }));
}

export const aiRouteErrors = [AIEngineError, AIProviderGatewayError, AISettingsError, AIMemoryError, AIProposalError];
