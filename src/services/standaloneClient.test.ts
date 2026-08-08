import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { standaloneClient, StandaloneApiError } from './standaloneClient';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('standalone client sends same-origin credentials and JSON mutations', async () => {
  let captured: { input: RequestInfo | URL; init?: RequestInit } | undefined;
  globalThis.fetch = (async (input, init) => {
    captured = { input, init };
    return new Response(JSON.stringify({ id: 'task-id', title: 'Ship it' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  await standaloneClient.createTask({ title: 'Ship it' });
  assert.equal(captured?.input, '/api/v1/tasks');
  assert.equal(captured?.init?.method, 'POST');
  assert.equal(captured?.init?.credentials, 'include');
  assert.equal(new Headers(captured?.init?.headers).get('Content-Type'), 'application/json');
  assert.deepEqual(JSON.parse(String(captured?.init?.body)), { title: 'Ship it' });
});

test('standalone client preserves structured API failures', async () => {
  globalThis.fetch = (async () => new Response(
    JSON.stringify({ error: 'Select an active workspace before using workspace data.' }),
    { status: 409, headers: { 'Content-Type': 'application/json' } },
  )) as typeof fetch;

  await assert.rejects(
    standaloneClient.listTasks(),
    (error: unknown) =>
      error instanceof StandaloneApiError &&
      error.statusCode === 409 &&
      error.message.includes('active workspace'),
  );
});

test('standalone invitation client uses the public join route and authenticated management route', async () => {
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  globalThis.fetch = (async (input, init) => {
    requests.push({ input, init });
    return new Response(JSON.stringify({
      id: 'invite-id',
      email: 'member@example.com',
      role: 'member',
      status: 'pending',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      acceptUrl: 'http://localhost:4100/join?token=clear-token',
    }), {
      status: init?.method === 'POST' ? 201 : 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  await standaloneClient.createInvitation({ email: 'member@example.com', role: 'member' });
  await standaloneClient.invitation('clear token');

  assert.equal(requests[0]?.input, '/api/v1/invitations');
  assert.equal(requests[0]?.init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    email: 'member@example.com',
    role: 'member',
  });
  assert.equal(requests[1]?.input, '/api/invitations/clear%20token');
  assert.equal(requests[1]?.init?.credentials, 'include');
});

test('standalone API key client creates and revokes keys through session-only routes', async () => {
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  globalThis.fetch = (async (input, init) => {
    requests.push({ input, init });
    return new Response(JSON.stringify(
      init?.method === 'DELETE'
        ? { id: '8d13dfbb-5529-4ae9-bbab-8636a9d7e719', revoked: true }
        : {
            id: '8d13dfbb-5529-4ae9-bbab-8636a9d7e719',
            label: 'MCP',
            prefix: 'rpo_local_example',
            scopes: ['execution:read'],
            key: 'rpo_local_secret',
          },
    ), { status: init?.method === 'POST' ? 201 : 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  await standaloneClient.createApiKey({ label: 'MCP', scopes: ['execution:read'] });
  await standaloneClient.revokeApiKey('8d13dfbb-5529-4ae9-bbab-8636a9d7e719');

  assert.equal(requests[0]?.input, '/api/v1/api-keys');
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    label: 'MCP',
    scopes: ['execution:read'],
  });
  assert.equal(
    requests[1]?.input,
    '/api/v1/api-keys/8d13dfbb-5529-4ae9-bbab-8636a9d7e719',
  );
  assert.equal(requests[1]?.init?.method, 'DELETE');
});

test('standalone Team Chat client uses MCP-compatible message routes', async () => {
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  globalThis.fetch = (async (input, init) => {
    requests.push({ input, init });
    return new Response(JSON.stringify(
      init?.method === 'POST'
        ? { id: 'message-id', channelId: 'channel-id', participantId: 'participant-id', content: 'Ship it' }
        : { data: [] },
    ), { status: init?.method === 'POST' ? 201 : 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  await standaloneClient.listTeamChatMessages('channel id');
  await standaloneClient.createTeamChatMessage({
    channelId: 'channel-id',
    participantId: 'participant-id',
    content: 'Ship it',
  });

  assert.equal(requests[0]?.input, '/api/v1/team-chat/messages?channelId=channel%20id&limit=100');
  assert.equal(requests[1]?.input, '/api/v1/team-chat-messages');
  assert.equal(requests[1]?.init?.method, 'POST');
});

test('standalone content client uses the public blog article contract', async () => {
  let captured: { input: RequestInfo | URL; init?: RequestInit } | undefined;
  globalThis.fetch = (async (input, init) => {
    captured = { input, init };
    return new Response(JSON.stringify({
      id: 'article-id',
      title: 'Portable by default',
      slug: 'portable-by-default',
      status: 'idea',
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  await standaloneClient.createBlogArticle({
    title: 'Portable by default',
    tags: ['open-source'],
  });

  assert.equal(captured?.input, '/api/v1/blog-articles');
  assert.equal(captured?.init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(captured?.init?.body)), {
    title: 'Portable by default',
    tags: ['open-source'],
  });
});

test('standalone strategy client uses workspace-scoped CRUD routes', async () => {
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  globalThis.fetch = (async (input, init) => {
    requests.push({ input, init });
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  await standaloneClient.listPrompts();
  await standaloneClient.createSocialPost({ content: 'Portable release note.' });
  await standaloneClient.updateSeoKeyword('keyword-id', { intent: 'medium' });
  await standaloneClient.listFeedback();
  await standaloneClient.createTimeBlock({ title: 'Evidence review', startTime: '09:00', endTime: '10:00' });
  await standaloneClient.listWeekMarkers();

  assert.deepEqual(requests.map((request) => request.input), [
    '/api/v1/prompts',
    '/api/v1/social-posts',
    '/api/v1/seo-keywords/keyword-id',
    '/api/v1/feedbacks',
    '/api/v1/time-blocks',
    '/api/v1/week-markers',
  ]);
  assert.equal(requests[1]?.init?.method, 'POST');
  assert.equal(requests[2]?.init?.method, 'PATCH');
});

test('standalone operator client preserves claim ownership payloads', async () => {
  let captured: { input: RequestInfo | URL; init?: RequestInit } | undefined;
  globalThis.fetch = (async (input, init) => {
    captured = { input, init };
    return new Response(JSON.stringify({
      id: 'work-order-id',
      status: 'claimed',
      claimedBy: 'codex',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  await standaloneClient.claimOperatorWorkOrder('work order', 'codex');

  assert.equal(captured?.input, '/api/v1/operator-work-orders/work%20order/claim');
  assert.equal(captured?.init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(captured?.init?.body)), { externalAgentName: 'codex' });
});

test('standalone approval client sends explicit rejection reasons', async () => {
  let captured: { input: RequestInfo | URL; init?: RequestInit } | undefined;
  globalThis.fetch = (async (input, init) => {
    captured = { input, init };
    return new Response(JSON.stringify({
      data: { id: 'approval-id', status: 'rejected' },
      idempotent: false,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  await standaloneClient.rejectOperatorApproval('approval id', 'Insufficient evidence.');

  assert.equal(captured?.input, '/api/v1/operator-approvals/approval%20id/reject');
  assert.deepEqual(JSON.parse(String(captured?.init?.body)), { reason: 'Insufficient evidence.' });
});

test('standalone creative uploads preserve binary bodies and file metadata', async () => {
  let captured: { input: RequestInfo | URL; init?: RequestInit } | undefined;
  globalThis.fetch = (async (input, init) => {
    captured = { input, init };
    return new Response(JSON.stringify({
      id: 'asset-id',
      fileName: 'launch.txt',
      mimeType: 'text/plain',
      provider: 'filesystem',
      status: 'active',
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  const file = new File(['portable'], 'launch.txt', { type: 'text/plain' });

  await standaloneClient.uploadCreativeAsset(file, { creativeId: 'creative-id' });

  assert.equal(captured?.input, '/api/v1/creative-assets/upload');
  assert.equal(captured?.init?.method, 'POST');
  assert.equal(captured?.init?.body, file);
  const headers = new Headers(captured?.init?.headers);
  assert.equal(headers.get('Content-Type'), 'application/octet-stream');
  assert.equal(headers.get('X-File-Name'), 'launch.txt');
  assert.equal(headers.get('X-File-Content-Type'), 'text/plain');
  assert.equal(headers.get('X-File-Size'), '8');
  assert.equal(headers.get('X-Creative-Id'), 'creative-id');
});

test('standalone growth client uses MCP-compatible account and lead resources', async () => {
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  globalThis.fetch = (async (input, init) => {
    requests.push({ input, init });
    return new Response(JSON.stringify({
      id: init?.method === 'POST' && String(input).endsWith('/leads') ? 'lead-id' : 'account-id',
      name: 'Portable Company',
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  await standaloneClient.createAccount({ name: 'Portable Company', status: 'prospect' });
  await standaloneClient.createLead({
    name: 'Ada Founder',
    accountId: 'account-id',
    stage: 'qualified',
  });

  assert.equal(requests[0]?.input, '/api/v1/accounts');
  assert.equal(requests[1]?.input, '/api/v1/leads');
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
    name: 'Ada Founder',
    accountId: 'account-id',
    stage: 'qualified',
  });
});

test('standalone technical client uses generic MCP resource routes', async () => {
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  globalThis.fetch = (async (input, init) => {
    requests.push({ input, init });
    return new Response(JSON.stringify({ id: 'technical-id', title: 'Portable release' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  await standaloneClient.createBug({ title: 'Portable release bug', severity: 'high' });
  await standaloneClient.createRoadmapItem({ title: 'Portable release', phase: 'now' });

  assert.equal(requests[0]?.input, '/api/v1/bugs');
  assert.equal(requests[1]?.input, '/api/v1/roadmap-items');
});

test('standalone Systems client preserves endpoint and release action contracts', async () => {
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  globalThis.fetch = (async (input, init) => {
    requests.push({ input, init });
    return new Response(JSON.stringify({ environment: { id: 'env-id', version: 'v1.1.0' }, deployment: { id: 'deployment-id' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  await standaloneClient.listApiEndpoints();
  await standaloneClient.createApiEndpoint({ path: '/api/v1/systems', description: 'Systems inventory.' });
  await standaloneClient.deployEnvironment('env-id', { version: 'v1.1.0' });
  await standaloneClient.rollbackEnvironment('env-id');

  assert.equal(requests[0]?.input, '/api/v1/api-endpoints');
  assert.equal(requests[1]?.input, '/api/v1/api-endpoints');
  assert.equal(requests[2]?.input, '/api/v1/environments/env-id/deploy');
  assert.deepEqual(JSON.parse(String(requests[2]?.init?.body)), { version: 'v1.1.0' });
  assert.equal(requests[3]?.input, '/api/v1/environments/env-id/rollback');
});

test('standalone planning client preserves revision and context review routes', async () => {
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  globalThis.fetch = (async (input, init) => {
    requests.push({ input, init });
    return new Response(JSON.stringify({ id: 'record-id', title: 'Plan' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  await standaloneClient.createBusinessPlan({ title: 'Portable plan' });
  await standaloneClient.updateBusinessPlan('plan-id', { content: '# Plan' });
  await standaloneClient.ingestContext({ fileName: 'notes.md', content: '# Notes' });
  await standaloneClient.updateContextSourceItem('item-id', 'accepted');

  assert.equal(requests[0]?.input, '/api/v1/business-plans');
  assert.equal(requests[1]?.input, '/api/v1/business-plans/plan-id');
  assert.equal(requests[2]?.input, '/api/v1/context-ingestions');
  assert.equal(requests[3]?.input, '/api/v1/context-source-items/item-id');
  assert.deepEqual(JSON.parse(String(requests[3]?.init?.body)), { status: 'accepted' });
});
