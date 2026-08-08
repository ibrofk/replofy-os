import React, { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  AlertCircle,
  ArrowUpRight,
  Bold,
  ClipboardPaste,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Code2,
  FilePenLine,
  FileUp,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  LoaderCircle,
  Menu,
  Minus,
  Plus,
  Quote,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth, db } from '../firebase';
import { useGlobalState } from '../contexts/GlobalStateContext';
import { useUser } from '../contexts/UserContext';
import {
  ApiEndpoint,
  BlogArticle,
  BusinessPlan,
  BusinessPlanBlockType,
  BusinessPlanEditingSession,
  BusinessPlanLink,
  BusinessPlanLinkType,
  BusinessPlanStatus,
  ContextSource,
  CycleGoal,
  EnvironmentState,
  Feedback,
  Prompt,
  SocialPost,
  Task,
  TimeBlock,
  UserProfile,
  Vision,
} from '../types';
import { EmptyState } from '../components/ui/EmptyState';
import { FilterBar } from '../components/ui/FilterBar';
import { ListItem } from '../components/ui/ListItem';
import { SearchInput } from '../components/ui/SearchInput';
import { StudioHeader } from '../components/ui/StudioHeader';
import { CustomSelect } from '../components/ui/CustomSelect';
import { RichTextEditor } from '../components/ui/RichTextEditor';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { logFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import {
  BUSINESS_PLAN_TEMPLATE_SUMMARY,
  BUSINESS_PLAN_TEMPLATE_TAGS,
  BUSINESS_PLAN_TEMPLATE_TITLE,
  BUSINESS_PLAN_REQUIRED_SECTIONS,
  createBusinessPlanTemplate,
} from '../utils/businessPlanTemplate';
import {
  buildBusinessPlanRecord,
  BusinessPlanEditorBlock,
  countWordsFromBlocks,
  createBusinessPlanEditorId,
  createParagraphBlock,
  extractOutlineFromBlocks,
  findInlineCardLinkIds,
  insertBlockAfter,
  normalizeImportedBusinessPlanDraft,
  normalizeBusinessPlan,
  normalizeBusinessPlanEditingSession,
  normalizeLineBreaks,
  parseBusinessPlanBlocks,
  reconcileEditorBlocks,
  removeBlockById,
  renderBlockPreviewHtml,
  renderInlineMarkdown,
  replaceBlockById,
  sanitizeBusinessPlanBlocks,
  serializeBusinessPlanBlocks,
  toBusinessPlanBlockMap,
} from '../utils/businessPlanBlocks';

const STATUS_OPTIONS: Array<{ value: BusinessPlanStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'review', label: 'Review' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

const STATUS_BADGE_VARIANTS: Record<BusinessPlanStatus, 'default' | 'warning' | 'success' | 'info'> = {
  draft: 'default',
  review: 'warning',
  active: 'success',
  archived: 'info',
};

const BUSINESS_PLAN_LINK_TYPE_LABELS: Record<BusinessPlanLinkType, string> = {
  task: 'Task',
  cycleGoal: 'Cycle goal',
  vision: 'Vision',
  blogArticle: 'Blog article',
  contextSource: 'Context source',
  apiEndpoint: 'API endpoint',
  feedback: 'Feedback',
  socialPost: 'Social post',
  prompt: 'Prompt',
  timeBlock: 'Time block',
  environment: 'Environment',
  teamMember: 'Team member',
};

const BUSINESS_PLAN_LINK_TYPE_HINTS: Record<BusinessPlanLinkType, string[]> = {
  task: ['task', 'execution', 'operations', 'next 90 days', 'owners'],
  cycleGoal: ['goal', 'roadmap', 'milestone', 'next 90 days'],
  vision: ['vision', 'strategy', 'summary', 'direction'],
  blogArticle: ['content', 'blog', 'marketing', 'services'],
  contextSource: ['context', 'source', 'operations', 'services'],
  apiEndpoint: ['api', 'systems', 'operations', 'tooling'],
  feedback: ['feedback', 'risk', 'services', 'customers'],
  socialPost: ['social', 'content', 'services', 'marketing'],
  prompt: ['prompt', 'automation', 'operations', 'systems'],
  timeBlock: ['time', 'cadence', 'operations', 'planning'],
  environment: ['environment', 'systems', 'risk', 'operations'],
  teamMember: ['owner', 'team', 'operations', 'approvals'],
};

const BUSINESS_PLAN_LINK_TYPE_ROUTES: Partial<Record<BusinessPlanLinkType, string>> = {
  task: '/tasks',
  cycleGoal: '/execution',
  vision: '/execution',
  blogArticle: '/blogs',
  contextSource: '/systems',
  apiEndpoint: '/systems',
  feedback: '/content',
  socialPost: '/content',
  prompt: '/systems',
  timeBlock: '/week-13',
  environment: '/systems',
  teamMember: '/team',
};

const COLLABORATOR_COLORS = ['#2563eb', '#059669', '#ea580c', '#7c3aed', '#db2777', '#0f766e', '#dc2626', '#4f46e5'];
const COLLABORATOR_STALE_AFTER_MS = 15_000;
const META_AUTOSAVE_MS = 450;
const BLOCK_AUTOSAVE_MS = 320;

type LinkCandidate = {
  type: BusinessPlanLinkType;
  recordId: string;
  title: string;
  summary: string;
  statusLabel?: string;
  updatedAt: string;
  route?: string;
  searchText: string;
};

type LinkedCardSource = {
  source: LinkCandidate;
  link: BusinessPlanLink;
};

type SlashCommandAction =
  | {
      type: 'set-block';
      blockType: BusinessPlanBlockType;
      level?: number;
      ordered?: boolean;
    }
  | {
      type: 'insert-divider';
    }
  | {
      type: 'attach-card';
      candidate: LinkCandidate;
    };

type SlashCommandItem = {
  id: string;
  label: string;
  description: string;
  kind: 'format' | 'insert' | 'card';
  icon: React.ReactNode;
  searchText: string;
  action: SlashCommandAction;
};

type SaveIndicator = 'saved' | 'saving' | 'error';
type PlanCreationMode = 'template' | 'paste' | 'upload';

type BusinessPlanWorkspaceData = {
  tasks: Task[];
  blogArticles: BlogArticle[];
  visions: Vision[];
  cycleGoals: CycleGoal[];
  apiEndpoints: ApiEndpoint[];
  environments: EnvironmentState[];
  prompts: Prompt[];
  socialPosts: SocialPost[];
  feedbacks: Feedback[];
  timeBlocks: TimeBlock[];
  contextSources: ContextSource[];
  teamMembers: UserProfile[];
};

type BlockMutationResult = {
  blocks: BusinessPlanEditorBlock[];
  links?: BusinessPlanLink[];
  focusBlockId?: string | null;
  focusMode?: 'start' | 'end';
};

export function BusinessPlanPage() {
  const { userProfile } = useUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const currentUserId = userProfile?.id || auth.currentUser?.uid || null;
  const {
    tasks,
    blogArticles,
    visions,
    cycleGoals,
    apiEndpoints,
    environments,
    prompts,
    socialPosts,
    feedbacks,
    timeBlocks,
    contextSources,
    teamMembers,
  } = useGlobalState();

  const [plans, setPlans] = useState<BusinessPlan[]>([]);
  const [selectedPlanDocument, setSelectedPlanDocument] = useState<BusinessPlan | null>(null);
  const [editingSessions, setEditingSessions] = useState<BusinessPlanEditingSession[]>([]);
  const [search, setSearch] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(() => searchParams.get('planId') || null);
  const [editorTitle, setEditorTitle] = useState('');
  const [editorSummary, setEditorSummary] = useState('');
  const [editorTagsText, setEditorTagsText] = useState('');
  const [editorStatus, setEditorStatus] = useState<BusinessPlanStatus>('draft');
  const [editorContent, setEditorContent] = useState('');
  const [pendingCardCallback, setPendingCardCallback] = useState<((cardId: string) => void) | null>(null);
  const [linkQuery, setLinkQuery] = useState('');
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [mobileContextOpen, setMobileContextOpen] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState<SaveIndicator>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCreatePlanDialog, setShowCreatePlanDialog] = useState(false);
  const [planCreationMode, setPlanCreationMode] = useState<PlanCreationMode>('template');
  const [newPlanTitle, setNewPlanTitle] = useState(BUSINESS_PLAN_TEMPLATE_TITLE);
  const [newPlanSummary, setNewPlanSummary] = useState(BUSINESS_PLAN_TEMPLATE_SUMMARY);
  const [newPlanTagsText, setNewPlanTagsText] = useState(BUSINESS_PLAN_TEMPLATE_TAGS.join(', '));
  const [newPlanSourceContent, setNewPlanSourceContent] = useState('');
  const [newPlanSourceLabel, setNewPlanSourceLabel] = useState('');
  const [newPlanImportError, setNewPlanImportError] = useState('');
  const [newPlanTitleDirty, setNewPlanTitleDirty] = useState(false);
  const [newPlanSummaryDirty, setNewPlanSummaryDirty] = useState(false);
  const [newPlanTagsDirty, setNewPlanTagsDirty] = useState(false);
  const deferredEditorContent = useDeferredValue(editorContent);
  const showContextInsights = contextPanelOpen || mobileContextOpen;
  const shouldScoreLinkSuggestions = showContextInsights && linkPickerOpen;
  const importedPlanDraft = useMemo(
    () =>
      normalizeImportedBusinessPlanDraft({
        markdown: newPlanSourceContent,
        fallbackTitle: newPlanSourceLabel || 'Imported Business Plan',
      }),
    [newPlanSourceContent, newPlanSourceLabel],
  );
  const importedPlanBlockCount = useMemo(
    () => (importedPlanDraft.content ? parseBusinessPlanBlocks(importedPlanDraft.content, []).length : 0),
    [importedPlanDraft.content],
  );

  const selectedPlan = selectedPlanDocument ?? plans.find((plan) => plan.id === selectedPlanId) ?? null;
  const contextSourceContent = showContextInsights ? deferredEditorContent : selectedPlan?.content ?? editorContent;
  const canEditSelectedPlan = useMemo(() => {
    if (!selectedPlan || !auth.currentUser || !userProfile) return false;
    if (userProfile.id !== auth.currentUser.uid) return false;

    return (
      selectedPlan.authorId === auth.currentUser.uid ||
      (selectedPlan.companyId != null &&
        userProfile.companyId != null &&
        selectedPlan.companyId === userProfile.companyId)
    );
  }, [selectedPlan, userProfile]);

  const sessionIdRef = useRef<string>(getSessionScopedValue('business-plan-editor-session-id', () =>
    createBusinessPlanEditorId('session')));
  const sessionColorRef = useRef<string>(
    getSessionScopedValue('business-plan-editor-session-color', () =>
      COLLABORATOR_COLORS[Math.floor(Math.random() * COLLABORATOR_COLORS.length)]),
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const createPlanFileInputRef = useRef<HTMLInputElement>(null);
  const metaSaveTimerRef = useRef<number | null>(null);
  const blockSaveTimerRef = useRef<number | null>(null);
  const presenceHeartbeatRef = useRef<number | null>(null);
  const presenceCreatedAtRef = useRef<string | null>(null);
  const presencePlanIdRef = useRef<string | null>(null);
  const selectedPlanRef = useRef<BusinessPlan | null>(selectedPlan);
  const editorContentRef = useRef(editorContent);
  const selectedPlanIdRef = useRef<string | null>(null);
  const lastAppliedContentRevisionRef = useRef(0);
  const lastAppliedContentRef = useRef('');
  const localContentVersionRef = useRef(0);
  const pendingSavedContentRef = useRef<string | null>(null);
  const pendingSavedVersionRef = useRef<number | null>(null);
  const isLocalContentDirtyRef = useRef(false);
  const [selectedEditorBlockIds, setSelectedEditorBlockIds] = useState<string[]>([]);

  const stopPresenceHeartbeat = () => {
    if (presenceHeartbeatRef.current !== null) {
      window.clearInterval(presenceHeartbeatRef.current);
      presenceHeartbeatRef.current = null;
    }
  };

  const clearPendingSaveTimers = () => {
    if (metaSaveTimerRef.current !== null) {
      window.clearTimeout(metaSaveTimerRef.current);
      metaSaveTimerRef.current = null;
    }
    if (blockSaveTimerRef.current !== null) {
      window.clearTimeout(blockSaveTimerRef.current);
      blockSaveTimerRef.current = null;
    }
  };

  useEffect(() => {
    selectedPlanRef.current = selectedPlan;
  }, [selectedPlan]);

  useEffect(() => {
    editorContentRef.current = editorContent;
  }, [editorContent]);

  useEffect(() => {
    if (!selectedPlanDocument) return;

    const persistedPlan = plans.find((plan) => plan.id === selectedPlanDocument.id);
    if (persistedPlan) {
      setSelectedPlanDocument(null);
    }
  }, [plans, selectedPlanDocument]);

  useEffect(() => {
    if (!showCreatePlanDialog || planCreationMode === 'template') return;

    if (!newPlanTitleDirty) {
      setNewPlanTitle(importedPlanDraft.title);
    }
    if (!newPlanSummaryDirty) {
      setNewPlanSummary(importedPlanDraft.summary);
    }
    if (!newPlanTagsDirty) {
      setNewPlanTagsText(importedPlanDraft.tags.join(', '));
    }
  }, [
    importedPlanDraft.summary,
    importedPlanDraft.tags,
    importedPlanDraft.title,
    newPlanSummaryDirty,
    newPlanTagsDirty,
    newPlanTitleDirty,
    planCreationMode,
    showCreatePlanDialog,
  ]);

  const selectedPlanLinks = useMemo(() => selectedPlan?.links ?? [], [selectedPlan]);
  const inlineCardIds = useMemo(() => new Set(findInlineCardLinkIds(selectedPlan?.content ?? '')), [selectedPlan?.id, selectedPlan?.contentRevision]);
  const selectedPlanLinkKeySet = useMemo(
    () => new Set(selectedPlanLinks.map((link) => businessPlanLinkKey(link.type, link.recordId))),
    [selectedPlanLinks],
  );

  const linkCandidates = useMemo(
    () =>
      buildBusinessPlanLinkCandidates({
        tasks,
        blogArticles,
        visions,
        cycleGoals,
        apiEndpoints,
        environments,
        prompts,
        socialPosts,
        feedbacks,
        timeBlocks,
        contextSources,
        teamMembers,
      }),
    [
      apiEndpoints,
      blogArticles,
      contextSources,
      cycleGoals,
      environments,
      feedbacks,
      prompts,
      socialPosts,
      tasks,
      teamMembers,
      timeBlocks,
      visions,
    ],
  );

  const linkCandidateLookup = useMemo(
    () => new Map(linkCandidates.map((candidate) => [businessPlanLinkKey(candidate.type, candidate.recordId), candidate])),
    [linkCandidates],
  );

  const linkedCards = useMemo(
    () =>
      selectedPlanLinks
        .map((link) => {
          const source = linkCandidateLookup.get(businessPlanLinkKey(link.type, link.recordId));
          return source ? { source, link } : null;
        })
        .filter((item): item is LinkedCardSource => Boolean(item)),
    [linkCandidateLookup, selectedPlanLinks],
  );

  const currentDocumentBlocks = useMemo(() => {
    if (!contextSourceContent) return [createParagraphBlock()];
    return parseBusinessPlanBlocks(contextSourceContent, selectedPlan?.blockMap || []);
  }, [contextSourceContent, selectedPlan?.blockMap]);

  const outline = useMemo(() => extractOutlineFromBlocks(currentDocumentBlocks), [currentDocumentBlocks]);
  const wordCount = useMemo(() => countWordsFromBlocks(currentDocumentBlocks), [currentDocumentBlocks]);
  const requiredCoverage = useMemo(() => {
    const headings = outline.map((item) => item.title.toLowerCase());
    return BUSINESS_PLAN_REQUIRED_SECTIONS.filter((section) =>
      section.keywords.some((keyword) => headings.some((heading) => heading.includes(keyword))),
    ).length;
  }, [outline]);

  const requiredSections = useMemo(() => {
    const headings = outline.map((item) => item.title.toLowerCase());
    return BUSINESS_PLAN_REQUIRED_SECTIONS.map((section) => ({
      ...section,
      matched: section.keywords.some((keyword) => headings.some((heading) => heading.includes(keyword))),
    }));
  }, [outline]);

  const planText = useMemo(() => {
    if (!shouldScoreLinkSuggestions) return '';
    return [editorTitle, editorSummary, contextSourceContent, editorTagsText].join(' ').toLowerCase();
  }, [contextSourceContent, editorSummary, editorTagsText, editorTitle, shouldScoreLinkSuggestions]);

  const linkSuggestions = useMemo(() => {
    if (!shouldScoreLinkSuggestions) return [];
    const queryText = linkQuery.trim().toLowerCase();

    return linkCandidates
      .filter((candidate) => !selectedPlanLinkKeySet.has(businessPlanLinkKey(candidate.type, candidate.recordId)))
      .map((candidate) => ({
        candidate,
        score: scoreBusinessPlanLinkCandidate(candidate, planText, queryText),
      }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || right.candidate.updatedAt.localeCompare(left.candidate.updatedAt))
      .slice(0, 10);
  }, [linkCandidates, linkQuery, planText, selectedPlanLinkKeySet, shouldScoreLinkSuggestions]);

  const visibleEditingSessions = useMemo(() => {
    const now = Date.now();
    return editingSessions.filter((session) => {
      if (session.sessionId === sessionIdRef.current) return false;
      const updatedAt = new Date(session.updatedAt).getTime();
      if (Number.isNaN(updatedAt)) return false;
      return now - updatedAt <= COLLABORATOR_STALE_AFTER_MS;
    });
  }, [editingSessions]);

  const sessionsByBlockId = useMemo(() => {
    const grouped = new Map<string, BusinessPlanEditingSession[]>();
    visibleEditingSessions.forEach((session) => {
      const bucket = grouped.get(session.activeBlockId) ?? [];
      bucket.push(session);
      grouped.set(session.activeBlockId, bucket);
    });
    return grouped;
  }, [visibleEditingSessions]);

  const filteredPlans = useMemo(() => {
    const queryText = search.trim().toLowerCase();
    const sorted = sortBusinessPlans(plans);
    if (!queryText) return sorted;

    return sorted.filter((plan) => {
      const haystack = [plan.title, plan.summary, plan.content, ...plan.tags].join(' ').toLowerCase();
      return haystack.includes(queryText);
    });
  }, [plans, search]);

  const filteredPlanItems = useMemo(
    () =>
      filteredPlans.map((plan) => ({
        plan,
        summary: summarizePlan(plan),
        blockCount: plan.blockMap?.filter((b) => b.type === 'heading').length ?? 0,
      })),
    [filteredPlans],
  );

  useEffect(() => {
    if (!currentUserId) {
      setPlans([]);
      setSelectedPlanId(null);
      return;
    }

    const plansQuery = userProfile?.companyId
      ? query(collection(db, 'businessPlans'), where('companyId', '==', userProfile.companyId))
      : query(collection(db, 'businessPlans'), where('authorId', '==', currentUserId));

    const unsubscribe = onSnapshot(
      plansQuery,
      (snapshot) => {
        const nextPlans = sortBusinessPlans(
          snapshot.docs.map((item) => normalizeBusinessPlan(item.id, item.data() as Record<string, unknown>)),
        );

        setPlans(nextPlans);
        setSelectedPlanId((current) => {
          if (current && nextPlans.some((plan) => plan.id === current)) {
            return current;
          }

          return nextPlans[0]?.id ?? null;
        });
      },
      (error) => {
        setPlans([]);
        setSelectedPlanId(null);
        logFirestoreError(error, OperationType.GET, 'businessPlans');
      },
    );

    return unsubscribe;
  }, [currentUserId, userProfile?.companyId]);

  useEffect(() => {
    if (!selectedPlan?.id) {
      setEditingSessions([]);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, 'businessPlans', selectedPlan.id, 'editingSessions'),
      (snapshot) => {
        const nextSessions = snapshot.docs
          .map((item) => normalizeBusinessPlanEditingSession(item.id, item.data() as Record<string, unknown>))
          .filter((item): item is BusinessPlanEditingSession => Boolean(item))
          .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
        setEditingSessions(nextSessions);
      },
      (error) => {
        setEditingSessions([]);
        logFirestoreError(error, OperationType.GET, `businessPlans/${selectedPlan.id}/editingSessions`);
      },
    );

    return unsubscribe;
  }, [selectedPlan?.id]);

  useEffect(() => {
    if (!selectedPlan) {
      clearPendingSaveTimers();
      selectedPlanIdRef.current = null;
      lastAppliedContentRevisionRef.current = 0;
      lastAppliedContentRef.current = '';
      pendingSavedContentRef.current = null;
      pendingSavedVersionRef.current = null;
      isLocalContentDirtyRef.current = false;
      setEditorContent('');
      setEditorTitle('');
      setEditorSummary('');
      setEditorTagsText('');
      setEditorStatus('draft');
      setSaveIndicator('saved');
      return;
    }

    if (selectedPlanIdRef.current !== selectedPlan.id) {
      clearPendingSaveTimers();
      selectedPlanIdRef.current = selectedPlan.id;
      lastAppliedContentRevisionRef.current = selectedPlan.contentRevision ?? 0;
      lastAppliedContentRef.current = selectedPlan.content;
      pendingSavedContentRef.current = null;
      pendingSavedVersionRef.current = null;
      isLocalContentDirtyRef.current = false;
      setEditorContent(selectedPlan.content);
      setEditorTitle(selectedPlan.title);
      setEditorSummary(selectedPlan.summary);
      setEditorTagsText(selectedPlan.tags.join(', '));
      setEditorStatus(selectedPlan.status);
      setLinkPickerOpen(false);
      setLinkQuery('');
      return;
    }

    const remoteContentChanged =
      lastAppliedContentRevisionRef.current !== (selectedPlan.contentRevision ?? 0) ||
      lastAppliedContentRef.current !== selectedPlan.content;

    if (!remoteContentChanged) {
      return;
    }

    const remoteMatchesLatestQueuedSave =
      pendingSavedContentRef.current === selectedPlan.content &&
      pendingSavedVersionRef.current === localContentVersionRef.current;

    if (remoteMatchesLatestQueuedSave) {
      pendingSavedContentRef.current = null;
      pendingSavedVersionRef.current = null;
      isLocalContentDirtyRef.current = false;
      lastAppliedContentRevisionRef.current = selectedPlan.contentRevision ?? 0;
      lastAppliedContentRef.current = selectedPlan.content;

      if (editorContentRef.current !== selectedPlan.content) {
        setEditorContent(selectedPlan.content);
      }
      return;
    }

    if (isLocalContentDirtyRef.current) {
      return;
    }

    lastAppliedContentRevisionRef.current = selectedPlan.contentRevision ?? 0;
    lastAppliedContentRef.current = selectedPlan.content;
    if (editorContentRef.current !== selectedPlan.content) {
      setEditorContent(selectedPlan.content);
    }
  }, [selectedPlan]);

  useEffect(() => {
    return clearPendingSaveTimers;
  }, []);

  useEffect(() => {
    const handlePageHide = () => {
      void clearEditingPresence();
    };

    window.addEventListener('beforeunload', handlePageHide);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('beforeunload', handlePageHide);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  useEffect(() => {
    if (!selectedPlan?.id || !canEditSelectedPlan || !userProfile || !auth.currentUser) {
      void clearEditingPresence();
      return;
    }

    void upsertEditingPresence(selectedPlan.id, 'doc');
    stopPresenceHeartbeat();
    presenceHeartbeatRef.current = window.setInterval(() => {
      void upsertEditingPresence(selectedPlan.id, 'doc');
    }, 4500);

    return () => {
      stopPresenceHeartbeat();
    };
  }, [canEditSelectedPlan, selectedPlan?.id, userProfile?.displayName, auth.currentUser?.uid]);


  const clearEditingPresence = async () => {
    stopPresenceHeartbeat();
    const planId = presencePlanIdRef.current;
    if (!planId) return;

    presencePlanIdRef.current = null;
    presenceCreatedAtRef.current = null;
    try {
      await deleteDoc(doc(db, 'businessPlans', planId, 'editingSessions', sessionIdRef.current));
    } catch (error) {
      logFirestoreError(error, OperationType.DELETE, `businessPlans/${planId}/editingSessions/${sessionIdRef.current}`);
    }
  };

  const upsertEditingPresence = async (planId: string, nextActiveBlockId: string) => {
    if (!auth.currentUser || !userProfile) return;

    const createdAt = presenceCreatedAtRef.current ?? new Date().toISOString();
    presenceCreatedAtRef.current = createdAt;
    presencePlanIdRef.current = planId;

    try {
      await setDoc(
        doc(db, 'businessPlans', planId, 'editingSessions', sessionIdRef.current),
        {
          sessionId: sessionIdRef.current,
          userId: auth.currentUser.uid,
          displayName: userProfile.displayName,
          color: sessionColorRef.current,
          planId,
          activeBlockId: nextActiveBlockId,
          createdAt,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
    } catch (error) {
      logFirestoreError(error, OperationType.UPDATE, `businessPlans/${planId}/editingSessions/${sessionIdRef.current}`);
    }
  };

  const saveMetaPatch = async (patch: Partial<Pick<BusinessPlan, 'title' | 'summary' | 'tags' | 'status' | 'content' | 'blockMap'>>) => {
    if (!selectedPlan || !canEditSelectedPlan) return;

    const nextPatch: Record<string, unknown> = {};
    if (patch.title !== undefined && patch.title.trim() && patch.title !== selectedPlan.title) {
      nextPatch.title = patch.title.trim();
    }
    if (patch.summary !== undefined && patch.summary !== selectedPlan.summary) {
      nextPatch.summary = patch.summary;
    }
    if (patch.status !== undefined && patch.status !== selectedPlan.status) {
      nextPatch.status = patch.status;
    }
    if (patch.tags !== undefined && !sameTagLists(patch.tags, selectedPlan.tags)) {
      nextPatch.tags = patch.tags;
    }
    if (patch.content !== undefined) {
      nextPatch.content = patch.content;
    }
    if (patch.blockMap !== undefined) {
      nextPatch.blockMap = patch.blockMap;
    }

    if (Object.keys(nextPatch).length === 0) {
      return;
    }

    nextPatch.updatedAt = new Date().toISOString();
    setSaveIndicator('saving');
    try {
      await setDoc(doc(db, 'businessPlans', selectedPlan.id), nextPatch, { merge: true });
      setSaveIndicator('saved');
      setLastSavedAt(nextPatch.updatedAt as string);
    } catch (error) {
      setSaveIndicator('error');
      logFirestoreError(error, OperationType.UPDATE, `businessPlans/${selectedPlan.id}`);
    }
  };

  const queueMetaSave = (patch: Partial<Pick<BusinessPlan, 'title' | 'summary' | 'tags' | 'status'>>) => {
    if (metaSaveTimerRef.current !== null) {
      window.clearTimeout(metaSaveTimerRef.current);
    }

    metaSaveTimerRef.current = window.setTimeout(() => {
      void saveMetaPatch(patch);
    }, META_AUTOSAVE_MS);
  };

  const queueContentSave = (newContent: string) => {
    const scheduledContentVersion = localContentVersionRef.current;
    const targetPlanId = selectedPlan?.id;

    if (blockSaveTimerRef.current !== null) {
      window.clearTimeout(blockSaveTimerRef.current);
    }

    blockSaveTimerRef.current = window.setTimeout(() => {
      if (!targetPlanId || selectedPlanRef.current?.id !== targetPlanId) {
        return;
      }

      const latestBlockMap = selectedPlanRef.current?.blockMap || [];
      const nextBlocks = sanitizeBusinessPlanBlocks(parseBusinessPlanBlocks(newContent, latestBlockMap));
      const serializedContent = serializeBusinessPlanBlocks(nextBlocks);
      pendingSavedContentRef.current = serializedContent;
      pendingSavedVersionRef.current = scheduledContentVersion;
      void saveMetaPatch({
        content: serializedContent,
        blockMap: toBusinessPlanBlockMap(nextBlocks),
      });
    }, BLOCK_AUTOSAVE_MS);
  };

  const handleEditorChange = (newContent: string) => {
    localContentVersionRef.current += 1;
    isLocalContentDirtyRef.current = true;

    startTransition(() => {
      setEditorContent(newContent);
    });

    queueContentSave(newContent);
  };



  const handleTitleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditorTitle(event.target.value);
    queueMetaSave({ title: event.target.value });
  };

  const handleSummaryChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditorSummary(event.target.value);
    queueMetaSave({ summary: event.target.value });
  };

  const handleTagsChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditorTagsText(event.target.value);
  };

  const handleTagsBlur = () => {
    const tags = normalizeTags(editorTagsText);
    setEditorTagsText(tags.join(', '));
    void saveMetaPatch({ tags });
  };

  const handleStatusChange = (value: string) => {
    const nextStatus = value as BusinessPlanStatus;
    setEditorStatus(nextStatus);
    void saveMetaPatch({ status: nextStatus });
  };

  const applyTemplatePlanDraft = () => {
    const template = createBusinessPlanTemplate();
    setNewPlanTitle(template.title);
    setNewPlanSummary(template.summary);
    setNewPlanTagsText(template.tags.join(', '));
    setNewPlanSourceContent(template.content);
    setNewPlanSourceLabel('Template');
    setNewPlanImportError('');
    setNewPlanTitleDirty(false);
    setNewPlanSummaryDirty(false);
    setNewPlanTagsDirty(false);
  };

  const resetNewPlanDialog = (mode: PlanCreationMode = 'template') => {
    setPlanCreationMode(mode);
    setNewPlanImportError('');
    setNewPlanSourceLabel('');
    setNewPlanSourceContent('');
    setNewPlanTitleDirty(false);
    setNewPlanSummaryDirty(false);
    setNewPlanTagsDirty(false);

    if (mode === 'template') {
      applyTemplatePlanDraft();
      return;
    }

    setNewPlanTitle('');
    setNewPlanSummary('');
    setNewPlanTagsText('');
  };

  const openCreatePlanDialog = (mode: PlanCreationMode = 'template') => {
    resetNewPlanDialog(mode);
    setMobileListOpen(false);
    setShowCreatePlanDialog(true);
  };

  const handlePlanCreationModeChange = (nextMode: string) => {
    const normalizedMode = nextMode as PlanCreationMode;
    resetNewPlanDialog(normalizedMode);
  };

  const applyImportedPlanSource = (
    value: string,
    sourceLabel: string,
  ) => {
    setNewPlanSourceContent(value);
    setNewPlanSourceLabel(sourceLabel);
    setNewPlanImportError('');
  };

  const handleImportTextareaPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const html = event.clipboardData.getData('text/html');
    const plainText = event.clipboardData.getData('text/plain');
    if (!html) return;

    event.preventDefault();
    const imported = normalizeImportedBusinessPlanDraft({
      html,
      plainText,
      fallbackTitle: 'Pasted rich text plan',
    });

    applyImportedPlanSource(imported.content, 'Pasted rich text plan');
  };

  const handlePlanUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const isMarkdownFile =
      file.name.toLowerCase().endsWith('.md') ||
      file.name.toLowerCase().endsWith('.markdown') ||
      file.type === 'text/markdown' ||
      file.type === 'text/plain';

    if (!isMarkdownFile) {
      setNewPlanImportError('Upload a Markdown file (.md or .markdown).');
      return;
    }

    try {
      const text = await file.text();
      applyImportedPlanSource(text, file.name.replace(/\.[^.]+$/, ''));
    } catch {
      setNewPlanImportError('Unable to read that file.');
    }
  };

  const createPlanFromDraft = async (draft: {
    title: string;
    summary: string;
    content: string;
    tags: string[];
    status?: BusinessPlanStatus;
    links?: BusinessPlanLink[];
  }) => {
    if (!auth.currentUser) return;

    const docRef = doc(collection(db, 'businessPlans'));
    const blocks = sanitizeBusinessPlanBlocks(parseBusinessPlanBlocks(draft.content, []));
    const content = serializeBusinessPlanBlocks(blocks);
    const now = new Date().toISOString();
    const optimisticPlan: BusinessPlan = {
      id: docRef.id,
      title: draft.title.trim() || 'Untitled plan',
      summary: draft.summary.trim(),
      content,
      status: draft.status ?? 'draft',
      tags: draft.tags,
      links: draft.links ?? [],
      contentRevision: 0,
      blockMap: toBusinessPlanBlockMap(blocks),
      createdAt: now,
      updatedAt: now,
      authorId: auth.currentUser.uid,
      companyId: userProfile?.companyId,
    };

    setPlans((current) => sortBusinessPlans([optimisticPlan, ...current.filter((plan) => plan.id !== docRef.id)]));
    setSelectedPlanId(docRef.id);
    setSelectedPlanDocument(optimisticPlan);
    setShowCreatePlanDialog(false);

    try {
      await setDoc(docRef, buildBusinessPlanRecord(optimisticPlan));
      setSaveIndicator('saved');
      setLastSavedAt(now);
    } catch (error) {
      setPlans((current) => current.filter((plan) => plan.id !== docRef.id));
      setSelectedPlanId(null);
      setSelectedPlanDocument(null);
      setSaveIndicator('error');
      logFirestoreError(error, OperationType.CREATE, 'businessPlans');
    }
  };

  const handleCreatePlanSubmit = async () => {
    if (planCreationMode === 'template') {
      const template = createBusinessPlanTemplate({
        title: newPlanTitle.trim() || BUSINESS_PLAN_TEMPLATE_TITLE,
        summary: newPlanSummary.trim() || BUSINESS_PLAN_TEMPLATE_SUMMARY,
        tags: normalizeTags(newPlanTagsText),
      });

      await createPlanFromDraft(template);
      return;
    }

    if (!importedPlanDraft.content.trim()) {
      setNewPlanImportError('Paste plan content or upload a Markdown file first.');
      return;
    }

    await createPlanFromDraft({
      title: newPlanTitle.trim() || importedPlanDraft.title,
      summary: newPlanSummary.trim(),
      content: importedPlanDraft.content,
      tags: normalizeTags(newPlanTagsText),
      status: 'draft',
      links: [],
    });
  };

  const deletePlan = async () => {
    if (!selectedPlan || !canEditSelectedPlan) return;

    try {
      await clearEditingPresence();
      await deleteDoc(doc(db, 'businessPlans', selectedPlan.id));
      setPlans((current) => current.filter((plan) => plan.id !== selectedPlan.id));
      setSelectedPlanId(null);
      setSelectedPlanDocument(null);
      setSaveIndicator('saved');
    } catch (error) {
      setSaveIndicator('error');
      logFirestoreError(error, OperationType.DELETE, `businessPlans/${selectedPlan.id}`);
    }
  };



  const insertInlineCard = async (candidate: LinkCandidate) => {
    if (!selectedPlan || !auth.currentUser || !canEditSelectedPlan) return;

    const existing = selectedPlan.links.find((link) => link.type === candidate.type && link.recordId === candidate.recordId);
    if (existing) return;

    const nextLink: BusinessPlanLink = {
      id: createBusinessPlanEditorId('link'),
      type: candidate.type,
      recordId: candidate.recordId,
      createdAt: new Date().toISOString(),
      createdBy: auth.currentUser.uid,
    };

    const nextLinks = [nextLink, ...selectedPlan.links];
    setSaveIndicator('saving');
    try {
      await setDoc(
        doc(db, 'businessPlans', selectedPlan.id),
        {
          links: nextLinks.map((link) => ({ ...link })),
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      setSaveIndicator('saved');
    } catch (error) {
      setSaveIndicator('error');
      logFirestoreError(error, OperationType.UPDATE, `businessPlans/${selectedPlan.id}`);
    }
  };

  const attachContextLink = insertInlineCard;

  const removeLink = async (linkId: string) => {
    if (!selectedPlan || !canEditSelectedPlan) return;

    const nextLinks = selectedPlan.links.filter((link) => link.id !== linkId);
    const nextBlocks = currentDocumentBlocks.filter(
      (block) => !(block.type === 'card' && block.linkId === linkId),
    );
    const persistedBlocks = nextBlocks.length > 0 ? nextBlocks : [createParagraphBlock()];

    setSaveIndicator('saving');
    try {
      await setDoc(
        doc(db, 'businessPlans', selectedPlan.id),
        {
          links: nextLinks.map((link) => ({ ...link })),
          content: serializeBusinessPlanBlocks(persistedBlocks),
          blockMap: toBusinessPlanBlockMap(persistedBlocks),
          contentRevision: (selectedPlan.contentRevision ?? 0) + 1,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      setSaveIndicator('saved');
    } catch (error) {
      setSaveIndicator('error');
      logFirestoreError(error, OperationType.UPDATE, `businessPlans/${selectedPlan.id}`);
    }
  };

  
  
  
  
  const openLinkedSource = (candidate: LinkCandidate) => {
    const route = BUSINESS_PLAN_LINK_TYPE_ROUTES[candidate.type];
    if (route) {
      navigate(route);
    }
  };

  const saveLabel = getSaveLabel(saveIndicator, lastSavedAt);

  return (
    <div className="relative flex h-full overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(248,250,252,0.98),_rgba(255,255,255,1)_48%,_rgba(244,244,245,0.95))] text-zinc-900">
      <aside
        className={`absolute inset-y-0 left-0 z-40 flex w-[320px] flex-col border-r border-zinc-200 bg-white/95 backdrop-blur md:static md:z-auto md:translate-x-0 ${
          selectedPlanId ? '-translate-x-full md:translate-x-0' : 'translate-x-0'
        } transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]`}
      >
        <StudioHeader
          badge="Planning Studio"
          badgeIcon={<FilePenLine className="h-3.5 w-3.5" />}
          title="Business Plan"
          subtitle="Markdown-backed collaboration for services, operations, legal, and strategy."
          actions={
            <button
              onClick={() => openCreatePlanDialog()}
              className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-zinc-800"
            >
              <Plus className="h-3.5 w-3.5" />
              New Plan
            </button>
          }
        />

        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search plans..." />
        </FilterBar>

        <div className="flex-1 overflow-y-auto">
          {filteredPlans.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<FilePenLine className="h-6 w-6 text-zinc-300" />}
                title={search ? 'No plans found' : 'No business plans yet'}
                subtitle={search ? 'Try a different search term.' : 'Create from the template, paste a plan, or import Markdown to start your first business plan.'}
              />
            </div>
          ) : (
            <div className="flex flex-col">
              {filteredPlanItems.map(({ plan, summary, blockCount }) => (
                <ListItem
                  key={plan.id}
                  title={plan.title}
                  subtitle={summary}
                  badge={statusLabel(plan.status)}
                  badgeVariant={STATUS_BADGE_VARIANTS[plan.status]}
                  secondaryBadge={`${blockCount} blocks`}
                  isActive={selectedPlanId === plan.id}
                  onClick={() => {
                    setSelectedPlanId(plan.id);
                    setMobileListOpen(false);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </aside>

      <div className={`flex min-w-0 flex-1 ${selectedPlanId ? 'flex' : 'hidden md:flex'}`}>
        {selectedPlan ? (
          <div className="relative flex min-w-0 flex-1">
            <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <div className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/90 backdrop-blur">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedPlanId(null)}
                      className="rounded-full border border-zinc-200 bg-white p-2 text-zinc-500 shadow-sm transition hover:text-zinc-900 md:hidden"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMobileListOpen((current) => !current)}
                      className="hidden rounded-full border border-zinc-200 bg-white p-2 text-zinc-500 shadow-sm transition hover:text-zinc-900 md:inline-flex xl:hidden"
                    >
                      <Menu className="h-4 w-4" />
                    </button>
                    <div className="flex items-center gap-2">
                      {visibleEditingSessions.length > 0 ? (
                        <>
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping"></span>
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
                          </span>
                          <span className="text-xs font-semibold text-emerald-700">Live</span>
                        </>
                      ) : (
                        <>
                          <span className="h-2.5 w-2.5 rounded-full bg-zinc-300"></span>
                          <span className="text-xs font-semibold text-zinc-500">Only you</span>
                        </>
                      )}
                    </div>
                    <span className={`text-xs font-medium ${saveIndicator === 'error' ? 'text-red-600' : saveIndicator === 'saving' ? 'text-amber-600' : 'text-zinc-400'}`}>
                      {saveLabel}
                    </span>
                    {!canEditSelectedPlan && (
                      <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                        Read only
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <CollaboratorStack sessions={visibleEditingSessions} />
                    <div className="w-[124px]">
                      <CustomSelect
                        value={editorStatus}
                        onChange={handleStatusChange}
                        options={STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                        triggerClassName="rounded-full px-3 py-2 text-xs font-semibold"
                        disabled={!canEditSelectedPlan}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setContextPanelOpen((current) => !current);
                        setMobileContextOpen((current) => !current);
                      }}
                      className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Context
                    </button>
                    <button
                      type="button"
                      disabled={!canEditSelectedPlan}
                      onClick={() => void saveMetaPatch({ title: editorTitle, summary: editorSummary, tags: normalizeTags(editorTagsText), status: editorStatus })}
                      className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save
                    </button>
                    <button
                      type="button"
                      disabled={!canEditSelectedPlan}
                      onClick={() => setShowDeleteConfirm(true)}
                      className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 shadow-sm transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 pb-32 pt-6 md:px-8">
                <div className="mx-auto max-w-4xl space-y-6">
                  <section className="rounded-[2rem] border border-zinc-200/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
                    <div className="space-y-5">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">
                          Plan title
                        </label>
                        <textarea
                          value={editorTitle}
                          onChange={handleTitleChange}
                          onBlur={() => void saveMetaPatch({ title: editorTitle })}
                          disabled={!canEditSelectedPlan}
                          rows={1}
                          className="w-full resize-none overflow-hidden bg-transparent text-4xl font-black tracking-tight text-zinc-950 outline-none placeholder:text-zinc-300 disabled:cursor-not-allowed"
                          placeholder="Replofy Business Plan"
                        />
                      </div>

                      <div className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50/80 px-4 py-4">
                        <label className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">
                          Executive summary
                        </label>
                        <textarea
                          value={editorSummary}
                          onChange={handleSummaryChange}
                          onBlur={() => void saveMetaPatch({ summary: editorSummary })}
                          disabled={!canEditSelectedPlan}
                          rows={4}
                          className="mt-2 w-full resize-none bg-transparent text-sm leading-7 text-zinc-700 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed"
                          placeholder="Capture the business plan in one paragraph."
                        />
                      </div>
                    </div>
                  </section>

                  <section className="rounded-[2rem] border border-zinc-200/80 bg-white/90 shadow-[0_24px_70px_rgba(15,23,42,0.06)] overflow-hidden">
                    <div className="border-b border-zinc-200/80 px-5 py-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">
                        Document canvas
                      </p>
                    </div>

                    <div className="px-3 py-4 md:px-5 md:py-5 min-h-[420px]">
                      <RichTextEditor
                        content={editorContent}
                        onChange={handleEditorChange}
                        placeholder={"Start writing the business plan. Type '/' for commands."}
                        readOnly={!canEditSelectedPlan}
                        selectedBlockIds={selectedEditorBlockIds}
                        onSelectionChange={setSelectedEditorBlockIds}
                      />
                    </div>
                  </section>
                </div>
              </div>
            </main>

            <ContextPanel
              open={contextPanelOpen}
              mobileOpen={mobileContextOpen}
              onClose={() => {
                setContextPanelOpen(false);
                setMobileContextOpen(false);
              }}
              linkPickerOpen={linkPickerOpen}
              setLinkPickerOpen={setLinkPickerOpen}
              linkQuery={linkQuery}
              setLinkQuery={setLinkQuery}
              linkSuggestions={linkSuggestions}
              linkedCards={linkedCards}
              inlineCardIds={inlineCardIds}
              openLinkedSource={openLinkedSource}
              attachContextLink={(candidate) => void attachContextLink(candidate)}
              insertInlineCard={(candidate) => void insertInlineCard(candidate)}
              removeLink={(linkId) => void removeLink(linkId)}
              outline={outline}
              wordCount={wordCount}
              coverage={`${requiredCoverage}/${BUSINESS_PLAN_REQUIRED_SECTIONS.length}`}
              requiredSections={requiredSections}
              editorTagsText={editorTagsText}
              setEditorTagsText={setEditorTagsText}
              handleTagsBlur={handleTagsBlur}
              canEditSelectedPlan={canEditSelectedPlan}
              visibleEditingSessions={visibleEditingSessions}
            />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center px-6">
            <EmptyState
              icon={<FilePenLine className="h-6 w-6 text-zinc-300" />}
              title="No plan selected"
              subtitle="Pick a plan from the sidebar, or create a new one to document your business model, strategy, and operations."
            />
          </div>
        )}
      </div>

      {mobileListOpen && (
        <>
          <div className="fixed inset-0 z-30 bg-zinc-950/25 backdrop-blur-sm md:hidden" onClick={() => setMobileListOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-40 flex w-[320px] flex-col border-r border-zinc-200 bg-white md:hidden">
            <StudioHeader
              badge="Planning Studio"
              badgeIcon={<FilePenLine className="h-3.5 w-3.5" />}
              title="Business Plan"
              subtitle="Plans"
              actions={
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openCreatePlanDialog()}
                    className="rounded-full border border-zinc-200 bg-white p-2 text-zinc-500"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileListOpen(false)}
                    className="rounded-full border border-zinc-200 bg-white p-2 text-zinc-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              }
            />
            <FilterBar>
              <SearchInput value={search} onChange={setSearch} placeholder="Search plans..." />
            </FilterBar>
            <div className="flex-1 overflow-y-auto">
              {filteredPlanItems.map(({ plan, summary, blockCount }) => (
                <ListItem
                  key={plan.id}
                  title={plan.title}
                  subtitle={summary}
                  badge={statusLabel(plan.status)}
                  badgeVariant={STATUS_BADGE_VARIANTS[plan.status]}
                  secondaryBadge={`${blockCount} blocks`}
                  isActive={selectedPlanId === plan.id}
                  onClick={() => {
                    setSelectedPlanId(plan.id);
                    setMobileListOpen(false);
                  }}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {showCreatePlanDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-6 py-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">
                  New business plan
                </p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-zinc-950">
                  Create or import a plan
                </h2>
                <p className="mt-2 text-sm text-zinc-500">
                  Start from the default template, paste markdown, paste rich text, or upload a Markdown file.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreatePlanDialog(false)}
                className="rounded-full border border-zinc-200 bg-white p-2 text-zinc-500 transition hover:text-zinc-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <SegmentedControl
                options={[
                  { value: 'template', label: 'Template' },
                  { value: 'paste', label: 'Paste' },
                  { value: 'upload', label: 'Upload .md' },
                ]}
                value={planCreationMode}
                onChange={handlePlanCreationModeChange}
              />

              {planCreationMode === 'template' ? (
                <div className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50/80 p-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-zinc-200">
                      <FilePenLine className="h-4 w-4 text-zinc-700" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-zinc-950">
                        Default Replofy business plan template
                      </p>
                      <p className="text-sm leading-6 text-zinc-600">
                        Includes Executive Summary, Services, CLA / Legal, Operations, Revenue Model, Risks, and Next 90 Days.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 rounded-[1.5rem] border border-zinc-200 bg-zinc-50/80 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-zinc-950">
                        {planCreationMode === 'paste' ? 'Paste source content' : 'Upload Markdown'}
                      </p>
                      <p className="text-sm text-zinc-500">
                        {planCreationMode === 'paste'
                          ? 'Paste markdown directly, or paste rich text and it will be converted before parsing.'
                          : 'Choose a .md or .markdown file. You can still edit the parsed markdown below before creating the plan.'}
                      </p>
                    </div>

                    {planCreationMode === 'upload' && (
                      <button
                        type="button"
                        onClick={() => createPlanFileInputRef.current?.click()}
                        className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50"
                      >
                        <FileUp className="h-3.5 w-3.5" />
                        Choose File
                      </button>
                    )}
                  </div>

                  <input
                    ref={createPlanFileInputRef}
                    type="file"
                    accept=".md,.markdown,text/markdown,text/plain"
                    className="hidden"
                    onChange={handlePlanUpload}
                  />

                  {newPlanSourceLabel && (
                    <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600">
                      {planCreationMode === 'upload' ? <FileUp className="h-3.5 w-3.5" /> : <ClipboardPaste className="h-3.5 w-3.5" />}
                      {newPlanSourceLabel}
                    </div>
                  )}

                  <textarea
                    value={newPlanSourceContent}
                    onChange={(event) => {
                      setNewPlanSourceContent(event.target.value);
                      setNewPlanSourceLabel((current) => current || 'Pasted plan');
                      setNewPlanImportError('');
                    }}
                    onPaste={handleImportTextareaPaste}
                    rows={14}
                    className="w-full resize-none rounded-[1.25rem] border border-zinc-200 bg-white px-4 py-4 font-mono text-sm leading-6 text-zinc-700 outline-none transition focus:border-zinc-300"
                    placeholder={
                      planCreationMode === 'paste'
                        ? 'Paste markdown or rich text here.'
                        : 'Uploaded Markdown will appear here so you can review it before creating the plan.'
                    }
                  />

                  <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                    <span>{importedPlanBlockCount} parsed blocks</span>
                    {importedPlanDraft.title && <span>Detected title: {importedPlanDraft.title}</span>}
                  </div>

                  {newPlanImportError && (
                    <div className="rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {newPlanImportError}
                    </div>
                  )}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">
                    Plan title
                  </label>
                  <input
                    type="text"
                    value={newPlanTitle}
                    onChange={(event) => {
                      setNewPlanTitle(event.target.value);
                      setNewPlanTitleDirty(true);
                    }}
                    className="w-full rounded-[1.25rem] border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-300"
                    placeholder="Business plan title"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">
                    Tags
                  </label>
                  <input
                    type="text"
                    value={newPlanTagsText}
                    onChange={(event) => {
                      setNewPlanTagsText(event.target.value);
                      setNewPlanTagsDirty(true);
                    }}
                    className="w-full rounded-[1.25rem] border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-300"
                    placeholder="strategy, operations, legal"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">
                  Executive summary
                </label>
                <textarea
                  value={newPlanSummary}
                  onChange={(event) => {
                    setNewPlanSummary(event.target.value);
                    setNewPlanSummaryDirty(true);
                  }}
                  rows={4}
                  className="w-full resize-none rounded-[1.25rem] border border-zinc-200 bg-white px-4 py-3 text-sm leading-6 text-zinc-700 outline-none transition focus:border-zinc-300"
                  placeholder="Short summary for the plan list and header."
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-6 py-4">
              <p className="text-xs text-zinc-500">
                Imported content is normalized through the same markdown block parser used by the editor.
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreatePlanDialog(false)}
                  className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreatePlanSubmit()}
                  className="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-zinc-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create Plan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-4">
              <Trash2 className="h-5 w-5 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-zinc-900 text-center">Delete this plan?</h3>
            <p className="text-sm text-zinc-500 mt-2 text-center">
              This will permanently delete "{editorTitle || 'Untitled Plan'}" and remove it from your workspace. This action cannot be undone.
            </p>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-full border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  void deletePlan();
                }}
                className="flex-1 rounded-full bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type DocumentBlockProps = {
  key?: React.Key;
  block: BusinessPlanEditorBlock;
  isActive: boolean;
  isLocked: boolean;
  canEdit: boolean;
  remoteSessions: BusinessPlanEditingSession[];
  linkedCard: LinkedCardSource | null;
  inline: boolean;
  onActivate: () => void;
  onBlur: (event: React.FocusEvent<HTMLTextAreaElement>) => void;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  slashItems: SlashCommandItem[];
  slashIndex: number;
  slashItemRefs: React.MutableRefObject<Array<HTMLButtonElement | null>>;
  onSlashSelect: (item: SlashCommandItem) => void;
  setSlashIndex: React.Dispatch<React.SetStateAction<number>>;
  openSource?: () => void;
};

function DocumentBlock(props: DocumentBlockProps) {
  const {
    block,
    isActive,
    isLocked,
    canEdit,
    remoteSessions,
    linkedCard,
    inline,
    onActivate,
    onBlur,
    onChange,
    onKeyDown,
    textareaRef,
    slashItems,
    slashIndex,
    slashItemRefs,
    onSlashSelect,
    setSlashIndex,
    openSource,
  } = props;
  const primaryRemote = remoteSessions[0] ?? null;
  const slashVisible = isActive && Boolean(getSlashQuery(block));
  const blockFrameStyle = primaryRemote
    ? {
        boxShadow: `inset 3px 0 0 ${primaryRemote.color}`,
        backgroundColor: `${primaryRemote.color}12`,
      }
    : undefined;

  return (
    <div
      data-business-plan-block-shell
      role={canEdit && !isLocked ? 'button' : undefined}
      tabIndex={canEdit && !isLocked ? 0 : -1}
      onClick={() => {
        if (!isActive && canEdit && !isLocked) {
          onActivate();
        }
      }}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && canEdit && !isLocked) {
          event.preventDefault();
          onActivate();
        }
      }}
      className={`group relative rounded-[1.75rem] border px-4 py-3 transition-all md:px-5 ${
        isActive
          ? 'border-zinc-950/10 bg-zinc-50 shadow-[0_12px_40px_rgba(15,23,42,0.08)]'
          : isLocked
            ? 'border-zinc-300 bg-zinc-100'
            : 'border-transparent hover:border-zinc-200 hover:bg-white'
      }`}
      style={blockFrameStyle}
    >
      {remoteSessions.length > 0 && (
        <div className="pointer-events-none absolute right-3 top-3 flex flex-wrap justify-end gap-1.5">
          {remoteSessions.slice(0, 3).map((session) => (
            <span
              key={session.sessionId}
              title={`${session.displayName} is editing this block`}
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm"
              style={{ backgroundColor: session.color }}
            >
              {getCollaboratorInitials(session.displayName)}
            </span>
          ))}
        </div>
      )}

      {isLocked && primaryRemote && (
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
          <AlertCircle className="h-3.5 w-3.5" />
          Locked by {primaryRemote.displayName}
        </div>
      )}

      {isActive ? (
        <div className="relative">
          {block.type === 'card' ? (
            <div className="space-y-3">
              <CardPreview linkedCard={linkedCard} inline={inline} openSource={openSource} compact={false} />
              <p className="text-xs text-zinc-500">
                Card blocks are rendered inline. Use slash commands or the context drawer to insert another card.
              </p>
            </div>
          ) : block.type === 'divider' ? (
            <div className="space-y-3">
              <div className="h-px w-full bg-gradient-to-r from-transparent via-zinc-300 to-transparent" />
              <p className="text-xs text-zinc-500">Divider block. Press Enter to continue below it.</p>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={block.text}
              onChange={onChange}
              onBlur={onBlur}
              onKeyDown={onKeyDown}
              onInput={(event) => autoResizeEditor(event.currentTarget)}
              rows={1}
              className={`w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-zinc-300 ${
                block.type === 'heading'
                  ? (block.level ?? 2) === 1
                    ? 'text-4xl font-black tracking-tight text-zinc-950'
                    : 'text-2xl font-black tracking-tight text-zinc-950'
                  : block.type === 'code'
                    ? 'rounded-[1.5rem] border border-zinc-900/5 bg-zinc-950 px-4 py-4 font-mono text-xs leading-6 text-zinc-100'
                    : block.type === 'quote'
                      ? 'border-l-2 border-zinc-300 pl-4 text-sm italic leading-7 text-zinc-600'
                      : block.type === 'list-item'
                        ? 'text-sm leading-7 text-zinc-700'
                        : 'text-[15px] leading-8 text-zinc-700'
              }`}
              placeholder={placeholderForBlock(block.type)}
            />
          )}

          {slashVisible && (
            <div
              data-business-plan-block-shell
              className="absolute left-0 top-full z-20 mt-3 w-[min(20rem,calc(100vw-3rem))] overflow-hidden rounded-[1.25rem] border border-zinc-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.12)]"
            >
              <div className="border-b border-zinc-100 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Slash commands</p>
                <p className="mt-1 text-xs text-zinc-500">Formatting, insert blocks, and live cards.</p>
              </div>
              <div className="max-h-72 overflow-y-auto p-1.5">
                {slashItems.length > 0 ? (
                  slashItems.map((item, index) => (
                    <button
                      key={item.id}
                      ref={(node) => {
                        slashItemRefs.current[index] = node;
                      }}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onSlashSelect(item)}
                      onFocus={() => setSlashIndex(index)}
                      className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${
                        slashIndex === index ? 'bg-zinc-950 text-white' : 'text-zinc-700 hover:bg-zinc-50'
                      }`}
                    >
                      <div
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                          slashIndex === index ? 'border-white/10 bg-white/10' : 'border-zinc-200 bg-white'
                        }`}
                      >
                        {item.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-xs font-semibold ${slashIndex === index ? 'text-white' : 'text-zinc-950'}`}>
                            {item.label}
                          </p>
                          <span
                            className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] ${
                              slashIndex === index
                                ? 'border-white/10 bg-white/10 text-white/75'
                                : item.kind === 'card'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-zinc-200 bg-zinc-50 text-zinc-500'
                            }`}
                          >
                            {item.kind}
                          </span>
                        </div>
                        <p className={`mt-0.5 text-[11px] leading-snug ${slashIndex === index ? 'text-white/75' : 'text-zinc-500'}`}>
                          {item.description}
                        </p>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-3 py-4 text-sm text-zinc-500">
                    No commands matched this slash query.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : block.type === 'card' ? (
        <CardPreview linkedCard={linkedCard} inline={inline} openSource={openSource} compact />
      ) : (
        <div className="cursor-text" dangerouslySetInnerHTML={{ __html: renderBlockPreviewHtml(block) }} />
      )}
    </div>
  );
}

function ContextPanel({
  open,
  mobileOpen,
  onClose,
  linkPickerOpen,
  setLinkPickerOpen,
  linkQuery,
  setLinkQuery,
  linkSuggestions,
  linkedCards,
  inlineCardIds,
  openLinkedSource,
  attachContextLink,
  insertInlineCard,
  removeLink,
  outline,
  wordCount,
  coverage,
  requiredSections,
  editorTagsText,
  setEditorTagsText,
  handleTagsBlur,
  canEditSelectedPlan,
  visibleEditingSessions,
}: {
  open: boolean;
  mobileOpen: boolean;
  onClose: () => void;
  linkPickerOpen: boolean;
  setLinkPickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  linkQuery: string;
  setLinkQuery: React.Dispatch<React.SetStateAction<string>>;
  linkSuggestions: Array<{ candidate: LinkCandidate; score: number }>;
  linkedCards: LinkedCardSource[];
  inlineCardIds: Set<string>;
  openLinkedSource: (candidate: LinkCandidate) => void;
  attachContextLink: (candidate: LinkCandidate) => void;
  insertInlineCard: (candidate: LinkCandidate) => void;
  removeLink: (linkId: string) => void;
  outline: Array<{ id: string; level: number; title: string }>;
  wordCount: number;
  coverage: string;
  requiredSections: Array<{ label: string; keywords: readonly string[]; matched: boolean }>;
  editorTagsText: string;
  setEditorTagsText: React.Dispatch<React.SetStateAction<string>>;
  handleTagsBlur: () => void;
  canEditSelectedPlan: boolean;
  visibleEditingSessions: BusinessPlanEditingSession[];
}) {
  return (
    <>
      <aside
        className={`absolute inset-y-0 right-0 z-20 hidden w-[340px] shrink-0 border-l border-zinc-200 bg-white/95 backdrop-blur xl:flex ${
          open ? 'translate-x-0' : 'translate-x-full'
        } transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Preview and structure</p>
              <h3 className="mt-1 text-sm font-semibold text-zinc-950">Context drawer</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-zinc-200 bg-white p-2 text-zinc-500 transition hover:text-zinc-900"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <ContextDrawerContent
              linkPickerOpen={linkPickerOpen}
              setLinkPickerOpen={setLinkPickerOpen}
              linkQuery={linkQuery}
              setLinkQuery={setLinkQuery}
              linkSuggestions={linkSuggestions}
              linkedCards={linkedCards}
              inlineCardIds={inlineCardIds}
              openLinkedSource={openLinkedSource}
              attachContextLink={attachContextLink}
              insertInlineCard={insertInlineCard}
              removeLink={removeLink}
              outline={outline}
              wordCount={wordCount}
              coverage={coverage}
              requiredSections={requiredSections}
              editorTagsText={editorTagsText}
              setEditorTagsText={setEditorTagsText}
              handleTagsBlur={handleTagsBlur}
              canEditSelectedPlan={canEditSelectedPlan}
              visibleEditingSessions={visibleEditingSessions}
            />
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-30 bg-zinc-950/25 backdrop-blur-sm xl:hidden" onClick={onClose} />
          <div className="fixed inset-x-0 bottom-0 z-40 max-h-[82vh] rounded-t-[2rem] border border-zinc-200 bg-white shadow-[0_-20px_60px_rgba(15,23,42,0.12)] xl:hidden">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Preview and structure</p>
                <h3 className="mt-1 text-sm font-semibold text-zinc-950">Context drawer</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-zinc-200 bg-white p-2 text-zinc-500 transition hover:text-zinc-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[calc(82vh-72px)] overflow-y-auto px-5 py-5">
              <ContextDrawerContent
                linkPickerOpen={linkPickerOpen}
                setLinkPickerOpen={setLinkPickerOpen}
                linkQuery={linkQuery}
                setLinkQuery={setLinkQuery}
                linkSuggestions={linkSuggestions}
                linkedCards={linkedCards}
                inlineCardIds={inlineCardIds}
                openLinkedSource={openLinkedSource}
                attachContextLink={attachContextLink}
                insertInlineCard={insertInlineCard}
                removeLink={removeLink}
                outline={outline}
                wordCount={wordCount}
                coverage={coverage}
                requiredSections={requiredSections}
                editorTagsText={editorTagsText}
                setEditorTagsText={setEditorTagsText}
                handleTagsBlur={handleTagsBlur}
                canEditSelectedPlan={canEditSelectedPlan}
                visibleEditingSessions={visibleEditingSessions}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}

function ContextDrawerContent({
  linkPickerOpen,
  setLinkPickerOpen,
  linkQuery,
  setLinkQuery,
  linkSuggestions,
  linkedCards,
  inlineCardIds,
  openLinkedSource,
  attachContextLink,
  insertInlineCard,
  removeLink,
  outline,
  wordCount,
  coverage,
  requiredSections,
  editorTagsText,
  setEditorTagsText,
  handleTagsBlur,
  canEditSelectedPlan,
  visibleEditingSessions,
}: {
  linkPickerOpen: boolean;
  setLinkPickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  linkQuery: string;
  setLinkQuery: React.Dispatch<React.SetStateAction<string>>;
  linkSuggestions: Array<{ candidate: LinkCandidate; score: number }>;
  linkedCards: LinkedCardSource[];
  inlineCardIds: Set<string>;
  openLinkedSource: (candidate: LinkCandidate) => void;
  attachContextLink: (candidate: LinkCandidate) => void;
  insertInlineCard: (candidate: LinkCandidate) => void;
  removeLink: (linkId: string) => void;
  outline: Array<{ id: string; level: number; title: string }>;
  wordCount: number;
  coverage: string;
  requiredSections: Array<{ label: string; keywords: readonly string[]; matched: boolean }>;
  editorTagsText: string;
  setEditorTagsText: React.Dispatch<React.SetStateAction<string>>;
  handleTagsBlur: () => void;
  canEditSelectedPlan: boolean;
  visibleEditingSessions: BusinessPlanEditingSession[];
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50/80 p-4">
        <div className="grid grid-cols-3 gap-2">
          <MetricPill label="Words" value={wordCount} />
          <MetricPill label="Sections" value={outline.length} />
          <MetricPill label="Complete" value={coverage} />
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Sections</p>
        <div className="mt-3 space-y-2">
          {outline.length > 0 ? (
            outline.map((item) => (
              <div key={item.id} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <p
                  className="truncate text-sm font-medium text-zinc-900"
                  style={{ paddingLeft: `${Math.max(0, item.level - 1) * 10}px` }}
                >
                  {item.title}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-zinc-400">No headings yet. Use # for headings.</p>
          )}
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Plan checklist</p>
        <div className="mt-3 space-y-2">
          {requiredSections.map((section) => (
            <div key={section.label} className="flex items-center gap-3">
              <CheckCircle2 className={`h-4 w-4 shrink-0 ${section.matched ? 'text-emerald-500' : 'text-zinc-300'}`} />
              <span className={`text-sm ${section.matched ? 'text-zinc-700' : 'text-zinc-400'}`}>
                {section.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {visibleEditingSessions.length > 0 && (
        <div className="rounded-[1.5rem] border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">
            <Sparkles className="h-3.5 w-3.5" />
            Collaborators
          </div>
          <div className="mt-3 space-y-2">
            {visibleEditingSessions.map((session) => (
              <div key={session.sessionId} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ backgroundColor: session.color }}
                  >
                    {getCollaboratorInitials(session.displayName)}
                  </span>
                  <p className="truncate text-sm font-medium text-zinc-950">{session.displayName}</p>
                </div>
                <span className="text-[10px] text-zinc-400">
                  {formatRelativeTime(session.updatedAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-[1.5rem] border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Live cards</p>
            <p className="mt-1 text-xs text-zinc-500">
              Link records to this plan. Insert them inline for a linked view.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLinkPickerOpen((current) => !current)}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-[11px] font-semibold text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
          >
            <Plus className="h-3.5 w-3.5" />
            {linkPickerOpen ? 'Close' : 'Browse'}
          </button>
        </div>

        {linkPickerOpen && (
          <div className="mt-4 space-y-3">
            <SearchInput value={linkQuery} onChange={setLinkQuery} placeholder="Search tasks, sources, or teammates..." />
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {linkSuggestions.length > 0 ? (
                linkSuggestions.map(({ candidate, score }) => (
                  <div
                    key={businessPlanLinkKey(candidate.type, candidate.recordId)}
                    className="rounded-[1.25rem] border border-zinc-200 bg-zinc-50/70 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-zinc-950">{candidate.title}</p>
                        <p className="mt-1 text-xs leading-relaxed text-zinc-500">{candidate.summary}</p>
                      </div>
                      <span className="shrink-0 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-500">
                        {BUSINESS_PLAN_LINK_TYPE_LABELS[candidate.type]}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">{score} relevance</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={!canEditSelectedPlan}
                          onClick={() => attachContextLink(candidate)}
                          className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Link
                        </button>
                        <button
                          type="button"
                          disabled={!canEditSelectedPlan}
                          onClick={() => insertInlineCard(candidate)}
                          className="rounded-full border border-zinc-900 bg-zinc-900 px-2.5 py-1 text-[10px] font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Insert
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-5 text-sm text-zinc-500">
                  No live records matched the current document.
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 space-y-2">
          {linkedCards.length > 0 ? (
            linkedCards.map(({ source, link }) => (
              <div key={link.id} className="rounded-[1.25rem] border border-zinc-200 bg-zinc-50/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">
                      {BUSINESS_PLAN_LINK_TYPE_LABELS[source.type]}
                    </p>
                    <h4 className="mt-1 truncate text-sm font-semibold text-zinc-950">{source.title}</h4>
                  </div>
                  <div className="flex items-center gap-1">
                    {inlineCardIds.has(link.id) && (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-700">
                        Inline
                      </span>
                    )}
                    {source.route && (
                      <button
                        type="button"
                        onClick={() => openLinkedSource(source)}
                        className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" />
                        Open
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!canEditSelectedPlan}
                      onClick={() => removeLink(link.id)}
                      className="rounded-full border border-zinc-200 bg-white p-1.5 text-zinc-500 transition hover:border-zinc-300 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">{source.summary}</p>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-5 text-sm text-zinc-500">
              No live cards linked yet.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-zinc-200 bg-white p-4 shadow-sm">
        <label className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Tags</label>
        <div className="mt-3 min-h-[80px] rounded-[1.25rem] border border-zinc-200 bg-zinc-50 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {normalizeTags(editorTagsText).map((tag, index) => (
              <span
                key={`${tag}-${index}`}
                className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700"
              >
                {tag}
                {canEditSelectedPlan && (
                  <button
                    type="button"
                    onClick={() => {
                      const updated = normalizeTags(editorTagsText).filter((_, i) => i !== index);
                      setEditorTagsText(updated.join(', '));
                    }}
                    className="ml-1 rounded-full p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
          {canEditSelectedPlan && (
            <input
              type="text"
              value={editorTagsText}
              onChange={(event) => setEditorTagsText(event.target.value)}
              onBlur={handleTagsBlur}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ',') {
                  event.preventDefault();
                  handleTagsBlur();
                }
              }}
              className="mt-2 w-full bg-transparent text-sm text-zinc-700 outline-none placeholder:text-zinc-400"
              placeholder={normalizeTags(editorTagsText).length === 0 ? "Type tags, press Enter to add" : "Add more tags..."}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function CardPreview({
  linkedCard,
  inline,
  openSource,
  compact,
}: {
  linkedCard: LinkedCardSource | null;
  inline: boolean;
  openSource?: () => void;
  compact: boolean;
}) {
  if (!linkedCard) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-500">
        This card no longer points to a live record.
      </div>
    );
  }

  return (
    <div className={`rounded-[1.5rem] border border-zinc-200 bg-white ${compact ? 'p-4' : 'p-5'} shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
              {BUSINESS_PLAN_LINK_TYPE_LABELS[linkedCard.source.type]}
            </span>
            {inline && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                Inline
              </span>
            )}
          </div>
          <h4 className="mt-2 truncate text-sm font-semibold text-zinc-950">{linkedCard.source.title}</h4>
        </div>
        {openSource && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              openSource();
            }}
            className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            Open
          </button>
        )}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-zinc-500">{linkedCard.source.summary}</p>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[1.25rem] border border-zinc-200 bg-white px-3 py-2 text-center shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">{label}</p>
      <p className="mt-1 text-sm font-black tracking-tight text-zinc-950">{value}</p>
    </div>
  );
}

function StatusChip({ label, className }: { label: string; className: string }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${className}`}>
      {label}
    </span>
  );
}

function CollaboratorStack({ sessions }: { sessions: BusinessPlanEditingSession[] }) {
  if (sessions.length === 0) return null;

  return (
    <div className="flex items-center">
      {sessions.slice(0, 4).map((session, index) => (
        <span
          key={session.sessionId}
          title={session.displayName}
          className="-ml-2 inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-sm first:ml-0"
          style={{ backgroundColor: session.color, zIndex: 10 - index }}
        >
          {getCollaboratorInitials(session.displayName)}
        </span>
      ))}
    </div>
  );
}

function InlineActionButton({
  label,
  onClick,
  active,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition ${
        active
          ? 'border-zinc-900 bg-zinc-900 text-white'
          : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900'
      }`}
    >
      {label}
    </button>
  );
}

function InlineIconButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
    >
      {icon}
      {label}
    </button>
  );
}

function sortBusinessPlans(items: BusinessPlan[]) {
  return [...items].sort(
    (left, right) =>
      new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime(),
  );
}

function getSlashMenuItems(
  slashQuery: string | null,
  linkSuggestions: Array<{ candidate: LinkCandidate; score: number }>,
) {
  const queryText = slashQuery?.trim().toLowerCase() ?? '';

  const baseItems: SlashCommandItem[] = [
    {
      id: 'paragraph',
      label: 'Text',
      description: 'Convert this block to body text.',
      kind: 'format',
      icon: <FilePenLine className="h-3.5 w-3.5" />,
      searchText: 'text paragraph body',
      action: { type: 'set-block', blockType: 'paragraph' },
    },
    {
      id: 'heading1',
      label: 'Heading 1',
      description: 'Turn this into a top-level section heading.',
      kind: 'format',
      icon: <Heading1 className="h-3.5 w-3.5" />,
      searchText: 'heading h1 title section',
      action: { type: 'set-block', blockType: 'heading', level: 1 },
    },
    {
      id: 'heading2',
      label: 'Heading 2',
      description: 'Create a nested section heading.',
      kind: 'format',
      icon: <Heading2 className="h-3.5 w-3.5" />,
      searchText: 'heading h2 subsection',
      action: { type: 'set-block', blockType: 'heading', level: 2 },
    },
    {
      id: 'list',
      label: 'Bullet list',
      description: 'Convert this block to a bullet item.',
      kind: 'format',
      icon: <List className="h-3.5 w-3.5" />,
      searchText: 'list bullet checklist',
      action: { type: 'set-block', blockType: 'list-item', ordered: false },
    },
    {
      id: 'quote',
      label: 'Quote',
      description: 'Create a callout quote block.',
      kind: 'format',
      icon: <Quote className="h-3.5 w-3.5" />,
      searchText: 'quote callout',
      action: { type: 'set-block', blockType: 'quote' },
    },
    {
      id: 'code',
      label: 'Code block',
      description: 'Switch this block into code mode.',
      kind: 'format',
      icon: <Code2 className="h-3.5 w-3.5" />,
      searchText: 'code snippet block',
      action: { type: 'set-block', blockType: 'code' },
    },
    {
      id: 'divider',
      label: 'Divider',
      description: 'Insert a divider, then continue below it.',
      kind: 'insert',
      icon: <Minus className="h-3.5 w-3.5" />,
      searchText: 'divider separator break',
      action: { type: 'insert-divider' },
    },
  ];

  const cardItems: SlashCommandItem[] = linkSuggestions.slice(0, 6).map(({ candidate }) => ({
    id: `card-${candidate.type}-${candidate.recordId}`,
    label: `Insert ${candidate.title}`,
    description: `${BUSINESS_PLAN_LINK_TYPE_LABELS[candidate.type]} card`,
    kind: 'card',
    icon: <Plus className="h-3.5 w-3.5" />,
    searchText: candidate.searchText,
    action: { type: 'attach-card', candidate },
  }));

  return [...baseItems, ...cardItems].filter((item) => {
    if (!queryText) return true;
    return item.searchText.includes(queryText) || item.label.toLowerCase().includes(queryText);
  });
}

function buildSlashBlockDraft(current: BusinessPlanEditorBlock, action: Extract<SlashCommandAction, { type: 'set-block' }>) {
  if (action.blockType === 'heading') {
    return {
      ...current,
      type: 'heading' as const,
      level: action.level ?? 2,
      text: '',
      ordered: undefined,
      order: undefined,
      language: undefined,
      linkId: undefined,
    };
  }

  if (action.blockType === 'list-item') {
    return {
      ...current,
      type: 'list-item' as const,
      text: '',
      ordered: Boolean(action.ordered),
      order: action.ordered ? 1 : undefined,
      level: undefined,
      language: undefined,
      linkId: undefined,
    };
  }

  if (action.blockType === 'quote') {
    return {
      ...current,
      type: 'quote' as const,
      text: '',
      level: undefined,
      ordered: undefined,
      order: undefined,
      language: undefined,
      linkId: undefined,
    };
  }

  if (action.blockType === 'code') {
    return {
      ...current,
      type: 'code' as const,
      text: '',
      language: '',
      level: undefined,
      ordered: undefined,
      order: undefined,
      linkId: undefined,
    };
  }

  return {
    ...current,
    type: 'paragraph' as const,
    text: '',
    level: undefined,
    ordered: undefined,
    order: undefined,
    language: undefined,
    linkId: undefined,
  };
}

function getSlashQuery(block: BusinessPlanEditorBlock | null) {
  if (!block) return null;
  if (block.type === 'card' || block.type === 'divider' || block.type === 'code') return null;

  const trimmed = block.text.trim();
  if (!trimmed.startsWith('/')) return null;
  if (trimmed.includes('\n')) return null;

  return trimmed.slice(1);
}

function autoResizeEditor(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function focusEditor(
  mode: 'start' | 'end',
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  fallbackLength: number,
) {
  window.requestAnimationFrame(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    autoResizeEditor(textarea);
    textarea.focus();
    const position = mode === 'start' ? 0 : fallbackLength;
    textarea.setSelectionRange(position, position);
  });
}

function placeholderForBlock(type: BusinessPlanBlockType) {
  switch (type) {
    case 'heading':
      return 'Section heading';
    case 'list-item':
      return 'List item';
    case 'quote':
      return 'Quoted guidance';
    case 'code':
      return 'Code or structured example';
    default:
      return 'Type here. Slash opens commands.';
  }
}

function statusLabel(status: BusinessPlanStatus) {
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function summarizePlan(plan: BusinessPlan) {
  const trimmed = plan.summary.trim();
  if (trimmed) return trimmed;

  const firstHeading = extractOutlineFromBlocks(parseBusinessPlanBlocks(plan.content, plan.blockMap))[0]?.title;
  if (firstHeading) return firstHeading;

  const fallback = plan.content
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  return fallback || 'No summary yet.';
}

function normalizeTags(value: string) {
  const tags: string[] = [];
  const seen = new Set<string>();

  for (const raw of value.split(/[,;\n]/)) {
    const tag = raw.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= 20) break;
  }

  return tags;
}

function sameTagLists(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.map((tag) => tag.toLowerCase()).join('|') === right.map((tag) => tag.toLowerCase()).join('|');
}

function businessPlanLinkKey(type: BusinessPlanLinkType, recordId: string) {
  return `${type}:${recordId}`;
}

function getCollaboratorInitials(displayName: string) {
  const initials = displayName
    .trim()
    .split(/\s/)
    .map((part) => part[0])
    .filter((part): part is string => Boolean(part))
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return initials || '?';
}

function getSessionScopedValue(key: string, factory: () => string) {
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const next = factory();
    window.sessionStorage.setItem(key, next);
    return next;
  } catch {
    return factory();
  }
}

function getSaveLabel(saveIndicator: SaveIndicator, lastSavedAt: string | null) {
  if (saveIndicator === 'saving') return 'Saving';
  if (saveIndicator === 'error') return 'Save error';
  if (!lastSavedAt) return 'Saved';
  return `Saved ${formatRelativeTime(lastSavedAt)}`;
}

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return 'just now';

  const deltaMs = timestamp - Date.now();
  const absMinutes = Math.max(1, Math.round(Math.abs(deltaMs) / 60_000));

  if (absMinutes < 60) {
    return deltaMs < 0 ? `${absMinutes}m ago` : `in ${absMinutes}m`;
  }

  const absHours = Math.max(1, Math.round(absMinutes / 60));
  if (absHours < 24) {
    return deltaMs < 0 ? `${absHours}h ago` : `in ${absHours}h`;
  }

  const absDays = Math.max(1, Math.round(absHours / 24));
  if (absDays < 30) {
    return deltaMs < 0 ? `${absDays}d ago` : `in ${absDays}d`;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function buildBusinessPlanLinkCandidates(data: BusinessPlanWorkspaceData): LinkCandidate[] {
  return [
    ...data.tasks.map((task) =>
      createLinkCandidate(
        'task',
        task.id,
        task.title,
        task.executionNotes || `Status ${task.status.replace('-', ' ')}`,
        task.completedAt || task.createdAt,
        task.status,
        [task.title, task.status, task.executionNotes],
      ),
    ),
    ...data.cycleGoals.map((goal) =>
      createLinkCandidate(
        'cycleGoal',
        goal.id,
        goal.title,
        goal.description,
        goal.createdAt,
        goal.status,
        [goal.title, goal.description, goal.status],
      ),
    ),
    ...data.visions.map((vision) =>
      createLinkCandidate(
        'vision',
        vision.id,
        vision.title,
        vision.description,
        vision.createdAt,
        'Vision',
        [vision.title, vision.description, ...vision.focusItems],
      ),
    ),
    ...data.blogArticles.map((article) =>
      createLinkCandidate(
        'blogArticle',
        article.id,
        article.title,
        article.summary,
        article.updatedAt,
        article.status,
        [article.title, article.summary, article.content, ...article.tags],
      ),
    ),
    ...data.contextSources.map((source) =>
      createLinkCandidate(
        'contextSource',
        source.id,
        source.title,
        source.latestSummary,
        source.updatedAt,
        source.status,
        [source.title, source.latestSummary, source.latestFileName, ...source.aliases],
      ),
    ),
    ...data.apiEndpoints.map((endpoint) =>
      createLinkCandidate(
        'apiEndpoint',
        endpoint.id,
        `${endpoint.method} ${endpoint.path}`,
        endpoint.description,
        endpoint.createdAt,
        endpoint.status,
        [endpoint.method, endpoint.path, endpoint.description, endpoint.status],
      ),
    ),
    ...data.feedbacks.map((feedback) =>
      createLinkCandidate(
        'feedback',
        feedback.id,
        feedback.source,
        feedback.content,
        feedback.createdAt,
        feedback.sentiment,
        [feedback.source, feedback.content, feedback.sentiment],
      ),
    ),
    ...data.socialPosts.map((post) =>
      createLinkCandidate(
        'socialPost',
        post.id,
        post.platform,
        post.content,
        post.createdAt,
        post.status,
        [post.platform, post.content, post.status],
      ),
    ),
    ...data.prompts.map((prompt) =>
      createLinkCandidate(
        'prompt',
        prompt.id,
        prompt.title,
        prompt.version,
        prompt.createdAt,
        prompt.version,
        [prompt.title, prompt.version, prompt.content],
      ),
    ),
    ...data.timeBlocks.map((timeBlock) =>
      createLinkCandidate(
        'timeBlock',
        timeBlock.id,
        timeBlock.title,
        `${dayLabel(timeBlock.dayOfWeek)} • ${timeBlock.startTime} - ${timeBlock.endTime}`,
        timeBlock.createdAt,
        timeBlock.type,
        [timeBlock.title, timeBlock.type, dayLabel(timeBlock.dayOfWeek)],
      ),
    ),
    ...data.environments.map((environment) =>
      createLinkCandidate(
        'environment',
        environment.id,
        environment.name,
        `${environment.status} • ${environment.version}`,
        environment.lastSync,
        environment.status,
        [environment.name, environment.status, environment.version],
      ),
    ),
    ...data.teamMembers.map((member) =>
      createLinkCandidate(
        'teamMember',
        member.id,
        member.displayName,
        member.role,
        member.createdAt,
        member.role,
        [member.displayName, member.email, member.role],
      ),
    ),
  ];
}

function createLinkCandidate(
  type: BusinessPlanLinkType,
  recordId: string,
  title: string,
  summary: string,
  updatedAt: string,
  statusLabel: string | undefined,
  haystack: Array<string | undefined>,
): LinkCandidate {
  return {
    type,
    recordId,
    title: title.trim() || 'Untitled',
    summary: summary.trim() || 'No summary available.',
    statusLabel,
    updatedAt,
    route: BUSINESS_PLAN_LINK_TYPE_ROUTES[type],
    searchText: haystack.filter((item): item is string => Boolean(item)).join(' ').toLowerCase(),
  };
}

function scoreBusinessPlanLinkCandidate(candidate: LinkCandidate, planText: string, query: string) {
  let score = freshnessScore(candidate.updatedAt);
  const haystack = candidate.searchText;

  BUSINESS_PLAN_LINK_TYPE_HINTS[candidate.type].forEach((hint) => {
    if (planText.includes(hint)) {
      score = 14;
    }
  });

  if (query) {
    if (candidate.title.toLowerCase().includes(query)) score = 30;
    if (haystack.includes(query)) score = 18;
  }

  if (!query && planText.includes(candidate.title.toLowerCase())) {
    score = 12;
  }

  return score;
}

function freshnessScore(value: string) {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return 0;

  const ageDays = Math.max(0, (Date.now() - timestamp) / 86_400_000);
  if (ageDays <= 3) return 16;
  if (ageDays <= 14) return 10;
  if (ageDays <= 45) return 6;
  return 2;
}

function dayLabel(dayOfWeek: number) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek] ?? 'Day';
}
