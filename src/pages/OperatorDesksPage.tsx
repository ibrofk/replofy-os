import React, { useMemo, useState } from 'react';
import { Archive, Bot, ClipboardList, Eye, EyeOff, Plus, RotateCcw, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Drawer } from '../components/ui/Drawer';
import { useUser } from '../contexts/UserContext';
import { useOperatorDesk } from '../hooks/useOperatorDesk';
import { claimWorkOrder, createOperatorDesk, ensureOperatorDeskTemplates, updateOperatorDeskStatus } from '../services/operatorDeskService';
import { OperatorApprovalMode, OperatorCheckFrequency, OperatorDesk, OperatorDeskType, OperatorOutputType } from '../types';
import { desiredResultOptions, frequencyLabels, getDeskName, labelOutputType, labelStatus } from '../utils/operatorDisplayLabels';
import { OPERATOR_DESK_TEMPLATE_SLUGS } from '../utils/operatorDeskTemplates';
import { Empty, Page } from './CommandCenterPage';

const starterDeskSlugs = new Set(OPERATOR_DESK_TEMPLATE_SLUGS);

type DeskDraft = {
  name: string;
  slug: string;
  type: OperatorDeskType;
  mission: string;
  defaultCheckFrequency: OperatorCheckFrequency;
  approvalMode: OperatorApprovalMode;
  allowedOutputTypes: OperatorOutputType[];
};

const defaultDeskDraft = (): DeskDraft => ({
  name: '',
  slug: '',
  type: 'ops',
  mission: '',
  defaultCheckFrequency: 'manual',
  approvalMode: 'action_based',
  allowedOutputTypes: ['execution_task', 'memory_suggestion'],
});

function deskStatus(desk: OperatorDesk, pendingApprovals: number) {
  if (desk.status === 'archived') return 'Archived';
  if (desk.status === 'paused') return 'Paused';
  if (pendingApprovals > 0) return 'Needs attention';
  return 'Active';
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function OperatorDesksPage() {
  const { userProfile } = useUser();
  const { desks, workOrders, outputs, approvals } = useOperatorDesk();
  const navigate = useNavigate();
  const [showArchived, setShowArchived] = useState(false);
  const [deskDraft, setDeskDraft] = useState<DeskDraft | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; description: string; label: string; danger?: boolean; action: () => Promise<void> | void } | null>(null);

  const visibleDesks = useMemo(() => {
    const starterOrder = new Map(OPERATOR_DESK_TEMPLATE_SLUGS.map((slug, index) => [slug, index]));
    return [...desks]
      .filter((desk) => showArchived || desk.status !== 'archived')
      .sort((a, b) => {
        const aStarter = starterOrder.get(a.slug);
        const bStarter = starterOrder.get(b.slug);
        if (aStarter !== undefined || bStarter !== undefined) return (aStarter ?? 1000) - (bStarter ?? 1000);
        return getDeskName(a).localeCompare(getDeskName(b));
      });
  }, [desks, showArchived]);

  const archivedCount = desks.filter((desk) => desk.status === 'archived').length;

  const prepare = async () => {
    if (!userProfile) return;
    try {
      await ensureOperatorDeskTemplates(userProfile);
      setMessage('Starter desks are prepared.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to prepare starter desks.');
    }
  };

  const claimFirst = async (desk: OperatorDesk) => {
    if (!userProfile || desk.status === 'archived') return;
    const ready = workOrders.find((item) => item.operatorDeskId === desk.id && item.status === 'ready');
    if (ready) await claimWorkOrder(userProfile, ready, 'manual-internal-review');
  };

  const saveDesk = async () => {
    if (!userProfile || !deskDraft) return;
    try {
      await createOperatorDesk(userProfile, {
        ...deskDraft,
        slug: deskDraft.slug || slugify(deskDraft.name),
        allowedSources: ['context-sources', 'operator-memories', 'tasks', 'bugs', 'roadmap-items', 'team-chat-messages'],
      });
      setDeskDraft(null);
      setMessage('Operator Desk created.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create Operator Desk.');
    }
  };

  const confirmStatus = (desk: OperatorDesk, status: OperatorDesk['status']) => {
    const isArchive = status === 'archived';
    setConfirm({
      title: isArchive ? 'Archive desk?' : 'Restore desk?',
      description: isArchive
        ? 'This keeps history but blocks new operator runs and hides the desk by default.'
        : 'This returns the desk to active use and makes it available to operators again.',
      label: isArchive ? 'Archive' : 'Restore',
      danger: isArchive,
      action: async () => {
        if (userProfile) await updateOperatorDeskStatus(userProfile, desk, status);
      },
    });
  };

  return (
    <Page title="Operator Desks" subtitle="Operator workspaces for launching work, reviewing outputs, approving changes, and managing context.">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-sm font-black text-zinc-900">Desk management</p>
          <p className="mt-1 text-xs text-zinc-500">{message || 'Create custom desks, prepare starters, or restore archived operator workspaces.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setDeskDraft(defaultDeskDraft())} className="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-4 py-2 text-xs font-bold text-white">
            <Plus className="h-3.5 w-3.5" /> New Desk
          </button>
          <button onClick={() => void prepare()} className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-bold text-zinc-700">Prepare starters</button>
          <button onClick={() => setShowArchived((value) => !value)} className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-4 py-2 text-xs font-bold text-zinc-700">
            {showArchived ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showArchived ? 'Hide archived' : `Archived ${archivedCount}`}
          </button>
        </div>
      </div>

      {visibleDesks.length === 0 ? <Empty>No operator desks yet.</Empty> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleDesks.map((desk) => {
            const deskWorkOrders = workOrders.filter((item) => item.operatorDeskId === desk.id);
            const ready = deskWorkOrders.filter((item) => item.status === 'ready');
            const active = deskWorkOrders.filter((item) => item.status === 'claimed' || item.status === 'in_progress');
            const pendingApprovals = approvals.filter((item) => item.operatorDeskId === desk.id && (item.status === 'pending' || item.status === 'edited'));
            const lastOutput = outputs.filter((item) => item.operatorDeskId === desk.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
            const status = deskStatus(desk, pendingApprovals.length);
            const isArchived = desk.status === 'archived';
            const isStarter = starterDeskSlugs.has(desk.slug);
            return (
              <section key={desk.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${isArchived ? 'border-zinc-200 opacity-75' : 'border-zinc-200'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-950 text-white"><Bot className="h-5 w-5" /></div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-zinc-500">{status}</span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">{isStarter ? 'Starter' : 'Custom'}</span>
                  </div>
                </div>
                <h2 className="mt-4 text-base font-black">{getDeskName(desk)}</h2>
                <p className="mt-1 min-h-16 text-sm leading-5 text-zinc-500">{desk.mission}</p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <Stat value={ready.length} label="Ready" />
                  <Stat value={active.length} label="Active" />
                  <Stat value={pendingApprovals.length} label="Approvals" />
                </div>
                <div className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">Last output</p>
                  <p className="mt-1 line-clamp-2 text-sm font-semibold text-zinc-700">{lastOutput ? `${lastOutput.title} - ${labelStatus(lastOutput.status)}` : 'No completed outputs yet.'}</p>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button onClick={() => navigate(`/operator-desks/${desk.id}`)} className="flex-1 rounded-full border border-zinc-200 px-3 py-2 text-xs font-bold">Open Desk</button>
                  <button disabled={ready.length === 0 || isArchived} onClick={() => void claimFirst(desk)} className="inline-flex items-center gap-1 rounded-full bg-zinc-950 px-3 py-2 text-xs font-bold text-white disabled:bg-zinc-200 disabled:text-zinc-400">
                    <ClipboardList className="h-3 w-3" /> Start
                  </button>
                  {isArchived ? (
                    <button title="Restore desk" onClick={() => confirmStatus(desk, 'active')} className="rounded-full border border-zinc-200 px-3 py-2 text-zinc-600 hover:text-zinc-950">
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button title="Archive desk" onClick={() => confirmStatus(desk, 'archived')} className="rounded-full border border-zinc-200 px-3 py-2 text-zinc-500 hover:border-red-200 hover:text-red-600">
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500">
        <ShieldCheck className="mr-2 inline h-4 w-4" /> Operators submit work for review. Risky changes stay gated until approved.
      </div>

      <DeskDrawer draft={deskDraft} onChange={setDeskDraft} onClose={() => setDeskDraft(null)} onSave={() => void saveDesk()} />
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

function DeskDrawer({ draft, onChange, onClose, onSave }: { draft: DeskDraft | null; onChange: (draft: DeskDraft | null) => void; onClose: () => void; onSave: () => void }) {
  if (!draft) return null;
  const update = (patch: Partial<DeskDraft>) => onChange({ ...draft, ...patch });
  const toggleOutputType = (outputType: OperatorOutputType) => {
    update({
      allowedOutputTypes: draft.allowedOutputTypes.includes(outputType)
        ? draft.allowedOutputTypes.filter((item) => item !== outputType)
        : [...draft.allowedOutputTypes, outputType],
    });
  };
  return (
    <Drawer open title="New Operator Desk" description="Create a workspace operators can read, run, and submit for approval." onClose={onClose} footer={<DrawerActions onCancel={onClose} onSave={onSave} />}>
      <div className="space-y-4">
        <Field label="Desk name"><input value={draft.name} onChange={(event) => update({ name: event.target.value, slug: draft.slug || slugify(event.target.value) })} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400" /></Field>
        <Field label="Slug"><input value={draft.slug} onChange={(event) => update({ slug: slugify(event.target.value) })} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400" /></Field>
        <Field label="Mission"><textarea value={draft.mission} onChange={(event) => update({ mission: event.target.value })} className="min-h-28 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400" /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Type"><select value={draft.type} onChange={(event) => update({ type: event.target.value as OperatorDeskType })} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm">
            {['ops', 'content', 'creative', 'bug', 'feature', 'research', 'growth', 'feedback'].map((type) => <option key={type} value={type}>{type}</option>)}
          </select></Field>
          <Field label="Schedule"><select value={draft.defaultCheckFrequency} onChange={(event) => update({ defaultCheckFrequency: event.target.value as OperatorCheckFrequency })} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm">
            {Object.entries(frequencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></Field>
          <Field label="Automation mode"><select value={draft.approvalMode} onChange={(event) => update({ approvalMode: event.target.value as OperatorApprovalMode })} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm">
            <option value="action_based">Autonomous internal work</option>
            <option value="draft_only">Draft only</option>
          </select></Field>
        </div>
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

function Stat({ value, label }: { value: number; label: string }) {
  return <div className="rounded-xl border border-zinc-100 px-3 py-2"><p className="text-lg font-black text-zinc-950">{value}</p><p className="text-[11px] font-bold text-zinc-400">{label}</p></div>;
}
