import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CheckCircle2, Circle, Trash2, Target, User, Search,
  Loader2, Flame, PlusCircle, ArrowUpRight, AlignLeft, X, ArrowDown, ArrowUp, Filter
} from 'lucide-react';
import { useGlobalState } from '../contexts/GlobalStateContext';
import { useUser } from '../contexts/UserContext';
import { Task, CycleGoal } from '../types';
import { executionDataService } from '../services/executionDataService';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge } from '../components/ui/Badge';
import { StudioHeader } from '../components/ui/StudioHeader';

type SortOption = 'newest' | 'oldest' | 'effort-high' | 'effort-low' | 'assignee-asc' | 'assignee-desc' | 'goal-asc' | 'goal-desc' | 'title-asc' | 'title-desc';
type StatusFilter = 'all' | 'todo' | 'in-progress' | 'done' | 'icebox';

const STATUS_CONFIG: Record<string, { label: string; iconColor: string; bg: string }> = {
  todo: { label: 'To Do', iconColor: 'text-zinc-300', bg: '' },
  'in-progress': { label: 'In Progress', iconColor: 'text-orange-400', bg: 'bg-orange-50/50' },
  done: { label: 'Done', iconColor: 'text-emerald-500', bg: 'bg-zinc-50/50' },
  icebox: { label: 'Icebox', iconColor: 'text-zinc-200', bg: 'opacity-50' },
};

export function TasksPage() {
  const { tasks, cycleGoals: goals, teamMembers: globalTeamMembers } = useGlobalState();
  const { userProfile } = useUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const teamMembers = globalTeamMembers.length > 0
    ? globalTeamMembers
    : userProfile
      ? [userProfile]
      : [];
  const highlightTaskId = searchParams.get('highlightTaskId');
  const highlightedRowRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todo');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [goalFilter, setGoalFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const [filterMenu, setFilterMenu] = useState<{ type: 'assignee' | 'goal', x: number, y: number } | null>(null);
  const [cellMenu, setCellMenu] = useState<{ taskId: string, field: 'assignee' | 'goal' | 'pts', x: number, y: number } | null>(null);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);

  const reportMutationError = (error: unknown) => {
    console.error('[TasksPage] Mutation failed:', error);
    setMutationError(error instanceof Error ? error.message : 'The change could not be saved.');
  };

  useEffect(() => {
    if (highlightTaskId && tasks.length > 0) {
      const el = document.getElementById(`task-row-${highlightTaskId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-zinc-900', 'ring-offset-2');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-zinc-900', 'ring-offset-2');
        }, 3000);
      }
    }
  }, [highlightTaskId, tasks]);

  const goalMap = useMemo(() => {
    const map = new Map<string, CycleGoal>();
    goals.forEach(g => map.set(g.id, g));
    return map;
  }, [goals]);

  // Click outside menus to close
  useEffect(() => {
    const closeMenus = () => {
      setFilterMenu(null);
      setCellMenu(null);
    };
    window.addEventListener('click', closeMenus);
    return () => window.removeEventListener('click', closeMenus);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, type: 'assignee' | 'goal') => {
    e.preventDefault();
    e.stopPropagation();
    setFilterMenu({ type, x: e.clientX, y: e.clientY });
  };

  const cycleSort = (column: 'title' | 'assignee' | 'goal' | 'pts') => {
    if (column === 'title') {
      setSortBy(prev => prev === 'title-asc' ? 'title-desc' : 'title-asc');
    } else if (column === 'assignee') {
      setSortBy(prev => prev === 'assignee-asc' ? 'assignee-desc' : 'assignee-asc');
    } else if (column === 'goal') {
      setSortBy(prev => prev === 'goal-asc' ? 'goal-desc' : 'goal-asc');
    } else if (column === 'pts') {
      setSortBy(prev => prev === 'effort-high' ? 'effort-low' : 'effort-high');
    }
  };

  const getSortIcon = (column: 'title' | 'assignee' | 'goal' | 'pts') => {
    if (column === 'title') {
       if (sortBy === 'title-asc') return <ArrowDown className="w-3 h-3 ml-1" />;
       if (sortBy === 'title-desc') return <ArrowUp className="w-3 h-3 ml-1" />;
    }
    if (column === 'assignee') {
       if (sortBy === 'assignee-asc') return <ArrowDown className="w-3 h-3 ml-1" />;
       if (sortBy === 'assignee-desc') return <ArrowUp className="w-3 h-3 ml-1" />;
    }
    if (column === 'goal') {
       if (sortBy === 'goal-asc') return <ArrowDown className="w-3 h-3 ml-1" />;
       if (sortBy === 'goal-desc') return <ArrowUp className="w-3 h-3 ml-1" />;
    }
    if (column === 'pts') {
       if (sortBy === 'effort-high') return <ArrowDown className="w-3 h-3 ml-1" />;
       if (sortBy === 'effort-low') return <ArrowUp className="w-3 h-3 ml-1" />;
    }
    return null;
  };

  const filteredTasks = useMemo(() => {
    let result = [...tasks];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t => t.title.toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') result = result.filter(t => t.status === statusFilter);
    if (assigneeFilter !== 'all') {
      result = assigneeFilter === 'unassigned'
        ? result.filter(t => !t.assigneeId)
        : result.filter(t => t.assigneeId === assigneeFilter);
    }
    if (goalFilter !== 'all') {
      result = goalFilter === 'unlinked'
        ? result.filter(t => !t.cycleGoalId)
        : result.filter(t => t.cycleGoalId === goalFilter);
    }
    switch (sortBy) {
      case 'newest': result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); break;
      case 'oldest': result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()); break;
      case 'title-asc': result.sort((a,b) => a.title.localeCompare(b.title)); break;
      case 'title-desc': result.sort((a,b) => b.title.localeCompare(a.title)); break;
      case 'effort-high': result.sort((a, b) => b.effortPoints - a.effortPoints); break;
      case 'effort-low': result.sort((a, b) => a.effortPoints - b.effortPoints); break;
      case 'assignee-asc': result.sort((a, b) => {
        const aN = a.assigneeId ? teamMembers.find(m => m.id === a.assigneeId)?.displayName || 'zzz' : 'zzz';
        const bN = b.assigneeId ? teamMembers.find(m => m.id === b.assigneeId)?.displayName || 'zzz' : 'zzz';
        return aN.localeCompare(bN);
      }); break;
      case 'assignee-desc': result.sort((a, b) => {
        const aN = a.assigneeId ? teamMembers.find(m => m.id === a.assigneeId)?.displayName || 'zzz' : 'zzz';
        const bN = b.assigneeId ? teamMembers.find(m => m.id === b.assigneeId)?.displayName || 'zzz' : 'zzz';
        return bN.localeCompare(aN);
      }); break;
      case 'goal-asc': result.sort((a, b) => {
        const aG = a.cycleGoalId ? goalMap.get(a.cycleGoalId)?.title || 'zzz' : 'zzz';
        const bG = b.cycleGoalId ? goalMap.get(b.cycleGoalId)?.title || 'zzz' : 'zzz';
        return aG.localeCompare(bG);
      }); break;
      case 'goal-desc': result.sort((a, b) => {
        const aG = a.cycleGoalId ? goalMap.get(a.cycleGoalId)?.title || 'zzz' : 'zzz';
        const bG = b.cycleGoalId ? goalMap.get(b.cycleGoalId)?.title || 'zzz' : 'zzz';
        return bG.localeCompare(aG);
      }); break;
    }
    return result;
  }, [tasks, searchQuery, statusFilter, assigneeFilter, goalFilter, sortBy, teamMembers, goalMap]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !userProfile) return;
    setIsCreating(true);
    try {
      const status = statusFilter === 'all' ? 'todo' : statusFilter;
      await executionDataService.createTask({
        title: newTaskTitle,
        status,
        effortPoints: 1,
        isLeadIndicator: false,
        cycleGoalId: goalFilter !== 'all' && goalFilter !== 'unlinked' ? goalFilter : null,
        assigneeId: assigneeFilter !== 'all' && assigneeFilter !== 'unassigned' ? assigneeFilter : null,
        completedAt: status === 'done' ? new Date().toISOString() : null,
      }, {
        userId: userProfile.id,
        workspaceId: userProfile.companyId,
      });
      setNewTaskTitle('');
    } catch (error) {
      reportMutationError(error);
    } finally {
      setIsCreating(false);
    }
  };

  const updateTaskField = async (taskId: string, field: string, value: any) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      await executionDataService.updateTask(
        taskId,
        { [field]: value } as Partial<Task>,
        task?.cycleGoalId,
      );
    } catch (error) {
      reportMutationError(error);
    }
  };

  const cycleStatus = async (task: Task) => {
    const flow: Record<string, Task['status']> = {
      icebox: 'todo', todo: 'in-progress', 'in-progress': 'done',
      done: task.cycleGoalId ? 'todo' : 'icebox',
    };
    try {
      const ns = flow[task.status] ?? 'todo';
      await executionDataService.updateTask(task.id, {
        status: ns, completedAt: ns === 'done' ? new Date().toISOString() : null,
      }, task.cycleGoalId);
    } catch (error) { reportMutationError(error); }
  };

  const deleteTask = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try { await executionDataService.deleteTask(id); }
    catch (error) { reportMutationError(error); }
  };

  return (
    <div className="flex h-full flex-col bg-white text-zinc-900 font-sans shadow-sm overflow-hidden md:border border-zinc-200">
      {mutationError && (
        <button
          type="button"
          onClick={() => setMutationError(null)}
          className="absolute right-4 top-4 z-50 max-w-sm rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-800 shadow-lg"
        >
          {mutationError}
        </button>
      )}
      
      {/* Studio Header */}
      <StudioHeader
        showNotifications={import.meta.env.VITE_REPLOFY_PLATFORM !== 'standalone'}
        badge="Task Management"
        badgeIcon={<AlignLeft className="h-3.5 w-3.5" />}
        title="Tasks"
        subtitle="Assign, prioritize, and move work through the cycle."
        actions={
          <form onSubmit={handleAddTask} className="flex items-center relative group">
            <PlusCircle className="absolute left-3 w-4 h-4 text-zinc-400 group-focus-within:text-zinc-600 transition-colors" />
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Create new issue... [Enter]"
              className="w-full bg-zinc-50 hover:bg-zinc-100 focus:bg-white border border-transparent focus:border-zinc-300 rounded-lg text-sm font-medium py-2 pl-9 pr-4 outline-none transition-all placeholder:text-zinc-400"
            />
            {isCreating && <Loader2 className="absolute right-3 w-4 h-4 text-zinc-400 animate-spin" />}
          </form>
        }
      />

      {/* Filter Bar */}
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white shrink-0 px-4 py-2 gap-3">
        <div className="flex p-1 bg-zinc-100 rounded-lg overflow-x-auto scrollbar-hide flex-1 md:flex-none">
          {(['todo', 'in-progress', 'done'] as StatusFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`flex-1 md:flex-none px-3 py-1.5 text-xs font-semibold rounded-md capitalize transition-all whitespace-nowrap ${statusFilter === s ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
            >
              {s.replace('-', ' ')}
            </button>
          ))}
        </div>
        
        <div className="h-6 w-px bg-zinc-200 hidden md:block"></div>

        <div className="relative w-full md:min-w-[200px] flex items-center bg-white border border-zinc-200 rounded-lg pr-3 pl-8 min-h-[36px] focus-within:border-zinc-400 focus-within:ring-2 focus-within:ring-zinc-900/10 transition-all overflow-hidden group">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 group-focus-within:text-zinc-600 transition-colors" />
          <div className="flex flex-wrap items-center gap-1.5 py-1 z-10 w-full overflow-hidden">
            {assigneeFilter !== 'all' && (
               <div className="flex items-center gap-1 bg-zinc-100 text-zinc-600 text-[10px] px-1.5 py-0.5 rounded border border-zinc-200 font-medium shrink-0 max-w-[100px]">
                 <span className="truncate">{assigneeFilter === 'unassigned' ? 'Unassigned' : teamMembers.find(m => m.id === assigneeFilter)?.displayName || 'Unknown'}</span>
                 <X className="w-3 h-3 cursor-pointer hover:text-zinc-900 shrink-0" onClick={() => setAssigneeFilter('all')} />
               </div>
            )}
            {goalFilter !== 'all' && (
               <div className="flex items-center gap-1 bg-zinc-100 text-zinc-600 text-[10px] px-1.5 py-0.5 rounded border border-zinc-200 font-medium shrink-0 max-w-[100px]">
                 <span className="truncate">{goalFilter === 'unlinked' ? 'Unlinked' : goalMap.get(goalFilter)?.title || 'Unknown'}</span>
                 <X className="w-3 h-3 cursor-pointer hover:text-zinc-900 shrink-0" onClick={() => setGoalFilter('all')} />
               </div>
            )}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={assigneeFilter === 'all' && goalFilter === 'all' ? "Search" : ""}
              className="flex-1 bg-transparent text-xs font-medium outline-none placeholder:text-zinc-400 min-w-[50px] h-full py-1"
            />
          </div>
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto bg-white relative">
        <div className="w-full flex flex-col pb-8">
          
          {/* Header Row - Desktop Only */}
          <div className="hidden md:flex items-center px-4 py-2 border-b border-zinc-100 bg-zinc-50/50 text-xs font-semibold text-zinc-500 sticky top-0 z-10 w-full select-none">
            <div className="w-10"></div>
            <div 
              className="flex-1 min-w-[200px] flex items-center cursor-pointer hover:text-zinc-800 transition"
              onClick={() => cycleSort('title')}
            >
              Issue Title{getSortIcon('title')}
            </div>
            
            <div 
              className="w-32 lg:w-48 px-2 flex items-center cursor-pointer hover:text-zinc-800 transition"
              onClick={() => cycleSort('assignee')}
              onContextMenu={(e) => handleContextMenu(e, 'assignee')}
            >
              <User className="w-3.5 h-3.5 mr-1.5"/>Assignee{getSortIcon('assignee')}
            </div>
            
            <div 
              className="w-32 lg:w-48 px-2 flex items-center cursor-pointer hover:text-zinc-800 transition"
              onClick={() => cycleSort('goal')}
              onContextMenu={(e) => handleContextMenu(e, 'goal')}
            >
              <Target className="w-3.5 h-3.5 mr-1.5"/>Goal{getSortIcon('goal')}
            </div>
            
            <div 
              className="w-16 lg:w-20 px-2 flex items-center justify-end cursor-pointer hover:text-zinc-800 transition"
              onClick={() => cycleSort('pts')}
            >
              Pts{getSortIcon('pts')}
            </div>
            <div className="w-12 text-right"></div>
          </div>

          {filteredTasks.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="w-6 h-6 text-zinc-300" />} title="All caught up" subtitle="There are no tasks matching your current view criteria." />
          ) : (
            <div className="flex flex-col divide-y divide-zinc-100">
              {filteredTasks.map(task => {
                const assignee = teamMembers.find(m => m.id === task.assigneeId);
                const goal = task.cycleGoalId ? goalMap.get(task.cycleGoalId) : null;
                const cfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.todo;
                
                return (
                  <div 
                    id={`task-row-${task.id}`}
                    key={task.id} 
                    className={`group flex flex-col md:flex-row md:items-center px-3 md:px-4 py-3 md:py-2.5 hover:bg-zinc-50 transition-colors cursor-default ${cfg.bg} ${task.status === 'done' ? 'text-zinc-500' : 'text-zinc-900'} relative ${highlightTaskId === task.id ? 'ring-2 ring-zinc-900 ring-offset-2 bg-zinc-100' : ''}`}
                  >
                    {/* Mobile top-row container */}
                    <div className="flex items-start md:items-center w-full md:w-auto md:flex-1 min-w-0 mb-2 md:mb-0 gap-3">
                      {/* Status Button */}
                      <button 
                        onClick={(e) => { e.stopPropagation(); cycleStatus(task); }} 
                        className={`mt-0.5 md:mt-0 focus:outline-none transition-colors hover:text-zinc-900 shrink-0 ${cfg.iconColor}`}
                      >
                        {task.status === 'done' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Circle className="w-4 h-4" />}
                      </button>

                      {/* Title */}
                      <div className="flex-1 min-w-0 flex flex-wrap md:flex-nowrap items-center gap-1.5 md:pr-4">
                         <span className="text-[10px] font-mono text-zinc-400 select-none hidden md:inline-block">OS-{task.id.substring(0, 3).toUpperCase()}</span>
                         {editingTitle === task.id ? (
                            <input
                              autoFocus
                              defaultValue={task.title}
                              onClick={(e) => e.stopPropagation()}
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (v && v !== task.title) updateTaskField(task.id, 'title', v);
                                setEditingTitle(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const v = e.currentTarget.value.trim();
                                  if (v && v !== task.title) updateTaskField(task.id, 'title', v);
                                  setEditingTitle(null);
                                } else if (e.key === 'Escape') {
                                  setEditingTitle(null);
                                }
                              }}
                              className="text-sm font-medium w-full max-w-[300px] bg-white border border-zinc-300 rounded px-1.5 py-0.5 outline-none focus:border-zinc-500 shadow-sm"
                            />
                         ) : (
                            <span 
                               onClick={(e) => { e.stopPropagation(); setEditingTitle(task.id); }}
                               className={`text-sm font-medium break-words w-full md:w-auto md:truncate cursor-pointer hover:bg-zinc-100 rounded px-1 -ml-1 transition-colors ${task.status === 'done' ? 'line-through text-zinc-400' : ''}`}
                            >
                              {task.title}
                            </span>
                         )}
                         {task.isLeadIndicator && <Flame className="w-3.5 h-3.5 text-orange-500 shrink-0 inline-block" />}
                      </div>
                    </div>

                    {/* Meta Container (Assignee, Goal, Pts) - Wraps on mobile */}
                    <div className="flex items-center flex-wrap gap-2 md:gap-0 pl-7 md:pl-0 w-full md:w-auto">
                      
                      {/* Assignee Badge */}
                      <div 
                        className="md:w-32 lg:w-48 md:px-2 shrink-0 flex items-center cursor-pointer hover:bg-zinc-100 rounded p-1 -ml-1 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          setCellMenu({ taskId: task.id, field: 'assignee', x: rect.left, y: rect.bottom });
                        }}
                      >
                        {assignee ? (
                            <div className="inline-flex items-center gap-1.5 px-1.5 md:px-2 py-0.5 md:py-1 rounded bg-zinc-100 text-xs text-zinc-600 font-medium max-w-[120px] md:max-w-full pointer-events-none">
                              <div className="w-3.5 h-3.5 rounded-full bg-zinc-300 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                               {assignee.displayName?.charAt(0).toUpperCase() || assignee.email.charAt(0).toUpperCase()}
                             </div>
                             <span className="truncate">{assignee.displayName || assignee.email}</span>
                           </div>
                        ) : (
                           <span className="text-zinc-400 text-xs inline-block border border-dashed border-zinc-300 rounded px-1.5 py-0.5 hover:border-zinc-400 transition-colors pointer-events-none">Unassigned</span>
                        )}
                      </div>

                      {/* Goal Link */}
                      <div 
                        className="md:w-32 lg:w-48 md:px-2 shrink-0 flex items-center cursor-pointer hover:bg-zinc-100 rounded p-1 -ml-1 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          setCellMenu({ taskId: task.id, field: 'goal', x: rect.left, y: rect.bottom });
                        }}
                      >
                        {goal ? (
                            <div className="inline-flex items-center gap-1 max-w-[120px] md:max-w-full text-xs text-zinc-500 transition-colors pointer-events-none">
                             <ArrowUpRight className="w-3 h-3 text-zinc-400 shrink-0"/>
                             <span className="truncate font-medium">{goal.title}</span>
                           </div>
                        ) : (
                           <span className="text-zinc-400 text-xs inline-block border border-dashed border-zinc-300 rounded px-1.5 py-0.5 hover:border-zinc-400 transition-colors pointer-events-none">No Goal</span>
                        )}
                      </div>

                      {/* Effort */}
                      <div 
                        className="md:w-16 lg:w-20 md:px-2 shrink-0 md:text-right mt-0 md:mt-0 ml-auto md:ml-0 flex md:justify-end items-center cursor-pointer hover:bg-zinc-100 rounded p-1 -mr-1 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          setCellMenu({ taskId: task.id, field: 'pts', x: rect.left - 60, y: rect.bottom });
                        }}
                      >
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-100 text-zinc-600 font-bold border border-zinc-200 pointer-events-none">
                          <span className="md:hidden mr-1">PT</span>{task.effortPoints}
                        </span>
                      </div>
                      
                    </div>

                    {/* Actions Menu - Absolute top right on mobile, inline right on desktop */}
                    <div className="absolute top-2 right-2 md:static md:w-12 flex justify-end shrink-0">
                      <button 
                        onClick={(e) => deleteTask(task.id, e)} 
                        className="p-2 md:p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded md:opacity-0 group-hover:opacity-100 transition-all focus:outline-none"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Context Menu (Filter) */}
        {filterMenu && (
          <div 
            className="fixed z-50 bg-white border border-zinc-200 rounded-lg shadow-xl w-48 text-sm font-medium py-1 animate-in fade-in zoom-in-95 duration-100"
            style={{ top: filterMenu.y + 10, left: filterMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400 border-b border-zinc-100 mb-1 flex items-center gap-1.5">
              <Filter className="w-3 h-3" />
              Filter by {filterMenu.type === 'assignee' ? 'Assignee' : 'Goal'}
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filterMenu.type === 'assignee' ? (
                <>
                  <button 
                    onClick={() => { setAssigneeFilter('all'); setFilterMenu(null); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 text-zinc-900 transition-colors flex items-center justify-between"
                  >
                    All Assignees
                    {assigneeFilter === 'all' && <CheckCircle2 className="w-3.5 h-3.5 text-zinc-500" />}
                  </button>
                  <button 
                    onClick={() => { setAssigneeFilter('unassigned'); setFilterMenu(null); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 text-zinc-900 transition-colors flex items-center justify-between"
                  >
                    Unassigned
                    {assigneeFilter === 'unassigned' && <CheckCircle2 className="w-3.5 h-3.5 text-zinc-500" />}
                  </button>
                  {teamMembers.map(m => (
                    <button 
                      key={m.id}
                      onClick={() => { setAssigneeFilter(m.id); setFilterMenu(null); }}
                      className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 text-zinc-900 transition-colors flex items-center justify-between"
                    >
                      {m.displayName || m.email}
                      {assigneeFilter === m.id && <CheckCircle2 className="w-3.5 h-3.5 text-zinc-500" />}
                    </button>
                  ))}
                </>
              ) : (
                <>
                  <button 
                    onClick={() => { setGoalFilter('all'); setFilterMenu(null); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 text-zinc-900 transition-colors flex items-center justify-between"
                  >
                    All Goals
                    {goalFilter === 'all' && <CheckCircle2 className="w-3.5 h-3.5 text-zinc-500" />}
                  </button>
                  <button 
                    onClick={() => { setGoalFilter('unlinked'); setFilterMenu(null); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 text-zinc-900 transition-colors flex items-center justify-between"
                  >
                    Unlinked Tasks
                    {goalFilter === 'unlinked' && <CheckCircle2 className="w-3.5 h-3.5 text-zinc-500" />}
                  </button>
                  {goals.map(g => (
                    <button 
                      key={g.id}
                      onClick={() => { setGoalFilter(g.id); setFilterMenu(null); }}
                      className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 text-zinc-900 transition-colors flex items-center justify-between"
                    >
                      {g.title}
                      {goalFilter === g.id && <CheckCircle2 className="w-3.5 h-3.5 text-zinc-500" />}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* Cell Edit Menu (Assignee, Goal, Pts) */}
        {cellMenu && (
          <div 
            className="fixed z-50 bg-white border border-zinc-200 rounded-lg shadow-xl w-48 text-sm font-medium py-1 animate-in fade-in zoom-in-95 duration-100"
            style={{ top: cellMenu.y + 5, left: cellMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400 border-b border-zinc-100 mb-1">
              Set {cellMenu.field === 'assignee' ? 'Assignee' : cellMenu.field === 'goal' ? 'Goal' : 'Points'}
            </div>
            <div className="max-h-64 overflow-y-auto">
              {cellMenu.field === 'assignee' && (
                <>
                  <button 
                    onClick={() => { updateTaskField(cellMenu.taskId, 'assigneeId', null); setCellMenu(null); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 text-zinc-900 transition-colors"
                  >
                    Unassigned
                  </button>
                  {teamMembers.map(m => (
                    <button 
                      key={m.id}
                      onClick={() => { updateTaskField(cellMenu.taskId, 'assigneeId', m.id); setCellMenu(null); }}
                      className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 text-zinc-900 transition-colors truncate"
                    >
                      {m.displayName || m.email}
                    </button>
                  ))}
                </>
              )}
              {cellMenu.field === 'goal' && (
                <>
                  <button 
                    onClick={() => { updateTaskField(cellMenu.taskId, 'cycleGoalId', null); setCellMenu(null); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 text-zinc-900 transition-colors"
                  >
                    Unlinked
                  </button>
                  {goals.map(g => (
                    <button 
                      key={g.id}
                      onClick={() => { updateTaskField(cellMenu.taskId, 'cycleGoalId', g.id); setCellMenu(null); }}
                      className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 text-zinc-900 transition-colors truncate"
                    >
                      {g.title}
                    </button>
                  ))}
                </>
              )}
              {cellMenu.field === 'pts' && (
                <>
                  {[1, 2, 3, 5, 8].map(pts => (
                    <button 
                      key={pts}
                      onClick={() => { updateTaskField(cellMenu.taskId, 'effortPoints', pts); setCellMenu(null); }}
                      className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 text-zinc-900 transition-colors"
                    >
                      {pts} {pts === 1 ? 'pt' : 'pts'}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
