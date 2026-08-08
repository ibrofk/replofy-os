import { useEffect, useMemo, useState } from 'react';
import { Building2, Plus, Trash2, UserRound } from 'lucide-react';
import type { Account, AccountStatus, Lead, LeadPriority, LeadSource, LeadStage } from '../types';
import { standaloneClient } from '../services/standaloneClient';

const stages: LeadStage[] = ['new', 'qualified', 'contacted', 'demo-booked', 'proposal', 'won', 'lost'];
const sources: LeadSource[] = ['inbound', 'referral', 'cold-outreach', 'waitlist', 'twitter', 'linkedin', 'email', 'other'];
const priorities: LeadPriority[] = ['low', 'medium', 'high'];
const accountStatuses: AccountStatus[] = ['prospect', 'customer', 'partner', 'inactive'];
const fieldClass = 'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm';

const blankAccount = {
  name: '', website: '', industry: '', size: '', notes: '', status: 'prospect' as AccountStatus,
};
const blankLead = {
  name: '',
  email: '',
  companyName: '',
  accountId: '',
  source: 'inbound' as LeadSource,
  stage: 'new' as LeadStage,
  priority: 'medium' as LeadPriority,
  nextAction: '',
  nextActionAt: '',
  notes: '',
};

export function StandaloneGrowthPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [accountDraft, setAccountDraft] = useState(blankAccount);
  const [leadDraft, setLeadDraft] = useState(blankLead);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const [nextAccounts, nextLeads] = await Promise.all([
      standaloneClient.listAccounts(),
      standaloneClient.listLeads(),
    ]);
    setAccounts(nextAccounts.data);
    setLeads(nextLeads.data);
  };

  useEffect(() => {
    void load().catch((value) => setError(value instanceof Error ? value.message : 'Growth Pipeline failed to load.'));
  }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Growth operation failed.');
    } finally {
      setBusy(false);
    }
  };

  const openLeadCount = leads.filter((lead) => !['won', 'lost'].includes(lead.stage)).length;
  const dueCount = leads.filter((lead) =>
    lead.nextActionAt && !['won', 'lost'].includes(lead.stage) && new Date(lead.nextActionAt) <= new Date()).length;
  const leadsByStage = useMemo(
    () => new Map(stages.map((stage) => [stage, leads.filter((lead) => lead.stage === stage)])),
    [leads],
  );

  const editAccount = (item: Account) => {
    setEditingAccountId(item.id);
    setAccountDraft({
      name: item.name,
      website: item.website,
      industry: item.industry,
      size: item.size,
      notes: item.notes,
      status: item.status,
    });
  };

  const editLead = (item: Lead) => {
    setEditingLeadId(item.id);
    setLeadDraft({
      name: item.name,
      email: item.email,
      companyName: item.companyName,
      accountId: item.accountId || '',
      source: item.source,
      stage: item.stage,
      priority: item.priority,
      nextAction: item.nextAction,
      nextActionAt: item.nextActionAt ? item.nextActionAt.slice(0, 16) : '',
      notes: item.notes,
    });
  };

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-zinc-50 p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-950">Growth Pipeline</h1>
            <p className="mt-1 text-sm text-zinc-500">Workspace-isolated accounts, leads, ownership, and follow-ups.</p>
          </div>
          <div className="flex gap-3">
            <Metric label="Accounts" value={accounts.length} />
            <Metric label="Open leads" value={openLeadCount} />
            <Metric label="Follow-ups due" value={dueCount} />
          </div>
        </div>
        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
          <div className="space-y-5">
            <form
              className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  if (editingAccountId) await standaloneClient.updateAccount(editingAccountId, accountDraft);
                  else await standaloneClient.createAccount(accountDraft);
                  setEditingAccountId(null);
                  setAccountDraft(blankAccount);
                });
              }}
            >
              <div className="flex items-center gap-2 font-semibold"><Building2 className="h-4 w-4" /> {editingAccountId ? 'Edit account' : 'New account'}</div>
              <input required placeholder="Account name" value={accountDraft.name} onChange={(e) => setAccountDraft({ ...accountDraft, name: e.target.value })} className={fieldClass} />
              <input placeholder="Website" value={accountDraft.website} onChange={(e) => setAccountDraft({ ...accountDraft, website: e.target.value })} className={fieldClass} />
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Industry" value={accountDraft.industry} onChange={(e) => setAccountDraft({ ...accountDraft, industry: e.target.value })} className={fieldClass} />
                <input placeholder="Size" value={accountDraft.size} onChange={(e) => setAccountDraft({ ...accountDraft, size: e.target.value })} className={fieldClass} />
              </div>
              <select value={accountDraft.status} onChange={(e) => setAccountDraft({ ...accountDraft, status: e.target.value as AccountStatus })} className={fieldClass}>
                {accountStatuses.map((status) => <option key={status}>{status}</option>)}
              </select>
              <textarea placeholder="Notes" value={accountDraft.notes} onChange={(e) => setAccountDraft({ ...accountDraft, notes: e.target.value })} className={`${fieldClass} min-h-20`} />
              <div className="flex gap-2">
                <button disabled={busy || !accountDraft.name.trim()} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"><Plus className="h-4 w-4" /> Save</button>
                {editingAccountId && <button type="button" onClick={() => {
                  setEditingAccountId(null);
                  setAccountDraft(blankAccount);
                }} className="rounded-lg border border-zinc-200 px-3 text-sm">Cancel</button>}
              </div>
            </form>

            <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
              <h2 className="font-semibold">Accounts</h2>
              {accounts.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg border border-zinc-200 p-3">
                  <button onClick={() => editAccount(item)} className="min-w-0 text-left">
                    <div className="truncate text-sm font-semibold">{item.name}</div>
                    <div className="text-xs text-zinc-500">{item.status} · {item.linkedLeadIds.length} leads</div>
                  </button>
                  <button aria-label="Delete account" onClick={() => void run(async () => {
                    await standaloneClient.deleteAccount(item.id);
                    if (editingAccountId === item.id) {
                      setEditingAccountId(null);
                      setAccountDraft(blankAccount);
                    }
                  })} className="rounded p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <form
              className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 md:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  const payload = {
                    ...leadDraft,
                    accountId: leadDraft.accountId || null,
                    nextActionAt: leadDraft.nextActionAt ? new Date(leadDraft.nextActionAt).toISOString() : null,
                  };
                  if (editingLeadId) await standaloneClient.updateLead(editingLeadId, payload);
                  else await standaloneClient.createLead(payload);
                  setEditingLeadId(null);
                  setLeadDraft(blankLead);
                });
              }}
            >
              <div className="flex items-center gap-2 font-semibold md:col-span-2"><UserRound className="h-4 w-4" /> {editingLeadId ? 'Edit lead' : 'New lead'}</div>
              <input required placeholder="Lead name" value={leadDraft.name} onChange={(e) => setLeadDraft({ ...leadDraft, name: e.target.value })} className={fieldClass} />
              <input type="email" placeholder="Email" value={leadDraft.email} onChange={(e) => setLeadDraft({ ...leadDraft, email: e.target.value })} className={fieldClass} />
              <select value={leadDraft.accountId} onChange={(e) => setLeadDraft({ ...leadDraft, accountId: e.target.value })} className={fieldClass}>
                <option value="">No account</option>
                {accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <input placeholder="Company name" value={leadDraft.companyName} onChange={(e) => setLeadDraft({ ...leadDraft, companyName: e.target.value })} className={fieldClass} />
              <div className="grid grid-cols-3 gap-2 md:col-span-2">
                <select value={leadDraft.source} onChange={(e) => setLeadDraft({ ...leadDraft, source: e.target.value as LeadSource })} className={fieldClass}>{sources.map((value) => <option key={value}>{value}</option>)}</select>
                <select value={leadDraft.stage} onChange={(e) => setLeadDraft({ ...leadDraft, stage: e.target.value as LeadStage })} className={fieldClass}>{stages.map((value) => <option key={value}>{value}</option>)}</select>
                <select value={leadDraft.priority} onChange={(e) => setLeadDraft({ ...leadDraft, priority: e.target.value as LeadPriority })} className={fieldClass}>{priorities.map((value) => <option key={value}>{value}</option>)}</select>
              </div>
              <input placeholder="Next action" value={leadDraft.nextAction} onChange={(e) => setLeadDraft({ ...leadDraft, nextAction: e.target.value })} className={fieldClass} />
              <input type="datetime-local" value={leadDraft.nextActionAt} onChange={(e) => setLeadDraft({ ...leadDraft, nextActionAt: e.target.value })} className={fieldClass} />
              <textarea placeholder="Notes" value={leadDraft.notes} onChange={(e) => setLeadDraft({ ...leadDraft, notes: e.target.value })} className={`${fieldClass} min-h-20 md:col-span-2`} />
              <div className="flex gap-2 md:col-span-2">
                <button disabled={busy || !leadDraft.name.trim()} className="flex-1 rounded-lg bg-zinc-950 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Save lead</button>
                {editingLeadId && <button type="button" onClick={() => {
                  setEditingLeadId(null);
                  setLeadDraft(blankLead);
                }} className="rounded-lg border border-zinc-200 px-3 text-sm">Cancel</button>}
              </div>
            </form>

            <div className="grid min-w-[900px] grid-cols-7 gap-2 overflow-x-auto">
              {stages.map((stage) => (
                <div key={stage} className="rounded-xl border border-zinc-200 bg-white p-3">
                  <div className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-zinc-500">
                    <span>{stage}</span><span>{leadsByStage.get(stage)?.length || 0}</span>
                  </div>
                  <div className="space-y-2">
                    {leadsByStage.get(stage)?.map((item) => (
                      <button key={item.id} onClick={() => editLead(item)} className="w-full rounded-lg border border-zinc-200 p-2 text-left hover:border-zinc-400">
                        <div className="truncate text-xs font-semibold">{item.name}</div>
                        <div className="mt-1 truncate text-[11px] text-zinc-500">{accounts.find((account) => account.id === item.accountId)?.name || item.companyName || 'No account'}</div>
                        <div className="mt-2 text-[10px] font-bold uppercase text-zinc-400">{item.priority}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {editingLeadId && <button onClick={() => void run(async () => {
              await standaloneClient.deleteLead(editingLeadId);
              setEditingLeadId(null);
              setLeadDraft(blankLead);
            })} className="inline-flex items-center gap-2 text-sm font-semibold text-red-600"><Trash2 className="h-4 w-4" /> Delete selected lead</button>}
          </div>
        </div>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-zinc-200 bg-white px-4 py-2"><div className="text-lg font-semibold">{value}</div><div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div></div>;
}
