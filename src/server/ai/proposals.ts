import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkspaceRepository as PostgresDatabase } from '../platform/workspace-repository.js';
import type { WorkspaceActor } from '../execution/tasks.js';
import {
  aiProposal,
  aiProposalAction,
} from '../db/schema.js';
import { createTask, updateTask } from '../execution/tasks.js';
import { createCycleGoal, updateCycleGoal } from '../execution/cycle-goals.js';
import { createBlogArticle, updateBlogArticle } from '../content.js';
import { createTeamChatMessage } from '../team-chat.js';
import { createOperatorWorkOrder, updateOperatorWorkOrder } from '../operators.js';
import { createBug, updateBug, createRoadmapItem, updateRoadmapItem } from '../technical.js';
import { createPrompt, updatePrompt, createSocialPost, updateSocialPost, createSeoKeyword, updateSeoKeyword, createFeedback, updateFeedback, createTimeBlock, updateTimeBlock } from '../strategy.js';
import { createCreativeItem, updateCreativeItem } from '../creative.js';
import { createAccount, updateAccount, createLead, updateLead } from '../growth.js';
import { createApiEndpoint, updateApiEndpoint, createEnvironment, updateEnvironment } from '../systems.js';
import type { AIActionOperation } from './types.js';

const actionEditSchema = z.object({
  payload: z.record(z.string(), z.unknown()).optional(),
  rationale: z.string().max(4_000).optional(),
});

export class AIProposalError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'AIProposalError';
  }
}

function serializeAction(row: typeof aiProposalAction.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    appliedAt: row.appliedAt?.toISOString() ?? null,
  };
}

function serializeProposal(row: typeof aiProposal.$inferSelect, actions: Array<typeof aiProposalAction.$inferSelect>) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    actions: actions.map(serializeAction),
  };
}

export async function listAIProposals(database: PostgresDatabase, actor: WorkspaceActor, limit = 50) {
  const proposals = await database.select().from(aiProposal)
    .where(eq(aiProposal.workspaceId, actor.workspaceId))
    .orderBy(desc(aiProposal.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
  const result = [];
  for (const proposal of proposals) {
    const actions = await database.select().from(aiProposalAction).where(and(
      eq(aiProposalAction.workspaceId, actor.workspaceId),
      eq(aiProposalAction.proposalId, proposal.id),
    )).orderBy(asc(aiProposalAction.createdAt));
    result.push(serializeProposal(proposal, actions));
  }
  return result;
}

export async function getAIProposal(database: PostgresDatabase, actor: WorkspaceActor, proposalId: string) {
  const proposal = (await database.select().from(aiProposal).where(and(
    eq(aiProposal.workspaceId, actor.workspaceId),
    eq(aiProposal.id, proposalId),
  )).limit(1))[0];
  if (!proposal) throw new AIProposalError('AI proposal not found.', 404);
  const actions = await database.select().from(aiProposalAction).where(and(
    eq(aiProposalAction.workspaceId, actor.workspaceId),
    eq(aiProposalAction.proposalId, proposal.id),
  )).orderBy(asc(aiProposalAction.createdAt));
  return serializeProposal(proposal, actions);
}

async function refreshProposalStatus(database: PostgresDatabase, actor: WorkspaceActor, proposalId: string) {
  const actions = await database.select({ status: aiProposalAction.status }).from(aiProposalAction).where(and(
    eq(aiProposalAction.workspaceId, actor.workspaceId),
    eq(aiProposalAction.proposalId, proposalId),
  ));
  const status = actions.length > 0 && actions.every((action) => action.status === 'applied')
    ? 'applied'
    : actions.length > 0 && actions.every((action) => action.status === 'rejected')
      ? 'rejected'
      : 'partially_approved';
  await database.update(aiProposal).set({ status, updatedAt: new Date() }).where(and(
    eq(aiProposal.workspaceId, actor.workspaceId),
    eq(aiProposal.id, proposalId),
  ));
}

export async function approveAIProposalAction(database: PostgresDatabase, actor: WorkspaceActor, proposalId: string, actionId: string) {
  const rows = await database.update(aiProposalAction).set({
    status: 'approved',
    reviewedByUserId: actor.userId,
    reviewedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(aiProposalAction.workspaceId, actor.workspaceId),
    eq(aiProposalAction.proposalId, proposalId),
    eq(aiProposalAction.id, actionId),
    eq(aiProposalAction.status, 'pending'),
  )).returning();
  if (!rows[0]) throw new AIProposalError('Pending proposal action not found.', 404);
  await refreshProposalStatus(database, actor, proposalId);
  return serializeAction(rows[0]);
}

export async function rejectAIProposalAction(database: PostgresDatabase, actor: WorkspaceActor, proposalId: string, actionId: string) {
  const rows = await database.update(aiProposalAction).set({
    status: 'rejected',
    reviewedByUserId: actor.userId,
    reviewedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(aiProposalAction.workspaceId, actor.workspaceId),
    eq(aiProposalAction.proposalId, proposalId),
    eq(aiProposalAction.id, actionId),
    eq(aiProposalAction.status, 'pending'),
  )).returning();
  if (!rows[0]) throw new AIProposalError('Pending proposal action not found.', 404);
  await refreshProposalStatus(database, actor, proposalId);
  return serializeAction(rows[0]);
}

export async function editAIProposalAction(database: PostgresDatabase, actor: WorkspaceActor, proposalId: string, actionId: string, input: unknown) {
  const parsed = actionEditSchema.safeParse(input);
  if (!parsed.success) throw new AIProposalError(parsed.error.issues[0]?.message || 'Invalid proposal edit.');
  const rows = await database.update(aiProposalAction).set({
    ...(parsed.data.payload ? { payload: parsed.data.payload } : {}),
    ...(parsed.data.rationale !== undefined ? { rationale: parsed.data.rationale } : {}),
    updatedAt: new Date(),
  }).where(and(
    eq(aiProposalAction.workspaceId, actor.workspaceId),
    eq(aiProposalAction.proposalId, proposalId),
    eq(aiProposalAction.id, actionId),
    eq(aiProposalAction.status, 'pending'),
  )).returning();
  if (!rows[0]) throw new AIProposalError('Pending proposal action not found.', 404);
  return serializeAction(rows[0]);
}

async function applyAction(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  action: typeof aiProposalAction.$inferSelect,
) {
  const input = action.payload as Record<string, unknown>;
  const targetId = action.targetId || String(input.id || '');
  const isCreate = action.operation === 'create' || action.operation === 'draft';
  switch (action.resourceType) {
    case 'tasks':
      return isCreate ? createTask(database, actor, input) : updateTask(database, actor, targetId, input);
    case 'cycle-goals':
    case 'goals':
      return isCreate ? createCycleGoal(database, actor, input) : updateCycleGoal(database, actor, targetId, input);
    case 'blog-articles':
    case 'content':
      return isCreate ? createBlogArticle(database, actor, input) : updateBlogArticle(database, actor, targetId, input);
    case 'team-chat-messages':
      if (!isCreate) throw new AIProposalError('Updating team messages is not supported; create a replacement draft.', 422);
      return createTeamChatMessage(database, actor, input);
    case 'operator-work-orders':
    case 'work-orders':
      return isCreate ? createOperatorWorkOrder(database, actor, input) : updateOperatorWorkOrder(database, actor, targetId, input);
    case 'bugs':
      return isCreate ? createBug(database, actor, input) : updateBug(database, actor, targetId, input);
    case 'roadmap-items':
      return isCreate ? createRoadmapItem(database, actor, input) : updateRoadmapItem(database, actor, targetId, input);
    case 'prompts':
      return isCreate ? createPrompt(database, actor, input) : updatePrompt(database, actor, targetId, input);
    case 'social-posts':
      return isCreate ? createSocialPost(database, actor, input) : updateSocialPost(database, actor, targetId, input);
    case 'seo-keywords':
      return isCreate ? createSeoKeyword(database, actor, input) : updateSeoKeyword(database, actor, targetId, input);
    case 'feedbacks':
      return isCreate ? createFeedback(database, actor, input) : updateFeedback(database, actor, targetId, input);
    case 'time-blocks':
      return isCreate ? createTimeBlock(database, actor, input) : updateTimeBlock(database, actor, targetId, input);
    case 'creative-items':
      return isCreate ? createCreativeItem(database, actor, input) : updateCreativeItem(database, actor, targetId, input);
    case 'accounts':
      return isCreate ? createAccount(database, actor, input) : updateAccount(database, actor, targetId, input);
    case 'leads':
      return isCreate ? createLead(database, actor, input) : updateLead(database, actor, targetId, input);
    case 'api-endpoints':
      return isCreate ? createApiEndpoint(database, actor, input) : updateApiEndpoint(database, actor, targetId, input);
    case 'environments':
      return isCreate ? createEnvironment(database, actor, input) : updateEnvironment(database, actor, targetId, input);
    default:
      throw new AIProposalError(`No safe write adapter exists for ${action.resourceType}.`, 422);
  }
}

export async function applyAIProposalAction(database: PostgresDatabase, actor: WorkspaceActor, proposalId: string, actionId: string) {
  const outcome = await database.transaction(async (transaction) => {
    const action = (await transaction.select().from(aiProposalAction).where(and(
      eq(aiProposalAction.workspaceId, actor.workspaceId),
      eq(aiProposalAction.proposalId, proposalId),
      eq(aiProposalAction.id, actionId),
    )).limit(1).for('update'))[0];
    if (!action) throw new AIProposalError('Proposal action not found.', 404);
    if (action.status === 'applied') return { kind: 'applied' as const, action: serializeAction(action) };
    if (action.status !== 'approved') throw new AIProposalError('Approve the proposal action before applying it.', 409);

    try {
      const result = await applyAction(transaction, actor, action);
      const updated = (await transaction.update(aiProposalAction).set({
        status: 'applied',
        result: (result || {}) as Record<string, unknown>,
        appliedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(
        eq(aiProposalAction.id, action.id),
        eq(aiProposalAction.workspaceId, actor.workspaceId),
        eq(aiProposalAction.status, 'approved'),
      )).returning())[0];
      if (!updated) throw new AIProposalError('Proposal action could not be finalized.', 409);
      await refreshProposalStatus(transaction, actor, proposalId);
      return { kind: 'applied' as const, action: serializeAction(updated) };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Proposal action failed.';
      const statusCode = 'statusCode' in (error as object) && typeof (error as { statusCode?: unknown }).statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : 422;
      await transaction.update(aiProposalAction).set({
        status: 'failed',
        error: message.slice(0, 2_000),
        updatedAt: new Date(),
      }).where(and(
        eq(aiProposalAction.id, action.id),
        eq(aiProposalAction.workspaceId, actor.workspaceId),
        eq(aiProposalAction.status, 'approved'),
      ));
      await refreshProposalStatus(transaction, actor, proposalId);
      return { kind: 'failed' as const, message, statusCode };
    }
  });

  if (outcome.kind === 'failed') throw new AIProposalError(outcome.message, outcome.statusCode);
  return outcome.action;
}

export async function applyAIProposal(database: PostgresDatabase, actor: WorkspaceActor, proposalId: string) {
  const actions = await database.select().from(aiProposalAction).where(and(
    eq(aiProposalAction.workspaceId, actor.workspaceId),
    eq(aiProposalAction.proposalId, proposalId),
    eq(aiProposalAction.status, 'approved'),
  )).orderBy(asc(aiProposalAction.createdAt));
  if (actions.length === 0) throw new AIProposalError('No approved proposal actions are ready to apply.', 409);
  for (const action of actions) await applyAIProposalAction(database, actor, proposalId, action.id);
  return getAIProposal(database, actor, proposalId);
}
