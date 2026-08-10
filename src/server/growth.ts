import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkspaceRepository as PostgresDatabase } from './platform/workspace-repository.js';
import { growthAccount, lead, task, workspaceMembership } from './db/schema.js';
import type { WorkspaceActor } from './execution/tasks.js';
import { pickProvided } from './validation.js';

const accountStatuses = ['prospect', 'customer', 'partner', 'inactive'] as const;
const leadStages = ['new', 'qualified', 'contacted', 'demo-booked', 'proposal', 'won', 'lost'] as const;
const leadSources = ['inbound', 'referral', 'cold-outreach', 'waitlist', 'twitter', 'linkedin', 'email', 'other'] as const;
const priorities = ['low', 'medium', 'high'] as const;
const text = (max: number) => z.string().trim().max(max);
const nullableId = z.string().uuid().nullable();
const nullableDate = z.string().datetime().nullable();

const accountCreateSchema = z.object({
  name: text(200).min(1),
  website: text(500).default(''),
  industry: text(120).default(''),
  size: text(120).default(''),
  notes: z.string().max(8_000).default(''),
  status: z.enum(accountStatuses).default('prospect'),
  sourceLineage: z.record(z.string(), z.unknown()).default({}),
});
const accountUpdateSchema = accountCreateSchema.partial();
const leadCreateSchema = z.object({
  name: text(200).min(1),
  email: z.union([z.literal(''), z.string().trim().email().max(320)]).default(''),
  companyName: text(200).default(''),
  accountId: nullableId.optional(),
  source: z.enum(leadSources).default('inbound'),
  stage: z.enum(leadStages).default('new'),
  priority: z.enum(priorities).default('medium'),
  ownerId: z.string().min(1).max(200).nullable().optional(),
  nextAction: text(500).default(''),
  nextActionAt: nullableDate.optional(),
  notes: z.string().max(8_000).default(''),
  linkedTaskIds: z.array(z.string().uuid()).max(100).default([]),
  sourceLineage: z.record(z.string(), z.unknown()).default({}),
});
const leadUpdateSchema = leadCreateSchema.partial();

export class GrowthError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'GrowthError';
  }
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new GrowthError(result.error.issues[0]?.message || 'Invalid growth record.', 400);
  return result.data;
}

function serializeAccount(row: typeof growthAccount.$inferSelect, linkedLeadIds: string[]) {
  return {
    id: row.id,
    name: row.name,
    website: row.website,
    industry: row.industry,
    size: row.size,
    notes: row.notes,
    status: row.status,
    linkedLeadIds,
    sourceLineage: row.sourceLineage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

function serializeLead(row: typeof lead.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    companyName: row.companyName,
    accountId: row.accountId,
    source: row.source,
    stage: row.stage,
    priority: row.priority,
    ownerId: row.ownerUserId,
    nextAction: row.nextAction,
    nextActionAt: row.nextActionAt?.toISOString() ?? null,
    notes: row.notes,
    linkedTaskIds: row.linkedTaskIds,
    sourceLineage: row.sourceLineage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

async function linkedLeadsByAccount(database: PostgresDatabase, actor: WorkspaceActor) {
  const rows = await database.select({ id: lead.id, accountId: lead.accountId }).from(lead)
    .where(eq(lead.workspaceId, actor.workspaceId));
  const result = new Map<string, string[]>();
  for (const row of rows) {
    if (row.accountId) result.set(row.accountId, [...(result.get(row.accountId) || []), row.id]);
  }
  return result;
}

async function assertAccount(database: PostgresDatabase, actor: WorkspaceActor, accountId: string | null | undefined) {
  if (!accountId) return;
  const rows = await database.select({ id: growthAccount.id }).from(growthAccount).where(and(
    eq(growthAccount.workspaceId, actor.workspaceId),
    eq(growthAccount.id, accountId),
  )).limit(1);
  if (!rows[0]) throw new GrowthError('Account is unavailable in this workspace.', 422);
}

async function assertOwner(database: PostgresDatabase, actor: WorkspaceActor, ownerId: string | null | undefined) {
  if (!ownerId) return;
  const rows = await database.select({ id: workspaceMembership.userId }).from(workspaceMembership).where(and(
    eq(workspaceMembership.workspaceId, actor.workspaceId),
    eq(workspaceMembership.userId, ownerId),
  )).limit(1);
  if (!rows[0]) throw new GrowthError('Owner is unavailable in this workspace.', 422);
}

async function assertTasks(database: PostgresDatabase, actor: WorkspaceActor, taskIds: string[]) {
  const unique = [...new Set(taskIds)];
  if (!unique.length) return unique;
  const rows = await database.select({ id: task.id }).from(task).where(and(
    eq(task.workspaceId, actor.workspaceId),
    inArray(task.id, unique),
  ));
  if (rows.length !== unique.length) throw new GrowthError('One or more linked tasks are unavailable in this workspace.', 422);
  return unique;
}

export async function listAccounts(database: PostgresDatabase, actor: WorkspaceActor, query: Record<string, unknown> = {}) {
  const status = z.enum(accountStatuses).optional().safeParse(query.status);
  if (!status.success) throw new GrowthError('Account status filter is invalid.', 400);
  const [rows, linked] = await Promise.all([
    database.select().from(growthAccount).where(and(
      eq(growthAccount.workspaceId, actor.workspaceId),
      status.data ? eq(growthAccount.status, status.data) : undefined,
    )).orderBy(desc(growthAccount.updatedAt)).limit(200),
    linkedLeadsByAccount(database, actor),
  ]);
  return rows.map((row) => serializeAccount(row, linked.get(row.id) || []));
}

export async function getAccount(database: PostgresDatabase, actor: WorkspaceActor, accountId: string) {
  const id = parse(z.string().uuid(), accountId);
  const rows = await database.select().from(growthAccount).where(and(
    eq(growthAccount.workspaceId, actor.workspaceId), eq(growthAccount.id, id),
  )).limit(1);
  if (!rows[0]) throw new GrowthError('Account not found.', 404);
  const linked = await database.select({ id: lead.id }).from(lead).where(and(
    eq(lead.workspaceId, actor.workspaceId), eq(lead.accountId, id),
  ));
  return serializeAccount(rows[0], linked.map((item) => item.id));
}

export async function createAccount(database: PostgresDatabase, actor: WorkspaceActor, input: unknown) {
  const data = parse(accountCreateSchema, input);
  const rows = await database.insert(growthAccount).values({
    workspaceId: actor.workspaceId,
    createdByUserId: actor.userId,
    ...data,
  }).returning();
  return serializeAccount(rows[0], []);
}

export async function updateAccount(database: PostgresDatabase, actor: WorkspaceActor, accountId: string, input: unknown) {
  const id = parse(z.string().uuid(), accountId);
  const data = parse(accountUpdateSchema, input);
  const patch = pickProvided(input, data);
  const rows = await database.update(growthAccount).set({ ...patch, updatedAt: new Date() }).where(and(
    eq(growthAccount.workspaceId, actor.workspaceId), eq(growthAccount.id, id),
  )).returning();
  if (!rows[0]) throw new GrowthError('Account not found.', 404);
  return getAccount(database, actor, id);
}

export async function deleteAccount(database: PostgresDatabase, actor: WorkspaceActor, accountId: string) {
  const id = parse(z.string().uuid(), accountId);
  const rows = await database.delete(growthAccount).where(and(
    eq(growthAccount.workspaceId, actor.workspaceId), eq(growthAccount.id, id),
  )).returning({ id: growthAccount.id });
  if (!rows[0]) throw new GrowthError('Account not found.', 404);
  return { id: rows[0].id, deleted: true as const };
}

export async function listLeads(database: PostgresDatabase, actor: WorkspaceActor, query: Record<string, unknown> = {}) {
  const filters = z.object({
    stage: z.enum(leadStages).optional(),
    priority: z.enum(priorities).optional(),
    source: z.enum(leadSources).optional(),
    accountId: z.string().uuid().optional(),
    ownerId: z.string().min(1).max(200).optional(),
  }).safeParse(query);
  if (!filters.success) throw new GrowthError('Lead filters are invalid.', 400);
  const rows = await database.select().from(lead).where(and(
    eq(lead.workspaceId, actor.workspaceId),
    filters.data.stage ? eq(lead.stage, filters.data.stage) : undefined,
    filters.data.priority ? eq(lead.priority, filters.data.priority) : undefined,
    filters.data.source ? eq(lead.source, filters.data.source) : undefined,
    filters.data.accountId ? eq(lead.accountId, filters.data.accountId) : undefined,
    filters.data.ownerId ? eq(lead.ownerUserId, filters.data.ownerId) : undefined,
  )).orderBy(desc(lead.updatedAt)).limit(300);
  return rows.map(serializeLead);
}

export async function getLead(database: PostgresDatabase, actor: WorkspaceActor, leadId: string) {
  const id = parse(z.string().uuid(), leadId);
  const rows = await database.select().from(lead).where(and(
    eq(lead.workspaceId, actor.workspaceId), eq(lead.id, id),
  )).limit(1);
  if (!rows[0]) throw new GrowthError('Lead not found.', 404);
  return serializeLead(rows[0]);
}

export async function createLead(database: PostgresDatabase, actor: WorkspaceActor, input: unknown) {
  const data = parse(leadCreateSchema, input);
  const [, , linkedTaskIds] = await Promise.all([
    assertAccount(database, actor, data.accountId),
    assertOwner(database, actor, data.ownerId),
    assertTasks(database, actor, data.linkedTaskIds),
  ]);
  const rows = await database.insert(lead).values({
    workspaceId: actor.workspaceId,
    createdByUserId: actor.userId,
    name: data.name,
    email: data.email,
    companyName: data.companyName,
    accountId: data.accountId ?? null,
    source: data.source,
    stage: data.stage,
    priority: data.priority,
    ownerUserId: data.ownerId ?? null,
    nextAction: data.nextAction,
    nextActionAt: data.nextActionAt ? new Date(data.nextActionAt) : null,
    notes: data.notes,
    linkedTaskIds,
    sourceLineage: data.sourceLineage,
  }).returning();
  return serializeLead(rows[0]);
}

export async function updateLead(database: PostgresDatabase, actor: WorkspaceActor, leadId: string, input: unknown) {
  const id = parse(z.string().uuid(), leadId);
  const data = parse(leadUpdateSchema, input);
  const patch = pickProvided(input, data);
  const linkedTaskIds = patch.linkedTaskIds !== undefined
    ? await assertTasks(database, actor, patch.linkedTaskIds)
    : undefined;
  await Promise.all([
    assertAccount(database, actor, patch.accountId),
    assertOwner(database, actor, patch.ownerId),
  ]);
  const rows = await database.update(lead).set({
    ...(patch.name !== undefined && { name: patch.name }),
    ...(patch.email !== undefined && { email: patch.email }),
    ...(patch.companyName !== undefined && { companyName: patch.companyName }),
    ...(patch.accountId !== undefined && { accountId: patch.accountId }),
    ...(patch.source !== undefined && { source: patch.source }),
    ...(patch.stage !== undefined && { stage: patch.stage }),
    ...(patch.priority !== undefined && { priority: patch.priority }),
    ...(patch.ownerId !== undefined && { ownerUserId: patch.ownerId }),
    ...(patch.nextAction !== undefined && { nextAction: patch.nextAction }),
    ...(patch.nextActionAt !== undefined && { nextActionAt: patch.nextActionAt ? new Date(patch.nextActionAt) : null }),
    ...(patch.notes !== undefined && { notes: patch.notes }),
    ...(linkedTaskIds !== undefined && { linkedTaskIds }),
    ...(data.sourceLineage !== undefined && { sourceLineage: data.sourceLineage }),
    updatedAt: new Date(),
  }).where(and(eq(lead.workspaceId, actor.workspaceId), eq(lead.id, id))).returning();
  if (!rows[0]) throw new GrowthError('Lead not found.', 404);
  return serializeLead(rows[0]);
}

export async function deleteLead(database: PostgresDatabase, actor: WorkspaceActor, leadId: string) {
  const id = parse(z.string().uuid(), leadId);
  const rows = await database.delete(lead).where(and(
    eq(lead.workspaceId, actor.workspaceId), eq(lead.id, id),
  )).returning({ id: lead.id });
  if (!rows[0]) throw new GrowthError('Lead not found.', 404);
  return { id: rows[0].id, deleted: true as const };
}
