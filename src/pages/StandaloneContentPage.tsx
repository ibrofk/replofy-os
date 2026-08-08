import React, { useEffect, useState } from 'react';
import { FileText, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { StudioHeader } from '../components/ui/StudioHeader';
import { useUser } from '../contexts/UserContext';
import { standaloneClient } from '../services/standaloneClient';
import type { BlogArticle, BlogArticleStatus } from '../types';

const statuses: BlogArticleStatus[] = [
  'idea',
  'planned',
  'researching',
  'drafting',
  'review',
  'scheduled',
  'published',
  'archived',
  'rejected',
];

export function StandaloneContentPage() {
  const { userProfile } = useUser();
  const [articles, setArticles] = useState<BlogArticle[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<BlogArticle | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const result = await standaloneClient.listBlogArticles();
      setArticles(result.data);
      setSelectedId((current) => current || result.data[0]?.id || '');
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Content failed to load.');
    }
  };

  useEffect(() => {
    void load();
  }, [userProfile?.companyId]);

  useEffect(() => {
    setDraft(articles.find((article) => article.id === selectedId) ?? null);
  }, [articles, selectedId]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await standaloneClient.createBlogArticle({ title: newTitle });
      setArticles((current) => [created, ...current]);
      setSelectedId(created.id);
      setNewTitle('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Article creation failed.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await standaloneClient.updateBlogArticle(draft.id, {
        title: draft.title,
        slug: draft.slug,
        summary: draft.summary,
        content: draft.content,
        status: draft.status,
        roadmapPhase: draft.roadmapPhase,
        priority: draft.priority,
        tags: draft.tags,
      });
      setArticles((current) => current.map((article) => article.id === updated.id ? updated : article));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Article update failed.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      await standaloneClient.deleteBlogArticle(draft.id);
      setArticles((current) => current.filter((article) => article.id !== draft.id));
      setSelectedId('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Article deletion failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-50">
      <StudioHeader
        showNotifications={false}
        badge="PostgreSQL"
        badgeIcon={<FileText className="h-3.5 w-3.5" />}
        title="Content"
        subtitle="Draft, plan, and publish durable blog content without cloud credentials."
      />
      {error && <div className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="grid min-h-0 flex-1 gap-5 p-5 lg:grid-cols-[300px_1fr]">
        <aside className="overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4">
          <form onSubmit={create} className="flex gap-2">
            <input required value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="New article title" className="min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
            <button disabled={busy} className="rounded-xl bg-zinc-950 p-2.5 text-white" aria-label="Create article"><Plus className="h-4 w-4" /></button>
          </form>
          <div className="mt-4 space-y-2">
            {articles.map((article) => (
              <button key={article.id} onClick={() => setSelectedId(article.id)} className={`w-full rounded-xl border p-3 text-left ${article.id === selectedId ? 'border-zinc-950 bg-zinc-950 text-white' : 'border-zinc-100 hover:bg-zinc-50'}`}>
                <p className="line-clamp-2 text-sm font-bold">{article.title}</p>
                <p className={`mt-1 text-xs capitalize ${article.id === selectedId ? 'text-zinc-300' : 'text-zinc-400'}`}>{article.status} · {article.roadmapPhase}</p>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-h-0 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 md:p-7">
          {!draft ? (
            <div className="flex h-full items-center justify-center text-sm text-zinc-400">Create or select an article.</div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as BlogArticleStatus })} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm capitalize">
                    {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                  <select value={draft.roadmapPhase || 'next'} onChange={(event) => setDraft({ ...draft, roadmapPhase: event.target.value as BlogArticle['roadmapPhase'] })} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm capitalize">
                    <option value="now">Now</option><option value="next">Next</option><option value="later">Later</option>
                  </select>
                  <select value={draft.priority || 'medium'} onChange={(event) => setDraft({ ...draft, priority: event.target.value as BlogArticle['priority'] })} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm capitalize">
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => void remove()} disabled={busy} className="rounded-xl border border-red-200 p-2.5 text-red-600 hover:bg-red-50" aria-label="Delete article"><Trash2 className="h-4 w-4" /></button>
                  <button onClick={() => void save()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                  </button>
                </div>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">Title</span>
                <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-xl font-bold" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">Summary</span>
                <textarea value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} className="min-h-24 w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">Article</span>
                <textarea value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} className="min-h-[420px] w-full rounded-xl border border-zinc-200 px-4 py-3 font-mono text-sm leading-6" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">Tags</span>
                <input value={(draft.tags || []).join(', ')} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })} className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm" placeholder="open-source, operations" />
              </label>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
