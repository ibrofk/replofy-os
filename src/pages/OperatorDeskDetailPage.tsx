import React, { useEffect, useMemo, useState } from 'react';
import { Archive, ClipboardPlus, Folder, Pencil, Pin, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { collection, deleteDoc, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { useNavigate, useParams } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { useOperatorDesk } from '../hooks/useOperatorDesk';
import { createContextPack, createOperatorMemory, createWorkOrder, resolveOperatorApproval, updateOperatorDesk, updateOperatorDeskStatus, updateOperatorMemory } from '../services/operatorDeskService';
import { ContextSource, ContextSourceFolder, OperatorApproval, OperatorApprovalMode, OperatorCheckFrequency, OperatorContextPack, OperatorDesk, OperatorDeskType, OperatorMemory, OperatorMemoryConfidence, OperatorMemoryScope, OperatorMemoryType, OperatorOutputType, OperatorPriority, OperatorWorkOrder } from '../types';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Drawer } from '../components/ui/Drawer';
import { auth, db } from '../firebase';
import {
  approvalPlainText,
  confidenceLabels,
  desiredResultOptions,
  deskStatusLabels,
  frequencyLabels,
  getDeskName,
  labelOutputType,
  labelStatus,
  outputStatusLabels,
  priorityLabels,
  riskCopy,
  riskLabels,
  workOrderStatusLabels,
} from '../utils/operatorDisplayLabels';
import { OPERATOR_DESK_TEMPLATE_SLUGS } from '../utils/operatorDeskTemplates';
import { normalizeOperatorApprovalMode, operatorApprovalModeLabel } from '../utils/operatorApprovalPolicy';
import { Empty, Page, Panel, Row } from './CommandCenterPage';

const tabs = ['Overview', 'Work Orders', 'Context', 'Outputs', 'Approvals', 'Settings'] as const;
const starterDeskSlugs = new Set(OPERATOR_DESK_TEMPLATE_SLUGS);
type Tab = typeof tabs[number];
type WorkOrderDraft = {
  id?: string;
  title: string;
  brief: string;
  priority: OperatorPriority;
  contextPackIds: string[];
  expectedOutputTypes: OperatorOutputType[];
};
type ContextDraft = {
  id?: string;
  title: string;
  description: string;
  instructions: string;
  constraints: string;
  sourceIds: string[];
};

type SettingsDraft = Pick<OperatorDesk, 'name' | 'type' | 'mission' | 'status' | 'defaultCheckFrequency' | 'approvalMode' | 'allowedOutputTypes' | 'allowedSources'>;
type MemoryDraft = {
  id?: string;
  scope: OperatorMemoryScope;
  scopeId?: string | null;
  memoryType: OperatorMemoryType;
  state: OperatorMemory['state'];
  content: string;
  confidence: OperatorMemoryConfidence;
  pinned: boolean;
};

const defaultWorkOrderDraft = (desk: OperatorDesk): WorkOrderDraft => ({
  title: `New ${getDeskName(desk)} work order`,
  brief: desk.mission,
  priority: 'medium',
  contextPackIds: [],
  expectedOutputTypes: ['execution_task'],
});

export function OperatorDeskDetailPage() {
  const { deskId } = useParams();
  const { userProfile } = useUser();
  const state = useOperatorDesk();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('Overview');
  const [workOrderDraft, setWorkOrderDraft] = useState<WorkOrderDraft | null>(null);
  const [contextDraft, setContextDraft] = useState<ContextDraft | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft | null>(null);
  const [memoryDraft, setMemoryDraft] = useState<MemoryDraft | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; description: string; label: string; danger?: boolean; action: () => Promise<void> | void } | null>(null);
  const [sources, setSources] = useState<ContextSource[]>([]);
  const [folders, setFolders] = useState<ContextSourceFolder[]>([]);
  const outputById = useMemo(() => new Map(state.outputs.map((output) => [output.id, output])), [state.outputs]);

  useEffect(() => {
    if (!auth.currentUser || !userProfile) return;
    const scopedSources = userProfile.companyId
      ? query(collection(db, 'contextSources'), where('companyId', '==', userProfile.companyId))
      : query(collection(db, 'contextSources'), where('authorId', '==', auth.currentUser.uid));
    const scopedFolders = userProfile.companyId
      ? query(collection(db, 'contextSourceFolders'), where('companyId', '==', userProfile.companyId))
      : query(collection(db, 'contextSourceFolders'), where('authorId', '==', auth.currentUser.uid));
    const unsubscribeSources = onSnapshot(scopedSources, (snapshot) => {
      setSources(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as ContextSource[]);
    });
    const unsubscribeFolders = onSnapshot(scopedFolders, (snapshot) => {
      setFolders((snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as ContextSourceFolder[]).sort((a, b) => a.name.localeCompare(b.name)));
    });
    return () => {
      unsubscribeSources();
      unsubscribeFolders();
    };
  }, [userProfile]);

  const desk = state.desks.find((item) => item.id === deskId || item.slug === deskId);
  if (!desk) return <Page title="Operator Desk" subtitle="Loading desk details..."><Empty>Operator Desk not found yet.</Empty></Page>;

  const deskName = getDeskName(desk);
  const workOrders = state.workOrders.filter((item) => item.operatorDeskId === desk.id);
  const contextPacks = state.contextPacks.filter((item) => item.scope === 'global' || item.scopeId === desk.id || workOrders.some((workOrder) => workOrder.contextPackIds.includes(item.id)));
  const memories = state.memories.filter((item) => item.scope === 'global' || item.scopeId === desk.id);
  const visibleMemories = memories.filter((item) => !['archived', 'rejected', 'expired'].includes(item.state));
  const archivedMemories = memories.filter((item) => item.state === 'archived');
  const suggestedMemories = visibleMemories.filter((memory) => memory.state === 'suggested');
  const outputs = state.outputs.filter((item) => item.operatorDeskId === desk.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const approvals = state.approvals.filter((item) => item.operatorDeskId === desk.id);
  const pendingApprovals = approvals.filter((item) => item.status === 'pending' || item.status === 'edited');
  const activeWork = workOrders.filter((item) => item.status === 'claimed' || item.status === 'in_progress');
  const readyWork = workOrders.filter((item) => item.status === 'ready');
  const recentOutput = outputs[0];
  const issues = outputs.filter((item) => item.outputType === 'risk_note' && item.status !== 'archived');
  const nextSchedule = frequencyLabels[desk.defaultCheckFrequency];
  const isStarterDesk = starterDeskSlugs.has(desk.slug);

  const saveWorkOrder = async () => {
    if (!userProfile || !workOrderDraft) return;
    if (workOrderDraft.id) {
      await updateDoc(doc(db, 'operatorWorkOrders', workOrderDraft.id), {
        title: workOrderDraft.title,
        brief: workOrderDraft.brief,
        priority: workOrderDraft.priority,
        contextPackIds: workOrderDraft.contextPackIds,
        expectedOutputTypes: workOrderDraft.expectedOutputTypes,
        updatedAt: new Date().toISOString(),
      });
    } else {
      await createWorkOrder(userProfile, desk, {
        title: workOrderDraft.title,
        brief: workOrderDraft.brief,
        priority: workOrderDraft.priority,
        contextPackIds: workOrderDraft.contextPackIds,
        expectedOutputTypes: workOrderDraft.expectedOutputTypes,
        status: 'ready',
      });
    }
    setWorkOrderDraft(null);
  };

  const saveContext = async () => {
    if (!userProfile || !contextDraft) return;
    const constraints = contextDraft.constraints.split('\n').map((item) => item.trim()).filter(Boolean);
    if (contextDraft.id) {
      await updateDoc(doc(db, 'operatorContextPacks', contextDraft.id), {
        title: contextDraft.title,
        description: contextDraft.description,
        instructions: contextDraft.instructions,
        constraints,
        sourceIds: contextDraft.sourceIds,
        updatedAt: new Date().toISOString(),
      });
    } else {
      await createContextPack(userProfile, {
        title: contextDraft.title,
        description: contextDraft.description,
        scope: 'operator',
        scopeId: desk.id,
        instructions: contextDraft.instructions,
        constraints,
        sourceIds: contextDraft.sourceIds,
        expectedUse: 'Desk-specific context for operator work.',
      });
    }
    setContextDraft(null);
  };

  const deleteContextPack = (pack: OperatorContextPack) => {
    setConfirm({
      title: 'Delete context pack?',
      description: 'This removes the context pack from this desk and detaches it from work orders. Existing outputs will not be deleted.',
      label: 'Delete',
      danger: true,
      action: async () => {
        await deleteDoc(doc(db, 'operatorContextPacks', pack.id));
        const linkedWorkOrders = workOrders.filter((workOrder) => workOrder.contextPackIds.includes(pack.id));
        await Promise.all(linkedWorkOrders.map((workOrder) => updateDoc(doc(db, 'operatorWorkOrders', workOrder.id), {
          contextPackIds: workOrder.contextPackIds.filter((contextPackId) => contextPackId !== pack.id),
          updatedAt: new Date().toISOString(),
        })));
      },
    });
  };

  const saveSettings = async () => {
    if (!userProfile || !settingsDraft) return;
    try {
      await updateOperatorDesk(userProfile, desk, settingsDraft);
      setSettingsDraft(null);
      setMessage('Operator Desk settings saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save Operator Desk settings.');
    }
  };

  const saveMemory = async () => {
    if (!userProfile || !memoryDraft) return;
    try {
      if (!memoryDraft.content.trim()) throw new Error('Memory content is required.');
      if (memoryDraft.id) {
        const existing = memories.find((memory) => memory.id === memoryDraft.id);
        if (!existing) throw new Error('Memory record no longer exists.');
        await updateOperatorMemory(userProfile, existing, 'activate', memoryDraft.content);
        await updateDoc(doc(db, 'operatorMemories', existing.id), {
          scope: memoryDraft.scope,
          scopeId: memoryDraft.scope === 'global' ? null : memoryDraft.scopeId || desk.id,
          memoryType: memoryDraft.memoryType,
          state: memoryDraft.state,
          confidence: memoryDraft.confidence,
          pinned: memoryDraft.pinned || memoryDraft.state === 'pinned',
          updatedAt: new Date().toISOString(),
        });
      } else {
        await createOperatorMemory(userProfile, {
          scope: memoryDraft.scope,
          scopeId: memoryDraft.scope === 'global' ? null : memoryDraft.scopeId || desk.id,
          memoryType: memoryDraft.memoryType,
          state: memoryDraft.state,
          content: memoryDraft.content,
          confidence: memoryDraft.confidence,
          pinned: memoryDraft.pinned,
        });
      }
      setMemoryDraft(null);
      setMessage('Operator memory saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save operator memory.');
    }
  };

  const openEditSettings = () => setSettingsDraft({
    name: desk.name,
    type: desk.type,
    mission: desk.mission,
    status: desk.status,
    defaultCheckFrequency: desk.defaultCheckFrequency,
    approvalMode: normalizeOperatorApprovalMode(desk.approvalMode),
    allowedSources: desk.allowedSources,
    allowedOutputTypes: desk.allowedOutputTypes,
  });

  const openCreateMemory = () => setMemoryDraft({
    scope: 'operator',
    scopeId: desk.id,
    memoryType: 'lesson',
    state: 'active',
    content: '',
    confidence: 'medium',
    pinned: false,
  });

  const openEditMemory = (memory: OperatorMemory) => setMemoryDraft({
    id: memory.id,
    scope: memory.scope,
    scopeId: memory.scopeId || null,
    memoryType: memory.memoryType,
    state: memory.state,
    content: memory.content,
    confidence: memory.confidence,
    pinned: memory.pinned,
  });

  const confirmDeskStatus = (status: OperatorDesk['status']) => {
    const isArchive = status === 'archived';
    setConfirm({
      title: isArchive ? 'Archive desk?' : 'Restore desk?',
      description: isArchive
        ? 'This keeps the desk history but blocks new operator runs and hides it from the default list.'
        : 'This returns the desk to active use and makes it available for operator work again.',
      label: isArchive ? 'Archive' : 'Restore',
      danger: isArchive,
      action: async () => {
        if (userProfile) await updateOperatorDeskStatus(userProfile, desk, status);
      },
    });
  };

  const confirmApproval = (approval: OperatorApproval, decision: 'approve' | 'reject') => {
    setConfirm({
      title: decision === 'approve' ? 'Approve operator change?' : 'Reject operator change?',
      description: `${approvalPlainText(approval, deskName)} ${riskCopy(approval.riskLevel)}`,
      label: decision === 'approve' ? 'Approve' : 'Reject',
      danger: decision === 'reject',
      action: async () => {
        if (userProfile) await resolveOperatorApproval(userProfile, approval, decision);
      },
    });
  };

  const openEditWorkOrder = (workOrder: OperatorWorkOrder) => setWorkOrderDraft({
    id: workOrder.id,
    title: workOrder.title,
    brief: workOrder.brief,
    priority: workOrder.priority,
    contextPackIds: workOrder.contextPackIds,
    expectedOutputTypes: workOrder.expectedOutputTypes,
  });

  const openEditContext = (pack: OperatorContextPack) => setContextDraft({
    id: pack.id,
    title: pack.title,
    description: pack.description,
    instructions: pack.instructions,
    constraints: pack.constraints.join('\n'),
    sourceIds: pack.sourceIds,
  });

  return (
    <Page title={deskName} subtitle={desk.mission}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">Status: {deskStatusLabels[desk.status]} - {isStarterDesk ? 'Starter desk' : 'Custom desk'}</p>
          <p className="mt-1 text-sm text-zinc-600">{message || `${nextSchedule} check frequency`}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={desk.status === 'archived'} onClick={() => setWorkOrderDraft(defaultWorkOrderDraft(desk))} className="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-4 py-2 text-xs font-bold text-white disabled:bg-zinc-200 disabled:text-zinc-400"><ClipboardPlus className="h-3 w-3" /> New Work Order</button>
          <button disabled={desk.status === 'archived'} onClick={openEditSettings} className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-bold disabled:text-zinc-400">Edit Desk</button>
          {desk.status === 'archived' ? (
            <button onClick={() => confirmDeskStatus('active')} className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-4 py-2 text-xs font-bold"><RotateCcw className="h-3.5 w-3.5" /> Restore</button>
          ) : (
            <button onClick={() => confirmDeskStatus('archived')} className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-4 py-2 text-xs font-bold text-zinc-600 hover:border-red-200 hover:text-red-600"><Archive className="h-3.5 w-3.5" /> Archive</button>
          )}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl bg-zinc-100 p-1">
        {tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${tab === item ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500'}`}>{item}</button>)}
      </div>

      {tab === 'Overview' && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Current Work" subtitle="What this desk is handling now.">
            <SummaryRow label="Active work" value={activeWork.length} />
            <SummaryRow label="Ready work" value={readyWork.length} />
            <SummaryRow label="Pending approvals" value={pendingApprovals.length} />
            <SummaryRow label="Next scheduled check" value={nextSchedule} />
          </Panel>
          <Panel title="Recent Output" subtitle="Latest submitted operator work.">
            {recentOutput ? <Row title={recentOutput.title} detail={recentOutput.summary || outputStatusLabels[recentOutput.status]} onClick={() => navigate(`/operator-outputs/${recentOutput.id}`)} actionLabel="View output" /> : <Empty>No recent output.</Empty>}
          </Panel>
          <Panel title="Issues Needing Attention" subtitle="Risks or blockers from this desk.">
            {issues.length ? issues.slice(0, 6).map((item) => <Row key={item.id} title={item.title} detail={item.summary} onClick={() => navigate(`/operator-outputs/${item.id}`)} />) : <Empty>No issues need attention.</Empty>}
          </Panel>
          <Panel title="Memory Suggestions" subtitle="Suggested context updates.">
            {suggestedMemories.length ? suggestedMemories.map((memory) => <Row key={memory.id} title={memory.content} detail={confidenceLabels[memory.confidence]} />) : <Empty>No memory suggestions waiting.</Empty>}
          </Panel>
        </div>
      )}

      {tab === 'Work Orders' && (
        <Panel title="Work Orders" subtitle="Create, edit, or open operator work." action="New Work Order" onAction={() => setWorkOrderDraft(defaultWorkOrderDraft(desk))}>
          {workOrders.length ? workOrders.map((workOrder) => (
            <div key={workOrder.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <button onClick={() => navigate(`/work-orders/${workOrder.id}`)} className="min-w-0 text-left">
                <p className="truncate text-sm font-bold text-zinc-900">{workOrder.title}</p>
                <p className="mt-0.5 truncate text-xs text-zinc-500">{workOrderStatusLabels[workOrder.status]} - {priorityLabels[workOrder.priority]} - {workOrder.expectedOutputTypes.map(labelOutputType).join(', ')}</p>
              </button>
              <button onClick={() => openEditWorkOrder(workOrder)} className="rounded-lg border border-zinc-200 p-2 text-zinc-500 hover:text-zinc-900"><Pencil className="h-3.5 w-3.5" /></button>
            </div>
          )) : <Empty>No work orders are ready to start.</Empty>}
        </Panel>
      )}

      {tab === 'Context' && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Context Packs" subtitle="Instructions and constraints for operator work." action="Add Context Pack" onAction={() => setContextDraft({ title: `${deskName} context`, description: desk.mission, instructions: '', constraints: '', sourceIds: [] })}>
            {contextPacks.length ? contextPacks.map((pack) => (
              <div key={pack.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-50">
                <button onClick={() => openEditContext(pack)} className="min-w-0 text-left">
                  <p className="truncate text-sm font-bold text-zinc-900">{pack.title}</p>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">{pack.description || pack.instructions || 'Context pack'}</p>
                </button>
                <div className="flex shrink-0 gap-1">
                  <button title="Edit context" onClick={() => openEditContext(pack)} className="rounded-lg border border-zinc-200 p-2 text-zinc-500 hover:text-zinc-900"><Pencil className="h-3.5 w-3.5" /></button>
                  <button title="Delete context" onClick={() => deleteContextPack(pack)} className="rounded-lg border border-zinc-200 p-2 text-zinc-500 hover:border-red-200 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            )) : <Empty>No context packs attached.</Empty>}
          </Panel>
          <Panel title="Visible Memory" subtitle="Create, approve, edit, pin, archive, or restore operator context." action="New Memory" onAction={openCreateMemory}>
            {visibleMemories.length ? visibleMemories.map((memory) => <MemoryRow key={memory.id} memory={memory} onEdit={() => openEditMemory(memory)} onConfirm={setConfirm} userProfile={userProfile} />) : <Empty>No visible memory.</Empty>}
            {archivedMemories.length > 0 && (
              <div className="bg-zinc-50">
                <p className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">Archived</p>
                {archivedMemories.map((memory) => <MemoryRow key={memory.id} memory={memory} onEdit={() => openEditMemory(memory)} onConfirm={setConfirm} userProfile={userProfile} />)}
              </div>
            )}
          </Panel>
        </div>
      )}

      {tab === 'Outputs' && (
        <Panel title="Outputs" subtitle="Readable cards for submitted operator work.">
          {outputs.length ? outputs.map((item) => <Row key={item.id} title={item.title} detail={`${item.summary || labelOutputType(item.outputType)} - ${labelStatus(item.status)}`} onClick={() => navigate(`/operator-outputs/${item.id}`)} actionLabel="View output" />) : <Empty>No completed outputs yet.</Empty>}
        </Panel>
      )}

      {tab === 'Approvals' && (
        <Panel title="Approvals" subtitle="Human approval is required before risky changes are written.">
          {approvals.length ? approvals.map((item) => {
            const output = item.outputId ? outputById.get(item.outputId) : undefined;
            const isActionable = item.status === 'pending' || item.status === 'edited';
            return (
              <div key={item.id} className="border-b border-zinc-100 p-4 last:border-0">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                  <div>
                    <p className="text-sm font-black text-zinc-900">{approvalPlainText(item, deskName)}</p>
                    <p className="mt-1 text-sm text-zinc-500">{item.summary}</p>
                    <p className="mt-1 text-xs font-bold text-zinc-400">{labelStatus(item.status)} - {riskLabels[item.riskLevel]} - {riskCopy(item.riskLevel)}</p>
                    {output?.content && <p className="mt-2 line-clamp-2 text-xs text-zinc-500">{output.content}</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {isActionable ? (
                      <>
                        <button onClick={() => confirmApproval(item, 'reject')} className="rounded-full border border-zinc-200 px-3 py-2 text-xs font-bold">Reject</button>
                        <button onClick={() => confirmApproval(item, 'approve')} className="rounded-full bg-zinc-950 px-3 py-2 text-xs font-bold text-white">Approve</button>
                      </>
                    ) : (
                      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-bold text-zinc-500">{labelStatus(item.status)}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          }) : <Empty>No approvals need your review.</Empty>}
        </Panel>
      )}

      {tab === 'Settings' && (
        <Panel title="Settings" subtitle="Safe settings for this operator workspace." action={desk.status === 'archived' ? 'Restore Desk' : 'Edit Desk'} onAction={desk.status === 'archived' ? () => confirmDeskStatus('active') : openEditSettings}>
          <div className="space-y-3 p-4 text-sm text-zinc-600">
            <p><b>Name:</b> {deskName}</p>
            <p><b>Status:</b> {deskStatusLabels[desk.status]}</p>
            <p><b>Schedule:</b> {frequencyLabels[desk.defaultCheckFrequency]}</p>
            <p><b>Automation:</b> {operatorApprovalModeLabel(desk.approvalMode)}</p>
            <p><b>Allowed outputs:</b> {desk.allowedOutputTypes.map(labelOutputType).join(', ')}</p>
            <p><b>Routing:</b> Internal work is applied automatically. External and sensitive actions require approval.</p>
          </div>
        </Panel>
      )}

      <WorkOrderDrawer draft={workOrderDraft} contextPacks={contextPacks} onChange={setWorkOrderDraft} onClose={() => setWorkOrderDraft(null)} onSave={() => void saveWorkOrder()} />
      <ContextDrawer draft={contextDraft} sources={sources} folders={folders} onChange={setContextDraft} onClose={() => setContextDraft(null)} onSave={() => void saveContext()} />
      <SettingsDrawer draft={settingsDraft} onChange={setSettingsDraft} onClose={() => setSettingsDraft(null)} onSave={() => void saveSettings()} />
      <MemoryDrawer draft={memoryDraft} onChange={setMemoryDraft} onClose={() => setMemoryDraft(null)} onSave={() => void saveMemory()} />
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title || ''}
        description={confirm?.description || ''}
        confirmLabel={confirm?.label}
        danger={confirm?.danger}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          await confirm?.action();
          setConfirm(null);
        }}
      />
    </Page>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between px-4 py-3"><span className="text-sm text-zinc-500">{label}</span><span className="text-sm font-black text-zinc-900">{value}</span></div>;
}

function DrawerActions({ onCancel, onSave }: { onCancel: () => void; onSave: () => void }) {
  return (
    <>
      <button onClick={onCancel} className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-bold">Cancel</button>
      <button onClick={onSave} className="rounded-full bg-zinc-950 px-4 py-2 text-xs font-bold text-white">Save</button>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-bold text-zinc-500">{label}</span>{children}</label>;
}

function WorkOrderDrawer({ draft, contextPacks, onChange, onClose, onSave }: { draft: WorkOrderDraft | null; contextPacks: OperatorContextPack[]; onChange: (draft: WorkOrderDraft | null) => void; onClose: () => void; onSave: () => void }) {
  if (!draft) return null;
  const update = (patch: Partial<WorkOrderDraft>) => onChange({ ...draft, ...patch });
  return (
    <Drawer open title={draft.id ? 'Edit Work Order' : 'New Work Order'} description="Define the work and desired result for the operator." onClose={onClose} footer={<DrawerActions onCancel={onClose} onSave={onSave} />}>
      <div className="space-y-4">
        <Field label="Title"><input value={draft.title} onChange={(event) => update({ title: event.target.value })} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400" /></Field>
        <Field label="Brief"><textarea value={draft.brief} onChange={(event) => update({ brief: event.target.value })} className="min-h-32 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400" /></Field>
        <Field label="Priority"><select value={draft.priority} onChange={(event) => update({ priority: event.target.value as OperatorPriority })} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm">{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="Context pack"><select value={draft.contextPackIds[0] || ''} onChange={(event) => update({ contextPackIds: event.target.value ? [event.target.value] : [] })} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"><option value="">None</option>{contextPacks.map((pack) => <option key={pack.id} value={pack.id}>{pack.title}</option>)}</select></Field>
        <Field label="Desired result"><select value={draft.expectedOutputTypes[0] || 'execution_task'} onChange={(event) => update({ expectedOutputTypes: [event.target.value as OperatorOutputType] })} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm">{desiredResultOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
      </div>
    </Drawer>
  );
}

function ContextDrawer({ draft, sources, folders, onChange, onClose, onSave }: { draft: ContextDraft | null; sources: ContextSource[]; folders: ContextSourceFolder[]; onChange: (draft: ContextDraft | null) => void; onClose: () => void; onSave: () => void }) {
  const [sourceSearch, setSourceSearch] = useState('');
  const [folderFilter, setFolderFilter] = useState('all');
  if (!draft) return null;
  const update = (patch: Partial<ContextDraft>) => onChange({ ...draft, ...patch });
  const filteredSources = sources
    .filter((source) => source.status === 'active')
    .filter((source) => folderFilter === 'all' || (folderFilter === 'unfiled' ? !source.folderId : source.folderId === folderFilter))
    .filter((source) => {
      const q = sourceSearch.trim().toLowerCase();
      if (!q) return true;
      return [source.title, source.latestFileName, source.latestSummary, ...(source.aliases || [])].join(' ').toLowerCase().includes(q);
    })
    .sort((a, b) => a.title.localeCompare(b.title));
  const selectedSources = sources.filter((source) => draft.sourceIds.includes(source.id));
  const addFolderSources = () => {
    if (folderFilter === 'all') return;
    const folderSourceIds = sources
      .filter((source) => folderFilter === 'unfiled' ? !source.folderId : source.folderId === folderFilter)
      .map((source) => source.id);
    update({ sourceIds: Array.from(new Set([...draft.sourceIds, ...folderSourceIds])) });
  };
  return (
    <Drawer open title={draft.id ? 'Edit Context Pack' : 'Add Context Pack'} description="Manage instructions, constraints, and source folders for this desk." onClose={onClose} footer={<DrawerActions onCancel={onClose} onSave={onSave} />}>
      <div className="space-y-4">
        <Field label="Context pack title"><input value={draft.title} onChange={(event) => update({ title: event.target.value })} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400" /></Field>
        <Field label="Description"><textarea value={draft.description} onChange={(event) => update({ description: event.target.value })} className="min-h-20 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400" /></Field>
        <Field label="Instructions for the operator"><textarea value={draft.instructions} onChange={(event) => update({ instructions: event.target.value })} className="min-h-28 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400" /></Field>
        <Field label="Constraints / do not do"><textarea value={draft.constraints} onChange={(event) => update({ constraints: event.target.value })} className="min-h-24 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400" /></Field>
        <div className="rounded-2xl border border-zinc-200">
          <div className="border-b border-zinc-100 px-3 py-3">
            <span className="text-xs font-bold text-zinc-500">Connected sources</span>
            <p className="mt-1 text-xs text-zinc-400">Search docs or add every source from a folder.</p>
          </div>
          <div className="space-y-3 p-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                <input value={sourceSearch} onChange={(event) => setSourceSearch(event.target.value)} placeholder="Search docs..." className="w-full rounded-xl border border-zinc-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-zinc-400" />
              </div>
              <select value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)} className="rounded-xl border border-zinc-200 px-3 py-2 text-sm">
                <option value="all">All folders</option>
                <option value="unfiled">Unfiled</option>
                {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
              </select>
            </div>
            {folderFilter !== 'all' && (
              <button onClick={addFolderSources} className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50">
                <Folder className="h-3.5 w-3.5" /> Add folder sources
              </button>
            )}
            {selectedSources.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedSources.map((source) => (
                  <button key={source.id} onClick={() => update({ sourceIds: draft.sourceIds.filter((id) => id !== source.id) })} className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-600">
                    {source.title} <X className="h-3 w-3" />
                  </button>
                ))}
              </div>
            )}
            <div className="max-h-64 overflow-y-auto rounded-xl border border-zinc-100">
              {filteredSources.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-zinc-400">No matching docs.</div>
              ) : filteredSources.map((source) => {
                const checked = draft.sourceIds.includes(source.id);
                const folderName = folders.find((folder) => folder.id === source.folderId)?.name;
                return (
                  <label key={source.id} className="flex cursor-pointer items-start gap-3 border-b border-zinc-100 px-3 py-2 last:border-0 hover:bg-zinc-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => update({
                        sourceIds: event.target.checked
                          ? Array.from(new Set([...draft.sourceIds, source.id]))
                          : draft.sourceIds.filter((id) => id !== source.id),
                      })}
                      className="mt-1"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-zinc-800">{source.title}</span>
                      <span className="block truncate text-xs text-zinc-500">{folderName || 'Unfiled'} - {source.latestFileName}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  );
}

function SettingsDrawer({ draft, onChange, onClose, onSave }: { draft: SettingsDraft | null; onChange: (draft: SettingsDraft | null) => void; onClose: () => void; onSave: () => void }) {
  if (!draft) return null;
  const update = (patch: Partial<SettingsDraft>) => onChange({ ...draft, ...patch });
  const toggleOutputType = (outputType: OperatorOutputType) => {
    update({
      allowedOutputTypes: draft.allowedOutputTypes.includes(outputType)
        ? draft.allowedOutputTypes.filter((item) => item !== outputType)
        : [...draft.allowedOutputTypes, outputType],
    });
  };
  return (
    <Drawer open title="Edit Desk" description="Only safe desk settings are editable here." onClose={onClose} footer={<DrawerActions onCancel={onClose} onSave={onSave} />}>
      <div className="space-y-4">
        <Field label="Operator name"><input value={draft.name} onChange={(event) => update({ name: event.target.value })} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400" /></Field>
        <Field label="Mission / description"><textarea value={draft.mission} onChange={(event) => update({ mission: event.target.value })} className="min-h-32 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400" /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Desk type"><select value={draft.type} onChange={(event) => update({ type: event.target.value as OperatorDeskType })} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm">
            {['ops', 'content', 'creative', 'bug', 'feature', 'research', 'growth', 'feedback'].map((type) => <option key={type} value={type}>{type}</option>)}
          </select></Field>
          <Field label="Status"><select value={draft.status} onChange={(event) => update({ status: event.target.value as OperatorDesk['status'] })} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm">
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select></Field>
          <Field label="Schedule"><select value={draft.defaultCheckFrequency} onChange={(event) => update({ defaultCheckFrequency: event.target.value as OperatorCheckFrequency })} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm">{Object.entries(frequencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        </div>
        <Field label="Automation mode"><select value={draft.approvalMode} onChange={(event) => update({ approvalMode: event.target.value as OperatorApprovalMode })} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm">
          <option value="action_based">Autonomous internal work</option>
          <option value="draft_only">Draft only</option>
        </select></Field>
        <div>
          <span className="mb-2 block text-xs font-bold text-zinc-500">Allowed outputs</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {desiredResultOptions.map((option) => (
              <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
                <input type="checkbox" checked={draft.allowedOutputTypes.includes(option.value)} onChange={() => toggleOutputType(option.value)} />
                {labelOutputType(option.value)}
              </label>
            ))}
          </div>
        </div>
      </div>
    </Drawer>
  );
}

function MemoryDrawer({ draft, onChange, onClose, onSave }: { draft: MemoryDraft | null; onChange: (draft: MemoryDraft | null) => void; onClose: () => void; onSave: () => void }) {
  if (!draft) return null;
  const update = (patch: Partial<MemoryDraft>) => onChange({ ...draft, ...patch });
  return (
    <Drawer open title={draft.id ? 'Edit Memory' : 'New Memory'} description="Manage readable context used by this operator." onClose={onClose} footer={<DrawerActions onCancel={onClose} onSave={onSave} />}>
      <div className="space-y-4">
        <Field label="Content"><textarea value={draft.content} onChange={(event) => update({ content: event.target.value })} className="min-h-40 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400" /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Scope"><select value={draft.scope} onChange={(event) => update({ scope: event.target.value as OperatorMemoryScope })} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm">
            <option value="operator">This desk</option>
            <option value="global">Global</option>
          </select></Field>
          <Field label="Type"><select value={draft.memoryType} onChange={(event) => update({ memoryType: event.target.value as OperatorMemoryType })} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm">
            {['fact', 'preference', 'decision', 'style', 'constraint', 'lesson', 'avoid', 'source_note', 'workflow_rule'].map((type) => <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>)}
          </select></Field>
          <Field label="Confidence"><select value={draft.confidence} onChange={(event) => update({ confidence: event.target.value as OperatorMemoryConfidence })} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="State"><select value={draft.state} onChange={(event) => update({ state: event.target.value as OperatorMemory['state'], pinned: event.target.value === 'pinned' || draft.pinned })} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm">
            <option value="active">Active</option>
            <option value="pinned">Pinned</option>
            <option value="suggested">Suggested</option>
            <option value="archived">Archived</option>
          </select></Field>
          <label className="flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-700">
            <input type="checkbox" checked={draft.pinned} onChange={(event) => update({ pinned: event.target.checked, state: event.target.checked ? 'pinned' : draft.state === 'pinned' ? 'active' : draft.state })} />
            Pin memory
          </label>
        </div>
      </div>
    </Drawer>
  );
}

function MemoryRow({ memory, onEdit, onConfirm, userProfile }: { key?: React.Key; memory: OperatorMemory; onEdit: () => void; onConfirm: (confirm: { title: string; description: string; label: string; danger?: boolean; action: () => Promise<void> | void }) => void; userProfile: ReturnType<typeof useUser>['userProfile'] }) {
  const run = (title: string, label: string, action: 'pin' | 'reject' | 'archive' | 'activate' | 'delete', danger?: boolean) => {
    onConfirm({
      title,
      description: 'This changes visible operator memory used for future work.',
      label,
      danger,
      action: async () => {
        if (userProfile) await updateOperatorMemory(userProfile, memory, action);
      },
    });
  };
  const isArchived = memory.state === 'archived';
  const isSuggested = memory.state === 'suggested';
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-800">{memory.content}</p>
        <p className="mt-1 text-xs text-zinc-400">{labelStatus(memory.state)} - {confidenceLabels[memory.confidence]}{memory.source ? ` - ${memory.source}` : ''}</p>
      </div>
      <div className="flex shrink-0 gap-1">
        <Action title="Edit" onClick={onEdit}><Pencil /></Action>
        {isArchived ? (
          <Action title="Restore" onClick={() => run('Restore memory?', 'Restore', 'activate')}><RotateCcw /></Action>
        ) : (
          <>
            {isSuggested && <Action title="Approve suggestion" onClick={() => run('Approve memory suggestion?', 'Approve', 'activate')}><Plus /></Action>}
            {isSuggested && <Action title="Reject suggestion" onClick={() => run('Reject memory suggestion?', 'Reject', 'reject', true)}><X /></Action>}
            <Action title={memory.pinned ? 'Unpin' : 'Pin'} onClick={() => run(memory.pinned ? 'Unpin memory?' : 'Pin memory?', memory.pinned ? 'Unpin' : 'Pin', 'pin')}><Pin /></Action>
            <Action title="Archive" onClick={() => run('Archive memory?', 'Archive', 'archive', true)}><Archive /></Action>
          </>
        )}
      </div>
    </div>
  );
}

function Action({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return <button title={title} onClick={onClick} className="rounded-lg border border-zinc-200 p-1.5 text-zinc-400 hover:text-zinc-900 [&_svg]:h-3 [&_svg]:w-3">{children}</button>;
}
