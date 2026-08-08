import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { Bug as BugIcon, Check, Edit2, FolderCode, Link2, Plus, Search, Sparkles, Target, Trash2, TriangleAlert, X, ChevronRight, CheckCircle2, Circle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { auth, db } from '../firebase';
import { useGlobalState } from '../contexts/GlobalStateContext';
import { useUser } from '../contexts/UserContext';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { FilterBar } from '../components/ui/FilterBar';
import { CustomSelect } from '../components/ui/CustomSelect';
import { Input } from '../components/ui/Input';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { StudioHeader } from '../components/ui/StudioHeader';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import {
  BUG_SEVERITY_LABELS,
  BUG_SEVERITY_OPTIONS,
  BUG_CODE_LINK_TYPE_LABELS,
  BUG_CODE_LINK_TYPES,
  BUG_STATUS_LABELS,
  BUG_STATUS_OPTIONS,
  ROADMAP_PHASE_LABELS,
  ROADMAP_PHASE_OPTIONS,
  ROADMAP_PRIORITY_LABELS,
  ROADMAP_PRIORITY_OPTIONS,
  ROADMAP_STATUS_LABELS,
  ROADMAP_STATUS_OPTIONS,
  formatLinkedTaskIds,
  normalizeBugCodeLinks,
  parseLinkedTaskIds,
} from '../utils/technicalStudio';
import type { Bug, BugCodeLink, RoadmapItem, Task } from '../types';

type BugFormState = {
  title: string;
  description: string;
  severity: Bug['severity'];
  status: Bug['status'];
  resolutionNotes: string;
  linkedTaskIds: string;
  codeLinks: BugCodeLink[];
};

type RoadmapFormState = {
  title: string;
  description: string;
  phase: RoadmapItem['phase'];
  priority: RoadmapItem['priority'];
  status: RoadmapItem['status'];
  linkedTaskIds: string;
};

const DEFAULT_BUG_FORM: BugFormState = {
  title: '',
  description: '',
  severity: 'medium',
  status: 'open',
  resolutionNotes: '',
  linkedTaskIds: '',
  codeLinks: [],
};

const DEFAULT_ROADMAP_FORM: RoadmapFormState = {
  title: '',
  description: '',
  phase: 'next',
  priority: 'medium',
  status: 'planned',
  linkedTaskIds: '',
};

const FIELD_LABEL = 'text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400';
const PRIMARY_BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY_BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50';
const TEXTAREA_CLASS =
  'min-h-[96px] w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10';

const BUG_STATUS_OPTIONS_WITH_ALL = [
  { value: 'all', label: 'All statuses' },
  ...BUG_STATUS_OPTIONS.map((value) => ({ value, label: BUG_STATUS_LABELS[value] })),
];

const BUG_SEVERITY_OPTIONS_WITH_ALL = [
  { value: 'all', label: 'All severities' },
  ...BUG_SEVERITY_OPTIONS.map((value) => ({ value, label: BUG_SEVERITY_LABELS[value] })),
];

const ROADMAP_PHASE_OPTIONS_WITH_ALL = [
  { value: 'all', label: 'All phases' },
  ...ROADMAP_PHASE_OPTIONS.map((value) => ({ value, label: ROADMAP_PHASE_LABELS[value] })),
];

const ROADMAP_PRIORITY_OPTIONS_WITH_ALL = [
  { value: 'all', label: 'All priorities' },
  ...ROADMAP_PRIORITY_OPTIONS.map((value) => ({ value, label: ROADMAP_PRIORITY_LABELS[value] })),
];

const ROADMAP_STATUS_OPTIONS_WITH_ALL = [
  { value: 'all', label: 'All statuses' },
  ...ROADMAP_STATUS_OPTIONS.map((value) => ({ value, label: ROADMAP_STATUS_LABELS[value] })),
];

function TaskMultiSelector({ tasks, value, onChange }: { tasks: Task[]; value: string; onChange: (val: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  
  const selectedIds = useMemo(() => parseLinkedTaskIds(value), [value]);

  const toggleTask = (taskId: string) => {
    const next = selectedIds.includes(taskId)
      ? selectedIds.filter((id) => id !== taskId)
      : [...selectedIds, taskId];
    onChange(formatLinkedTaskIds(next));
  };

  const removeTask = (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    onChange(formatLinkedTaskIds(selectedIds.filter((id) => id !== taskId)));
  };

  const filteredTasks = useMemo(() => {
    const needle = search.toLowerCase().trim();
    if (!needle) return tasks;
    return tasks.filter((t) => t.title.toLowerCase().includes(needle) || t.id.toLowerCase().includes(needle));
  }, [search, tasks]);

  useEffect(() => {
    if (!isOpen) return;
    const clickHandler = () => setIsOpen(false);
    document.addEventListener('click', clickHandler);
    return () => document.removeEventListener('click', clickHandler);
  }, [isOpen]);

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <span className={FIELD_LABEL}>Linked tasks</span>
      <div 
        className="mt-1.5 flex min-h-[42px] w-full flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 cursor-pointer transition focus-within:border-zinc-400 focus-within:ring-2 focus-within:ring-zinc-900/10 hover:border-zinc-300"
        onClick={() => setIsOpen(true)}
      >
        {selectedIds.length === 0 && <span className="text-sm text-zinc-400">Select tasks...</span>}
        {selectedIds.map((taskId) => {
           const task = tasks.find((t) => t.id === taskId);
           return (
             <span key={taskId} className="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-800" onClick={(e) => e.stopPropagation()}>
               {task?.title || taskId}
               <button type="button" onClick={(e) => removeTask(e, taskId)} className="ml-0.5 rounded-sm hover:bg-zinc-200 hover:text-zinc-900">
                 <X className="h-3 w-3" />
               </button>
             </span>
           );
        })}
      </div>

      {isOpen && (
        <div className="absolute z-[99] mt-1 w-full rounded-xl border border-zinc-200 bg-white p-2 shadow-xl">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg bg-zinc-50 py-2 pl-9 pr-3 text-sm outline-none focus:bg-zinc-100"
              placeholder="Search tasks..."
            />
          </div>
          <div className="mt-2 max-h-48 overflow-y-auto w-full">
            {filteredTasks.length === 0 ? (
              <p className="p-3 text-center text-sm text-zinc-500">No tasks found.</p>
            ) : (
              <ul className="space-y-1">
                {filteredTasks.map((task) => {
                  const isSelected = selectedIds.includes(task.id);
                  return (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => toggleTask(task.id)}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-50 ${isSelected ? 'bg-zinc-50 font-medium text-zinc-900' : 'text-zinc-600'}`}
                      >
                        <span className="truncate pr-4 leading-relaxed">{task.title}</span>
                        {isSelected && <Check className="h-4 w-4 shrink-0 text-zinc-900" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="mt-2 flex justify-end border-t border-zinc-100 pt-2">
            <button type="button" onClick={() => setIsOpen(false)} className="px-2 py-1 text-xs font-semibold text-zinc-500 hover:text-zinc-900">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CodeLinkEditor({ value, onChange }: { value: BugCodeLink[]; onChange: (value: BugCodeLink[]) => void }) {
  const links = Array.isArray(value) ? value : [];

  const addLink = () => {
    onChange([...links, { type: 'directory', url: '', label: '', notes: '' }]);
  };

  const updateLink = (index: number, patch: Partial<BugCodeLink>) => {
    onChange(links.map((link, currentIndex) => currentIndex === index ? { ...link, ...patch } : link));
  };

  const removeLink = (index: number) => {
    onChange(links.filter((_, currentIndex) => currentIndex !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className={FIELD_LABEL}>Code links</span>
        <button
          type="button"
          onClick={addLink}
          className="inline-flex h-7 items-center justify-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>

      <div className="space-y-3">
        {links.map((link, index) => (
          <div key={index} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_2rem] gap-2">
              <CustomSelect
                value={link.type || 'directory'}
                onChange={(type) => updateLink(index, { type: type as BugCodeLink['type'] })}
                options={BUG_CODE_LINK_TYPES.map((type) => ({ value: type, label: BUG_CODE_LINK_TYPE_LABELS[type] }))}
                className="w-full"
              />
              <button
                type="button"
                onClick={() => removeLink(index)}
                className="inline-flex h-10 w-8 items-center justify-center rounded-md text-zinc-400 transition hover:bg-red-50 hover:text-red-500"
                aria-label="Remove code link"
                title="Remove code link"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              type="text"
              value={link.label || ''}
              onChange={(event) => updateLink(index, { label: event.target.value })}
              placeholder="Label"
              className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10"
            />
            <input
              type="text"
              value={link.url || ''}
              onChange={(event) => updateLink(index, { url: event.target.value })}
              placeholder="URL or path"
              className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10"
            />
            <textarea
              value={link.notes || ''}
              onChange={(event) => updateLink(index, { notes: event.target.value })}
              placeholder="Notes"
              className="mt-2 min-h-[72px] w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function PinnedSearchInput({
  value,
  onChange,
  placeholder,
  pinLabel,
  onClearPin,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  pinLabel?: string;
  onClearPin?: () => void;
}) {
  return (
    <div className="flex w-full items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 transition-colors focus-within:border-zinc-400 focus-within:bg-white">
      <Search className="h-4 w-4 shrink-0 text-zinc-400" />
      {pinLabel ? (
        <div className="flex max-w-[48%] shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
          <span className="truncate">{pinLabel}</span>
          {onClearPin ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onClearPin();
              }}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900"
              aria-label={`Clear ${pinLabel}`}
              title={`Clear ${pinLabel}`}
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      ) : null}
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 border-0 bg-transparent p-0 text-xs font-medium text-zinc-900 placeholder:text-zinc-400 outline-none focus:ring-0"
      />
    </div>
  );
}

function nowIso() {
  return new Date().toISOString();
}

function bugStatusClass(status: Bug['status']) {
  switch (status) {
    case 'open': return 'text-rose-700 border-rose-200 bg-rose-50';
    case 'triaged': return 'text-amber-700 border-amber-200 bg-amber-50';
    case 'in-progress': return 'text-blue-700 border-blue-200 bg-blue-50';
    case 'blocked': return 'text-red-700 border-red-200 bg-red-50';
    case 'resolved': return 'text-emerald-700 border-emerald-200 bg-emerald-50';
    case 'closed': return 'text-zinc-700 border-zinc-200 bg-zinc-50';
    default: return 'text-zinc-700 border-zinc-200 bg-zinc-50';
  }
}

function StyledBadge({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${className}`}>{children}</span>;
}

function bugSeverityClass(severity: Bug['severity']) {
  switch (severity) {
    case 'low': return 'text-zinc-700 border-zinc-200 bg-zinc-50';
    case 'medium': return 'text-amber-700 border-amber-200 bg-amber-50';
    case 'high': return 'text-orange-700 border-orange-200 bg-orange-50';
    case 'critical': return 'text-red-700 border-red-200 bg-red-50';
    default: return 'text-zinc-700 border-zinc-200 bg-zinc-50';
  }
}

function roadmapPhaseClass(phase: RoadmapItem['phase']) {
  switch (phase) {
    case 'now': return 'text-blue-700 border-blue-200 bg-blue-50';
    case 'next': return 'text-violet-700 border-violet-200 bg-violet-50';
    case 'later': return 'text-zinc-700 border-zinc-200 bg-zinc-50';
    default: return 'text-zinc-700 border-zinc-200 bg-zinc-50';
  }
}

function roadmapPriorityClass(priority: RoadmapItem['priority']) {
  switch (priority) {
    case 'low': return 'text-zinc-700 border-zinc-200 bg-zinc-50';
    case 'medium': return 'text-amber-700 border-amber-200 bg-amber-50';
    case 'high': return 'text-red-700 border-red-200 bg-red-50';
    default: return 'text-zinc-700 border-zinc-200 bg-zinc-50';
  }
}

function roadmapStatusClass(status: RoadmapItem['status']) {
  switch (status) {
    case 'planned': return 'text-zinc-700 border-zinc-200 bg-zinc-50';
    case 'building': return 'text-blue-700 border-blue-200 bg-blue-50';
    case 'blocked': return 'text-red-700 border-red-200 bg-red-50';
    case 'shipped': return 'text-emerald-700 border-emerald-200 bg-emerald-50';
    default: return 'text-zinc-700 border-zinc-200 bg-zinc-50';
  }
}

function bugToForm(bug: Bug): BugFormState {
  return {
    title: bug.title,
    description: bug.description,
    severity: bug.severity,
    status: bug.status,
    resolutionNotes: bug.resolutionNotes,
    linkedTaskIds: formatLinkedTaskIds(Array.isArray(bug.linkedTaskIds) ? bug.linkedTaskIds : []),
    codeLinks: normalizeBugCodeLinks(bug.codeLinks),
  };
}

function roadmapToForm(item: RoadmapItem): RoadmapFormState {
  return { title: item.title, description: item.description, phase: item.phase, priority: item.priority, status: item.status, linkedTaskIds: formatLinkedTaskIds(item.linkedTaskIds) };
}

function bugCodeLinkSearchText(bug: Bug) {
  return normalizeBugCodeLinks(bug.codeLinks)
    .map((link) => [link.type, link.label, link.url, link.notes].filter(Boolean).join(' '))
    .join(' ');
}

export function TechnicalStudioPage() {
  const { bugs, roadmapItems, tasks } = useGlobalState();
  const { userProfile } = useUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const bugIdParam = searchParams.get('bugId');
  const roadmapItemIdParam = searchParams.get('roadmapItemId');
  
  const [activeTab, setActiveTab] = useState<'bugs'|'roadmap'>('bugs');
  const [pinnedBugId, setPinnedBugId] = useState<string | null>(null);
  const [pinnedRoadmapItemId, setPinnedRoadmapItemId] = useState<string | null>(null);
  
  // Bug States
  const [bugSearch, setBugSearch] = useState('');
  const [bugStatusF, setBugStatusF] = useState('all');
  const [bugSeverityF, setBugSeverityF] = useState('all');
  const [selectedBugId, setSelectedBugId] = useState<string | null>(null);
  const [bugDraft, setBugDraft] = useState<BugFormState>(DEFAULT_BUG_FORM);
  const [isBugSaving, setIsBugSaving] = useState(false);
  const [isBugDrawerOpen, setIsBugDrawerOpen] = useState(false);

  // Roadmap States
  const [rmSearch, setRmSearch] = useState('');
  const [rmPhaseF, setRmPhaseF] = useState('all');
  const [rmStatusF, setRmStatusF] = useState('all');
  const [selectedRmId, setSelectedRmId] = useState<string | null>(null);
  const [rmDraft, setRmDraft] = useState<RoadmapFormState>(DEFAULT_ROADMAP_FORM);
  const [isRmSaving, setIsRmSaving] = useState(false);
  const [isRmDrawerOpen, setIsRmDrawerOpen] = useState(false);

  const currentUserId = userProfile?.id || auth.currentUser?.uid || '';
  const companyId = userProfile?.companyId;

  const clearPinnedBug = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('bugId');
    setSearchParams(nextParams, { replace: true });
  };

  const clearPinnedRoadmapItem = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('roadmapItemId');
    setSearchParams(nextParams, { replace: true });
  };

  useEffect(() => {
    if (bugIdParam) {
      setActiveTab('bugs');
      setPinnedBugId(bugIdParam);
      setPinnedRoadmapItemId(null);
      setSelectedBugId(bugIdParam);
      setSelectedRmId(null);
      setIsBugDrawerOpen(false);
      setIsRmDrawerOpen(false);
      return;
    }

    if (roadmapItemIdParam) {
      setActiveTab('roadmap');
      setPinnedBugId(null);
      setPinnedRoadmapItemId(roadmapItemIdParam);
      setSelectedBugId(null);
      setSelectedRmId(roadmapItemIdParam);
      setIsBugDrawerOpen(false);
      setIsRmDrawerOpen(false);
      return;
    }

    setPinnedBugId(null);
    setPinnedRoadmapItemId(null);
    setSelectedBugId(null);
    setSelectedRmId(null);
    setIsBugDrawerOpen(false);
    setIsRmDrawerOpen(false);
  }, [bugIdParam, roadmapItemIdParam]);

  const filteredBugs = useMemo(() => {
    const q = bugSearch.toLowerCase().trim();
    return bugs.filter(b => {
      if (pinnedBugId && b.id !== pinnedBugId) return false;
      if (bugStatusF !== 'all' && b.status !== bugStatusF) return false;
      if (bugSeverityF !== 'all' && b.severity !== bugSeverityF) return false;
      if (!q) return true;
      return (b.title + ' ' + b.description + ' ' + b.resolutionNotes + ' ' + bugCodeLinkSearchText(b)).toLowerCase().includes(q);
    }).sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [bugs, bugSearch, bugStatusF, bugSeverityF, pinnedBugId]);

  const filteredRoadmaps = useMemo(() => {
    const q = rmSearch.toLowerCase().trim();
    return roadmapItems.filter(r => {
      if (pinnedRoadmapItemId && r.id !== pinnedRoadmapItemId) return false;
      if (rmPhaseF !== 'all' && r.phase !== rmPhaseF) return false;
      if (rmStatusF !== 'all' && r.status !== rmStatusF) return false;
      if (!q) return true;
      return (r.title + ' ' + r.description).toLowerCase().includes(q);
    }).sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [roadmapItems, rmSearch, rmPhaseF, rmStatusF, pinnedRoadmapItemId]);

  const openNewBug = () => {
    setActiveTab('bugs');
    setSelectedBugId(null);
    setBugDraft(DEFAULT_BUG_FORM);
    setIsBugDrawerOpen(true);
  };

  const editBug = (bug: Bug) => {
    setSelectedBugId(bug.id);
    setBugDraft(bugToForm(bug));
    setIsBugDrawerOpen(true);
  };

  const saveBug = async () => {
    if (!bugDraft.title.trim() || !currentUserId) return;
    setIsBugSaving(true);
    const payload = {
      title: bugDraft.title.trim(),
      description: bugDraft.description.trim(),
      severity: bugDraft.severity,
      status: bugDraft.status,
      resolutionNotes: bugDraft.resolutionNotes.trim(),
      linkedTaskIds: parseLinkedTaskIds(bugDraft.linkedTaskIds),
      codeLinks: normalizeBugCodeLinks(bugDraft.codeLinks),
      updatedAt: nowIso(),
      authorId: currentUserId,
      ...(companyId ? { companyId } : {})
    };
    try {
      if (selectedBugId) {
        const og = bugs.find(b => b.id === selectedBugId);
        await updateDoc(doc(db, 'bugs', selectedBugId), {
           ...payload,
           createdAt: og?.createdAt || nowIso(),
        });
      } else {
        const res = await addDoc(collection(db, 'bugs'), { ...payload, createdAt: nowIso() });
        setSelectedBugId(res.id);
      }
      setIsBugDrawerOpen(false);
    } catch (e) {
      handleFirestoreError(e, selectedBugId ? OperationType.UPDATE : OperationType.CREATE, 'bugs');
    } finally {
      setIsBugSaving(false);
    }
  };

  const deleteBug = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete bug?')) return;
    await deleteDoc(doc(db, 'bugs', id));
    if (selectedBugId === id) setIsBugDrawerOpen(false);
  };

  const openNewRm = () => {
    setActiveTab('roadmap');
    setSelectedRmId(null);
    setRmDraft(DEFAULT_ROADMAP_FORM);
    setIsRmDrawerOpen(true);
  };

  const editRm = (item: RoadmapItem) => {
    setSelectedRmId(item.id);
    setRmDraft(roadmapToForm(item));
    setIsRmDrawerOpen(true);
  };

  const saveRm = async () => {
    if (!rmDraft.title.trim() || !currentUserId) return;
    setIsRmSaving(true);
    const payload = {
      title: rmDraft.title.trim(),
      description: rmDraft.description.trim(),
      phase: rmDraft.phase,
      priority: rmDraft.priority,
      status: rmDraft.status,
      linkedTaskIds: parseLinkedTaskIds(rmDraft.linkedTaskIds),
      updatedAt: nowIso(),
      authorId: currentUserId,
      ...(companyId ? { companyId } : {})
    };
    try {
      if (selectedRmId) {
        const og = roadmapItems.find(r => r.id === selectedRmId);
        await updateDoc(doc(db, 'roadmapItems', selectedRmId), { ...payload, createdAt: og?.createdAt || nowIso() });
      } else {
        const res = await addDoc(collection(db, 'roadmapItems'), { ...payload, createdAt: nowIso() });
        setSelectedRmId(res.id);
      }
      setIsRmDrawerOpen(false);
    } catch (e) {
      handleFirestoreError(e, selectedRmId ? OperationType.UPDATE : OperationType.CREATE, 'roadmapItems');
    } finally {
      setIsRmSaving(false);
    }
  };

  const deleteRm = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete feature?')) return;
    await deleteDoc(doc(db, 'roadmapItems', id));
    if (selectedRmId === id) setIsRmDrawerOpen(false);
  };

  return (
    <div className="flex h-full flex-col bg-white text-zinc-900 font-sans md:border-l border-zinc-200 overflow-hidden">
      <StudioHeader
        badge="Technical Studio"
        badgeIcon={<BugIcon className="h-3.5 w-3.5" />}
        title="Engineering Hub"
        subtitle="Manage execution bugs and strategic feature rollouts natively."
        actions={
          <div className="flex items-center gap-2">
            <button type="button" onClick={openNewBug} className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 shadow-sm">
              <BugIcon className="h-3.5 w-3.5 text-amber-500" /> Bug
            </button>
            <button type="button" onClick={openNewRm} className="inline-flex items-center justify-center gap-2 rounded-md bg-zinc-900 border border-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800 shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-blue-400" /> Feature
            </button>
          </div>
        }
      />

      <div className="flex items-center justify-between border-b border-zinc-200 bg-white shrink-0 px-4 py-2.5 gap-3 overflow-x-auto scrollbar-hide flex-wrap lg:flex-nowrap">
         <SegmentedControl 
            options={[{value:'bugs', label:'Bugs'}, {value:'roadmap', label:'Roadmap'}]} 
            value={activeTab} 
            onChange={(val) => {
              setActiveTab(val as any);
              setIsBugDrawerOpen(false);
              setIsRmDrawerOpen(false);
            }} 
            className="w-full lg:w-48 shrink-0"
         />
         
         <div className="w-px h-6 bg-zinc-200 hidden lg:block shrink-0" />

         <div className="flex items-center gap-2 w-full lg:w-auto">
          {activeTab === 'bugs' ? (
              <>
                <div className="w-48 shrink-0">
                   <PinnedSearchInput
                     value={bugSearch}
                     onChange={setBugSearch}
                     placeholder="Search bugs..."
                     pinLabel={pinnedBugId ? `Bug ID: ${pinnedBugId}` : undefined}
                     onClearPin={pinnedBugId ? clearPinnedBug : undefined}
                   />
                </div>
                 <CustomSelect value={bugStatusF} onChange={setBugStatusF} options={BUG_STATUS_OPTIONS_WITH_ALL} className="w-48 shrink-0" />
                 <CustomSelect value={bugSeverityF} onChange={setBugSeverityF} options={BUG_SEVERITY_OPTIONS_WITH_ALL} className="w-48 shrink-0" />
              </>
            ) : (
              <>
                <div className="w-48 shrink-0">
                  <PinnedSearchInput
                    value={rmSearch}
                    onChange={setRmSearch}
                    placeholder="Search features..."
                    pinLabel={pinnedRoadmapItemId ? `Feature ID: ${pinnedRoadmapItemId}` : undefined}
                    onClearPin={pinnedRoadmapItemId ? clearPinnedRoadmapItem : undefined}
                  />
                </div>
                 <CustomSelect value={rmPhaseF} onChange={setRmPhaseF} options={ROADMAP_PHASE_OPTIONS_WITH_ALL} className="w-48 shrink-0" />
                 <CustomSelect value={rmStatusF} onChange={setRmStatusF} options={ROADMAP_STATUS_OPTIONS_WITH_ALL} className="w-48 shrink-0" />
             </>
           )}
         </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        <div className={`flex-1 overflow-y-auto bg-zinc-50/50 ${(isBugDrawerOpen || isRmDrawerOpen) ? 'hidden lg:block' : 'block'}`}>
           {activeTab === 'bugs' && (
             filteredBugs.length === 0 ? (
               <EmptyState icon={<BugIcon className="w-6 h-6 text-zinc-300"/>} title="No bugs found" subtitle="Hooray! The queue is clean." />
             ) : (
               <div className="flex flex-col divide-y divide-zinc-100">
                  {filteredBugs.map((bug) => {
                    const linkedTaskIds = Array.isArray(bug.linkedTaskIds) ? bug.linkedTaskIds : [];
                    const codeLinks = normalizeBugCodeLinks(bug.codeLinks);

                    return (
                    <div 
                      key={bug.id} 
                      id={`bug-${bug.id}`}
                      onClick={() => editBug(bug)}
                      className={`flex items-center gap-3 px-5 py-3.5 hover:bg-zinc-100/50 cursor-pointer transition-colors ${selectedBugId === bug.id ? 'bg-zinc-100 ring-1 ring-inset ring-zinc-200' : 'bg-white'}`}
                    >
                     <Circle className={`w-4 h-4 shrink-0 mt-0.5 ${bug.status === 'resolved' || bug.status === 'closed' ? 'text-zinc-300' : 'text-zinc-400'}`} />
                     <div className="flex-1 min-w-0">
                       <h4 className={`text-sm font-medium ${bug.status === 'resolved' || bug.status === 'closed' ? 'text-zinc-400 line-through' : 'text-zinc-900'} truncate`}>{bug.title}</h4>
                       <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                         <StyledBadge className={bugSeverityClass(bug.severity)}>{BUG_SEVERITY_LABELS[bug.severity]}</StyledBadge>
                         <StyledBadge className={bugStatusClass(bug.status)}>{BUG_STATUS_LABELS[bug.status]}</StyledBadge>
                         {linkedTaskIds.length > 0 && (
                           <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500 font-medium">
                             <Link2 className="h-3 w-3" /> {linkedTaskIds.length} task{linkedTaskIds.length === 1 ? '' : 's'}
                           </span>
                         )}
                         {codeLinks.length > 0 && (
                           <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500 font-medium">
                             <FolderCode className="h-3 w-3" /> {codeLinks.length} code
                           </span>
                         )}
                       </div>
                     </div>
                     <button onClick={(e) => deleteBug(bug.id, e)} className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition whitespace-nowrap">
                       <Trash2 className="w-4 h-4" />
                     </button>
                   </div>
                    );
                  })}
               </div>
             )
           )}

           {activeTab === 'roadmap' && (
             filteredRoadmaps.length === 0 ? (
               <EmptyState icon={<Sparkles className="w-6 h-6 text-zinc-300"/>} title="No features planned" subtitle="Your roadmap looks extremely empty." />
             ) : (
               <div className="flex flex-col divide-y divide-zinc-100">
                  {filteredRoadmaps.map(item => (
                    <div 
                      key={item.id} 
                      id={`roadmap-${item.id}`}
                      onClick={() => editRm(item)}
                      className={`flex items-center gap-3 px-5 py-3.5 hover:bg-zinc-100/50 cursor-pointer transition-colors ${selectedRmId === item.id ? 'bg-zinc-100 ring-1 ring-inset ring-zinc-200' : 'bg-white'}`}
                    >
                     <Sparkles className={`w-4 h-4 shrink-0 mt-0.5 ${item.status === 'shipped' ? 'text-emerald-500' : 'text-blue-500'}`} />
                     <div className="flex-1 min-w-0">
                       <h4 className={`text-sm font-medium ${item.status === 'shipped' ? 'text-zinc-400' : 'text-zinc-900'} truncate`}>{item.title}</h4>
                       <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                         <StyledBadge className={roadmapPhaseClass(item.phase)}>{ROADMAP_PHASE_LABELS[item.phase]}</StyledBadge>
                         <StyledBadge className={roadmapStatusClass(item.status)}>{ROADMAP_STATUS_LABELS[item.status]}</StyledBadge>
                         <StyledBadge className={roadmapPriorityClass(item.priority)}>{ROADMAP_PRIORITY_LABELS[item.priority]}</StyledBadge>
                         {item.linkedTaskIds.length > 0 && (
                           <span className="text-[10px] text-zinc-500 font-medium">
                             🔗 {item.linkedTaskIds.length} link{item.linkedTaskIds.length === 1 ? '' : 's'}
                           </span>
                         )}
                       </div>
                     </div>
                     <button onClick={(e) => deleteRm(item.id, e)} className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition whitespace-nowrap">
                       <Trash2 className="w-4 h-4" />
                     </button>
                   </div>
                 ))}
               </div>
             )
           )}
        </div>

        {/* Drawer / Inspector */}
        {activeTab === 'bugs' && isBugDrawerOpen && (
          <div className="w-full lg:w-[400px] border-l border-zinc-200 bg-white flex flex-col shrink-0 absolute lg:static inset-0 z-20">
            <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between sticky top-0 bg-white z-10 shadow-sm">
               <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 flex items-center gap-1.5">
                 <BugIcon className="w-4 h-4 text-amber-500" />
                 {selectedBugId ? 'Edit Bug' : 'New Bug'}
               </h3>
               <button onClick={() => setIsBugDrawerOpen(false)} className="p-1 rounded hover:bg-zinc-100 text-zinc-500 transition">
                 <ChevronRight className="w-5 h-5" />
               </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 pb-10 space-y-5">
               <label className="block space-y-1.5">
                 <span className={FIELD_LABEL}>Title</span>
                 <input type="text" value={bugDraft.title} onChange={e => setBugDraft(p => ({...p, title:e.target.value}))} placeholder="E.g. Auth failing on Safari" className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10" />
               </label>

               <div className="grid grid-cols-2 gap-4">
                 <label className="block space-y-1.5">
                   <span className={FIELD_LABEL}>Severity</span>
                    <CustomSelect value={bugDraft.severity} onChange={v => setBugDraft(p => ({...p, severity: v as any}))} options={BUG_SEVERITY_OPTIONS.map(v => ({value:v, label:BUG_SEVERITY_LABELS[v]}))} className="w-full" />
                 </label>
                 <label className="block space-y-1.5">
                   <span className={FIELD_LABEL}>Status</span>
                    <CustomSelect value={bugDraft.status} onChange={v => setBugDraft(p => ({...p, status: v as any}))} options={BUG_STATUS_OPTIONS.map(v => ({value:v, label:BUG_STATUS_LABELS[v]}))} className="w-full" />
                 </label>
               </div>

               <div className="pt-2">
                 <TaskMultiSelector tasks={tasks} value={bugDraft.linkedTaskIds} onChange={v => setBugDraft(p => ({...p, linkedTaskIds: v}))} />
               </div>

               <div className="pt-2">
                 <CodeLinkEditor value={bugDraft.codeLinks} onChange={value => setBugDraft(p => ({...p, codeLinks: value}))} />
               </div>

               <label className="block space-y-1.5">
                 <span className={FIELD_LABEL}>Description</span>
                 <textarea value={bugDraft.description} onChange={e => setBugDraft(p => ({...p, description:e.target.value}))} placeholder="What failed, how to reproduce..." className={TEXTAREA_CLASS} />
               </label>
               
               <label className="block space-y-1.5">
                 <span className={FIELD_LABEL}>Resolution Notes</span>
                 <textarea value={bugDraft.resolutionNotes} onChange={e => setBugDraft(p => ({...p, resolutionNotes:e.target.value}))} placeholder="How was it fixed? What was learned?" className={TEXTAREA_CLASS} />
               </label>
            </div>

            <div className="p-4 border-t border-zinc-200 bg-zinc-50 flex items-center justify-end gap-3 sticky bottom-0">
               <button onClick={() => setIsBugDrawerOpen(false)} className={SECONDARY_BUTTON}>Cancel</button>
               <button onClick={saveBug} disabled={isBugSaving || !bugDraft.title.trim()} className={PRIMARY_BUTTON}>
                 {isBugSaving ? 'Saving...' : 'Save Bug'}
               </button>
            </div>
          </div>
        )}

        {activeTab === 'roadmap' && isRmDrawerOpen && (
          <div className="w-full lg:w-[400px] border-l border-zinc-200 bg-white flex flex-col shrink-0 absolute lg:static inset-0 z-20">
            <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between sticky top-0 bg-white z-10 shadow-sm">
               <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 flex items-center gap-1.5">
                 <Sparkles className="w-4 h-4 text-blue-500" />
                 {selectedRmId ? 'Edit Feature' : 'New Feature'}
               </h3>
               <button onClick={() => setIsRmDrawerOpen(false)} className="p-1 rounded hover:bg-zinc-100 text-zinc-500 transition">
                 <ChevronRight className="w-5 h-5" />
               </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 pb-10 space-y-5">
               <label className="block space-y-1.5">
                 <span className={FIELD_LABEL}>Title</span>
                 <input type="text" value={rmDraft.title} onChange={e => setRmDraft(p => ({...p, title:e.target.value}))} placeholder="E.g. OAuth 2.0 Integration" className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10" />
               </label>

               <div className="grid grid-cols-2 gap-4">
                 <label className="block space-y-1.5">
                   <span className={FIELD_LABEL}>Phase</span>
                    <CustomSelect value={rmDraft.phase} onChange={v => setRmDraft(p => ({...p, phase: v as any}))} options={ROADMAP_PHASE_OPTIONS.map(v => ({value:v, label:ROADMAP_PHASE_LABELS[v]}))} className="w-full" />
                 </label>
                 <label className="block space-y-1.5">
                   <span className={FIELD_LABEL}>Status</span>
                    <CustomSelect value={rmDraft.status} onChange={v => setRmDraft(p => ({...p, status: v as any}))} options={ROADMAP_STATUS_OPTIONS.map(v => ({value:v, label:ROADMAP_STATUS_LABELS[v]}))} className="w-full" />
                 </label>
                 <label className="block space-y-1.5 col-span-2">
                   <span className={FIELD_LABEL}>Priority</span>
                    <CustomSelect value={rmDraft.priority} onChange={v => setRmDraft(p => ({...p, priority: v as any}))} options={ROADMAP_PRIORITY_OPTIONS.map(v => ({value:v, label:ROADMAP_PRIORITY_LABELS[v]}))} className="w-full" />
                 </label>
               </div>

               <div className="pt-2">
                 <TaskMultiSelector tasks={tasks} value={rmDraft.linkedTaskIds} onChange={v => setRmDraft(p => ({...p, linkedTaskIds: v}))} />
               </div>

               <label className="block space-y-1.5">
                 <span className={FIELD_LABEL}>Description</span>
                 <textarea value={rmDraft.description} onChange={e => setRmDraft(p => ({...p, description:e.target.value}))} placeholder="Why is this feature important?" className={TEXTAREA_CLASS} />
               </label>
            </div>

            <div className="p-4 border-t border-zinc-200 bg-zinc-50 flex items-center justify-end gap-3 sticky bottom-0">
               <button onClick={() => setIsRmDrawerOpen(false)} className={SECONDARY_BUTTON}>Cancel</button>
               <button onClick={saveRm} disabled={isRmSaving || !rmDraft.title.trim()} className={PRIMARY_BUTTON}>
                 {isRmSaving ? 'Saving...' : 'Save Feature'}
               </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
