import React, { useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import {
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  Edit2,
  Link2,
  Mail,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  UserRound,
  X,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { db, auth } from '../firebase';
import { useGlobalState } from '../contexts/GlobalStateContext';
import { useUser } from '../contexts/UserContext';
import { Account, AccountStatus, Lead, LeadPriority, LeadSource, LeadStage } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { CustomSelect } from '../components/ui/CustomSelect';
import { MetricCard } from '../components/ui/MetricCard';
import { SearchInput } from '../components/ui/SearchInput';
import { StudioHeader } from '../components/ui/StudioHeader';

const LEAD_STAGES: Array<{ id: LeadStage; label: string; description: string }> = [
  { id: 'new', label: 'New', description: 'Fresh prospects to inspect.' },
  { id: 'qualified', label: 'Qualified', description: 'Good fit, needs outreach.' },
  { id: 'contacted', label: 'Contacted', description: 'Conversation started.' },
  { id: 'demo-booked', label: 'Demo Booked', description: 'Meeting is scheduled.' },
  { id: 'proposal', label: 'Proposal', description: 'Offer or terms sent.' },
  { id: 'won', label: 'Won', description: 'Converted.' },
  { id: 'lost', label: 'Lost', description: 'Closed out.' },
];

const LEAD_SOURCES: Array<{ value: LeadSource; label: string }> = [
  { value: 'inbound', label: 'Inbound' },
  { value: 'referral', label: 'Referral' },
  { value: 'cold-outreach', label: 'Cold outreach' },
  { value: 'waitlist', label: 'Waitlist' },
  { value: 'twitter', label: 'Twitter' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'email', label: 'Email' },
  { value: 'other', label: 'Other' },
];

const LEAD_PRIORITIES: Array<{ value: LeadPriority; label: string }> = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const ACCOUNT_STATUSES: Array<{ value: AccountStatus; label: string }> = [
  { value: 'prospect', label: 'Prospect' },
  { value: 'customer', label: 'Customer' },
  { value: 'partner', label: 'Partner' },
  { value: 'inactive', label: 'Inactive' },
];

type LeadFormState = {
  name: string;
  email: string;
  companyName: string;
  accountId: string;
  source: LeadSource;
  stage: LeadStage;
  priority: LeadPriority;
  ownerId: string;
  nextAction: string;
  nextActionAt: string;
  notes: string;
  linkedTaskIds: string;
};

type AccountFormState = {
  name: string;
  website: string;
  industry: string;
  size: string;
  notes: string;
  status: AccountStatus;
};

const EMPTY_LEAD_FORM: LeadFormState = {
  name: '',
  email: '',
  companyName: '',
  accountId: '',
  source: 'inbound',
  stage: 'new',
  priority: 'medium',
  ownerId: '',
  nextAction: '',
  nextActionAt: '',
  notes: '',
  linkedTaskIds: '',
};

const EMPTY_ACCOUNT_FORM: AccountFormState = {
  name: '',
  website: '',
  industry: '',
  size: '',
  notes: '',
  status: 'prospect',
};

function formatStageLabel(stage: LeadStage) {
  return LEAD_STAGES.find((item) => item.id === stage)?.label ?? stage;
}

function formatDateTime(value?: string | null) {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function parseLinkedIds(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function isFollowUpDue(lead: Lead) {
  if (!lead.nextActionAt || lead.stage === 'won' || lead.stage === 'lost') return false;
  return new Date(lead.nextActionAt).getTime() <= Date.now();
}

function normalizeSearch(value: string) {
  return value.toLowerCase().trim();
}

export function GrowthPipelinePage() {
  const { accounts, leads, tasks, teamMembers } = useGlobalState();
  const { userProfile } = useUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<'all' | LeadStage>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | LeadPriority>('all');
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'unassigned' | string>('all');
  const [mobileView, setMobileView] = useState<'leads' | 'accounts'>('leads');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'lead' | 'account' | null>(null);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [leadForm, setLeadForm] = useState<LeadFormState>(EMPTY_LEAD_FORM);
  const [accountForm, setAccountForm] = useState<AccountFormState>(EMPTY_ACCOUNT_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const suppressUrlSelectionRef = useRef(false);

  const ownerOptions = useMemo(() => {
    const members = teamMembers.length > 0 ? teamMembers : userProfile ? [userProfile] : [];
    return members.map((member) => ({
      value: member.id,
      label: member.displayName || member.email,
    }));
  }, [teamMembers, userProfile]);

  const accountOptions = useMemo(
    () => accounts.map((account) => ({ value: account.id, label: account.name })),
    [accounts],
  );

  const filteredLeads = useMemo(() => {
    const q = normalizeSearch(search);
    return leads.filter((lead) => {
      if (stageFilter !== 'all' && lead.stage !== stageFilter) return false;
      if (priorityFilter !== 'all' && lead.priority !== priorityFilter) return false;
      if (ownerFilter === 'unassigned' && lead.ownerId) return false;
      if (ownerFilter !== 'all' && ownerFilter !== 'unassigned' && lead.ownerId !== ownerFilter) return false;
      if (!q) return true;
      const account = lead.accountId ? accounts.find((item) => item.id === lead.accountId) : null;
      const haystack = [
        lead.name,
        lead.email,
        lead.companyName,
        lead.nextAction,
        lead.notes,
        account?.name,
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [accounts, leads, ownerFilter, priorityFilter, search, stageFilter]);

  const sortedAccounts = useMemo(
    () => [...accounts].sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()),
    [accounts],
  );

  const openLeads = leads.filter((lead) => lead.stage !== 'won' && lead.stage !== 'lost');
  const demosBooked = leads.filter((lead) => lead.stage === 'demo-booked').length;
  const proposals = leads.filter((lead) => lead.stage === 'proposal').length;
  const won = leads.filter((lead) => lead.stage === 'won').length;
  const followUpsDue = leads.filter(isFollowUpDue).length;
  const activeFilterCount = [stageFilter, priorityFilter, ownerFilter].filter((value) => value !== 'all').length;

  const closeDrawer = () => {
    suppressUrlSelectionRef.current = true;
    setDrawerMode(null);
    setEditingLeadId(null);
    setEditingAccountId(null);
    setLeadForm(EMPTY_LEAD_FORM);
    setAccountForm(EMPTY_ACCOUNT_FORM);
    const next = new URLSearchParams(searchParams);
    next.delete('leadId');
    next.delete('accountId');
    setSearchParams(next, { replace: true });
  };

  const openNewLead = (stage: LeadStage = 'new') => {
    suppressUrlSelectionRef.current = false;
    setLeadForm({ ...EMPTY_LEAD_FORM, stage });
    setEditingLeadId(null);
    setEditingAccountId(null);
    setDrawerMode('lead');
  };

  const openEditLead = (lead: Lead) => {
    suppressUrlSelectionRef.current = false;
    setLeadForm({
      name: lead.name,
      email: lead.email,
      companyName: lead.companyName,
      accountId: lead.accountId ?? '',
      source: lead.source,
      stage: lead.stage,
      priority: lead.priority,
      ownerId: lead.ownerId ?? '',
      nextAction: lead.nextAction,
      nextActionAt: toDateTimeLocal(lead.nextActionAt),
      notes: lead.notes,
      linkedTaskIds: (lead.linkedTaskIds || []).join(', '),
    });
    setEditingLeadId(lead.id);
    setEditingAccountId(null);
    setDrawerMode('lead');
    setSearchParams({ leadId: lead.id }, { replace: true });
  };

  const openNewAccount = () => {
    suppressUrlSelectionRef.current = false;
    setAccountForm(EMPTY_ACCOUNT_FORM);
    setEditingAccountId(null);
    setEditingLeadId(null);
    setDrawerMode('account');
  };

  const openEditAccount = (account: Account) => {
    suppressUrlSelectionRef.current = false;
    setAccountForm({
      name: account.name,
      website: account.website,
      industry: account.industry,
      size: account.size,
      notes: account.notes,
      status: account.status,
    });
    setEditingAccountId(account.id);
    setEditingLeadId(null);
    setDrawerMode('account');
    setSearchParams({ accountId: account.id }, { replace: true });
  };

  useEffect(() => {
    const leadId = searchParams.get('leadId');
    const accountId = searchParams.get('accountId');
    if (!leadId && !accountId) {
      suppressUrlSelectionRef.current = false;
      return;
    }
    if (suppressUrlSelectionRef.current || drawerMode) return;
    if (leadId) {
      const lead = leads.find((item) => item.id === leadId);
      if (lead) openEditLead(lead);
      return;
    }
    if (accountId) {
      const account = accounts.find((item) => item.id === accountId);
      if (account) openEditAccount(account);
    }
  }, [accounts, drawerMode, leads, searchParams]);

  const handleLeadSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!auth.currentUser || !leadForm.name.trim()) return;
    setIsSaving(true);

    const existing = editingLeadId ? leads.find((lead) => lead.id === editingLeadId) : null;
    const linkedAccount = leadForm.accountId ? accounts.find((account) => account.id === leadForm.accountId) : null;
    const nextActionAt = leadForm.nextActionAt ? new Date(leadForm.nextActionAt).toISOString() : null;
    const payload = {
      name: leadForm.name.trim(),
      email: leadForm.email.trim(),
      companyName: linkedAccount?.name || leadForm.companyName.trim(),
      accountId: leadForm.accountId || null,
      source: leadForm.source,
      stage: leadForm.stage,
      priority: leadForm.priority,
      ownerId: leadForm.ownerId || null,
      nextAction: leadForm.nextAction.trim(),
      nextActionAt,
      notes: leadForm.notes.trim(),
      linkedTaskIds: parseLinkedIds(leadForm.linkedTaskIds),
      updatedAt: new Date().toISOString(),
    };

    try {
      if (editingLeadId) {
        await updateDoc(doc(db, 'leads', editingLeadId), payload);
        if (existing?.accountId && existing.accountId !== payload.accountId) {
          await updateDoc(doc(db, 'accounts', existing.accountId), {
            linkedLeadIds: arrayRemove(editingLeadId),
            updatedAt: new Date().toISOString(),
          });
        }
        if (payload.accountId && existing?.accountId !== payload.accountId) {
          await updateDoc(doc(db, 'accounts', payload.accountId), {
            linkedLeadIds: arrayUnion(editingLeadId),
            updatedAt: new Date().toISOString(),
          });
        }
      } else {
        const created = await addDoc(collection(db, 'leads'), {
          ...payload,
          createdAt: new Date().toISOString(),
          authorId: auth.currentUser.uid,
          companyId: userProfile?.companyId ?? null,
        });
        if (payload.accountId) {
          await updateDoc(doc(db, 'accounts', payload.accountId), {
            linkedLeadIds: arrayUnion(created.id),
            updatedAt: new Date().toISOString(),
          });
        }
      }
      closeDrawer();
    } catch (error) {
      handleFirestoreError(error, editingLeadId ? OperationType.UPDATE : OperationType.CREATE, editingLeadId ? `leads/${editingLeadId}` : 'leads');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAccountSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!auth.currentUser || !accountForm.name.trim()) return;
    setIsSaving(true);

    const payload = {
      name: accountForm.name.trim(),
      website: accountForm.website.trim(),
      industry: accountForm.industry.trim(),
      size: accountForm.size.trim(),
      notes: accountForm.notes.trim(),
      status: accountForm.status,
      updatedAt: new Date().toISOString(),
    };

    try {
      if (editingAccountId) {
        await updateDoc(doc(db, 'accounts', editingAccountId), payload);
      } else {
        await addDoc(collection(db, 'accounts'), {
          ...payload,
          linkedLeadIds: [],
          createdAt: new Date().toISOString(),
          authorId: auth.currentUser.uid,
          companyId: userProfile?.companyId ?? null,
        });
      }
      closeDrawer();
    } catch (error) {
      handleFirestoreError(error, editingAccountId ? OperationType.UPDATE : OperationType.CREATE, editingAccountId ? `accounts/${editingAccountId}` : 'accounts');
    } finally {
      setIsSaving(false);
    }
  };

  const updateLeadStage = async (lead: Lead, stage: LeadStage) => {
    try {
      await updateDoc(doc(db, 'leads', lead.id), {
        stage,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leads/${lead.id}`);
    }
  };

  const deleteLead = async () => {
    if (!editingLeadId) return;
    const lead = leads.find((item) => item.id === editingLeadId);
    if (!lead || !window.confirm('Delete this lead?')) return;
    try {
      await deleteDoc(doc(db, 'leads', lead.id));
      if (lead.accountId) {
        await updateDoc(doc(db, 'accounts', lead.accountId), {
          linkedLeadIds: arrayRemove(lead.id),
          updatedAt: new Date().toISOString(),
        });
      }
      closeDrawer();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `leads/${lead.id}`);
    }
  };

  const deleteAccount = async () => {
    if (!editingAccountId) return;
    const account = accounts.find((item) => item.id === editingAccountId);
    if (!account || !window.confirm('Delete this account? Linked leads will stay in the pipeline without an account link.')) return;
    try {
      const linkedLeads = leads.filter((lead) => lead.accountId === account.id);
      await Promise.all(
        linkedLeads.map((lead) =>
          updateDoc(doc(db, 'leads', lead.id), {
            accountId: null,
            updatedAt: new Date().toISOString(),
          }),
        ),
      );
      await deleteDoc(doc(db, 'accounts', account.id));
      closeDrawer();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `accounts/${account.id}`);
    }
  };

  const getOwnerLabel = (ownerId?: string | null) => {
    if (!ownerId) return 'Unassigned';
    return ownerOptions.find((owner) => owner.value === ownerId)?.label ?? 'Unknown owner';
  };

  const getAccountName = (lead: Lead) => {
    if (lead.accountId) {
      return accounts.find((account) => account.id === lead.accountId)?.name || lead.companyName || 'No account';
    }
    return lead.companyName || 'No account';
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-zinc-50">
      <div className="hidden md:block">
        <StudioHeader
          badge="Growth Pipeline"
          badgeIcon={<TrendingUp className="h-3.5 w-3.5" />}
          title="Manage prospects, accounts, and founder sales motion."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openNewAccount}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-100"
              >
                <Building2 className="h-4 w-4" />
                Account
              </button>
              <button
                type="button"
                onClick={() => openNewLead()}
                className="inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-3 py-2 text-xs font-bold text-white hover:bg-zinc-800"
              >
                <Plus className="h-4 w-4" />
                Lead
              </button>
            </div>
          }
        />
      </div>

      <div className="border-b border-zinc-200 bg-white px-4 py-3 md:hidden">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
          <TrendingUp className="h-3.5 w-3.5" />
          Growth Pipeline
        </div>
        <h1 className="mt-1.5 max-w-sm text-xl font-black leading-tight tracking-tight text-zinc-950">
          Manage prospects, accounts, and founder sales motion
        </h1>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => openNewLead()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-950 px-3 py-2 text-xs font-bold text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            Lead
          </button>
            <button
              type="button"
              onClick={openNewAccount}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700"
            >
            <Building2 className="h-3.5 w-3.5" />
              Account
            </button>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto p-3 md:p-6 lg:p-8">
        <div className="mx-auto max-w-[1800px] space-y-6">
          <section className="hidden gap-3 md:grid sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard label="Open leads" value={openLeads.length} icon={<UserRound className="h-4 w-4" />} />
            <MetricCard label="Demos" value={demosBooked} icon={<CalendarClock className="h-4 w-4" />} />
            <MetricCard label="Proposals" value={proposals} icon={<ArrowRight className="h-4 w-4" />} />
            <MetricCard label="Won" value={won} icon={<CheckCircle2 className="h-4 w-4" />} />
            <MetricCard label="Due" value={followUpsDue} icon={<Mail className="h-4 w-4" />} />
          </section>

          <section className="hidden rounded-xl border border-zinc-200 bg-white p-4 shadow-sm md:block">
            <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_220px]">
              <SearchInput value={search} onChange={setSearch} placeholder="Search leads, accounts, notes..." />
              <CustomSelect
                value={stageFilter}
                onChange={(value) => setStageFilter(value as 'all' | LeadStage)}
                options={[{ value: 'all', label: 'All stages' }, ...LEAD_STAGES.map((stage) => ({ value: stage.id, label: stage.label }))]}
                triggerClassName="rounded-lg px-3 py-2 text-xs"
              />
              <CustomSelect
                value={priorityFilter}
                onChange={(value) => setPriorityFilter(value as 'all' | LeadPriority)}
                options={[{ value: 'all', label: 'All priorities' }, ...LEAD_PRIORITIES]}
                triggerClassName="rounded-lg px-3 py-2 text-xs"
              />
              <CustomSelect
                value={ownerFilter}
                onChange={(value) => setOwnerFilter(value)}
                options={[
                  { value: 'all', label: 'All owners' },
                  { value: 'unassigned', label: 'Unassigned' },
                  ...ownerOptions,
                ]}
                triggerClassName="rounded-lg px-3 py-2 text-xs"
              />
            </div>
          </section>

          <section className="hidden gap-6 md:grid xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="overflow-x-auto pb-2">
              <div className="grid min-w-[1540px] grid-cols-7 gap-4">
                {LEAD_STAGES.map((stage) => {
                  const stageLeads = filteredLeads.filter((lead) => lead.stage === stage.id);
                  return (
                    <div key={stage.id} className="rounded-xl border border-zinc-200 bg-white shadow-sm">
                      <div className="border-b border-zinc-100 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h2 className="text-sm font-black text-zinc-950">{stage.label}</h2>
                            <p className="mt-1 text-xs text-zinc-500">{stage.description}</p>
                          </div>
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-500">{stageLeads.length}</span>
                        </div>
                      </div>
                      <div className="space-y-2 p-3">
                        <button
                          type="button"
                          onClick={() => openNewLead(stage.id)}
                          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-200 px-3 py-2 text-xs font-bold text-zinc-500 hover:border-zinc-300 hover:text-zinc-900"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add
                        </button>
                        {stageLeads.length === 0 ? (
                          <div className="rounded-lg bg-zinc-50 px-3 py-8 text-center text-xs text-zinc-400">No leads</div>
                        ) : (
                          stageLeads.map((lead) => (
                            <article key={lead.id} className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
                              <button type="button" onClick={() => openEditLead(lead)} className="block w-full text-left">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <h3 className="truncate text-sm font-bold text-zinc-950">{lead.name}</h3>
                                    <p className="mt-1 truncate text-xs text-zinc-500">{getAccountName(lead)}</p>
                                  </div>
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] ${
                                    lead.priority === 'high' ? 'bg-zinc-950 text-white' :
                                    lead.priority === 'medium' ? 'bg-zinc-100 text-zinc-700' :
                                    'bg-zinc-50 text-zinc-500'
                                  }`}>
                                    {lead.priority}
                                  </span>
                                </div>
                                <div className="mt-3 space-y-1.5 text-xs text-zinc-500">
                                  <div className="flex items-center gap-1.5">
                                    <UserRound className="h-3.5 w-3.5" />
                                    <span className="truncate">{getOwnerLabel(lead.ownerId)}</span>
                                  </div>
                                  {lead.email && (
                                    <div className="flex items-center gap-1.5">
                                      <Mail className="h-3.5 w-3.5" />
                                      <span className="truncate">{lead.email}</span>
                                    </div>
                                  )}
                                  {lead.nextAction && (
                                    <div className={`rounded-md px-2 py-1 ${isFollowUpDue(lead) ? 'bg-zinc-950 text-white' : 'bg-zinc-50 text-zinc-500'}`}>
                                      <span className="line-clamp-2">{lead.nextAction}</span>
                                      <span className="mt-0.5 block text-[10px] opacity-70">{formatDateTime(lead.nextActionAt)}</span>
                                    </div>
                                  )}
                                </div>
                              </button>
                              <div className="mt-3">
                                <CustomSelect
                                  value={lead.stage}
                                  onChange={(value) => updateLeadStage(lead, value as LeadStage)}
                                  options={LEAD_STAGES.map((item) => ({ value: item.id, label: item.label }))}
                                  triggerClassName="rounded-lg px-3 py-2 text-xs"
                                />
                              </div>
                            </article>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <aside className="rounded-xl border border-zinc-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-zinc-100 p-4">
                <div>
                  <h2 className="text-sm font-black text-zinc-950">Accounts</h2>
                  <p className="mt-1 text-xs text-zinc-500">{accounts.length} companies tracked</p>
                </div>
                <button type="button" onClick={openNewAccount} className="rounded-lg border border-zinc-200 p-2 text-zinc-500 hover:text-zinc-900">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-[700px] space-y-2 overflow-y-auto p-3">
                {sortedAccounts.length === 0 ? (
                  <div className="rounded-lg bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">No accounts yet.</div>
                ) : (
                  sortedAccounts.map((account) => {
                    const linkedCount = leads.filter((lead) => lead.accountId === account.id).length || account.linkedLeadIds?.length || 0;
                    return (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => openEditAccount(account)}
                        className="w-full rounded-lg border border-zinc-200 bg-white p-3 text-left hover:bg-zinc-50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-bold text-zinc-950">{account.name}</h3>
                            <p className="mt-1 truncate text-xs text-zinc-500">{account.website || account.industry || 'No profile details'}</p>
                          </div>
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
                            {account.status}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                          <span>{linkedCount} lead{linkedCount === 1 ? '' : 's'}</span>
                          <Edit2 className="h-3.5 w-3.5" />
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>
          </section>

          <div className="space-y-4 md:hidden">
            <section className="grid grid-cols-3 gap-2">
              <MobileMetric label="Open leads" value={openLeads.length} icon={<UserRound className="h-3.5 w-3.5" />} />
              <MobileMetric label="Demos" value={demosBooked} icon={<CalendarClock className="h-3.5 w-3.5" />} />
              <MobileMetric label="Proposals" value={proposals} icon={<ArrowRight className="h-3.5 w-3.5" />} />
              <MobileMetric label="Won" value={won} icon={<CheckCircle2 className="h-3.5 w-3.5" />} />
              <MobileMetric label="Due" value={followUpsDue} icon={<Mail className="h-3.5 w-3.5" />} />
              <MobileMetric label="Accounts" value={accounts.length} icon={<Building2 className="h-3.5 w-3.5" />} />
            </section>

            <section className="space-y-2">
              <SearchInput value={search} onChange={setSearch} placeholder="Search leads, accounts, notes..." />
              <button
                type="button"
                onClick={() => setShowMobileFilters((current) => !current)}
                className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700"
              >
                <span className="inline-flex items-center gap-2">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Filters
                  {activeFilterCount > 0 && <span className="rounded-full bg-zinc-950 px-1.5 py-0.5 text-[10px] text-white">{activeFilterCount}</span>}
                </span>
                <span className="text-zinc-400">{showMobileFilters ? 'Hide' : 'Show'}</span>
              </button>
              {showMobileFilters && (
                <div className="grid gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
                  <CustomSelect value={stageFilter} onChange={(value) => setStageFilter(value as 'all' | LeadStage)} options={[{ value: 'all', label: 'All stages' }, ...LEAD_STAGES.map((stage) => ({ value: stage.id, label: stage.label }))]} triggerClassName="rounded-lg px-3 py-2 text-xs" />
                  <CustomSelect value={priorityFilter} onChange={(value) => setPriorityFilter(value as 'all' | LeadPriority)} options={[{ value: 'all', label: 'All priorities' }, ...LEAD_PRIORITIES]} triggerClassName="rounded-lg px-3 py-2 text-xs" />
                  <CustomSelect value={ownerFilter} onChange={setOwnerFilter} options={[{ value: 'all', label: 'All owners' }, { value: 'unassigned', label: 'Unassigned' }, ...ownerOptions]} triggerClassName="rounded-lg px-3 py-2 text-xs" />
                </div>
              )}
            </section>

            <div className="grid grid-cols-2 rounded-xl bg-zinc-100 p-1">
              {(['leads', 'accounts'] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setMobileView(view)}
                  className={`rounded-lg px-3 py-2 text-xs font-bold capitalize transition ${mobileView === view ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500'}`}
                >
                  {view}
                </button>
              ))}
            </div>

            {mobileView === 'leads' ? (
              <section className="space-y-3">
                <div className="-mx-3 overflow-x-auto px-3 pb-1">
                  <div className="flex w-max gap-2">
                    {[{ id: 'all' as const, label: 'All' }, ...LEAD_STAGES].map((stage) => {
                      const count = stage.id === 'all' ? filteredLeads.length : leads.filter((lead) => lead.stage === stage.id).length;
                      return (
                        <button
                          key={stage.id}
                          type="button"
                          onClick={() => setStageFilter(stage.id)}
                          className={`rounded-full border px-3 py-2 text-xs font-bold transition ${stageFilter === stage.id ? 'border-zinc-950 bg-zinc-950 text-white' : 'border-zinc-200 bg-white text-zinc-600'}`}
                        >
                          {stage.label} <span className="ml-1 opacity-60">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-3">
                    <div>
                      <h2 className="text-sm font-black text-zinc-950">{stageFilter === 'all' ? 'All leads' : formatStageLabel(stageFilter)}</h2>
                      <p className="mt-0.5 text-xs text-zinc-500">{stageFilter === 'all' ? 'Browse the active pipeline.' : LEAD_STAGES.find((stage) => stage.id === stageFilter)?.description}</p>
                    </div>
                    <button type="button" onClick={() => openNewLead(stageFilter === 'all' ? 'new' : stageFilter)} className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-2 text-xs font-bold text-zinc-700">
                      <Plus className="h-3.5 w-3.5" /> Add
                    </button>
                  </div>
                  <div className="space-y-2 p-2.5">
                    {filteredLeads.length === 0 ? (
                      <div className="px-3 py-5 text-center">
                        <p className="text-sm font-bold text-zinc-800">No leads yet</p>
                        <p className="mt-1 text-xs text-zinc-500">Add a prospect when the next conversation appears.</p>
                      </div>
                    ) : filteredLeads.map((lead) => (
                      <MobileLeadCard key={lead.id} lead={lead} accountName={getAccountName(lead)} ownerLabel={getOwnerLabel(lead.ownerId)} onOpen={() => openEditLead(lead)} />
                    ))}
                  </div>
                </div>
              </section>
            ) : (
              <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-3">
                  <div>
                    <h2 className="text-sm font-black text-zinc-950">Accounts</h2>
                    <p className="mt-0.5 text-xs text-zinc-500">{accounts.length} companies tracked</p>
                  </div>
                  <button type="button" onClick={openNewAccount} className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-2 text-xs font-bold text-zinc-700"><Plus className="h-3.5 w-3.5" /> Add</button>
                </div>
                <div className="space-y-2 p-2.5">
                  {sortedAccounts.length === 0 ? (
                    <div className="px-3 py-5 text-center">
                      <p className="text-sm font-bold text-zinc-800">No accounts yet</p>
                      <p className="mt-1 text-xs text-zinc-500">Create an account to group related leads.</p>
                    </div>
                  ) : sortedAccounts.map((account) => (
                    <MobileAccountCard key={account.id} account={account} linkedCount={leads.filter((lead) => lead.accountId === account.id).length || account.linkedLeadIds?.length || 0} onOpen={() => openEditAccount(account)} />
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </main>

      {drawerMode && (
        <div className="fixed inset-0 z-50 flex justify-end bg-zinc-950/30 backdrop-blur-sm" onMouseDown={closeDrawer}>
          <div
            className="flex h-full w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-zinc-200 px-5 py-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-500">
                  {drawerMode === 'lead' ? <UserRound className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
                  {drawerMode === 'lead' ? 'Lead' : 'Account'}
                </div>
                <h2 className="mt-2 text-xl font-black text-zinc-950">
                  {drawerMode === 'lead'
                    ? editingLeadId ? 'Edit lead' : 'Create lead'
                    : editingAccountId ? 'Edit account' : 'Create account'}
                </h2>
              </div>
              <button type="button" onClick={closeDrawer} className="rounded-lg border border-zinc-200 p-2 text-zinc-500 hover:text-zinc-900">
                <X className="h-4 w-4" />
              </button>
            </div>

            {drawerMode === 'lead' ? (
              <form onSubmit={handleLeadSubmit} className="flex flex-1 flex-col overflow-hidden">
                <div className="flex-1 space-y-5 overflow-y-auto p-5">
                  <Field label="Name">
                    <input value={leadForm.name} onChange={(event) => setLeadForm({ ...leadForm, name: event.target.value })} className="field-input" placeholder="Jane Founder" />
                  </Field>
                  <Field label="Email">
                    <input value={leadForm.email} onChange={(event) => setLeadForm({ ...leadForm, email: event.target.value })} className="field-input" placeholder="jane@company.com" />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Account">
                      <CustomSelect
                        value={leadForm.accountId}
                        onChange={(value) => setLeadForm({ ...leadForm, accountId: value })}
                        options={[{ value: '', label: 'No account' }, ...accountOptions]}
                        triggerClassName="rounded-lg px-3 py-2"
                      />
                    </Field>
                    <Field label="Company name">
                      <input value={leadForm.companyName} onChange={(event) => setLeadForm({ ...leadForm, companyName: event.target.value })} className="field-input" placeholder="Company" />
                    </Field>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Stage">
                      <CustomSelect value={leadForm.stage} onChange={(value) => setLeadForm({ ...leadForm, stage: value as LeadStage })} options={LEAD_STAGES.map((stage) => ({ value: stage.id, label: stage.label }))} triggerClassName="rounded-lg px-3 py-2" />
                    </Field>
                    <Field label="Priority">
                      <CustomSelect value={leadForm.priority} onChange={(value) => setLeadForm({ ...leadForm, priority: value as LeadPriority })} options={LEAD_PRIORITIES} triggerClassName="rounded-lg px-3 py-2" />
                    </Field>
                    <Field label="Source">
                      <CustomSelect value={leadForm.source} onChange={(value) => setLeadForm({ ...leadForm, source: value as LeadSource })} options={LEAD_SOURCES} triggerClassName="rounded-lg px-3 py-2" />
                    </Field>
                  </div>
                  <Field label="Owner">
                    <CustomSelect
                      value={leadForm.ownerId}
                      onChange={(value) => setLeadForm({ ...leadForm, ownerId: value })}
                      options={[{ value: '', label: 'Unassigned' }, ...ownerOptions]}
                      triggerClassName="rounded-lg px-3 py-2"
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                    <Field label="Next action">
                      <input value={leadForm.nextAction} onChange={(event) => setLeadForm({ ...leadForm, nextAction: event.target.value })} className="field-input" placeholder="Send follow-up email" />
                    </Field>
                    <Field label="Due">
                      <input type="datetime-local" value={leadForm.nextActionAt} onChange={(event) => setLeadForm({ ...leadForm, nextActionAt: event.target.value })} className="field-input" />
                    </Field>
                  </div>
                  <Field label="Linked task IDs">
                    <textarea value={leadForm.linkedTaskIds} onChange={(event) => setLeadForm({ ...leadForm, linkedTaskIds: event.target.value })} className="field-textarea min-h-20" placeholder="Paste task IDs separated by commas or new lines" />
                    {tasks.length > 0 && (
                      <div className="mt-2 rounded-lg bg-zinc-50 p-2 text-xs text-zinc-500">
                        <div className="mb-1 flex items-center gap-1 font-bold text-zinc-600"><Link2 className="h-3.5 w-3.5" /> Recent task IDs</div>
                        <div className="space-y-1">
                          {tasks.slice(0, 4).map((task) => (
                            <button
                              key={task.id}
                              type="button"
                              onClick={() => setLeadForm((prev) => ({ ...prev, linkedTaskIds: parseLinkedIds(`${prev.linkedTaskIds},${task.id}`).join(', ') }))}
                              className="block w-full truncate rounded-md px-2 py-1 text-left hover:bg-white"
                            >
                              {task.title} <span className="font-mono text-zinc-400">{task.id}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </Field>
                  <Field label="Notes">
                    <textarea value={leadForm.notes} onChange={(event) => setLeadForm({ ...leadForm, notes: event.target.value })} className="field-textarea min-h-32" placeholder="Discovery notes, objections, buying trigger..." />
                  </Field>
                </div>
                <DrawerFooter
                  isSaving={isSaving}
                  onDelete={editingLeadId ? deleteLead : undefined}
                  submitLabel={editingLeadId ? 'Update lead' : 'Create lead'}
                />
              </form>
            ) : (
              <form onSubmit={handleAccountSubmit} className="flex flex-1 flex-col overflow-hidden">
                <div className="flex-1 space-y-5 overflow-y-auto p-5">
                  <Field label="Name">
                    <input value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} className="field-input" placeholder="Acme Inc." />
                  </Field>
                  <Field label="Website">
                    <input value={accountForm.website} onChange={(event) => setAccountForm({ ...accountForm, website: event.target.value })} className="field-input" placeholder="https://acme.com" />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Industry">
                      <input value={accountForm.industry} onChange={(event) => setAccountForm({ ...accountForm, industry: event.target.value })} className="field-input" placeholder="SaaS" />
                    </Field>
                    <Field label="Size">
                      <input value={accountForm.size} onChange={(event) => setAccountForm({ ...accountForm, size: event.target.value })} className="field-input" placeholder="11-50" />
                    </Field>
                    <Field label="Status">
                      <CustomSelect value={accountForm.status} onChange={(value) => setAccountForm({ ...accountForm, status: value as AccountStatus })} options={ACCOUNT_STATUSES} triggerClassName="rounded-lg px-3 py-2" />
                    </Field>
                  </div>
                  <Field label="Notes">
                    <textarea value={accountForm.notes} onChange={(event) => setAccountForm({ ...accountForm, notes: event.target.value })} className="field-textarea min-h-40" placeholder="Account context, use case, relationship notes..." />
                  </Field>
                  {editingAccountId && (
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Linked leads</div>
                      <div className="mt-2 space-y-2">
                        {leads.filter((lead) => lead.accountId === editingAccountId).length === 0 ? (
                          <p className="text-sm text-zinc-500">No linked leads.</p>
                        ) : (
                          leads.filter((lead) => lead.accountId === editingAccountId).map((lead) => (
                            <button key={lead.id} type="button" onClick={() => openEditLead(lead)} className="flex w-full items-center justify-between rounded-md bg-white px-3 py-2 text-left text-sm hover:bg-zinc-100">
                              <span className="truncate font-semibold text-zinc-800">{lead.name}</span>
                              <span className="text-xs text-zinc-500">{formatStageLabel(lead.stage)}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <DrawerFooter
                  isSaving={isSaving}
                  onDelete={editingAccountId ? deleteAccount : undefined}
                  submitLabel={editingAccountId ? 'Update account' : 'Create account'}
                />
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">{label}</span>
      {children}
    </div>
  );
}

function MobileMetric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between text-zinc-400">{icon}<span className="text-lg font-black text-zinc-950">{value}</span></div>
      <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
    </div>
  );
}

function MobileLeadCard({ lead, accountName, ownerLabel, onOpen }: { key?: React.Key; lead: Lead; accountName: string; ownerLabel: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-lg border border-zinc-200 bg-white p-3 text-left transition active:bg-zinc-50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><h3 className="truncate text-sm font-bold text-zinc-950">{lead.name}</h3><p className="mt-0.5 truncate text-xs text-zinc-500">{accountName}</p></div>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600">{lead.priority}</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-zinc-500">
        <span className="truncate">{ownerLabel}</span>
        <span className="shrink-0 font-semibold">{formatStageLabel(lead.stage)}</span>
      </div>
      {lead.nextAction && <p className={`mt-2 truncate rounded-md px-2 py-1.5 text-xs ${isFollowUpDue(lead) ? 'bg-zinc-950 text-white' : 'bg-zinc-50 text-zinc-600'}`}>{lead.nextAction}</p>}
    </button>
  );
}

function MobileAccountCard({ account, linkedCount, onOpen }: { key?: React.Key; account: Account; linkedCount: number; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-lg border border-zinc-200 bg-white p-3 text-left transition active:bg-zinc-50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><h3 className="truncate text-sm font-bold text-zinc-950">{account.name}</h3><p className="mt-0.5 truncate text-xs text-zinc-500">{account.website || account.industry || 'No profile details'}</p></div>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600">{account.status}</span>
      </div>
      <p className="mt-2 text-xs text-zinc-500">{linkedCount} lead{linkedCount === 1 ? '' : 's'}</p>
    </button>
  );
}

function DrawerFooter({
  isSaving,
  onDelete,
  submitLabel,
}: {
  isSaving: boolean;
  onDelete?: () => void;
  submitLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50 px-5 py-4">
      <div>
        {onDelete && (
          <button type="button" onClick={onDelete} className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-600 hover:text-red-600">
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        )}
      </div>
      <button type="submit" disabled={isSaving} className="rounded-lg bg-zinc-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50">
        {isSaving ? 'Saving...' : submitLabel}
      </button>
    </div>
  );
}
