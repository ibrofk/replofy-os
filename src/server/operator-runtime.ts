import { and, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkspaceRepository as PostgresDatabase } from './platform/workspace-repository.js';
import {
  blogArticle,
  operatorApproval,
  operatorCheckin,
  operatorContextPack,
  operatorDesk,
  operatorInjection,
  operatorMemory,
  operatorOutput,
  operatorWorkOrder,
  task,
  teamChatChannel,
  teamChatChannelParticipant,
  teamChatMessage,
  teamChatParticipant,
} from './db/schema.js';
import type { WorkspaceActor } from './execution/tasks.js';
import { pickProvided } from './validation.js';
import { operatorActionRequiresApproval } from '../utils/operatorApprovalPolicy.js';

const memoryScopes = ['global', 'operator', 'hub', 'goal', 'artifact', 'work_order', 'checkin'] as const;
const memoryTypes = ['fact', 'preference', 'decision', 'style', 'constraint', 'lesson', 'avoid', 'source_note', 'workflow_rule'] as const;
const memoryStates = ['suggested', 'active', 'pinned', 'rejected', 'expired', 'archived'] as const;
const confidences = ['low', 'medium', 'high'] as const;
const checkinTypes = [
  'manifest_requested', 'work_order_claimed', 'work_started', 'output_submitted',
  'needs_more_context', 'work_skipped', 'work_failed', 'work_completed',
] as const;
const outputTypes = [
  'launch_summary', 'focus_recommendation', 'blog_idea', 'blog_article', 'social_post',
  'creative_brief', 'creative_item', 'campaign_idea', 'bug_report', 'bug_triage',
  'feature_spec', 'roadmap_item', 'execution_task', 'implementation_brief', 'research_brief',
  'seo_keyword', 'content_refresh', 'growth_task', 'feedback_signal', 'memory_suggestion',
  'weekly_summary', 'team_chat_update', 'time_block', 'risk_note', 'prompt',
] as const;
const destinations = [
  'tasks', 'bugs', 'roadmap-items', 'blog-articles', 'business-plans', 'visions',
  'prompts', 'social-posts', 'creative-items', 'seo-keywords', 'feedbacks',
  'time-blocks', 'team-chat-messages', 'context-sources', 'operator-memories',
  'approval-inbox',
] as const;
const supportedWriteBackDestinations = new Set<string>([
  'tasks',
  'blog-articles',
  'team-chat-messages',
  'operator-memories',
]);
const outputRouting: Partial<Record<typeof outputTypes[number], typeof destinations[number][]>> = {
  execution_task: ['tasks'],
  blog_idea: ['blog-articles'],
  blog_article: ['blog-articles'],
  team_chat_update: ['team-chat-messages'],
  memory_suggestion: ['operator-memories'],
  risk_note: ['approval-inbox'],
};
const nullableUuid = z.string().uuid().nullable();
const nullableDate = z.string().datetime().nullable();
const objectSchema = z.record(z.string(), z.unknown());

const memoryCreateSchema = z.object({
  scope: z.enum(memoryScopes).default('operator'),
  scopeId: z.string().max(200).nullable().optional(),
  memoryType: z.enum(memoryTypes).default('lesson'),
  state: z.enum(memoryStates).default('active'),
  content: z.string().trim().min(1).max(8_000),
  confidence: z.enum(confidences).default('medium'),
  sourceCheckInId: nullableUuid.optional(),
  sourceOutputId: nullableUuid.optional(),
  expiresAt: nullableDate.optional(),
  pinned: z.boolean().optional(),
  source: z.string().trim().min(1).max(80).default('api'),
  sourceMetadata: objectSchema.default({}),
});
const memoryUpdateSchema = memoryCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field is required.',
);
const checkinCreateSchema = z.object({
  operatorDeskId: z.string().uuid(),
  workOrderId: nullableUuid.optional(),
  externalAgentName: z.string().trim().min(1).max(200),
  externalAgentProvider: z.string().trim().min(1).max(200).nullable().optional(),
  type: z.enum(checkinTypes).default('manifest_requested'),
  summary: z.string().trim().min(1).max(4_000),
  payload: objectSchema.default({}),
});
const outputCreateSchema = z.object({
  operatorDeskId: z.string().uuid(),
  workOrderId: nullableUuid.optional(),
  externalAgentName: z.string().trim().min(1).max(200),
  outputType: z.enum(outputTypes).default('execution_task'),
  title: z.string().trim().min(1).max(240),
  summary: z.string().trim().min(1).max(4_000),
  content: z.string().min(1).max(50_000),
  structuredPayload: objectSchema.default({}),
  suggestedDestinations: z.array(z.enum(destinations)).max(20).optional(),
  sourceReferences: z.array(objectSchema).max(200).default([]),
  memorySuggestions: z.array(z.union([z.string().max(8_000), objectSchema])).max(200).default([]),
  confidence: z.enum(confidences).default('medium'),
});
const contextPackCreateSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().min(1).max(4_000),
  scope: z.string().trim().min(1).max(80).default('global'),
  scopeId: z.string().max(200).nullable().optional(),
  sourceIds: z.array(z.string().max(200)).max(500).default([]),
  sourceSnapshots: z.array(objectSchema).max(500).default([]),
  instructions: z.string().max(8_000).default(''),
  constraints: z.array(z.string().max(2_000)).max(200).default([]),
  expectedUse: z.string().max(2_000).default(''),
});

export class OperatorRuntimeError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'OperatorRuntimeError';
  }
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new OperatorRuntimeError(parsed.error.issues[0]?.message || 'Invalid operator runtime request.', 400);
  }
  return parsed.data;
}

function date(value: string | null | undefined) {
  return value ? new Date(value) : null;
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 220) || 'operator-output';
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
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

function serializeCheckin(row: typeof operatorCheckin.$inferSelect) {
  return {
    id: row.id,
    operatorDeskId: row.operatorDeskId,
    workOrderId: row.workOrderId,
    externalAgentName: row.externalAgentName,
    externalAgentProvider: row.externalAgentProvider,
    type: row.type,
    summary: row.summary,
    payload: row.payload,
    createdAt: row.createdAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

function serializeOutput(row: typeof operatorOutput.$inferSelect) {
  return {
    id: row.id,
    operatorDeskId: row.operatorDeskId,
    workOrderId: row.workOrderId,
    externalAgentName: row.externalAgentName,
    outputType: row.outputType,
    title: row.title,
    summary: row.summary,
    content: row.content,
    structuredPayload: row.structuredPayload,
    suggestedDestinations: row.suggestedDestinations,
    sourceReferences: row.sourceReferences,
    memorySuggestions: row.memorySuggestions,
    confidence: row.confidence,
    status: row.status,
    routingWarning: row.routingWarning,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

function serializeInjection(row: typeof operatorInjection.$inferSelect) {
  return {
    id: row.id,
    outputId: row.outputId,
    targetHub: row.targetHub,
    targetRecordId: row.targetRecordId,
    action: row.action,
    riskLevel: row.riskLevel,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

function serializeApproval(row: typeof operatorApproval.$inferSelect) {
  return {
    id: row.id,
    operatorDeskId: row.operatorDeskId,
    workOrderId: row.workOrderId,
    outputId: row.outputId,
    injectionId: row.injectionId,
    title: row.title,
    summary: row.summary,
    targetHub: row.targetHub,
    action: row.action,
    riskLevel: row.riskLevel,
    status: row.status,
    writeBackStatus: row.writeBackStatus,
    writeBackCompletedAt: row.writeBackCompletedAt?.toISOString() ?? null,
    targetRecordId: row.targetRecordId,
    reviewedBy: row.reviewedByUserId,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

function serializeContextPack(row: typeof operatorContextPack.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    scope: row.scope,
    scopeId: row.scopeId,
    sourceIds: row.sourceIds,
    sourceSnapshots: row.sourceSnapshots,
    instructions: row.instructions,
    constraints: row.constraints,
    expectedUse: row.expectedUse,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

async function assertMemoryScope(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  scope: typeof memoryScopes[number],
  scopeId: string | null,
) {
  if (scope === 'global' || scope === 'hub' || scope === 'goal' || scope === 'artifact') return;
  if (!scopeId) throw new OperatorRuntimeError(`scopeId is required for ${scope} memory.`, 422);
  let exists = false;
  if (scope === 'operator') {
    exists = (await database.select({ id: operatorDesk.id }).from(operatorDesk).where(and(
      eq(operatorDesk.workspaceId, actor.workspaceId),
      eq(operatorDesk.id, parse(z.string().uuid(), scopeId)),
    )).limit(1)).length > 0;
  } else if (scope === 'work_order') {
    exists = (await database.select({ id: operatorWorkOrder.id }).from(operatorWorkOrder).where(and(
      eq(operatorWorkOrder.workspaceId, actor.workspaceId),
      eq(operatorWorkOrder.id, parse(z.string().uuid(), scopeId)),
    )).limit(1)).length > 0;
  } else if (scope === 'checkin') {
    exists = (await database.select({ id: operatorCheckin.id }).from(operatorCheckin).where(and(
      eq(operatorCheckin.workspaceId, actor.workspaceId),
      eq(operatorCheckin.id, parse(z.string().uuid(), scopeId)),
    )).limit(1)).length > 0;
  }
  if (!exists) throw new OperatorRuntimeError('Memory scope is unavailable in this workspace.', 422);
}

async function assertMemoryDuplicateFree(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  scope: typeof memoryScopes[number],
  scopeId: string | null,
  content: string,
  excludeId?: string,
) {
  const normalized = content.trim().toLowerCase();
  const rows = await database
    .select({ id: operatorMemory.id, content: operatorMemory.content })
    .from(operatorMemory)
    .where(and(
      eq(operatorMemory.workspaceId, actor.workspaceId),
      eq(operatorMemory.scope, scope),
      scopeId ? eq(operatorMemory.scopeId, scopeId) : isNull(operatorMemory.scopeId),
      excludeId ? ne(operatorMemory.id, excludeId) : undefined,
      inArray(operatorMemory.state, ['suggested', 'active', 'pinned']),
    ));
  if (rows.some((row) => row.content.trim().toLowerCase() === normalized)) {
    throw new OperatorRuntimeError('A matching active memory already exists in this scope.', 409);
  }
}

async function assertMemorySources(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  sourceCheckinId: string | null | undefined,
  sourceOutputId: string | null | undefined,
) {
  if (sourceCheckinId) {
    const rows = await database.select({ id: operatorCheckin.id }).from(operatorCheckin).where(and(
      eq(operatorCheckin.id, sourceCheckinId),
      eq(operatorCheckin.workspaceId, actor.workspaceId),
    )).limit(1);
    if (!rows[0]) throw new OperatorRuntimeError('sourceCheckInId is unavailable in this workspace.', 422);
  }
  if (sourceOutputId) {
    const rows = await database.select({ id: operatorOutput.id }).from(operatorOutput).where(and(
      eq(operatorOutput.id, sourceOutputId),
      eq(operatorOutput.workspaceId, actor.workspaceId),
    )).limit(1);
    if (!rows[0]) throw new OperatorRuntimeError('sourceOutputId is unavailable in this workspace.', 422);
  }
}

export async function listOperatorMemories(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  query: Record<string, unknown>,
) {
  const scope = z.enum(memoryScopes).optional().safeParse(query.scope);
  const stateValues = Array.isArray(query.state) ? query.state : query.state ? [query.state] : [];
  const states = z.array(z.enum(memoryStates)).safeParse(stateValues);
  if (!scope.success || !states.success) throw new OperatorRuntimeError('Memory filters are invalid.', 400);
  const now = new Date();
  const rows = await database
    .select()
    .from(operatorMemory)
    .where(and(
      eq(operatorMemory.workspaceId, actor.workspaceId),
      scope.data ? eq(operatorMemory.scope, scope.data) : undefined,
      typeof query.scopeId === 'string' ? eq(operatorMemory.scopeId, query.scopeId) : undefined,
      states.data.length ? inArray(operatorMemory.state, states.data) : undefined,
      states.data.length
        ? undefined
        : or(isNull(operatorMemory.expiresAt), sql`${operatorMemory.expiresAt} > ${now}`),
    ))
    .orderBy(desc(operatorMemory.pinned), desc(operatorMemory.updatedAt))
    .limit(200);
  return rows.map(serializeMemory);
}

export async function getOperatorMemory(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  memoryId: string,
) {
  const id = parse(z.string().uuid(), memoryId);
  const rows = await database.select().from(operatorMemory).where(and(
    eq(operatorMemory.id, id),
    eq(operatorMemory.workspaceId, actor.workspaceId),
  )).limit(1);
  if (!rows[0]) throw new OperatorRuntimeError('Memory not found.', 404);
  return serializeMemory(rows[0]);
}

export async function createOperatorMemory(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  input: unknown,
) {
  const data = parse(memoryCreateSchema, input);
  const scopeId = data.scopeId ?? null;
  await assertMemoryScope(database, actor, data.scope, scopeId);
  await assertMemoryDuplicateFree(database, actor, data.scope, scopeId, data.content);
  await assertMemorySources(database, actor, data.sourceCheckInId, data.sourceOutputId);
  const rows = await database
    .insert(operatorMemory)
    .values({
      workspaceId: actor.workspaceId,
      createdByUserId: actor.userId,
      scope: data.scope,
      scopeId,
      memoryType: data.memoryType,
      state: data.state,
      content: data.content,
      confidence: data.confidence,
      sourceCheckinId: data.sourceCheckInId ?? null,
      sourceOutputId: data.sourceOutputId ?? null,
      pinned: data.pinned ?? data.state === 'pinned',
      expiresAt: date(data.expiresAt),
      source: data.source,
      sourceMetadata: data.sourceMetadata,
    })
    .returning();
  return serializeMemory(rows[0]);
}

export async function updateOperatorMemory(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  memoryId: string,
  input: unknown,
) {
  const id = parse(z.string().uuid(), memoryId);
  const data = parse(memoryUpdateSchema, input);
  const patch = pickProvided(input, data);
  const current = await database.select().from(operatorMemory).where(and(
    eq(operatorMemory.id, id),
    eq(operatorMemory.workspaceId, actor.workspaceId),
  )).limit(1);
  if (!current[0]) throw new OperatorRuntimeError('Memory not found.', 404);
  const scope = patch.scope ?? current[0].scope;
  const scopeId = patch.scopeId !== undefined ? patch.scopeId : current[0].scopeId;
  const content = patch.content ?? current[0].content;
  await assertMemoryScope(database, actor, scope, scopeId);
  await assertMemoryDuplicateFree(database, actor, scope, scopeId, content, id);
  await assertMemorySources(
    database,
    actor,
    patch.sourceCheckInId !== undefined ? patch.sourceCheckInId : current[0].sourceCheckinId,
    patch.sourceOutputId !== undefined ? patch.sourceOutputId : current[0].sourceOutputId,
  );
  const rows = await database
    .update(operatorMemory)
    .set({
      ...(patch.scope !== undefined && { scope: patch.scope }),
      ...(patch.scopeId !== undefined && { scopeId: patch.scopeId }),
      ...(patch.memoryType !== undefined && { memoryType: patch.memoryType }),
      ...(patch.state !== undefined && { state: patch.state }),
      ...(patch.content !== undefined && { content: patch.content }),
      ...(patch.confidence !== undefined && { confidence: patch.confidence }),
      ...(patch.sourceCheckInId !== undefined && { sourceCheckinId: patch.sourceCheckInId }),
      ...(patch.sourceOutputId !== undefined && { sourceOutputId: patch.sourceOutputId }),
      ...(patch.pinned !== undefined && { pinned: patch.pinned }),
      ...(patch.state === 'pinned' && { pinned: true }),
      ...(patch.expiresAt !== undefined && { expiresAt: date(patch.expiresAt) }),
      ...(patch.source !== undefined && { source: patch.source }),
      ...(patch.sourceMetadata !== undefined && { sourceMetadata: patch.sourceMetadata }),
      updatedAt: new Date(),
    })
    .where(and(eq(operatorMemory.id, id), eq(operatorMemory.workspaceId, actor.workspaceId)))
    .returning();
  return serializeMemory(rows[0]);
}

export async function deleteOperatorMemory(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  memoryId: string,
) {
  const id = parse(z.string().uuid(), memoryId);
  const rows = await database.delete(operatorMemory).where(and(
    eq(operatorMemory.id, id),
    eq(operatorMemory.workspaceId, actor.workspaceId),
  )).returning({ id: operatorMemory.id });
  if (!rows[0]) throw new OperatorRuntimeError('Memory not found.', 404);
  return { id: rows[0].id, deleted: true as const };
}

export async function transitionOperatorMemory(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  memoryId: string,
  action: 'approve' | 'reject' | 'archive' | 'restore',
) {
  const id = parse(z.string().uuid(), memoryId);
  const rows = await database.select().from(operatorMemory).where(and(
    eq(operatorMemory.id, id),
    eq(operatorMemory.workspaceId, actor.workspaceId),
  )).limit(1);
  const memory = rows[0];
  if (!memory) throw new OperatorRuntimeError('Memory not found.', 404);
  const nextState = action === 'approve' || action === 'restore' ? 'active'
    : action === 'reject' ? 'rejected'
      : 'archived';
  if (memory.state === nextState) return { data: serializeMemory(memory), idempotent: true };
  if (nextState === 'active' && !['suggested', 'archived', 'expired'].includes(memory.state)) {
    throw new OperatorRuntimeError(`Memory cannot be activated from ${memory.state}.`, 409);
  }
  const updated = await database.update(operatorMemory).set({
    state: nextState,
    pinned: nextState === 'active' ? false : memory.pinned,
    updatedAt: new Date(),
  }).where(eq(operatorMemory.id, id)).returning();
  return { data: serializeMemory(updated[0]), idempotent: false };
}

export async function listOperatorContextPacks(
  database: PostgresDatabase,
  actor: WorkspaceActor,
) {
  const rows = await database.select().from(operatorContextPack)
    .where(eq(operatorContextPack.workspaceId, actor.workspaceId))
    .orderBy(desc(operatorContextPack.updatedAt))
    .limit(100);
  return rows.map(serializeContextPack);
}

export async function getOperatorContextPack(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  contextPackId: string,
) {
  const id = parse(z.string().uuid(), contextPackId);
  const rows = await database.select().from(operatorContextPack).where(and(
    eq(operatorContextPack.id, id),
    eq(operatorContextPack.workspaceId, actor.workspaceId),
  )).limit(1);
  if (!rows[0]) throw new OperatorRuntimeError('Context pack not found.', 404);
  return serializeContextPack(rows[0]);
}

export async function deleteOperatorContextPack(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  contextPackId: string,
) {
  const id = parse(z.string().uuid(), contextPackId);
  const rows = await database.delete(operatorContextPack).where(and(
    eq(operatorContextPack.id, id),
    eq(operatorContextPack.workspaceId, actor.workspaceId),
  )).returning({ id: operatorContextPack.id });
  if (!rows[0]) throw new OperatorRuntimeError('Context pack not found.', 404);
  return { id: rows[0].id, deleted: true as const };
}

export async function createOperatorContextPack(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  input: unknown,
) {
  const data = parse(contextPackCreateSchema, input);
  const rows = await database.insert(operatorContextPack).values({
    workspaceId: actor.workspaceId,
    createdByUserId: actor.userId,
    ...data,
    scopeId: data.scopeId ?? null,
  }).returning();
  return (await listOperatorContextPacks(database, actor)).find((item) => item.id === rows[0].id);
}

export async function submitOperatorCheckin(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  input: unknown,
) {
  const data = parse(checkinCreateSchema, input);
  const desks = await database.select({ status: operatorDesk.status }).from(operatorDesk).where(and(
    eq(operatorDesk.workspaceId, actor.workspaceId),
    eq(operatorDesk.id, data.operatorDeskId),
  )).limit(1);
  if (!desks[0] || desks[0].status !== 'active') throw new OperatorRuntimeError('Active Operator Desk not found.', 409);
  if (data.workOrderId) {
    const orders = await database.select({ id: operatorWorkOrder.id }).from(operatorWorkOrder).where(and(
      eq(operatorWorkOrder.workspaceId, actor.workspaceId),
      eq(operatorWorkOrder.id, data.workOrderId),
      eq(operatorWorkOrder.operatorDeskId, data.operatorDeskId),
    )).limit(1);
    if (!orders[0]) throw new OperatorRuntimeError('Work order is unavailable for this Operator Desk.', 422);
  }
  const rows = await database.insert(operatorCheckin).values({
    workspaceId: actor.workspaceId,
    createdByUserId: actor.userId,
    ...data,
    workOrderId: data.workOrderId ?? null,
    externalAgentProvider: data.externalAgentProvider ?? null,
  }).returning();
  return serializeCheckin(rows[0]);
}

export async function listOperatorCheckins(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  query: Record<string, unknown> = {},
) {
  const deskId = z.string().uuid().optional().safeParse(query.operatorDeskId);
  const workOrderId = z.string().uuid().optional().safeParse(query.workOrderId);
  if (!deskId.success || !workOrderId.success) {
    throw new OperatorRuntimeError('Check-in filters are invalid.', 400);
  }
  const rows = await database.select().from(operatorCheckin).where(and(
    eq(operatorCheckin.workspaceId, actor.workspaceId),
    deskId.data ? eq(operatorCheckin.operatorDeskId, deskId.data) : undefined,
    workOrderId.data ? eq(operatorCheckin.workOrderId, workOrderId.data) : undefined,
  )).orderBy(desc(operatorCheckin.createdAt)).limit(200);
  return rows.map(serializeCheckin);
}

export async function getOperatorCheckin(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  checkinId: string,
) {
  const id = parse(z.string().uuid(), checkinId);
  const rows = await database.select().from(operatorCheckin).where(and(
    eq(operatorCheckin.id, id),
    eq(operatorCheckin.workspaceId, actor.workspaceId),
  )).limit(1);
  if (!rows[0]) throw new OperatorRuntimeError('Check-in not found.', 404);
  return serializeCheckin(rows[0]);
}

export async function deleteOperatorCheckin(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  checkinId: string,
) {
  const id = parse(z.string().uuid(), checkinId);
  const rows = await database.delete(operatorCheckin).where(and(
    eq(operatorCheckin.id, id),
    eq(operatorCheckin.workspaceId, actor.workspaceId),
  )).returning({ id: operatorCheckin.id });
  if (!rows[0]) throw new OperatorRuntimeError('Check-in not found.', 404);
  return { id: rows[0].id, deleted: true as const };
}

export async function listOperatorOutputs(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  query: Record<string, unknown>,
) {
  const deskId = z.string().uuid().optional().safeParse(query.operatorDeskId);
  const workOrderId = z.string().uuid().optional().safeParse(query.workOrderId);
  const status = z.enum(['submitted', 'pending_approval', 'approved', 'rejected', 'injected', 'archived'])
    .optional()
    .safeParse(query.status);
  if (!deskId.success || !workOrderId.success || !status.success) {
    throw new OperatorRuntimeError('Output filters are invalid.', 400);
  }
  const rows = await database.select().from(operatorOutput).where(and(
    eq(operatorOutput.workspaceId, actor.workspaceId),
    deskId.data ? eq(operatorOutput.operatorDeskId, deskId.data) : undefined,
    workOrderId.data ? eq(operatorOutput.workOrderId, workOrderId.data) : undefined,
    status.data ? eq(operatorOutput.status, status.data) : undefined,
  )).orderBy(desc(operatorOutput.createdAt)).limit(100);
  return rows.map(serializeOutput);
}

export async function getOperatorOutput(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  outputId: string,
) {
  const id = parse(z.string().uuid(), outputId);
  const rows = await database.select().from(operatorOutput).where(and(
    eq(operatorOutput.id, id),
    eq(operatorOutput.workspaceId, actor.workspaceId),
  )).limit(1);
  if (!rows[0]) throw new OperatorRuntimeError('Output not found.', 404);
  return serializeOutput(rows[0]);
}

export async function deleteOperatorOutput(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  outputId: string,
) {
  const id = parse(z.string().uuid(), outputId);
  const rows = await database.delete(operatorOutput).where(and(
    eq(operatorOutput.id, id),
    eq(operatorOutput.workspaceId, actor.workspaceId),
  )).returning({ id: operatorOutput.id });
  if (!rows[0]) throw new OperatorRuntimeError('Output not found.', 404);
  return { id: rows[0].id, deleted: true as const };
}

export async function submitOperatorOutput(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  input: unknown,
) {
  const data = parse(outputCreateSchema, input);
  const requestedDestinations = [...new Set(
    data.suggestedDestinations ?? outputRouting[data.outputType] ?? [],
  )];
  const enabledDestinations = requestedDestinations.filter((destination) => destination !== 'approval-inbox');

  return database.transaction(async (transaction) => {
    const desks = await transaction.select().from(operatorDesk).where(and(
      eq(operatorDesk.workspaceId, actor.workspaceId),
      eq(operatorDesk.id, data.operatorDeskId),
    )).limit(1).for('share');
    const desk = desks[0];
    if (!desk || desk.status !== 'active') {
      throw new OperatorRuntimeError('Active Operator Desk not found.', 409);
    }
    if (!desk.allowedOutputTypes.includes(data.outputType)) {
      throw new OperatorRuntimeError('Output type is not allowed by this Operator Desk.', 422);
    }
    if (data.workOrderId) {
      const orders = await transaction.select().from(operatorWorkOrder).where(and(
        eq(operatorWorkOrder.workspaceId, actor.workspaceId),
        eq(operatorWorkOrder.id, data.workOrderId),
        eq(operatorWorkOrder.operatorDeskId, data.operatorDeskId),
      )).limit(1).for('update');
      const order = orders[0];
      if (!order) {
        throw new OperatorRuntimeError('Work order is unavailable for this Operator Desk.', 422);
      }
      if (order.status !== 'claimed' || order.claimedBy !== data.externalAgentName) {
        throw new OperatorRuntimeError('The submitting external agent must own the active work-order claim.', 409);
      }
    }
    const outputRows = await transaction.insert(operatorOutput).values({
      workspaceId: actor.workspaceId,
      createdByUserId: actor.userId,
      ...data,
      workOrderId: data.workOrderId ?? null,
      suggestedDestinations: requestedDestinations,
      status: desk.approvalMode === 'draft_only' || enabledDestinations.length === 0
        ? 'submitted'
        : 'pending_approval',
      routingWarning: desk.approvalMode === 'draft_only'
        ? 'Desk approval mode is draft_only; output was saved without proposed writes.'
        : enabledDestinations.some((destination) => !supportedWriteBackDestinations.has(destination))
          ? 'One or more destinations are not yet writable in standalone mode.'
          : null,
    }).returning();
    const output = outputRows[0];
    await transaction.insert(operatorCheckin).values({
      workspaceId: actor.workspaceId,
      createdByUserId: actor.userId,
      operatorDeskId: data.operatorDeskId,
      workOrderId: data.workOrderId ?? null,
      externalAgentName: data.externalAgentName,
      type: 'output_submitted',
      summary: `Submitted ${data.outputType}: ${data.title}`,
      payload: { outputId: output.id },
    });
    if (data.workOrderId) {
      await transaction.update(operatorWorkOrder).set({
        status: 'submitted',
        updatedAt: new Date(),
      }).where(and(
        eq(operatorWorkOrder.id, data.workOrderId),
        eq(operatorWorkOrder.workspaceId, actor.workspaceId),
      ));
    }
    const routed: Array<{
      injection: ReturnType<typeof serializeInjection>;
      approval: ReturnType<typeof serializeApproval> | null;
      target?: { hub: string; id: string };
    }> = [];
    let pendingApprovalCount = 0;
    if (desk.approvalMode !== 'draft_only') {
      for (const targetHub of enabledDestinations) {
        const riskLevel = targetHub === 'team-chat-messages' ? 'medium' : 'low';
        const approvalAction = targetHub === 'operator-memories' ? 'remember'
          : targetHub === 'team-chat-messages' ? 'send'
            : 'create';
        const autoWrite = supportedWriteBackDestinations.has(targetHub) && (
          (desk.approvalMode === 'action_based' && !operatorActionRequiresApproval(approvalAction))
          || (desk.approvalMode === 'safe_auto_write' && riskLevel === 'low')
        );
        const injectionRows = await transaction.insert(operatorInjection).values({
          workspaceId: actor.workspaceId,
          createdByUserId: actor.userId,
          outputId: output.id,
          targetHub,
          action: approvalAction === 'send' ? 'create' : approvalAction,
          riskLevel,
          status: autoWrite ? 'proposed' : 'pending_approval',
        }).returning();
        const injection = injectionRows[0];
        if (autoWrite) {
          const targetRecordId = await writeApprovedTarget(transaction, actor, output, targetHub);
          const completedAt = new Date();
          const completedRows = await transaction.update(operatorInjection).set({
            status: 'completed',
            targetRecordId,
            completedAt,
          }).where(eq(operatorInjection.id, injection.id)).returning();
          routed.push({
            injection: serializeInjection(completedRows[0]),
            approval: null,
            target: { hub: targetHub, id: targetRecordId },
          });
          continue;
        }
        const approvalRows = await transaction.insert(operatorApproval).values({
          workspaceId: actor.workspaceId,
          createdByUserId: actor.userId,
          operatorDeskId: data.operatorDeskId,
          workOrderId: data.workOrderId ?? null,
          outputId: output.id,
          injectionId: injection.id,
          title: `Approve ${targetHub}: ${data.title}`,
          summary: data.summary,
          targetHub,
          action: approvalAction,
          riskLevel,
          status: 'pending',
          writeBackStatus: 'pending',
        }).returning();
        routed.push({
          injection: serializeInjection(injection),
          approval: serializeApproval(approvalRows[0]),
        });
        pendingApprovalCount += 1;
      }
    }
    if (desk.approvalMode !== 'draft_only' && pendingApprovalCount === 0 && enabledDestinations.length > 0) {
      const updated = await transaction.update(operatorOutput).set({
        status: 'injected',
        updatedAt: new Date(),
      }).where(eq(operatorOutput.id, output.id)).returning();
      return { data: serializeOutput(updated[0]), routes: routed };
    }
    return { data: serializeOutput(output), routes: routed };
  });
}

export async function listOperatorInjections(
  database: PostgresDatabase,
  actor: WorkspaceActor,
) {
  const rows = await database.select().from(operatorInjection)
    .where(eq(operatorInjection.workspaceId, actor.workspaceId))
    .orderBy(desc(operatorInjection.createdAt))
    .limit(200);
  return rows.map(serializeInjection);
}

export async function getOperatorInjection(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  injectionId: string,
) {
  const id = parse(z.string().uuid(), injectionId);
  const rows = await database.select().from(operatorInjection).where(and(
    eq(operatorInjection.id, id),
    eq(operatorInjection.workspaceId, actor.workspaceId),
  )).limit(1);
  if (!rows[0]) throw new OperatorRuntimeError('Injection not found.', 404);
  return serializeInjection(rows[0]);
}

export async function listOperatorApprovals(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  query: Record<string, unknown>,
) {
  const status = z.enum(['pending', 'approved', 'rejected', 'edited', 'expired', 'completed', 'failed'])
    .optional()
    .safeParse(query.status);
  const deskId = z.string().uuid().optional().safeParse(query.operatorDeskId);
  if (!status.success || !deskId.success) {
    throw new OperatorRuntimeError('Approval filters are invalid.', 400);
  }
  const rows = await database.select().from(operatorApproval).where(and(
    eq(operatorApproval.workspaceId, actor.workspaceId),
    status.data ? eq(operatorApproval.status, status.data) : undefined,
    deskId.data ? eq(operatorApproval.operatorDeskId, deskId.data) : undefined,
  )).orderBy(desc(operatorApproval.createdAt)).limit(200);
  return rows.map(serializeApproval);
}

export async function getOperatorApproval(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  approvalId: string,
) {
  const id = parse(z.string().uuid(), approvalId);
  const rows = await database.select().from(operatorApproval).where(and(
    eq(operatorApproval.id, id),
    eq(operatorApproval.workspaceId, actor.workspaceId),
  )).limit(1);
  if (!rows[0]) throw new OperatorRuntimeError('Approval not found.', 404);
  return serializeApproval(rows[0]);
}

async function writeApprovedTarget(
  transaction: Parameters<Parameters<PostgresDatabase['transaction']>[0]>[0],
  actor: WorkspaceActor,
  output: typeof operatorOutput.$inferSelect,
  targetHub: string,
) {
  const payload = output.structuredPayload || {};
  if (targetHub === 'tasks') {
    const rows = await transaction.insert(task).values({
      workspaceId: actor.workspaceId,
      createdByUserId: actor.userId,
      title: output.title,
      status: 'todo',
      effortPoints: [1, 2, 3, 5, 8].includes(Number(payload.effortPoints))
        ? Number(payload.effortPoints) as 1 | 2 | 3 | 5 | 8
        : 3,
      executionNotes: output.content,
      sourceLineage: { sourceIds: [output.id], matchKey: slugify(output.title) },
    }).returning({ id: task.id });
    return rows[0].id;
  }
  if (targetHub === 'blog-articles') {
    const rows = await transaction.insert(blogArticle).values({
      workspaceId: actor.workspaceId,
      createdByUserId: actor.userId,
      ownerUserId: actor.userId,
      title: output.title,
      slug: `${slugify(output.title)}-${output.id.slice(0, 8)}`,
      summary: output.summary,
      content: output.content,
      status: output.outputType === 'blog_idea' ? 'idea' : 'drafting',
      roadmapPhase: 'next',
      priority: 'medium',
    }).returning({ id: blogArticle.id });
    return rows[0].id;
  }
  if (targetHub === 'operator-memories') {
    const deskId = output.operatorDeskId;
    const rows = await transaction.insert(operatorMemory).values({
      workspaceId: actor.workspaceId,
      createdByUserId: actor.userId,
      scope: 'operator',
      scopeId: deskId,
      memoryType: 'lesson',
      state: 'active',
      content: output.content,
      confidence: output.confidence,
      sourceOutputId: output.id,
      source: 'operator-output',
    }).returning({ id: operatorMemory.id });
    return rows[0].id;
  }
  if (targetHub === 'team-chat-messages') {
    const channelId = parse(z.string().uuid(), payload.channelId);
    const participantId = parse(z.string().uuid(), payload.participantId);
    const memberships = await transaction.select({
      participantType: teamChatParticipant.participantType,
      senderName: teamChatParticipant.displayName,
      channelStatus: teamChatChannel.status,
      participantStatus: teamChatParticipant.status,
    }).from(teamChatChannelParticipant)
      .innerJoin(teamChatChannel, and(
        eq(teamChatChannel.workspaceId, teamChatChannelParticipant.workspaceId),
        eq(teamChatChannel.id, teamChatChannelParticipant.channelId),
      ))
      .innerJoin(teamChatParticipant, and(
        eq(teamChatParticipant.workspaceId, teamChatChannelParticipant.workspaceId),
        eq(teamChatParticipant.id, teamChatChannelParticipant.participantId),
      ))
      .where(and(
        eq(teamChatChannelParticipant.workspaceId, actor.workspaceId),
        eq(teamChatChannelParticipant.channelId, channelId),
        eq(teamChatChannelParticipant.participantId, participantId),
      )).limit(1);
    const membership = memberships[0];
    if (!membership || membership.channelStatus !== 'active' || membership.participantStatus !== 'active') {
      throw new OperatorRuntimeError('Team Chat target is unavailable.', 422);
    }
    const rows = await transaction.insert(teamChatMessage).values({
      workspaceId: actor.workspaceId,
      channelId,
      participantId,
      participantType: membership.participantType,
      senderName: membership.senderName,
      content: output.content,
      createdByUserId: actor.userId,
    }).returning({ id: teamChatMessage.id });
    return rows[0].id;
  }
  throw new OperatorRuntimeError(`Approved destination ${targetHub} is not writable in standalone mode.`, 400);
}

export async function approveOperatorApproval(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  approvalId: string,
  input: unknown,
) {
  const id = parse(z.string().uuid(), approvalId);
  const data = parse(z.object({ summary: z.string().max(8_000).optional() }), input ?? {});
  return database.transaction(async (transaction) => {
    const approvalRows = await transaction.select().from(operatorApproval).where(and(
      eq(operatorApproval.id, id),
      eq(operatorApproval.workspaceId, actor.workspaceId),
    )).limit(1).for('update');
    const approval = approvalRows[0];
    if (!approval) throw new OperatorRuntimeError('Approval not found.', 404);
    if (approval.status === 'approved' && approval.writeBackStatus === 'completed') {
      return { data: serializeApproval(approval), idempotent: true };
    }
    if (!['pending', 'edited'].includes(approval.status)) {
      throw new OperatorRuntimeError(`Approval cannot be approved from ${approval.status}.`, 409);
    }
    if (!approval.outputId || !approval.injectionId) {
      throw new OperatorRuntimeError('Approval is missing output or injection linkage.', 400);
    }
    const outputs = await transaction.select().from(operatorOutput).where(and(
      eq(operatorOutput.id, approval.outputId),
      eq(operatorOutput.workspaceId, actor.workspaceId),
    )).limit(1);
    const output = outputs[0];
    if (!output) throw new OperatorRuntimeError('Linked output not found.', 404);
    const targetRecordId = await writeApprovedTarget(transaction, actor, output, approval.targetHub);
    const now = new Date();
    await transaction.update(operatorInjection).set({
      status: 'completed',
      completedAt: now,
      targetRecordId,
    }).where(eq(operatorInjection.id, approval.injectionId));
    const updated = await transaction.update(operatorApproval).set({
      status: 'approved',
      summary: data.summary ?? approval.summary,
      writeBackStatus: 'completed',
      writeBackCompletedAt: now,
      targetRecordId,
      reviewedByUserId: actor.userId,
      reviewedAt: now,
      updatedAt: now,
    }).where(eq(operatorApproval.id, id)).returning();
    const remaining = await transaction.select({ id: operatorApproval.id }).from(operatorApproval).where(and(
      eq(operatorApproval.outputId, output.id),
      eq(operatorApproval.workspaceId, actor.workspaceId),
      inArray(operatorApproval.status, ['pending', 'edited']),
    )).limit(1);
    await transaction.update(operatorOutput).set({
      status: remaining[0] ? 'pending_approval' : 'injected',
      updatedAt: now,
    }).where(eq(operatorOutput.id, output.id));
    return {
      data: serializeApproval(updated[0]),
      target: { hub: approval.targetHub, id: targetRecordId },
      idempotent: false,
    };
  });
}

export async function rejectOperatorApproval(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  approvalId: string,
  input: unknown,
) {
  const id = parse(z.string().uuid(), approvalId);
  const { reason } = parse(z.object({ reason: z.string().max(2_000).default('') }), input ?? {});
  return database.transaction(async (transaction) => {
    const rows = await transaction.select().from(operatorApproval).where(and(
      eq(operatorApproval.id, id),
      eq(operatorApproval.workspaceId, actor.workspaceId),
    )).limit(1).for('update');
    const approval = rows[0];
    if (!approval) throw new OperatorRuntimeError('Approval not found.', 404);
    if (approval.status === 'rejected') return { data: serializeApproval(approval), idempotent: true };
    if (!['pending', 'edited'].includes(approval.status)) {
      throw new OperatorRuntimeError(`Approval cannot be rejected from ${approval.status}.`, 409);
    }
    const now = new Date();
    if (approval.injectionId) {
      await transaction.update(operatorInjection).set({ status: 'rejected' })
        .where(eq(operatorInjection.id, approval.injectionId));
    }
    if (approval.outputId) {
      await transaction.update(operatorOutput).set({ status: 'rejected', updatedAt: now })
        .where(eq(operatorOutput.id, approval.outputId));
    }
    const updated = await transaction.update(operatorApproval).set({
      status: 'rejected',
      rejectionReason: reason,
      reviewedByUserId: actor.userId,
      reviewedAt: now,
      updatedAt: now,
    }).where(eq(operatorApproval.id, id)).returning();
    return { data: serializeApproval(updated[0]), idempotent: false };
  });
}

export async function buildOperatorManifest(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  query: Record<string, unknown>,
) {
  const key = typeof query.operatorDeskId === 'string' ? query.operatorDeskId
    : typeof query.deskId === 'string' ? query.deskId
      : typeof query.slug === 'string' ? query.slug
        : '';
  if (!key) throw new OperatorRuntimeError('operatorDeskId or slug is required.', 400);
  const desks = await database.select().from(operatorDesk).where(and(
    eq(operatorDesk.workspaceId, actor.workspaceId),
    or(
      z.string().uuid().safeParse(key).success ? eq(operatorDesk.id, key) : undefined,
      eq(operatorDesk.slug, key),
    ),
  )).limit(1);
  const desk = desks[0];
  if (!desk) throw new OperatorRuntimeError('Operator Desk not found.', 404);
  if (desk.status !== 'active') throw new OperatorRuntimeError('Operator Desk is not active.', 409);
  const [orders, packs, memories, outputs, checkins] = await Promise.all([
    database.select().from(operatorWorkOrder).where(and(
      eq(operatorWorkOrder.workspaceId, actor.workspaceId),
      eq(operatorWorkOrder.operatorDeskId, desk.id),
    )),
    database.select().from(operatorContextPack).where(and(
      eq(operatorContextPack.workspaceId, actor.workspaceId),
      or(eq(operatorContextPack.scope, 'global'), eq(operatorContextPack.scopeId, desk.id)),
    )),
    database.select().from(operatorMemory).where(and(
      eq(operatorMemory.workspaceId, actor.workspaceId),
      or(eq(operatorMemory.scope, 'global'), eq(operatorMemory.scopeId, desk.id)),
      inArray(operatorMemory.state, ['active', 'pinned']),
    )),
    database.select().from(operatorOutput).where(and(
      eq(operatorOutput.workspaceId, actor.workspaceId),
      eq(operatorOutput.operatorDeskId, desk.id),
    )).orderBy(desc(operatorOutput.createdAt)).limit(10),
    database.select().from(operatorCheckin).where(and(
      eq(operatorCheckin.workspaceId, actor.workspaceId),
      eq(operatorCheckin.operatorDeskId, desk.id),
    )).orderBy(desc(operatorCheckin.createdAt)).limit(10),
  ]);
  const externalAgentName = typeof query.externalAgentName === 'string' ? query.externalAgentName : null;
  return {
    operatorDesk: {
      id: desk.id,
      name: desk.name,
      slug: desk.slug,
      type: desk.type,
      mission: desk.mission,
      status: desk.status,
      approvalMode: desk.approvalMode,
    },
    readyWorkOrders: orders.filter((item) => item.status === 'ready'),
    claimedWorkOrders: orders
      .filter((item) => ['claimed', 'in_progress'].includes(item.status))
      .filter((item) => !externalAgentName || item.claimedBy === externalAgentName),
    contextPacks: packs,
    activeMemory: memories.filter((item) => item.state === 'active').map(serializeMemory),
    pinnedMemory: memories.filter((item) => item.state === 'pinned').map(serializeMemory),
    allowedSources: desk.allowedSources,
    allowedOutputTypes: desk.allowedOutputTypes,
    routingRules: desk.routingRules,
    approvalRules: {
      approvalMode: desk.approvalMode,
      dangerousActionRules: desk.dangerousActionRules,
    },
    recentOutputs: outputs.map(serializeOutput),
    recentCheckins: checkins.map(serializeCheckin),
  };
}
