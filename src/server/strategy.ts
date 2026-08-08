import { and, asc, desc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { postgresErrorCode } from './db/errors.js';
import type { WorkspaceRepository as PostgresDatabase } from './platform/workspace-repository.js';
import {
  chatReadState,
  cycleGoal,
  feedback,
  notificationReadState,
  prompt,
  seoKeyword,
  socialPost,
  timeBlock,
  weekMarker,
} from './db/schema.js';
import type { WorkspaceActor } from './execution/tasks.js';

const promptVersions = z.string().trim().min(1).max(40);
const sourceLineage = z.record(z.string(), z.unknown()).default({});
const nullableDate = z.string().datetime().nullable();
const text = (max: number, trim = true) => {
  const schema = z.string().max(max);
  return trim ? schema.trim() : schema;
};

const promptCreateSchema = z.object({
  title: text(200).min(1),
  version: promptVersions.default('v1.0'),
  content: text(50_000, false).min(1),
  sourceLineage,
});
const promptUpdateSchema = promptCreateSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

const socialPostCreateSchema = z.object({
  platform: z.enum(['Twitter', 'LinkedIn', 'Loom']).default('Twitter'),
  content: text(20_000, false).min(1),
  scheduledFor: z.string().datetime().default(() => new Date().toISOString()),
  status: z.enum(['draft', 'scheduled', 'published']).default('scheduled'),
  sourceLineage,
});
const socialPostUpdateSchema = socialPostCreateSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

const seoKeywordCreateSchema = z.object({
  keyword: text(200).min(1),
  intent: z.enum(['high', 'medium', 'low']).default('high'),
  cycleGoalId: z.string().uuid().nullable().optional(),
});
const seoKeywordUpdateSchema = seoKeywordCreateSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

const feedbackCreateSchema = z.object({
  source: z.enum(['Discord', 'Twitter', 'Email']).default('Email'),
  content: text(8_000, false).min(1),
  sentiment: z.enum(['positive', 'neutral', 'negative']).default('neutral'),
  sourceLineage,
});
const feedbackUpdateSchema = feedbackCreateSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

const timeBlockCreateSchema = z.object({
  title: text(200).min(1),
  type: z.enum(['strategic', 'buffer', 'breakout']).default('strategic'),
  startTime: text(5).regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: text(5).regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  dayOfWeek: z.number().int().min(0).max(6).default(1),
});
const timeBlockUpdateSchema = timeBlockCreateSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

const weekMarkerCreateSchema = z.object({
  weekNumber: z.number().int().min(1).max(12),
  status: z.enum(['active', 'completed', 'upcoming']).default('upcoming'),
  startedAt: z.string().datetime().default(() => new Date().toISOString()),
  endedAt: nullableDate.optional(),
});
const weekMarkerUpdateSchema = weekMarkerCreateSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

const readStateSchema = z.object({
  channelId: z.string().uuid(),
  lastReadAt: z.string().datetime(),
});
const notificationReadStateSchema = z.object({ lastReadAt: z.string().datetime() });

export class StrategyError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'StrategyError';
  }
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new StrategyError(result.error.issues[0]?.message || 'Invalid strategy record.', 400);
  return result.data;
}

function id(value: string) {
  const result = z.string().uuid().safeParse(value);
  if (!result.success) throw new StrategyError('Record id is invalid.', 400);
  return result.data;
}

function asDate(value: string | null | undefined) {
  return value ? new Date(value) : null;
}

function serializePrompt(row: typeof prompt.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    version: row.version,
    content: row.content,
    sourceLineage: row.sourceLineage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

function serializeSocialPost(row: typeof socialPost.$inferSelect) {
  return {
    id: row.id,
    platform: row.platform,
    content: row.content,
    scheduledFor: row.scheduledFor.toISOString(),
    status: row.status,
    sourceLineage: row.sourceLineage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

function serializeSeoKeyword(row: typeof seoKeyword.$inferSelect) {
  return {
    id: row.id,
    keyword: row.keyword,
    intent: row.intent,
    cycleGoalId: row.cycleGoalId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

function serializeFeedback(row: typeof feedback.$inferSelect) {
  return {
    id: row.id,
    source: row.source,
    content: row.content,
    sentiment: row.sentiment,
    sourceLineage: row.sourceLineage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

function serializeTimeBlock(row: typeof timeBlock.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    startTime: row.startTime,
    endTime: row.endTime,
    dayOfWeek: row.dayOfWeek,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

function serializeWeekMarker(row: typeof weekMarker.$inferSelect) {
  return {
    id: row.id,
    weekNumber: row.weekNumber,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

async function assertCycleGoal(database: PostgresDatabase, actor: WorkspaceActor, cycleGoalId: string | null | undefined) {
  if (!cycleGoalId) return;
  const rows = await database.select({ id: cycleGoal.id }).from(cycleGoal).where(and(
    eq(cycleGoal.workspaceId, actor.workspaceId),
    eq(cycleGoal.id, cycleGoalId),
  )).limit(1);
  if (!rows[0]) throw new StrategyError('Cycle goal is unavailable in this workspace.', 422);
}

export async function listPrompts(database: PostgresDatabase, actor: WorkspaceActor, query: Record<string, unknown> = {}) {
  const limit = parse(z.coerce.number().int().min(1).max(200).default(100), query.limit);
  const rows = await database.select().from(prompt).where(eq(prompt.workspaceId, actor.workspaceId)).orderBy(desc(prompt.createdAt)).limit(limit);
  return rows.map(serializePrompt);
}

export async function getPrompt(database: PostgresDatabase, actor: WorkspaceActor, promptId: string) {
  const rows = await database.select().from(prompt).where(and(eq(prompt.workspaceId, actor.workspaceId), eq(prompt.id, id(promptId)))).limit(1);
  if (!rows[0]) throw new StrategyError('Prompt not found.', 404);
  return serializePrompt(rows[0]);
}

export async function createPrompt(database: PostgresDatabase, actor: WorkspaceActor, input: unknown) {
  const data = parse(promptCreateSchema, input);
  const rows = await database.insert(prompt).values({
    workspaceId: actor.workspaceId,
    createdByUserId: actor.userId,
    ...data,
  }).returning();
  return serializePrompt(rows[0]);
}

export async function updatePrompt(database: PostgresDatabase, actor: WorkspaceActor, promptId: string, input: unknown) {
  const data = parse(promptUpdateSchema, input);
  const rows = await database.update(prompt).set({ ...data, updatedAt: new Date() }).where(and(
    eq(prompt.workspaceId, actor.workspaceId), eq(prompt.id, id(promptId)),
  )).returning();
  if (!rows[0]) throw new StrategyError('Prompt not found.', 404);
  return serializePrompt(rows[0]);
}

export async function deletePrompt(database: PostgresDatabase, actor: WorkspaceActor, promptId: string) {
  const rows = await database.delete(prompt).where(and(eq(prompt.workspaceId, actor.workspaceId), eq(prompt.id, id(promptId)))).returning({ id: prompt.id });
  if (!rows[0]) throw new StrategyError('Prompt not found.', 404);
  return { id: rows[0].id, deleted: true as const };
}

export async function listSocialPosts(database: PostgresDatabase, actor: WorkspaceActor, query: Record<string, unknown> = {}) {
  const filters = z.object({
    platform: z.enum(['Twitter', 'LinkedIn', 'Loom']).optional(),
    status: z.enum(['draft', 'scheduled', 'published']).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  }).safeParse(query);
  if (!filters.success) throw new StrategyError('Social post filters are invalid.', 400);
  const rows = await database.select().from(socialPost).where(and(
    eq(socialPost.workspaceId, actor.workspaceId),
    filters.data.platform ? eq(socialPost.platform, filters.data.platform) : undefined,
    filters.data.status ? eq(socialPost.status, filters.data.status) : undefined,
  )).orderBy(desc(socialPost.scheduledFor)).limit(filters.data.limit);
  return rows.map(serializeSocialPost);
}

export async function getSocialPost(database: PostgresDatabase, actor: WorkspaceActor, postId: string) {
  const rows = await database.select().from(socialPost).where(and(eq(socialPost.workspaceId, actor.workspaceId), eq(socialPost.id, id(postId)))).limit(1);
  if (!rows[0]) throw new StrategyError('Social post not found.', 404);
  return serializeSocialPost(rows[0]);
}

export async function createSocialPost(database: PostgresDatabase, actor: WorkspaceActor, input: unknown) {
  const data = parse(socialPostCreateSchema, input);
  const rows = await database.insert(socialPost).values({
    workspaceId: actor.workspaceId,
    createdByUserId: actor.userId,
    platform: data.platform,
    content: data.content,
    scheduledFor: new Date(data.scheduledFor),
    status: data.status,
    sourceLineage: data.sourceLineage,
  }).returning();
  return serializeSocialPost(rows[0]);
}

export async function updateSocialPost(database: PostgresDatabase, actor: WorkspaceActor, postId: string, input: unknown) {
  const data = parse(socialPostUpdateSchema, input);
  const rows = await database.update(socialPost).set({
    ...(data.platform !== undefined && { platform: data.platform }),
    ...(data.content !== undefined && { content: data.content }),
    ...(data.scheduledFor !== undefined && { scheduledFor: new Date(data.scheduledFor) }),
    ...(data.status !== undefined && { status: data.status }),
    ...(data.sourceLineage !== undefined && { sourceLineage: data.sourceLineage }),
    updatedAt: new Date(),
  }).where(and(eq(socialPost.workspaceId, actor.workspaceId), eq(socialPost.id, id(postId)))).returning();
  if (!rows[0]) throw new StrategyError('Social post not found.', 404);
  return serializeSocialPost(rows[0]);
}

export async function deleteSocialPost(database: PostgresDatabase, actor: WorkspaceActor, postId: string) {
  const rows = await database.delete(socialPost).where(and(eq(socialPost.workspaceId, actor.workspaceId), eq(socialPost.id, id(postId)))).returning({ id: socialPost.id });
  if (!rows[0]) throw new StrategyError('Social post not found.', 404);
  return { id: rows[0].id, deleted: true as const };
}

export async function listSeoKeywords(database: PostgresDatabase, actor: WorkspaceActor, query: Record<string, unknown> = {}) {
  const filters = z.object({
    intent: z.enum(['high', 'medium', 'low']).optional(),
    cycleGoalId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  }).safeParse(query);
  if (!filters.success) throw new StrategyError('SEO keyword filters are invalid.', 400);
  const rows = await database.select().from(seoKeyword).where(and(
    eq(seoKeyword.workspaceId, actor.workspaceId),
    filters.data.intent ? eq(seoKeyword.intent, filters.data.intent) : undefined,
    filters.data.cycleGoalId ? eq(seoKeyword.cycleGoalId, filters.data.cycleGoalId) : undefined,
  )).orderBy(desc(seoKeyword.createdAt)).limit(filters.data.limit);
  return rows.map(serializeSeoKeyword);
}

export async function getSeoKeyword(database: PostgresDatabase, actor: WorkspaceActor, keywordId: string) {
  const rows = await database.select().from(seoKeyword).where(and(eq(seoKeyword.workspaceId, actor.workspaceId), eq(seoKeyword.id, id(keywordId)))).limit(1);
  if (!rows[0]) throw new StrategyError('SEO keyword not found.', 404);
  return serializeSeoKeyword(rows[0]);
}

export async function createSeoKeyword(database: PostgresDatabase, actor: WorkspaceActor, input: unknown) {
  const data = parse(seoKeywordCreateSchema, input);
  await assertCycleGoal(database, actor, data.cycleGoalId);
  const rows = await database.insert(seoKeyword).values({
    workspaceId: actor.workspaceId,
    createdByUserId: actor.userId,
    keyword: data.keyword,
    intent: data.intent,
    cycleGoalId: data.cycleGoalId ?? null,
  }).returning();
  return serializeSeoKeyword(rows[0]);
}

export async function updateSeoKeyword(database: PostgresDatabase, actor: WorkspaceActor, keywordId: string, input: unknown) {
  const data = parse(seoKeywordUpdateSchema, input);
  if (data.cycleGoalId !== undefined) await assertCycleGoal(database, actor, data.cycleGoalId);
  const rows = await database.update(seoKeyword).set({
    ...(data.keyword !== undefined && { keyword: data.keyword }),
    ...(data.intent !== undefined && { intent: data.intent }),
    ...(data.cycleGoalId !== undefined && { cycleGoalId: data.cycleGoalId ?? null }),
    updatedAt: new Date(),
  }).where(and(eq(seoKeyword.workspaceId, actor.workspaceId), eq(seoKeyword.id, id(keywordId)))).returning();
  if (!rows[0]) throw new StrategyError('SEO keyword not found.', 404);
  return serializeSeoKeyword(rows[0]);
}

export async function deleteSeoKeyword(database: PostgresDatabase, actor: WorkspaceActor, keywordId: string) {
  const rows = await database.delete(seoKeyword).where(and(eq(seoKeyword.workspaceId, actor.workspaceId), eq(seoKeyword.id, id(keywordId)))).returning({ id: seoKeyword.id });
  if (!rows[0]) throw new StrategyError('SEO keyword not found.', 404);
  return { id: rows[0].id, deleted: true as const };
}

export async function listFeedback(database: PostgresDatabase, actor: WorkspaceActor, query: Record<string, unknown> = {}) {
  const filters = z.object({
    source: z.enum(['Discord', 'Twitter', 'Email']).optional(),
    sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  }).safeParse(query);
  if (!filters.success) throw new StrategyError('Feedback filters are invalid.', 400);
  const rows = await database.select().from(feedback).where(and(
    eq(feedback.workspaceId, actor.workspaceId),
    filters.data.source ? eq(feedback.source, filters.data.source) : undefined,
    filters.data.sentiment ? eq(feedback.sentiment, filters.data.sentiment) : undefined,
  )).orderBy(desc(feedback.createdAt)).limit(filters.data.limit);
  return rows.map(serializeFeedback);
}

export async function getFeedback(database: PostgresDatabase, actor: WorkspaceActor, feedbackId: string) {
  const rows = await database.select().from(feedback).where(and(eq(feedback.workspaceId, actor.workspaceId), eq(feedback.id, id(feedbackId)))).limit(1);
  if (!rows[0]) throw new StrategyError('Feedback not found.', 404);
  return serializeFeedback(rows[0]);
}

export async function createFeedback(database: PostgresDatabase, actor: WorkspaceActor, input: unknown) {
  const data = parse(feedbackCreateSchema, input);
  const rows = await database.insert(feedback).values({
    workspaceId: actor.workspaceId,
    createdByUserId: actor.userId,
    ...data,
  }).returning();
  return serializeFeedback(rows[0]);
}

export async function updateFeedback(database: PostgresDatabase, actor: WorkspaceActor, feedbackId: string, input: unknown) {
  const data = parse(feedbackUpdateSchema, input);
  const rows = await database.update(feedback).set({ ...data, updatedAt: new Date() }).where(and(
    eq(feedback.workspaceId, actor.workspaceId), eq(feedback.id, id(feedbackId)),
  )).returning();
  if (!rows[0]) throw new StrategyError('Feedback not found.', 404);
  return serializeFeedback(rows[0]);
}

export async function deleteFeedback(database: PostgresDatabase, actor: WorkspaceActor, feedbackId: string) {
  const rows = await database.delete(feedback).where(and(eq(feedback.workspaceId, actor.workspaceId), eq(feedback.id, id(feedbackId)))).returning({ id: feedback.id });
  if (!rows[0]) throw new StrategyError('Feedback not found.', 404);
  return { id: rows[0].id, deleted: true as const };
}

export async function listTimeBlocks(database: PostgresDatabase, actor: WorkspaceActor, query: Record<string, unknown> = {}) {
  const filters = z.object({
    type: z.enum(['strategic', 'buffer', 'breakout']).optional(),
    dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  }).safeParse(query);
  if (!filters.success) throw new StrategyError('Time block filters are invalid.', 400);
  const rows = await database.select().from(timeBlock).where(and(
    eq(timeBlock.workspaceId, actor.workspaceId),
    filters.data.type ? eq(timeBlock.type, filters.data.type) : undefined,
    filters.data.dayOfWeek !== undefined ? eq(timeBlock.dayOfWeek, filters.data.dayOfWeek) : undefined,
  )).orderBy(asc(timeBlock.dayOfWeek), asc(timeBlock.startTime)).limit(filters.data.limit);
  return rows.map(serializeTimeBlock);
}

export async function getTimeBlock(database: PostgresDatabase, actor: WorkspaceActor, timeBlockId: string) {
  const rows = await database.select().from(timeBlock).where(and(eq(timeBlock.workspaceId, actor.workspaceId), eq(timeBlock.id, id(timeBlockId)))).limit(1);
  if (!rows[0]) throw new StrategyError('Time block not found.', 404);
  return serializeTimeBlock(rows[0]);
}

export async function createTimeBlock(database: PostgresDatabase, actor: WorkspaceActor, input: unknown) {
  const data = parse(timeBlockCreateSchema, input);
  const rows = await database.insert(timeBlock).values({
    workspaceId: actor.workspaceId,
    createdByUserId: actor.userId,
    ...data,
  }).returning();
  return serializeTimeBlock(rows[0]);
}

export async function updateTimeBlock(database: PostgresDatabase, actor: WorkspaceActor, timeBlockId: string, input: unknown) {
  const data = parse(timeBlockUpdateSchema, input);
  const rows = await database.update(timeBlock).set({ ...data, updatedAt: new Date() }).where(and(
    eq(timeBlock.workspaceId, actor.workspaceId), eq(timeBlock.id, id(timeBlockId)),
  )).returning();
  if (!rows[0]) throw new StrategyError('Time block not found.', 404);
  return serializeTimeBlock(rows[0]);
}

export async function deleteTimeBlock(database: PostgresDatabase, actor: WorkspaceActor, timeBlockId: string) {
  const rows = await database.delete(timeBlock).where(and(eq(timeBlock.workspaceId, actor.workspaceId), eq(timeBlock.id, id(timeBlockId)))).returning({ id: timeBlock.id });
  if (!rows[0]) throw new StrategyError('Time block not found.', 404);
  return { id: rows[0].id, deleted: true as const };
}

export async function listWeekMarkers(database: PostgresDatabase, actor: WorkspaceActor, _query: Record<string, unknown> = {}) {
  const rows = await database.select().from(weekMarker).where(eq(weekMarker.workspaceId, actor.workspaceId)).orderBy(asc(weekMarker.weekNumber));
  return rows.map(serializeWeekMarker);
}

export async function getWeekMarker(database: PostgresDatabase, actor: WorkspaceActor, markerId: string) {
  const rows = await database.select().from(weekMarker).where(and(eq(weekMarker.workspaceId, actor.workspaceId), eq(weekMarker.id, id(markerId)))).limit(1);
  if (!rows[0]) throw new StrategyError('Week marker not found.', 404);
  return serializeWeekMarker(rows[0]);
}

async function clearOtherActiveWeeks(database: PostgresDatabase, actor: WorkspaceActor, currentId?: string) {
  await database.update(weekMarker).set({ status: 'completed', endedAt: new Date(), updatedAt: new Date() }).where(and(
    eq(weekMarker.workspaceId, actor.workspaceId),
    eq(weekMarker.status, 'active'),
    currentId ? ne(weekMarker.id, currentId) : undefined,
  ));
}

export async function createWeekMarker(database: PostgresDatabase, actor: WorkspaceActor, input: unknown) {
  const data = parse(weekMarkerCreateSchema, input);
  if (data.status === 'active') await clearOtherActiveWeeks(database, actor);
  try {
    const rows = await database.insert(weekMarker).values({
      workspaceId: actor.workspaceId,
      createdByUserId: actor.userId,
      weekNumber: data.weekNumber,
      status: data.status,
      startedAt: new Date(data.startedAt),
      endedAt: asDate(data.endedAt),
    }).returning();
    return serializeWeekMarker(rows[0]);
  } catch (error) {
    if (postgresErrorCode(error) === '23505') throw new StrategyError('That week already has a marker in this workspace.', 409);
    throw error;
  }
}

export async function updateWeekMarker(database: PostgresDatabase, actor: WorkspaceActor, markerId: string, input: unknown) {
  const data = parse(weekMarkerUpdateSchema, input);
  const parsedId = id(markerId);
  if (data.status === 'active') await clearOtherActiveWeeks(database, actor, parsedId);
  const rows = await database.update(weekMarker).set({
    ...(data.weekNumber !== undefined && { weekNumber: data.weekNumber }),
    ...(data.status !== undefined && { status: data.status }),
    ...(data.startedAt !== undefined && { startedAt: new Date(data.startedAt) }),
    ...(data.endedAt !== undefined && { endedAt: asDate(data.endedAt) }),
    updatedAt: new Date(),
  }).where(and(eq(weekMarker.workspaceId, actor.workspaceId), eq(weekMarker.id, parsedId))).returning();
  if (!rows[0]) throw new StrategyError('Week marker not found.', 404);
  return serializeWeekMarker(rows[0]);
}

export async function deleteWeekMarker(database: PostgresDatabase, actor: WorkspaceActor, markerId: string) {
  const rows = await database.delete(weekMarker).where(and(eq(weekMarker.workspaceId, actor.workspaceId), eq(weekMarker.id, id(markerId)))).returning({ id: weekMarker.id });
  if (!rows[0]) throw new StrategyError('Week marker not found.', 404);
  return { id: rows[0].id, deleted: true as const };
}

export async function upsertChatReadState(database: PostgresDatabase, actor: WorkspaceActor, input: unknown) {
  const data = parse(readStateSchema, input);
  const now = new Date();
  const rows = await database.insert(chatReadState).values({
    workspaceId: actor.workspaceId,
    channelId: data.channelId,
    userId: actor.userId,
    lastReadAt: new Date(data.lastReadAt),
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [chatReadState.workspaceId, chatReadState.channelId, chatReadState.userId],
    set: { lastReadAt: new Date(data.lastReadAt), updatedAt: now },
  }).returning();
  return {
    id: rows[0].id,
    channelId: rows[0].channelId,
    userId: rows[0].userId,
    lastReadAt: rows[0].lastReadAt.toISOString(),
    companyId: rows[0].workspaceId,
  };
}

export async function listChatReadStates(database: PostgresDatabase, actor: WorkspaceActor) {
  const rows = await database.select().from(chatReadState).where(and(
    eq(chatReadState.workspaceId, actor.workspaceId), eq(chatReadState.userId, actor.userId),
  ));
  return rows.map((row) => ({
    id: row.id,
    channelId: row.channelId,
    userId: row.userId,
    lastReadAt: row.lastReadAt.toISOString(),
    companyId: row.workspaceId,
  }));
}

export async function getNotificationReadState(database: PostgresDatabase, actor: WorkspaceActor) {
  const rows = await database.select().from(notificationReadState).where(and(
    eq(notificationReadState.workspaceId, actor.workspaceId), eq(notificationReadState.userId, actor.userId),
  )).limit(1);
  if (!rows[0]) return null;
  return { userId: rows[0].userId, lastReadAt: rows[0].lastReadAt.toISOString(), companyId: rows[0].workspaceId };
}

export async function upsertNotificationReadState(database: PostgresDatabase, actor: WorkspaceActor, input: unknown) {
  const data = parse(notificationReadStateSchema, input);
  const now = new Date();
  const rows = await database.insert(notificationReadState).values({
    workspaceId: actor.workspaceId,
    userId: actor.userId,
    lastReadAt: new Date(data.lastReadAt),
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [notificationReadState.workspaceId, notificationReadState.userId],
    set: { lastReadAt: new Date(data.lastReadAt), updatedAt: now },
  }).returning();
  return { userId: rows[0].userId, lastReadAt: rows[0].lastReadAt.toISOString(), companyId: rows[0].workspaceId };
}
