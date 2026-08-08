import { and, desc, eq, isNull, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { postgresErrorCode } from './db/errors.js';
import type { WorkspaceRepository as PostgresDatabase } from './platform/workspace-repository.js';
import { operatorCheckin, operatorDesk, operatorWorkOrder } from './db/schema.js';
import type { WorkspaceActor } from './execution/tasks.js';

const deskTypes = ['ops', 'content', 'creative', 'bug', 'feature', 'research', 'growth', 'feedback'] as const;
const frequencies = ['manual', 'daily', 'weekly', 'monthly', 'event'] as const;
const deskStatuses = ['active', 'paused', 'archived'] as const;
const approvalModes = ['action_based', 'draft_only', 'propose_injection', 'approve_before_write', 'safe_auto_write'] as const;
const orderStatuses = ['draft', 'ready', 'claimed', 'in_progress', 'submitted', 'needs_review', 'approved', 'rejected', 'archived', 'cancelled'] as const;
const priorities = ['low', 'medium', 'high', 'critical'] as const;
const claimPolicies = ['single_agent', 'multi_agent', 'manual_assignment'] as const;
const outputTypes = [
  'launch_summary', 'focus_recommendation', 'blog_idea', 'blog_article', 'social_post',
  'creative_brief', 'creative_item', 'campaign_idea', 'bug_report', 'bug_triage',
  'feature_spec', 'roadmap_item', 'execution_task', 'implementation_brief', 'research_brief',
  'seo_keyword', 'content_refresh', 'growth_task', 'feedback_signal', 'memory_suggestion',
  'weekly_summary', 'team_chat_update', 'time_block', 'risk_note', 'prompt',
] as const;
const dangerousActionDefaults = [
  'Never publish, send, deploy, delete, or modify production data without explicit approval.',
  'Never expose credentials, personal data, or private source content.',
  'Never bypass workspace boundaries or approval policy.',
];
const textList = z.array(z.string().trim().min(1).max(500)).max(200);
const nullableDate = z.string().datetime().nullable();

const deskCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  type: z.enum(deskTypes).default('ops'),
  mission: z.string().trim().min(1).max(8_000),
  defaultCheckFrequency: z.enum(frequencies).default('manual'),
  status: z.enum(deskStatuses).default('active'),
  connectedExternalAgents: textList.default([]),
  allowedSources: textList.default([]),
  allowedOutputTypes: z.array(z.enum(outputTypes)).max(outputTypes.length)
    .default(['execution_task', 'risk_note', 'memory_suggestion']),
  approvalMode: z.enum(approvalModes).default('action_based'),
  routingRules: z.record(z.string(), z.unknown()).optional(),
  dangerousActionRules: textList.default(dangerousActionDefaults),
});
const deskUpdateSchema = deskCreateSchema
  .omit({ slug: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');
const orderCreateSchema = z.object({
  operatorDeskId: z.string().uuid(),
  title: z.string().trim().min(1).max(240),
  brief: z.string().trim().min(1).max(8_000),
  status: z.enum(orderStatuses).default('ready'),
  priority: z.enum(priorities).default('medium'),
  contextPackIds: textList.default([]),
  expectedOutputTypes: z.array(z.enum(outputTypes)).max(outputTypes.length).default([]),
  approvalMode: z.enum(approvalModes).default('action_based'),
  claimPolicy: z.enum(claimPolicies).default('single_agent'),
  assignedExternalAgent: z.string().trim().min(1).max(200).nullable().optional(),
  availableFrom: nullableDate.optional(),
  dueAt: nullableDate.optional(),
});
const orderUpdateSchema = orderCreateSchema
  .omit({ operatorDeskId: true })
  .extend({
    claimedBy: z.string().trim().min(1).max(200).nullable().optional(),
    claimedAt: nullableDate.optional(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

export class OperatorError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'OperatorError';
  }
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new OperatorError(parsed.error.issues[0]?.message || 'Invalid operator request.', 400);
  return parsed.data;
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'operator';
}

function routingRules(types: readonly string[]) {
  return Object.fromEntries(types.map((type) => [type, {
    destination: type === 'execution_task' ? 'tasks' : type === 'blog_article' ? 'blog-articles' : 'approval-inbox',
    requiresApproval: true,
  }]));
}

function date(value: string | null | undefined) {
  return value ? new Date(value) : null;
}

function serializeDesk(row: typeof operatorDesk.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.type,
    mission: row.mission,
    defaultCheckFrequency: row.defaultCheckFrequency,
    status: row.status,
    connectedExternalAgents: row.connectedExternalAgents,
    allowedSources: row.allowedSources,
    allowedOutputTypes: row.allowedOutputTypes,
    approvalMode: row.approvalMode,
    routingRules: row.routingRules,
    dangerousActionRules: row.dangerousActionRules,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

function serializeOrder(row: typeof operatorWorkOrder.$inferSelect) {
  return {
    id: row.id,
    operatorDeskId: row.operatorDeskId,
    title: row.title,
    brief: row.brief,
    status: row.status,
    priority: row.priority,
    contextPackIds: row.contextPackIds,
    expectedOutputTypes: row.expectedOutputTypes,
    approvalMode: row.approvalMode,
    claimPolicy: row.claimPolicy,
    assignedExternalAgent: row.assignedExternalAgent,
    claimedBy: row.claimedBy,
    claimedAt: row.claimedAt?.toISOString() ?? null,
    availableFrom: row.availableFrom?.toISOString() ?? null,
    dueAt: row.dueAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

function conflict(error: unknown): never {
  if (postgresErrorCode(error) === '23505') {
    throw new OperatorError('An Operator Desk with this slug already exists.', 409);
  }
  if (postgresErrorCode(error) === '23503') {
    throw new OperatorError('A linked Operator Desk is unavailable in this workspace.', 422);
  }
  throw error;
}

export async function listOperatorDesks(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  query: Record<string, unknown>,
) {
  const status = z.enum(deskStatuses).optional().safeParse(query.status);
  const type = z.enum(deskTypes).optional().safeParse(query.type);
  if (!status.success || !type.success) throw new OperatorError('Operator Desk filters are invalid.', 400);
  const rows = await database
    .select()
    .from(operatorDesk)
    .where(and(
      eq(operatorDesk.workspaceId, actor.workspaceId),
      status.data ? eq(operatorDesk.status, status.data) : undefined,
      type.data ? eq(operatorDesk.type, type.data) : undefined,
    ))
    .orderBy(desc(operatorDesk.updatedAt))
    .limit(100);
  return rows.map(serializeDesk);
}

export async function getOperatorDesk(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  deskId: string,
) {
  const id = parse(z.string().uuid(), deskId);
  const rows = await database
    .select()
    .from(operatorDesk)
    .where(and(eq(operatorDesk.id, id), eq(operatorDesk.workspaceId, actor.workspaceId)))
    .limit(1);
  if (!rows[0]) throw new OperatorError('Operator Desk not found.', 404);
  return serializeDesk(rows[0]);
}

export async function createOperatorDesk(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  input: unknown,
) {
  const data = parse(deskCreateSchema, input);
  try {
    const rows = await database
      .insert(operatorDesk)
      .values({
        workspaceId: actor.workspaceId,
        createdByUserId: actor.userId,
        ...data,
        slug: data.slug || slugify(data.name),
        routingRules: data.routingRules || routingRules(data.allowedOutputTypes),
      })
      .returning();
    return serializeDesk(rows[0]);
  } catch (error) {
    conflict(error);
  }
}

export async function updateOperatorDesk(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  deskId: string,
  input: unknown,
) {
  const id = parse(z.string().uuid(), deskId);
  const data = parse(deskUpdateSchema, input);
  const current = await database
    .select()
    .from(operatorDesk)
    .where(and(eq(operatorDesk.id, id), eq(operatorDesk.workspaceId, actor.workspaceId)))
    .limit(1);
  if (!current[0]) throw new OperatorError('Operator Desk not found.', 404);
  if (current[0].status === 'archived' && data.status !== 'active') {
    throw new OperatorError('Archived Operator Desks must be restored before other edits.', 409);
  }
  const rows = await database
    .update(operatorDesk)
    .set({
      ...data,
      ...(data.allowedOutputTypes && data.routingRules === undefined && {
        routingRules: routingRules(data.allowedOutputTypes),
      }),
      updatedAt: new Date(),
    })
    .where(and(eq(operatorDesk.id, id), eq(operatorDesk.workspaceId, actor.workspaceId)))
    .returning();
  return serializeDesk(rows[0]);
}

export async function deleteOperatorDesk(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  deskId: string,
) {
  const id = parse(z.string().uuid(), deskId);
  const linkedWorkOrders = await database
    .select({ id: operatorWorkOrder.id })
    .from(operatorWorkOrder)
    .where(and(eq(operatorWorkOrder.operatorDeskId, id), eq(operatorWorkOrder.workspaceId, actor.workspaceId)))
    .limit(1);
  if (linkedWorkOrders[0]) {
    throw new OperatorError('Operator Desks with work orders cannot be deleted; archive them instead.', 409);
  }
  try {
    const rows = await database
      .delete(operatorDesk)
      .where(and(eq(operatorDesk.id, id), eq(operatorDesk.workspaceId, actor.workspaceId)))
      .returning({ id: operatorDesk.id });
    if (!rows[0]) throw new OperatorError('Operator Desk not found.', 404);
    return { id: rows[0].id, deleted: true as const };
  } catch (error) {
    if (postgresErrorCode(error) === '23503') {
      throw new OperatorError('Operator Desks with work orders cannot be deleted; archive them instead.', 409);
    }
    throw error;
  }
}

export async function listOperatorWorkOrders(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  query: Record<string, unknown>,
) {
  const status = z.enum(orderStatuses).optional().safeParse(query.status);
  const priority = z.enum(priorities).optional().safeParse(query.priority);
  const deskValue = query.operatorDeskId ?? query.deskId;
  const deskId = z.string().uuid().optional().safeParse(deskValue);
  if (!status.success || !priority.success || !deskId.success) {
    throw new OperatorError('Work order filters are invalid.', 400);
  }
  const rows = await database
    .select()
    .from(operatorWorkOrder)
    .where(and(
      eq(operatorWorkOrder.workspaceId, actor.workspaceId),
      status.data ? eq(operatorWorkOrder.status, status.data) : undefined,
      priority.data ? eq(operatorWorkOrder.priority, priority.data) : undefined,
      deskId.data ? eq(operatorWorkOrder.operatorDeskId, deskId.data) : undefined,
      typeof query.claimedBy === 'string' ? eq(operatorWorkOrder.claimedBy, query.claimedBy) : undefined,
    ))
    .orderBy(desc(operatorWorkOrder.updatedAt))
    .limit(200);
  return rows.map(serializeOrder);
}

export async function getOperatorWorkOrder(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  workOrderId: string,
) {
  const id = parse(z.string().uuid(), workOrderId);
  const rows = await database
    .select()
    .from(operatorWorkOrder)
    .where(and(eq(operatorWorkOrder.id, id), eq(operatorWorkOrder.workspaceId, actor.workspaceId)))
    .limit(1);
  if (!rows[0]) throw new OperatorError('Work order not found.', 404);
  return serializeOrder(rows[0]);
}

export async function createOperatorWorkOrder(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  input: unknown,
) {
  const data = parse(orderCreateSchema, input);
  const desks = await database
    .select({ status: operatorDesk.status, allowedOutputTypes: operatorDesk.allowedOutputTypes })
    .from(operatorDesk)
    .where(and(eq(operatorDesk.id, data.operatorDeskId), eq(operatorDesk.workspaceId, actor.workspaceId)))
    .limit(1);
  if (!desks[0]) throw new OperatorError('Operator Desk not found.', 404);
  if (desks[0].status !== 'active') throw new OperatorError('Work orders require an active Operator Desk.', 409);
  if (data.expectedOutputTypes.some((type) => !desks[0].allowedOutputTypes.includes(type))) {
    throw new OperatorError('One or more expected outputs are not allowed by the Operator Desk.', 422);
  }
  try {
    const rows = await database
      .insert(operatorWorkOrder)
      .values({
        workspaceId: actor.workspaceId,
        createdByUserId: actor.userId,
        ...data,
        assignedExternalAgent: data.assignedExternalAgent ?? null,
        availableFrom: date(data.availableFrom),
        dueAt: date(data.dueAt),
      })
      .returning();
    return serializeOrder(rows[0]);
  } catch (error) {
    conflict(error);
  }
}

export async function updateOperatorWorkOrder(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  workOrderId: string,
  input: unknown,
) {
  const id = parse(z.string().uuid(), workOrderId);
  const data = parse(orderUpdateSchema, input);
  const rows = await database
    .update(operatorWorkOrder)
    .set({
      ...data,
      ...(data.availableFrom !== undefined && { availableFrom: date(data.availableFrom) }),
      ...(data.dueAt !== undefined && { dueAt: date(data.dueAt) }),
      ...(data.claimedAt !== undefined && { claimedAt: date(data.claimedAt) }),
      updatedAt: new Date(),
    })
    .where(and(eq(operatorWorkOrder.id, id), eq(operatorWorkOrder.workspaceId, actor.workspaceId)))
    .returning();
  if (!rows[0]) throw new OperatorError('Work order not found.', 404);
  return serializeOrder(rows[0]);
}

export async function claimOperatorWorkOrder(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  workOrderId: string,
  input: unknown,
) {
  const id = parse(z.string().uuid(), workOrderId);
  const { externalAgentName } = parse(
    z.object({ externalAgentName: z.string().trim().min(1).max(200) }),
    input,
  );
  return database.transaction(async (transaction) => {
    const rows = await transaction
      .select()
      .from(operatorWorkOrder)
      .where(and(eq(operatorWorkOrder.id, id), eq(operatorWorkOrder.workspaceId, actor.workspaceId)))
      .limit(1)
      .for('update');
    const order = rows[0];
    if (!order) throw new OperatorError('Work order not found.', 404);
    if (!['ready', 'claimed'].includes(order.status)) {
      throw new OperatorError('Only ready work orders can be claimed.', 409);
    }
    if (order.availableFrom && order.availableFrom > new Date()) {
      throw new OperatorError('Work order is not available yet.', 409);
    }
    if (order.assignedExternalAgent && order.assignedExternalAgent !== externalAgentName) {
      throw new OperatorError('Work order is assigned to another external agent.', 403);
    }
    if (order.claimedBy && order.claimedBy !== externalAgentName && order.claimPolicy !== 'multi_agent') {
      throw new OperatorError('Work order is already claimed.', 409);
    }
    if (order.claimedBy === externalAgentName && order.status === 'claimed') {
      return serializeOrder(order);
    }
    const updated = await transaction
      .update(operatorWorkOrder)
      .set({
        status: 'claimed',
        claimedBy: externalAgentName,
        claimedAt: order.claimedAt || new Date(),
        updatedAt: new Date(),
      })
      .where(eq(operatorWorkOrder.id, id))
      .returning();
    await transaction.insert(operatorCheckin).values({
      workspaceId: actor.workspaceId,
      operatorDeskId: order.operatorDeskId,
      workOrderId: order.id,
      externalAgentName,
      type: 'work_order_claimed',
      summary: `${externalAgentName} claimed ${order.title}.`,
      payload: { workOrderId: order.id },
      createdByUserId: actor.userId,
    });
    return serializeOrder(updated[0]);
  });
}

export async function releaseOperatorWorkOrder(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  workOrderId: string,
  input: unknown,
) {
  const id = parse(z.string().uuid(), workOrderId);
  const { externalAgentName } = parse(
    z.object({ externalAgentName: z.string().trim().min(1).max(200) }),
    input,
  );
  return database.transaction(async (transaction) => {
    const rows = await transaction
      .select()
      .from(operatorWorkOrder)
      .where(and(
        eq(operatorWorkOrder.id, id),
        eq(operatorWorkOrder.workspaceId, actor.workspaceId),
      ))
      .limit(1)
      .for('update');
    const order = rows[0];
    if (!order || order.claimedBy !== externalAgentName || order.status !== 'claimed') {
      throw new OperatorError('Claimed work order not found for this agent.', 404);
    }
    const updated = await transaction
      .update(operatorWorkOrder)
      .set({ status: 'ready', claimedBy: null, claimedAt: null, updatedAt: new Date() })
      .where(eq(operatorWorkOrder.id, id))
      .returning();
    await transaction.insert(operatorCheckin).values({
      workspaceId: actor.workspaceId,
      operatorDeskId: order.operatorDeskId,
      workOrderId: order.id,
      externalAgentName,
      type: 'work_skipped',
      summary: `${externalAgentName} released ${order.title}.`,
      payload: { workOrderId: order.id, reason: 'claim_released' },
      createdByUserId: actor.userId,
    });
    return serializeOrder(updated[0]);
  });
}

export async function listAvailableOperatorWorkOrders(
  database: PostgresDatabase,
  actor: WorkspaceActor,
) {
  const now = new Date();
  const rows = await database
    .select()
    .from(operatorWorkOrder)
    .where(and(
      eq(operatorWorkOrder.workspaceId, actor.workspaceId),
      eq(operatorWorkOrder.status, 'ready'),
      or(isNull(operatorWorkOrder.availableFrom), lte(operatorWorkOrder.availableFrom, now)),
    ))
    .orderBy(desc(operatorWorkOrder.priority), operatorWorkOrder.createdAt)
    .limit(100);
  return rows.map(serializeOrder);
}
