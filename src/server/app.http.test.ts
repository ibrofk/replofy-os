import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, test } from 'node:test';
import type { Server } from 'node:http';
import type { AuthProvider, StandaloneAuthSession } from './platform/auth-provider.js';
import type { AssetStore } from './platform/asset-store.js';
import type { WorkspaceIdentityRepository } from './platform/workspace-repository.js';
import type { ServerConfig } from './config.js';
import { WorkspaceError } from './workspaces.js';
import { createServerApp } from './app.js';

const activeWorkspaceId = '11111111-1111-4111-8111-111111111111';
const blockedWorkspaceId = '22222222-2222-4222-8222-222222222222';

const config: ServerConfig = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 0,
  appUrl: 'http://127.0.0.1:0',
  trustedOrigins: ['http://127.0.0.1:0'],
  databaseUrl: 'postgres://replofy:password@127.0.0.1:5432/replofy',
  authSecret: 'auth-secret-at-least-thirty-two-characters',
  bootstrapToken: 'bootstrap-token-at-least-thirty-two-characters',
  dataDirectory: '.tmp/http-contract-test',
  assetStore: 'filesystem',
  secureCookies: false,
  invitationTtlHours: 168,
};

const assetStore: AssetStore = {
  provider: 'filesystem',
  async put() {
    return { size: 0 };
  },
  async get() {
    return null;
  },
  async delete() {
    return false;
  },
};

let currentSession: StandaloneAuthSession | null = null;
const authProvider: AuthProvider = {
  handler: (() => undefined) as AuthProvider['handler'],
  async getSession() {
    return currentSession;
  },
};

const workspaceRepository = {
  select: () => undefined,
  insert: () => undefined,
  update: () => undefined,
  delete: () => undefined,
  transaction: async () => undefined,
  execute: async () => undefined,
  async listUserWorkspaces(userId: string) {
    return [{
      id: activeWorkspaceId,
      name: 'HTTP Test Workspace',
      slug: 'http-test-workspace',
      role: 'owner' as const,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      userId,
    }];
  },
  async createWorkspace() {
    throw new Error('not used by this contract test');
  },
  async activateWorkspace() {
    throw new Error('not used by this contract test');
  },
  async resolveWorkspaceActor(userId: string, workspaceId: string | null | undefined) {
    if (workspaceId === blockedWorkspaceId) throw new WorkspaceError('Active workspace is unavailable.', 403);
    if (workspaceId !== activeWorkspaceId) throw new WorkspaceError('Select an active workspace before using workspace data.', 409);
    return { userId, workspaceId: activeWorkspaceId, role: 'owner' as const };
  },
} as unknown as WorkspaceIdentityRepository;

const app = createServerApp({ config, authProvider, workspaceRepository, assetStore });
const server = createServer(app);
let baseUrl = '';

const listening = new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') {
      reject(new Error('HTTP contract test server did not expose a TCP address.'));
      return;
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
    resolve();
  });
});

after(async () => {
  await listening;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('standalone HTTP routes enforce session/workspace boundaries and expose the API contract', async () => {
  await listening;

  let response = await fetch(`${baseUrl}/api/workspaces`);
  assert.equal(response.status, 401);

  currentSession = {
    user: { id: 'user-http-test', email: 'owner@example.com', name: 'HTTP Owner' },
    session: { id: 'session-http-test', activeWorkspaceId },
  };

  response = await fetch(`${baseUrl}/api/workspaces`);
  assert.equal(response.status, 200);
  const workspaces = await response.json() as { activeWorkspaceId?: string; workspaces?: Array<{ id: string }> };
  assert.equal(workspaces.activeWorkspaceId, activeWorkspaceId);
  assert.deepEqual(workspaces.workspaces?.map(({ id }) => id), [activeWorkspaceId]);

  response = await fetch(`${baseUrl}/api/v1`);
  assert.equal(response.status, 200);
  const api = await response.json() as { workspaceId?: string; resources?: string[]; capabilities?: { authentication?: string[] } };
  assert.equal(api.workspaceId, activeWorkspaceId);
  assert.ok(api.resources?.includes('tasks'));
  assert.deepEqual(api.capabilities?.authentication, ['session', 'api-key']);

  currentSession = {
    ...currentSession,
    session: { ...currentSession.session, activeWorkspaceId: blockedWorkspaceId },
  };
  response = await fetch(`${baseUrl}/api/v1`);
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'Active workspace is unavailable.' });
});
