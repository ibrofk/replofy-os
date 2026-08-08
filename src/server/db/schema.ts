import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const timestampColumns = {
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
};

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  ...timestampColumns,
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    activeWorkspaceId: uuid('active_workspace_id'),
    ...timestampColumns,
  },
  (table) => [index('session_user_id_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { mode: 'date', withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { mode: 'date', withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    ...timestampColumns,
  },
  (table) => [
    index('account_user_id_idx').on(table.userId),
    uniqueIndex('account_provider_account_uidx').on(table.providerId, table.accountId),
  ],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }).notNull(),
    ...timestampColumns,
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const workspaceRole = pgEnum('workspace_role', ['owner', 'admin', 'member']);
export const invitationStatus = pgEnum('invitation_status', ['pending', 'accepted', 'rejected', 'expired']);

export const workspace = pgTable('workspace', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  ...timestampColumns,
});

export const workspaceMembership = pgTable(
  'workspace_membership',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: workspaceRole('role').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index('workspace_membership_user_id_idx').on(table.userId),
  ],
);

export const workspaceInvitation = pgTable(
  'workspace_invitation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: workspaceRole('role').notNull(),
    status: invitationStatus('status').notNull().default('pending'),
    tokenHash: text('token_hash').notNull().unique(),
    invitedByUserId: text('invited_by_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }).notNull(),
    acceptedByUserId: text('accepted_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    ...timestampColumns,
  },
  (table) => [
    index('workspace_invitation_workspace_idx').on(table.workspaceId),
    index('workspace_invitation_email_idx').on(table.email),
  ],
);

export const standaloneApiKey = pgTable(
  'standalone_api_key',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    prefix: text('prefix').notNull(),
    keyHash: text('key_hash').notNull().unique(),
    scopes: text('scopes').array().notNull(),
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { mode: 'date', withTimezone: true }),
    revokedAt: timestamp('revoked_at', { mode: 'date', withTimezone: true }),
    ...timestampColumns,
  },
  (table) => [
    index('standalone_api_key_workspace_idx').on(table.workspaceId),
    index('standalone_api_key_owner_idx').on(table.ownerUserId),
    foreignKey({
      columns: [table.workspaceId, table.ownerUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'standalone_api_key_owner_membership_fk',
    }).onDelete('cascade'),
  ],
);

export const instanceBootstrap = pgTable('instance_bootstrap', {
  id: text('id').primaryKey(),
  completedAt: timestamp('completed_at', { mode: 'date', withTimezone: true }).notNull(),
  completedByUserId: text('completed_by_user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' }),
});

export const taskStatus = pgEnum('task_status', ['todo', 'in-progress', 'done', 'icebox']);
export const cycleGoalStatus = pgEnum('cycle_goal_status', ['active', 'completed', 'archived']);

export type SourceLineageData = {
  sourceIds?: string[];
  sourceVersionIds?: string[];
  sourceKey?: string;
  sourceTitle?: string;
  sourceVersion?: number;
  sourceUpdatedAt?: string;
  aliases?: string[];
  matchKey?: string;
};

export const cycleGoal = pgTable(
  'cycle_goal',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    createdByUserId: text('created_by_user_id').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    status: cycleGoalStatus('status').notNull().default('active'),
    sourceLineage: jsonb('source_lineage').$type<SourceLineageData>().notNull().default({}),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('cycle_goal_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('cycle_goal_workspace_created_idx').on(table.workspaceId, table.createdAt),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'cycle_goal_creator_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const vision = pgTable(
  'vision',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    createdByUserId: text('created_by_user_id').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    focusItems: text('focus_items').array().notNull().default(sql`'{}'::text[]`),
    sourceLineage: jsonb('source_lineage').$type<SourceLineageData>().notNull().default({}),
    ...timestampColumns,
  },
  (table) => [
    index('vision_workspace_created_idx').on(table.workspaceId, table.createdAt),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'vision_creator_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const prompt = pgTable(
  'prompt',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    version: text('version').notNull().default('v1.0'),
    content: text('content').notNull(),
    sourceLineage: jsonb('source_lineage').$type<SourceLineageData>().notNull().default({}),
    createdByUserId: text('created_by_user_id').notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('prompt_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('prompt_workspace_created_idx').on(table.workspaceId, table.createdAt),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'prompt_creator_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const socialPostPlatform = pgEnum('social_post_platform', ['Twitter', 'LinkedIn', 'Loom']);
export const socialPostStatus = pgEnum('social_post_status', ['draft', 'scheduled', 'published']);
export const socialPost = pgTable(
  'social_post',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    platform: socialPostPlatform('platform').notNull().default('Twitter'),
    content: text('content').notNull(),
    scheduledFor: timestamp('scheduled_for', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
    status: socialPostStatus('status').notNull().default('scheduled'),
    sourceLineage: jsonb('source_lineage').$type<SourceLineageData>().notNull().default({}),
    createdByUserId: text('created_by_user_id').notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('social_post_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('social_post_workspace_scheduled_idx').on(table.workspaceId, table.scheduledFor),
    index('social_post_workspace_status_idx').on(table.workspaceId, table.status),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'social_post_creator_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const seoKeywordIntent = pgEnum('seo_keyword_intent', ['high', 'medium', 'low']);
export const seoKeyword = pgTable(
  'seo_keyword',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    keyword: text('keyword').notNull(),
    intent: seoKeywordIntent('intent').notNull().default('high'),
    cycleGoalId: uuid('cycle_goal_id'),
    createdByUserId: text('created_by_user_id').notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('seo_keyword_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('seo_keyword_workspace_created_idx').on(table.workspaceId, table.createdAt),
    index('seo_keyword_workspace_intent_idx').on(table.workspaceId, table.intent),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'seo_keyword_creator_membership_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.workspaceId, table.cycleGoalId],
      foreignColumns: [cycleGoal.workspaceId, cycleGoal.id],
      name: 'seo_keyword_cycle_goal_workspace_fk',
    }).onDelete('set null'),
  ],
);

export const feedbackSource = pgEnum('feedback_source', ['Discord', 'Twitter', 'Email']);
export const feedbackSentiment = pgEnum('feedback_sentiment', ['positive', 'neutral', 'negative']);
export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    source: feedbackSource('source').notNull().default('Email'),
    content: text('content').notNull(),
    sentiment: feedbackSentiment('sentiment').notNull().default('neutral'),
    sourceLineage: jsonb('source_lineage').$type<SourceLineageData>().notNull().default({}),
    createdByUserId: text('created_by_user_id').notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('feedback_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('feedback_workspace_created_idx').on(table.workspaceId, table.createdAt),
    index('feedback_workspace_sentiment_idx').on(table.workspaceId, table.sentiment),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'feedback_creator_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const timeBlockType = pgEnum('time_block_type', ['strategic', 'buffer', 'breakout']);
export const timeBlock = pgTable(
  'time_block',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    type: timeBlockType('type').notNull().default('strategic'),
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
    dayOfWeek: integer('day_of_week').notNull().default(1),
    createdByUserId: text('created_by_user_id').notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('time_block_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('time_block_workspace_day_start_idx').on(table.workspaceId, table.dayOfWeek, table.startTime),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'time_block_creator_membership_fk',
    }).onDelete('restrict'),
    check('time_block_day_of_week_check', sql`${table.dayOfWeek} between 0 and 6`),
  ],
);

export const weekMarkerStatus = pgEnum('week_marker_status', ['active', 'completed', 'upcoming']);
export const weekMarker = pgTable(
  'week_marker',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    weekNumber: integer('week_number').notNull(),
    status: weekMarkerStatus('status').notNull().default('upcoming'),
    startedAt: timestamp('started_at', { mode: 'date', withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { mode: 'date', withTimezone: true }),
    createdByUserId: text('created_by_user_id').notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('week_marker_workspace_week_uidx').on(table.workspaceId, table.weekNumber),
    index('week_marker_workspace_status_idx').on(table.workspaceId, table.status),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'week_marker_creator_membership_fk',
    }).onDelete('restrict'),
    check('week_marker_week_number_check', sql`${table.weekNumber} between 1 and 12`),
  ],
);

export const task = pgTable(
  'task',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    createdByUserId: text('created_by_user_id').notNull(),
    title: text('title').notNull(),
    status: taskStatus('status').notNull(),
    effortPoints: integer('effort_points').notNull().default(1),
    isLeadIndicator: boolean('is_lead_indicator').notNull().default(false),
    cycleGoalId: uuid('cycle_goal_id'),
    assigneeUserId: text('assignee_user_id'),
    completedAt: timestamp('completed_at', { mode: 'date', withTimezone: true }),
    executionNotes: text('execution_notes').notNull().default(''),
    sourceLineage: jsonb('source_lineage').$type<SourceLineageData>().notNull().default({}),
    ...timestampColumns,
  },
  (table) => [
    index('task_workspace_created_idx').on(table.workspaceId, table.createdAt),
    index('task_workspace_status_idx').on(table.workspaceId, table.status),
    index('task_workspace_cycle_goal_idx').on(table.workspaceId, table.cycleGoalId),
    check('task_effort_points_check', sql`${table.effortPoints} in (1, 2, 3, 5, 8)`),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'task_creator_membership_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.workspaceId, table.assigneeUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'task_assignee_membership_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.workspaceId, table.cycleGoalId],
      foreignColumns: [cycleGoal.workspaceId, cycleGoal.id],
      name: 'task_cycle_goal_workspace_fk',
    }).onDelete('restrict'),
  ],
);

export const teamChatChannelStatus = pgEnum('team_chat_channel_status', ['active', 'archived']);
export const teamChatParticipantType = pgEnum('team_chat_participant_type', ['team-member', 'ai-agent']);
export const teamChatParticipantStatus = pgEnum('team_chat_participant_status', ['active', 'inactive']);

export const teamChatChannel = pgTable(
  'team_chat_channel',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    topic: text('topic').notNull().default(''),
    status: teamChatChannelStatus('status').notNull().default('active'),
    createdByUserId: text('created_by_user_id').notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('team_chat_channel_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('team_chat_channel_workspace_updated_idx').on(table.workspaceId, table.updatedAt),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'team_chat_channel_creator_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const teamChatParticipant = pgTable(
  'team_chat_participant',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    participantType: teamChatParticipantType('participant_type').notNull(),
    linkedUserId: text('linked_user_id').references(() => user.id, { onDelete: 'set null' }),
    description: text('description').notNull().default(''),
    status: teamChatParticipantStatus('status').notNull().default('active'),
    createdByUserId: text('created_by_user_id').notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('team_chat_participant_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('team_chat_participant_workspace_updated_idx').on(table.workspaceId, table.updatedAt),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'team_chat_participant_creator_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const teamChatChannelParticipant = pgTable(
  'team_chat_channel_participant',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id').notNull(),
    participantId: uuid('participant_id').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.channelId, table.participantId] }),
    foreignKey({
      columns: [table.workspaceId, table.channelId],
      foreignColumns: [teamChatChannel.workspaceId, teamChatChannel.id],
      name: 'team_chat_channel_participant_channel_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.workspaceId, table.participantId],
      foreignColumns: [teamChatParticipant.workspaceId, teamChatParticipant.id],
      name: 'team_chat_channel_participant_participant_fk',
    }).onDelete('cascade'),
  ],
);

export const teamChatMessage = pgTable(
  'team_chat_message',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id').notNull(),
    participantId: uuid('participant_id').notNull(),
    participantType: teamChatParticipantType('participant_type').notNull(),
    senderName: text('sender_name').notNull(),
    content: text('content').notNull(),
    replyToMessageId: uuid('reply_to_message_id'),
    createdByUserId: text('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('team_chat_message_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('team_chat_message_workspace_channel_created_idx').on(table.workspaceId, table.channelId, table.createdAt),
    foreignKey({
      columns: [table.workspaceId, table.channelId],
      foreignColumns: [teamChatChannel.workspaceId, teamChatChannel.id],
      name: 'team_chat_message_channel_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.workspaceId, table.participantId],
      foreignColumns: [teamChatParticipant.workspaceId, teamChatParticipant.id],
      name: 'team_chat_message_participant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'team_chat_message_creator_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const chatReadState = pgTable(
  'chat_read_state',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id').notNull(),
    userId: text('user_id').notNull(),
    lastReadAt: timestamp('last_read_at', { mode: 'date', withTimezone: true }).notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('chat_read_state_workspace_channel_user_uidx').on(table.workspaceId, table.channelId, table.userId),
    foreignKey({
      columns: [table.workspaceId, table.channelId],
      foreignColumns: [teamChatChannel.workspaceId, teamChatChannel.id],
      name: 'chat_read_state_channel_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.workspaceId, table.userId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'chat_read_state_user_membership_fk',
    }).onDelete('cascade'),
  ],
);

export const notificationReadState = pgTable(
  'notification_read_state',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    lastReadAt: timestamp('last_read_at', { mode: 'date', withTimezone: true }).notNull(),
    ...timestampColumns,
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    foreignKey({
      columns: [table.workspaceId, table.userId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'notification_read_state_user_membership_fk',
    }).onDelete('cascade'),
  ],
);

export const blogArticleStatus = pgEnum('blog_article_status', [
  'idea',
  'planned',
  'researching',
  'drafting',
  'review',
  'scheduled',
  'published',
  'archived',
  'rejected',
]);
export const blogRoadmapPhase = pgEnum('blog_roadmap_phase', ['now', 'next', 'later']);
export const blogPriority = pgEnum('blog_priority', ['low', 'medium', 'high']);

export const blogArticle = pgTable(
  'blog_article',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    summary: text('summary').notNull().default(''),
    content: text('content').notNull().default(''),
    status: blogArticleStatus('status').notNull().default('idea'),
    roadmapPhase: blogRoadmapPhase('roadmap_phase').notNull().default('next'),
    priority: blogPriority('priority').notNull().default('medium'),
    ownerUserId: text('owner_user_id').references(() => user.id, { onDelete: 'set null' }),
    targetPublishAt: timestamp('target_publish_at', { mode: 'date', withTimezone: true }),
    scheduledFor: timestamp('scheduled_for', { mode: 'date', withTimezone: true }),
    brief: jsonb('brief').$type<Record<string, unknown>>().notNull().default({}),
    evidence: jsonb('evidence').$type<Array<Record<string, unknown>>>().notNull().default([]),
    linkedSourceIds: text('linked_source_ids').array().notNull().default(sql`'{}'::text[]`),
    distribution: jsonb('distribution').$type<Record<string, unknown>>().notNull().default({}),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    dataPoints: text('data_points').array().notNull().default(sql`'{}'::text[]`),
    docLinks: text('doc_links').array().notNull().default(sql`'{}'::text[]`),
    validationNotes: text('validation_notes').array().notNull().default(sql`'{}'::text[]`),
    validatedAt: timestamp('validated_at', { mode: 'date', withTimezone: true }),
    publishedAt: timestamp('published_at', { mode: 'date', withTimezone: true }),
    rejectedAt: timestamp('rejected_at', { mode: 'date', withTimezone: true }),
    createdByUserId: text('created_by_user_id').notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('blog_article_workspace_slug_uidx').on(table.workspaceId, table.slug),
    uniqueIndex('blog_article_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('blog_article_workspace_status_updated_idx').on(table.workspaceId, table.status, table.updatedAt),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'blog_article_creator_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const creativePlatform = pgEnum('creative_platform', [
  'Instagram', 'LinkedIn', 'X', 'TikTok', 'YouTube', 'Blog', 'Email', 'Other',
]);
export const creativeFormat = pgEnum('creative_format', [
  'single-post', 'carousel', 'reel', 'story-sequence', 'motion-brief',
  'static-ad', 'thread', 'other',
]);
export const creativeStatus = pgEnum('creative_status', [
  'idea', 'brief', 'draft', 'in-review', 'changes-requested', 'approved',
  'scheduled', 'published', 'rejected', 'archived',
]);
export const creativeAssetType = pgEnum('creative_asset_type', [
  'image', 'video', 'document', 'source', 'other',
]);
export const creativeAssetStatus = pgEnum('creative_asset_status', [
  'uploading', 'active', 'archived', 'error',
]);

export const creativeItem = pgTable(
  'creative_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    platform: creativePlatform('platform').notNull().default('Instagram'),
    format: creativeFormat('format').notNull().default('single-post'),
    campaign: text('campaign').notNull().default(''),
    audience: text('audience').notNull().default(''),
    objective: text('objective').notNull().default(''),
    hook: text('hook').notNull().default(''),
    brief: text('brief').notNull().default(''),
    caption: text('caption').notNull().default(''),
    visualDirection: text('visual_direction').notNull().default(''),
    productionNotes: text('production_notes').notNull().default(''),
    cta: text('cta').notNull().default(''),
    status: creativeStatus('status').notNull().default('idea'),
    ownerUserId: text('owner_user_id').references(() => user.id, { onDelete: 'set null' }),
    approverUserId: text('approver_user_id').references(() => user.id, { onDelete: 'set null' }),
    targetPublishAt: timestamp('target_publish_at', { mode: 'date', withTimezone: true }),
    scheduledFor: timestamp('scheduled_for', { mode: 'date', withTimezone: true }),
    publishedAt: timestamp('published_at', { mode: 'date', withTimezone: true }),
    submittedAt: timestamp('submitted_at', { mode: 'date', withTimezone: true }),
    approvalNotes: text('approval_notes').notNull().default(''),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    sourceLineage: jsonb('source_lineage').$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: text('created_by_user_id').notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('creative_item_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('creative_item_workspace_status_updated_idx').on(table.workspaceId, table.status, table.updatedAt),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'creative_item_creator_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const creativeAsset = pgTable(
  'creative_asset',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    creativeId: uuid('creative_id').references(() => creativeItem.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSize: integer('file_size').notNull(),
    assetType: creativeAssetType('asset_type').notNull(),
    objectKey: text('object_key').notNull(),
    status: creativeAssetStatus('status').notNull().default('uploading'),
    uploadedAt: timestamp('uploaded_at', { mode: 'date', withTimezone: true }),
    createdByUserId: text('created_by_user_id').notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('creative_asset_workspace_id_id_uidx').on(table.workspaceId, table.id),
    uniqueIndex('creative_asset_workspace_object_key_uidx').on(table.workspaceId, table.objectKey),
    index('creative_asset_workspace_creative_status_idx').on(table.workspaceId, table.creativeId, table.status),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'creative_asset_creator_membership_fk',
    }).onDelete('restrict'),
    check('creative_asset_file_size_positive', sql`${table.fileSize} > 0`),
  ],
);

export const accountStatus = pgEnum('account_status', ['prospect', 'customer', 'partner', 'inactive']);
export const leadStage = pgEnum('lead_stage', [
  'new', 'qualified', 'contacted', 'demo-booked', 'proposal', 'won', 'lost',
]);
export const leadSource = pgEnum('lead_source', [
  'inbound', 'referral', 'cold-outreach', 'waitlist', 'twitter', 'linkedin', 'email', 'other',
]);
export const leadPriority = pgEnum('lead_priority', ['low', 'medium', 'high']);

export const growthAccount = pgTable(
  'growth_account',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    website: text('website').notNull().default(''),
    industry: text('industry').notNull().default(''),
    size: text('size').notNull().default(''),
    notes: text('notes').notNull().default(''),
    status: accountStatus('status').notNull().default('prospect'),
    sourceLineage: jsonb('source_lineage').$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: text('created_by_user_id').notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('account_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('account_workspace_status_updated_idx').on(table.workspaceId, table.status, table.updatedAt),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'account_creator_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const lead = pgTable(
  'lead',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email').notNull().default(''),
    companyName: text('company_name').notNull().default(''),
    accountId: uuid('account_id').references(() => growthAccount.id, { onDelete: 'set null' }),
    source: leadSource('source').notNull().default('inbound'),
    stage: leadStage('stage').notNull().default('new'),
    priority: leadPriority('priority').notNull().default('medium'),
    ownerUserId: text('owner_user_id').references(() => user.id, { onDelete: 'set null' }),
    nextAction: text('next_action').notNull().default(''),
    nextActionAt: timestamp('next_action_at', { mode: 'date', withTimezone: true }),
    notes: text('notes').notNull().default(''),
    linkedTaskIds: uuid('linked_task_ids').array().notNull().default(sql`'{}'::uuid[]`),
    sourceLineage: jsonb('source_lineage').$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: text('created_by_user_id').notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('lead_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('lead_workspace_stage_priority_updated_idx').on(table.workspaceId, table.stage, table.priority, table.updatedAt),
    index('lead_workspace_account_idx').on(table.workspaceId, table.accountId),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'lead_creator_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const bugSeverity = pgEnum('bug_severity', ['low', 'medium', 'high', 'critical']);
export const bugStatus = pgEnum('bug_status', ['open', 'triaged', 'in-progress', 'blocked', 'resolved', 'closed']);
export const roadmapPhase = pgEnum('roadmap_phase', ['now', 'next', 'later']);
export const roadmapPriority = pgEnum('roadmap_priority', ['low', 'medium', 'high']);
export const roadmapStatus = pgEnum('roadmap_status', ['planned', 'building', 'blocked', 'shipped']);

export const environmentName = pgEnum('environment_name', ['Local', 'Staging', 'Production']);
export const environmentStatus = pgEnum('environment_status', ['healthy', 'deploying', 'failed']);
export const apiEndpointMethod = pgEnum('api_endpoint_method', ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
export const apiEndpointStatus = pgEnum('api_endpoint_status', ['draft', 'active', 'deprecated']);
export const environmentDeploymentAction = pgEnum('environment_deployment_action', ['deploy', 'rollback']);
export const environmentDeploymentStatus = pgEnum('environment_deployment_status', ['succeeded', 'failed']);

export const environment = pgTable(
  'environment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    name: environmentName('name').notNull(),
    status: environmentStatus('status').notNull().default('healthy'),
    lastSync: timestamp('last_sync', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
    version: text('version').notNull().default('v0.0.0'),
    createdByUserId: text('created_by_user_id').notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('environment_workspace_name_uidx').on(table.workspaceId, table.name),
    uniqueIndex('environment_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('environment_workspace_status_updated_idx').on(table.workspaceId, table.status, table.updatedAt),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'environment_creator_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const apiEndpoint = pgTable(
  'api_endpoint',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    method: apiEndpointMethod('method').notNull().default('GET'),
    path: text('path').notNull(),
    description: text('description').notNull(),
    status: apiEndpointStatus('status').notNull().default('active'),
    createdByUserId: text('created_by_user_id').notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('api_endpoint_workspace_method_path_uidx').on(table.workspaceId, table.method, table.path),
    uniqueIndex('api_endpoint_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('api_endpoint_workspace_status_updated_idx').on(table.workspaceId, table.status, table.updatedAt),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'api_endpoint_creator_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const environmentDeployment = pgTable(
  'environment_deployment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    environmentId: uuid('environment_id').notNull(),
    action: environmentDeploymentAction('action').notNull(),
    status: environmentDeploymentStatus('status').notNull().default('succeeded'),
    version: text('version').notNull(),
    previousVersion: text('previous_version'),
    message: text('message').notNull().default(''),
    requestedByUserId: text('requested_by_user_id').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('environment_deployment_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('environment_deployment_workspace_environment_created_idx').on(table.workspaceId, table.environmentId, table.createdAt),
    foreignKey({
      columns: [table.workspaceId, table.environmentId],
      foreignColumns: [environment.workspaceId, environment.id],
      name: 'environment_deployment_environment_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.workspaceId, table.requestedByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'environment_deployment_requester_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const businessPlanStatus = pgEnum('business_plan_status', ['draft', 'review', 'active', 'archived']);
export const businessPlanLinkType = pgEnum('business_plan_link_type', [
  'task', 'cycleGoal', 'vision', 'blogArticle', 'contextSource', 'apiEndpoint',
  'feedback', 'socialPost', 'prompt', 'timeBlock', 'environment', 'teamMember',
]);

export type BusinessPlanLinkData = {
  id: string;
  type: 'task' | 'cycleGoal' | 'vision' | 'blogArticle' | 'contextSource' | 'apiEndpoint' | 'feedback' | 'socialPost' | 'prompt' | 'timeBlock' | 'environment' | 'teamMember';
  recordId: string;
  createdAt: string;
  createdBy: string;
};

export type BusinessPlanBlockMapData = {
  id: string;
  type: 'heading' | 'paragraph' | 'list-item' | 'quote' | 'code' | 'divider' | 'card';
};

export const businessPlan = pgTable(
  'business_plan',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    summary: text('summary').notNull().default(''),
    content: text('content').notNull().default(''),
    status: businessPlanStatus('status').notNull().default('draft'),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    links: jsonb('links').$type<BusinessPlanLinkData[]>().notNull().default([]),
    contentRevision: integer('content_revision').notNull().default(0),
    blockMap: jsonb('block_map').$type<BusinessPlanBlockMapData[]>().notNull().default([]),
    createdByUserId: text('created_by_user_id').notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('business_plan_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('business_plan_workspace_status_updated_idx').on(table.workspaceId, table.status, table.updatedAt),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'business_plan_creator_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const businessPlanEditingSession = pgTable(
  'business_plan_editing_session',
  {
    id: text('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id').notNull(),
    userId: text('user_id').notNull(),
    displayName: text('display_name').notNull(),
    color: text('color').notNull(),
    activeBlockId: text('active_block_id').notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('business_plan_editing_session_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('business_plan_editing_session_workspace_plan_updated_idx').on(table.workspaceId, table.planId, table.updatedAt),
    foreignKey({
      columns: [table.workspaceId, table.planId],
      foreignColumns: [businessPlan.workspaceId, businessPlan.id],
      name: 'business_plan_editing_session_plan_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.workspaceId, table.userId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'business_plan_editing_session_user_membership_fk',
    }).onDelete('cascade'),
  ],
);

export const contextSourceStatus = pgEnum('context_source_status', ['active', 'archived']);
export const contextSourceVersionStatus = pgEnum('context_source_version_status', ['processed', 'error']);
export const contextSourceContentStorage = pgEnum('context_source_content_storage', ['full', 'preview-only']);
export const contextSourceItemStatus = pgEnum('context_source_item_status', ['proposed', 'accepted', 'rejected', 'archived']);

export const contextSourceFolder = pgTable(
  'context_source_folder',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdByUserId: text('created_by_user_id').notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('context_source_folder_workspace_id_id_uidx').on(table.workspaceId, table.id),
    uniqueIndex('context_source_folder_workspace_name_uidx').on(table.workspaceId, table.name),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'context_source_folder_creator_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const contextSource = pgTable(
  'context_source',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    normalizedTitle: text('normalized_title').notNull(),
    aliases: text('aliases').array().notNull().default(sql`'{}'::text[]`),
    sourceKey: text('source_key').notNull(),
    latestVersion: integer('latest_version').notNull().default(0),
    latestFileName: text('latest_file_name').notNull().default(''),
    latestMimeType: text('latest_mime_type').notNull().default('text/plain'),
    latestSummary: text('latest_summary').notNull().default(''),
    linkedTaskIds: text('linked_task_ids').array().notNull().default(sql`'{}'::text[]`),
    linkedVisionIds: text('linked_vision_ids').array().notNull().default(sql`'{}'::text[]`),
    linkedCycleGoalIds: text('linked_cycle_goal_ids').array().notNull().default(sql`'{}'::text[]`),
    linkedFeedbackIds: text('linked_feedback_ids').array().notNull().default(sql`'{}'::text[]`),
    linkedSocialPostIds: text('linked_social_post_ids').array().notNull().default(sql`'{}'::text[]`),
    linkedCreativeItemIds: text('linked_creative_item_ids').array().notNull().default(sql`'{}'::text[]`),
    linkedLeadIds: text('linked_lead_ids').array().notNull().default(sql`'{}'::text[]`),
    linkedAccountIds: text('linked_account_ids').array().notNull().default(sql`'{}'::text[]`),
    createdByUserId: text('created_by_user_id').notNull(),
    lastUploadedAt: timestamp('last_uploaded_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
    status: contextSourceStatus('status').notNull().default('active'),
    folderId: uuid('folder_id'),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('context_source_workspace_source_key_uidx').on(table.workspaceId, table.sourceKey),
    uniqueIndex('context_source_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('context_source_workspace_status_updated_idx').on(table.workspaceId, table.status, table.updatedAt),
    index('context_source_workspace_folder_idx').on(table.workspaceId, table.folderId),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'context_source_creator_membership_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.workspaceId, table.folderId],
      foreignColumns: [contextSourceFolder.workspaceId, contextSourceFolder.id],
      name: 'context_source_folder_fk',
    }).onDelete('restrict'),
  ],
);

export const contextSourceVersion = pgTable(
  'context_source_version',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id').notNull(),
    sourceKey: text('source_key').notNull(),
    version: integer('version').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSize: integer('file_size').notNull(),
    contentHash: text('content_hash').notNull(),
    contentPreview: text('content_preview').notNull().default(''),
    fullContent: text('full_content'),
    contentStorage: contextSourceContentStorage('content_storage').notNull().default('preview-only'),
    routingContentAvailable: boolean('routing_content_available').notNull().default(false),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    linkedTaskIds: text('linked_task_ids').array().notNull().default(sql`'{}'::text[]`),
    linkedVisionIds: text('linked_vision_ids').array().notNull().default(sql`'{}'::text[]`),
    linkedCycleGoalIds: text('linked_cycle_goal_ids').array().notNull().default(sql`'{}'::text[]`),
    linkedFeedbackIds: text('linked_feedback_ids').array().notNull().default(sql`'{}'::text[]`),
    linkedSocialPostIds: text('linked_social_post_ids').array().notNull().default(sql`'{}'::text[]`),
    linkedCreativeItemIds: text('linked_creative_item_ids').array().notNull().default(sql`'{}'::text[]`),
    linkedLeadIds: text('linked_lead_ids').array().notNull().default(sql`'{}'::text[]`),
    linkedAccountIds: text('linked_account_ids').array().notNull().default(sql`'{}'::text[]`),
    createdByUserId: text('created_by_user_id').notNull(),
    status: contextSourceVersionStatus('status').notNull().default('processed'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('context_source_version_workspace_source_version_uidx').on(table.workspaceId, table.sourceId, table.version),
    uniqueIndex('context_source_version_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('context_source_version_workspace_source_created_idx').on(table.workspaceId, table.sourceId, table.createdAt),
    foreignKey({
      columns: [table.workspaceId, table.sourceId],
      foreignColumns: [contextSource.workspaceId, contextSource.id],
      name: 'context_source_version_source_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'context_source_version_creator_membership_fk',
    }).onDelete('restrict'),
    check('context_source_version_file_size_positive', sql`${table.fileSize} > 0`),
  ],
);

export const contextSourceItem = pgTable(
  'context_source_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id').notNull(),
    sourceVersionId: uuid('source_version_id').notNull(),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull().default(''),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    status: contextSourceItemStatus('status').notNull().default('proposed'),
    createdByUserId: text('created_by_user_id').notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('context_source_item_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('context_source_item_workspace_source_created_idx').on(table.workspaceId, table.sourceId, table.createdAt),
    index('context_source_item_workspace_status_updated_idx').on(table.workspaceId, table.status, table.updatedAt),
    foreignKey({
      columns: [table.workspaceId, table.sourceId],
      foreignColumns: [contextSource.workspaceId, contextSource.id],
      name: 'context_source_item_source_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.workspaceId, table.sourceVersionId],
      foreignColumns: [contextSourceVersion.workspaceId, contextSourceVersion.id],
      name: 'context_source_item_version_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'context_source_item_creator_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const bug = pgTable(
  'bug',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    severity: bugSeverity('severity').notNull().default('medium'),
    status: bugStatus('status').notNull().default('open'),
    resolutionNotes: text('resolution_notes').notNull().default(''),
    linkedTaskIds: uuid('linked_task_ids').array().notNull().default(sql`'{}'::uuid[]`),
    codeLinks: jsonb('code_links').$type<Array<{
      type: 'repository' | 'directory';
      url: string;
      label?: string;
      notes?: string;
    }>>().notNull().default([]),
    sourceLineage: jsonb('source_lineage').$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: text('created_by_user_id').notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('bug_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('bug_workspace_status_severity_updated_idx').on(table.workspaceId, table.status, table.severity, table.updatedAt),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'bug_creator_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const roadmapItem = pgTable(
  'roadmap_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    phase: roadmapPhase('phase').notNull().default('next'),
    priority: roadmapPriority('priority').notNull().default('medium'),
    status: roadmapStatus('status').notNull().default('planned'),
    linkedTaskIds: uuid('linked_task_ids').array().notNull().default(sql`'{}'::uuid[]`),
    createdByUserId: text('created_by_user_id').notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('roadmap_item_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('roadmap_item_workspace_phase_status_idx').on(table.workspaceId, table.phase, table.status, table.updatedAt),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'roadmap_item_creator_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const operatorDeskType = pgEnum('operator_desk_type', [
  'ops',
  'content',
  'creative',
  'bug',
  'feature',
  'research',
  'growth',
  'feedback',
]);
export const operatorCheckFrequency = pgEnum('operator_check_frequency', [
  'manual',
  'daily',
  'weekly',
  'monthly',
  'event',
]);
export const operatorDeskStatus = pgEnum('operator_desk_status', ['active', 'paused', 'archived']);
export const operatorApprovalMode = pgEnum('operator_approval_mode', [
  'action_based',
  'draft_only',
  'propose_injection',
  'approve_before_write',
  'safe_auto_write',
]);
export const operatorWorkOrderStatus = pgEnum('operator_work_order_status', [
  'draft',
  'ready',
  'claimed',
  'in_progress',
  'submitted',
  'needs_review',
  'approved',
  'rejected',
  'archived',
  'cancelled',
]);
export const operatorPriority = pgEnum('operator_priority', ['low', 'medium', 'high', 'critical']);
export const operatorClaimPolicy = pgEnum('operator_claim_policy', [
  'single_agent',
  'multi_agent',
  'manual_assignment',
]);

export const operatorDesk = pgTable(
  'operator_desk',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    type: operatorDeskType('type').notNull().default('ops'),
    mission: text('mission').notNull(),
    defaultCheckFrequency: operatorCheckFrequency('default_check_frequency').notNull().default('manual'),
    status: operatorDeskStatus('status').notNull().default('active'),
    connectedExternalAgents: text('connected_external_agents').array().notNull().default(sql`'{}'::text[]`),
    allowedSources: text('allowed_sources').array().notNull().default(sql`'{}'::text[]`),
    allowedOutputTypes: text('allowed_output_types').array().notNull().default(sql`'{}'::text[]`),
    approvalMode: operatorApprovalMode('approval_mode').notNull().default('action_based'),
    routingRules: jsonb('routing_rules').$type<Record<string, unknown>>().notNull().default({}),
    dangerousActionRules: text('dangerous_action_rules').array().notNull().default(sql`'{}'::text[]`),
    createdByUserId: text('created_by_user_id').notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('operator_desk_workspace_slug_uidx').on(table.workspaceId, table.slug),
    uniqueIndex('operator_desk_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('operator_desk_workspace_status_idx').on(table.workspaceId, table.status),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'operator_desk_creator_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const operatorWorkOrder = pgTable(
  'operator_work_order',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    operatorDeskId: uuid('operator_desk_id').notNull(),
    title: text('title').notNull(),
    brief: text('brief').notNull(),
    status: operatorWorkOrderStatus('status').notNull().default('ready'),
    priority: operatorPriority('priority').notNull().default('medium'),
    contextPackIds: text('context_pack_ids').array().notNull().default(sql`'{}'::text[]`),
    expectedOutputTypes: text('expected_output_types').array().notNull().default(sql`'{}'::text[]`),
    approvalMode: operatorApprovalMode('approval_mode').notNull().default('action_based'),
    claimPolicy: operatorClaimPolicy('claim_policy').notNull().default('single_agent'),
    assignedExternalAgent: text('assigned_external_agent'),
    claimedBy: text('claimed_by'),
    claimedAt: timestamp('claimed_at', { mode: 'date', withTimezone: true }),
    availableFrom: timestamp('available_from', { mode: 'date', withTimezone: true }),
    dueAt: timestamp('due_at', { mode: 'date', withTimezone: true }),
    createdByUserId: text('created_by_user_id').notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('operator_work_order_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('operator_work_order_workspace_status_idx').on(table.workspaceId, table.status),
    index('operator_work_order_workspace_desk_idx').on(table.workspaceId, table.operatorDeskId),
    foreignKey({
      columns: [table.workspaceId, table.operatorDeskId],
      foreignColumns: [operatorDesk.workspaceId, operatorDesk.id],
      name: 'operator_work_order_desk_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'operator_work_order_creator_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const operatorMemoryScope = pgEnum('operator_memory_scope', [
  'global', 'operator', 'hub', 'goal', 'artifact', 'work_order', 'checkin',
]);
export const operatorMemoryType = pgEnum('operator_memory_type', [
  'fact', 'preference', 'decision', 'style', 'constraint', 'lesson', 'avoid', 'source_note', 'workflow_rule',
]);
export const operatorMemoryState = pgEnum('operator_memory_state', [
  'suggested', 'active', 'pinned', 'rejected', 'expired', 'archived',
]);
export const operatorMemoryConfidence = pgEnum('operator_memory_confidence', ['low', 'medium', 'high']);
export const operatorCheckinType = pgEnum('operator_checkin_type', [
  'manifest_requested', 'work_order_claimed', 'work_started', 'output_submitted',
  'needs_more_context', 'work_skipped', 'work_failed', 'work_completed',
]);
export const operatorOutputStatus = pgEnum('operator_output_status', [
  'submitted', 'pending_approval', 'approved', 'rejected', 'injected', 'archived',
]);
export const operatorInjectionStatus = pgEnum('operator_injection_status', [
  'proposed', 'pending_approval', 'approved', 'completed', 'failed', 'rejected',
]);
export const approvalAction = pgEnum('approval_action', [
  'create', 'update', 'link', 'comment', 'publish', 'send', 'delete', 'deploy', 'rollback', 'remember',
]);
export const approvalRiskLevel = pgEnum('approval_risk_level', ['low', 'medium', 'high', 'critical']);
export const approvalStatus = pgEnum('approval_status', [
  'pending', 'approved', 'rejected', 'edited', 'expired', 'completed', 'failed',
]);
export const approvalWriteBackStatus = pgEnum('approval_write_back_status', ['pending', 'completed', 'failed']);

export const operatorContextPack = pgTable(
  'operator_context_pack',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    scope: text('scope').notNull().default('global'),
    scopeId: text('scope_id'),
    sourceIds: text('source_ids').array().notNull().default(sql`'{}'::text[]`),
    sourceSnapshots: jsonb('source_snapshots').$type<Array<Record<string, unknown>>>().notNull().default([]),
    instructions: text('instructions').notNull().default(''),
    constraints: text('constraints').array().notNull().default(sql`'{}'::text[]`),
    expectedUse: text('expected_use').notNull().default(''),
    createdByUserId: text('created_by_user_id').notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('operator_context_pack_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('operator_context_pack_workspace_scope_idx').on(table.workspaceId, table.scope, table.scopeId),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'operator_context_pack_creator_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const operatorCheckin = pgTable(
  'operator_checkin',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    operatorDeskId: uuid('operator_desk_id').notNull(),
    workOrderId: uuid('work_order_id').references(() => operatorWorkOrder.id, { onDelete: 'set null' }),
    externalAgentName: text('external_agent_name').notNull(),
    externalAgentProvider: text('external_agent_provider'),
    type: operatorCheckinType('type').notNull().default('manifest_requested'),
    summary: text('summary').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: text('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('operator_checkin_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('operator_checkin_workspace_desk_created_idx').on(table.workspaceId, table.operatorDeskId, table.createdAt),
    foreignKey({
      columns: [table.workspaceId, table.operatorDeskId],
      foreignColumns: [operatorDesk.workspaceId, operatorDesk.id],
      name: 'operator_checkin_desk_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'operator_checkin_creator_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const operatorOutput = pgTable(
  'operator_output',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    operatorDeskId: uuid('operator_desk_id').notNull(),
    workOrderId: uuid('work_order_id').references(() => operatorWorkOrder.id, { onDelete: 'set null' }),
    externalAgentName: text('external_agent_name').notNull(),
    outputType: text('output_type').notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    content: text('content').notNull(),
    structuredPayload: jsonb('structured_payload').$type<Record<string, unknown>>().notNull().default({}),
    suggestedDestinations: text('suggested_destinations').array().notNull().default(sql`'{}'::text[]`),
    sourceReferences: jsonb('source_references').$type<Array<Record<string, unknown>>>().notNull().default([]),
    memorySuggestions: jsonb('memory_suggestions').$type<Array<string | Record<string, unknown>>>().notNull().default([]),
    confidence: operatorMemoryConfidence('confidence').notNull().default('medium'),
    status: operatorOutputStatus('status').notNull().default('submitted'),
    routingWarning: text('routing_warning'),
    createdByUserId: text('created_by_user_id').notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('operator_output_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('operator_output_workspace_desk_created_idx').on(table.workspaceId, table.operatorDeskId, table.createdAt),
    foreignKey({
      columns: [table.workspaceId, table.operatorDeskId],
      foreignColumns: [operatorDesk.workspaceId, operatorDesk.id],
      name: 'operator_output_desk_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'operator_output_creator_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const operatorInjection = pgTable(
  'operator_injection',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    outputId: uuid('output_id').notNull(),
    targetHub: text('target_hub').notNull(),
    targetRecordId: text('target_record_id'),
    action: text('action').notNull(),
    riskLevel: approvalRiskLevel('risk_level').notNull().default('low'),
    status: operatorInjectionStatus('status').notNull().default('proposed'),
    createdByUserId: text('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { mode: 'date', withTimezone: true }),
  },
  (table) => [
    uniqueIndex('operator_injection_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('operator_injection_workspace_status_idx').on(table.workspaceId, table.status),
    foreignKey({
      columns: [table.workspaceId, table.outputId],
      foreignColumns: [operatorOutput.workspaceId, operatorOutput.id],
      name: 'operator_injection_output_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'operator_injection_creator_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const operatorApproval = pgTable(
  'operator_approval',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    operatorDeskId: uuid('operator_desk_id').notNull(),
    workOrderId: uuid('work_order_id').references(() => operatorWorkOrder.id, { onDelete: 'set null' }),
    outputId: uuid('output_id').references(() => operatorOutput.id, { onDelete: 'set null' }),
    injectionId: uuid('injection_id').references(() => operatorInjection.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    targetHub: text('target_hub').notNull(),
    action: approvalAction('action').notNull(),
    riskLevel: approvalRiskLevel('risk_level').notNull(),
    status: approvalStatus('status').notNull().default('pending'),
    writeBackStatus: approvalWriteBackStatus('write_back_status'),
    writeBackCompletedAt: timestamp('write_back_completed_at', { mode: 'date', withTimezone: true }),
    targetRecordId: text('target_record_id'),
    reviewedByUserId: text('reviewed_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { mode: 'date', withTimezone: true }),
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    createdByUserId: text('created_by_user_id').notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('operator_approval_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('operator_approval_workspace_status_idx').on(table.workspaceId, table.status),
    foreignKey({
      columns: [table.workspaceId, table.operatorDeskId],
      foreignColumns: [operatorDesk.workspaceId, operatorDesk.id],
      name: 'operator_approval_desk_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'operator_approval_creator_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const operatorMemory = pgTable(
  'operator_memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    scope: operatorMemoryScope('scope').notNull().default('operator'),
    scopeId: text('scope_id'),
    memoryType: operatorMemoryType('memory_type').notNull().default('lesson'),
    state: operatorMemoryState('state').notNull().default('active'),
    content: text('content').notNull(),
    confidence: operatorMemoryConfidence('confidence').notNull().default('medium'),
    sourceCheckinId: uuid('source_checkin_id').references(() => operatorCheckin.id, { onDelete: 'set null' }),
    sourceOutputId: uuid('source_output_id').references(() => operatorOutput.id, { onDelete: 'set null' }),
    pinned: boolean('pinned').notNull().default(false),
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { mode: 'date', withTimezone: true }),
    usedCount: integer('used_count').notNull().default(0),
    source: text('source').notNull().default('api'),
    sourceMetadata: jsonb('source_metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: text('created_by_user_id').notNull(),
    ...timestampColumns,
  },
  (table) => [
    uniqueIndex('operator_memory_workspace_id_id_uidx').on(table.workspaceId, table.id),
    index('operator_memory_workspace_scope_state_idx').on(table.workspaceId, table.scope, table.scopeId, table.state),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'operator_memory_creator_membership_fk',
    }).onDelete('restrict'),
  ],
);

export const authSchema = {
  user,
  session,
  account,
  verification,
};
