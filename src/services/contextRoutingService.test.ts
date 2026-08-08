import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthorizedApiKeyActor } from './apiKeyServer.js';
import {
  assertContextDebugAuthorized,
  buildContextCatalogCacheKey,
  canAccessContextRecord,
  projectContextRecord,
  scoreContextCandidate,
} from './contextRoutingService.js';

function actor(overrides: Partial<AuthorizedApiKeyActor> = {}): AuthorizedApiKeyActor {
  return {
    key: {
      id: 'key-1',
      label: 'Test key',
      scopes: ['workspace:read'],
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'user-1',
      ownerUid: 'user-1',
      companyId: 'workspace-1',
      isActive: true,
      keyLast4: 'test',
    },
    companyId: 'workspace-1',
    ownerUid: 'user-1',
    ownerEmail: 'user@example.com',
    ownerRole: 'admin',
    ownerCompanyId: 'workspace-1',
    ...overrides,
  };
}

test('direct stored relationships attach at the highest confidence', () => {
  const anchor = projectContextRecord('tasks', {
    id: 'task-1',
    title: 'Ship context routing',
    cycleGoalId: 'goal-1',
    status: 'in-progress',
  });
  const candidate = projectContextRecord('cycle-goals', {
    id: 'goal-1',
    title: 'Reliable agent context',
    status: 'active',
  });

  const result = scoreContextCandidate(anchor, candidate, {
    nowMs: Date.parse('2026-06-05T00:00:00.000Z'),
  });

  assert.equal(result.score, 100);
  assert.equal(result.tier, 'attached');
  assert.equal(result.evidence[0]?.code, 'exact-id-link');
});

test('shared source-version and source lineage use deterministic confidence tiers', () => {
  const anchor = projectContextRecord('tasks', {
    id: 'task-1',
    title: 'Implement router',
    sourceIds: ['source-1'],
    sourceVersionIds: ['version-1'],
  });
  const sameVersion = projectContextRecord('visions', {
    id: 'vision-1',
    title: 'Context vision',
    sourceIds: ['source-1'],
    sourceVersionIds: ['version-1'],
  });
  const sameSource = projectContextRecord('feedbacks', {
    id: 'feedback-1',
    content: 'Context feedback',
    sourceIds: ['source-1'],
  });

  assert.equal(scoreContextCandidate(anchor, sameVersion).score, 90);
  assert.equal(scoreContextCandidate(anchor, sameSource).score, 80);
});

test('lexical-only matches remain suggestions and are capped after modifiers', () => {
  const now = Date.parse('2026-06-05T00:00:00.000Z');
  const anchor = projectContextRecord('tasks', {
    id: 'task-1',
    title: 'Deterministic context routing architecture',
  });
  const candidate = projectContextRecord('roadmap-items', {
    id: 'roadmap-1',
    title: 'Deterministic context routing architecture',
    description: 'Deterministic context routing architecture',
    status: 'building',
    updatedAt: '2026-06-04T00:00:00.000Z',
  });

  const result = scoreContextCandidate(anchor, candidate, { nowMs: now });

  assert.equal(result.lexicalOnly, true);
  assert.ok(result.score <= 79);
  assert.equal(result.tier, 'suggested');
  assert.deepEqual(
    result.modifiers.map((modifier) => modifier.code),
    ['active-status', 'recent-30d'],
  );
});

test('operator context pack content contributes token-overlap relevance', () => {
  const anchor = projectContextRecord('tasks', {
    id: 'task-1',
    title: 'Improve enterprise helpdesk escalation workflow',
  });
  const pack = projectContextRecord('operator-context-packs', {
    id: 'pack-1',
    title: 'Enterprise support operations',
    content: 'Helpdesk escalation workflow for enterprise support teams',
  });

  const result = scoreContextCandidate(anchor, pack);

  assert.equal(pack.searchText.includes('Helpdesk escalation workflow'), true);
  assert.equal(result.lexicalOnly, true);
  assert.equal(result.evidence.some((item) => item.code === 'token-overlap'), true);
});

test('full source content beyond the preview contributes token-overlap relevance', () => {
  const anchor = projectContextRecord('tasks', {
    id: 'task-1',
    title: 'Improve multilingual helpdesk routing accuracy',
  });
  const version = projectContextRecord('context-source-versions', {
    id: 'version-1',
    fileName: 'support-notes.md',
    contentPreview: 'General support notes without the relevant terms.',
    fullContent: `${'intro '.repeat(500)}Multilingual helpdesk routing accuracy for international support teams`,
    contentStorage: 'full',
    routingContentAvailable: true,
  });

  const result = scoreContextCandidate(anchor, version);

  assert.equal(version.searchText.includes('Multilingual helpdesk routing accuracy'), true);
  assert.equal(result.lexicalOnly, true);
  assert.equal(result.evidence.some((item) => item.code === 'token-overlap'), true);
});

test('explicit source links outrank full-text lexical relevance', () => {
  const anchor = projectContextRecord('tasks', {
    id: 'task-1',
    title: 'Improve multilingual helpdesk routing accuracy',
    sourceVersionIds: ['version-1'],
  });
  const version = projectContextRecord('context-source-versions', {
    id: 'version-1',
    fileName: 'support-notes.md',
    fullContent: 'Multilingual helpdesk routing accuracy',
  });

  const result = scoreContextCandidate(anchor, version);

  assert.equal(result.score, 100);
  assert.equal(result.tier, 'attached');
  assert.equal(result.evidence[0]?.code, 'exact-id-link');
});

test('operator context pack links attach directly to routed records', () => {
  const task = projectContextRecord('tasks', {
    id: 'task-1',
    title: 'Improve escalation',
  });
  const pack = projectContextRecord('operator-context-packs', {
    id: 'pack-1',
    title: 'Support operations',
    linkedTaskIds: ['task-1'],
  });

  const result = scoreContextCandidate(task, pack);

  assert.equal(result.score, 100);
  assert.equal(result.tier, 'attached');
  assert.equal(result.evidence[0]?.code, 'exact-id-link');
});

test('normal records can retrieve relevant operator knowledge across resource types', () => {
  const bug = projectContextRecord('bugs', {
    id: 'bug-1',
    title: 'Enterprise inbox messages fail during escalation',
    description: 'Helpdesk escalation loses enterprise inbox messages',
  });
  const desk = projectContextRecord('operator-desks', {
    id: 'desk-1',
    name: 'Enterprise inbox escalation',
    description: 'Helpdesk process for failed messages and escalation recovery',
  });
  const memory = projectContextRecord('operator-memories', {
    id: 'memory-1',
    title: 'Enterprise inbox recovery',
    content: 'Failed helpdesk messages require escalation recovery',
  });

  for (const candidate of [desk, memory]) {
    const result = scoreContextCandidate(bug, candidate);
    assert.equal(result.lexicalOnly, true);
    assert.equal(result.evidence.some((item) => item.code === 'token-overlap'), true);
  }
});

test('operator records attach to ordinary records through saved links', () => {
  const bug = projectContextRecord('bugs', {
    id: 'bug-1',
    title: 'Message delivery bug',
  });
  const workOrder = projectContextRecord('work-orders', {
    id: 'order-1',
    title: 'Investigate delivery',
    linkedBugIds: ['bug-1'],
  });

  const result = scoreContextCandidate(bug, workOrder);

  assert.equal(result.score, 100);
  assert.equal(result.tier, 'attached');
  assert.equal(result.evidence[0]?.code, 'exact-id-link');
});

test('scoring never mutates records or persists inferred relationships', () => {
  const anchor = projectContextRecord('tasks', {
    id: 'task-1',
    title: 'Context routing',
  });
  const candidate = projectContextRecord('bugs', {
    id: 'bug-1',
    title: 'Context routing issue',
  });
  const before = JSON.stringify({ anchor, candidate });

  scoreContextCandidate(anchor, candidate);

  assert.equal(JSON.stringify({ anchor, candidate }), before);
});

test('cache keys partition every security and query-shape dimension', () => {
  const base = {
    workspaceId: 'workspace-1',
    actorIdentity: 'user-1:key-1',
    authMode: 'api-key',
    scopes: ['workspace:read'],
    permissions: ['role:admin', 'workspace:company'],
    registryVersion: 'registry-1',
    queryShape: {
      candidateResources: ['tasks'],
      filters: {},
      limits: { lexical: 200 },
    },
  };
  const baseHash = buildContextCatalogCacheKey(base).hash;
  const variants = [
    { ...base, workspaceId: 'workspace-2' },
    { ...base, actorIdentity: 'user-2:key-2' },
    { ...base, authMode: 'oauth' },
    { ...base, scopes: ['systems:read', 'workspace:read'] },
    { ...base, permissions: ['role:member', 'workspace:company'] },
    { ...base, registryVersion: 'registry-2' },
    { ...base, queryShape: { ...base.queryShape, limits: { lexical: 100 } } },
  ];

  for (const variant of variants) {
    assert.notEqual(buildContextCatalogCacheKey(variant).hash, baseHash);
  }
  assert.equal(
    buildContextCatalogCacheKey({ ...base, scopes: ['workspace:read'] }).hash,
    baseHash,
  );
});

test('workspace access filtering rejects records from other workspaces', () => {
  const admin = actor();
  assert.equal(
    canAccessContextRecord(
      { scopeMode: 'companyOrAuthor' },
      admin,
      'task-1',
      { companyId: 'workspace-1', authorId: 'user-2' },
    ),
    true,
  );
  assert.equal(
    canAccessContextRecord(
      { scopeMode: 'companyOrAuthor' },
      admin,
      'task-2',
      { companyId: 'workspace-2', authorId: 'user-1' },
    ),
    false,
  );
});

test('debug authorization requires admin role even with broad scopes', () => {
  assert.doesNotThrow(() => assertContextDebugAuthorized(actor()));

  const member = actor({
    ownerRole: 'member',
    key: {
      ...actor().key,
      scopes: [
        'workspace:read',
        'workspace:write',
        'systems:read',
        'systems:write',
        'identity:read',
        'identity:write',
      ],
    },
  });
  assert.throws(
    () => assertContextDebugAuthorized(member),
    /requires an admin actor/,
  );
});
