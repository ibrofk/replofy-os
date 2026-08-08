import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { after, test } from 'node:test';
import { and, eq } from 'drizzle-orm';
import { BootstrapError, bootstrapInstance, needsBootstrap } from './bootstrap.js';
import { loadServerConfig } from './config.js';
import { createPostgresDatabase } from './db/client.js';
import { workspaceMembership } from './db/schema.js';
import { createWorkspace, listUserWorkspaces, WorkspaceError } from './workspaces.js';
import {
  createTask,
  deleteTask,
  listTasks,
  TaskError,
  updateTask,
} from './execution/tasks.js';
import {
  createCycleGoal,
  CycleGoalError,
  deleteCycleGoal,
  listCycleGoals,
  updateCycleGoal,
} from './execution/cycle-goals.js';
import {
  createVision,
  deleteVision,
  listVisions,
  updateVision,
} from './execution/visions.js';
import {
  acceptWorkspaceInvitation,
  createWorkspaceInvitation,
  getWorkspaceInvitation,
  listWorkspaceMembers,
  MemberError,
} from './members.js';
import {
  authorizeStandaloneApiKey,
  createStandaloneApiKey,
  listStandaloneApiKeys,
  revokeStandaloneApiKey,
  StandaloneApiKeyError,
} from './api-keys.js';
import {
  addTeamChatParticipantToChannel,
  createTeamChatChannel,
  createTeamChatMessage,
  createTeamChatParticipant,
  listTeamChatChannels,
  listTeamChatMessages,
  listTeamChatParticipants,
  TeamChatError,
  updateTeamChatParticipant,
} from './team-chat.js';
import {
  ContentError,
  createBlogArticle,
  deleteBlogArticle,
  listBlogArticles,
  updateBlogArticle,
} from './content.js';
import {
  claimOperatorWorkOrder,
  createOperatorDesk,
  createOperatorWorkOrder,
  deleteOperatorDesk,
  listOperatorDesks,
  listOperatorWorkOrders,
  OperatorError,
  releaseOperatorWorkOrder,
  updateOperatorDesk,
} from './operators.js';
import {
  approveOperatorApproval,
  buildOperatorManifest,
  createOperatorMemory,
  listOperatorApprovals,
  listOperatorMemories,
  listOperatorOutputs,
  OperatorRuntimeError,
  rejectOperatorApproval,
  submitOperatorOutput,
  transitionOperatorMemory,
} from './operator-runtime.js';
import {
  createCreativeItem,
  deleteCreativeItem,
  getCreativeAssetDownload,
  listCreativeAssets,
  listCreativeItems,
  updateCreativeAsset,
  uploadCreativeAsset,
} from './creative.js';
import { FilesystemAssetStore } from './platform/filesystem-asset-store.js';
import {
  createAccount,
  createLead,
  deleteAccount,
  deleteLead,
  getLead,
  listAccounts,
  listLeads,
  updateLead,
} from './growth.js';
import {
  createBug,
  createRoadmapItem,
  deleteBug,
  deleteRoadmapItem,
  listBugs,
  listRoadmapItems,
  updateBug,
} from './technical.js';
import {
  createApiEndpoint,
  createEnvironment,
  deployEnvironment,
  listApiEndpoints,
  listEnvironmentDeployments,
  listEnvironments,
  rollbackEnvironment,
  SystemsError,
  updateEnvironment,
} from './systems.js';
import {
  createBusinessPlan,
  listBusinessPlans,
  listBusinessPlanSessions,
  updateBusinessPlan,
  upsertBusinessPlanSession,
} from './business-plans.js';
import {
  createContextSourceFolder,
  ingestContext,
  listContextSourceItems,
  listContextSources,
  updateContextSource,
  updateContextSourceItem,
} from './context.js';
import {
  createFeedback,
  createPrompt,
  createSeoKeyword,
  createSocialPost,
  createTimeBlock,
  createWeekMarker,
  listChatReadStates,
  listFeedback,
  listPrompts,
  listSeoKeywords,
  listSocialPosts,
  listTimeBlocks,
  listWeekMarkers,
  upsertChatReadState,
  upsertNotificationReadState,
  updatePrompt,
  updateSocialPost,
} from './strategy.js';

const config = loadServerConfig();
const { db, pool } = createPostgresDatabase(config.databaseUrl);
const creativeAssetDirectory = path.resolve('.tmp', `creative-integration-${randomUUID()}`);
const creativeAssetStore = new FilesystemAssetStore(creativeAssetDirectory);

after(async () => {
  await pool.end();
  await rm(creativeAssetDirectory, { recursive: true, force: true });
});

test('bootstrap is token-protected, atomic, and single use', async () => {
  assert.equal(await needsBootstrap(db), true);

  await assert.rejects(
    bootstrapInstance(db, config, {
      token: 'wrong-token',
      name: 'Owner',
      email: 'owner@example.com',
      password: 'correct-horse-battery-staple',
      workspaceName: 'Replofy Test',
      workspaceSlug: 'replofy-test',
    }),
    (error: unknown) => error instanceof BootstrapError && error.statusCode === 403,
  );
  assert.equal(await needsBootstrap(db), true);

  const result = await bootstrapInstance(db, config, {
    token: config.bootstrapToken,
    name: 'Owner',
    email: 'OWNER@example.com',
    password: 'correct-horse-battery-staple',
    workspaceName: 'Replofy Test',
    workspaceSlug: 'replofy-test',
  });

  assert.equal(result.user.email, 'owner@example.com');
  assert.equal(await needsBootstrap(db), false);

  const memberships = await db
    .select({ role: workspaceMembership.role })
    .from(workspaceMembership)
    .where(
      and(
        eq(workspaceMembership.workspaceId, result.workspace.id),
        eq(workspaceMembership.userId, result.user.id),
      ),
    );
  assert.deepEqual(memberships, [{ role: 'owner' }]);

  await assert.rejects(
    bootstrapInstance(db, config, {
      token: config.bootstrapToken,
      name: 'Second Owner',
      email: 'second@example.com',
      password: 'correct-horse-battery-staple',
      workspaceName: 'Second Workspace',
      workspaceSlug: 'second-workspace',
    }),
    (error: unknown) => error instanceof BootstrapError && error.statusCode === 409,
  );
});

test('workspace creation is scoped to the authenticated user and rejects duplicate slugs', async () => {
  const owners = await db
    .select({ userId: workspaceMembership.userId })
    .from(workspaceMembership)
    .where(eq(workspaceMembership.role, 'owner'))
    .limit(1);
  assert.equal(owners.length, 1);

  const created = await createWorkspace(db, owners[0].userId, {
    name: 'Second Workspace',
    slug: 'second-workspace',
  });
  assert.equal(created.role, 'owner');

  const visible = await listUserWorkspaces(db, owners[0].userId);
  assert.deepEqual(
    visible.map((item) => item.slug).sort(),
    ['replofy-test', 'second-workspace'],
  );

  await assert.rejects(
    createWorkspace(db, owners[0].userId, {
      name: 'Duplicate',
      slug: 'second-workspace',
    }),
    (error: unknown) => error instanceof WorkspaceError && error.statusCode === 409,
  );
});

test('workspace invitations are hashed, single-use, and create bounded memberships', async () => {
  const owners = await db
    .select({
      userId: workspaceMembership.userId,
      workspaceId: workspaceMembership.workspaceId,
    })
    .from(workspaceMembership)
    .where(eq(workspaceMembership.role, 'owner'))
    .limit(1);
  const owner = {
    userId: owners[0].userId,
    workspaceId: owners[0].workspaceId,
    role: 'owner' as const,
  };

  const invitation = await createWorkspaceInvitation(db, config, owner, {
    email: 'new-member@example.com',
    role: 'member',
  });
  assert.equal(invitation.email, 'new-member@example.com');
  assert.ok(invitation.acceptUrl.includes('/join?token='));
  const token = new URL(invitation.acceptUrl).searchParams.get('token');
  assert.ok(token);

  const preview = await getWorkspaceInvitation(db, token);
  assert.equal(preview.email, 'new-member@example.com');

  const accepted = await acceptWorkspaceInvitation(db, token, {
    name: 'New Member',
    password: 'correct-horse-battery-staple',
  });
  assert.equal(accepted.workspaceId, owner.workspaceId);
  assert.equal(accepted.role, 'member');

  const members = await listWorkspaceMembers(db, owner);
  assert.deepEqual(
    members.map((member) => member.email).sort(),
    ['new-member@example.com', 'owner@example.com'],
  );

  await assert.rejects(
    acceptWorkspaceInvitation(db, token, {
      name: 'Replay',
      password: 'correct-horse-battery-staple',
    }),
    (error: unknown) => error instanceof MemberError && error.statusCode === 409,
  );

  await assert.rejects(
    createWorkspaceInvitation(
      db,
      config,
      {
        userId: accepted.user.id,
        workspaceId: owner.workspaceId,
        role: 'member',
      },
      { email: 'another@example.com', role: 'member' },
    ),
    (error: unknown) => error instanceof MemberError && error.statusCode === 403,
  );
});

test('standalone API keys are scoped, non-recoverable, and revocable', async () => {
  const owners = await db
    .select({
      userId: workspaceMembership.userId,
      workspaceId: workspaceMembership.workspaceId,
    })
    .from(workspaceMembership)
    .where(eq(workspaceMembership.role, 'owner'))
    .limit(1);
  const owner = {
    userId: owners[0].userId,
    workspaceId: owners[0].workspaceId,
    role: 'owner' as const,
  };
  const created = await createStandaloneApiKey(db, owner, {
    label: 'Read-only integration key',
    scopes: ['execution:read'],
  });
  assert.ok(created.key.startsWith('rpo_local_'));
  const listed = await listStandaloneApiKeys(db, owner);
  assert.equal('key' in listed[0], false);

  const authorized = await authorizeStandaloneApiKey(db, created.key, 'execution:read');
  assert.equal(authorized.workspaceId, owner.workspaceId);
  await assert.rejects(
    authorizeStandaloneApiKey(db, created.key, 'execution:write'),
    (error: unknown) => error instanceof StandaloneApiKeyError && error.statusCode === 403,
  );

  await revokeStandaloneApiKey(db, owner, created.id);
  await assert.rejects(
    authorizeStandaloneApiKey(db, created.key, 'execution:read'),
    (error: unknown) => error instanceof StandaloneApiKeyError && error.statusCode === 401,
  );
});

test('team chat persists workspace-isolated identities, channels, and immutable messages', async () => {
  const owners = await db
    .select({
      userId: workspaceMembership.userId,
      workspaceId: workspaceMembership.workspaceId,
    })
    .from(workspaceMembership)
    .where(eq(workspaceMembership.role, 'owner'));
  const primary = { ...owners[0], role: 'owner' as const };
  const other = { ...owners[1], role: 'owner' as const };

  const participant = await createTeamChatParticipant(db, primary, {
    displayName: 'Release Operator',
    participantType: 'ai-agent',
    description: 'Coordinates release work.',
  });
  const channel = await createTeamChatChannel(db, primary, {
    name: 'release-room',
    participantIds: [participant.id],
  });
  const message = await createTeamChatMessage(db, primary, {
    channelId: channel.id,
    participantId: participant.id,
    content: 'Release gate started.',
  });
  assert.equal(message.senderName, 'Release Operator');

  await updateTeamChatParticipant(db, primary, participant.id, {
    displayName: 'Release Steward',
  });
  const messages = await listTeamChatMessages(db, primary, {
    channelId: channel.id,
    query: 'gate',
    limit: '20',
  });
  assert.equal(messages.count, 1);
  assert.equal(messages.data[0].senderName, 'Release Operator');
  assert.equal((await listTeamChatParticipants(db, primary, {}))[0].displayName, 'Release Steward');
  assert.equal((await listTeamChatChannels(db, other, {})).length, 0);
  assert.equal((await listTeamChatMessages(db, other, {})).count, 0);

  const second = await createTeamChatParticipant(db, primary, {
    displayName: 'Owner',
    participantType: 'team-member',
    linkedUserId: primary.userId,
  });
  await assert.rejects(
    createTeamChatMessage(db, primary, {
      channelId: channel.id,
      participantId: second.id,
      content: 'Not assigned yet.',
    }),
    (error: unknown) => error instanceof TeamChatError && error.statusCode === 400,
  );
  await addTeamChatParticipantToChannel(db, primary, channel.id, { participantId: second.id });
  const reply = await createTeamChatMessage(db, primary, {
    channelId: channel.id,
    participantId: second.id,
    content: 'Acknowledged.',
    replyToMessageId: message.id,
  });
  assert.equal(reply.replyToMessageId, message.id);
});

test('blog content CRUD persists structured metadata with workspace isolation', async () => {
  const owners = await db
    .select({
      userId: workspaceMembership.userId,
      workspaceId: workspaceMembership.workspaceId,
    })
    .from(workspaceMembership)
    .where(eq(workspaceMembership.role, 'owner'));
  const primary = { ...owners[0], role: 'owner' as const };
  const other = { ...owners[1], role: 'owner' as const };

  const article = await createBlogArticle(db, primary, {
    title: 'Open source operating systems',
    summary: 'A durable migration story.',
    status: 'drafting',
    tags: ['open-source', 'operations', 'open-source'],
    brief: { audience: 'Founder-operators', thesis: 'Portability is operational leverage.' },
  });
  assert.equal(article.slug, 'open-source-operating-systems');
  assert.deepEqual(article.tags, ['open-source', 'operations']);
  assert.equal((article.brief as { audience?: string }).audience, 'Founder-operators');
  assert.equal((await listBlogArticles(db, other, {})).length, 0);

  const published = await updateBlogArticle(db, primary, article.id, {
    status: 'published',
    content: '# Portable by default',
  });
  assert.equal(published.status, 'published');
  assert.ok(published.publishedAt);

  await assert.rejects(
    createBlogArticle(db, primary, {
      title: 'Duplicate',
      slug: article.slug,
    }),
    (error: unknown) => error instanceof ContentError && error.statusCode === 409,
  );
  await assert.rejects(
    updateBlogArticle(db, primary, article.id, { ownerId: randomUUID() }),
    (error: unknown) => error instanceof ContentError && error.statusCode === 422,
  );
  assert.deepEqual(await deleteBlogArticle(db, primary, article.id), {
    id: article.id,
    deleted: true,
  });
});

test('operator desks and work orders enforce routing, isolation, and claim ownership', async () => {
  const owners = await db
    .select({
      userId: workspaceMembership.userId,
      workspaceId: workspaceMembership.workspaceId,
    })
    .from(workspaceMembership)
    .where(eq(workspaceMembership.role, 'owner'));
  const primary = { ...owners[0], role: 'owner' as const };
  const other = { ...owners[1], role: 'owner' as const };

  const desk = await createOperatorDesk(db, primary, {
    name: 'Release Operations',
    mission: 'Move approved releases through verifiable gates.',
    allowedOutputTypes: ['execution_task', 'risk_note'],
    connectedExternalAgents: ['codex'],
  });
  assert.equal(desk.slug, 'release-operations');
  assert.equal((await listOperatorDesks(db, other, {})).length, 0);

  await assert.rejects(
    createOperatorWorkOrder(db, primary, {
      operatorDeskId: desk.id,
      title: 'Unsupported output',
      brief: 'Attempt a disallowed output.',
      expectedOutputTypes: ['blog_article'],
    }),
    (error: unknown) => error instanceof OperatorError && error.statusCode === 422,
  );

  const workOrder = await createOperatorWorkOrder(db, primary, {
    operatorDeskId: desk.id,
    title: 'Prepare release candidate',
    brief: 'Run the release checklist and surface risks.',
    expectedOutputTypes: ['execution_task', 'risk_note'],
    assignedExternalAgent: 'codex',
  });
  const claimed = await claimOperatorWorkOrder(db, primary, workOrder.id, {
    externalAgentName: 'codex',
  });
  assert.equal(claimed.status, 'claimed');
  assert.equal(claimed.claimedBy, 'codex');
  await assert.rejects(
    claimOperatorWorkOrder(db, primary, workOrder.id, { externalAgentName: 'other-agent' }),
    (error: unknown) => error instanceof OperatorError && [403, 409].includes(error.statusCode),
  );
  const released = await releaseOperatorWorkOrder(db, primary, workOrder.id, {
    externalAgentName: 'codex',
  });
  assert.equal(released.status, 'ready');
  assert.equal((await listOperatorWorkOrders(db, other, {})).length, 0);

  await assert.rejects(
    deleteOperatorDesk(db, primary, desk.id),
    (error: unknown) => error instanceof OperatorError && error.statusCode === 409,
  );
  const archived = await updateOperatorDesk(db, primary, desk.id, { status: 'archived' });
  assert.equal(archived.status, 'archived');
});

test('operator outputs route through durable approvals before transactional write-back', async () => {
  const owners = await db
    .select({
      userId: workspaceMembership.userId,
      workspaceId: workspaceMembership.workspaceId,
    })
    .from(workspaceMembership)
    .where(eq(workspaceMembership.role, 'owner'));
  const primary = { ...owners[0], role: 'owner' as const };
  const other = { ...owners[1], role: 'owner' as const };
  const desk = await createOperatorDesk(db, primary, {
    name: 'Approval Runtime',
    mission: 'Prove that operator writes require durable human decisions.',
    allowedOutputTypes: ['execution_task', 'memory_suggestion'],
  });
  const order = await createOperatorWorkOrder(db, primary, {
    operatorDeskId: desk.id,
    title: 'Propose a release task',
    brief: 'Submit an execution task through approval.',
    expectedOutputTypes: ['execution_task'],
  });
  await assert.rejects(
    submitOperatorOutput(db, primary, {
      operatorDeskId: desk.id,
      workOrderId: order.id,
      externalAgentName: 'unclaimed-agent',
      outputType: 'execution_task',
      title: 'Bypass the claim',
      summary: 'This must not be accepted.',
      content: 'Attempt to submit without owning the work order.',
      suggestedDestinations: ['tasks'],
    }),
    (error: unknown) => error instanceof OperatorRuntimeError && error.statusCode === 409,
  );
  await claimOperatorWorkOrder(db, primary, order.id, { externalAgentName: 'codex' });

  const suggestion = await createOperatorMemory(db, primary, {
    scope: 'operator',
    scopeId: desk.id,
    state: 'suggested',
    content: 'Every release needs a reversible rollback step.',
    confidence: 'high',
  });
  const activated = await transitionOperatorMemory(db, primary, suggestion.id, 'approve');
  assert.equal(activated.data.state, 'active');
  await assert.rejects(
    createOperatorMemory(db, primary, {
      scope: 'operator',
      scopeId: desk.id,
      content: 'Every release needs a reversible rollback step.',
    }),
    (error: unknown) => error instanceof OperatorRuntimeError && error.statusCode === 409,
  );

  const submitted = await submitOperatorOutput(db, primary, {
    operatorDeskId: desk.id,
    workOrderId: order.id,
    externalAgentName: 'codex',
    outputType: 'execution_task',
    title: 'Verify rollback before release',
    summary: 'Exercise the rollback path.',
    content: 'Run the documented restore command against a disposable database.',
    structuredPayload: { effortPoints: 3 },
    suggestedDestinations: ['tasks'],
    confidence: 'high',
  });
  assert.equal(submitted.data.status, 'pending_approval');
  assert.equal(submitted.routes.length, 1);
  assert.equal((await listOperatorApprovals(db, other, {})).length, 0);

  const approvalId = submitted.routes[0].approval.id;
  const approved = await approveOperatorApproval(db, primary, approvalId, {});
  if (approved.idempotent) assert.fail('First approval unexpectedly returned an idempotent result.');
  assert.equal(approved.data.writeBackStatus, 'completed');
  assert.equal(approved.target.hub, 'tasks');
  assert.equal((await listTasks(db, primary, { limit: 100 }))
    .some((item) => item.id === approved.target.id), true);
  const replay = await approveOperatorApproval(db, primary, approvalId, {});
  assert.equal(replay.idempotent, true);
  assert.equal((await listOperatorOutputs(db, primary, {}))[0].status, 'injected');

  const rejectedOutput = await submitOperatorOutput(db, primary, {
    operatorDeskId: desk.id,
    externalAgentName: 'codex',
    outputType: 'execution_task',
    title: 'Unsafe direct release',
    summary: 'This should be rejected.',
    content: 'Skip the release gates.',
    suggestedDestinations: ['tasks'],
  });
  const rejected = await rejectOperatorApproval(
    db,
    primary,
    rejectedOutput.routes[0].approval.id,
    { reason: 'Violates release policy.' },
  );
  assert.equal(rejected.data.status, 'rejected');

  const manifest = await buildOperatorManifest(db, primary, {
    operatorDeskId: desk.id,
    externalAgentName: 'codex',
  });
  assert.equal(manifest.operatorDesk.id, desk.id);
  assert.equal(manifest.activeMemory.length, 1);
  assert.equal(manifest.recentCheckins.some((checkin) => checkin.type === 'work_order_claimed'), true);
  assert.equal(manifest.recentCheckins.some((checkin) => checkin.type === 'output_submitted'), true);
  assert.equal((await listOperatorMemories(db, other, {})).length, 0);
});

test('creative metadata and filesystem assets are durable and workspace-isolated', async () => {
  const owners = await db.select({
    userId: workspaceMembership.userId,
    workspaceId: workspaceMembership.workspaceId,
  }).from(workspaceMembership).where(eq(workspaceMembership.role, 'owner'));
  const primary = { ...owners[0], role: 'owner' as const };
  const other = { ...owners[1], role: 'owner' as const };

  const item = await createCreativeItem(db, primary, {
    title: 'Open-source launch',
    platform: 'LinkedIn',
    format: 'carousel',
    tags: ['launch', 'portable'],
  });
  assert.equal(item.status, 'idea');
  assert.equal((await listCreativeItems(db, other)).length, 0);

  const content = Buffer.from('workspace-private-creative');
  const asset = await uploadCreativeAsset(db, creativeAssetStore, primary, {
    fileName: 'launch-notes.txt',
    mimeType: 'text/plain',
    fileSize: content.length,
    creativeId: item.id,
  }, Readable.from(content));
  assert.equal(asset.provider, 'filesystem');
  assert.equal(asset.assetType, 'document');
  assert.equal((await listCreativeAssets(db, other)).length, 0);
  assert.deepEqual((await listCreativeItems(db, primary))[0].assetIds, [asset.id]);

  const download = await getCreativeAssetDownload(db, creativeAssetStore, primary, asset.id);
  const chunks: Buffer[] = [];
  for await (const chunk of download.stream) chunks.push(Buffer.from(chunk));
  assert.deepEqual(Buffer.concat(chunks), content);
  await assert.rejects(
    getCreativeAssetDownload(db, creativeAssetStore, other, asset.id),
    (error: unknown) => error instanceof Error && error.message === 'Creative asset not found.',
  );
  await assert.rejects(
    deleteCreativeItem(db, primary, item.id),
    (error: unknown) => error instanceof Error && error.message.includes('active assets'),
  );

  const archived = await updateCreativeAsset(db, primary, asset.id, { status: 'archived' });
  assert.equal(archived.status, 'archived');
});

test('growth accounts and leads keep relationships atomic and workspace-isolated', async () => {
  const owners = await db.select({
    userId: workspaceMembership.userId,
    workspaceId: workspaceMembership.workspaceId,
  }).from(workspaceMembership).where(eq(workspaceMembership.role, 'owner'));
  const primary = { ...owners[0], role: 'owner' as const };
  const other = { ...owners[1], role: 'owner' as const };
  const linkedTask = await createTask(db, primary, { title: 'Follow up with launch lead' });
  const account = await createAccount(db, primary, {
    name: 'Portable Company',
    website: 'https://example.test',
    status: 'prospect',
  });
  const createdLead = await createLead(db, primary, {
    name: 'Ada Founder',
    email: 'ada@example.test',
    accountId: account.id,
    stage: 'qualified',
    priority: 'high',
    linkedTaskIds: [linkedTask.id],
  });

  assert.deepEqual((await listAccounts(db, primary))[0].linkedLeadIds, [createdLead.id]);
  assert.equal((await listAccounts(db, other)).length, 0);
  assert.equal((await listLeads(db, other)).length, 0);
  await assert.rejects(
    updateLead(db, other, createdLead.id, { stage: 'won' }),
    (error: unknown) => error instanceof Error && error.message === 'Lead not found.',
  );

  assert.deepEqual(await deleteAccount(db, primary, account.id), { id: account.id, deleted: true });
  assert.equal((await getLead(db, primary, createdLead.id)).accountId, null);
  assert.deepEqual(await deleteLead(db, primary, createdLead.id), { id: createdLead.id, deleted: true });
  const retainedAccount = await createAccount(db, primary, { name: 'Restore Drill Account' });
  await createLead(db, primary, { name: 'Restore Drill Lead', accountId: retainedAccount.id });
  await deleteTask(db, primary, linkedTask.id);
});

test('technical bugs and roadmap items validate task links and workspace boundaries', async () => {
  const owners = await db.select({
    userId: workspaceMembership.userId,
    workspaceId: workspaceMembership.workspaceId,
  }).from(workspaceMembership).where(eq(workspaceMembership.role, 'owner'));
  const primary = { ...owners[0], role: 'owner' as const };
  const other = { ...owners[1], role: 'owner' as const };
  const linkedTask = await createTask(db, primary, { title: 'Fix standalone technical issue' });
  const createdBug = await createBug(db, primary, {
    title: 'Migration gate regression',
    severity: 'high',
    linkedTaskIds: [linkedTask.id],
    codeLinks: [{ type: 'repository', url: 'https://example.test/repository' }],
  });
  const roadmap = await createRoadmapItem(db, primary, {
    title: 'Ship portable deployment history',
    phase: 'now',
    priority: 'high',
    linkedTaskIds: [linkedTask.id],
  });

  assert.equal((await listBugs(db, primary))[0].id, createdBug.id);
  assert.equal((await listRoadmapItems(db, primary))[0].id, roadmap.id);
  assert.equal((await listBugs(db, other)).length, 0);
  assert.equal((await listRoadmapItems(db, other)).length, 0);
  await assert.rejects(
    updateBug(db, other, createdBug.id, { status: 'closed' }),
    (error: unknown) => error instanceof Error && error.message === 'Bug not found.',
  );

  await deleteBug(db, primary, createdBug.id);
  await deleteRoadmapItem(db, primary, roadmap.id);
  await createBug(db, primary, { title: 'Restore drill bug' });
  await createRoadmapItem(db, primary, { title: 'Restore drill roadmap item' });
  await deleteTask(db, primary, linkedTask.id);
});

test('Systems endpoints and environments are durable, auditable, and workspace-isolated', async () => {
  const owners = await db.select({
    userId: workspaceMembership.userId,
    workspaceId: workspaceMembership.workspaceId,
  }).from(workspaceMembership).where(eq(workspaceMembership.role, 'owner'));
  const primary = { ...owners[0], role: 'owner' as const };
  const other = { ...owners[1], role: 'owner' as const };

  const endpoint = await createApiEndpoint(db, primary, {
    method: 'GET',
    path: '/api/v1/systems/health',
    description: 'Reports local Systems health.',
  });
  assert.equal(endpoint.companyId, primary.workspaceId);
  assert.equal((await listApiEndpoints(db, other)).length, 0);

  const environment = await createEnvironment(db, primary, { name: 'Staging', version: 'v1.0.0' });
  assert.equal((await listEnvironments(db, other)).length, 0);
  await assert.rejects(
    updateEnvironment(db, other, environment.id, { version: 'v9.9.9' }),
    (error: unknown) => error instanceof SystemsError && error.statusCode === 404,
  );
  const deployed = await deployEnvironment(db, primary, environment.id, {
    version: 'v1.1.0',
    message: 'Integration deployment.',
  });
  assert.equal(deployed.environment.version, 'v1.1.0');
  assert.equal(deployed.deployment.action, 'deploy');
  const rolledBack = await rollbackEnvironment(db, primary, environment.id);
  assert.equal(rolledBack.environment.version, 'v1.0.0');
  assert.equal(rolledBack.deployment.action, 'rollback');
  const history = await listEnvironmentDeployments(db, primary, { environmentId: environment.id });
  assert.equal(history.length, 2);
  assert.deepEqual(history.map((entry) => entry.action), ['rollback', 'deploy']);
  await assert.rejects(
    deployEnvironment(db, other, environment.id, { version: 'v9.9.9' }),
    (error: unknown) => error instanceof SystemsError && error.statusCode === 404,
  );

  await createApiEndpoint(db, primary, {
    method: 'POST',
    path: '/api/v1/systems/restore-proof',
    description: 'Retained for the restore drill.',
  });
  await createEnvironment(db, primary, { name: 'Production', version: 'v0.0.0' });
});

test('Business Plans and context ingestion preserve revisions, proposals, and workspace boundaries', async () => {
  const owners = await db.select({
    userId: workspaceMembership.userId,
    workspaceId: workspaceMembership.workspaceId,
  }).from(workspaceMembership).where(eq(workspaceMembership.role, 'owner'));
  const primary = { ...owners[0], role: 'owner' as const };
  const other = { ...owners[1], role: 'owner' as const };

  const plan = await createBusinessPlan(db, primary, { title: 'Portable operating plan' });
  assert.equal(plan.status, 'draft');
  assert.ok(plan.content.includes('Replofy Business Plan'));
  assert.equal((await listBusinessPlans(db, other)).length, 0);
  const revised = await updateBusinessPlan(db, primary, plan.id, {
    content: '# Portable operating plan\n\n## Risks\n- Keep rollback tested.',
  });
  assert.equal(revised.contentRevision, 1);
  const session = await upsertBusinessPlanSession(db, primary, {
    sessionId: 'integration-plan-session',
    planId: plan.id,
    displayName: 'Owner',
    color: '#111111',
    activeBlockId: 'block-1',
  });
  assert.equal(session.planId, plan.id);
  assert.equal((await listBusinessPlanSessions(db, other, plan.id)).length, 0);

  const payload = {
    source: {
      title: 'Release notes',
      aliases: ['release-notes.md'],
      summary: 'A durable release checklist.',
    },
    items: [{
      kind: 'task',
      title: 'Run restore drill',
      summary: 'Verify the backup can be restored.',
      matchKey: 'restore-drill',
      effortPoints: 3,
    }],
  };
  const ingested = await ingestContext(db, primary, {
    fileName: 'release-notes.md',
    content: '# Release notes\n\n- Run restore drill',
    mimeType: 'text/markdown',
    payload,
  });
  assert.equal(ingested.result.status, 'done');
  assert.equal(ingested.result.actions[0].action, 'created');
  assert.equal((await listContextSources(db, other)).length, 0);
  assert.equal((await listContextSourceItems(db, other)).length, 0);
  const accepted = await updateContextSourceItem(db, primary, ingested.result.actions[0].id, { status: 'accepted' });
  assert.equal(accepted.status, 'accepted');
  const second = await ingestContext(db, primary, {
    fileName: 'release-notes.md',
    content: '# Release notes\n\n- Run restore drill again',
    mimeType: 'text/markdown',
    payload,
  });
  assert.equal(second.result.sourceVersion, 2);
  assert.equal(second.result.actions[0].action, 'updated');
  const source = (await listContextSources(db, primary))[0];
  const folder = await createContextSourceFolder(db, primary, { name: 'Release evidence' });
  const archived = await updateContextSource(db, primary, source.id, { status: 'archived', folderId: folder.id });
  assert.equal(archived.status, 'archived');
  await assert.rejects(
    updateContextSource(db, other, source.id, { status: 'active' }),
    (error: unknown) => error instanceof Error && error.message === 'Context source not found.',
  );
});

test('task CRUD is bounded to the active workspace', async () => {
  const owners = await db
    .select({
      userId: workspaceMembership.userId,
      workspaceId: workspaceMembership.workspaceId,
    })
    .from(workspaceMembership)
    .where(eq(workspaceMembership.role, 'owner'));
  assert.equal(owners.length, 2);

  const primary = {
    userId: owners[0].userId,
    workspaceId: owners[0].workspaceId,
    role: 'owner' as const,
  };
  const other = {
    userId: owners[1].userId,
    workspaceId: owners[1].workspaceId,
    role: 'owner' as const,
  };

  const created = await createTask(db, primary, {
    title: 'Ship Postgres task slice',
    effortPoints: 3,
  });
  assert.equal(created.status, 'icebox');
  assert.equal(created.workspaceId, primary.workspaceId);
  assert.equal(created.companyId, primary.workspaceId);

  const primaryTasks = await listTasks(db, primary, { limit: 10 });
  const otherTasks = await listTasks(db, other, { limit: 10 });
  assert.equal(primaryTasks.some((item) => item.id === created.id), true);
  assert.equal(otherTasks.length, 0);

  const completed = await updateTask(db, primary, created.id, { status: 'done' });
  assert.equal(completed.status, 'done');
  assert.ok(completed.completedAt);

  await assert.rejects(
    createTask(db, primary, {
      title: 'Cross-workspace assignee',
      assigneeId: randomUUID(),
    }),
    (error: unknown) => error instanceof TaskError && error.statusCode === 422,
  );

  assert.deepEqual(await deleteTask(db, primary, created.id), {
    id: created.id,
    deleted: true,
  });
  assert.equal((await listTasks(db, primary, { limit: 10 })).length, 0);
});

test('cycle goals and visions are isolated and enforce execution relationships', async () => {
  const owners = await db
    .select({
      userId: workspaceMembership.userId,
      workspaceId: workspaceMembership.workspaceId,
    })
    .from(workspaceMembership)
    .where(eq(workspaceMembership.role, 'owner'));
  assert.equal(owners.length, 2);

  const primary = {
    userId: owners[0].userId,
    workspaceId: owners[0].workspaceId,
    role: 'owner' as const,
  };
  const other = {
    userId: owners[1].userId,
    workspaceId: owners[1].workspaceId,
    role: 'owner' as const,
  };

  const goal = await createCycleGoal(db, primary, {
    title: 'Complete standalone execution slice',
    description: 'Tasks, goals, and visions use PostgreSQL.',
  });
  assert.equal(goal.status, 'active');
  assert.equal((await listCycleGoals(db, primary, {})).length, 1);
  assert.equal((await listCycleGoals(db, other, {})).length, 0);

  const linkedTask = await createTask(db, primary, {
    title: 'Prove goal relationship',
    cycleGoalId: goal.id,
    effortPoints: 2,
  });
  assert.equal(linkedTask.status, 'todo');

  await assert.rejects(
    deleteCycleGoal(db, primary, goal.id),
    (error: unknown) => error instanceof CycleGoalError && error.statusCode === 409,
  );
  await assert.rejects(
    updateCycleGoal(db, other, goal.id, { status: 'completed' }),
    (error: unknown) => error instanceof CycleGoalError && error.statusCode === 404,
  );

  const completed = await updateCycleGoal(db, primary, goal.id, { status: 'completed' });
  assert.equal(completed.status, 'completed');

  const createdVision = await createVision(db, primary, {
    title: 'An owner-operated company',
    description: 'The operating system makes progress legible.',
    focusItems: ['Ship weekly', 'Keep ownership portable'],
  });
  assert.deepEqual(createdVision.focusItems, ['Ship weekly', 'Keep ownership portable']);
  assert.equal((await listVisions(db, primary, {})).length, 1);
  assert.equal((await listVisions(db, other, {})).length, 0);

  const updatedVision = await updateVision(db, primary, createdVision.id, {
    focusItems: ['Ship weekly'],
  });
  assert.deepEqual(updatedVision.focusItems, ['Ship weekly']);

  await deleteTask(db, primary, linkedTask.id);
  assert.deepEqual(await deleteCycleGoal(db, primary, goal.id), {
    id: goal.id,
    deleted: true,
  });
  assert.deepEqual(await deleteVision(db, primary, createdVision.id), {
    id: createdVision.id,
    deleted: true,
  });
});

test('strategy records and read states are durable and workspace-isolated', async () => {
  const owners = await db.select({
    userId: workspaceMembership.userId,
    workspaceId: workspaceMembership.workspaceId,
  }).from(workspaceMembership).where(eq(workspaceMembership.role, 'owner'));
  const primary = { ...owners[0], role: 'owner' as const };
  const other = { ...owners[1], role: 'owner' as const };
  const goal = await createCycleGoal(db, primary, { title: 'Strategy migration gate' });
  const prompt = await createPrompt(db, primary, {
    title: 'Release review prompt',
    content: 'Review the release evidence and name the rollback step.',
  });
  assert.equal((await listPrompts(db, other)).length, 0);
  const revisedPrompt = await updatePrompt(db, primary, prompt.id, { version: 'v2.0' });
  assert.equal(revisedPrompt.version, 'v2.0');

  const social = await createSocialPost(db, primary, {
    platform: 'LinkedIn',
    content: 'Portable systems reduce release risk.',
    status: 'draft',
  });
  assert.equal((await listSocialPosts(db, other)).length, 0);
  assert.equal((await updateSocialPost(db, primary, social.id, { status: 'scheduled' })).status, 'scheduled');

  await createSeoKeyword(db, primary, { keyword: 'portable operating system', cycleGoalId: goal.id });
  await createFeedback(db, primary, { source: 'Email', content: 'The restore drill is easy to follow.' });
  await createTimeBlock(db, primary, {
    title: 'Release evidence review',
    type: 'strategic',
    startTime: '09:00',
    endTime: '10:00',
    dayOfWeek: 1,
  });
  const firstWeek = await createWeekMarker(db, primary, { weekNumber: 1, status: 'active' });
  const secondWeek = await createWeekMarker(db, primary, { weekNumber: 2, status: 'active' });
  assert.equal((await listWeekMarkers(db, primary)).find((marker) => marker.id === firstWeek.id)?.status, 'completed');
  assert.equal((await listWeekMarkers(db, primary)).find((marker) => marker.id === secondWeek.id)?.status, 'active');
  assert.equal((await listSeoKeywords(db, other)).length, 0);
  assert.equal((await listFeedback(db, other)).length, 0);
  assert.equal((await listTimeBlocks(db, other)).length, 0);
  assert.equal((await listWeekMarkers(db, other)).length, 0);

  const participant = await createTeamChatParticipant(db, primary, {
    displayName: 'Read State Test',
    participantType: 'ai-agent',
  });
  const channel = await createTeamChatChannel(db, primary, {
    name: 'read-state-test',
    participantIds: [participant.id],
  });
  const lastReadAt = new Date().toISOString();
  await upsertChatReadState(db, primary, { channelId: channel.id, lastReadAt });
  await upsertNotificationReadState(db, primary, { lastReadAt });
  assert.equal((await listChatReadStates(db, primary))[0].channelId, channel.id);
  assert.equal((await listChatReadStates(db, other)).length, 0);
});
