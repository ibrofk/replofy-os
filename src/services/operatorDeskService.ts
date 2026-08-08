import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  ApprovalAction,
  ApprovalRiskLevel,
  OperatorApproval,
  OperatorApprovalMode,
  OperatorCheckin,
  OperatorCheckFrequency,
  OperatorContextPack,
  OperatorDesk,
  OperatorDeskManifest,
  OperatorDeskType,
  OperatorInjection,
  OperatorMemory,
  OperatorMemoryConfidence,
  OperatorMemoryScope,
  OperatorMemoryType,
  OperatorOutput,
  OperatorOutputType,
  OperatorWorkOrder,
  SmartInjectionDestination,
  UserProfile,
} from '../types';
import {
  buildRoutingRules,
  DANGEROUS_ACTION_RULES,
  DUPLICATE_PREVENTION_RULES,
  ENABLED_ROUTING_DESTINATIONS,
  OPERATOR_DESK_TEMPLATES,
  OPERATOR_MCP_REGISTRY_ACTIONS,
  OUTPUT_ROUTING,
} from '../utils/operatorDeskTemplates';
import { operatorActionRequiresApproval } from '../utils/operatorApprovalPolicy';

type Scope = { authorId: string; companyId?: string };

const now = () => new Date().toISOString();
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const scoped = (scope: Scope) => scope.companyId ? { companyId: scope.companyId } : {};
const scopeKey = (scope: Scope) => normalize(scope.companyId || scope.authorId);
const deskIdFor = (scope: Scope, slug: string) => `operator-desk-${scopeKey(scope)}-${slug}`;
const workOrderIdFor = (deskId: string, title: string) => `work-order-${deskId}-${normalize(title)}`;
const memoryIdFor = (deskId: string, content: string) => `memory-${deskId}-${normalize(content).slice(0, 90)}`;
const defaultDeskSources = ['context-sources', 'operator-memories', 'tasks', 'bugs', 'roadmap-items', 'team-chat-messages'];

function requireScope(profile: UserProfile): Scope {
  const authorId = auth.currentUser?.uid;
  if (!authorId) throw new Error('Sign in before using Operator Desks.');
  return { authorId, companyId: profile.companyId };
}

function scopeQuery(collectionName: string, scope: Scope) {
  return scope.companyId
    ? query(collection(db, collectionName), where('companyId', '==', scope.companyId))
    : query(collection(db, collectionName), where('authorId', '==', scope.authorId));
}

async function list<T>(collectionName: string, scope: Scope): Promise<T[]> {
  const snapshot = await getDocs(scopeQuery(collectionName, scope));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as T));
}

async function archiveLegacyAutonomousRecords(scope: Scope) {
  const timestamp = now();
  for (const collectionName of ['agenticTasks', 'osOperators']) {
    const snapshot = await getDocs(scopeQuery(collectionName, scope));
    for (const item of snapshot.docs) {
      const data = item.data();
      if (data.status === 'archived') continue;
      await updateDoc(item.ref, {
        status: 'archived',
        updatedAt: timestamp,
        migrationNote: 'Archived because Operator Desks replaced internal scheduled execution records.',
      });
    }
  }
}

export type OperatorDeskDraftInput = {
  name: string;
  slug?: string;
  type: OperatorDeskType;
  mission: string;
  defaultCheckFrequency: OperatorCheckFrequency;
  status?: OperatorDesk['status'];
  allowedSources?: string[];
  allowedOutputTypes: OperatorOutputType[];
  approvalMode: OperatorApprovalMode;
};

export async function createOperatorDesk(profile: UserProfile, input: OperatorDeskDraftInput) {
  const scope = requireScope(profile);
  const timestamp = now();
  const name = input.name.trim();
  const mission = input.mission.trim();
  const slug = normalize(input.slug || name);
  if (!name) throw new Error('Operator Desk name is required.');
  if (!mission) throw new Error('Operator Desk mission is required.');
  if (!slug) throw new Error('Operator Desk slug is required.');
  if (input.allowedOutputTypes.length === 0) throw new Error('Choose at least one allowed output type.');

  const existingDesks = await list<OperatorDesk>('operatorDesks', scope);
  if (existingDesks.some((desk) => desk.slug === slug)) {
    throw new Error('A desk with this slug already exists. Edit or restore the existing desk instead.');
  }

  const ref = doc(db, 'operatorDesks', deskIdFor(scope, slug));
  const desk: OperatorDesk = {
    id: ref.id,
    name,
    slug,
    type: input.type,
    mission,
    defaultCheckFrequency: input.defaultCheckFrequency,
    status: input.status || 'active',
    connectedExternalAgents: [],
    allowedSources: input.allowedSources?.length ? input.allowedSources : defaultDeskSources,
    allowedOutputTypes: input.allowedOutputTypes,
    approvalMode: input.approvalMode,
    routingRules: buildRoutingRules(input.allowedOutputTypes),
    dangerousActionRules: DANGEROUS_ACTION_RULES,
    createdAt: timestamp,
    updatedAt: timestamp,
    authorId: scope.authorId,
    ...scoped(scope),
  };
  await setDoc(ref, desk);
  return desk;
}

export async function updateOperatorDesk(profile: UserProfile, desk: OperatorDesk, input: OperatorDeskDraftInput) {
  requireScope(profile);
  if (desk.status === 'archived') throw new Error('Restore this Operator Desk before editing it.');
  const name = input.name.trim();
  const mission = input.mission.trim();
  if (!name) throw new Error('Operator Desk name is required.');
  if (!mission) throw new Error('Operator Desk mission is required.');
  if (input.allowedOutputTypes.length === 0) throw new Error('Choose at least one allowed output type.');

  await updateDoc(doc(db, 'operatorDesks', desk.id), {
    name,
    type: input.type,
    mission,
    defaultCheckFrequency: input.defaultCheckFrequency,
    status: input.status || desk.status,
    allowedSources: input.allowedSources?.length ? input.allowedSources : defaultDeskSources,
    allowedOutputTypes: input.allowedOutputTypes,
    approvalMode: input.approvalMode,
    routingRules: buildRoutingRules(input.allowedOutputTypes),
    dangerousActionRules: DANGEROUS_ACTION_RULES,
    updatedAt: now(),
  });
}

export async function updateOperatorDeskStatus(profile: UserProfile, desk: OperatorDesk, status: OperatorDesk['status']) {
  requireScope(profile);
  await updateDoc(doc(db, 'operatorDesks', desk.id), {
    status,
    updatedAt: now(),
  });
}

export type OperatorMemoryDraftInput = {
  scope: OperatorMemoryScope;
  scopeId?: string | null;
  memoryType: OperatorMemoryType;
  state?: OperatorMemory['state'];
  content: string;
  confidence: OperatorMemoryConfidence;
  pinned?: boolean;
};

export async function createOperatorMemory(profile: UserProfile, input: OperatorMemoryDraftInput) {
  const scope = requireScope(profile);
  if (input.scope === 'global' && !['master-admin', 'admin'].includes(profile.role)) {
    throw new Error('Only workspace admins can create global operator memory.');
  }
  const content = input.content.trim();
  if (!content) throw new Error('Memory content is required.');
  const scopeId = input.scope === 'global' ? null : input.scopeId || null;
  if (input.scope === 'operator' && !scopeId) throw new Error('Choose an Operator Desk for this memory.');

  const memories = await list<OperatorMemory>('operatorMemories', scope);
  const duplicate = memories.find((memory) =>
    memory.scope === input.scope &&
    (memory.scopeId || null) === scopeId &&
    memory.content.trim().toLowerCase() === content.toLowerCase() &&
    !['archived', 'rejected', 'expired'].includes(memory.state)
  );
  if (duplicate) throw new Error('This memory already exists for the selected scope.');

  const timestamp = now();
  const memoryRef = doc(collection(db, 'operatorMemories'));
  const state = input.state || 'active';
  const memory: OperatorMemory = {
    id: memoryRef.id,
    scope: input.scope,
    scopeId,
    memoryType: input.memoryType,
    state,
    content,
    confidence: input.confidence,
    sourceCheckInId: null,
    sourceOutputId: null,
    pinned: input.pinned || state === 'pinned',
    expiresAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastUsedAt: null,
    usedCount: 0,
    source: 'ui',
    sourceMetadata: {},
    authorId: scope.authorId,
    ...scoped(scope),
  };
  await setDoc(memoryRef, memory);
  return memory;
}

export async function ensureOperatorDeskTemplates(profile: UserProfile) {
  const scope = requireScope(profile);
  await archiveLegacyAutonomousRecords(scope).catch((error) => {
    console.warn('Legacy Operator archive skipped:', error);
  });

  const existingDesks = await list<OperatorDesk>('operatorDesks', scope);
  const timestamp = now();

  const desksBySlug = new Map<string, OperatorDesk[]>();
  for (const desk of existingDesks) {
    const bucket = desksBySlug.get(desk.slug) || [];
    bucket.push(desk);
    desksBySlug.set(desk.slug, bucket);
  }

  for (const [slug, desks] of desksBySlug.entries()) {
    if (desks.length <= 1) continue;
    const [kept, ...duplicates] = [...desks].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    console.warn(`Deduplicating Operator Desk template ${slug}; keeping ${kept.id} and removing ${duplicates.length} duplicates.`);
    for (const duplicate of duplicates) {
      await deleteDoc(doc(db, 'operatorDesks', duplicate.id));
    }
  }

  const refreshedDesks = await list<OperatorDesk>('operatorDesks', scope);
  const existingBySlug = new Map(refreshedDesks.map((desk) => [desk.slug, desk]));
  const allDesks = [...refreshedDesks];

  for (const template of OPERATOR_DESK_TEMPLATES) {
    let desk = existingBySlug.get(template.slug);
    if (!desk) {
      const ref = doc(db, 'operatorDesks', deskIdFor(scope, template.slug));
      desk = {
        id: ref.id,
        name: template.name,
        slug: template.slug,
        type: template.type,
        mission: template.mission,
        defaultCheckFrequency: template.defaultCheckFrequency,
        status: 'active',
        connectedExternalAgents: [],
        allowedSources: template.allowedSources,
        allowedOutputTypes: template.allowedOutputTypes,
        approvalMode: template.approvalMode,
        routingRules: buildRoutingRules(template.allowedOutputTypes),
        dangerousActionRules: DANGEROUS_ACTION_RULES,
        createdAt: timestamp,
        updatedAt: timestamp,
        authorId: scope.authorId,
        ...scoped(scope),
      };
      await setDoc(ref, desk);
      allDesks.push(desk);
    }

    const memories = await list<OperatorMemory>('operatorMemories', scope);
    const deskMemories = new Set(memories.filter((memory) => memory.scopeId === desk.id).map((memory) => memory.content));
    for (const content of template.defaultMemory) {
      if (deskMemories.has(content)) continue;
      const memoryRef = doc(db, 'operatorMemories', memoryIdFor(desk.id, content));
      await setDoc(memoryRef, {
        id: memoryRef.id,
        scope: 'operator',
        scopeId: desk.id,
        memoryType: 'workflow_rule',
        state: 'active',
        content,
        confidence: 'high',
        sourceCheckInId: null,
        sourceOutputId: null,
        pinned: false,
        expiresAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastUsedAt: null,
        usedCount: 0,
        authorId: scope.authorId,
        ...scoped(scope),
      } satisfies OperatorMemory);
    }

    const workOrders = await list<OperatorWorkOrder>('operatorWorkOrders', scope);
    const hasStarter = workOrders.some((workOrder) => workOrder.operatorDeskId === desk.id && workOrder.title === template.starterWorkOrder.title);
    if (!hasStarter) {
      await createWorkOrder(profile, desk, {
        id: workOrderIdFor(desk.id, template.starterWorkOrder.title),
        title: template.starterWorkOrder.title,
        brief: template.starterWorkOrder.brief,
        priority: template.starterWorkOrder.priority,
        expectedOutputTypes: template.allowedOutputTypes,
      });
    }
  }

  return allDesks;
}

export async function createContextPack(profile: UserProfile, input: Partial<OperatorContextPack> & { title: string; description: string }) {
  const scope = requireScope(profile);
  const timestamp = now();
  const ref = doc(collection(db, 'operatorContextPacks'));
  const pack: OperatorContextPack = {
    id: ref.id,
    title: input.title,
    description: input.description,
    scope: input.scope || 'global',
    scopeId: input.scopeId || null,
    sourceIds: input.sourceIds || [],
    sourceSnapshots: input.sourceSnapshots || [],
    instructions: input.instructions || '',
    constraints: input.constraints || [],
    expectedUse: input.expectedUse || '',
    createdAt: timestamp,
    updatedAt: timestamp,
    authorId: scope.authorId,
    ...scoped(scope),
  };
  await setDoc(ref, pack);
  return pack;
}

export async function createWorkOrder(profile: UserProfile, desk: OperatorDesk, input?: Partial<OperatorWorkOrder> & { title?: string; brief?: string }) {
  const scope = requireScope(profile);
  const timestamp = now();
  const ref = input?.id ? doc(db, 'operatorWorkOrders', input.id) : doc(collection(db, 'operatorWorkOrders'));
  const workOrder: OperatorWorkOrder = {
    id: ref.id,
    operatorDeskId: desk.id,
    title: input?.title || `Work order for ${desk.name}`,
    brief: input?.brief || desk.mission,
    status: input?.status || 'ready',
    priority: input?.priority || 'medium',
    contextPackIds: input?.contextPackIds || [],
    expectedOutputTypes: input?.expectedOutputTypes || desk.allowedOutputTypes,
    approvalMode: input?.approvalMode || desk.approvalMode,
    claimPolicy: input?.claimPolicy || 'single_agent',
    assignedExternalAgent: input?.assignedExternalAgent || null,
    claimedBy: null,
    claimedAt: null,
    availableFrom: input?.availableFrom || null,
    dueAt: input?.dueAt || null,
    createdAt: timestamp,
    updatedAt: timestamp,
    authorId: scope.authorId,
    ...scoped(scope),
  };
  await setDoc(ref, workOrder);
  return workOrder;
}

export async function claimWorkOrder(profile: UserProfile, workOrder: OperatorWorkOrder, externalAgentName: string) {
  requireScope(profile);
  if (!['ready', 'draft'].includes(workOrder.status)) {
    throw new Error('Only ready Work Orders can be claimed.');
  }
  await updateDoc(doc(db, 'operatorWorkOrders', workOrder.id), {
    status: 'claimed',
    claimedBy: externalAgentName,
    claimedAt: now(),
    updatedAt: now(),
  });
  await submitAgentCheckin(profile, {
    operatorDeskId: workOrder.operatorDeskId,
    workOrderId: workOrder.id,
    externalAgentName,
    type: 'work_order_claimed',
    summary: `${externalAgentName} claimed ${workOrder.title}.`,
    payload: {},
  });
}

export async function releaseWorkOrder(profile: UserProfile, workOrder: OperatorWorkOrder, externalAgentName: string) {
  requireScope(profile);
  await updateDoc(doc(db, 'operatorWorkOrders', workOrder.id), {
    status: 'ready',
    claimedBy: null,
    claimedAt: null,
    updatedAt: now(),
  });
  await submitAgentCheckin(profile, {
    operatorDeskId: workOrder.operatorDeskId,
    workOrderId: workOrder.id,
    externalAgentName,
    type: 'work_skipped',
    summary: `${externalAgentName} released ${workOrder.title}.`,
    payload: {},
  });
}

export async function submitAgentCheckin(profile: UserProfile, input: Pick<OperatorCheckin, 'operatorDeskId' | 'externalAgentName' | 'type' | 'summary'> & Partial<OperatorCheckin>) {
  const scope = requireScope(profile);
  const ref = doc(collection(db, 'operatorCheckins'));
  const checkin: OperatorCheckin = {
    id: ref.id,
    operatorDeskId: input.operatorDeskId,
    workOrderId: input.workOrderId || null,
    externalAgentName: input.externalAgentName,
    externalAgentProvider: input.externalAgentProvider || null,
    type: input.type,
    summary: input.summary,
    payload: input.payload || {},
    createdAt: now(),
    authorId: scope.authorId,
    ...scoped(scope),
  };
  await setDoc(ref, checkin);
  return checkin;
}

function approvalActionForHub(targetHub: SmartInjectionDestination): ApprovalAction {
  return targetHub === 'operator-memories' ? 'remember' : targetHub === 'team-chat-messages' ? 'send' : 'create';
}

function injectionActionForHub(targetHub: SmartInjectionDestination): OperatorInjection['action'] {
  return targetHub === 'operator-memories' ? 'remember' : 'create';
}

function riskLevelForOutput(output: OperatorOutput, targetHub: SmartInjectionDestination): ApprovalRiskLevel {
  if (['send', 'publish', 'delete', 'deploy', 'rollback'].includes(approvalActionForHub(targetHub))) return 'high';
  if (output.outputType === 'bug_triage' && ['high', 'critical'].includes(String(output.structuredPayload?.severity || ''))) {
    return output.structuredPayload?.severity === 'critical' ? 'critical' : 'high';
  }
  if (targetHub === 'team-chat-messages') return 'medium';
  return 'low';
}

async function likelyDuplicate(output: OperatorOutput, targetHub: SmartInjectionDestination, scope: Scope) {
  const collectionName = HUB_COLLECTIONS[targetHub];
  if (!collectionName) return null;
  const targetRecords = await list<Record<string, unknown>>(collectionName, scope);
  const key = normalize(output.title);
  return targetRecords.find((record) =>
    normalize(String(record.title || record.keyword || record.slug || record.matchKey || '')) === key ||
    (output.workOrderId && record.workOrderId === output.workOrderId),
  ) || null;
}

export async function submitOperatorOutput(profile: UserProfile, input: Pick<OperatorOutput, 'operatorDeskId' | 'externalAgentName' | 'outputType' | 'title' | 'summary' | 'content'> & Partial<OperatorOutput>) {
  const scope = requireScope(profile);
  const timestamp = now();
  const ref = doc(collection(db, 'operatorOutputs'));
  const output: OperatorOutput = {
    id: ref.id,
    operatorDeskId: input.operatorDeskId,
    workOrderId: input.workOrderId || null,
    externalAgentName: input.externalAgentName,
    outputType: input.outputType,
    title: input.title,
    summary: input.summary,
    content: input.content,
    structuredPayload: input.structuredPayload || {},
    suggestedDestinations: input.suggestedDestinations || OUTPUT_ROUTING[input.outputType] || [],
    sourceReferences: input.sourceReferences || [],
    memorySuggestions: input.memorySuggestions || [],
    confidence: input.confidence || 'medium',
    status: 'submitted',
    createdAt: timestamp,
    updatedAt: timestamp,
    authorId: scope.authorId,
    ...scoped(scope),
  };
  await setDoc(ref, output);
  await submitAgentCheckin(profile, {
    operatorDeskId: output.operatorDeskId,
    workOrderId: output.workOrderId,
    externalAgentName: output.externalAgentName,
    type: 'output_submitted',
    summary: `Submitted ${output.outputType}: ${output.title}`,
    payload: { outputId: output.id },
  });
  if (output.workOrderId) {
    await updateDoc(doc(db, 'operatorWorkOrders', output.workOrderId), { status: 'submitted', updatedAt: timestamp });
  }
  await routeOperatorOutput(profile, output);
  return output;
}

export async function routeOperatorOutput(profile: UserProfile, output: OperatorOutput) {
  const scope = requireScope(profile);
  const destinations = output.suggestedDestinations.length ? output.suggestedDestinations : OUTPUT_ROUTING[output.outputType] || [];
  const enabled = destinations.filter((destination): destination is SmartInjectionDestination => ENABLED_ROUTING_DESTINATIONS.includes(destination as SmartInjectionDestination));
  const timestamp = now();
  if (enabled.length === 0) {
    await updateDoc(doc(db, 'operatorOutputs', output.id), {
      status: 'submitted',
      routingWarning: `No supported Smart Routing destination for ${output.outputType}.`,
      updatedAt: timestamp,
    });
    return [];
  }

  const created: OperatorInjection[] = [];
  let pendingApprovalCount = 0;
  for (const targetHub of enabled) {
    const duplicate = await likelyDuplicate(output, targetHub, scope);
    const injectionRef = doc(collection(db, 'operatorInjections'));
    const approvalAction = duplicate ? 'link' : approvalActionForHub(targetHub);
    const requiresApproval = operatorActionRequiresApproval(approvalAction);
    const injection: OperatorInjection = {
      id: injectionRef.id,
      outputId: output.id,
      targetHub,
      targetRecordId: typeof duplicate?.id === 'string' ? duplicate.id : null,
      action: duplicate ? 'link' : injectionActionForHub(targetHub),
      riskLevel: riskLevelForOutput(output, targetHub),
      status: requiresApproval ? 'pending_approval' : 'proposed',
      createdAt: timestamp,
      completedAt: null,
      authorId: scope.authorId,
      ...scoped(scope),
    };
    await setDoc(injectionRef, injection);
    if (requiresApproval) {
      pendingApprovalCount += 1;
      created.push(injection);
      const approvalRef = doc(collection(db, 'operatorApprovals'));
      await setDoc(approvalRef, {
        id: approvalRef.id,
        operatorDeskId: output.operatorDeskId,
        workOrderId: output.workOrderId,
        outputId: output.id,
        injectionId: injection.id,
        title: output.title,
        summary: duplicate ? `Likely duplicate found. Review linking to ${targetHub}.` : output.summary,
        targetHub,
        action: approvalAction,
        riskLevel: injection.riskLevel,
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        expiresAt: null,
        authorId: scope.authorId,
        ...scoped(scope),
      } satisfies OperatorApproval);
    } else {
      const targetRecordId = await applyInternalOperatorInjection(output, injection, scope);
      created.push({ ...injection, status: 'completed', completedAt: timestamp, targetRecordId });
    }
  }

  for (const suggestion of output.memorySuggestions) {
    const content = typeof suggestion === 'string' ? suggestion : String((suggestion as Record<string, unknown>).content || '');
    if (!content.trim()) continue;
    const memoryRef = doc(collection(db, 'operatorMemories'));
    await setDoc(memoryRef, {
      id: memoryRef.id,
      scope: 'operator',
      scopeId: output.operatorDeskId,
      memoryType: 'lesson',
      state: 'suggested',
      content,
      confidence: output.confidence,
      sourceCheckInId: null,
      sourceOutputId: output.id,
      pinned: false,
      expiresAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastUsedAt: null,
      usedCount: 0,
      authorId: scope.authorId,
      ...scoped(scope),
    } satisfies OperatorMemory);
  }

  await updateDoc(doc(db, 'operatorOutputs', output.id), {
    status: pendingApprovalCount > 0 ? 'pending_approval' : 'injected',
    updatedAt: timestamp,
  });
  return created;
}

const HUB_COLLECTIONS: Partial<Record<SmartInjectionDestination, string>> = {
  tasks: 'tasks',
  bugs: 'bugs',
  'roadmap-items': 'roadmapItems',
  'blog-articles': 'blogArticles',
  'social-posts': 'socialPosts',
  'creative-items': 'creativeItems',
  'seo-keywords': 'seoKeywords',
  prompts: 'prompts',
  'time-blocks': 'timeBlocks',
};

function officialHubPayload(output: OperatorOutput, targetHub: SmartInjectionDestination, scope: Scope) {
  const timestamp = now();
  const base = { createdAt: timestamp, authorId: scope.authorId, ...scoped(scope) };
  if (targetHub === 'tasks') return { ...base, title: output.title, isLeadIndicator: false, effortPoints: Number(output.structuredPayload?.effortPoints || 3), status: 'todo', executionNotes: output.content, matchKey: normalize(output.title) };
  if (targetHub === 'blog-articles') return { ...base, title: output.title, slug: normalize(output.title), summary: output.summary, content: output.content, status: output.outputType === 'blog_idea' ? 'idea' : 'drafting', roadmapPhase: 'next', priority: 'medium', updatedAt: timestamp };
  if (targetHub === 'seo-keywords') return { ...base, keyword: String(output.structuredPayload?.keyword || output.title), intent: output.structuredPayload?.intent || 'medium' };
  if (targetHub === 'social-posts') return { ...base, platform: output.structuredPayload?.platform || 'LinkedIn', content: output.content, scheduledFor: '', status: 'draft', matchKey: normalize(output.title) };
  if (targetHub === 'creative-items') return { ...base, title: output.title, platform: output.structuredPayload?.platform || 'LinkedIn', format: output.structuredPayload?.format || 'single-post', campaign: '', audience: '', objective: '', hook: output.summary, brief: output.content, caption: '', visualDirection: output.content, productionNotes: '', cta: '', status: 'brief', approvalNotes: '', assetIds: [], tags: [], updatedAt: timestamp, matchKey: normalize(output.title) };
  if (targetHub === 'bugs') return { ...base, title: output.title, description: output.content, severity: output.structuredPayload?.severity || 'medium', status: output.structuredPayload?.status || 'triaged', resolutionNotes: output.summary, linkedTaskIds: output.structuredPayload?.linkedTaskIds || [], matchKey: String(output.structuredPayload?.matchKey || output.structuredPayload?.sourceKey || normalize(output.title)), sourceIds: output.structuredPayload?.sourceId ? [String(output.structuredPayload.sourceId)] : [], sourceVersionIds: output.structuredPayload?.sourceVersionId ? [String(output.structuredPayload.sourceVersionId)] : [], sourceKey: output.structuredPayload?.sourceKey || '', updatedAt: timestamp };
  if (targetHub === 'roadmap-items') return { ...base, title: output.title, description: output.content, phase: 'next', priority: 'medium', status: 'planned', linkedTaskIds: [], updatedAt: timestamp };
  if (targetHub === 'prompts') return { ...base, title: output.title, version: '1.0.0', content: output.content };
  return null;
}

function appendUniqueOperatorNote(existingNotes: unknown, output: OperatorOutput, approvalId: string) {
  const marker = `operatorApproval:${approvalId}`;
  const current = typeof existingNotes === 'string' ? existingNotes : '';
  if (current.includes(marker)) return current;
  const note = `${marker}\nOperator output ${output.id}: ${output.summary}\n${output.content}`;
  return [current.trim(), note.trim()].filter(Boolean).join('\n\n').slice(0, 8000);
}

async function findCanonicalBugForOutput(output: OperatorOutput, injection: OperatorInjection | null, scope: Scope) {
  const explicitBugId = typeof output.structuredPayload?.bugId === 'string' ? output.structuredPayload.bugId : '';
  for (const id of [injection?.targetRecordId, explicitBugId]) {
    if (!id) continue;
    const snap = await getDoc(doc(db, 'bugs', id));
    if (snap.exists()) return { id: snap.id, ...snap.data() } as Record<string, unknown>;
  }

  const matchKey = normalize(String(output.structuredPayload?.matchKey || output.structuredPayload?.sourceKey || output.title));
  const bugs = await list<Record<string, unknown>>('bugs', scope);
  return bugs.find((bug) =>
    normalize(String(bug.matchKey || bug.sourceKey || bug.title || '')) === matchKey ||
    normalize(String(bug.title || '')) === normalize(output.title)
  ) || null;
}

async function applyInternalOperatorInjection(output: OperatorOutput, injection: OperatorInjection, scope: Scope) {
  const timestamp = now();
  const injectionRef = doc(db, 'operatorInjections', injection.id);
  if (injection.targetHub === 'operator-memories' || (injection.action === 'link' && injection.targetRecordId)) {
    await updateDoc(injectionRef, {
      status: 'completed',
      completedAt: timestamp,
      ...(injection.targetRecordId ? { targetRecordId: injection.targetRecordId } : {}),
    });
    return injection.targetRecordId || null;
  }

  const targetCollection = HUB_COLLECTIONS[injection.targetHub];
  const payload = officialHubPayload(output, injection.targetHub, scope);
  if (!targetCollection || !payload) throw new Error(`Internal destination ${injection.targetHub} is not enabled for hub writes.`);

  const batch = writeBatch(db);
  let targetRef = doc(collection(db, targetCollection));
  if (injection.targetHub === 'bugs') {
    const canonicalBug = await findCanonicalBugForOutput(output, injection, scope);
    if (canonicalBug?.id && typeof canonicalBug.id === 'string') {
      targetRef = doc(db, targetCollection, canonicalBug.id);
      batch.update(targetRef, {
        updatedAt: timestamp,
        resolutionNotes: appendUniqueOperatorNote(canonicalBug.resolutionNotes, output, injection.id),
        linkedTaskIds: Array.from(new Set([
          ...(Array.isArray(canonicalBug.linkedTaskIds) ? canonicalBug.linkedTaskIds.map(String) : []),
          ...(Array.isArray(output.structuredPayload?.linkedTaskIds) ? output.structuredPayload.linkedTaskIds.map(String) : []),
        ])),
      });
    } else {
      targetRef = doc(db, targetCollection, `mcp-bugs-${normalize(String(output.structuredPayload?.matchKey || output.structuredPayload?.sourceKey || output.title)).slice(0, 120)}`);
      batch.set(targetRef, payload);
    }
  } else {
    batch.set(targetRef, payload);
  }
  batch.update(injectionRef, { status: 'completed', completedAt: timestamp, targetRecordId: targetRef.id });
  await batch.commit();
  return targetRef.id;
}

function approvedApprovalPatch(authorId: string, timestamp: string, targetRecordId?: string | null) {
  return {
    status: 'approved',
    reviewedBy: authorId,
    reviewedAt: timestamp,
    updatedAt: timestamp,
    writeBackStatus: 'completed',
    writeBackCompletedAt: timestamp,
    ...(targetRecordId ? { targetRecordId } : {}),
  };
}

export async function resolveOperatorApproval(profile: UserProfile, approval: OperatorApproval, decision: 'approve' | 'reject') {
  const scope = requireScope(profile);
  const timestamp = now();
  if (!['pending', 'edited'].includes(approval.status)) {
    throw new Error(`This approval is already ${approval.status}. Refresh the inbox before taking another action.`);
  }
  const batch = writeBatch(db);
  if (decision === 'reject') {
    batch.update(doc(db, 'operatorApprovals', approval.id), { status: 'rejected', reviewedBy: scope.authorId, reviewedAt: timestamp, updatedAt: timestamp });
    if (approval.injectionId) batch.update(doc(db, 'operatorInjections', approval.injectionId), { status: 'rejected' });
    if (approval.outputId) batch.update(doc(db, 'operatorOutputs', approval.outputId), { status: 'rejected', updatedAt: timestamp });
    await batch.commit();
    return;
  }

  if (!approval.outputId || !approval.injectionId) throw new Error('Approval is missing output or injection linkage.');
  const outputSnap = await getDoc(doc(db, 'operatorOutputs', approval.outputId));
  if (!outputSnap.exists()) throw new Error('Submitted Output not found.');
  const output = { id: outputSnap.id, ...outputSnap.data() } as OperatorOutput;

  const injectionSnap = await getDoc(doc(db, 'operatorInjections', approval.injectionId));
  const injection = injectionSnap.exists() ? ({ id: injectionSnap.id, ...injectionSnap.data() } as OperatorInjection) : null;

  if (approval.targetHub === 'operator-memories') {
    await updateDoc(doc(db, 'operatorApprovals', approval.id), approvedApprovalPatch(scope.authorId, timestamp));
    await updateDoc(doc(db, 'operatorInjections', approval.injectionId), { status: 'completed', completedAt: timestamp });
    await updateDoc(doc(db, 'operatorOutputs', output.id), { status: 'injected', updatedAt: timestamp });
    return;
  }

  if (approval.action === 'link' && injection?.targetRecordId) {
    batch.update(doc(db, 'operatorApprovals', approval.id), approvedApprovalPatch(scope.authorId, timestamp, injection.targetRecordId));
    batch.update(doc(db, 'operatorInjections', approval.injectionId), { status: 'completed', completedAt: timestamp });
    batch.update(doc(db, 'operatorOutputs', output.id), { status: 'injected', updatedAt: timestamp });
    await batch.commit();
    return;
  }

  const targetCollection = HUB_COLLECTIONS[approval.targetHub as SmartInjectionDestination];
  const payload = officialHubPayload(output, approval.targetHub as SmartInjectionDestination, scope);
  if (!targetCollection || !payload) throw new Error(`Approved destination ${approval.targetHub} is not enabled for hub writes.`);
  let targetRef = doc(collection(db, targetCollection));
  if (approval.targetHub === 'bugs') {
    const canonicalBug = await findCanonicalBugForOutput(output, injection, scope);
    if (canonicalBug?.id && typeof canonicalBug.id === 'string') {
      targetRef = doc(db, targetCollection, canonicalBug.id);
      batch.update(targetRef, {
        updatedAt: timestamp,
        resolutionNotes: appendUniqueOperatorNote(canonicalBug.resolutionNotes, output, approval.id),
        linkedTaskIds: Array.from(new Set([
          ...(Array.isArray(canonicalBug.linkedTaskIds) ? canonicalBug.linkedTaskIds.map(String) : []),
          ...(Array.isArray(output.structuredPayload?.linkedTaskIds) ? output.structuredPayload.linkedTaskIds.map(String) : []),
        ])),
      });
    } else {
      targetRef = doc(db, targetCollection, `mcp-bugs-${normalize(String(output.structuredPayload?.matchKey || output.structuredPayload?.sourceKey || output.title)).slice(0, 120)}`);
      batch.set(targetRef, payload);
    }
  } else {
    batch.set(targetRef, payload);
  }
  batch.update(doc(db, 'operatorApprovals', approval.id), approvedApprovalPatch(scope.authorId, timestamp, targetRef.id));
  batch.update(doc(db, 'operatorInjections', approval.injectionId), { status: 'completed', completedAt: timestamp, targetRecordId: targetRef.id });
  batch.update(doc(db, 'operatorOutputs', output.id), { status: 'injected', updatedAt: timestamp });
  await batch.commit();
}

export async function updateOperatorMemory(profile: UserProfile, memory: OperatorMemory, action: 'pin' | 'reject' | 'archive' | 'activate' | 'delete', content?: string) {
  if (memory.scope === 'global' && !['master-admin', 'admin'].includes(profile.role)) {
    throw new Error('Only workspace admins can update global operator memory.');
  }
  requireScope(profile);
  const memoryRef = doc(db, 'operatorMemories', memory.id);
  if (action === 'delete') {
    await updateDoc(memoryRef, { state: 'archived', archivedAt: now(), updatedAt: now() });
    return;
  }
  const patch: Partial<OperatorMemory> = { updatedAt: now() };
  if (content !== undefined) patch.content = content;
  if (action === 'pin') { patch.pinned = !memory.pinned; patch.state = memory.pinned ? 'active' : 'pinned'; }
  if (action === 'reject') patch.state = 'rejected';
  if (action === 'archive') patch.state = 'archived';
  if (action === 'activate') patch.state = 'active';
  await updateDoc(memoryRef, patch);
}

export async function buildOperatorManifest(profile: UserProfile, deskId: string, externalAgentName?: string): Promise<OperatorDeskManifest> {
  const scope = requireScope(profile);
  const [desks, workOrders, contextPacks, memories, outputs, checkins] = await Promise.all([
    list<OperatorDesk>('operatorDesks', scope),
    list<OperatorWorkOrder>('operatorWorkOrders', scope),
    list<OperatorContextPack>('operatorContextPacks', scope),
    list<OperatorMemory>('operatorMemories', scope),
    list<OperatorOutput>('operatorOutputs', scope),
    list<OperatorCheckin>('operatorCheckins', scope),
  ]);
  const desk = desks.find((item) => item.id === deskId || item.slug === deskId);
  if (!desk) throw new Error('Operator Desk not found.');
  const readyWorkOrders = workOrders.filter((item) => item.operatorDeskId === desk.id && item.status === 'ready');
  const claimedWorkOrders = workOrders.filter((item) => item.operatorDeskId === desk.id && (!externalAgentName || item.claimedBy === externalAgentName) && ['claimed', 'in_progress'].includes(item.status));
  const activeMemory = memories.filter((item) => item.state === 'active' && (item.scope === 'global' || item.scopeId === desk.id));
  const pinnedMemory = memories.filter((item) => item.state === 'pinned' && (item.scope === 'global' || item.scopeId === desk.id));
  return {
    operatorDesk: desk,
    readyWorkOrders,
    claimedWorkOrders,
    contextPacks: contextPacks.filter((item) => item.scope === 'global' || item.scopeId === desk.id || readyWorkOrders.some((workOrder) => workOrder.contextPackIds.includes(item.id))),
    activeMemory,
    pinnedMemory,
    allowedSources: desk.allowedSources,
    allowedOutputTypes: desk.allowedOutputTypes,
    routingRules: desk.routingRules,
    approvalRules: { approvalMode: desk.approvalMode, dangerousActionRules: desk.dangerousActionRules },
    recentOutputs: outputs.filter((item) => item.operatorDeskId === desk.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10),
    recentCheckins: checkins.filter((item) => item.operatorDeskId === desk.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10),
    duplicatePreventionRules: DUPLICATE_PREVENTION_RULES,
    submissionSchema: {
      required: ['operatorDeskId', 'externalAgentName', 'outputType', 'title', 'summary', 'content'],
      optional: ['workOrderId', 'structuredPayload', 'suggestedDestinations', 'sourceReferences', 'memorySuggestions', 'confidence'],
    },
  };
}

export function getOperatorMcpRegistry() {
  return OPERATOR_MCP_REGISTRY_ACTIONS;
}
