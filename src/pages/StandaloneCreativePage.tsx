import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Download, FileUp, Plus, Save, Trash2 } from 'lucide-react';
import type { CreativeAsset, CreativeItem, CreativeStatus } from '../types';
import { standaloneClient } from '../services/standaloneClient';

const statuses: CreativeStatus[] = [
  'idea', 'brief', 'draft', 'in-review', 'changes-requested',
  'approved', 'scheduled', 'published', 'rejected', 'archived',
];

export function StandaloneCreativePage() {
  const [items, setItems] = useState<CreativeItem[]>([]);
  const [assets, setAssets] = useState<CreativeAsset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [draft, setDraft] = useState<CreativeItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) || null,
    [items, selectedId],
  );
  const selectedAssets = useMemo(
    () => assets.filter((asset) => asset.creativeId === selectedId && asset.status !== 'archived'),
    [assets, selectedId],
  );

  const load = async () => {
    const [nextItems, nextAssets] = await Promise.all([
      standaloneClient.listCreativeItems(),
      standaloneClient.listCreativeAssets(),
    ]);
    setItems(nextItems.data);
    setAssets(nextAssets.data);
    setSelectedId((current) => current && nextItems.data.some((item) => item.id === current)
      ? current
      : nextItems.data[0]?.id || null);
  };

  useEffect(() => {
    void load().catch((value) => setError(value instanceof Error ? value.message : 'Creative Hub failed to load.'));
  }, []);

  useEffect(() => {
    setDraft(selected ? { ...selected, tags: [...selected.tags] } : null);
  }, [selected]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Creative operation failed.');
    } finally {
      setBusy(false);
    }
  };

  const create = () => run(async () => {
    const title = newTitle.trim();
    if (!title) return;
    const item = await standaloneClient.createCreativeItem({ title });
    setNewTitle('');
    setSelectedId(item.id);
  });

  const save = () => run(async () => {
    if (!draft) return;
    await standaloneClient.updateCreativeItem(draft.id, {
      title: draft.title.trim(),
      platform: draft.platform,
      format: draft.format,
      campaign: draft.campaign,
      audience: draft.audience,
      objective: draft.objective,
      hook: draft.hook,
      brief: draft.brief,
      caption: draft.caption,
      visualDirection: draft.visualDirection,
      productionNotes: draft.productionNotes,
      cta: draft.cta,
      status: draft.status,
      approvalNotes: draft.approvalNotes,
      tags: draft.tags.map((tag) => tag.trim()).filter(Boolean),
    });
  });

  const upload = (files: FileList | null) => run(async () => {
    for (const file of Array.from(files || [])) {
      await standaloneClient.uploadCreativeAsset(file, { creativeId: selectedId });
    }
    if (fileRef.current) fileRef.current.value = '';
  });

  return (
    <main className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="w-80 shrink-0 overflow-y-auto border-r border-zinc-200 bg-white p-4">
        <form
          className="mb-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="New creative idea"
            className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
          <button disabled={busy || !newTitle.trim()} className="rounded-lg bg-zinc-950 p-2 text-white disabled:opacity-40">
            <Plus className="h-4 w-4" />
          </button>
        </form>
        <div className="space-y-2">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`w-full rounded-lg border p-3 text-left ${
                selectedId === item.id ? 'border-zinc-950 bg-zinc-50' : 'border-zinc-200'
              }`}
            >
              <div className="truncate text-sm font-semibold">{item.title}</div>
              <div className="mt-1 text-xs text-zinc-500">{item.status} · {item.platform}</div>
            </button>
          ))}
        </div>
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto bg-zinc-50 p-6">
        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {!draft ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
            Create a creative item to start the pipeline.
          </div>
        ) : (
          <div className="mx-auto max-w-5xl space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold">Creative Hub</h1>
                <p className="text-sm text-zinc-500">PostgreSQL metadata with workspace-isolated filesystem assets.</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => void run(async () => {
                    await standaloneClient.deleteCreativeItem(draft.id);
                    setSelectedId(null);
                  })}
                  disabled={busy}
                  className="rounded-lg border border-zinc-200 bg-white p-2 text-red-600 disabled:opacity-40"
                  aria-label="Delete creative"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button onClick={() => void save()} disabled={busy || !draft.title.trim()} className="inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                  <Save className="h-4 w-4" /> Save
                </button>
              </div>
            </div>

            <div className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-5 md:grid-cols-2">
              <label className="text-xs font-semibold text-zinc-600">Title
                <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-semibold text-zinc-600">Status
                <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as CreativeStatus })} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                  {statuses.map((status) => <option key={status}>{status}</option>)}
                </select>
              </label>
              {([
                ['campaign', 'Campaign'],
                ['audience', 'Audience'],
                ['objective', 'Objective'],
                ['hook', 'Hook'],
                ['brief', 'Brief'],
                ['caption', 'Caption'],
                ['visualDirection', 'Visual direction'],
                ['productionNotes', 'Production notes'],
                ['cta', 'Call to action'],
              ] as const).map(([field, label]) => (
                <label key={field} className="text-xs font-semibold text-zinc-600">{label}
                  <textarea value={draft[field]} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} className="mt-1 min-h-20 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
                </label>
              ))}
              <label className="text-xs font-semibold text-zinc-600 md:col-span-2">Tags
                <input value={draft.tags.join(', ')} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(',') })} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
              </label>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">Assets</h2>
                  <p className="text-xs text-zinc-500">Files are streamed through the authenticated standalone API.</p>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-zinc-950 px-3 py-2 text-sm font-semibold text-white">
                  <FileUp className="h-4 w-4" /> Upload
                  <input ref={fileRef} type="file" multiple className="hidden" onChange={(event) => void upload(event.target.files)} />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {selectedAssets.map((asset) => (
                  <div key={asset.id} className="flex items-center justify-between rounded-lg border border-zinc-200 p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{asset.title}</div>
                      <div className="text-xs text-zinc-500">{asset.mimeType} · {asset.fileSize.toLocaleString()} bytes</div>
                    </div>
                    <div className="flex gap-1">
                      <a href={standaloneClient.creativeAssetDownloadUrl(asset.id)} className="rounded p-2 text-zinc-600 hover:bg-zinc-100" aria-label="Download asset">
                        <Download className="h-4 w-4" />
                      </a>
                      <button onClick={() => void run(async () => {
                        await standaloneClient.updateCreativeAsset(asset.id, { status: 'archived' });
                      })} className="rounded p-2 text-zinc-600 hover:bg-zinc-100" aria-label="Archive asset">
                        <Archive className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
