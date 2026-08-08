import { createHash } from 'crypto';
import { getAdminFirestore } from '../src/services/apiKeyServer.ts';
import { ApiKeyServerError } from '../src/services/apiKeyServer.ts';
import { handleExternalApiRequest } from '../src/services/externalApiServer.ts';

const runId = Date.now().toString(36);
const companyId = `team-chat-mcp-smoke-${runId}`;
const ownerUid = `team-chat-mcp-owner-${runId}`;
const keyId = `team-chat-mcp-key-${runId}`;
const rawKey = `ros_live_${createHash('sha256').update(runId).digest('hex')}`;
const headers = { 'x-api-key': rawKey };
const db = getAdminFirestore();
const collections = ['teamChatChannels', 'teamChatParticipants', 'teamChatMessages'];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
try {
  await db.collection('users').doc(ownerUid).set({
    role: 'master-admin',
    companyId,
    email: `${ownerUid}@example.com`,
  });
  await db.collection('apiKeys').doc(keyId).set({
    keyHash: createHash('sha256').update(rawKey).digest('hex'),
    label: 'Team Chat MCP smoke',
    scopes: ['workspace:read', 'workspace:write'],
    createdAt: new Date().toISOString(),
    createdBy: ownerUid,
    ownerUid,
    companyId,
    isActive: true,
    keyLast4: rawKey.slice(-4),
    lastUsedAt: null,
    revokedAt: null,
  });

  const index = await handleExternalApiRequest(headers, 'GET', '/api/v1', {});
  const resources = (index.body as { resources: Array<{ resource: string }> }).resources.map((item) => item.resource);
  assert(resources.includes('team-chat-channels'), 'team-chat-channels missing from API discovery');
  assert(resources.includes('team-chat-participants'), 'team-chat-participants missing from API discovery');
  assert(resources.includes('team-chat-messages'), 'team-chat-messages missing from API discovery');

  const participant = await handleExternalApiRequest(headers, 'POST', '/api/v1/team-chat-participants', {
    displayName: 'Release Agent',
    participantType: 'ai-agent',
    description: 'Coordinates releases.',
  });
  assert(participant.statusCode === 201, 'team chat identity create failed');
  const participantId = (participant.body as { data: { id: string } }).data.id;

  const unassignedParticipant = await handleExternalApiRequest(headers, 'POST', '/api/v1/team-chat-participants', {
    displayName: 'Unassigned Agent',
    participantType: 'ai-agent',
  });
  const unassignedParticipantId = (unassignedParticipant.body as { data: { id: string } }).data.id;

  const channel = await handleExternalApiRequest(headers, 'POST', '/api/v1/team-chat-channels', {
    name: 'release-room',
    topic: 'Production release coordination',
  });
  assert(channel.statusCode === 201, 'team chat channel create failed');
  const channelId = (channel.body as { data: { id: string } }).data.id;

  let rejectedUnassignedPost = false;
  try {
    await handleExternalApiRequest(headers, 'POST', '/api/v1/team-chat-messages', {
      channelId,
      participantId: unassignedParticipantId,
      content: 'This must be rejected.',
    });
  } catch (error) {
    rejectedUnassignedPost = error instanceof ApiKeyServerError && error.statusCode === 400;
  }
  assert(rejectedUnassignedPost, 'unassigned identity was allowed to post');

  const membership = await handleExternalApiRequest(
    headers,
    'POST',
    `/api/v1/team-chat/channels/${channelId}/participants`,
    { participantId },
  );
  const memberIds = (membership.body as { data: { participantIds: string[] } }).data.participantIds;
  assert(memberIds.includes(participantId), 'atomic channel membership update failed');

  const firstCreatedAt = new Date(Date.now() - 1_000).toISOString();
  const firstMessage = await handleExternalApiRequest(headers, 'POST', '/api/v1/team-chat-messages', {
    channelId,
    participantId,
    content: 'Release candidate is ready for verification.',
  });
  assert(firstMessage.statusCode === 201, 'team chat message create failed');
  const firstMessageId = (firstMessage.body as { data: { id: string } }).data.id;

  await handleExternalApiRequest(headers, 'POST', '/api/v1/team-chat-messages', {
    channelId,
    participantId,
    content: 'Verification passed. Deploy production.',
    replyToMessageId: firstMessageId,
  });

  const filtered = await handleExternalApiRequest(
    headers,
    'GET',
    `/api/v1/team-chat/messages?channelId=${channelId}&participantType=ai-agent&after=${encodeURIComponent(firstCreatedAt)}&query=verification&limit=1`,
    {},
  );
  const filteredBody = filtered.body as {
    data: Array<{ senderName: string; content: string }>;
    hasMore: boolean;
    nextBefore: string | null;
  };
  assert(filteredBody.data.length === 1, 'time and text filtered message listing returned the wrong size');
  assert(filteredBody.data[0].senderName === 'Release Agent', 'message sender snapshot was not populated');
  assert(filteredBody.hasMore, 'bounded listing did not advertise additional results');
  assert(typeof filteredBody.nextBefore === 'string', 'bounded listing did not return a pagination cursor');

  await handleExternalApiRequest(headers, 'PATCH', `/api/v1/team-chat-participants/${participantId}`, {
    displayName: 'Production Agent',
  });
  const history = await handleExternalApiRequest(headers, 'GET', `/api/v1/team-chat/messages?channelId=${channelId}`, {});
  assert(
    (history.body as { data: Array<{ senderName: string }> }).data.every((message) => message.senderName === 'Release Agent'),
    'historical sender snapshots changed after participant rename',
  );

  console.log('Team Chat MCP external API smoke test passed.');
} finally {
  for (const collectionName of collections) {
    const snapshot = await db.collection(collectionName).where('companyId', '==', companyId).get();
    for (const document of snapshot.docs) await document.ref.delete();
  }
  await db.collection('apiKeys').doc(keyId).delete().catch(() => undefined);
  await db.collection('users').doc(ownerUid).delete().catch(() => undefined);
}
