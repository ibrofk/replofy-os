import { createHash } from 'crypto';
import { getAdminFirestore, ApiKeyServerError } from '../src/services/apiKeyServer.ts';
import { handleExternalApiRequest } from '../src/services/externalApiServer.ts';

const runId = Date.now().toString(36);
const companyId = `operator-mcp-smoke-${runId}`;
const ownerUid = `operator-mcp-owner-${runId}`;
const keyId = `operator-mcp-key-${runId}`;
const rawKey = `ros_live_${createHash('sha256').update(runId).digest('hex')}`;
const headers = { 'x-api-key': rawKey };
const db = getAdminFirestore();
const scopedCollections = [
  'operatorDesks',
  'operatorWorkOrders',
  'operatorMemories',
  'operatorOutputs',
  'operatorInjections',
  'operatorApprovals',
  'operatorAuditLogs',
  'tasks',
  'bugs',
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectApiError(action: () => Promise<unknown>, statusCode: number, messageIncludes: string) {
  try {
    await action();
  } catch (error) {
    assert(error instanceof ApiKeyServerError, `expected ApiKeyServerError for ${messageIncludes}`);
    assert(error.statusCode === statusCode, `expected ${statusCode}, got ${error.statusCode}: ${error.message}`);
    assert(error.message.includes(messageIncludes), `expected error to mention "${messageIncludes}", got "${error.message}"`);
    return;
  }
  throw new Error(`expected API error ${statusCode}: ${messageIncludes}`);
}

try {
  await db.collection('users').doc(ownerUid).set({
    role: 'member',
    companyId,
    email: `${ownerUid}@example.com`,
  });
  await db.collection('apiKeys').doc(keyId).set({
    keyHash: createHash('sha256').update(rawKey).digest('hex'),
    label: 'Operator MCP smoke',
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
  const indexBody = index.body as {
    resources: Array<{ resource: string; methods: string[] }>;
    actions: Array<{ action?: string }>;
  };
  const deskResource = indexBody.resources.find((item) => item.resource === 'operator-desks');
  const memoryResource = indexBody.resources.find((item) => item.resource === 'operator-memories');
  assert(deskResource?.methods.includes('POST'), 'operator-desks POST missing from discovery');
  assert(deskResource?.methods.includes('PATCH'), 'operator-desks PATCH missing from discovery');
  assert(memoryResource?.methods.includes('POST'), 'operator-memories POST missing from discovery');
  assert(memoryResource?.methods.includes('PATCH'), 'operator-memories PATCH missing from discovery');
  const actionNames = new Set(indexBody.actions.map((item) => item.action).filter(Boolean));
  for (const actionName of [
    'create_operator_desk',
    'update_operator_desk',
    'archive_operator_desk',
    'restore_operator_desk',
    'create_operator_memory',
    'update_operator_memory',
    'archive_operator_memory',
    'restore_operator_memory',
    'create_operator_memory_suggestion',
    'approve_operator_memory_suggestion',
    'reject_operator_memory_suggestion',
  ]) {
    assert(actionNames.has(actionName), `${actionName} missing from action discovery`);
  }
  for (const actionName of [
    'approve_operator_output',
    'reject_operator_output',
    'edit_operator_output_then_approve',
  ]) {
    assert(!actionNames.has(actionName), `${actionName} should not be exposed to MCP discovery`);
  }

  const deskResponse = await handleExternalApiRequest(headers, 'POST', '/api/v1/operator-desks', {
    name: 'Operator MCP Smoke Desk',
    slug: `operator-mcp-smoke-${runId}`,
    type: 'bug',
    mission: 'Verify operator MCP guardrails.',
    allowedSources: ['bugs', 'tasks'],
    allowedOutputTypes: ['bug_triage', 'execution_task', 'memory_suggestion'],
    approvalMode: 'approve_before_write',
  });
  assert(deskResponse.statusCode === 201, 'operator desk create failed');
  const deskId = (deskResponse.body as { data: { id: string } }).data.id;

  const workOrderResponse = await handleExternalApiRequest(headers, 'POST', '/api/v1/operator-work-orders', {
    operatorDeskId: deskId,
    title: 'Verify duplicate write-back',
    brief: 'Approve the same output twice.',
    expectedOutputTypes: ['bug_triage'],
  });
  const workOrderId = (workOrderResponse.body as { data: { id: string } }).data.id;

  await handleExternalApiRequest(headers, 'PATCH', `/api/v1/operator-desks/${deskId}`, { status: 'archived' });
  await expectApiError(
    () => handleExternalApiRequest(headers, 'POST', `/api/v1/operator-work-orders/${workOrderId}/claim`, { externalAgentName: 'codex' }),
    409,
    'Archived Operator Desks',
  );
  await handleExternalApiRequest(headers, 'PATCH', `/api/v1/operator-desks/${deskId}`, { status: 'active' });

  await expectApiError(
    () => handleExternalApiRequest(headers, 'POST', '/api/v1/operator-memories', {
      scope: 'global',
      content: 'Global memory should require admin.',
      source: 'mcp',
    }),
    403,
    'global Operator Memory',
  );

  const memoryResponse = await handleExternalApiRequest(headers, 'POST', '/api/v1/operator-memories', {
    scope: 'operator',
    scopeId: deskId,
    content: 'MCP-created memories should carry a source marker.',
    memoryType: 'lesson',
    confidence: 'high',
    source: 'mcp',
  });
  const memory = (memoryResponse.body as { data: { id: string; source: string; state: string } }).data;
  assert(memory.source === 'mcp', 'MCP-created memory did not persist source=mcp');
  assert(memory.state === 'active', 'direct MCP memory create should create active memory');

  await handleExternalApiRequest(headers, 'POST', `/api/v1/operator-memories/${memory.id}/archive`, {
    reason: 'verify archived memory exclusion',
  });
  const activeMemoryList = await handleExternalApiRequest(headers, 'GET', '/api/v1/operator-memories', {});
  assert(
    !(activeMemoryList.body as { data: Array<{ id: string }> }).data.some((item) => item.id === memory.id),
    'archived memory was included in default memory listing',
  );
  await handleExternalApiRequest(headers, 'POST', `/api/v1/operator-memories/${memory.id}/restore`, {});

  const suggestion = await handleExternalApiRequest(headers, 'POST', '/api/v1/operator-memories', {
    scope: 'operator',
    scopeId: deskId,
    state: 'suggested',
    content: 'Suggested memory can be approved safely.',
    source: 'mcp',
  });
  const suggestionId = (suggestion.body as { data: { id: string } }).data.id;
  const approvedSuggestion = await handleExternalApiRequest(headers, 'POST', `/api/v1/operator-memories/${suggestionId}/approve`, {});
  assert((approvedSuggestion.body as { data: { state: string } }).data.state === 'active', 'memory suggestion approve failed');

  const routedOutputResponse = await handleExternalApiRequest(headers, 'POST', '/api/v1/operator-outputs', {
    operatorDeskId: deskId,
    workOrderId,
    externalAgentName: 'codex',
    outputType: 'execution_task',
    title: `Approval gate should stay pending ${runId}`,
    summary: 'This output must wait for human approval.',
    content: 'Create a task only after an approval decision.',
    suggestedDestinations: ['tasks'],
    confidence: 'high',
  });
  const routedOutputId = (routedOutputResponse.body as { data: { id: string } }).data.id;
  const routedApprovalSnapshot = await db.collection('operatorApprovals').where('outputId', '==', routedOutputId).get();
  assert(routedApprovalSnapshot.size === 1, `expected one routed approval, found ${routedApprovalSnapshot.size}`);
  const routedApproval = routedApprovalSnapshot.docs[0].data();
  assert(routedApproval.status === 'pending', `routed approval should stay pending, got ${String(routedApproval.status)}`);
  const routedOutputSnapshot = await db.collection('operatorOutputs').doc(routedOutputId).get();
  assert(routedOutputSnapshot.data()?.status === 'pending_approval', 'routed output should wait for approval');
  const prematureTasks = await db.collection('tasks').where('companyId', '==', companyId).where('title', '==', `Approval gate should stay pending ${runId}`).get();
  assert(prematureTasks.empty, 'operator output created a task before approval');

  const canonicalBugId = `canonical-bug-${runId}`;
  const now = new Date().toISOString();
  await db.collection('bugs').doc(canonicalBugId).set({
    title: 'Teams invitation flow bypasses accept/reject step and can open workspace directly',
    description: 'Canonical bug.',
    severity: 'high',
    status: 'open',
    resolutionNotes: '',
    linkedTaskIds: [],
    matchKey: 'teams-invitation-flow',
    createdAt: now,
    updatedAt: now,
    authorId: ownerUid,
    companyId,
  });

  const outputId = `operator-output-${runId}`;
  const injectionId = `operator-injection-${runId}`;
  const approvalId = `operator-approval-${runId}`;
  await db.collection('operatorOutputs').doc(outputId).set({
    operatorDeskId: deskId,
    workOrderId,
    externalAgentName: 'codex',
    outputType: 'bug_triage',
    title: 'Teams invitation flow bypasses accept/reject step and can open workspace directly',
    summary: 'Clean desk output for the Teams invitation bug.',
    content: 'The acceptance path should be confirmed before closing the bug.',
    structuredPayload: {
      bugId: canonicalBugId,
      severity: 'high',
      linkedTaskIds: ['task-from-output'],
      codeLinks: [
        {
          type: 'directory',
          label: 'Invitation flow',
          url: 'src/pages/InvitationDecisionPage.tsx',
        },
      ],
      matchKey: 'teams-invitation-flow',
    },
    suggestedDestinations: ['bugs'],
    sourceReferences: [],
    memorySuggestions: [],
    confidence: 'high',
    status: 'pending_approval',
    createdAt: now,
    updatedAt: now,
    authorId: ownerUid,
    companyId,
  });
  await db.collection('operatorInjections').doc(injectionId).set({
    outputId,
    targetHub: 'bugs',
    targetRecordId: null,
    action: 'create',
    riskLevel: 'high',
    status: 'pending_approval',
    createdAt: now,
    completedAt: null,
    authorId: ownerUid,
    companyId,
  });
  await db.collection('operatorApprovals').doc(approvalId).set({
    operatorDeskId: deskId,
    workOrderId,
    outputId,
    injectionId,
    title: 'Teams invitation flow bypasses accept/reject step and can open workspace directly',
    summary: 'Approve canonical bug update.',
    targetHub: 'bugs',
    action: 'create',
    riskLevel: 'high',
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: null,
    authorId: ownerUid,
    companyId,
  });

  await expectApiError(
    () => handleExternalApiRequest(headers, 'PATCH', `/api/v1/operator-approvals/${approvalId}`, { status: 'completed' }),
    400,
    'status is invalid',
  );
  await expectApiError(
    () => handleExternalApiRequest(headers, 'PATCH', `/api/v1/operator-approvals/${approvalId}`, { status: 'approved' }),
    400,
    'status is invalid',
  );

  await handleExternalApiRequest(headers, 'POST', `/api/v1/operator-approvals/${approvalId}/approve`, {});
  const approvedApproval = (await db.collection('operatorApprovals').doc(approvalId).get()).data();
  assert(approvedApproval?.status === 'approved', `approval decision should be approved, got ${String(approvedApproval?.status)}`);
  assert(approvedApproval?.writeBackStatus === 'completed', `approval write-back should be completed, got ${String(approvedApproval?.writeBackStatus)}`);
  assert(approvedApproval?.targetRecordId === canonicalBugId, 'approval did not record the canonical write-back target');
  const retry = await handleExternalApiRequest(headers, 'POST', `/api/v1/operator-approvals/${approvalId}/approve`, {});
  assert((retry.body as { idempotent: boolean }).idempotent, 'duplicate approval retry was not idempotent');

  const bugSnapshot = await db.collection('bugs').where('companyId', '==', companyId).get();
  const matchingBugs = bugSnapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string }))
    .filter((bug) => bug.title === 'Teams invitation flow bypasses accept/reject step and can open workspace directly');
  assert(matchingBugs.length === 1, `duplicate bug write-back created ${matchingBugs.length} bug records`);
  assert(matchingBugs[0].id === canonicalBugId, 'canonical bug was not preserved');
  const notes = String(matchingBugs[0].resolutionNotes || '');
  const markerCount = notes.split(`operatorApproval:${approvalId}`).length - 1;
  assert(markerCount === 1, 'approval retry appended duplicate resolution notes');
  assert(Array.isArray(matchingBugs[0].linkedTaskIds) && matchingBugs[0].linkedTaskIds.includes('task-from-output'), 'canonical bug was not updated with linked task ids');
  assert(
    Array.isArray(matchingBugs[0].codeLinks) &&
      matchingBugs[0].codeLinks.some((link: any) => link.url === 'src/pages/InvitationDecisionPage.tsx'),
    'canonical bug was not updated with code links',
  );

  console.log('Operator MCP external API regression test passed.');
} finally {
  for (const collectionName of scopedCollections) {
    const snapshot = await db.collection(collectionName).where('companyId', '==', companyId).get();
    for (const document of snapshot.docs) await document.ref.delete();
  }
  await db.collection('apiKeys').doc(keyId).delete().catch(() => undefined);
  await db.collection('users').doc(ownerUid).delete().catch(() => undefined);
}
