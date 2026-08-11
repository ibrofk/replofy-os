import React, { useEffect, useState } from 'react';
import { Archive, BookOpen, Check, FileText, Plus, RefreshCw, Save, Sparkles, Upload, X } from 'lucide-react';
import { StudioHeader } from '../components/ui/StudioHeader';
import {
  standaloneClient,
  type StandaloneContextSourceItem,
} from '../services/standaloneClient';
import type { BusinessPlan, ContextSource } from '../types';

export function StandalonePlanningPage() {
  const [plans, setPlans] = useState<BusinessPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<BusinessPlan | null>(null);
  const [sources, setSources] = useState<ContextSource[]>([]);
  const [items, setItems] = useState<StandaloneContextSourceItem[]>([]);
  const [planTitle, setPlanTitle] = useState('');
  const [planContent, setPlanContent] = useState('');
  const [newPlanTitle, setNewPlanTitle] = useState('');
  const [fileName, setFileName] = useState('context.md');
  const [fileContent, setFileContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAIBusy] = useState(false);
  const [aiAnswer, setAIAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [planResult, sourceResult, itemResult] = await Promise.all([
        standaloneClient.listBusinessPlans(),
        standaloneClient.listContextSources(),
        standaloneClient.listContextSourceItems(),
      ]);
      setPlans(planResult.data);
      setSources(sourceResult.data);
      setItems(itemResult.data);
      setSelectedPlan((current) => {
        const next = planResult.data.find((plan) => plan.id === current?.id) ?? planResult.data[0] ?? null;
        setPlanTitle(next?.title ?? '');
        setPlanContent(next?.content ?? '');
        return next;
      });
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load planning data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createPlan = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newPlanTitle.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await standaloneClient.createBusinessPlan({ title: newPlanTitle.trim() });
      setPlans((current) => [created, ...current]);
      setSelectedPlan(created);
      setPlanTitle(created.title);
      setPlanContent(created.content);
      setNewPlanTitle('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Business plan creation failed.');
    } finally {
      setBusy(false);
    }
  };

  const savePlan = async () => {
    if (!selectedPlan) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await standaloneClient.updateBusinessPlan(selectedPlan.id, {
        title: planTitle,
        content: planContent,
      });
      setPlans((current) => current.map((plan) => plan.id === updated.id ? updated : plan));
      setSelectedPlan(updated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Business plan save failed.');
    } finally {
      setBusy(false);
    }
  };

  const analyzeSelectedPlan = async () => {
    if (!selectedPlan || aiBusy) return;
    setAIBusy(true);
    setError(null);
    setAIAnswer('');
    try {
      const result = await standaloneClient.analyzeWithAI({
        route: '/planning',
        resourceType: 'business-plans',
        resourceId: selectedPlan.id,
        selectedRecords: [{ id: selectedPlan.id, title: planTitle, content: planContent }],
        userPrompt: 'Analyze this business plan in full context. Extract facts, decisions, constraints, outcomes, risks, and missing assumptions. Recommend measurable goals and a dependency-aware task sequence across the relevant Replofy domains. Keep domain changes as proposals and remember stable workspace preferences autonomously.',
        metadata: { source: 'planning-plan-editor' },
      });
      setAIAnswer(result.output.answer);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'AI plan analysis failed.');
    } finally {
      setAIBusy(false);
    }
  };

  const analyzeSourceItem = async (item: StandaloneContextSourceItem) => {
    if (aiBusy) return;
    setAIBusy(true);
    setError(null);
    setAIAnswer('');
    try {
      const result = await standaloneClient.analyzeWithAI({
        route: '/planning',
        resourceType: 'context-source-items',
        resourceId: item.id,
        sourceIds: [item.sourceId],
        sourceVersionIds: [item.sourceVersionId],
        selectedRecords: [{ id: item.id, kind: item.kind, title: item.title, summary: item.summary, payload: item.payload }],
        userPrompt: 'Analyze this source in full context. Extract evidence-backed facts, decisions, constraints, outcomes, risks, and missing steps. Propose measurable changes across the workspace and remember durable preferences only when supported by the source.',
        metadata: { source: 'planning-context-review', sourceVersionId: item.sourceVersionId },
      });
      setAIAnswer(result.output.answer);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'AI source analysis failed.');
    } finally {
      setAIBusy(false);
    }
  };

  const ingest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!fileContent.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await standaloneClient.ingestContext({ fileName, content: fileContent, mimeType: fileName.endsWith('.md') ? 'text/markdown' : 'text/plain' });
      setFileContent('');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Context ingestion failed.');
    } finally {
      setBusy(false);
    }
  };

  const reviewItem = async (item: StandaloneContextSourceItem, status: StandaloneContextSourceItem['status']) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await standaloneClient.updateContextSourceItem(item.id, status);
      setItems((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Context review failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-50">
      <StudioHeader
        showNotifications={false}
        badge="Planning & context"
        badgeIcon={<BookOpen className="h-3.5 w-3.5" />}
        title="Plans & Context"
        subtitle="Durable business plans and reviewable context proposals, stored inside this workspace."
        actions={(
          <button onClick={() => void load()} className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-500 hover:text-zinc-950" aria-label="Refresh planning">
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
      />
      <div className="flex-1 overflow-y-auto p-5 md:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {loading ? <p className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">Loading planning data…</p> : (
            <>
              <section className="grid gap-4 lg:grid-cols-[260px_1fr_320px]">
                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Business plans</p><FileText className="h-4 w-4 text-zinc-400" /></div>
                  <div className="mt-3 space-y-1">
                    {plans.map((plan) => <button key={plan.id} onClick={() => { setSelectedPlan(plan); setPlanTitle(plan.title); setPlanContent(plan.content); }} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selectedPlan?.id === plan.id ? 'bg-zinc-950 font-semibold text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}>{plan.title}</button>)}
                    {plans.length === 0 && <p className="py-3 text-sm text-zinc-500">No plans yet.</p>}
                  </div>
                  <form onSubmit={createPlan} className="mt-4 border-t border-zinc-100 pt-4"><input value={newPlanTitle} onChange={(event) => setNewPlanTitle(event.target.value)} placeholder="New plan title" className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-500" /><button disabled={busy} className="mt-2 inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Plus className="h-3.5 w-3.5" /> New plan</button></form>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Plan editor</p><p className="mt-1 text-sm text-zinc-500">Markdown remains portable and revisioned.</p></div><div className="flex gap-2"><button disabled={!selectedPlan || busy} onClick={() => void savePlan()} className="inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Save className="h-3.5 w-3.5" /> Save</button><button type="button" disabled={!selectedPlan || aiBusy} onClick={() => void analyzeSelectedPlan()} className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" /> {aiBusy ? 'Analyzing…' : 'Analyze with AI'}</button></div></div>
                  {selectedPlan ? <div className="mt-4 space-y-3"><input value={planTitle} onChange={(event) => setPlanTitle(event.target.value)} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-lg font-bold outline-none focus:border-zinc-500" /><textarea value={planContent} onChange={(event) => setPlanContent(event.target.value)} rows={16} className="w-full resize-y rounded-lg border border-zinc-200 px-3 py-3 font-mono text-sm leading-6 outline-none focus:border-zinc-500" />{aiAnswer && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-amber-800">AI operational recommendation</p>{aiAnswer}</div>}</div> : <p className="mt-8 text-sm text-zinc-500">Create a plan to start drafting.</p>}
                </div>
                <form onSubmit={ingest} className="rounded-2xl border border-zinc-200 bg-white p-5"><div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Ingest context</p><Upload className="h-4 w-4 text-zinc-400" /></div><p className="mt-2 text-sm text-zinc-500">Optional Gemini extraction degrades to local parsing when no key is configured.</p><div className="mt-4 space-y-3"><input value={fileName} onChange={(event) => setFileName(event.target.value)} className="w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-xs outline-none focus:border-zinc-500" /><textarea required value={fileContent} onChange={(event) => setFileContent(event.target.value)} rows={10} placeholder="Paste a Markdown or text document…" className="w-full resize-y rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-500" /><button disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50"><Upload className="h-3.5 w-3.5" /> Ingest for review</button></div></form>
              </section>
              <section className="rounded-2xl border border-zinc-200 bg-white p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Context sources</p><p className="mt-1 text-sm text-zinc-500">{sources.length} source{sources.length === 1 ? '' : 's'} stored with version history.</p></div><Archive className="h-5 w-5 text-zinc-400" /></div><div className="mt-4 grid gap-3 md:grid-cols-3">{sources.map((source) => <div key={source.id} className="rounded-xl border border-zinc-200 p-4"><p className="font-semibold text-zinc-950">{source.title}</p><p className="mt-1 text-xs text-zinc-500">v{source.latestVersion} · {source.latestFileName}</p><p className="mt-2 text-sm text-zinc-600">{source.latestSummary || 'No summary recorded.'}</p></div>)}{sources.length === 0 && <p className="text-sm text-zinc-500">Ingest a document to create the first source.</p>}</div></section>
              <section className="rounded-2xl border border-zinc-200 bg-white p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Review queue</p><p className="mt-1 text-sm text-zinc-500">Extracted items stay proposed until a human accepts them. AI source analysis is separately auditable.</p></div><BookOpen className="h-5 w-5 text-zinc-400" /></div><div className="mt-4 divide-y divide-zinc-100">{items.map((item) => <div key={item.id} className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between"><div><div className="flex items-center gap-2"><span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-bold uppercase text-zinc-600">{item.kind}</span><span className="text-xs text-zinc-500">{item.status}</span></div><p className="mt-1 font-semibold text-zinc-950">{item.title}</p><p className="mt-1 text-sm text-zinc-600">{item.summary}</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={aiBusy} onClick={() => void analyzeSourceItem(item)} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" /> Analyze</button>{item.status === 'proposed' && <><button disabled={busy} onClick={() => void reviewItem(item, 'accepted')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Check className="h-3.5 w-3.5" /> Accept</button><button disabled={busy} onClick={() => void reviewItem(item, 'rejected')} className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 disabled:opacity-50"><X className="h-3.5 w-3.5" /> Reject</button></>}</div></div>)}{items.length === 0 && <p className="py-6 text-sm text-zinc-500">No proposed context items yet.</p>}</div></section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
