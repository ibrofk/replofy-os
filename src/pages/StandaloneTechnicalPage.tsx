import { useEffect, useState } from 'react';
import { Bug as BugIcon, Plus, Trash2 } from 'lucide-react';
import type { Bug, BugSeverity, BugStatus, RoadmapItem, RoadmapPhase, RoadmapPriority, RoadmapStatus } from '../types';
import { standaloneClient } from '../services/standaloneClient';

const bugStatuses: BugStatus[] = ['open', 'triaged', 'in-progress', 'blocked', 'resolved', 'closed'];
const bugSeverities: BugSeverity[] = ['low', 'medium', 'high', 'critical'];
const phases: RoadmapPhase[] = ['now', 'next', 'later'];
const priorities: RoadmapPriority[] = ['low', 'medium', 'high'];
const roadmapStatuses: RoadmapStatus[] = ['planned', 'building', 'blocked', 'shipped'];
const field = 'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm';

export function StandaloneTechnicalPage() {
  const [tab, setTab] = useState<'bugs' | 'roadmap'>('bugs');
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [roadmap, setRoadmap] = useState<RoadmapItem[]>([]);
  const [bugDraft, setBugDraft] = useState({ title: '', description: '', severity: 'medium' as BugSeverity, status: 'open' as BugStatus, resolutionNotes: '' });
  const [roadmapDraft, setRoadmapDraft] = useState({ title: '', description: '', phase: 'next' as RoadmapPhase, priority: 'medium' as RoadmapPriority, status: 'planned' as RoadmapStatus });
  const [editingBugId, setEditingBugId] = useState<string | null>(null);
  const [editingRoadmapId, setEditingRoadmapId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [nextBugs, nextRoadmap] = await Promise.all([
      standaloneClient.listBugs(),
      standaloneClient.listRoadmapItems(),
    ]);
    setBugs(nextBugs.data);
    setRoadmap(nextRoadmap.data);
  };
  useEffect(() => {
    void load().catch((value) => setError(value instanceof Error ? value.message : 'Technical Studio failed to load.'));
  }, []);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Technical operation failed.');
    } finally {
      setBusy(false);
    }
  };

  const editBug = (item: Bug) => {
    setEditingBugId(item.id);
    setBugDraft({
      title: item.title,
      description: item.description,
      severity: item.severity,
      status: item.status,
      resolutionNotes: item.resolutionNotes,
    });
  };
  const editRoadmap = (item: RoadmapItem) => {
    setEditingRoadmapId(item.id);
    setRoadmapDraft({
      title: item.title,
      description: item.description,
      phase: item.phase,
      priority: item.priority,
      status: item.status,
    });
  };

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-zinc-50 p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div>
          <h1 className="text-2xl font-semibold">Technical Studio</h1>
          <p className="mt-1 text-sm text-zinc-500">Durable bug triage and product roadmap execution.</p>
        </div>
        <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-1">
          {(['bugs', 'roadmap'] as const).map((value) => (
            <button key={value} onClick={() => setTab(value)} className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === value ? 'bg-zinc-950 text-white' : 'text-zinc-500'}`}>{value}</button>
          ))}
        </div>
        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {tab === 'bugs' ? (
          <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
            <form className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4" onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                if (editingBugId) await standaloneClient.updateBug(editingBugId, bugDraft);
                else await standaloneClient.createBug(bugDraft);
                setEditingBugId(null);
                setBugDraft({ title: '', description: '', severity: 'medium', status: 'open', resolutionNotes: '' });
              });
            }}>
              <h2 className="flex items-center gap-2 font-semibold"><BugIcon className="h-4 w-4" /> {editingBugId ? 'Edit bug' : 'Report bug'}</h2>
              <input required value={bugDraft.title} onChange={(e) => setBugDraft({ ...bugDraft, title: e.target.value })} placeholder="Title" className={field} />
              <textarea value={bugDraft.description} onChange={(e) => setBugDraft({ ...bugDraft, description: e.target.value })} placeholder="Description" className={`${field} min-h-28`} />
              <div className="grid grid-cols-2 gap-2">
                <select value={bugDraft.severity} onChange={(e) => setBugDraft({ ...bugDraft, severity: e.target.value as BugSeverity })} className={field}>{bugSeverities.map((value) => <option key={value}>{value}</option>)}</select>
                <select value={bugDraft.status} onChange={(e) => setBugDraft({ ...bugDraft, status: e.target.value as BugStatus })} className={field}>{bugStatuses.map((value) => <option key={value}>{value}</option>)}</select>
              </div>
              <textarea value={bugDraft.resolutionNotes} onChange={(e) => setBugDraft({ ...bugDraft, resolutionNotes: e.target.value })} placeholder="Resolution notes" className={`${field} min-h-20`} />
              <button disabled={busy || !bugDraft.title.trim()} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"><Plus className="h-4 w-4" /> Save bug</button>
            </form>
            <div className="space-y-2">
              {bugs.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4">
                  <button onClick={() => editBug(item)} className="min-w-0 flex-1 text-left">
                    <div className="font-semibold">{item.title}</div>
                    <div className="mt-1 text-xs text-zinc-500">{item.status} · {item.severity}</div>
                    <p className="mt-2 line-clamp-2 text-sm text-zinc-600">{item.description}</p>
                  </button>
                  <button onClick={() => void run(async () => standaloneClient.deleteBug(item.id).then(() => undefined))} className="rounded p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
            <form className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4" onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                if (editingRoadmapId) await standaloneClient.updateRoadmapItem(editingRoadmapId, roadmapDraft);
                else await standaloneClient.createRoadmapItem(roadmapDraft);
                setEditingRoadmapId(null);
                setRoadmapDraft({ title: '', description: '', phase: 'next', priority: 'medium', status: 'planned' });
              });
            }}>
              <h2 className="font-semibold">{editingRoadmapId ? 'Edit roadmap item' : 'New roadmap item'}</h2>
              <input required value={roadmapDraft.title} onChange={(e) => setRoadmapDraft({ ...roadmapDraft, title: e.target.value })} placeholder="Title" className={field} />
              <textarea value={roadmapDraft.description} onChange={(e) => setRoadmapDraft({ ...roadmapDraft, description: e.target.value })} placeholder="Description" className={`${field} min-h-28`} />
              <div className="grid grid-cols-3 gap-2">
                <select value={roadmapDraft.phase} onChange={(e) => setRoadmapDraft({ ...roadmapDraft, phase: e.target.value as RoadmapPhase })} className={field}>{phases.map((value) => <option key={value}>{value}</option>)}</select>
                <select value={roadmapDraft.priority} onChange={(e) => setRoadmapDraft({ ...roadmapDraft, priority: e.target.value as RoadmapPriority })} className={field}>{priorities.map((value) => <option key={value}>{value}</option>)}</select>
                <select value={roadmapDraft.status} onChange={(e) => setRoadmapDraft({ ...roadmapDraft, status: e.target.value as RoadmapStatus })} className={field}>{roadmapStatuses.map((value) => <option key={value}>{value}</option>)}</select>
              </div>
              <button disabled={busy || !roadmapDraft.title.trim()} className="w-full rounded-lg bg-zinc-950 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Save roadmap item</button>
            </form>
            <div className="grid gap-3 md:grid-cols-3">
              {phases.map((phase) => (
                <div key={phase} className="rounded-xl border border-zinc-200 bg-white p-3">
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500">{phase}</h3>
                  <div className="space-y-2">
                    {roadmap.filter((item) => item.phase === phase).map((item) => (
                      <div key={item.id} className="rounded-lg border border-zinc-200 p-3">
                        <button onClick={() => editRoadmap(item)} className="w-full text-left">
                          <div className="text-sm font-semibold">{item.title}</div>
                          <div className="mt-1 text-xs text-zinc-500">{item.status} · {item.priority}</div>
                        </button>
                        <button onClick={() => void run(async () => standaloneClient.deleteRoadmapItem(item.id).then(() => undefined))} className="mt-2 text-xs font-semibold text-red-600">Delete</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
