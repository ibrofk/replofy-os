import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  Waypoints,
  XCircle,
} from 'lucide-react';
import { StudioHeader } from '../components/ui/StudioHeader';
import { AIModelPicker } from '../components/ai/AIModelPicker';
import { AIAttachmentPicker } from '../components/ai/AIAttachmentPicker';
import { AIContextModePicker, AIContextStatsSummary, contextModeDetails } from '../components/ai/AIContextModePicker';
import {
  StandaloneApiError,
  standaloneClient,
  type AIContextAttachment,
  type AIContextMode,
  type AIContextStats,
  type AIProviderId,
  type AIProviderModel,
  type AISettingsResponse,
} from '../services/standaloneClient';

type AIStatus = Awaited<ReturnType<typeof standaloneClient.getAIStatus>>;
type AIProposal = Record<string, unknown> & { actions?: Array<Record<string, unknown>> };
type AIMemory = Record<string, unknown> & { id: string; content: string };
type AIRevision = Record<string, unknown> & { id: string; operation?: string; reason?: string };
type SettingsTab = 'connections' | 'models' | 'memory' | 'advanced';

const PROVIDERS: Array<{ value: AIProviderId; label: string; description: string }> = [
  { value: 'openai', label: 'OpenAI API', description: 'GPT models through an OpenAI API key.' },
  { value: 'gemini', label: 'Gemini', description: 'Google Gemini models through a Gemini API key.' },
  { value: 'anthropic', label: 'Claude', description: 'Anthropic models through an Anthropic API key.' },
];

function textValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function providerLabel(provider: AIProviderId | null | undefined) {
  return PROVIDERS.find((item) => item.value === provider)?.label || 'No provider';
}

function readSettingsTab(): SettingsTab {
  if (typeof window === 'undefined') return 'connections';
  const value = new URLSearchParams(window.location.search).get('tab') || window.location.hash.slice(1);
  return value === 'models' || value === 'memory' || value === 'advanced' ? value : 'connections';
}

function formatDate(value: unknown) {
  const raw = textValue(value);
  if (!raw) return 'Not tested yet';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleString();
}

function StatusPill({ status }: { status: AIStatus | null }) {
  if (status?.active) {
    return <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" /> Ready</span>;
  }
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800"><AlertTriangle className="h-3.5 w-3.5" /> Setup required</span>;
}

function MemoryPanel({
  memories,
  status,
  history,
  expandedMemory,
  busy,
  onToggleHistory,
  onUndo,
}: {
  memories: AIMemory[];
  status: AIStatus | null;
  history: Record<string, AIRevision[]>;
  expandedMemory: string | null;
  busy: boolean;
  onToggleHistory: (memoryId: string) => void;
  onUndo: (memoryId: string, revisionId: string) => void;
}) {
  if (!status?.active) {
    return <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">Memory is intentionally unavailable until this workspace has both a provider key and a selected model. Existing memories are preserved.</div>;
  }

  return (
    <div className="space-y-3">
      {memories.map((memory) => (
        <div key={memory.id} className="rounded-xl border border-zinc-200 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-bold uppercase text-zinc-600">{textValue(memory.memoryType, 'fact')}</span>{Boolean(memory.pinned) && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase text-amber-800">pinned</span>}</div>
              <p className="mt-2 text-sm leading-6 text-zinc-800">{memory.content}</p>
            </div>
            <button type="button" onClick={() => onToggleHistory(memory.id)} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900" aria-label="Toggle memory history">{expandedMemory === memory.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
          </div>
          {expandedMemory === memory.id && <div className="mt-3 border-t border-zinc-100 pt-3">{(history[memory.id] ?? []).map((revision) => <div key={revision.id} className="flex items-center justify-between gap-3 py-2 text-xs"><div><p className="font-semibold text-zinc-700">{textValue(revision.operation)} · {formatDate(revision.createdAt)}</p><p className="mt-0.5 text-zinc-500">{textValue(revision.reason, 'No reason recorded.')}</p></div><button type="button" disabled={busy} onClick={() => onUndo(memory.id, revision.id)} className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1.5 font-semibold text-zinc-600 disabled:opacity-50"><RotateCcw className="h-3 w-3" /> Undo</button></div>)}{history[memory.id]?.length === 0 && <p className="text-xs text-zinc-500">No revisions recorded.</p>}</div>}
        </div>
      ))}
      {memories.length === 0 && <p className="py-5 text-sm text-zinc-500">No workspace memories have been created yet.</p>}
    </div>
  );
}

function ProposalPanel({
  proposals,
  busy,
  onReview,
}: {
  proposals: AIProposal[];
  busy: boolean;
  onReview: (proposalId: string, actionId: string, operation: 'approve' | 'apply' | 'reject') => void;
}) {
  return (
    <div className="space-y-3">
      {proposals.map((proposal) => <div key={textValue(proposal.id)} className="rounded-xl border border-zinc-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-zinc-950">{textValue(proposal.title, 'AI proposal')}</p><p className="mt-1 text-xs text-zinc-500">{textValue(proposal.status, 'pending')} · {formatDate(proposal.createdAt)}</p></div><span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase text-amber-800">approval required</span></div><div className="mt-3 space-y-2">{(proposal.actions ?? []).map((action) => { const proposalId = textValue(proposal.id); const actionId = textValue(action.id); const actionStatus = textValue(action.status, 'pending'); return <div key={actionId} className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-zinc-800">{textValue(action.operation)} {textValue(action.resourceType)}</p><p className="mt-1 text-xs text-zinc-500">{textValue(action.rationale, 'No rationale recorded.')}</p></div><div className="flex shrink-0 gap-2">{actionStatus === 'pending' && <><button type="button" disabled={busy} onClick={() => onReview(proposalId, actionId, 'approve')} className="rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50">Approve</button><button type="button" disabled={busy} onClick={() => onReview(proposalId, actionId, 'reject')} className="rounded-lg border border-zinc-200 px-3 py-2 text-[11px] font-semibold text-zinc-600 disabled:opacity-50">Reject</button></>}{actionStatus === 'approved' && <button type="button" disabled={busy} onClick={() => onReview(proposalId, actionId, 'apply')} className="rounded-lg bg-zinc-950 px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50">Apply native change</button>}{actionStatus !== 'pending' && actionStatus !== 'approved' && <span className="rounded-lg bg-zinc-200 px-3 py-2 text-[11px] font-semibold text-zinc-600">{actionStatus}</span>}</div></div>; })}</div></div>)}
      {proposals.length === 0 && <p className="py-5 text-sm text-zinc-500">No proposals yet. Ask AI to operationalize a source or workspace request.</p>}
    </div>
  );
}

function SettingsView({
  settings,
  status,
  tab,
  provider,
  apiKey,
  label,
  modelProvider,
  model,
  models,
  modelLoading,
  modelsError,
  fallbackEnabled,
  agents,
  agentName,
  agentProvider,
  agentModel,
  agentModels,
  agentModelLoading,
  busy,
  memories,
  history,
  expandedMemory,
  onTabChange,
  onProviderChange,
  onApiKeyChange,
  onLabelChange,
  onSaveProviderKey,
  onRemoveProviderKey,
  onModelProviderChange,
  onModelChange,
  onDiscoverModels,
  onSaveModel,
  onTestModel,
  onFallbackChange,
  onSaveFallback,
  onAgentNameChange,
  onAgentProviderChange,
  onAgentModelChange,
  onDiscoverAgentModels,
  onCreateAgent,
  onToggleHistory,
  onUndo,
}: {
  settings: AISettingsResponse | null;
  status: AIStatus | null;
  tab: SettingsTab;
  provider: AIProviderId;
  apiKey: string;
  label: string;
  modelProvider: AIProviderId;
  model: string;
  models: AIProviderModel[];
  modelLoading: boolean;
  modelsError: string | null;
  fallbackEnabled: boolean;
  agents: Array<Record<string, unknown>>;
  agentName: string;
  agentProvider: AIProviderId;
  agentModel: string;
  agentModels: AIProviderModel[];
  agentModelLoading: boolean;
  busy: boolean;
  memories: AIMemory[];
  history: Record<string, AIRevision[]>;
  expandedMemory: string | null;
  onTabChange: (tab: SettingsTab) => void;
  onProviderChange: (provider: AIProviderId) => void;
  onApiKeyChange: (value: string) => void;
  onLabelChange: (value: string) => void;
  onSaveProviderKey: (event: React.FormEvent<HTMLFormElement>) => void;
  onRemoveProviderKey: () => void;
  onModelProviderChange: (provider: AIProviderId) => void;
  onModelChange: (value: string) => void;
  onDiscoverModels: () => void;
  onSaveModel: (event: React.FormEvent<HTMLFormElement>) => void;
  onTestModel: () => void;
  onFallbackChange: (value: boolean) => void;
  onSaveFallback: (event: React.FormEvent<HTMLFormElement>) => void;
  onAgentNameChange: (value: string) => void;
  onAgentProviderChange: (provider: AIProviderId) => void;
  onAgentModelChange: (value: string) => void;
  onDiscoverAgentModels: () => void;
  onCreateAgent: (event: React.FormEvent<HTMLFormElement>) => void;
  onToggleHistory: (memoryId: string) => void;
  onUndo: (memoryId: string, revisionId: string) => void;
}) {
  const credential = settings?.credentials.find((item) => item.provider === provider);
  const modelProviderCredential = settings?.credentials.some((item) => item.provider === modelProvider);
  const currentModelIsActive = Boolean(status?.active && status.provider === modelProvider && status.model === model);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm" role="tablist" aria-label="AI settings">
        <div className="grid gap-1 sm:grid-cols-4">
          {([['connections', 'Provider keys', 'Authorize providers'], ['models', 'Models', 'Discover and choose'], ['memory', 'Memory', 'Review autonomous memory'], ['advanced', 'Advanced', 'Agents and fallback']] as Array<[SettingsTab, string, string]>).map(([value, title, description]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => onTabChange(value)} className={`rounded-xl px-3 py-3 text-left transition ${tab === value ? 'bg-zinc-950 text-white shadow-sm' : 'text-zinc-600 hover:bg-zinc-50'}`}><span className="block text-xs font-semibold">{title}</span><span className={`mt-1 block text-[10px] ${tab === value ? 'text-zinc-300' : 'text-zinc-400'}`}>{description}</span></button>)}
        </div>
      </section>

      {tab === 'connections' && <section className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Provider keys</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-950">Connect a provider</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">Keys authorize Replofy to discover models and run AI for this workspace. Saving a key does not select a model or activate AI by itself.</p></div><div className="grid gap-3 sm:grid-cols-3">{PROVIDERS.map((item) => { const itemCredential = settings?.credentials.find((entry) => entry.provider === item.value); return <button type="button" key={item.value} onClick={() => onProviderChange(item.value)} className={`rounded-xl border p-4 text-left transition ${provider === item.value ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 hover:border-zinc-400'}`}><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-zinc-900">{item.label}</span>{itemCredential ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-zinc-300" />}</div><p className="mt-1 text-xs text-zinc-500">{itemCredential ? `Saved · ${itemCredential.label}` : 'Not connected'}</p></button>; })}</div><form onSubmit={onSaveProviderKey} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-zinc-900">{providerLabel(provider)} key</p><p className="mt-1 text-xs text-zinc-500">{credential ? `Saved ${formatDate(credential.createdAt)} · last tested ${formatDate(credential.lastTestedAt)}` : 'No key saved for this provider.'}</p></div><KeyRound className="h-5 w-5 text-zinc-400" /></div><label className="mt-4 block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">API key</span><input value={apiKey} onChange={(event) => onApiKeyChange(event.target.value)} type="password" autoComplete="new-password" disabled={busy} placeholder={credential ? 'Enter a new key to replace the saved key' : `Paste your ${providerLabel(provider)} API key`} className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-500 disabled:bg-zinc-100" /></label><div className="mt-3 flex flex-wrap gap-3"><label className="min-w-[220px] flex-1"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Key label</span><input value={label} onChange={(event) => onLabelChange(event.target.value)} disabled={busy} className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-500 disabled:bg-zinc-100" /></label><div className="flex items-end gap-2"><button type="submit" disabled={busy || !apiKey.trim()} className="inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"><Save className="h-3.5 w-3.5" /> Save key</button>{credential && <button type="button" onClick={onRemoveProviderKey} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2.5 text-xs font-semibold text-red-700 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /> Remove</button>}</div></div><p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Encrypted at rest and scoped to this workspace.</p></form></section>}

      {tab === 'models' && <section className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Model selection</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-950">Discover the models your key can use</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">This list comes directly from the selected provider. Search by model name, compare the provider’s descriptions, then save one workspace default.</p></div><div className="grid gap-4 lg:grid-cols-[0.75fr_1.25fr]"><label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Provider</span><select value={modelProvider} onChange={(event) => onModelProviderChange(event.target.value as AIProviderId)} disabled={busy} className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-500 disabled:bg-zinc-50">{PROVIDERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><span className="mt-1.5 block text-xs leading-5 text-zinc-500">{modelProviderCredential ? 'Key available for discovery.' : 'Connect this provider in the Provider keys tab first.'}</span></label><div><div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Searchable model list</span><button type="button" onClick={onDiscoverModels} disabled={busy || !modelProviderCredential || modelLoading} className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-950 disabled:opacity-40"><RefreshCw className={`h-3.5 w-3.5 ${modelLoading ? 'animate-spin' : ''}`} /> {modelLoading ? 'Discovering' : 'Refresh list'}</button></div><AIModelPicker models={models} value={model} onChange={onModelChange} loading={modelLoading} disabled={busy || !modelProviderCredential} onRefresh={onDiscoverModels} /></div></div>{modelsError && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{modelsError}</p>}{!modelProviderCredential && <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Model discovery needs a saved key for {providerLabel(modelProvider)}. The key and model are intentionally separate settings.</p>}<form onSubmit={onSaveModel} className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4"><button type="submit" disabled={busy || !model.trim()} className="inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"><Save className="h-3.5 w-3.5" /> Save workspace model</button><button type="button" onClick={onTestModel} disabled={busy || !currentModelIsActive} className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2.5 text-xs font-semibold text-zinc-700 disabled:opacity-40"><Sparkles className="h-3.5 w-3.5" /> Test selected model</button><span className="text-xs text-zinc-500">{status?.active ? `Active: ${providerLabel(status.provider)} · ${status.model}` : 'AI activates only after both key and model are saved.'}</span></form></section>}

      {tab === 'memory' && <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Autonomous workspace memory</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-950">What the context engine remembers</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">Memory changes are autonomous after activation, but every create, update, merge, expire, archive, and undo remains versioned here.</p></div><Waypoints className="h-5 w-5 text-zinc-400" /></div><div className="mt-5"><MemoryPanel memories={memories} status={status} history={history} expandedMemory={expandedMemory} busy={busy} onToggleHistory={onToggleHistory} onUndo={onUndo} /></div></section>}

      {tab === 'advanced' && <div className="space-y-5"><form onSubmit={onSaveFallback} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Fallback behavior</p><h2 className="mt-1 text-lg font-semibold text-zinc-950">Keep provider choice explicit</h2><p className="mt-2 text-sm leading-6 text-zinc-600">Fallback is off by default. Enable it only when you have deliberately configured more than one provider.</p></div><Settings2 className="h-5 w-5 text-zinc-400" /></div><label className="mt-4 flex items-start gap-2 text-sm text-zinc-700"><input type="checkbox" checked={fallbackEnabled} onChange={(event) => onFallbackChange(event.target.checked)} disabled={busy} className="mt-0.5 h-4 w-4 rounded border-zinc-300" /><span><span className="font-semibold">Allow explicit provider fallback</span><span className="mt-1 block text-xs leading-5 text-zinc-500">The workspace still needs a default key and model. This only controls the fallback behavior you opt into.</span></span></label><button type="submit" disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"><Save className="h-3.5 w-3.5" /> Save advanced settings</button></form><details className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><summary className="cursor-pointer list-none"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Agent profiles</p><p className="mt-1 text-sm text-zinc-600">Optional overrides for specialized agents. Most workspaces do not need this.</p></div><span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">{agents.length} profile{agents.length === 1 ? '' : 's'}</span></div></summary><div className="mt-5 border-t border-zinc-100 pt-5"><form onSubmit={onCreateAgent} className="grid gap-3 lg:grid-cols-[1fr_0.8fr_1.2fr_auto]"><input value={agentName} onChange={(event) => onAgentNameChange(event.target.value)} placeholder="Agent name" className="rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-zinc-500" /><select value={agentProvider} onChange={(event) => onAgentProviderChange(event.target.value as AIProviderId)} className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm">{PROVIDERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><AIModelPicker models={agentModels} value={agentModel} onChange={onAgentModelChange} loading={agentModelLoading} onRefresh={onDiscoverAgentModels} emptyLabel="Connect this provider to discover agent override models." /><button type="submit" disabled={busy || !agentName.trim()} className="rounded-xl bg-zinc-950 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40">Add agent</button></form><div className="mt-4 grid gap-2 sm:grid-cols-2">{agents.map((agent) => <div key={textValue(agent.id)} className="rounded-xl border border-zinc-200 p-3"><div className="flex items-center justify-between gap-2"><p className="font-semibold text-zinc-800">{textValue(agent.name)}</p><span className="text-[10px] font-bold uppercase text-zinc-500">{textValue(agent.status, 'active')}</span></div><p className="mt-1 text-xs text-zinc-500">{providerLabel(textValue(agent.provider) as AIProviderId)} · {textValue(agent.model, 'Workspace default')}</p></div>)}{agents.length === 0 && <p className="text-sm text-zinc-500">No agent profiles yet.</p>}</div></div></details></div>}
    </div>
  );
}

function WorkspaceView({
  settings,
  status,
  busy,
  chatPrompt,
  chatAttachments,
  chatAnswer,
  analysisTitle,
  analysisText,
  analysisAnswer,
  analysisAttachments,
  proposals,
  memories,
  runs,
  history,
  expandedMemory,
  contextMode,
  contextStats,
  onChatPromptChange,
  onChatAttachmentsChange,
  onContextModeChange,
  onSendChat,
  onAnalysisTitleChange,
  onAnalysisTextChange,
  onAnalysisAttachmentsChange,
  onAttachmentError,
  onAnalyze,
  onReview,
  onToggleHistory,
  onUndo,
}: {
  settings: AISettingsResponse | null;
  status: AIStatus | null;
  busy: boolean;
  chatPrompt: string;
  chatAttachments: AIContextAttachment[];
  chatAnswer: string;
  analysisTitle: string;
  analysisText: string;
  analysisAnswer: string;
  analysisAttachments: AIContextAttachment[];
  proposals: AIProposal[];
  memories: AIMemory[];
  runs: Array<Record<string, unknown>>;
  history: Record<string, AIRevision[]>;
  expandedMemory: string | null;
  contextMode: AIContextMode;
  contextStats: AIContextStats | null;
  onChatPromptChange: (value: string) => void;
  onChatAttachmentsChange: (value: AIContextAttachment[]) => void;
  onContextModeChange: (value: AIContextMode) => void;
  onSendChat: (event: React.FormEvent<HTMLFormElement>) => void;
  onAnalysisTitleChange: (value: string) => void;
  onAnalysisTextChange: (value: string) => void;
  onAnalysisAttachmentsChange: (value: AIContextAttachment[]) => void;
  onAttachmentError: (message: string) => void;
  onAnalyze: (event: React.FormEvent<HTMLFormElement>) => void;
  onReview: (proposalId: string, actionId: string, operation: 'approve' | 'apply' | 'reject') => void;
  onToggleHistory: (memoryId: string) => void;
  onUndo: (memoryId: string, revisionId: string) => void;
}) {
  const active = Boolean(status?.active);
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Context recipe</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-950">Choose the evidence budget before you ask</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">The recipe controls how much memory and linked workspace evidence the engine retrieves. It changes retrieval breadth, not permissions or approval rules.</p>
          </div>
          <div className="w-full max-w-xl md:min-w-[480px]"><AIContextModePicker value={contextMode} onChange={onContextModeChange} /><p className="mt-2 text-xs leading-5 text-zinc-500">{contextModeDetails[contextMode].description}</p><AIContextStatsSummary stats={contextStats} /></div>
        </div>
      </section>
      <section className={`rounded-2xl border p-5 shadow-sm ${active ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-200 bg-amber-50'}`}><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><div className={`mt-0.5 rounded-xl p-2 ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}><Sparkles className="h-5 w-5" /></div><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-zinc-950">{active ? 'AI is ready for this workspace' : 'Finish setup before using AI'}</p><StatusPill status={status} /></div><p className="mt-1 text-sm leading-6 text-zinc-700">{active ? `${providerLabel(status?.provider)} · ${status?.model}. Ask about anything in Replofy, analyze a source, or review the next actions.` : 'No provider calls, memory retrieval, memory writes, or background AI jobs run while this workspace is inactive.'}</p></div></div><a href={active ? '/settings?tab=models' : '/settings?tab=connections'} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 py-2.5 text-xs font-semibold text-white hover:bg-zinc-800">{active ? 'Change model' : 'Open AI settings'} <ExternalLink className="h-3.5 w-3.5" /></a></div></section>

      <section id="ai-workbench" className="scroll-mt-5">
        <div className="mb-3">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Workbench</p>
          <p className="mt-1 text-sm text-zinc-600">Bring a question or a source. AI connects it to the workspace context and returns proposals only when the evidence supports a domain change.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <form onSubmit={onSendChat} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-zinc-500" />
              <div>
                <p className="text-sm font-semibold text-zinc-950">Ask the workspace</p>
                <p className="mt-1 text-xs text-zinc-500">Chat with current context, sources, and autonomous memory.</p>
              </div>
            </div>
            {chatAnswer && <div className="mt-4 rounded-xl bg-zinc-100 p-4 text-sm leading-6 text-zinc-800">{chatAnswer}</div>}
            <AIAttachmentPicker attachments={chatAttachments} onChange={onChatAttachmentsChange} onError={onAttachmentError} disabled={!active || busy} />
            <div className="mt-4 flex gap-2">
              <textarea
                value={chatPrompt}
                onChange={(event) => onChatPromptChange(event.target.value)}
                rows={4}
                disabled={!active || busy}
                placeholder={active ? 'What should Replofy understand or operationalize? Or attach files.' : 'Open AI settings to connect a provider and model.'}
                className="min-h-24 flex-1 resize-y rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-zinc-500 disabled:bg-zinc-50"
              />
              <button type="submit" disabled={!active || busy || (!chatPrompt.trim() && chatAttachments.length === 0)} className="self-end rounded-xl bg-zinc-950 p-3 text-white disabled:opacity-40" aria-label="Send workspace question">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
          <form onSubmit={onAnalyze} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-zinc-500" />
              <div>
                <p className="text-sm font-semibold text-zinc-950">Operationalize a source</p>
                <p className="mt-1 text-xs text-zinc-500">Upload a plan, decision, brief, image, video, or document. Pasting text is optional.</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[150px_1fr]">
              <input value={analysisTitle} onChange={(event) => onAnalysisTitleChange(event.target.value)} className="rounded-xl border border-zinc-200 px-3 py-2.5 font-mono text-xs outline-none focus:border-zinc-500" />
              <textarea
                value={analysisText}
                onChange={(event) => onAnalysisTextChange(event.target.value)}
                rows={5}
                disabled={!active || busy}
                placeholder="Optional: paste Markdown, decisions, constraints, or a plan…"
                className="resize-y rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-zinc-500 disabled:bg-zinc-50"
              />
            </div>
            <AIAttachmentPicker attachments={analysisAttachments} onChange={onAnalysisAttachmentsChange} onError={onAttachmentError} disabled={!active || busy} />
            <button type="submit" disabled={!active || busy || (!analysisText.trim() && analysisAttachments.length === 0)} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Analyze and operationalize
            </button>
            {analysisAnswer && <div className="mt-4 rounded-xl bg-zinc-100 p-4 text-sm leading-6 text-zinc-800">{analysisAnswer}</div>}
          </form>
        </div>
      </section>

      {active && <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]"><section id="ai-proposals" className="scroll-mt-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Review queue</p><p className="mt-1 text-sm text-zinc-600">Goals, tasks, messages, content, and other domain changes wait here for approval.</p></div><span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">{proposals.length} proposal{proposals.length === 1 ? '' : 's'}</span></div><div className="mt-4"><ProposalPanel proposals={proposals} busy={busy} onReview={onReview} /></div></section><section id="ai-memory" className="scroll-mt-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Workspace memory</p><p className="mt-1 text-sm text-zinc-600">Autonomous, versioned, and undoable.</p></div><Waypoints className="h-5 w-5 text-zinc-400" /></div><div className="mt-4"><MemoryPanel memories={memories} status={status} history={history} expandedMemory={expandedMemory} busy={busy} onToggleHistory={onToggleHistory} onUndo={onUndo} /></div></section></div>}

      {active && <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-zinc-400" /><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Recent runs</p><p className="mt-1 text-sm text-zinc-600">Provider, model, usage, latency, and status remain auditable.</p></div></div><div className="mt-4 grid gap-2 md:grid-cols-3">{runs.slice(0, 6).map((run) => <div key={textValue(run.id)} className="rounded-xl bg-zinc-50 p-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-zinc-800">{textValue(run.surface, 'AI run')}</p><span className="text-[11px] font-semibold text-zinc-500">{textValue(run.status)}</span></div><p className="mt-1 text-xs text-zinc-500">{textValue(run.provider)} · {textValue(run.model)} · {textValue(run.latencyMs, '—')}ms</p></div>)}{runs.length === 0 && <p className="text-sm text-zinc-500">No runs recorded yet.</p>}</div></section>}
    </div>
  );
}

export function StandaloneAIPage({ focus = 'workspace', workspaceId }: { focus?: 'workspace' | 'settings'; workspaceId?: string } = {}) {
  const [settings, setSettings] = useState<AISettingsResponse | null>(null);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [provider, setProvider] = useState<AIProviderId>('openai');
  const [apiKey, setApiKey] = useState('');
  const [label, setLabel] = useState('Workspace default');
  const [modelProvider, setModelProvider] = useState<AIProviderId>('openai');
  const [model, setModel] = useState('');
  const [modelsByProvider, setModelsByProvider] = useState<Partial<Record<AIProviderId, AIProviderModel[]>>>({});
  const [modelLoading, setModelLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [fallbackEnabled, setFallbackEnabled] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>(readSettingsTab);
  const [chatPrompt, setChatPrompt] = useState('');
  const [chatAttachments, setChatAttachments] = useState<AIContextAttachment[]>([]);
  const [chatAnswer, setChatAnswer] = useState('');
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [contextMode, setContextMode] = useState<AIContextMode>('workspace');
  const [contextStats, setContextStats] = useState<AIContextStats | null>(null);
  const [analysisTitle, setAnalysisTitle] = useState('plan.md');
  const [analysisText, setAnalysisText] = useState('');
  const [analysisAttachments, setAnalysisAttachments] = useState<AIContextAttachment[]>([]);
  const [analysisAnswer, setAnalysisAnswer] = useState('');
  const [proposals, setProposals] = useState<AIProposal[]>([]);
  const [memories, setMemories] = useState<AIMemory[]>([]);
  const [runs, setRuns] = useState<Array<Record<string, unknown>>>([]);
  const [agents, setAgents] = useState<Array<Record<string, unknown>>>([]);
  const [agentName, setAgentName] = useState('');
  const [agentProvider, setAgentProvider] = useState<AIProviderId>('openai');
  const [agentModel, setAgentModel] = useState('');
  const [agentModels, setAgentModels] = useState<AIProviderModel[]>([]);
  const [agentModelLoading, setAgentModelLoading] = useState(false);
  const [history, setHistory] = useState<Record<string, AIRevision[]>>({});
  const [expandedMemory, setExpandedMemory] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const hasModelProviderKey = Boolean(settings?.credentials.some((item) => item.provider === modelProvider));

  const refreshOperationalData = async () => {
    const [proposalResult, memoryResult, runResult] = await Promise.all([
      standaloneClient.listAIProposals(),
      standaloneClient.listAIMemories(),
      standaloneClient.listAIRuns(),
    ]);
    setProposals(proposalResult.data as AIProposal[]);
    setMemories(memoryResult.data as AIMemory[]);
    setRuns(runResult.data);
  };

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const [nextSettings, nextStatus, agentResult] = await Promise.all([
        standaloneClient.getAISettings(),
        standaloneClient.getAIStatus(),
        standaloneClient.listAIAgents(),
      ]);
      const nextProvider = nextSettings.settings.defaultProvider ?? 'openai';
      setSettings(nextSettings);
      setStatus(nextStatus);
      setProvider(nextProvider);
      setModelProvider(nextProvider);
      setModel(nextSettings.settings.defaultModel ?? '');
      setFallbackEnabled(nextSettings.settings.fallbackEnabled);
      setAgents(agentResult.data);
      if (nextStatus.active) await refreshOperationalData();
      else {
        setProposals([]);
        setMemories([]);
        setRuns([]);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load AI workspace.');
    } finally {
      setBusy(false);
    }
  };

  const discoverModels = async (targetProvider = modelProvider) => {
    setModelLoading(true);
    setModelsError(null);
    try {
      const result = await standaloneClient.listAIProviderModels(targetProvider);
      setModelsByProvider((current) => ({ ...current, [targetProvider]: result.data }));
    } catch (caught) {
      setModelsError(caught instanceof StandaloneApiError && caught.statusCode === 404
        ? 'The standalone API is still running an older build. Restart npm run dev:standalone, then refresh this page.'
        : caught instanceof Error ? caught.message : 'Model discovery failed.');
    } finally {
      setModelLoading(false);
    }
  };

  const discoverAgentModels = async (targetProvider = agentProvider) => {
    setAgentModelLoading(true);
    try {
      const result = await standaloneClient.listAIProviderModels(targetProvider);
      setAgentModels(result.data);
    } catch {
      setAgentModels([]);
    } finally {
      setAgentModelLoading(false);
    }
  };

  useEffect(() => {
    setSettings(null);
    setStatus(null);
    setChatSessionId(null);
    setChatAnswer('');
    setContextStats(null);
    setAnalysisAnswer('');
    setProposals([]);
    setMemories([]);
    setRuns([]);
    setHistory({});
    setExpandedMemory(null);
    void load();
  }, [workspaceId]);

  useEffect(() => {
    if (focus === 'settings' && settingsTab === 'models' && hasModelProviderKey) void discoverModels(modelProvider);
  }, [focus, settingsTab, modelProvider, hasModelProviderKey]);

  const saveProviderKey = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!apiKey.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await standaloneClient.saveAIProviderKey(provider, apiKey.trim(), label.trim() || undefined);
      setApiKey('');
      setNotice(`${providerLabel(provider)} key saved. Open Models to discover the models available to this key.`);
      await load();
      await discoverModels(provider);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Provider key could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const removeProviderKey = async () => {
    if (!settings?.credentials.some((item) => item.provider === provider) || !window.confirm(`Remove the ${providerLabel(provider)} key from this workspace?`)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await standaloneClient.deleteAIProviderKey(provider);
      setModelsByProvider((current) => ({ ...current, [provider]: [] }));
      setNotice(`${providerLabel(provider)} key removed. AI will remain inactive if it was the selected workspace provider.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Provider key could not be removed.');
    } finally {
      setBusy(false);
    }
  };

  const handleModelProviderChange = (nextProvider: AIProviderId) => {
    setModelProvider(nextProvider);
    setModel(settings?.settings.defaultProvider === nextProvider ? settings.settings.defaultModel ?? '' : '');
    setModelsError(null);
  };

  const saveModel = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!model.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await standaloneClient.updateAISettings({ defaultProvider: modelProvider, defaultModel: model.trim(), fallbackEnabled });
      setNotice(`${providerLabel(modelProvider)} · ${model.trim()} saved as the workspace model. Activation was rechecked.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Workspace model could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const testModel = async () => {
    if (!status?.active || status.provider !== modelProvider || status.model !== model) {
      setError('Save this provider and model as the workspace default before testing it.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await standaloneClient.testAIProvider(modelProvider, model);
      setNotice(`${providerLabel(modelProvider)} responded successfully for ${model}.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Model test failed.');
    } finally {
      setBusy(false);
    }
  };

  const saveFallback = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await standaloneClient.updateAISettings({ fallbackEnabled });
      setNotice('Advanced AI settings saved.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Advanced settings could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const handleAgentProviderChange = (nextProvider: AIProviderId) => {
    setAgentProvider(nextProvider);
    setAgentModel('');
    void discoverAgentModels(nextProvider);
  };

  const createAgent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = agentName.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    try {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 160);
      await standaloneClient.createAIAgent({ name, slug: slug || `agent-${Date.now()}`, provider: agentProvider, model: agentModel.trim() || null, mission: '', instructions: '', allowedResourceTypes: [], allowedTools: [] });
      setAgentName('');
      setAgentModel('');
      setNotice('Agent profile created. It still inherits workspace activation and approval rules.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Agent profile could not be created.');
    } finally {
      setBusy(false);
    }
  };

  const sendChat = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = chatPrompt.trim() || (chatAttachments.length > 0 ? 'Analyze the attached files and answer the request.' : '');
    if (!content || !status?.active || busy) return;
    setBusy(true);
    setError(null);
    try {
      let sessionId = chatSessionId;
      if (!sessionId) {
        const session = await standaloneClient.createAIChatSession('Global AI workspace chat', { route: '/ai' });
        sessionId = textValue(session.id);
        if (!sessionId) throw new Error('AI chat session could not be created.');
        setChatSessionId(sessionId);
      }
      const result = await standaloneClient.sendAIChatMessage(sessionId, content, { route: '/ai', userPrompt: content, attachments: chatAttachments, metadata: { source: 'global-ai-page', contextMode } });
      setChatAnswer(result.run.output.answer);
      setContextStats(result.run.contextStats ?? null);
      setChatPrompt('');
      setChatAttachments([]);
      setNotice(`Run completed. ${result.run.memoryResults.length} autonomous memory change(s) applied.`);
      await refreshOperationalData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'AI chat failed.');
    } finally {
      setBusy(false);
    }
  };

  const analyzeDocument = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if ((!analysisText.trim() && analysisAttachments.length === 0) || !status?.active || busy) return;
    setBusy(true);
    setError(null);
    setAnalysisAnswer('');
    try {
      const result = await standaloneClient.analyzeWithAI({ route: '/ai', resourceType: 'context-sources', selectedRecords: analysisText.trim() ? [{ title: analysisTitle.trim() || 'plan.md', content: analysisText.slice(0, 100_000) }] : [], attachments: analysisAttachments, userPrompt: 'Understand this source deeply. Extract facts, decisions, constraints, outcomes, risks, and a practical cross-domain operating plan. Recommend goals and task sequences as proposals, while remembering stable workspace preferences autonomously.', metadata: { source: 'analyze-file', contextMode } });
      setAnalysisAnswer(result.output.answer);
      setContextStats(result.contextStats ?? null);
      setAnalysisAttachments([]);
      setNotice(result.output.actionability === 'insufficient_evidence'
        ? 'Analysis completed. No proposal was created because the source did not contain enough actionable evidence.'
        : result.proposalId
          ? `Analysis completed. ${result.memoryResults.length} autonomous memory change(s) applied and ${result.output.actions.length} proposal action(s) generated.`
          : `Analysis completed. ${result.memoryResults.length} autonomous memory change(s) applied. No approval proposal was needed.`);
      await refreshOperationalData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Source analysis failed.');
    } finally {
      setBusy(false);
    }
  };

  const reviewAction = async (proposalId: string, actionId: string, operation: 'approve' | 'apply' | 'reject') => {
    setBusy(true);
    setError(null);
    try {
      if (operation === 'approve') await standaloneClient.approveAIProposalAction(proposalId, actionId);
      if (operation === 'apply') await standaloneClient.applyAIProposalAction(proposalId, actionId);
      if (operation === 'reject') await standaloneClient.rejectAIProposalAction(proposalId, actionId);
      await refreshOperationalData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Proposal action failed.');
    } finally {
      setBusy(false);
    }
  };

  const toggleHistory = async (memoryId: string) => {
    if (expandedMemory === memoryId) {
      setExpandedMemory(null);
      return;
    }
    setExpandedMemory(memoryId);
    if (!history[memoryId]) {
      try {
        const result = await standaloneClient.listAIMemoryHistory(memoryId);
        setHistory((current) => ({ ...current, [memoryId]: result.data as AIRevision[] }));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Memory history failed.');
      }
    }
  };

  const undo = async (memoryId: string, revisionId: string) => {
    setBusy(true);
    setError(null);
    try {
      await standaloneClient.undoAIMemoryRevision(memoryId, revisionId);
      setNotice('Memory undo created a new inverse revision.');
      await refreshOperationalData();
      const result = await standaloneClient.listAIMemoryHistory(memoryId);
      setHistory((current) => ({ ...current, [memoryId]: result.data as AIRevision[] }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Memory undo failed.');
    } finally {
      setBusy(false);
    }
  };

  const selectedModels = modelsByProvider[modelProvider] ?? [];
  const pageTitle = focus === 'settings' ? 'AI settings' : 'AI workspace';
  const pageSubtitle = focus === 'settings' ? 'Manage provider access and model selection as two separate steps.' : 'Ask, analyze, and operationalize work with one context engine across Replofy.';

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-50">
      <StudioHeader showNotifications={false} badge="AI context engine" badgeIcon={<Sparkles className="h-3.5 w-3.5" />} title={pageTitle} subtitle={pageSubtitle} actions={<button type="button" onClick={() => void load()} disabled={busy} className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-500 hover:text-zinc-950 disabled:opacity-50" aria-label="Refresh AI page"><RefreshCw className="h-4 w-4" /></button>} />
      <div className="min-h-0 flex-1 overflow-y-auto p-5 md:p-8">
        <div className="mx-auto max-w-7xl space-y-5">
          {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {notice && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
          {focus === 'settings' ? (
            <SettingsView
              settings={settings}
              status={status}
              tab={settingsTab}
              provider={provider}
              apiKey={apiKey}
              label={label}
              modelProvider={modelProvider}
              model={model}
              models={selectedModels}
              modelLoading={modelLoading}
              modelsError={modelsError}
              fallbackEnabled={fallbackEnabled}
              agents={agents}
              agentName={agentName}
              agentProvider={agentProvider}
              agentModel={agentModel}
              agentModels={agentModels}
              agentModelLoading={agentModelLoading}
              busy={busy}
              memories={memories}
              history={history}
              expandedMemory={expandedMemory}
              onTabChange={setSettingsTab}
              onProviderChange={setProvider}
              onApiKeyChange={setApiKey}
              onLabelChange={setLabel}
              onSaveProviderKey={saveProviderKey}
              onRemoveProviderKey={() => void removeProviderKey()}
              onModelProviderChange={handleModelProviderChange}
              onModelChange={setModel}
              onDiscoverModels={() => void discoverModels()}
              onSaveModel={saveModel}
              onTestModel={() => void testModel()}
              onFallbackChange={setFallbackEnabled}
              onSaveFallback={saveFallback}
              onAgentNameChange={setAgentName}
              onAgentProviderChange={handleAgentProviderChange}
              onAgentModelChange={setAgentModel}
              onDiscoverAgentModels={() => void discoverAgentModels()}
              onCreateAgent={createAgent}
              onToggleHistory={(memoryId) => void toggleHistory(memoryId)}
              onUndo={(memoryId, revisionId) => void undo(memoryId, revisionId)}
            />
          ) : (
            <WorkspaceView
              settings={settings}
              status={status}
              busy={busy}
              chatPrompt={chatPrompt}
              chatAttachments={chatAttachments}
              chatAnswer={chatAnswer}
              analysisTitle={analysisTitle}
              analysisText={analysisText}
              analysisAnswer={analysisAnswer}
              analysisAttachments={analysisAttachments}
              proposals={proposals}
              memories={memories}
              runs={runs}
              history={history}
              expandedMemory={expandedMemory}
              contextMode={contextMode}
              contextStats={contextStats}
              onChatPromptChange={setChatPrompt}
              onChatAttachmentsChange={setChatAttachments}
              onContextModeChange={setContextMode}
              onSendChat={sendChat}
              onAnalysisTitleChange={setAnalysisTitle}
              onAnalysisTextChange={setAnalysisText}
              onAnalysisAttachmentsChange={setAnalysisAttachments}
              onAttachmentError={setError}
              onAnalyze={analyzeDocument}
              onReview={(proposalId, actionId, operation) => void reviewAction(proposalId, actionId, operation)}
              onToggleHistory={(memoryId) => void toggleHistory(memoryId)}
              onUndo={(memoryId, revisionId) => void undo(memoryId, revisionId)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
