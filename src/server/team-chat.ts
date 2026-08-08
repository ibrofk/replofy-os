import { and, desc, eq, gte, ilike, inArray, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { postgresErrorCode } from './db/errors.js';
import type { WorkspaceRepository as PostgresDatabase } from './platform/workspace-repository.js';
import {
  teamChatChannel,
  teamChatChannelParticipant,
  teamChatMessage,
  teamChatParticipant,
  workspaceMembership,
} from './db/schema.js';
import type { WorkspaceActor } from './execution/tasks.js';

const idSchema = z.string().uuid();
const channelCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  topic: z.string().trim().max(500).default(''),
  status: z.enum(['active', 'archived']).default('active'),
  participantIds: z.array(idSchema).max(200).default([]),
});
const channelUpdateSchema = channelCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field is required.',
);
const participantCreateSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  participantType: z.enum(['team-member', 'ai-agent']).default('ai-agent'),
  linkedUserId: z.string().min(1).nullable().optional(),
  description: z.string().trim().max(500).default(''),
  status: z.enum(['active', 'inactive']).default('active'),
});
const participantUpdateSchema = participantCreateSchema
  .omit({ participantType: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');
const messageCreateSchema = z.object({
  channelId: idSchema,
  participantId: idSchema,
  content: z.string().min(1).max(8_000),
  replyToMessageId: idSchema.nullable().optional(),
});

export class TeamChatError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'TeamChatError';
  }
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new TeamChatError(parsed.error.issues[0]?.message || 'Invalid input.', 400);
  return parsed.data;
}

function serializeChannel(row: typeof teamChatChannel.$inferSelect, participantIds: string[]) {
  return {
    id: row.id,
    name: row.name,
    topic: row.topic,
    status: row.status,
    participantIds,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

function serializeParticipant(row: typeof teamChatParticipant.$inferSelect) {
  return {
    id: row.id,
    displayName: row.displayName,
    participantType: row.participantType,
    linkedUserId: row.linkedUserId,
    description: row.description,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

function serializeMessage(row: typeof teamChatMessage.$inferSelect) {
  return {
    id: row.id,
    channelId: row.channelId,
    participantId: row.participantId,
    participantType: row.participantType,
    senderName: row.senderName,
    content: row.content,
    replyToMessageId: row.replyToMessageId,
    createdAt: row.createdAt.toISOString(),
    authorId: row.createdByUserId,
    companyId: row.workspaceId,
  };
}

async function assertParticipants(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  participantIds: string[],
) {
  const unique = [...new Set(participantIds)];
  if (unique.length === 0) return unique;
  const rows = await database
    .select({ id: teamChatParticipant.id })
    .from(teamChatParticipant)
    .where(and(
      eq(teamChatParticipant.workspaceId, actor.workspaceId),
      inArray(teamChatParticipant.id, unique),
    ));
  if (rows.length !== unique.length) {
    throw new TeamChatError('One or more participants are unavailable in this workspace.', 422);
  }
  return unique;
}

async function participantIdsForChannels(
  database: PostgresDatabase,
  workspaceId: string,
  channelIds: string[],
) {
  const grouped = new Map<string, string[]>();
  if (channelIds.length === 0) return grouped;
  const rows = await database
    .select({
      channelId: teamChatChannelParticipant.channelId,
      participantId: teamChatChannelParticipant.participantId,
    })
    .from(teamChatChannelParticipant)
    .where(and(
      eq(teamChatChannelParticipant.workspaceId, workspaceId),
      inArray(teamChatChannelParticipant.channelId, channelIds),
    ));
  for (const row of rows) {
    grouped.set(row.channelId, [...(grouped.get(row.channelId) || []), row.participantId]);
  }
  return grouped;
}

export async function listTeamChatChannels(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  query: Record<string, unknown>,
) {
  const status = z.enum(['active', 'archived']).optional().safeParse(query.status);
  if (!status.success) throw new TeamChatError('status is invalid.', 400);
  const rows = await database
    .select()
    .from(teamChatChannel)
    .where(and(
      eq(teamChatChannel.workspaceId, actor.workspaceId),
      status.data ? eq(teamChatChannel.status, status.data) : undefined,
    ))
    .orderBy(desc(teamChatChannel.updatedAt))
    .limit(100);
  const memberships = await participantIdsForChannels(database, actor.workspaceId, rows.map((row) => row.id));
  return rows.map((row) => serializeChannel(row, memberships.get(row.id) || []));
}

export async function createTeamChatChannel(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  input: unknown,
) {
  const data = parse(channelCreateSchema, input);
  const participantIds = await assertParticipants(database, actor, data.participantIds);
  return database.transaction(async (transaction) => {
    const rows = await transaction
      .insert(teamChatChannel)
      .values({
        workspaceId: actor.workspaceId,
        createdByUserId: actor.userId,
        name: data.name,
        topic: data.topic,
        status: data.status,
      })
      .returning();
    if (participantIds.length > 0) {
      await transaction.insert(teamChatChannelParticipant).values(
        participantIds.map((participantId) => ({
          workspaceId: actor.workspaceId,
          channelId: rows[0].id,
          participantId,
        })),
      );
    }
    return serializeChannel(rows[0], participantIds);
  });
}

export async function updateTeamChatChannel(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  channelId: string,
  input: unknown,
) {
  const id = parse(idSchema, channelId);
  const data = parse(channelUpdateSchema, input);
  const participantIds = data.participantIds
    ? await assertParticipants(database, actor, data.participantIds)
    : null;
  return database.transaction(async (transaction) => {
    const rows = await transaction
      .update(teamChatChannel)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.topic !== undefined && { topic: data.topic }),
        ...(data.status !== undefined && { status: data.status }),
        updatedAt: new Date(),
      })
      .where(and(eq(teamChatChannel.id, id), eq(teamChatChannel.workspaceId, actor.workspaceId)))
      .returning();
    if (!rows[0]) throw new TeamChatError('Channel not found.', 404);
    if (participantIds) {
      await transaction
        .delete(teamChatChannelParticipant)
        .where(and(
          eq(teamChatChannelParticipant.workspaceId, actor.workspaceId),
          eq(teamChatChannelParticipant.channelId, id),
        ));
      if (participantIds.length > 0) {
        await transaction.insert(teamChatChannelParticipant).values(
          participantIds.map((participantId) => ({
            workspaceId: actor.workspaceId,
            channelId: id,
            participantId,
          })),
        );
      }
    }
    const currentIds = participantIds ?? (await transaction
      .select({ participantId: teamChatChannelParticipant.participantId })
      .from(teamChatChannelParticipant)
      .where(and(
        eq(teamChatChannelParticipant.workspaceId, actor.workspaceId),
        eq(teamChatChannelParticipant.channelId, id),
      ))).map((row) => row.participantId);
    return serializeChannel(rows[0], currentIds);
  });
}

export async function deleteTeamChatChannel(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  channelId: string,
) {
  const id = parse(idSchema, channelId);
  try {
    const rows = await database
      .delete(teamChatChannel)
      .where(and(eq(teamChatChannel.id, id), eq(teamChatChannel.workspaceId, actor.workspaceId)))
      .returning({ id: teamChatChannel.id });
    if (!rows[0]) throw new TeamChatError('Channel not found.', 404);
    return { id: rows[0].id, deleted: true as const };
  } catch (error) {
    if (postgresErrorCode(error) === '23503') {
      throw new TeamChatError('Channels with message history cannot be deleted; archive them instead.', 409);
    }
    throw error;
  }
}

export async function addTeamChatParticipantToChannel(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  channelId: string,
  input: unknown,
) {
  const id = parse(idSchema, channelId);
  const data = parse(z.object({ participantId: idSchema }), input);
  const channels = await database
    .select()
    .from(teamChatChannel)
    .where(and(eq(teamChatChannel.id, id), eq(teamChatChannel.workspaceId, actor.workspaceId)))
    .limit(1);
  if (!channels[0]) throw new TeamChatError('Channel not found.', 404);
  if (channels[0].status !== 'active') throw new TeamChatError('Participants can only be added to active channels.', 400);
  await assertParticipants(database, actor, [data.participantId]);
  await database
    .insert(teamChatChannelParticipant)
    .values({ workspaceId: actor.workspaceId, channelId: id, participantId: data.participantId })
    .onConflictDoNothing();
  const ids = await participantIdsForChannels(database, actor.workspaceId, [id]);
  return { data: serializeChannel(channels[0], ids.get(id) || []) };
}

export async function listTeamChatParticipants(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  query: Record<string, unknown>,
) {
  const type = z.enum(['team-member', 'ai-agent']).optional().safeParse(query.participantType);
  const status = z.enum(['active', 'inactive']).optional().safeParse(query.status);
  if (!type.success || !status.success) throw new TeamChatError('Participant filters are invalid.', 400);
  const rows = await database
    .select()
    .from(teamChatParticipant)
    .where(and(
      eq(teamChatParticipant.workspaceId, actor.workspaceId),
      type.data ? eq(teamChatParticipant.participantType, type.data) : undefined,
      status.data ? eq(teamChatParticipant.status, status.data) : undefined,
      typeof query.linkedUserId === 'string'
        ? eq(teamChatParticipant.linkedUserId, query.linkedUserId)
        : undefined,
    ))
    .orderBy(desc(teamChatParticipant.updatedAt))
    .limit(100);
  return rows.map(serializeParticipant);
}

export async function createTeamChatParticipant(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  input: unknown,
) {
  const data = parse(participantCreateSchema, input);
  const linkedUserId = data.participantType === 'team-member'
    ? data.linkedUserId ?? actor.userId
    : null;
  if (linkedUserId) {
    const memberships = await database
      .select({ userId: workspaceMembership.userId })
      .from(workspaceMembership)
      .where(and(
        eq(workspaceMembership.workspaceId, actor.workspaceId),
        eq(workspaceMembership.userId, linkedUserId),
      ))
      .limit(1);
    if (!memberships[0]) throw new TeamChatError('linkedUserId must be a workspace member.', 422);
  }
  const rows = await database
    .insert(teamChatParticipant)
    .values({
      workspaceId: actor.workspaceId,
      createdByUserId: actor.userId,
      displayName: data.displayName,
      participantType: data.participantType,
      linkedUserId,
      description: data.description,
      status: data.status,
    })
    .returning();
  return serializeParticipant(rows[0]);
}

export async function updateTeamChatParticipant(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  participantId: string,
  input: unknown,
) {
  const id = parse(idSchema, participantId);
  const data = parse(participantUpdateSchema, input);
  if (data.linkedUserId) {
    const memberships = await database
      .select({ userId: workspaceMembership.userId })
      .from(workspaceMembership)
      .where(and(
        eq(workspaceMembership.workspaceId, actor.workspaceId),
        eq(workspaceMembership.userId, data.linkedUserId),
      ))
      .limit(1);
    if (!memberships[0]) throw new TeamChatError('linkedUserId must be a workspace member.', 422);
  }
  const rows = await database
    .update(teamChatParticipant)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(teamChatParticipant.id, id), eq(teamChatParticipant.workspaceId, actor.workspaceId)))
    .returning();
  if (!rows[0]) throw new TeamChatError('Participant not found.', 404);
  return serializeParticipant(rows[0]);
}

export async function deleteTeamChatParticipant(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  participantId: string,
) {
  const id = parse(idSchema, participantId);
  try {
    const rows = await database
      .delete(teamChatParticipant)
      .where(and(eq(teamChatParticipant.id, id), eq(teamChatParticipant.workspaceId, actor.workspaceId)))
      .returning({ id: teamChatParticipant.id });
    if (!rows[0]) throw new TeamChatError('Participant not found.', 404);
    return { id: rows[0].id, deleted: true as const };
  } catch (error) {
    if (postgresErrorCode(error) === '23503') {
      throw new TeamChatError('Participants with message history cannot be deleted; deactivate them instead.', 409);
    }
    throw error;
  }
}

export async function createTeamChatMessage(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  input: unknown,
) {
  const data = parse(messageCreateSchema, input);
  const memberships = await database
    .select({
      participantType: teamChatParticipant.participantType,
      senderName: teamChatParticipant.displayName,
      participantStatus: teamChatParticipant.status,
      channelStatus: teamChatChannel.status,
    })
    .from(teamChatChannelParticipant)
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
      eq(teamChatChannelParticipant.channelId, data.channelId),
      eq(teamChatChannelParticipant.participantId, data.participantId),
    ))
    .limit(1);
  const membership = memberships[0];
  if (!membership) throw new TeamChatError('Participant must be assigned to the channel before posting.', 400);
  if (membership.channelStatus !== 'active' || membership.participantStatus !== 'active') {
    throw new TeamChatError('Channel and participant must both be active.', 400);
  }
  if (data.replyToMessageId) {
    const replies = await database
      .select({ channelId: teamChatMessage.channelId })
      .from(teamChatMessage)
      .where(and(
        eq(teamChatMessage.workspaceId, actor.workspaceId),
        eq(teamChatMessage.id, data.replyToMessageId),
      ))
      .limit(1);
    if (!replies[0] || replies[0].channelId !== data.channelId) {
      throw new TeamChatError('replyToMessageId must belong to the same channel.', 400);
    }
  }
  const rows = await database
    .insert(teamChatMessage)
    .values({
      workspaceId: actor.workspaceId,
      channelId: data.channelId,
      participantId: data.participantId,
      participantType: membership.participantType,
      senderName: membership.senderName,
      content: data.content,
      replyToMessageId: data.replyToMessageId ?? null,
      createdByUserId: actor.userId,
    })
    .returning();
  return serializeMessage(rows[0]);
}

export async function listTeamChatMessages(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  query: Record<string, unknown>,
) {
  const limitResult = z.coerce.number().int().min(1).max(200).default(50).safeParse(query.limit);
  if (!limitResult.success) throw new TeamChatError('limit must be between 1 and 200.', 400);
  const channelId = idSchema.optional().safeParse(query.channelId);
  const participantId = idSchema.optional().safeParse(query.participantId);
  const participantType = z.enum(['team-member', 'ai-agent']).optional().safeParse(query.participantType);
  if (!channelId.success || !participantId.success || !participantType.success) {
    throw new TeamChatError('Message filters are invalid.', 400);
  }
  const after = typeof query.after === 'string' ? new Date(query.after) : null;
  const before = typeof query.before === 'string' ? new Date(query.before) : null;
  if ((after && Number.isNaN(after.valueOf())) || (before && Number.isNaN(before.valueOf()))) {
    throw new TeamChatError('after and before must be valid ISO-8601 strings.', 400);
  }
  if (after && before && after >= before) throw new TeamChatError('after must be earlier than before.', 400);
  const textQuery = typeof query.query === 'string' ? query.query.trim() : '';
  const rows = await database
    .select()
    .from(teamChatMessage)
    .where(and(
      eq(teamChatMessage.workspaceId, actor.workspaceId),
      channelId.data ? eq(teamChatMessage.channelId, channelId.data) : undefined,
      participantId.data ? eq(teamChatMessage.participantId, participantId.data) : undefined,
      participantType.data ? eq(teamChatMessage.participantType, participantType.data) : undefined,
      typeof query.senderName === 'string' ? eq(teamChatMessage.senderName, query.senderName) : undefined,
      after ? gte(teamChatMessage.createdAt, after) : undefined,
      before ? lte(teamChatMessage.createdAt, before) : undefined,
      textQuery ? or(
        ilike(teamChatMessage.senderName, `%${textQuery}%`),
        ilike(teamChatMessage.content, `%${textQuery}%`),
      ) : undefined,
    ))
    .orderBy(desc(teamChatMessage.createdAt))
    .limit(limitResult.data + 1);
  const hasMore = rows.length > limitResult.data;
  const page = rows.slice(0, limitResult.data);
  return {
    data: page.map(serializeMessage),
    count: page.length,
    hasMore,
    nextBefore: hasMore ? page.at(-1)?.createdAt.toISOString() ?? null : null,
  };
}
