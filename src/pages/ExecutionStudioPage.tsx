import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Circle,
  Clock3,
  Edit2,
  Plus,
  Target,
  Trash2,
  User,
  Users,
  Wrench,
  X,
  Zap,
  Filter,
  ArrowDownUp,
  Search
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useGlobalState } from '../contexts/GlobalStateContext';
import { useUser } from '../contexts/UserContext';
import { Task, CycleGoal, Vision } from '../types';
import { executionDataService } from '../services/executionDataService';
import { ActiveTasksWidget } from '../components/widgets/ActiveTasksWidget';
import { CycleProgressWidget } from '../components/widgets/CycleProgressWidget';
import { TimeBlockingWidget } from '../components/widgets/TimeBlockingWidget';
import { WeeklyIdentityVisionWidget } from '../components/widgets/WeeklyIdentityVisionWidget';
import { ExecutionScorecardWidget } from '../components/widgets/ExecutionScorecardWidget';
import { CustomSelect } from '../components/ui/CustomSelect';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { StudioHeader } from '../components/ui/StudioHeader';
import { EditorToolbar } from '../components/ui/EditorToolbar';
import { EditorArea } from '../components/ui/EditorArea';
import { InspectorPanel } from '../components/ui/InspectorPanel';
import { SearchInput } from '../components/ui/SearchInput';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { FilterBar } from '../components/ui/FilterBar';
import { FilterSelect } from '../components/ui/FilterSelect';

type TaskFormState = {
  title: string;
  effortPoints: 1 | 2 | 3 | 5 | 8;
  isLeadIndicator: boolean;
  cycleGoalId: string;
  status: Task['status'];
  assigneeId: string;
};

type GoalFormState = {
  title: string;
  description: string;
};

type VisionFormState = {
  title: string;
  description: string;
  focusItems: string[];
};

const DEFAULT_TASK_FORM: TaskFormState = {
  title: '',
  effortPoints: 1,
  isLeadIndicator: false,
  cycleGoalId: '',
  status: 'icebox',
  assigneeId: '',
};

const DEFAULT_GOAL_FORM: GoalFormState = {
  title: '',
  description: '',
};

const DEFAULT_VISION_FORM: VisionFormState = {
  title: '',
  description: '',
  focusItems: [''],
};

export function ExecutionStudioPage() {
  const { tasks, cycleGoals, visions, teamMembers: globalTeamMembers } = useGlobalState();
  const { userProfile } = useUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const teamMembers = globalTeamMembers.length > 0
    ? globalTeamMembers
    : userProfile
      ? [userProfile]
      : [];
  const [activeTab, setActiveTab] = useState<'zen' | 'planning' | 'intelligence'>('zen');

  const [taskForm, setTaskForm] = useState<TaskFormState>(DEFAULT_TASK_FORM);
  const [goalForm, setGoalForm] = useState<GoalFormState>(DEFAULT_GOAL_FORM);
  const [visionForm, setVisionForm] = useState<VisionFormState>(DEFAULT_VISION_FORM);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editingVisionId, setEditingVisionId] = useState<string | null>(null);

  // Zen Mode States
  const [selectedTask, setSelectedTask] = useState<Task | null>(() => {
    const taskId = searchParams.get('taskId');
    if (taskId && tasks.length > 0) {
      return tasks.find(t => t.id === taskId) || null;
    }
    return null;
  });
  const [showMobileOverlay, setShowMobileOverlay] = useState(false);
  const [executionNotes, setExecutionNotes] = useState('');
  const [isCommiting, setIsCommiting] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const reportMutationError = (error: unknown) => {
    console.error('[ExecutionStudio] Mutation failed:', error);
    setMutationError(error instanceof Error ? error.message : 'The change could not be saved.');
  };

  // Zen Mode Filtering & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'todo' | 'in-progress' | 'lead'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [queueSort, setQueueSort] = useState<'smart' | 'effort-desc' | 'effort-asc' | 'recent'>('smart');

  const activeTasks = useMemo(() => tasks.filter((task) => task.status !== 'icebox'), [tasks]);
  
  const filteredAndSortedTasks = useMemo(() => {
    let result = [...activeTasks];

    // Apply Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t => t.title.toLowerCase().includes(q));
    }

    // Apply Filters
    if (assigneeFilter !== 'all') {
      if (assigneeFilter === 'mine' && userProfile) {
        result = result.filter(t => t.assigneeId === userProfile.id);
      } else if (assigneeFilter === 'unassigned') {
        result = result.filter(t => !t.assigneeId);
      } else {
        result = result.filter(t => t.assigneeId === assigneeFilter);
      }
    }

    if (statusFilter !== 'all') {
      if (statusFilter === 'lead') {
        result = result.filter(t => t.isLeadIndicator);
      } else {
        result = result.filter(t => t.status === statusFilter);
      }
    }

    // Apply Sort
    result.sort((a, b) => {
      if (queueSort === 'smart') {
        const currentUser = userProfile?.id;
        const aIsMine = currentUser ? a.assigneeId === currentUser : false;
        const bIsMine = currentUser ? b.assigneeId === currentUser : false;

        // 1. Prioritize tasks assigned to me
        if (aIsMine && !bIsMine) return -1;
        if (!aIsMine && bIsMine) return 1;

        // 2. Status Priority
        const getRank = (t: typeof activeTasks[0]) => {
          if (t.status === 'in-progress') return 1;
          if (t.status === 'todo' && !t.isLeadIndicator) return 2;
          if (t.isLeadIndicator && t.status !== 'done') return 3;
          if (t.status === 'done') return 4;
          return 5;
        };

        const rankA = getRank(a);
        const rankB = getRank(b);

        if (rankA !== rankB) return rankA - rankB;

        // Fallbacks
        if (a.effortPoints !== b.effortPoints) return b.effortPoints - a.effortPoints;
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeA - timeB;
      }
      if (queueSort === 'effort-desc') return b.effortPoints - a.effortPoints;
      if (queueSort === 'effort-asc') return a.effortPoints - b.effortPoints;
      if (queueSort === 'recent') {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      }
      return 0;
    });

    return result;
  }, [activeTasks, searchQuery, statusFilter, assigneeFilter, queueSort]);
  const iceboxTasks = useMemo(() => tasks.filter((task) => task.status === 'icebox'), [tasks]);
  const activeGoals = useMemo(() => cycleGoals.filter((goal) => goal.status === 'active'), [cycleGoals]);
  const currentWeekVision = useMemo(() => visions[0] ?? null, [visions]);

  const executionScore = useMemo(() => {
    const finishedTasks = tasks.filter((task) => task.status === 'done').length;
    return tasks.length > 0 ? Math.round((finishedTasks / tasks.length) * 100) : 0;
  }, [tasks]);

  const editingTask = useMemo(() => tasks.find((task) => task.id === editingTaskId) ?? null, [editingTaskId, tasks]);

  useEffect(() => {
    const urlTaskId = searchParams.get('taskId');
    if (urlTaskId && tasks.length > 0 && !selectedTask) {
      const task = tasks.find(t => t.id === urlTaskId);
      if (task) {
        setSelectedTask(task);
        setShowMobileOverlay(true);
      }
    }
  }, [tasks, searchParams, selectedTask]);

  useEffect(() => {
    if (selectedTask) {
      setSearchParams({ taskId: selectedTask.id }, { replace: true });
    } else {
      const params = new URLSearchParams(searchParams);
      params.delete('taskId');
      setSearchParams(params, { replace: true });
    }
  }, [selectedTask, setSearchParams, searchParams]);

  useEffect(() => {
    if (selectedTask) {
      const updated = tasks.find((t) => t.id === selectedTask.id);
      if (updated) setSelectedTask(updated);
    }
  }, [tasks, selectedTask?.id]);

  useEffect(() => {
    if (selectedTask) {
      setExecutionNotes(selectedTask.executionNotes || '');
    } else {
      setExecutionNotes('');
    }
  }, [selectedTask?.id]);

  // Auto-save notes
  useEffect(() => {
    if (!selectedTask || isCommiting || executionNotes === (selectedTask.executionNotes || '')) return;

    const saveTimer = setTimeout(() => {
      executionDataService.updateTask(selectedTask.id, { executionNotes })
        .catch((error) => reportMutationError(error));
    }, 1000);

    return () => clearTimeout(saveTimer);
  }, [executionNotes, selectedTask, isCommiting]);

  const selectTask = (task: Task) => {
    setSelectedTask(task);
    setShowMobileOverlay(true);
  };

  const closeTask = () => {
    setShowMobileOverlay(false);
    setTimeout(() => setSelectedTask(null), 300);
  };

  const handleCommit = async () => {
    if (!selectedTask) return;
    setIsCommiting(true);
    try {
      await executionDataService.updateTask(selectedTask.id, {
        status: 'done',
        completedAt: new Date().toISOString(),
        executionNotes,
      }, selectedTask.cycleGoalId);
      closeTask();
    } catch (error) {
      reportMutationError(error);
    } finally {
      setIsCommiting(false);
    }
  };

  const handleTaskSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!taskForm.title.trim() || !userProfile) return;

    const companyId = userProfile?.companyId ?? null;
    const payload = {
      title: taskForm.title.trim(),
      status: editingTask ? taskForm.status : taskForm.cycleGoalId ? ('todo' as const) : ('icebox' as const),
      effortPoints: taskForm.effortPoints,
      isLeadIndicator: taskForm.isLeadIndicator,
      cycleGoalId: taskForm.cycleGoalId || null,
      assigneeId: taskForm.assigneeId || null,
      completedAt: editingTask && taskForm.status === 'done' ? editingTask.completedAt ?? new Date().toISOString() : null,
    };

    try {
      if (editingTaskId) {
        const oldGoalId = editingTask?.cycleGoalId;
        await executionDataService.updateTask(editingTaskId, payload, oldGoalId);
      } else {
        await executionDataService.createTask(payload, {
          userId: userProfile.id,
          workspaceId: companyId ?? undefined,
        });
      }
      setTaskForm(DEFAULT_TASK_FORM);
      setEditingTaskId(null);
    } catch (error) {
      reportMutationError(error);
    }
  };

  const handleGoalSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!goalForm.title.trim() || !userProfile) return;

    const companyId = userProfile?.companyId ?? null;

    try {
      if (editingGoalId) {
        await executionDataService.updateCycleGoal(editingGoalId, {
          title: goalForm.title.trim(),
          description: goalForm.description.trim(),
        });
      } else {
        await executionDataService.createCycleGoal({
          title: goalForm.title.trim(),
          description: goalForm.description.trim(),
          status: 'active',
        }, {
          userId: userProfile.id,
          workspaceId: companyId ?? undefined,
        });
      }
      setGoalForm(DEFAULT_GOAL_FORM);
      setEditingGoalId(null);
    } catch (error) {
      reportMutationError(error);
    }
  };

  const toggleTaskStatus = async (task: Task, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      let nextStatus = task.status;
      if (task.status === 'done') nextStatus = task.cycleGoalId ? 'todo' : 'icebox';
      else if (task.status === 'todo' || task.status === 'in-progress' || task.status === 'icebox') nextStatus = 'done';

      await executionDataService.updateTask(task.id, {
        status: nextStatus,
        completedAt: nextStatus === 'done' ? new Date().toISOString() : null,
      }, task.cycleGoalId);
    } catch (error) {
      reportMutationError(error);
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      await executionDataService.deleteTask(taskId);
      if (editingTaskId === taskId) resetTaskForm();
    } catch (error) {
      reportMutationError(error);
    }
  };

  const toggleGoalStatus = async (goal: CycleGoal) => {
    try {
      const nextStatus = goal.status === 'completed' ? 'active' : 'completed';
      await executionDataService.updateCycleGoal(goal.id, {
        status: nextStatus,
      });
    } catch (error) {
      reportMutationError(error);
    }
  };

  const deleteGoal = async (goalId: string) => {
    try {
      await executionDataService.deleteCycleGoal(goalId);
      if (editingGoalId === goalId) resetGoalForm();
    } catch (error) {
      reportMutationError(error);
    }
  };

  const startEditingTask = (task: Task) => {
    setActiveTab('planning');
    setEditingTaskId(task.id);
    setTaskForm({
      title: task.title,
      effortPoints: task.effortPoints,
      isLeadIndicator: task.isLeadIndicator,
      cycleGoalId: task.cycleGoalId ?? '',
      status: task.status,
      assigneeId: task.assigneeId ?? '',
    });
    document.getElementById('task-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const resetTaskForm = () => {
    setTaskForm(DEFAULT_TASK_FORM);
    setEditingTaskId(null);
  };

  const startEditingGoal = (goal: CycleGoal) => {
    setEditingGoalId(goal.id);
    setGoalForm({
      title: goal.title,
      description: goal.description,
    });
  };

  const resetGoalForm = () => {
    setGoalForm(DEFAULT_GOAL_FORM);
    setEditingGoalId(null);
  };

  const handleVisionFocusItemChange = (index: number, value: string) => {
    const updatedItems = [...visionForm.focusItems];
    updatedItems[index] = value;
    setVisionForm({ ...visionForm, focusItems: updatedItems });
  };

  const addVisionFocusItem = () => {
    setVisionForm({ ...visionForm, focusItems: [...visionForm.focusItems, ''] });
  };

  const removeVisionFocusItem = (index: number) => {
    const updatedItems = visionForm.focusItems.filter((_, i) => i !== index);
    setVisionForm({ ...visionForm, focusItems: updatedItems.length ? updatedItems : [''] });
  };

  const handleVisionSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!visionForm.title.trim() || !userProfile) return;

    const companyId = userProfile?.companyId ?? null;
    const filteredFocusItems = visionForm.focusItems.filter(item => item.trim() !== '');

    try {
      if (editingVisionId) {
        await executionDataService.updateVision(editingVisionId, {
          title: visionForm.title.trim(),
          description: visionForm.description.trim(),
          focusItems: filteredFocusItems,
        });
      } else if (currentWeekVision) {
        await executionDataService.deleteVision(currentWeekVision.id);
        await executionDataService.createVision({
          title: visionForm.title.trim(),
          description: visionForm.description.trim(),
          focusItems: filteredFocusItems,
        }, {
          userId: userProfile.id,
          workspaceId: companyId ?? undefined,
        });
      } else {
        await executionDataService.createVision({
          title: visionForm.title.trim(),
          description: visionForm.description.trim(),
          focusItems: filteredFocusItems,
        }, {
          userId: userProfile.id,
          workspaceId: companyId ?? undefined,
        });
      }
      setVisionForm(DEFAULT_VISION_FORM);
      setEditingVisionId(null);
    } catch (error) {
      reportMutationError(error);
    }
  };

  const startEditingVision = (vision: Vision) => {
    setEditingVisionId(vision.id);
    setVisionForm({
      title: vision.title,
      description: vision.description,
      focusItems: vision.focusItems?.length ? vision.focusItems : [''],
    });
    document.getElementById('vision-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const resetVisionForm = () => {
    setVisionForm(DEFAULT_VISION_FORM);
    setEditingVisionId(null);
  };

  const deleteVision = async (visionId: string) => {
    try {
      await executionDataService.deleteVision(visionId);
      if (editingVisionId === visionId) resetVisionForm();
    } catch (error) {
      reportMutationError(error);
    }
  };

  return (
    <div className="relative flex-1 flex flex-col bg-zinc-50 h-full min-h-0 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(24,24,27,0.08),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(161,161,170,0.09),transparent_25%)]" />
      {mutationError && (
        <button
          type="button"
          onClick={() => setMutationError(null)}
          className="absolute right-4 top-4 z-50 max-w-sm rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-800 shadow-lg"
        >
          {mutationError}
        </button>
      )}

      {/* Navigation Header */}
      <StudioHeader
        showNotifications={import.meta.env.VITE_REPLOFY_PLATFORM !== 'standalone'}
        badge="Execution Studio"
        badgeIcon={<Wrench className="h-3.5 w-3.5" />}
        title="Design, Plan, and Execute the Cycle."
        actions={
          <div className="flex bg-zinc-100 p-1 rounded-full w-full md:w-auto">
            {[
              { id: 'zen', label: 'Zen Mode' },
              { id: 'planning', label: 'Planning & Forms' },
              { id: 'intelligence', label: 'Intelligence' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 md:flex-none px-4 py-2 rounded-full text-xs font-bold uppercase tracking-[0.24em] transition-all duration-200 ${
                  activeTab === tab.id ? 'bg-white text-zinc-950 shadow-sm border border-zinc-200' : 'text-zinc-500 hover:text-zinc-900 border border-transparent'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="relative flex-1 flex flex-col min-h-0 w-full overflow-hidden">
        
        {/* ZEN MODE (SPLIT PANE) */}
        {activeTab === 'zen' && (
           <div className="flex flex-1 flex-col md:flex-row h-full overflow-hidden animate-in fade-in slide-in-from-bottom-2">
             {/* Left Queue */}
             <div className="flex w-full md:w-[35%] lg:w-[30%] flex-col border-r border-zinc-200 bg-white shrink-0 overflow-y-auto">
                <StudioHeader
                  showNotifications={import.meta.env.VITE_REPLOFY_PLATFORM !== 'standalone'}
                  badge="Active Queue"
                  badgeIcon={<Zap className="h-3.5 w-3.5" />}
                  title="Queue"
                  subtitle={`${filteredAndSortedTasks.length} task${filteredAndSortedTasks.length !== 1 && 's'} ready for execution`}
                />

                {/* Filters and Actions */}
                <FilterBar>
                  <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search tasks..."
                  />
                  
                  <SegmentedControl
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'todo', label: 'Todo' },
                      { value: 'in-progress', label: 'In Progress' },
                      { value: 'lead', label: 'Leads' },
                    ]}
                  />

                  <div className="flex gap-2">
                    <FilterSelect
                      value={assigneeFilter}
                      onChange={setAssigneeFilter}
                      options={[
                        { value: 'all', label: 'All Assignees' },
                        { value: 'mine', label: 'Just Me' },
                        { value: 'unassigned', label: 'Unassigned' },
                        ...teamMembers.map(m => ({ value: m.id, label: m.displayName || m.email }))
                      ]}
                    />
                    <FilterSelect
                      value={queueSort}
                      onChange={setQueueSort}
                      options={[
                        { value: 'smart', label: 'Smart Sort' },
                        { value: 'effort-desc', label: 'Highest Effort' },
                        { value: 'effort-asc', label: 'Lowest Effort' },
                        { value: 'recent', label: 'Most Recent' }
                      ]}
                    />
                  </div>
                </FilterBar>
                <div className="flex flex-col">
                  {filteredAndSortedTasks.map(task => {
                    const isSelected = selectedTask?.id === task.id;
                    return (
                      <button
                        key={task.id}
                        onClick={() => selectTask(task)}
                        className={`group w-full text-left px-4 py-3 border-b border-zinc-200 transition-colors ${
                          isSelected
                            ? 'bg-white border-l-2 border-l-zinc-900 shadow-sm relative z-10'
                            : 'bg-transparent border-l-2 border-l-transparent hover:bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div onClick={(e) => { e.stopPropagation(); toggleTaskStatus(task, e); }} className={`mt-0.5 shrink-0 transition-colors ${isSelected ? 'text-zinc-500 hover:text-zinc-900' : 'text-zinc-300 hover:text-zinc-950'}`}>
                              {task.status === 'done' ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`text-xs font-semibold truncate ${isSelected ? 'text-zinc-900' : 'text-zinc-700'}`}>{task.title}</p>
                              <div className="mt-1 flex items-center gap-2">
                                {task.isLeadIndicator && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm border border-zinc-200 bg-zinc-50 uppercase tracking-[0.24em] text-zinc-600">
                                    Lead
                                  </span>
                                )}
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm border border-zinc-200 bg-zinc-50 uppercase tracking-[0.24em] text-zinc-600">
                                  {task.effortPoints} pts
                                </span>
                                {task.assigneeId && (
                                  <span className="text-[10px] text-zinc-500">
                                    {teamMembers.find(m => m.id === task.assigneeId)?.displayName || 'Unknown'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
            </div>

            {/* Right Execution Surface (Desktop) */}
            <div className="hidden md:flex flex-1 flex-col overflow-y-auto bg-transparent relative w-full h-full">
              {selectedTask ? (
                <>
                  <EditorToolbar
                    badge="Execution Document"
                    rightActions={
                      <button onClick={closeTask} className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-500 hover:text-zinc-900 focus:outline-none">Close focus</button>
                    }
                  />
                  <div className="mx-auto w-full max-w-4xl flex flex-col min-h-full p-12 pb-32 animate-in fade-in">
                     <div className="mb-10 space-y-4">
                       <h2 className="text-3xl md:text-5xl font-black tracking-tight text-zinc-950 leading-[1.1]">{selectedTask.title}</h2>
                     </div>
                     <div className="flex-1 flex flex-col space-y-4 mb-8">
                       <label className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Work Output / Context Notebook</label>
                       <textarea
                         value={executionNotes}
                         onChange={(e) => setExecutionNotes(e.target.value)}
                         placeholder="Draft PRs, copy links, or focus here. Press Commit to close."
                         className="w-full flex-1 min-h-[400px] resize-none bg-transparent text-lg md:text-xl font-medium leading-relaxed text-zinc-900 placeholder:text-zinc-300 outline-none focus:ring-0"
                       />
                     </div>
                     <div className="mt-auto pt-6 flex justify-between items-center border-t border-zinc-200">
                       <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">{selectedTask.effortPoints} Points</div>
                       <button onClick={handleCommit} disabled={isCommiting} className="px-8 py-4 rounded-full bg-zinc-950 text-sm font-bold text-white shadow-xl hover:bg-zinc-800 transition-all disabled:opacity-50">
                         {isCommiting ? 'Committing...' : 'Commit Work & Close'}
                       </button>
                     </div>
                  </div>
                </>
              ) : (
                <>
                  <EditorToolbar badge="Zen Mode" />
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                    <div className="h-16 w-16 rounded-[2rem] border-2 border-zinc-200 bg-white flex items-center justify-center mb-6 shadow-sm"><Zap className="h-6 w-6 text-zinc-400" /></div>
                    <h2 className="text-xl font-black tracking-tight text-zinc-950">Zen Mode Active</h2>
                    <p className="mt-2 text-sm text-zinc-500 max-w-sm">Select a task from your active queue to surface the distraction-free execution document.</p>
                  </div>
                </>
              )}
            </div>

            {/* Mobile BottomSheet Overlay */}
            <div className={`md:hidden fixed inset-0 z-50 bg-white transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] flex flex-col ${showMobileOverlay ? 'translate-y-0' : 'translate-y-full'}`}>
              {selectedTask && (
                <>
                  <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-100 shrink-0"><button onClick={closeTask} className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-500 focus:outline-none">Close focus</button></div>
                  <div className="flex-1 overflow-y-auto px-6 py-8 pb-32">
                     <h2 className="text-3xl font-black text-zinc-950 leading-tight mb-8">{selectedTask.title}</h2>
                     <textarea value={executionNotes} onChange={e=>setExecutionNotes(e.target.value)} className="w-full h-64 bg-transparent outline-none text-lg text-zinc-900 placeholder:text-zinc-300" placeholder="Focus here..." />
                  </div>
                  <div className="fixed bottom-0 left-0 right-0 p-4 border-t border-zinc-100 bg-white/90 backdrop-blur">
                     <button onClick={handleCommit} disabled={isCommiting} className="w-full py-4 rounded-full bg-zinc-950 text-sm font-bold text-white transition-all">{isCommiting ? 'Committing...' : 'Commit Work'}</button>
                  </div>
                </>
              )}
            </div>
           </div>
        )}

        {/* PLANNING & FORMS */}
        {activeTab === 'planning' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12 animate-in fade-in">
             <div className="mx-auto max-w-5xl space-y-8 pb-20">
               
               <div id="task-form" className="rounded-[2rem] border border-zinc-200 bg-white p-6 md:p-8 shadow-sm">
                 <div className="mb-6">
                   <h2 className="text-xl font-black tracking-tight text-zinc-950">{editingTaskId ? 'Edit Task' : 'Create Task'}</h2>
                   <p className="mt-1 text-sm text-zinc-500">Inject new work into the cycle.</p>
                 </div>
                 <form onSubmit={handleTaskSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Task Title</label>
                    <input type="text" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="What needs to move forward?" className="w-full border-b border-zinc-200 bg-transparent py-3 text-lg font-medium outline-none transition focus:border-zinc-900" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Cycle Goal</label>
                      <CustomSelect value={taskForm.cycleGoalId} onChange={(v) => setTaskForm({ ...taskForm, cycleGoalId: v })} options={[{ label: 'Icebox (No Goal)', value: '' }, ...cycleGoals.map(g => ({ label: g.title, value: g.id }))] } placeholder="Link to goal" />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Efford</label>
                      <CustomSelect value={String(taskForm.effortPoints)} onChange={(v) => setTaskForm({ ...taskForm, effortPoints: Number(v) as any })} options={[{ label: '1 pt', value: '1' }, { label: '2 pts', value: '2' }, { label: '3 pts', value: '3' }, { label: '5 pts', value: '5' }]} placeholder="Points" />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Assignee</label>
                      <CustomSelect value={taskForm.assigneeId} onChange={(v) => setTaskForm({ ...taskForm, assigneeId: v })} options={[{ label: 'Unassigned', value: '' }, ...teamMembers.map(m => ({ label: m.displayName || m.email, value: m.id }))] } placeholder="Unassigned" />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 border-t border-zinc-100 pt-6">
                    <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700 cursor-pointer">
                      <input type="checkbox" checked={taskForm.isLeadIndicator} onChange={e => setTaskForm({...taskForm, isLeadIndicator: e.target.checked})} className="rounded border-zinc-300 text-zinc-950 focus:ring-zinc-900" />
                      Lead Indicator
                    </label>
                  </div>
                  <div className="flex gap-3">
                    <button type="submit" className="rounded-full bg-zinc-950 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 transition">{editingTaskId ? 'Update task' : 'Add to queue'}</button>
                    {editingTaskId && <button type="button" onClick={resetTaskForm} className="rounded-full border border-zinc-200 bg-white px-6 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition">Cancel</button>}
                  </div>
                 </form>
               </div>

               <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                 {/* Goal Form */}
                 <div className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm">
                   <h2 className="text-xl font-black text-zinc-950 mb-6">{editingGoalId ? 'Edit Cycle Goal' : 'Create Cycle Goal'}</h2>
                   <form onSubmit={handleGoalSubmit} className="space-y-6">
                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Goal Title</label>
                        <input type="text" value={goalForm.title} onChange={e=>setGoalForm({...goalForm, title: e.target.value})} className="w-full border-b border-zinc-200 bg-transparent py-2 text-lg font-medium outline-none border-zinc-900 transition" placeholder="Deliver feature..." />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Outcome Details</label>
                        <textarea value={goalForm.description} onChange={e=>setGoalForm({...goalForm, description: e.target.value})} className="w-full border-b border-zinc-200 bg-transparent py-2 text-sm font-medium outline-none border-zinc-900 transition min-h-[60px]" placeholder="Success metrics..." />
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" className="rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-zinc-800 transition">{editingGoalId ? 'Update' : 'Create'}</button>
                        {editingGoalId && <button type="button" onClick={resetGoalForm} className="rounded-full bg-zinc-100 px-5 py-2.5 text-sm font-bold text-zinc-800">Cancel</button>}
                      </div>
                   </form>
                 </div>
                 
                 {/* Goals List */}
                 <div className="rounded-[2rem] border border-zinc-200 bg-zinc-50 p-6 shadow-sm overflow-hidden flex flex-col max-h-[500px]">
                   <h2 className="text-xl font-black text-zinc-950 mb-4 shrink-0">Active Goals</h2>
                   <div className="overflow-y-auto space-y-2 flex-1 pr-2">
                     {activeGoals.map(goal => (
                        <div key={goal.id} className="group p-4 bg-white border border-zinc-200 rounded-[2rem]">
                         <div className="flex justify-between items-start gap-4">
                           <div className="min-w-0 flex-1">
                             <h3 className="font-bold text-zinc-950 truncate">{goal.title}</h3>
                             <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{goal.description}</p>
                           </div>
                            <div className="flex shrink-0 opacity-0 group-hover:opacity-100 transition">
                              <button onClick={()=>toggleGoalStatus(goal)} className="p-1.5 text-emerald-500 hover:text-emerald-700" title="Complete goal"><CheckCircle2 className="w-4 h-4" /></button>
                              <button onClick={()=>startEditingGoal(goal)} className="p-1.5 text-zinc-400 hover:text-zinc-900"><Edit2 className="w-4 h-4" /></button>
                              <button onClick={()=>deleteGoal(goal.id)} className="p-1.5 text-zinc-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                            </div>
                         </div>
                       </div>
                     ))}
                      {activeGoals.length === 0 && <div className="text-sm text-zinc-400 py-4 text-center border-dashed border border-zinc-200 rounded-[2rem]">No active goals</div>}
                   </div>
                 </div>
                </div>

                {/* Weekly Vision */}
                <div className="rounded-[2rem] border border-zinc-200 bg-white p-6 md:p-8 shadow-sm mt-8">
                  <div id="vision-form" className="mb-8">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-xl font-black tracking-tight text-zinc-950">{editingVisionId ? 'Edit Weekly Vision' : 'Set This Week\'s Vision'}</h2>
                        <p className="mt-1 text-sm text-zinc-500">One vision per week. Define what matters most right now.</p>
                      </div>
                      {currentWeekVision && !editingVisionId && (
                        <button onClick={() => startEditingVision(currentWeekVision)} className="p-2 text-zinc-400 hover:text-zinc-900 transition"><Edit2 className="w-4 h-4" /></button>
                      )}
                    </div>
                  </div>

                  {!editingVisionId && currentWeekVision ? (
                    <div className="space-y-6">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400 mb-1">Vision Title</div>
                        <div className="text-lg font-medium text-zinc-950">{currentWeekVision.title}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400 mb-1">Primary Focus</div>
                        <div className="text-sm font-medium text-zinc-600">{currentWeekVision.description}</div>
                      </div>
                      {currentWeekVision.focusItems && currentWeekVision.focusItems.length > 0 && (
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400 mb-3">Focus Items</div>
                          <ul className="space-y-2">
                            {currentWeekVision.focusItems.map((item, idx) => (
                              <li key={idx} className="text-sm text-zinc-700 flex items-start gap-2">
                                <span className="text-zinc-400 mt-0.5">•</span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <form onSubmit={handleVisionSubmit} className="space-y-6">
                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Vision Title</label>
                        <input type="text" value={visionForm.title} onChange={(e) => setVisionForm({ ...visionForm, title: e.target.value })} placeholder="e.g. Ship the onboarding flow" className="w-full border-b border-zinc-200 bg-transparent py-3 text-lg font-medium outline-none transition focus:border-zinc-900" />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Primary Focus</label>
                        <textarea value={visionForm.description} onChange={(e) => setVisionForm({ ...visionForm, description: e.target.value })} placeholder="What does success look like this week?" className="w-full border-b border-zinc-200 bg-transparent py-3 text-sm font-medium outline-none transition focus:border-zinc-900 min-h-[80px]" />
                      </div>
                      <div className="space-y-3">
                        <label className="block text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Focus Items</label>
                        {visionForm.focusItems.map((item, index) => (
                          <div key={index} className="flex gap-2 items-center">
                            <input type="text" value={item} onChange={(e) => handleVisionFocusItemChange(index, e.target.value)} placeholder={`Focus item ${index + 1}`} className="flex-1 border-b border-zinc-200 bg-transparent py-2 text-sm font-medium outline-none transition focus:border-zinc-900" />
                            <button type="button" onClick={() => removeVisionFocusItem(index)} className="p-1.5 text-zinc-400 hover:text-zinc-900 transition"><X className="w-4 h-4" /></button>
                          </div>
                        ))}
                        <button type="button" onClick={addVisionFocusItem} className="text-xs font-bold uppercase tracking-[0.24em] text-zinc-500 hover:text-zinc-900 transition flex items-center gap-1"><Plus className="w-3 h-3" /> Add focus item</button>
                      </div>
                      <div className="flex gap-3 pt-4 border-t border-zinc-100">
                        <button type="submit" className="rounded-full bg-zinc-950 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 transition">{editingVisionId ? 'Update Vision' : 'Set Weekly Vision'}</button>
                        {editingVisionId && <button type="button" onClick={resetVisionForm} className="rounded-full border border-zinc-200 bg-white px-6 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition">Cancel</button>}
                      </div>
                    </form>
                  )}
                </div>

                {/* Past Visions */}
                {visions.length > 0 && (
                  <div className="rounded-[2rem] border border-zinc-200 bg-zinc-50 p-6 shadow-sm overflow-hidden flex flex-col max-h-[400px] mt-8">
                    <h2 className="text-xl font-black text-zinc-950 mb-4 shrink-0">Vision History</h2>
                    <div className="overflow-y-auto space-y-2 flex-1 pr-2">
                      {visions.slice(1).map(vision => (
                        <div key={vision.id} className="group p-4 bg-white border border-zinc-200 rounded-[2rem]">
                          <div className="flex justify-between items-start gap-4">
                            <div className="min-w-0 flex-1">
                              <h3 className="font-bold text-zinc-950 truncate">{vision.title}</h3>
                              <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{vision.description}</p>
                              {vision.focusItems && vision.focusItems.length > 0 && (
                                <ul className="mt-2 space-y-0.5">
                                  {vision.focusItems.slice(0, 3).map((item, idx) => (
                                    <li key={idx} className="text-xs text-zinc-400 flex items-start gap-1.5">
                                      <span className="text-zinc-300 mt-0.5">•</span>
                                      <span className="truncate">{item}</span>
                                    </li>
                                  ))}
                                  {vision.focusItems.length > 3 && <li className="text-xs text-zinc-400">+{vision.focusItems.length - 3} more</li>}
                                </ul>
                              )}
                            </div>
                            <div className="flex shrink-0 opacity-0 group-hover:opacity-100 transition">
                              <button onClick={() => startEditingVision(vision)} className="p-1.5 text-zinc-400 hover:text-zinc-900"><Edit2 className="w-4 h-4" /></button>
                              <button onClick={() => deleteVision(vision.id)} className="p-1.5 text-zinc-400 hover:text-zinc-900"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
          </div>
        )}

        {/* INTELLIGENCE (WIDGETS) */}
        {activeTab === 'intelligence' && (
           <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12 animate-in fade-in">
             <div className="mx-auto max-w-7xl space-y-6 pb-20">
               <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                 <div className="xl:col-span-5"><ActiveTasksWidget /></div>
                 <div className="xl:col-span-4"><CycleProgressWidget /></div>
                 <div className="xl:col-span-3"><TimeBlockingWidget /></div>
                 <div className="xl:col-span-7"><WeeklyIdentityVisionWidget /></div>
                 <div className="xl:col-span-5"><ExecutionScorecardWidget /></div>
               </div>
             </div>
           </div>
        )}
      </div>
    </div>
  );
}
