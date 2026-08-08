import React, { useEffect, useState } from 'react';
import { Bot, Brain, ClipboardList, FileOutput, Loader2, Pause, Play, Plus, ShieldCheck, X } from 'lucide-react';
import { StudioHeader } from '../components/ui/StudioHeader';
import { useUser } from '../contexts/UserContext';
import { standaloneClient } from '../services/standaloneClient';
import type {
  OperatorApproval,
  OperatorDesk,
  OperatorMemory,
  OperatorOutput,
  OperatorPriority,
  OperatorWorkOrder,
} from '../types';

export function StandaloneOperatorsPage() {
  const { userProfile } = useUser();
  const [desks, setDesks] = useState<OperatorDesk[]>([]);
  const [orders, setOrders] = useState<OperatorWorkOrder[]>([]);
  const [memories, setMemories] = useState<OperatorMemory[]>([]);
  const [outputs, setOutputs] = useState<OperatorOutput[]>([]);
  const [approvals, setApprovals] = useState<OperatorApproval[]>([]);
  const [selectedDeskId, setSelectedDeskId] = useState('');
  const [deskName, setDeskName] = useState('');
  const [deskMission, setDeskMission] = useState('');
  const [orderTitle, setOrderTitle] = useState('');
  const [orderBrief, setOrderBrief] = useState('');
  const [priority, setPriority] = useState<OperatorPriority>('medium');
  const [agentName, setAgentName] = useState('codex');
  const [memoryContent, setMemoryContent] = useState('');
  const [outputTitle, setOutputTitle] = useState('');
  const [outputSummary, setOutputSummary] = useState('');
  const [outputContent, setOutputContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDesk = desks.find((desk) => desk.id === selectedDeskId) ?? null;
  const visibleOrders = orders.filter((order) => order.operatorDeskId === selectedDeskId);
  const visibleMemories = memories.filter((memory) => memory.scope === 'global' || memory.scopeId === selectedDeskId);
  const visibleOutputs = outputs.filter((output) => output.operatorDeskId === selectedDeskId);
  const visibleApprovals = approvals.filter((approval) => approval.operatorDeskId === selectedDeskId);

  const load = async () => {
    try {
      const [deskResult, orderResult, memoryResult, outputResult, approvalResult] = await Promise.all([
        standaloneClient.listOperatorDesks(),
        standaloneClient.listOperatorWorkOrders(),
        standaloneClient.listOperatorMemories(),
        standaloneClient.listOperatorOutputs(),
        standaloneClient.listOperatorApprovals(),
      ]);
      setDesks(deskResult.data);
      setOrders(orderResult.data);
      setMemories(memoryResult.data);
      setOutputs(outputResult.data);
      setApprovals(approvalResult.data);
      setSelectedDeskId((current) => current || deskResult.data[0]?.id || '');
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Operators failed to load.');
    }
  };

  const createMemory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedDesk) return;
    setBusy(true);
    setError(null);
    try {
      const created = await standaloneClient.createOperatorMemory({
        scope: 'operator',
        scopeId: selectedDesk.id,
        memoryType: 'lesson',
        state: 'active',
        content: memoryContent,
        confidence: 'medium',
      });
      setMemories((current) => [created, ...current]);
      setMemoryContent('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Memory creation failed.');
    } finally {
      setBusy(false);
    }
  };

  const submitOutput = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedDesk) return;
    setBusy(true);
    setError(null);
    try {
      const result = await standaloneClient.submitOperatorOutput({
        operatorDeskId: selectedDesk.id,
        externalAgentName: agentName,
        outputType: 'execution_task',
        title: outputTitle,
        summary: outputSummary,
        content: outputContent,
        suggestedDestinations: ['tasks'],
        confidence: 'medium',
      });
      setOutputs((current) => [result.data, ...current]);
      setApprovals((current) => [
        ...result.routes.flatMap((route) => route.approval ? [route.approval] : []),
        ...current,
      ]);
      setOutputTitle('');
      setOutputSummary('');
      setOutputContent('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Output submission failed.');
    } finally {
      setBusy(false);
    }
  };

  const decideApproval = async (approval: OperatorApproval, decision: 'approve' | 'reject') => {
    setBusy(true);
    setError(null);
    try {
      const result = decision === 'approve'
        ? await standaloneClient.approveOperatorApproval(approval.id)
        : await standaloneClient.rejectOperatorApproval(approval.id, 'Rejected from standalone approval inbox.');
      setApprovals((current) => current.map((item) => item.id === result.data.id ? result.data : item));
      const refreshedOutputs = await standaloneClient.listOperatorOutputs();
      setOutputs(refreshedOutputs.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Approval decision failed.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, [userProfile?.companyId]);

  const createDesk = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await standaloneClient.createOperatorDesk({
        name: deskName,
        mission: deskMission,
        allowedOutputTypes: ['execution_task', 'risk_note', 'memory_suggestion'],
      });
      setDesks((current) => [created, ...current]);
      setSelectedDeskId(created.id);
      setDeskName('');
      setDeskMission('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Operator Desk creation failed.');
    } finally {
      setBusy(false);
    }
  };

  const createOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedDesk) return;
    setBusy(true);
    setError(null);
    try {
      const created = await standaloneClient.createOperatorWorkOrder({
        operatorDeskId: selectedDesk.id,
        title: orderTitle,
        brief: orderBrief,
        priority,
        expectedOutputTypes: selectedDesk.allowedOutputTypes.slice(0, 3),
      });
      setOrders((current) => [created, ...current]);
      setOrderTitle('');
      setOrderBrief('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Work order creation failed.');
    } finally {
      setBusy(false);
    }
  };

  const claim = async (order: OperatorWorkOrder) => {
    setBusy(true);
    setError(null);
    try {
      const updated = order.claimedBy === agentName
        ? await standaloneClient.releaseOperatorWorkOrder(order.id, agentName)
        : await standaloneClient.claimOperatorWorkOrder(order.id, agentName);
      setOrders((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Claim update failed.');
    } finally {
      setBusy(false);
    }
  };

  const advance = async (order: OperatorWorkOrder) => {
    const nextStatus: OperatorWorkOrder['status'] =
      order.status === 'claimed' ? 'in_progress'
        : order.status === 'in_progress' ? 'submitted'
          : order.status === 'submitted' ? 'needs_review'
            : order.status;
    if (nextStatus === order.status) return;
    setBusy(true);
    try {
      const updated = await standaloneClient.updateOperatorWorkOrder(order.id, { status: nextStatus });
      setOrders((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Work order update failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-50">
      <StudioHeader
        showNotifications={false}
        badge="PostgreSQL"
        badgeIcon={<Bot className="h-3.5 w-3.5" />}
        title="Operators"
        subtitle="Durable desks and claim-safe work orders for external agents."
      />
      {error && <div className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="grid min-h-0 flex-1 gap-5 p-5 xl:grid-cols-[300px_1fr]">
        <aside className="overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4">
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Operator Desks</h2>
          <form onSubmit={createDesk} className="mt-4 space-y-2">
            <input required value={deskName} onChange={(event) => setDeskName(event.target.value)} placeholder="Release Operations" className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
            <textarea required value={deskMission} onChange={(event) => setDeskMission(event.target.value)} placeholder="Mission and operating boundary" className="min-h-20 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
            <button disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 px-3 py-2 text-sm font-semibold text-white">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create desk
            </button>
          </form>
          <div className="mt-4 space-y-2">
            {desks.map((desk) => (
              <button key={desk.id} onClick={() => setSelectedDeskId(desk.id)} className={`w-full rounded-xl border p-3 text-left ${desk.id === selectedDeskId ? 'border-violet-500 bg-violet-50' : 'border-zinc-100 hover:bg-zinc-50'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-bold">{desk.name}</span>
                  <span className="text-[10px] uppercase text-zinc-400">{desk.status}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{desk.mission}</p>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-h-0 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5">
          {!selectedDesk ? (
            <div className="flex h-full items-center justify-center text-sm text-zinc-400">Create an Operator Desk to begin.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-100 pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold">{selectedDesk.name}</h2>
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase text-emerald-700">{selectedDesk.approvalMode}</span>
                  </div>
                  <p className="mt-1 max-w-2xl text-sm text-zinc-500">{selectedDesk.mission}</p>
                </div>
                <label className="text-xs font-semibold text-zinc-500">
                  External agent
                  <input value={agentName} onChange={(event) => setAgentName(event.target.value)} className="ml-2 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-900" />
                </label>
              </div>

              <form onSubmit={createOrder} className="mt-5 grid gap-3 rounded-2xl bg-zinc-50 p-4 md:grid-cols-[1fr_160px_auto]">
                <div className="space-y-2">
                  <input required value={orderTitle} onChange={(event) => setOrderTitle(event.target.value)} placeholder="Work order title" className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm" />
                  <textarea required value={orderBrief} onChange={(event) => setOrderBrief(event.target.value)} placeholder="Expected outcome and constraints" className="min-h-20 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm" />
                </div>
                <select value={priority} onChange={(event) => setPriority(event.target.value as OperatorPriority)} className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm capitalize">
                  <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
                </select>
                <button disabled={busy} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Add order</button>
              </form>

              <div className="mt-5 space-y-3">
                {visibleOrders.map((order) => (
                  <article key={order.id} className="rounded-2xl border border-zinc-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <ClipboardList className="h-4 w-4 text-zinc-400" />
                          <h3 className="font-bold">{order.title}</h3>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${order.priority === 'critical' ? 'bg-red-100 text-red-700' : 'bg-zinc-100 text-zinc-600'}`}>{order.priority}</span>
                        </div>
                        <p className="mt-2 text-sm text-zinc-600">{order.brief}</p>
                        <p className="mt-2 text-xs text-zinc-400">{order.status}{order.claimedBy ? ` · claimed by ${order.claimedBy}` : ''}</p>
                      </div>
                      <div className="flex gap-2">
                        {['ready', 'claimed'].includes(order.status) && (
                          <button onClick={() => void claim(order)} disabled={busy || (!!order.claimedBy && order.claimedBy !== agentName)} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold disabled:opacity-40">
                            {order.claimedBy === agentName ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                            {order.claimedBy === agentName ? 'Release' : 'Claim'}
                          </button>
                        )}
                        {['claimed', 'in_progress', 'submitted'].includes(order.status) && (
                          <button onClick={() => void advance(order)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white">
                            <ShieldCheck className="h-3.5 w-3.5" /> Advance
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-8 grid gap-5 xl:grid-cols-2">
                <section className="rounded-2xl border border-zinc-200 p-4">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-violet-500" />
                    <h3 className="font-bold">Durable memory</h3>
                  </div>
                  <form onSubmit={createMemory} className="mt-3 flex gap-2">
                    <textarea required value={memoryContent} onChange={(event) => setMemoryContent(event.target.value)} placeholder="A reusable constraint, decision, or lesson" className="min-h-20 flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                    <button disabled={busy} className="self-end rounded-xl bg-zinc-950 p-2.5 text-white" aria-label="Store memory"><Plus className="h-4 w-4" /></button>
                  </form>
                  <div className="mt-4 space-y-2">
                    {visibleMemories.slice(0, 8).map((memory) => (
                      <div key={memory.id} className="rounded-xl bg-zinc-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold uppercase text-zinc-400">{memory.memoryType} · {memory.state}</span>
                          <span className="text-[10px] uppercase text-zinc-400">{memory.confidence}</span>
                        </div>
                        <p className="mt-1 text-sm text-zinc-700">{memory.content}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-zinc-200 p-4">
                  <div className="flex items-center gap-2">
                    <FileOutput className="h-4 w-4 text-blue-500" />
                    <h3 className="font-bold">Submit operator output</h3>
                  </div>
                  <form onSubmit={submitOutput} className="mt-3 space-y-2">
                    <input required value={outputTitle} onChange={(event) => setOutputTitle(event.target.value)} placeholder="Proposed task title" className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                    <input required value={outputSummary} onChange={(event) => setOutputSummary(event.target.value)} placeholder="Why this matters" className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                    <textarea required value={outputContent} onChange={(event) => setOutputContent(event.target.value)} placeholder="Execution details and evidence" className="min-h-24 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                    <button disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
                      <ShieldCheck className="h-4 w-4" /> Route through approval
                    </button>
                  </form>
                  <div className="mt-4 space-y-2">
                    {visibleOutputs.slice(0, 6).map((output) => (
                      <div key={output.id} className="rounded-xl bg-zinc-50 p-3">
                        <p className="text-sm font-semibold">{output.title}</p>
                        <p className="mt-1 text-xs uppercase text-zinc-400">{output.outputType} · {output.status}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-amber-700" />
                  <h3 className="font-bold text-amber-950">Approval inbox</h3>
                </div>
                <div className="mt-3 space-y-3">
                  {visibleApprovals.length === 0 && <p className="text-sm text-amber-700">No operator writes await review.</p>}
                  {visibleApprovals.map((approval) => (
                    <article key={approval.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white p-3">
                      <div>
                        <p className="text-sm font-bold">{approval.title}</p>
                        <p className="mt-1 text-xs text-zinc-500">{approval.targetHub} · {approval.riskLevel} risk · {approval.status}</p>
                      </div>
                      {['pending', 'edited'].includes(approval.status) && (
                        <div className="flex gap-2">
                          <button onClick={() => void decideApproval(approval, 'reject')} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700"><X className="h-3.5 w-3.5" /> Reject</button>
                          <button onClick={() => void decideApproval(approval, 'approve')} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"><ShieldCheck className="h-3.5 w-3.5" /> Approve</button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
