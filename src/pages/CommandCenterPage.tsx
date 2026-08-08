import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, ClipboardList, Clock3, ShieldAlert, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { useOperatorDesk } from '../hooks/useOperatorDesk';
import { ensureOperatorDeskTemplates } from '../services/operatorDeskService';
import {
  approvalPlainText,
  getDeskName,
  labelOutputType,
  labelStatus,
  priorityLabels,
  riskCopy,
  riskLabels,
} from '../utils/operatorDisplayLabels';

export function CommandCenterPage() {
  const { userProfile } = useUser();
  const { desks, workOrders, outputs, approvals, memories } = useOperatorDesk();
  const navigate = useNavigate();
  const [message, setMessage] = useState('Your operators are ready. Review approvals, check active work, or start a new work order.');

  useEffect(() => {
    if (!userProfile) return;
    void ensureOperatorDeskTemplates(userProfile)
      .then(() => setMessage('Your operators are ready. Review approvals, check active work, or start a new work order.'))
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Unable to prepare Operator Desks.'));
  }, [userProfile]);

  const pending = approvals.filter((item) => item.status === 'pending' || item.status === 'edited');
  const readyWorkOrders = workOrders.filter((item) => item.status === 'ready');
  const activeWorkOrders = workOrders.filter((item) => item.status === 'claimed' || item.status === 'in_progress');
  const completedOutputs = useMemo(() => outputs
    .filter((item) => ['submitted', 'approved', 'injected', 'pending_approval'].includes(item.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6), [outputs]);
  const riskOutputs = outputs.filter((output) => output.outputType === 'risk_note' && output.status !== 'archived');
  const failedWork = workOrders.filter((item) => ['needs_review', 'rejected'].includes(item.status));
  const memorySuggestions = memories.filter((memory) => memory.state === 'suggested');

  const deskById = new Map(desks.map((desk) => [desk.id, desk]));

  return (
    <Page title="Command Center" subtitle="See what Replofy OS is working on, what needs your approval, and what was completed recently.">
      <div className="rounded-2xl border border-zinc-200 bg-zinc-950 px-5 py-4 text-white">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">Today in Replofy OS</p>
        <div className="mt-2 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-xl font-black">Today in Replofy OS</h2>
            <p className="mt-1 text-sm text-white/65">{message}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => navigate('/operator-desks')} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-zinc-950">
              Open Operator Desks <ArrowRight className="h-4 w-4" />
            </button>
            {pending.length > 0 && (
              <button onClick={() => navigate('/approval-inbox')} className="inline-flex items-center gap-2 rounded-full border border-white/25 px-4 py-2 text-sm font-bold text-white">
                Review Approvals
              </button>
            )}
            <button onClick={() => navigate('/operator-desks')} className="inline-flex items-center gap-2 rounded-full border border-white/25 px-4 py-2 text-sm font-bold text-white">
              Start Work Order
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric icon={<ShieldAlert />} label="Needs Approval" value={pending.length} onClick={() => navigate('/approval-inbox')} />
        <Metric icon={<Clock3 />} label="Active Work" value={activeWorkOrders.length} onClick={() => navigate('/operator-desks')} />
        <Metric icon={<ClipboardList />} label="Ready Work Orders" value={readyWorkOrders.length} onClick={() => navigate('/operator-desks')} />
        <Metric icon={<CheckCircle2 />} label="Completed Outputs" value={completedOutputs.length} onClick={() => navigate('/operator-desks')} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Needs Your Approval" subtitle="Review operator proposals before they change shared workspace records." action={pending.length ? 'Open Inbox' : undefined} onAction={() => navigate('/approval-inbox')}>
          {pending.length === 0 ? <Empty>No approvals need your review.</Empty> : pending.slice(0, 6).map((item) => {
            const deskName = getDeskName(deskById.get(item.operatorDeskId));
            return <Row key={item.id} title={approvalPlainText(item, deskName)} detail={`${riskLabels[item.riskLevel]} - ${riskCopy(item.riskLevel)}`} onClick={() => navigate('/approval-inbox')} />;
          })}
        </Panel>
        <Panel title="Active Work" subtitle="Work currently being handled by operators.">
          {activeWorkOrders.length === 0 ? <Empty>No active work right now.</Empty> : activeWorkOrders.slice(0, 6).map((item) => <Row key={item.id} title={item.title} detail={`${labelStatus(item.status)} - Started recently`} onClick={() => navigate(`/work-orders/${item.id}`)} />)}
        </Panel>
        <Panel title="Ready To Start" subtitle="Work orders available for the next operator pass.">
          {readyWorkOrders.length === 0 ? <Empty>No work orders are ready to start.</Empty> : readyWorkOrders.slice(0, 6).map((item) => <Row key={item.id} title={item.title} detail={`${priorityLabels[item.priority]} priority - ${item.expectedOutputTypes.map(labelOutputType).join(', ')}`} onClick={() => navigate(`/work-orders/${item.id}`)} actionLabel="Open" />)}
        </Panel>
        <Panel title="Recent Completed Work" subtitle="Recent operator outputs and summaries.">
          {completedOutputs.length === 0 ? <Empty>No completed outputs yet.</Empty> : completedOutputs.map((item) => <Row key={item.id} title={item.title} detail={`${getDeskName(deskById.get(item.operatorDeskId))} - ${item.summary || labelOutputType(item.outputType)}`} onClick={() => navigate(`/operator-outputs/${item.id}`)} actionLabel="View output" />)}
        </Panel>
        <Panel title="Issues Needing Attention" subtitle="Risks, blockers, failed work, or rejected work.">
          {riskOutputs.length === 0 && failedWork.length === 0 ? <Empty>No issues need attention.</Empty> : (
            <>
              {riskOutputs.slice(0, 4).map((output) => <Row key={output.id} title={output.title} detail={output.summary} onClick={() => navigate(`/operator-outputs/${output.id}`)} />)}
              {failedWork.slice(0, 4).map((workOrder) => <Row key={workOrder.id} title={workOrder.title} detail={labelStatus(workOrder.status)} onClick={() => navigate(`/work-orders/${workOrder.id}`)} />)}
            </>
          )}
        </Panel>
        <Panel title="Memory Suggestions" subtitle="Operator context updates waiting for review.">
          {memorySuggestions.length === 0 ? <Empty>No memory suggestions waiting.</Empty> : memorySuggestions.slice(0, 6).map((memory) => <Row key={memory.id} title={memory.content} detail="Suggested operator memory" />)}
        </Panel>
      </div>
    </Page>
  );
}

export function Page({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <div className="mx-auto max-w-[1440px] space-y-5 px-4 py-5 md:px-7"><div><h1 className="text-2xl font-black tracking-tight text-zinc-950">{title}</h1><p className="mt-1 max-w-4xl text-sm leading-6 text-zinc-500">{subtitle}</p></div>{children}</div>;
}

function Metric({ icon, label, value, onClick }: { icon: React.ReactNode; label: string; value: number; onClick: () => void }) {
  return <button onClick={onClick} className="rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-zinc-400"><div className="h-5 w-5 text-zinc-400">{icon}</div><p className="mt-5 text-2xl font-black">{value}</p><p className="mt-1 text-xs font-bold text-zinc-500">{label}</p></button>;
}

export function Panel({ title, subtitle, action, onAction, children }: { title: string; subtitle: string; action?: string; onAction?: () => void; children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"><div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3"><div><h2 className="text-sm font-black">{title}</h2><p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p></div>{action && <button onClick={onAction} className="shrink-0 text-xs font-bold text-zinc-700">{action}</button>}</div><div className="divide-y divide-zinc-100">{children}</div></section>;
}

export function Row({ title, detail, onClick, actionLabel }: { key?: React.Key; title: string; detail: string; onClick?: () => unknown; actionLabel?: string }) {
  return <button disabled={!onClick} onClick={onClick} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left enabled:hover:bg-zinc-50"><div className="min-w-0"><p className="truncate text-sm font-bold text-zinc-900">{title}</p><p className="mt-0.5 truncate text-xs text-zinc-500">{detail}</p></div>{onClick && <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-zinc-500">{actionLabel || 'Open'} <ArrowRight className="h-4 w-4 text-zinc-300" /></span>}</button>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-7 text-center text-sm text-zinc-400">{children}</div>;
}
