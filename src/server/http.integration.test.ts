import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import { createServerApp } from './app.js';
import { createLocalAuth } from './auth.js';
import { loadServerConfig } from './config.js';
import { createPostgresDatabase } from './db/client.js';
import {
  blogArticle,
  creativeAsset,
  creativeItem,
  cycleGoal,
  instanceBootstrap,
  operatorDesk,
  standaloneApiKey,
  task,
  teamChatChannel,
  teamChatMessage,
  teamChatParticipant,
  user,
  workspace,
  workspaceMembership,
} from './db/schema.js';
import { createTask } from './execution/tasks.js';
import { BetterAuthProvider } from './platform/auth-provider.js';
import { FilesystemAssetStore } from './platform/filesystem-asset-store.js';
import { DrizzleWorkspaceRepository } from './platform/workspace-repository.js';

const config = loadServerConfig();
const { db, pool } = createPostgresDatabase(config.databaseUrl);
const runId = randomUUID();
let userId = '';
let workspaceId = '';
let createdTaskId = '';
let createdGoalId = '';
let createdArticleId = '';
let createdDeskId = '';
let createdParticipantId = '';
let createdChannelId = '';
let createdMessageId = '';
let createdCreativeItemId = '';
let createdAssetId = '';
let isolatedTaskId = '';
let apiKeyId = '';
const otherWorkspaceId = randomUUID();
const email = `http-${runId.slice(0, 8)}@example.com`;
const password = 'http-integration-password';
const workspaceSlug = `http-${runId.slice(0, 8)}`;
const assetDirectory = path.resolve('.tmp', `http-integration-${runId}`);
const preserveFixtures = process.env.REPLOFY_PRESERVE_HTTP_FIXTURES === '1';
const reconnectFixtureFile = process.env.REPLOFY_HTTP_RECONNECT_FIXTURE_FILE?.trim();
const assetStore = new FilesystemAssetStore(assetDirectory);
const workspaceRepository = new DrizzleWorkspaceRepository(db);

let server: Server | null = null;
let serverIsListening = false;
let baseUrl = '';
let sessionCookie = '';

function cookieValues(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() || (response.headers.get('set-cookie') ? [response.headers.get('set-cookie') as string] : []);
  return values.map((value) => value.split(';', 1)[0]).filter(Boolean).join('; ');
}

async function startServer() {
  const authProvider = new BetterAuthProvider(createLocalAuth(config, db));
  const app = createServerApp({
    config,
    authProvider,
    workspaceRepository,
    assetStore,
  });
  server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server?.once('error', reject);
    server?.listen(0, '127.0.0.1', () => {
      const address = server?.address();
      if (!address || typeof address === 'string') {
        reject(new Error('HTTP integration server did not expose a TCP address.'));
        return;
      }
      baseUrl = `http://127.0.0.1:${address.port}`;
      serverIsListening = true;
      resolve();
    });
  });
}

async function stopServer() {
  if (!server || !serverIsListening) return;
  const runningServer = server;
  server = null;
  serverIsListening = false;
  await new Promise<void>((resolve, reject) => runningServer.close((error) => error ? reject(error) : resolve()));
}

async function request(
  pathname: string,
  method = 'GET',
  body?: unknown,
  headers: Record<string, string> = {},
  includeSession = true,
) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set('origin', config.appUrl);
  if (includeSession && sessionCookie && !requestHeaders.has('cookie')) requestHeaders.set('cookie', sessionCookie);
  const requestBody = body === undefined ? undefined : JSON.stringify(body);
  if (requestBody !== undefined) requestHeaders.set('content-type', 'application/json');
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: requestHeaders,
    body: requestBody,
  });
  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  return { response, payload };
}

async function binaryRequest(
  pathname: string,
  body: Uint8Array,
  headers: Record<string, string> = {},
) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set('origin', config.appUrl);
  if (sessionCookie && !requestHeaders.has('cookie')) requestHeaders.set('cookie', sessionCookie);
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: requestHeaders,
    body,
  });
  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  return { response, payload };
}

after(async () => {
  await stopServer();
  if (preserveFixtures) {
    try {
      if (reconnectFixtureFile) {
        if (!sessionCookie || !createdTaskId) {
          throw new Error('Reconnect fixture requested but the HTTP test did not create a session and task.');
        }
        await writeFile(reconnectFixtureFile, JSON.stringify({
          sessionCookie,
          taskId: createdTaskId,
          taskTitle: 'HTTP persisted task',
          taskStatus: 'done',
        }), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      }
    } finally {
      await pool.end();
      await rm(assetDirectory, { recursive: true, force: true });
    }
    return;
  }
  if (createdMessageId) await db.delete(teamChatMessage).where(eq(teamChatMessage.id, createdMessageId));
  if (createdChannelId) await db.delete(teamChatChannel).where(eq(teamChatChannel.id, createdChannelId));
  if (createdParticipantId) await db.delete(teamChatParticipant).where(eq(teamChatParticipant.id, createdParticipantId));
  if (createdAssetId) await db.delete(creativeAsset).where(eq(creativeAsset.id, createdAssetId));
  if (createdCreativeItemId) await db.delete(creativeItem).where(eq(creativeItem.id, createdCreativeItemId));
  if (createdArticleId) await db.delete(blogArticle).where(eq(blogArticle.id, createdArticleId));
  if (createdDeskId) await db.delete(operatorDesk).where(eq(operatorDesk.id, createdDeskId));
  if (createdGoalId) await db.delete(cycleGoal).where(eq(cycleGoal.id, createdGoalId));
  const taskIds = [createdTaskId, isolatedTaskId].filter(Boolean);
  if (taskIds.length > 0) await db.delete(task).where(inArray(task.id, taskIds));
  if (apiKeyId) await db.delete(standaloneApiKey).where(eq(standaloneApiKey.id, apiKeyId));
  const workspaceIds = [workspaceId, otherWorkspaceId].filter(Boolean);
  if (workspaceIds.length > 0) await db.delete(workspace).where(inArray(workspace.id, workspaceIds));
  if (userId) {
    await db.delete(instanceBootstrap).where(eq(instanceBootstrap.id, 'instance'));
    await db.delete(user).where(eq(user.id, userId));
  }
  await pool.end();
  await rm(assetDirectory, { recursive: true, force: true });
});

test('standalone HTTP flow proves Better Auth, CRUD, API keys, isolation, and restart persistence', async () => {
  await startServer();

  let result = await request('/health/ready');
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload, { ok: true, database: 'ready' });

  result = await request('/api/setup/status');
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload, { needsBootstrap: true });

  result = await request('/api/setup/bootstrap', 'POST', {
    token: 'wrong-bootstrap-token',
    name: 'HTTP Integration Owner',
    email,
    password,
    workspaceName: 'HTTP Integration Workspace',
    workspaceSlug,
  });
  assert.equal(result.response.status, 403);

  result = await request('/api/setup/bootstrap', 'POST', {
    token: config.bootstrapToken,
    name: 'HTTP Integration Owner',
    email,
    password,
    workspaceName: 'HTTP Integration Workspace',
    workspaceSlug,
  });
  assert.equal(result.response.status, 201);
  const bootstrap = result.payload as { user: { id: string }; workspace: { id: string } };
  userId = bootstrap.user.id;
  workspaceId = bootstrap.workspace.id;

  await db.insert(workspace).values({
    id: otherWorkspaceId,
    name: 'HTTP Isolation Workspace',
    slug: `http-other-${randomUUID().slice(0, 8)}`,
  });
  await db.insert(workspaceMembership).values({ workspaceId: otherWorkspaceId, userId, role: 'owner' });

  result = await request('/api/workspaces');
  assert.equal(result.response.status, 401);

  result = await request('/api/auth/sign-in/email', 'POST', { email, password });
  assert.ok(result.response.ok, `email sign-in failed with ${result.response.status}`);
  sessionCookie = cookieValues(result.response);
  assert.ok(sessionCookie, 'Better Auth sign-in did not return a session cookie.');

  result = await request(`/api/workspaces/${workspaceId}/activate`, 'POST', {});
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload, { activeWorkspaceId: workspaceId, role: 'owner' });

  result = await request('/api/v1/tasks', 'POST', { title: 'HTTP persisted task', status: 'todo', effortPoints: 2 });
  assert.equal(result.response.status, 201);
  const createdTask = result.payload as { id: string; workspaceId: string; title: string };
  createdTaskId = createdTask.id;
  assert.equal(createdTask.workspaceId, workspaceId);
  assert.equal(createdTask.title, 'HTTP persisted task');

  result = await request(`/api/v1/tasks/${createdTask.id}`, 'PATCH', { status: 'done' });
  assert.equal(result.response.status, 200);
  assert.equal((result.payload as { status: string }).status, 'done');

  result = await request('/api/v1/api-keys', 'POST', {
    label: 'HTTP integration key',
    scopes: ['execution:read', 'execution:write'],
  });
  assert.equal(result.response.status, 201);
  const apiKey = result.payload as { id: string; key: string };
  apiKeyId = apiKey.id;
  assert.match(apiKey.key, /^rpo_local_/);

  result = await request('/api/v1/tasks', 'GET', undefined, { authorization: `Bearer ${apiKey.key}` }, false);
  assert.equal(result.response.status, 200);
  const apiTasks = (result.payload as { data: Array<{ id: string }> }).data;
  assert.equal(apiTasks.some(({ id }) => id === createdTask.id), true);

  result = await request('/api/v1/cycle-goals', 'POST', {
    title: 'HTTP persisted cycle goal',
    description: 'Survives an API restart.',
  });
  assert.equal(result.response.status, 201);
  createdGoalId = (result.payload as { id: string }).id;

  result = await request('/api/v1/blog-articles', 'POST', {
    title: 'HTTP persisted article',
    summary: 'Survives an API restart.',
    status: 'drafting',
  });
  assert.equal(result.response.status, 201);
  createdArticleId = (result.payload as { id: string }).id;

  result = await request('/api/v1/operator-desks', 'POST', {
    name: 'HTTP persisted desk',
    mission: 'Survive an API restart.',
    allowedOutputTypes: ['execution_task'],
    connectedExternalAgents: ['integration-test'],
  });
  assert.equal(result.response.status, 201);
  createdDeskId = (result.payload as { id: string }).id;

  result = await request('/api/v1/team-chat-participants', 'POST', {
    displayName: 'HTTP Restart Agent',
    participantType: 'ai-agent',
    description: 'Restart persistence fixture.',
  });
  assert.equal(result.response.status, 201);
  createdParticipantId = (result.payload as { id: string }).id;

  result = await request('/api/v1/team-chat-channels', 'POST', {
    name: 'http-restart-room',
    topic: 'Restart persistence',
    participantIds: [createdParticipantId],
  });
  assert.equal(result.response.status, 201);
  createdChannelId = (result.payload as { id: string }).id;

  result = await request('/api/v1/team-chat-messages', 'POST', {
    channelId: createdChannelId,
    participantId: createdParticipantId,
    content: 'This message must survive restart.',
  });
  assert.equal(result.response.status, 201);
  createdMessageId = (result.payload as { id: string }).id;

  result = await request('/api/v1/creative-items', 'POST', {
    title: 'HTTP persisted creative item',
    platform: 'LinkedIn',
    format: 'single-post',
    status: 'idea',
  });
  assert.equal(result.response.status, 201);
  createdCreativeItemId = (result.payload as { id: string }).id;

  const assetPayload = Buffer.from('HTTP restart asset');
  result = await binaryRequest('/api/v1/creative-assets/upload', assetPayload, {
    'x-file-name': 'restart-proof.txt',
    'x-file-content-type': 'text/plain',
    'x-file-size': String(assetPayload.length),
    'x-asset-title': 'HTTP restart proof',
    'x-creative-id': createdCreativeItemId,
    'x-asset-type': 'document',
  });
  assert.equal(result.response.status, 201);
  createdAssetId = (result.payload as { id: string }).id;

  result = await request('/api/v1/tasks', 'GET', undefined, { authorization: 'Bearer rpo_local_invalid' }, false);
  assert.equal(result.response.status, 401);

  const isolatedTask = await createTask(db, {
    userId,
    workspaceId: otherWorkspaceId,
    role: 'owner',
  }, { title: 'Other workspace task' });
  isolatedTaskId = isolatedTask.id;
  result = await request(`/api/v1/tasks/${isolatedTask.id}`);
  assert.equal(result.response.status, 404);
  result = await request(`/api/v1/tasks/${isolatedTask.id}`, 'GET', undefined, { authorization: `Bearer ${apiKey.key}` }, false);
  assert.equal(result.response.status, 404);
  result = await request('/api/v1/tasks', 'GET', undefined, { authorization: `Bearer ${apiKey.key}` }, false);
  assert.equal((result.payload as { data: Array<{ id: string }> }).data.some(({ id }) => id === isolatedTask.id), false);

  await stopServer();
  await startServer();
  result = await request('/health/ready');
  assert.equal(result.response.status, 200);
  result = await request('/api/v1/tasks', 'GET', undefined, { authorization: `Bearer ${apiKey.key}` }, false);
  assert.equal(result.response.status, 200);
  assert.equal((result.payload as { data: Array<{ id: string; status: string }> }).data.find(({ id }) => id === createdTask.id)?.status, 'done');

  result = await request(`/api/v1/cycle-goals/${createdGoalId}`);
  assert.equal(result.response.status, 200);
  assert.equal((result.payload as { data: { title: string } }).data.title, 'HTTP persisted cycle goal');

  result = await request(`/api/v1/blog-articles/${createdArticleId}`);
  assert.equal(result.response.status, 200);
  assert.equal((result.payload as { data: { title: string } }).data.title, 'HTTP persisted article');

  result = await request(`/api/v1/operator-desks/${createdDeskId}`);
  assert.equal(result.response.status, 200);
  assert.equal((result.payload as { data: { name: string } }).data.name, 'HTTP persisted desk');

  result = await request('/api/v1/team-chat-channels');
  assert.equal(result.response.status, 200);
  assert.equal((result.payload as { data: Array<{ id: string }> }).data.some(({ id }) => id === createdChannelId), true);

  result = await request(`/api/v1/team-chat/messages?channelId=${createdChannelId}`);
  assert.equal(result.response.status, 200);
  assert.equal(
    (result.payload as { data: Array<{ content: string }> }).data.some(({ content }) => content === 'This message must survive restart.'),
    true,
  );

  result = await request(`/api/v1/creative-items/${createdCreativeItemId}`);
  assert.equal(result.response.status, 200);
  assert.equal((result.payload as { title: string }).title, 'HTTP persisted creative item');

  result = await request(`/api/v1/creative-assets/${createdAssetId}/content`);
  assert.equal(result.response.status, 200);
  assert.equal(result.response.headers.get('content-type'), 'text/plain');
  assert.equal(result.payload, 'HTTP restart asset');

  result = await request(`/api/v1/api-keys/${apiKey.id}`, 'DELETE');
  assert.equal(result.response.status, 200);
  result = await request('/api/v1/tasks', 'GET', undefined, { authorization: `Bearer ${apiKey.key}` }, false);
  assert.equal(result.response.status, 401);
});
