import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Database,
  ExternalLink,
  FileText,
  FolderKanban,
  Newspaper,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Search,
  Settings2,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { db, auth } from '../firebase';
import { useGlobalState } from '../contexts/GlobalStateContext';
import { useUser } from '../contexts/UserContext';
import {
  BlogArticle,
  BlogArticleStatus,
  BlogBrief,
  BlogDistribution,
  BlogEvidence,
  BlogPriority,
  BlogRoadmapPhase,
} from '../types';
import { handleFirestoreError, logFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import {
  BLOG_ARTICLE_STATUSES,
  BLOG_PRIORITIES,
  BLOG_ROADMAP_PHASES,
  createEmptyBlogBrief,
  createEmptyBlogDistribution,
  isActiveBlogArticle,
  isPublishedBlogArticle,
  normalizeBlogArticleStatus,
  readBlogBrief,
  readBlogDistribution,
  readBlogEvidence,
  readBlogTags,
  readLinkedSourceIds,
} from '../utils/blogArticles';
import { EmptyState } from '../components/ui/EmptyState';
import { StudioHeader } from '../components/ui/StudioHeader';
import { EditorToolbar } from '../components/ui/EditorToolbar';
import { EditorArea } from '../components/ui/EditorArea';
import { CustomSelect } from '../components/ui/CustomSelect';

type HubView = 'overview' | 'roadmap';
type WorkspaceTab = 'brief' | 'draft' | 'research' | 'distribution';
type StatusFilter = 'all' | BlogArticleStatus;
type PhaseFilter = 'all' | BlogRoadmapPhase;

const inputClass =
  'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400';
const textareaClass = `${inputClass} min-h-[108px] resize-y leading-relaxed`;

const WORKSPACE_TABS: Array<{ value: WorkspaceTab; label: string; icon: React.ElementType }> = [
  { value: 'brief', label: 'Brief', icon: Target },
  { value: 'draft', label: 'Draft', icon: FileText },
  { value: 'research', label: 'Research', icon: Database },
  { value: 'distribution', label: 'Distribution', icon: BarChart3 },
];

function labelFor(value: string) {
  return value.replace(/-/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatDate(value?: string | null) {
  if (!value) return 'Not set';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Not set' : parsed.toLocaleDateString();
}

function toLocalDate(value?: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function fromLocalDate(value: string) {
  return value ? new Date(`${value}T12:00:00`).toISOString() : null;
}

function summarize(article: BlogArticle) {
  const brief = readBlogBrief(article);
  const values = [
    article.summary,
    brief.thesis,
    brief.painPoint,
    article.content,
    ...readBlogEvidence(article).map((item) => item.claim),
  ];
  return values.find((value) => value?.trim()) || 'No brief captured yet.';
}

function statusClass(status: BlogArticleStatus) {
  switch (status) {
    case 'researching':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'drafting':
      return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'review':
      return 'border-violet-200 bg-violet-50 text-violet-700';
    case 'scheduled':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'published':
      return 'border-zinc-800 bg-zinc-900 text-white';
    case 'rejected':
      return 'border-red-200 bg-red-50 text-red-700';
    case 'archived':
      return 'border-zinc-200 bg-zinc-100 text-zinc-500';
    default:
      return 'border-zinc-200 bg-white text-zinc-600';
  }
}

function priorityClass(priority: BlogPriority) {
  if (priority === 'high') return 'border-red-200 bg-red-50 text-red-700';
  if (priority === 'medium') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-zinc-200 bg-zinc-50 text-zinc-600';
}

function phaseClass(phase: BlogRoadmapPhase) {
  if (phase === 'now') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (phase === 'next') return 'border-violet-200 bg-violet-50 text-violet-700';
  return 'border-zinc-200 bg-zinc-50 text-zinc-600';
}

function isDueSoon(article: BlogArticle) {
  if (!article.targetPublishAt || !isActiveBlogArticle(article)) return false;
  const time = new Date(article.targetPublishAt).getTime();
  return Number.isFinite(time) && time <= Date.now() + 7 * 24 * 60 * 60 * 1000;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-500">{label}</span>
      {hint && <span className="block text-xs leading-relaxed text-zinc-400">{hint}</span>}
      {children}
    </label>
  );
}

function Pill({
  children,
  className = 'border-zinc-200 bg-white text-zinc-600',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${className}`}>
      {children}
    </span>
  );
}

export function BlogStudioPage() {
  const { blogArticles, contextSources, teamMembers } = useGlobalState();
  const { userProfile } = useUser();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [hubView, setHubView] = useState<HubView>('overview');
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('brief');
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(() => searchParams.get('articleId'));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>('all');
  const [newTitle, setNewTitle] = useState('');
  const [newTag, setNewTag] = useState('');
  const [newChannel, setNewChannel] = useState('');
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [editorTitle, setEditorTitle] = useState('');
  const [editorSlug, setEditorSlug] = useState('');
  const [editorSummary, setEditorSummary] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [briefDraft, setBriefDraft] = useState<BlogBrief>(createEmptyBlogBrief);
  const [distributionDraft, setDistributionDraft] = useState<BlogDistribution>(createEmptyBlogDistribution);
  const [targetDate, setTargetDate] = useState('');
  const [evidenceClaim, setEvidenceClaim] = useState('');
  const [evidenceValue, setEvidenceValue] = useState('');
  const [evidenceDrafts, setEvidenceDrafts] = useState<BlogEvidence[]>([]);

  const selectedArticle = useMemo(
    () => blogArticles.find((article) => article.id === selectedArticleId) ?? null,
    [blogArticles, selectedArticleId],
  );

  const filteredArticles = useMemo(() => {
    let result = [...blogArticles];
    if (statusFilter !== 'all') {
      result = result.filter((article) => normalizeBlogArticleStatus(article.status) === statusFilter);
    }
    if (phaseFilter !== 'all') {
      result = result.filter((article) => (article.roadmapPhase || 'next') === phaseFilter);
    }

    const query = search.trim().toLowerCase();
    if (query) {
      result = result.filter((article) => {
        const brief = readBlogBrief(article);
        const distribution = readBlogDistribution(article);
        const haystack = [
          article.title,
          article.slug,
          article.summary,
          article.content,
          ...Object.values(brief),
          distribution.primaryKeyword,
          ...distribution.channels,
          ...readBlogTags(article),
          ...readBlogEvidence(article).flatMap((item) => [item.claim, item.value || '', item.quote || '']),
        ].join(' ').toLowerCase();
        return haystack.includes(query);
      });
    }

    return result.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  }, [blogArticles, phaseFilter, search, statusFilter]);

  const activeArticles = useMemo(() => blogArticles.filter(isActiveBlogArticle), [blogArticles]);
  const publishedArticles = useMemo(() => blogArticles.filter(isPublishedBlogArticle), [blogArticles]);
  const dueSoonArticles = useMemo(() => activeArticles.filter(isDueSoon), [activeArticles]);
  const missingEvidenceArticles = useMemo(
    () => activeArticles.filter((article) => readBlogEvidence(article).length === 0),
    [activeArticles],
  );
  const clusters = useMemo(() => {
    const counts = new Map<string, number>();
    blogArticles.forEach((article) => {
      const cluster = readBlogBrief(article).contentCluster.trim() || 'Uncategorized';
      counts.set(cluster, (counts.get(cluster) || 0) + 1);
    });
    return [...counts.entries()].sort((left, right) => right[1] - left[1]);
  }, [blogArticles]);

  useEffect(() => {
    if (!selectedArticleId || blogArticles.length === 0 || selectedArticle) return;
    const params = new URLSearchParams(searchParams);
    params.delete('articleId');
    setSearchParams(params, { replace: true });
    setSelectedArticleId(null);
  }, [blogArticles.length, searchParams, selectedArticle, selectedArticleId, setSearchParams]);

  useEffect(() => {
    const articleId = searchParams.get('articleId');
    if (articleId === selectedArticleId) return;
    if (!articleId || blogArticles.some((article) => article.id === articleId)) {
      setSelectedArticleId(articleId);
    }
  }, [blogArticles, searchParams, selectedArticleId]);

  const openArticle = (articleId: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('articleId', articleId);
    setSearchParams(params, { replace: true });
    setSelectedArticleId(articleId);
  };

  const closeArticle = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('articleId');
    setSearchParams(params, { replace: true });
    setSelectedArticleId(null);
  };

  useEffect(() => {
    if (!selectedArticle) return;
    setEditorTitle(selectedArticle.title);
    setEditorSlug(selectedArticle.slug);
    setEditorSummary(selectedArticle.summary);
    setEditorContent(selectedArticle.content);
    setBriefDraft(readBlogBrief(selectedArticle));
    setDistributionDraft(readBlogDistribution(selectedArticle));
    setTargetDate(toLocalDate(selectedArticle.targetPublishAt));
    setEvidenceDrafts(readBlogEvidence(selectedArticle));
    setDeleteError(null);
    setMessage(null);
  }, [selectedArticle]);

  const updateArticle = async (patch: Record<string, unknown>, successMessage?: string) => {
    if (!selectedArticle) return;
    try {
      await updateDoc(doc(db, 'blogArticles', selectedArticle.id), {
        ...patch,
        updatedAt: new Date().toISOString(),
      });
      if (successMessage) setMessage(successMessage);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `blogArticles/${selectedArticle.id}`);
      setMessage('Unable to save this article.');
    }
  };

  const createArticle = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!auth.currentUser || !newTitle.trim()) return;
    const now = new Date().toISOString();
    try {
      const article = await addDoc(collection(db, 'blogArticles'), {
        title: newTitle.trim(),
        slug: slugify(newTitle),
        summary: '',
        content: '',
        status: 'idea',
        roadmapPhase: 'next',
        priority: 'medium',
        ownerId: auth.currentUser.uid,
        targetPublishAt: null,
        scheduledFor: null,
        brief: createEmptyBlogBrief(),
        evidence: [],
        linkedSourceIds: [],
        distribution: createEmptyBlogDistribution(),
        tags: [],
        dataPoints: [],
        docLinks: [],
        validationNotes: [],
        validatedAt: null,
        publishedAt: null,
        rejectedAt: null,
        createdAt: now,
        updatedAt: now,
        authorId: auth.currentUser.uid,
        companyId: userProfile?.companyId ?? null,
      });
      setNewTitle('');
      openArticle(article.id);
      setWorkspaceTab('brief');
      setMessage('Article idea captured.');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'blogArticles');
    }
  };

  const saveEditor = async () => {
    if (!selectedArticle || !editorTitle.trim()) return;
    const patch: Record<string, unknown> = {};
    if (editorTitle.trim() !== selectedArticle.title) patch.title = editorTitle.trim();
    if (editorSlug.trim() !== selectedArticle.slug) patch.slug = editorSlug.trim() || slugify(editorTitle);
    if (editorSummary !== selectedArticle.summary) patch.summary = editorSummary;
    if (editorContent !== selectedArticle.content) patch.content = editorContent;
    if (Object.keys(patch).length > 0) await updateArticle(patch, 'Draft saved.');
  };

  const saveBrief = async () => {
    if (!selectedArticle) return;
    await updateArticle({ brief: briefDraft }, 'Brief saved.');
  };

  const saveDistribution = async () => {
    if (!selectedArticle) return;
    await updateArticle({ distribution: distributionDraft }, 'Distribution plan saved.');
  };

  const saveTargetDate = async () => {
    await updateArticle({ targetPublishAt: fromLocalDate(targetDate) }, 'Target date saved.');
  };

  const changeStatus = async (status: BlogArticleStatus) => {
    if (!selectedArticle) return;
    if (status === 'scheduled' && !selectedArticle.targetPublishAt) {
      setMessage('Choose a target publish date before scheduling.');
      return;
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status };
    if (status === 'review') patch.validatedAt = selectedArticle.validatedAt ?? now;
    if (status === 'scheduled') {
      patch.validatedAt = selectedArticle.validatedAt ?? now;
      patch.scheduledFor = selectedArticle.targetPublishAt;
      patch.rejectedAt = null;
    }
    if (status === 'published') {
      patch.validatedAt = selectedArticle.validatedAt ?? now;
      patch.publishedAt = selectedArticle.publishedAt ?? now;
      patch.rejectedAt = null;
    }
    if (status === 'rejected') {
      patch.rejectedAt = now;
      patch.publishedAt = null;
      patch.scheduledFor = null;
    }
    if (!['rejected', 'archived'].includes(status)) patch.rejectedAt = null;
    await updateArticle(patch, `${labelFor(status)} status applied.`);
  };

  const deleteArticle = async () => {
    if (!selectedArticle || !window.confirm(`Delete "${selectedArticle.title}"? This cannot be undone.`)) return;
    const articleId = selectedArticle.id;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'blogArticles', articleId));
      const params = new URLSearchParams(searchParams);
      params.delete('articleId');
      setSearchParams(params, { replace: true });
      setSelectedArticleId(null);
    } catch (error) {
      logFirestoreError(error, OperationType.DELETE, `blogArticles/${articleId}`);
      setDeleteError('Unable to delete this article. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSource = async (sourceId: string) => {
    if (!selectedArticle) return;
    const linkedSourceIds = readLinkedSourceIds(selectedArticle);
    const next = linkedSourceIds.includes(sourceId)
      ? linkedSourceIds.filter((id) => id !== sourceId)
      : [...linkedSourceIds, sourceId];
    await updateArticle({ linkedSourceIds: next }, 'Research sources updated.');
  };

  const addEvidence = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedArticle || !evidenceClaim.trim()) return;
    const evidence: BlogEvidence = {
      id: createId(),
      claim: evidenceClaim.trim(),
      value: evidenceValue.trim(),
      confidence: 'unverified',
      usedInDraft: false,
    };
    const next = [...evidenceDrafts, evidence];
    setEvidenceDrafts(next);
    await updateArticle({ evidence: next }, 'Evidence added.');
    setEvidenceClaim('');
    setEvidenceValue('');
  };

  const updateEvidence = async (evidenceId: string, patch: Partial<BlogEvidence>) => {
    if (!selectedArticle) return;
    const evidence = evidenceDrafts.map((item) => item.id === evidenceId ? { ...item, ...patch } : item);
    setEvidenceDrafts(evidence);
    await updateArticle({ evidence });
  };

  const removeEvidence = async (evidenceId: string) => {
    if (!selectedArticle) return;
    const evidence = evidenceDrafts.filter((item) => item.id !== evidenceId);
    setEvidenceDrafts(evidence);
    await updateArticle({ evidence }, 'Evidence removed.');
  };

  const addTag = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedArticle || !newTag.trim()) return;
    const tags = Array.from(new Set([...readBlogTags(selectedArticle), newTag.trim()]));
    await updateArticle({ tags });
    setNewTag('');
  };

  const removeTag = async (tag: string) => {
    if (!selectedArticle) return;
    await updateArticle({ tags: readBlogTags(selectedArticle).filter((item) => item !== tag) });
  };

  const addChannel = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newChannel.trim()) return;
    const channels = Array.from(new Set([...distributionDraft.channels, newChannel.trim()]));
    const next = { ...distributionDraft, channels };
    setDistributionDraft(next);
    await updateArticle({ distribution: next }, 'Distribution channels updated.');
    setNewChannel('');
  };

  const removeChannel = async (channel: string) => {
    const next = { ...distributionDraft, channels: distributionDraft.channels.filter((item) => item !== channel) };
    setDistributionDraft(next);
    await updateArticle({ distribution: next });
  };

  const openHubView = (view: HubView) => {
    closeArticle();
    setHubView(view);
  };

  const linkedSources = selectedArticle
    ? contextSources.filter((source) => readLinkedSourceIds(selectedArticle).includes(source.id))
    : [];
  const evidence = evidenceDrafts;
  const tags = selectedArticle ? readBlogTags(selectedArticle) : [];
  const normalizedStatus = selectedArticle ? normalizeBlogArticleStatus(selectedArticle.status) : 'idea';

  return (
    <div className="flex h-full overflow-hidden bg-white text-zinc-900">
      <aside className={`w-full shrink-0 border-r border-zinc-200 bg-zinc-50/60 md:flex md:w-[340px] md:flex-col ${selectedArticleId ? 'hidden' : 'flex flex-col'}`}>
        <div className="border-b border-zinc-200 bg-white px-5 py-4">
          <div className="mb-3 flex items-center gap-2">
            <Newspaper className="h-4 w-4 text-zinc-500" />
            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-500">Blogs Hub</span>
          </div>
          <h1 className="text-xl font-black tracking-tight text-zinc-950">Editorial roadmap</h1>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">Plan evidence-backed articles and move them to publication.</p>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-zinc-200 bg-white px-4 py-3">
          {([
            ['overview', 'Overview', BarChart3],
            ['roadmap', 'Roadmap', FolderKanban],
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => openHubView(value)}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition ${
                !selectedArticleId && hubView === value
                  ? 'border-zinc-900 bg-zinc-900 text-white'
                  : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-2 border-b border-zinc-200 bg-white p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search articles..." className={`${inputClass} py-2 pl-9 text-xs`} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <CustomSelect
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as StatusFilter)}
              options={[{ value: 'all', label: 'All statuses' }, ...BLOG_ARTICLE_STATUSES.map((status) => ({ value: status, label: labelFor(status) }))]}
              triggerClassName="rounded-lg px-3 py-2 text-xs"
            />
            <CustomSelect
              value={phaseFilter}
              onChange={(value) => setPhaseFilter(value as PhaseFilter)}
              options={[{ value: 'all', label: 'All phases' }, ...BLOG_ROADMAP_PHASES.map((phase) => ({ value: phase, label: labelFor(phase) }))]}
              triggerClassName="rounded-lg px-3 py-2 text-xs"
            />
          </div>
          <form onSubmit={createArticle} className="relative">
            <Plus className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Capture article idea... [Enter]" className={`${inputClass} py-2 pl-9 text-xs`} />
          </form>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredArticles.length === 0 ? (
            <EmptyState icon={<FileText className="h-6 w-6 text-zinc-300" />} title="No articles found" subtitle="Capture an idea or adjust the filters." />
          ) : (
            filteredArticles.map((article) => {
              const status = normalizeBlogArticleStatus(article.status);
              return (
                <button
                  key={article.id}
                  type="button"
                  onClick={() => openArticle(article.id)}
                  className={`w-full border-b border-zinc-200 border-l-2 px-4 py-3 text-left transition ${
                    selectedArticleId === article.id ? 'border-l-zinc-900 bg-white' : 'border-l-transparent hover:bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-xs font-bold leading-relaxed text-zinc-800">{article.title}</span>
                    <Pill className={priorityClass(article.priority || 'medium')}>{article.priority || 'medium'}</Pill>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">{summarize(article)}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Pill className={statusClass(status)}>{labelFor(status)}</Pill>
                    <Pill className={phaseClass(article.roadmapPhase || 'next')}>{article.roadmapPhase || 'next'}</Pill>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <main className={`min-w-0 flex-1 overflow-hidden ${selectedArticleId ? 'flex' : 'hidden md:flex'}`}>
        {selectedArticle ? (
          <div className="flex min-w-0 flex-1">
            <section className={`flex min-w-0 flex-1 flex-col ${showRightPanel ? 'border-r border-zinc-200' : ''}`}>
              <EditorToolbar
                badge="Article Workspace"
                leftActions={
                  <button type="button" onClick={closeArticle} className="rounded p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                }
                rightActions={
                  <>
                    <CustomSelect
                      value={normalizedStatus}
                      onChange={(value) => void changeStatus(value as BlogArticleStatus)}
                      options={BLOG_ARTICLE_STATUSES.map((status) => ({ value: status, label: labelFor(status) }))}
                      className="w-[142px]"
                      triggerClassName="rounded-lg px-3 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => void deleteArticle()}
                      disabled={isDeleting}
                      title="Delete article"
                      className="rounded border border-red-200 bg-white p-1.5 text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRightPanel(!showRightPanel)}
                      title="Toggle article metadata"
                      className="rounded border border-zinc-200 bg-white p-1.5 text-zinc-600 transition hover:bg-zinc-100"
                    >
                      {showRightPanel ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                    </button>
                  </>
                }
              />

              <div className="flex gap-1 overflow-x-auto border-b border-zinc-200 bg-white px-4 py-2">
                {WORKSPACE_TABS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setWorkspaceTab(value)}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition ${
                      workspaceTab === value ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {message && (
                <div className="border-b border-zinc-200 bg-zinc-50 px-6 py-2 text-xs font-semibold text-zinc-600">
                  {message}
                </div>
              )}

              {workspaceTab === 'draft' && (
                <EditorArea
                  title={editorTitle}
                  onTitleChange={setEditorTitle}
                  onTitleBlur={() => void saveEditor()}
                  titlePlaceholder="Article title"
                  content={editorContent}
                  onContentChange={setEditorContent}
                  onContentBlur={() => void saveEditor()}
                  contentPlaceholder="Write the article draft here. Markdown is supported..."
                />
              )}

              {workspaceTab === 'brief' && (
                <div className="flex-1 overflow-y-auto">
                  <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-10">
                    <div>
                      <Pill className={statusClass(normalizedStatus)}>{labelFor(normalizedStatus)}</Pill>
                      <h2 className="mt-3 text-2xl font-black tracking-tight text-zinc-950">{selectedArticle.title}</h2>
                      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">Capture the strategic argument before drafting. These fields give the article a clear reader, pain point, and reason to exist.</p>
                    </div>
                    <div className="grid gap-5 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-5 md:grid-cols-2">
                      <Field label="Target reader"><input value={briefDraft.audience} onChange={(event) => setBriefDraft({ ...briefDraft, audience: event.target.value })} onBlur={() => void saveBrief()} placeholder="Founder, Head of Support, CX leader..." className={inputClass} /></Field>
                      <Field label="Content cluster"><input value={briefDraft.contentCluster} onChange={(event) => setBriefDraft({ ...briefDraft, contentCluster: event.target.value })} onBlur={() => void saveBrief()} placeholder="AI operations, support quality..." className={inputClass} /></Field>
                      <Field label="Pain point"><textarea value={briefDraft.painPoint} onChange={(event) => setBriefDraft({ ...briefDraft, painPoint: event.target.value })} onBlur={() => void saveBrief()} placeholder="What is visibly broken for this reader?" className={textareaClass} /></Field>
                      <Field label="Buying trigger"><textarea value={briefDraft.buyingTrigger} onChange={(event) => setBriefDraft({ ...briefDraft, buyingTrigger: event.target.value })} onBlur={() => void saveBrief()} placeholder="Why does the reader care now?" className={textareaClass} /></Field>
                      <Field label="Broken belief or enemy"><textarea value={briefDraft.brokenBelief} onChange={(event) => setBriefDraft({ ...briefDraft, brokenBelief: event.target.value })} onBlur={() => void saveBrief()} placeholder="Which flawed assumption should the article challenge?" className={textareaClass} /></Field>
                      <Field label="Replofy angle"><textarea value={briefDraft.replofyAngle} onChange={(event) => setBriefDraft({ ...briefDraft, replofyAngle: event.target.value })} onBlur={() => void saveBrief()} placeholder="How does this connect naturally to Replofy?" className={textareaClass} /></Field>
                      <Field label="Thesis"><textarea value={briefDraft.thesis} onChange={(event) => setBriefDraft({ ...briefDraft, thesis: event.target.value })} onBlur={() => void saveBrief()} placeholder="What should the article prove?" className={textareaClass} /></Field>
                      <Field label="CTA"><textarea value={briefDraft.cta} onChange={(event) => setBriefDraft({ ...briefDraft, cta: event.target.value })} onBlur={() => void saveBrief()} placeholder="What should the reader do next?" className={textareaClass} /></Field>
                    </div>
                  </div>
                </div>
              )}

              {workspaceTab === 'research' && (
                <div className="flex-1 overflow-y-auto">
                  <div className="mx-auto max-w-5xl space-y-8 p-6 md:p-10">
                    <section>
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                        <div>
                          <h2 className="text-xl font-black tracking-tight text-zinc-950">Linked documents</h2>
                          <p className="mt-1 text-sm text-zinc-500">Attach real sources from Content Studio. Linked documents remain versioned and reusable.</p>
                        </div>
                        <button type="button" onClick={() => navigate('/content')} className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50">
                          <BookOpen className="h-3.5 w-3.5" />
                          Open docs library
                        </button>
                      </div>
                      <div className="mt-4 grid gap-3 lg:grid-cols-2">
                        {contextSources.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm text-zinc-500">No documents exist yet. Upload source material in Content Studio first.</div>
                        ) : (
                          contextSources.map((source) => {
                            const isLinked = readLinkedSourceIds(selectedArticle).includes(source.id);
                            return (
                              <div key={source.id} className={`rounded-xl border p-4 transition ${isLinked ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 bg-white'}`}>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                                      <h3 className="truncate text-sm font-bold text-zinc-800">{source.title}</h3>
                                    </div>
                                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-500">{source.latestSummary || source.latestFileName}</p>
                                    <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">v{source.latestVersion} · {source.latestFileName}</p>
                                  </div>
                                  <button type="button" onClick={() => void toggleSource(source.id)} className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition ${isLinked ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400'}`}>
                                    {isLinked ? 'Linked' : 'Attach'}
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </section>

                    <section>
                      <div>
                        <h2 className="text-xl font-black tracking-tight text-zinc-950">Evidence cards</h2>
                        <p className="mt-1 text-sm text-zinc-500">Track claims, quotes, values, confidence, and the source behind each assertion.</p>
                      </div>
                      <form onSubmit={addEvidence} className="mt-4 grid gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4 md:grid-cols-[1fr_180px_auto]">
                        <input value={evidenceClaim} onChange={(event) => setEvidenceClaim(event.target.value)} placeholder="Add a claim or evidence point..." className={inputClass} />
                        <input value={evidenceValue} onChange={(event) => setEvidenceValue(event.target.value)} placeholder="Value, metric, or signal" className={inputClass} />
                        <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-zinc-700">Add evidence</button>
                      </form>
                      <div className="mt-4 space-y-3">
                        {evidence.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm text-zinc-500">No evidence captured. Add the first claim before moving this article into review.</div>
                        ) : (
                          evidence.map((item) => (
                            <article key={item.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                              <div className="flex items-start justify-between gap-3">
                                <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-2">
                                  <Field label="Claim"><textarea defaultValue={item.claim} onBlur={(event) => void updateEvidence(item.id, { claim: event.target.value })} className={textareaClass} /></Field>
                                  <Field label="Value or metric"><input defaultValue={item.value} onBlur={(event) => void updateEvidence(item.id, { value: event.target.value })} placeholder="Optional" className={inputClass} /></Field>
                                  <Field label="Source document">
                                    <CustomSelect
                                      value={item.sourceId || ''}
                                      onChange={(value) => void updateEvidence(item.id, { sourceId: value || undefined })}
                                      options={[{ value: '', label: 'No linked document' }, ...linkedSources.map((source) => ({ value: source.id, label: source.title }))]}
                                      triggerClassName="rounded-lg px-3 py-2 text-sm"
                                    />
                                  </Field>
                                  <Field label="Source URL"><input defaultValue={item.sourceUrl} onBlur={(event) => void updateEvidence(item.id, { sourceUrl: event.target.value })} placeholder="https://..." className={inputClass} /></Field>
                                  <Field label="Quote or supporting note"><textarea defaultValue={item.quote} onBlur={(event) => void updateEvidence(item.id, { quote: event.target.value })} placeholder="Optional excerpt or note" className={textareaClass} /></Field>
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <Field label="Confidence">
                                      <CustomSelect
                                        value={item.confidence}
                                        onChange={(value) => void updateEvidence(item.id, { confidence: value as BlogEvidence['confidence'] })}
                                        options={['unverified', 'supported', 'verified'].map((value) => ({ value, label: labelFor(value) }))}
                                        triggerClassName="rounded-lg px-3 py-2 text-sm"
                                      />
                                    </Field>
                                    <label className="flex items-center gap-2 self-end rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-bold text-zinc-600">
                                      <input type="checkbox" checked={item.usedInDraft} onChange={(event) => void updateEvidence(item.id, { usedInDraft: event.target.checked })} />
                                      Used in draft
                                    </label>
                                  </div>
                                </div>
                                <button type="button" onClick={() => void removeEvidence(item.id)} title="Remove evidence" className="rounded p-1.5 text-zinc-400 transition hover:bg-red-50 hover:text-red-600">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </article>
                          ))
                        )}
                      </div>
                    </section>

                    {(selectedArticle.docLinks || []).length > 0 && (
                      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                        <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Legacy references</h3>
                        <p className="mt-1 text-xs leading-relaxed text-amber-700">These text links came from the old editor. Attach matching documents above as the article is updated.</p>
                        <div className="mt-3 space-y-1">
                          {(selectedArticle.docLinks || []).map((link) => <p key={link} className="break-all text-xs text-amber-800">{link}</p>)}
                        </div>
                      </section>
                    )}
                  </div>
                </div>
              )}

              {workspaceTab === 'distribution' && (
                <div className="flex-1 overflow-y-auto">
                  <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-10">
                    <div>
                      <h2 className="text-xl font-black tracking-tight text-zinc-950">Distribution plan</h2>
                      <p className="mt-1 text-sm text-zinc-500">Prepare the article for search, publication, and channel reuse.</p>
                    </div>
                    <div className="grid gap-5 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-5 md:grid-cols-2">
                      <Field label="SEO title"><input value={distributionDraft.seoTitle} onChange={(event) => setDistributionDraft({ ...distributionDraft, seoTitle: event.target.value })} onBlur={() => void saveDistribution()} placeholder="Search-friendly article title" className={inputClass} /></Field>
                      <Field label="Primary keyword"><input value={distributionDraft.primaryKeyword} onChange={(event) => setDistributionDraft({ ...distributionDraft, primaryKeyword: event.target.value })} onBlur={() => void saveDistribution()} placeholder="support automation" className={inputClass} /></Field>
                      <Field label="Meta description"><textarea value={distributionDraft.metaDescription} onChange={(event) => setDistributionDraft({ ...distributionDraft, metaDescription: event.target.value })} onBlur={() => void saveDistribution()} placeholder="Search result description" className={textareaClass} /></Field>
                      <Field label="Publication URL"><input value={distributionDraft.publicationUrl} onChange={(event) => setDistributionDraft({ ...distributionDraft, publicationUrl: event.target.value })} onBlur={() => void saveDistribution()} placeholder="https://replofy.com/blog/..." className={inputClass} /></Field>
                    </div>
                    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
                      <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Distribution channels</h3>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {distributionDraft.channels.length === 0 && <span className="text-sm text-zinc-400">No channels planned.</span>}
                        {distributionDraft.channels.map((channel) => (
                          <span key={channel} className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-bold text-zinc-600">
                            {channel}
                            <button type="button" onClick={() => void removeChannel(channel)}><X className="h-3 w-3" /></button>
                          </span>
                        ))}
                      </div>
                      <form onSubmit={addChannel} className="mt-3 flex gap-2">
                        <input value={newChannel} onChange={(event) => setNewChannel(event.target.value)} placeholder="LinkedIn, newsletter, X thread..." className={inputClass} />
                        <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-bold text-white">Add</button>
                      </form>
                    </section>
                  </div>
                </div>
              )}
            </section>

            {showRightPanel && (
              <aside className="hidden w-[310px] shrink-0 overflow-y-auto bg-zinc-50 xl:block">
                <div className="sticky top-0 border-b border-zinc-200 bg-zinc-50 px-5 py-4">
                  <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-600">
                    <Settings2 className="h-3.5 w-3.5" />
                    Article controls
                  </h3>
                </div>
                <div className="space-y-5 p-5">
                  <Field label="Roadmap phase">
                    <CustomSelect
                      value={selectedArticle.roadmapPhase || 'next'}
                      onChange={(value) => void updateArticle({ roadmapPhase: value }, 'Roadmap phase updated.')}
                      options={BLOG_ROADMAP_PHASES.map((phase) => ({ value: phase, label: labelFor(phase) }))}
                      triggerClassName="rounded-lg px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Priority">
                    <CustomSelect
                      value={selectedArticle.priority || 'medium'}
                      onChange={(value) => void updateArticle({ priority: value }, 'Priority updated.')}
                      options={BLOG_PRIORITIES.map((priority) => ({ value: priority, label: labelFor(priority) }))}
                      triggerClassName="rounded-lg px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Owner">
                    <CustomSelect
                      value={selectedArticle.ownerId || ''}
                      onChange={(value) => void updateArticle({ ownerId: value || null }, 'Owner updated.')}
                      options={[
                        { value: '', label: 'Unassigned' },
                        ...(userProfile ? [{ value: userProfile.id, label: userProfile.displayName || userProfile.email }] : []),
                        ...teamMembers.filter((member) => member.id !== userProfile?.id).map((member) => ({ value: member.id, label: member.displayName || member.email })),
                      ]}
                      triggerClassName="rounded-lg px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Target publish date"><input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} onBlur={() => void saveTargetDate()} className={inputClass} /></Field>
                  <div className="h-px bg-zinc-200" />
                  <Field label="URL slug">
                    <div className="flex items-center rounded-lg border border-zinc-200 bg-white px-2 focus-within:border-zinc-400">
                      <span className="text-xs font-mono text-zinc-400">/</span>
                      <input value={editorSlug} onChange={(event) => setEditorSlug(event.target.value)} onBlur={() => void saveEditor()} placeholder="article-slug" className="min-w-0 flex-1 bg-transparent px-1 py-2 text-xs font-mono text-zinc-700 outline-none" />
                    </div>
                  </Field>
                  <Field label="Meta summary"><textarea value={editorSummary} onChange={(event) => setEditorSummary(event.target.value)} onBlur={() => void saveEditor()} placeholder="Short article summary" className={textareaClass} /></Field>
                  <div>
                    <span className="block text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-500">Tags</span>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {tags.length === 0 && <span className="text-xs text-zinc-400">No tags yet.</span>}
                      {tags.map((tag) => (
                        <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-1 text-xs font-bold text-zinc-600">
                          {tag}
                          <button type="button" onClick={() => void removeTag(tag)}><X className="h-3 w-3" /></button>
                        </span>
                      ))}
                    </div>
                    <form onSubmit={addTag} className="mt-2">
                      <input value={newTag} onChange={(event) => setNewTag(event.target.value)} placeholder="Add tag... [Enter]" className={`${inputClass} text-xs`} />
                    </form>
                  </div>
                  <div className="h-px bg-zinc-200" />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center">
                      <div className="text-xl font-black text-zinc-900">{evidence.length}</div>
                      <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">Evidence</div>
                    </div>
                    <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center">
                      <div className="text-xl font-black text-zinc-900">{linkedSources.length}</div>
                      <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">Sources</div>
                    </div>
                  </div>
                  <div className="space-y-1 rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-500">
                    <p className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5" /> Target: {formatDate(selectedArticle.targetPublishAt)}</p>
                    <p className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5" /> Published: {formatDate(selectedArticle.publishedAt)}</p>
                    {distributionDraft.publicationUrl && (
                      <a href={distributionDraft.publicationUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 font-bold text-zinc-700 hover:underline">
                        <ExternalLink className="h-3.5 w-3.5" /> Open published article
                      </a>
                    )}
                  </div>
                  {deleteError && <p className="text-xs font-semibold text-red-600">{deleteError}</p>}
                </div>
              </aside>
            )}
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col bg-zinc-50/60">
            <StudioHeader
              badge="Blogs Hub"
              badgeIcon={<Newspaper className="h-3.5 w-3.5" />}
              title={hubView === 'overview' ? 'Editorial overview' : 'Publishing roadmap'}
              subtitle={hubView === 'overview' ? 'See production health, content gaps, and the work that needs attention.' : 'Plan what ships now, what comes next, and what remains in the backlog.'}
            />
            <div className="flex-1 overflow-y-auto p-5 md:p-8">
              {hubView === 'overview' ? (
                <div className="mx-auto max-w-6xl space-y-6">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      ['Active pipeline', activeArticles.length, 'Articles currently moving'],
                      ['Published', publishedArticles.length, 'Articles shipped'],
                      ['Due within 7 days', dueSoonArticles.length, 'Need publishing attention'],
                      ['Missing evidence', missingEvidenceArticles.length, 'Need research before review'],
                    ].map(([label, value, subtitle]) => (
                      <div key={label} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">{label}</p>
                        <p className="mt-3 text-3xl font-black tracking-tight text-zinc-950">{value}</p>
                        <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
                      </div>
                    ))}
                  </div>

                  <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                    <div>
                      <h2 className="text-base font-black text-zinc-900">Pipeline health</h2>
                      <p className="mt-1 text-xs text-zinc-500">The editorial workflow now follows real production steps.</p>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                      {BLOG_ARTICLE_STATUSES.filter((status) => !['archived', 'rejected'].includes(status)).map((status) => {
                        const count = blogArticles.filter((article) => normalizeBlogArticleStatus(article.status) === status).length;
                        return (
                          <button key={status} type="button" onClick={() => { setStatusFilter(status); setHubView('roadmap'); }} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-left transition hover:border-zinc-400">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">{labelFor(status)}</p>
                            <p className="mt-2 text-2xl font-black text-zinc-900">{count}</p>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
                    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                      <h2 className="text-base font-black text-zinc-900">Needs attention</h2>
                      <div className="mt-4 space-y-2">
                        {[...dueSoonArticles, ...missingEvidenceArticles.filter((article) => !dueSoonArticles.includes(article))].slice(0, 8).map((article) => (
                          <button key={article.id} type="button" onClick={() => openArticle(article.id)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-200 px-4 py-3 text-left transition hover:bg-zinc-50">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-zinc-800">{article.title}</p>
                              <p className="mt-1 text-xs text-zinc-500">{isDueSoon(article) ? `Target: ${formatDate(article.targetPublishAt)}` : 'No evidence cards attached'}</p>
                            </div>
                            <Pill className={statusClass(normalizeBlogArticleStatus(article.status))}>{labelFor(normalizeBlogArticleStatus(article.status))}</Pill>
                          </button>
                        ))}
                        {dueSoonArticles.length === 0 && missingEvidenceArticles.length === 0 && <p className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">No immediate editorial gaps.</p>}
                      </div>
                    </section>
                    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                      <h2 className="text-base font-black text-zinc-900">Content clusters</h2>
                      <div className="mt-4 space-y-2">
                        {clusters.length === 0 ? <p className="text-sm text-zinc-500">No clusters captured yet.</p> : clusters.slice(0, 8).map(([cluster, count]) => (
                          <div key={cluster} className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                            <span className="text-xs font-bold text-zinc-700">{cluster}</span>
                            <span className="text-xs font-black text-zinc-900">{count}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
              ) : (
                <div className="mx-auto grid max-w-6xl gap-4 xl:grid-cols-3">
                  {BLOG_ROADMAP_PHASES.map((phase) => {
                    const articles = filteredArticles.filter((article) => (article.roadmapPhase || 'next') === phase);
                    return (
                      <section key={phase} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div>
                            <Pill className={phaseClass(phase)}>{phase}</Pill>
                            <h2 className="mt-2 text-base font-black text-zinc-900">{phase === 'now' ? 'Publishing now' : phase === 'next' ? 'Up next' : 'Later backlog'}</h2>
                          </div>
                          <span className="text-2xl font-black text-zinc-300">{articles.length}</span>
                        </div>
                        <div className="mt-4 space-y-3">
                          {articles.length === 0 && <p className="rounded-xl border border-dashed border-zinc-300 p-4 text-xs text-zinc-500">No articles in this phase.</p>}
                          {articles.map((article) => {
                            const status = normalizeBlogArticleStatus(article.status);
                            return (
                              <button key={article.id} type="button" onClick={() => openArticle(article.id)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-left transition hover:border-zinc-400 hover:bg-white">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-sm font-bold leading-relaxed text-zinc-800">{article.title}</p>
                                  <Pill className={priorityClass(article.priority || 'medium')}>{article.priority || 'medium'}</Pill>
                                </div>
                                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-500">{summarize(article)}</p>
                                <div className="mt-3 flex items-center justify-between gap-2">
                                  <Pill className={statusClass(status)}>{labelFor(status)}</Pill>
                                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">{formatDate(article.targetPublishAt)}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
