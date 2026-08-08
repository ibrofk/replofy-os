import React, { useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, collection, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { useSearchParams } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  FileImage,
  FileText,
  FolderOpen,
  Image,
  LoaderCircle,
  MessageSquareText,
  PencilLine,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { auth, db } from '../firebase';
import { useGlobalState } from '../contexts/GlobalStateContext';
import { useUser } from '../contexts/UserContext';
import { isAdminRole } from '../utils/userRoles';
import {
  CreativeAsset,
  CreativeFormat,
  CreativeItem,
  CreativePlatform,
  CreativeStatus,
} from '../types';
import { archiveCreativeAsset, getCreativeAssetDownloadUrl, uploadCreativeAsset } from '../services/creativeAssetClient';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { StudioHeader } from '../components/ui/StudioHeader';
import { EditorToolbar } from '../components/ui/EditorToolbar';
import { InspectorPanel } from '../components/ui/InspectorPanel';
import { EmptyState } from '../components/ui/EmptyState';
import { SearchInput } from '../components/ui/SearchInput';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { CustomSelect } from '../components/ui/CustomSelect';

type HubView = 'pipeline' | 'calendar' | 'assets';
type CreativeDraft = Pick<
  CreativeItem,
  | 'title'
  | 'platform'
  | 'format'
  | 'campaign'
  | 'audience'
  | 'objective'
  | 'hook'
  | 'brief'
  | 'caption'
  | 'visualDirection'
  | 'productionNotes'
  | 'cta'
  | 'ownerId'
  | 'targetPublishAt'
  | 'approvalNotes'
  | 'tags'
>;

const PLATFORMS: CreativePlatform[] = ['Instagram', 'LinkedIn', 'X', 'TikTok', 'YouTube', 'Blog', 'Email', 'Other'];
const FORMATS: CreativeFormat[] = ['single-post', 'carousel', 'reel', 'story-sequence', 'motion-brief', 'static-ad', 'thread', 'other'];
const STATUSES: CreativeStatus[] = ['idea', 'brief', 'draft', 'in-review', 'changes-requested', 'approved', 'scheduled', 'published', 'rejected', 'archived'];

const PIPELINE_GROUPS: Array<{ label: string; statuses: CreativeStatus[]; accent: string }> = [
  { label: 'Ideas', statuses: ['idea', 'brief'], accent: 'border-zinc-400' },
  { label: 'Drafts', statuses: ['draft', 'changes-requested'], accent: 'border-amber-400' },
  { label: 'Review', statuses: ['in-review'], accent: 'border-blue-400' },
  { label: 'Approved', statuses: ['approved'], accent: 'border-emerald-400' },
  { label: 'Scheduled', statuses: ['scheduled'], accent: 'border-violet-400' },
  { label: 'Published', statuses: ['published'], accent: 'border-zinc-700' },
];

const inputClass =
  'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400';
const textareaClass = `${inputClass} min-h-[108px] resize-y leading-relaxed`;

function labelFor(value: string) {
  return value.replace(/-/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function statusClass(status: CreativeStatus) {
  switch (status) {
    case 'in-review':
      return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'changes-requested':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'approved':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'scheduled':
      return 'border-violet-200 bg-violet-50 text-violet-700';
    case 'published':
      return 'border-zinc-300 bg-zinc-900 text-white';
    case 'rejected':
      return 'border-red-200 bg-red-50 text-red-700';
    case 'archived':
      return 'border-zinc-200 bg-zinc-100 text-zinc-500';
    default:
      return 'border-zinc-200 bg-white text-zinc-600';
  }
}

function toLocalDateTime(value?: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const adjusted = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 16);
}

function fromLocalDateTime(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function formatDate(value?: string | null) {
  if (!value) return 'Not set';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not set';
  return parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildDraft(creative: CreativeItem): CreativeDraft {
  return {
    title: creative.title,
    platform: creative.platform,
    format: creative.format,
    campaign: creative.campaign,
    audience: creative.audience,
    objective: creative.objective,
    hook: creative.hook,
    brief: creative.brief,
    caption: creative.caption,
    visualDirection: creative.visualDirection,
    productionNotes: creative.productionNotes,
    cta: creative.cta,
    ownerId: creative.ownerId ?? null,
    targetPublishAt: creative.targetPublishAt ?? null,
    approvalNotes: creative.approvalNotes,
    tags: creative.tags,
  };
}

function CreativeStatusPill({ status }: { status: CreativeStatus }) {
  return (
    <span className={`inline-flex rounded-sm border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${statusClass(status)}`}>
      {labelFor(status)}
    </span>
  );
}

function AssetPreview({ asset, className = '' }: { asset: CreativeAsset; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (asset.status !== 'active' || asset.assetType !== 'image') {
      setUrl(null);
      return;
    }

    void getCreativeAssetDownloadUrl(asset.id)
      .then((nextUrl) => {
        if (!cancelled) setUrl(nextUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [asset.assetType, asset.id, asset.status]);

  if (url) {
    return <img src={url} alt={asset.title} className={`h-full w-full object-cover ${className}`} />;
  }

  const Icon = asset.assetType === 'video' ? Video : asset.assetType === 'image' ? Image : FileText;
  return (
    <div className={`flex h-full w-full items-center justify-center bg-zinc-100 text-zinc-400 ${className}`}>
      <Icon className="h-7 w-7" />
    </div>
  );
}

export function CreativeHubPage() {
  const { creativeItems, creativeAssets, teamMembers } = useGlobalState();
  const { userProfile } = useUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<HubView>(() => (searchParams.get('view') as HubView) || 'pipeline');
  const [selectedCreativeId, setSelectedCreativeId] = useState<string | null>(() => searchParams.get('creativeId'));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | CreativeStatus>('all');
  const [newTitle, setNewTitle] = useState('');
  const [draft, setDraft] = useState<CreativeDraft | null>(null);
  const [scheduleValue, setScheduleValue] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = isAdminRole(userProfile.role);
  const activeAssets = useMemo(() => creativeAssets.filter((asset) => asset.status !== 'archived'), [creativeAssets]);
  const selectedCreative = useMemo(
    () => creativeItems.find((creative) => creative.id === selectedCreativeId) ?? null,
    [creativeItems, selectedCreativeId],
  );
  const attachedAssets = useMemo(
    () => activeAssets.filter((asset) => selectedCreative?.assetIds.includes(asset.id) || asset.creativeId === selectedCreative?.id),
    [activeAssets, selectedCreative],
  );

  const workspaceMembers = useMemo(() => {
    const members = [...teamMembers];
    if (!members.some((member) => member.id === userProfile.id)) {
      members.unshift(userProfile);
    }
    return members;
  }, [teamMembers, userProfile]);

  useEffect(() => {
    if (selectedCreative) {
      setDraft(buildDraft(selectedCreative));
      setScheduleValue(toLocalDateTime(selectedCreative.scheduledFor || selectedCreative.targetPublishAt));
    } else {
      setDraft(null);
      setScheduleValue('');
    }
  }, [selectedCreative]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set('view', view);
    if (selectedCreativeId) next.set('creativeId', selectedCreativeId);
    else next.delete('creativeId');

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, selectedCreativeId, setSearchParams, view]);

  const filteredCreatives = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return creativeItems
      .filter((creative) => statusFilter === 'all' || creative.status === statusFilter)
      .filter((creative) => {
        if (!normalizedSearch) return true;
        return [
          creative.title,
          creative.platform,
          creative.format,
          creative.campaign,
          creative.audience,
          creative.objective,
          creative.hook,
          creative.caption,
          ...creative.tags,
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch);
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [creativeItems, search, statusFilter]);

  const calendarGroups = useMemo(() => {
    const grouped = new Map<string, CreativeItem[]>();
    filteredCreatives
      .filter((creative) => (creative.status === 'scheduled' || creative.status === 'published') && creative.scheduledFor)
      .sort((left, right) => (left.scheduledFor || '').localeCompare(right.scheduledFor || ''))
      .forEach((creative) => {
        const key = new Date(creative.scheduledFor!).toLocaleDateString([], {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        grouped.set(key, [...(grouped.get(key) || []), creative]);
      });
    return Array.from(grouped.entries());
  }, [filteredCreatives]);

  const flash = (message: string) => {
    setError(null);
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3000);
  };

  const reportError = (value: unknown) => {
    setNotice(null);
    setError(value instanceof Error ? value.message : 'Something went wrong.');
  };

  const createCreative = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!auth.currentUser || !newTitle.trim()) return;

    const now = new Date().toISOString();
    try {
      const ref = await addDoc(collection(db, 'creativeItems'), {
        title: newTitle.trim(),
        platform: 'Instagram',
        format: 'single-post',
        campaign: '',
        audience: '',
        objective: '',
        hook: '',
        brief: '',
        caption: '',
        visualDirection: '',
        productionNotes: '',
        cta: '',
        status: 'idea',
        ownerId: auth.currentUser.uid,
        approverId: null,
        targetPublishAt: null,
        scheduledFor: null,
        publishedAt: null,
        submittedAt: null,
        approvalNotes: '',
        assetIds: [],
        tags: [],
        createdAt: now,
        updatedAt: now,
        authorId: auth.currentUser.uid,
        companyId: userProfile.companyId ?? null,
      });
      setNewTitle('');
      setSelectedCreativeId(ref.id);
      flash('Creative idea created.');
    } catch (value) {
      handleFirestoreError(value, OperationType.CREATE, 'creativeItems');
      reportError(value);
    }
  };

  const updateCreative = async (creative: CreativeItem, patch: Record<string, unknown>, successMessage?: string) => {
    try {
      await updateDoc(doc(db, 'creativeItems', creative.id), {
        ...patch,
        updatedAt: new Date().toISOString(),
      });
      if (successMessage) flash(successMessage);
    } catch (value) {
      handleFirestoreError(value, OperationType.UPDATE, `creativeItems/${creative.id}`);
      reportError(value);
    }
  };

  const saveCreative = async () => {
    if (!selectedCreative || !draft || !draft.title.trim()) return;
    await updateCreative(
      selectedCreative,
      {
        ...draft,
        title: draft.title.trim(),
        tags: draft.tags.map((tag) => tag.trim()).filter(Boolean),
      },
      'Creative saved.',
    );
  };

  const changeStatus = async (status: CreativeStatus) => {
    if (!selectedCreative) return;
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status };

    if (status === 'in-review') patch.submittedAt = now;
    if (status === 'approved') {
      patch.approverId = auth.currentUser?.uid ?? null;
      patch.approvalNotes = draft?.approvalNotes || '';
    }
    if (status === 'changes-requested' || status === 'rejected') {
      patch.approverId = auth.currentUser?.uid ?? null;
      patch.approvalNotes = draft?.approvalNotes || '';
      patch.scheduledFor = null;
      patch.publishedAt = null;
    }
    if (status === 'scheduled') {
      if (!scheduleValue) {
        setError('Choose a publishing date before scheduling.');
        return;
      }
      patch.scheduledFor = fromLocalDateTime(scheduleValue);
    }
    if (status === 'published') patch.publishedAt = now;

    await updateCreative(selectedCreative, patch, `${labelFor(status)} status applied.`);
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = event.target.files ? Array.from(event.target.files as ArrayLike<File>) : [];
    event.target.value = '';
    if (files.length === 0) return;

    setUploading(true);
    setError(null);
    try {
      for (const file of files) {
        await uploadCreativeAsset(file, { creativeId: selectedCreative?.id ?? null });
      }
      flash(`${files.length} asset${files.length === 1 ? '' : 's'} uploaded.`);
    } catch (value) {
      reportError(value);
    } finally {
      setUploading(false);
    }
  };

  const openAsset = async (asset: CreativeAsset) => {
    try {
      window.open(await getCreativeAssetDownloadUrl(asset.id), '_blank', 'noopener,noreferrer');
    } catch (value) {
      reportError(value);
    }
  };

  const archiveAsset = async (asset: CreativeAsset) => {
    try {
      await archiveCreativeAsset(asset.id);
      flash('Asset archived.');
    } catch (value) {
      reportError(value);
    }
  };

  const setAssetCreative = async (asset: CreativeAsset, creativeId: string | null) => {
    const previousCreative = creativeItems.find((creative) => creative.id === asset.creativeId);
    const nextCreative = creativeItems.find((creative) => creative.id === creativeId);
    const batch = writeBatch(db);

    if (previousCreative && previousCreative.id !== creativeId) {
      batch.update(doc(db, 'creativeItems', previousCreative.id), {
        assetIds: previousCreative.assetIds.filter((id) => id !== asset.id),
        updatedAt: new Date().toISOString(),
      });
    }

    if (nextCreative) {
      batch.update(doc(db, 'creativeItems', nextCreative.id), {
        assetIds: Array.from(new Set([...nextCreative.assetIds, asset.id])),
        updatedAt: new Date().toISOString(),
      });
    }

    batch.update(doc(db, 'creativeAssets', asset.id), {
      creativeId,
      updatedAt: new Date().toISOString(),
    });

    try {
      await batch.commit();
      flash(creativeId ? 'Asset attached.' : 'Asset detached.');
    } catch (value) {
      handleFirestoreError(value, OperationType.UPDATE, `creativeAssets/${asset.id}`);
      reportError(value);
    }
  };

  const renderUploadButton = (compact = false) => (
    <>
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className={`inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-950 font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 ${
          compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'
        }`}
      >
        {uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {uploading ? 'Uploading' : 'Upload asset'}
      </button>
    </>
  );

  const pipelineBoard = (
    <div className="flex-1 overflow-auto bg-zinc-50/70 p-4 md:p-6">
      <div className="grid min-w-[1120px] grid-cols-6 gap-3">
        {PIPELINE_GROUPS.map((group) => {
          const creatives = filteredCreatives.filter((creative) => group.statuses.includes(creative.status));
          return (
            <section key={group.label} className="min-h-[520px] rounded-lg border border-zinc-200 bg-white">
              <div className={`flex items-center justify-between border-b border-t-2 ${group.accent} border-b-zinc-200 px-3 py-3`}>
                <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-700">{group.label}</h2>
                <span className="rounded-sm border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-bold text-zinc-500">
                  {creatives.length}
                </span>
              </div>
              <div className="space-y-2 p-2">
                {creatives.map((creative) => (
                  <button
                    key={creative.id}
                    type="button"
                    onClick={() => setSelectedCreativeId(creative.id)}
                    className="w-full rounded-lg border border-zinc-200 bg-white p-3 text-left transition-colors hover:border-zinc-400 hover:bg-zinc-50"
                  >
                    <p className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-900">{creative.title}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-zinc-500">{creative.platform}</span>
                      <span className="text-[10px] text-zinc-300">/</span>
                      <span className="text-[10px] font-semibold text-zinc-500">{labelFor(creative.format)}</span>
                    </div>
                    {creative.campaign && <p className="mt-2 truncate text-[11px] text-zinc-400">{creative.campaign}</p>}
                  </button>
                ))}
                {creatives.length === 0 && <p className="px-2 py-4 text-center text-xs text-zinc-400">No creatives</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );

  const calendarView = (
    <div className="flex-1 overflow-y-auto bg-zinc-50/70 p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-5">
        {calendarGroups.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="h-7 w-7 text-zinc-300" />}
            title="No scheduled creatives"
            subtitle="Approve a creative and schedule it to populate the publishing calendar."
          />
        ) : (
          calendarGroups.map(([date, creatives]) => (
            <section key={date} className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
              <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
                <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-600">{date}</h2>
              </div>
              <div className="divide-y divide-zinc-100">
                {creatives.map((creative) => (
                  <button
                    key={creative.id}
                    type="button"
                    onClick={() => setSelectedCreativeId(creative.id)}
                    className="flex w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-zinc-50"
                  >
                    <div className="w-20 shrink-0 font-mono text-xs font-semibold text-zinc-500">
                      {new Date(creative.scheduledFor!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-zinc-900">{creative.title}</p>
                      <p className="mt-1 truncate text-xs text-zinc-500">
                        {creative.platform} / {labelFor(creative.format)}
                      </p>
                    </div>
                    <CreativeStatusPill status={creative.status} />
                  </button>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );

  const assetLibrary = (
    <div className="flex-1 overflow-y-auto bg-zinc-50/70 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">Asset Library</h2>
            <p className="mt-1 text-xs text-zinc-500">Upload production files, preview them, and attach each asset to a creative.</p>
          </div>
          {renderUploadButton()}
        </div>

        {activeAssets.length === 0 ? (
          <EmptyState
            icon={<FolderOpen className="h-7 w-7 text-zinc-300" />}
            title="No creative assets yet"
            subtitle="Upload images, videos, documents, and source files to begin."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {activeAssets.map((asset) => (
              <article key={asset.id} className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
                <div className="aspect-[16/9] border-b border-zinc-200">
                  <AssetPreview asset={asset} />
                </div>
                <div className="space-y-3 p-3">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="truncate text-sm font-semibold text-zinc-900">{asset.title}</h3>
                      <span className="rounded-sm border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-zinc-500">
                        {asset.assetType}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-zinc-400">{asset.fileName}</p>
                    <p className="mt-1 text-[11px] text-zinc-400">{formatBytes(asset.fileSize)}</p>
                  </div>

                  <CustomSelect
                    value={asset.creativeId || ''}
                    onChange={(value) => void setAssetCreative(asset, value || null)}
                    options={[
                      { value: '', label: 'Unattached' },
                      ...creativeItems.map((creative) => ({ value: creative.id, label: creative.title })),
                    ]}
                    triggerClassName="rounded-lg px-3 py-2 text-xs"
                  />

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void openAsset(asset)}
                      disabled={asset.status !== 'active'}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => void archiveAsset(asset)}
                      className="inline-flex items-center justify-center rounded-lg border border-zinc-200 p-2 text-zinc-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                      title="Archive asset"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const creativeEditor = selectedCreative && draft ? (
    <div className="flex flex-1 overflow-hidden bg-white">
      <div className="flex min-w-0 flex-1 flex-col">
        <EditorToolbar
          badge="Creative Editor"
          leftActions={
            <button
              type="button"
              onClick={() => setSelectedCreativeId(null)}
              className="inline-flex items-center justify-center rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
              title="Back to hub"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          }
          rightActions={
            <div className="flex flex-wrap items-center gap-2">
              <CreativeStatusPill status={selectedCreative.status} />
              <button
                type="button"
                onClick={() => void saveCreative()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                <Check className="h-3.5 w-3.5" />
                Save
              </button>
            </div>
          }
        />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl space-y-6 p-5 pb-32 md:p-10">
            <div>
              <textarea
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                rows={1}
                className="w-full resize-none overflow-hidden bg-transparent text-3xl font-bold leading-tight text-zinc-900 outline-none placeholder:text-zinc-300"
                placeholder="Creative title"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <span>{draft.platform}</span>
                <span className="text-zinc-300">/</span>
                <span>{labelFor(draft.format)}</span>
                <span className="text-zinc-300">/</span>
                <span>Updated {formatDate(selectedCreative.updatedAt)}</span>
              </div>
            </div>

            <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Hook</span>
                <textarea
                  value={draft.hook}
                  onChange={(event) => setDraft({ ...draft, hook: event.target.value })}
                  className={textareaClass}
                  placeholder="The sharp first idea the audience should understand."
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Objective</span>
                <textarea
                  value={draft.objective}
                  onChange={(event) => setDraft({ ...draft, objective: event.target.value })}
                  className={textareaClass}
                  placeholder="What this creative is expected to achieve."
                />
              </label>
            </section>

            <label className="block space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Creative Brief</span>
              <textarea
                value={draft.brief}
                onChange={(event) => setDraft({ ...draft, brief: event.target.value })}
                className={`${textareaClass} min-h-[180px]`}
                placeholder="Describe the core angle, sequence, and production requirements."
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Caption / Copy</span>
              <textarea
                value={draft.caption}
                onChange={(event) => setDraft({ ...draft, caption: event.target.value })}
                className={`${textareaClass} min-h-[180px]`}
                placeholder="Write the production-ready caption or post copy."
              />
            </label>

            <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Visual Direction</span>
                <textarea
                  value={draft.visualDirection}
                  onChange={(event) => setDraft({ ...draft, visualDirection: event.target.value })}
                  className={textareaClass}
                  placeholder="Layout, assets, product UI, color, and motion direction."
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Production Notes</span>
                <textarea
                  value={draft.productionNotes}
                  onChange={(event) => setDraft({ ...draft, productionNotes: event.target.value })}
                  className={textareaClass}
                  placeholder="Handoff notes, source links, and revision detail."
                />
              </label>
            </section>

            <label className="block space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">CTA</span>
              <input
                value={draft.cta}
                onChange={(event) => setDraft({ ...draft, cta: event.target.value })}
                className={inputClass}
                placeholder="Call to action"
              />
            </label>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-zinc-900">Attached Assets</h2>
                  <p className="mt-1 text-xs text-zinc-500">Production files linked to this creative.</p>
                </div>
                {renderUploadButton(true)}
              </div>
              {attachedAssets.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center text-xs text-zinc-500">
                  Upload an asset or attach one from the asset library.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {attachedAssets.map((asset) => (
                    <div key={asset.id} className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-2">
                      <div className="h-14 w-16 shrink-0 overflow-hidden rounded border border-zinc-200">
                        <AssetPreview asset={asset} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-zinc-900">{asset.title}</p>
                        <p className="mt-1 text-[11px] text-zinc-400">{formatBytes(asset.fileSize)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void openAsset(asset)}
                          className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                          title="Open asset"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void setAssetCreative(asset, null)}
                          className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          title="Detach asset"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      <InspectorPanel title="Creative Details" icon={PencilLine}>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Platform</label>
          <CustomSelect
            value={draft.platform}
            onChange={(value) => setDraft({ ...draft, platform: value as CreativePlatform })}
            options={PLATFORMS.map((platform) => ({ value: platform, label: platform }))}
            triggerClassName="rounded-lg px-3 py-2 text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Format</label>
          <CustomSelect
            value={draft.format}
            onChange={(value) => setDraft({ ...draft, format: value as CreativeFormat })}
            options={FORMATS.map((format) => ({ value: format, label: labelFor(format) }))}
            triggerClassName="rounded-lg px-3 py-2 text-xs"
          />
        </div>

        <label className="block space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Campaign</span>
          <input value={draft.campaign} onChange={(event) => setDraft({ ...draft, campaign: event.target.value })} className={inputClass} />
        </label>

        <label className="block space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Audience</span>
          <textarea value={draft.audience} onChange={(event) => setDraft({ ...draft, audience: event.target.value })} className={`${textareaClass} min-h-[76px]`} />
        </label>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Owner</label>
          <CustomSelect
            value={draft.ownerId || ''}
            onChange={(value) => setDraft({ ...draft, ownerId: value || null })}
            options={[
              { value: '', label: 'Unassigned' },
              ...workspaceMembers.map((member) => ({ value: member.id, label: member.displayName || member.email })),
            ]}
            triggerClassName="rounded-lg px-3 py-2 text-xs"
          />
        </div>

        <label className="block space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Target Date</span>
          <input
            type="datetime-local"
            value={toLocalDateTime(draft.targetPublishAt)}
            onChange={(event) => setDraft({ ...draft, targetPublishAt: fromLocalDateTime(event.target.value) })}
            className={inputClass}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Tags</span>
          <input
            value={draft.tags.join(', ')}
            onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(',') })}
            className={inputClass}
            placeholder="launch, aura, support"
          />
        </label>

        <div className="h-px bg-zinc-200" />

        <label className="block space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Approval Notes</span>
          <textarea
            value={draft.approvalNotes}
            onChange={(event) => setDraft({ ...draft, approvalNotes: event.target.value })}
            disabled={!isAdmin}
            className={`${textareaClass} min-h-[92px] disabled:bg-zinc-100`}
            placeholder="Feedback for the next review pass."
          />
        </label>

        {isAdmin && selectedCreative.status === 'approved' && (
          <label className="block space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Schedule For</span>
            <input type="datetime-local" value={scheduleValue} onChange={(event) => setScheduleValue(event.target.value)} className={inputClass} />
          </label>
        )}

        <div className="space-y-2">
          {!isAdmin && ['idea', 'brief', 'draft', 'changes-requested'].includes(selectedCreative.status) && (
            <button
              type="button"
              onClick={() => void changeStatus('in-review')}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 px-3 py-2.5 text-xs font-semibold text-white hover:bg-zinc-800"
            >
              <Send className="h-3.5 w-3.5" />
              Submit for review
            </button>
          )}

          {isAdmin && ['idea', 'brief', 'draft', 'changes-requested'].includes(selectedCreative.status) && (
            <button
              type="button"
              onClick={() => void changeStatus('in-review')}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              <Send className="h-3.5 w-3.5" />
              Submit for review
            </button>
          )}

          {isAdmin && selectedCreative.status === 'in-review' && (
            <>
              <button
                type="button"
                onClick={() => void changeStatus('approved')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Approve
              </button>
              <button
                type="button"
                onClick={() => void changeStatus('changes-requested')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
              >
                <MessageSquareText className="h-3.5 w-3.5" />
                Request changes
              </button>
              <button
                type="button"
                onClick={() => void changeStatus('rejected')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                <X className="h-3.5 w-3.5" />
                Reject
              </button>
            </>
          )}

          {isAdmin && selectedCreative.status === 'approved' && (
            <button
              type="button"
              onClick={() => void changeStatus('scheduled')}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2.5 text-xs font-semibold text-white hover:bg-violet-700"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Schedule
            </button>
          )}

          {isAdmin && selectedCreative.status === 'scheduled' && (
            <button
              type="button"
              onClick={() => void changeStatus('published')}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 px-3 py-2.5 text-xs font-semibold text-white hover:bg-zinc-800"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Mark published
            </button>
          )}

          {selectedCreative.status !== 'archived' && (isAdmin || ['idea', 'brief', 'draft', 'in-review', 'changes-requested'].includes(selectedCreative.status)) && (
            <button
              type="button"
              onClick={() => void changeStatus('archived')}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 py-2.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
            >
              <Archive className="h-3.5 w-3.5" />
              Archive
            </button>
          )}
        </div>
      </InspectorPanel>
    </div>
  ) : null;

  return (
    <div className="flex h-full flex-col overflow-hidden border-zinc-200 bg-white text-zinc-950 md:border">
      <StudioHeader
        badge="Creative Hub"
        badgeIcon={<FileImage className="h-3.5 w-3.5" />}
        title="Creative Hub"
        subtitle="Plan, review, schedule, and archive Replofy creative work."
        actions={
          <div className="hidden items-center gap-2 md:flex">
            <SegmentedControl
              value={view}
              onChange={(value) => {
                setView(value as HubView);
                setSelectedCreativeId(null);
              }}
              options={[
                { value: 'pipeline', label: 'Pipeline' },
                { value: 'calendar', label: 'Calendar' },
                { value: 'assets', label: 'Assets' },
              ]}
            />
          </div>
        }
      />

      <div className="border-b border-zinc-200 bg-white px-3 py-3 md:hidden">
        <SegmentedControl
          value={view}
          onChange={(value) => {
            setView(value as HubView);
            setSelectedCreativeId(null);
          }}
          options={[
            { value: 'pipeline', label: 'Pipeline' },
            { value: 'calendar', label: 'Calendar' },
            { value: 'assets', label: 'Assets' },
          ]}
        />
      </div>

      {notice && (
        <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700">
          {notice}
        </div>
      )}
      {error && (
        <div className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="rounded p-1 hover:bg-red-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {selectedCreative ? (
        creativeEditor
      ) : (
        <>
          {view !== 'assets' && (
            <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3">
              <form onSubmit={createCreative} className="relative min-w-[220px] flex-1 md:max-w-sm">
                <Plus className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder="Add creative idea..."
                  className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-xs font-medium text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400"
                />
              </form>
              <div className="min-w-[190px]">
                <SearchInput value={search} onChange={setSearch} placeholder="Search creatives..." />
              </div>
              <CustomSelect
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as 'all' | CreativeStatus)}
                options={[
                  { value: 'all', label: 'All statuses' },
                  ...STATUSES.map((status) => ({ value: status, label: labelFor(status) })),
                ]}
                className="w-[160px]"
                triggerClassName="rounded-lg px-3 py-2 text-xs"
              />
            </div>
          )}

          {view === 'pipeline' && pipelineBoard}
          {view === 'calendar' && calendarView}
          {view === 'assets' && assetLibrary}
        </>
      )}
    </div>
  );
}
