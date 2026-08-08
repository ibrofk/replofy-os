import React, { useMemo } from 'react';
import { updateDoc, doc } from 'firebase/firestore';
import {
  Activity,
  ArrowRight,
  Bug,
  CheckCircle2,
  Circle,
  Clock3,
  FilePenLine,
  MessageSquareText,
  Newspaper,
  Target,
  TrendingUp,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { useGlobalState } from '../contexts/GlobalStateContext';
import { isActiveBlogArticle, isPublishedBlogArticle } from '../utils/blogArticles';
import { CycleGoal, Task } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { syncGoalStatusWithTasks } from '../utils/syncGoalStatus';
import { NotificationBell } from './NotificationBell';
import { useCommunication } from '../contexts/CommunicationContext';

export function Dashboard() {
  const { tasks, visions, cycleGoals, blogArticles, bugs, roadmapItems, accounts, leads } = useGlobalState();
  const { unreadMessages, totalUnreadMessages } = useCommunication();
  const navigate = useNavigate();

  const toggleGoalStatus = async (goal: CycleGoal) => {
    try {
      await updateDoc(doc(db, 'cycleGoals', goal.id), {
        status: goal.status === 'completed' ? 'active' : 'completed',
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cycleGoals/${goal.id}`);
    }
  };

  const cycleTaskStatus = async (task: Task) => {
    try {
      const nextStatus = task.status === 'done' ? 'todo' : 'done';
      await updateDoc(doc(db, 'tasks', task.id), { status: nextStatus });
      if (task.cycleGoalId) {
        await syncGoalStatusWithTasks(task.cycleGoalId, { ...task, status: nextStatus });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${task.id}`);
    }
  };

  const latestVision = useMemo(() => {
    if (visions.length === 0) return null;
    return [...visions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  }, [visions]);

  const activeGoals = cycleGoals.filter((goal) => goal.status === 'active');
  const committedTasks = tasks.filter((task) => task.status !== 'icebox');
  const activeTasks = committedTasks.filter((task) => task.status === 'todo' || task.status === 'in-progress');
  const unassignedTasks = activeTasks.filter((task) => !task.assigneeId);
  const assignedTasks = committedTasks.filter((task) => task.assigneeId);
  const leadIndicators = committedTasks.filter((task) => task.isLeadIndicator);
  const completedLeadIndicators = leadIndicators.filter((task) => task.status === 'done');
  const executionRate = leadIndicators.length > 0
    ? Math.round((completedLeadIndicators.length / leadIndicators.length) * 100)
    : 0;
  const activeArticles = blogArticles.filter(isActiveBlogArticle);
  const publishedArticles = blogArticles.filter(isPublishedBlogArticle);
  const openBugs = bugs.filter((bug) => bug.status !== 'resolved' && bug.status !== 'closed');
  const blockedOrCriticalBugs = openBugs.filter((bug) => bug.status === 'blocked' || bug.severity === 'critical');
  const roadmapNowItems = roadmapItems.filter((item) => item.phase === 'now' && item.status !== 'shipped');
  const blockedRoadmapItems = roadmapItems.filter((item) => item.status === 'blocked');
  const openLeads = leads.filter((lead) => lead.stage !== 'won' && lead.stage !== 'lost');
  const followUpsDue = leads.filter((lead) => {
    if (!lead.nextActionAt || lead.stage === 'won' || lead.stage === 'lost') return false;
    return new Date(lead.nextActionAt).getTime() <= Date.now();
  });
  const goalsNeedingReview = activeGoals.filter((goal) => {
    const goalTasks = committedTasks.filter((task) => task.cycleGoalId === goal.id);
    return goalTasks.length === 0 || goalTasks.every((task) => task.status === 'done');
  });
  const unfinishedWork = activeTasks.length + followUpsDue.length;

  const attentionItems = [
    {
      title: 'Assign task owners',
      count: unassignedTasks.length,
      detail: unassignedTasks.length === 1 ? 'task is waiting for an owner' : 'tasks are waiting for owners',
      action: 'Review queue',
      path: '/tasks',
    },
    {
      title: 'Resolve technical blockers',
      count: blockedOrCriticalBugs.length,
      detail: blockedOrCriticalBugs.length === 1 ? 'blocked or critical bug is open' : 'blocked or critical bugs are open',
      action: 'Open studio',
      path: '/technical-studio',
    },
    {
      title: 'Review cycle goals',
      count: goalsNeedingReview.length,
      detail: goalsNeedingReview.length === 1 ? 'goal needs a scope check' : 'goals need a scope check',
      action: 'Review goals',
      path: '/execution',
    },
    {
      title: 'Close unfinished work',
      count: unfinishedWork,
      detail: followUpsDue.length > 0 ? `${activeTasks.length} active tasks, ${followUpsDue.length} follow-ups due` : `${activeTasks.length} active tasks remain`,
      action: 'Open tasks',
      path: '/tasks',
    },
  ];

  return (
    <div className="relative min-h-full overflow-hidden bg-zinc-50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(24,24,27,0.055),transparent_30%)]" />
      <div className="relative mx-auto max-w-[1440px] space-y-5 px-4 py-4 md:px-6 md:py-6 lg:px-8">
        <section className="relative rounded-[1.5rem] border border-zinc-200 bg-white px-5 py-5 shadow-sm md:px-6">
          <div className="absolute right-5 top-5 z-10">
            <NotificationBell />
          </div>
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="pr-12">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-500">
                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1">Execution Home</span>
                <span>Current cycle</span>
                <span className="text-zinc-300">/</span>
                <span className="text-zinc-800">{latestVision?.title || 'Cycle focus not set'}</span>
              </div>
              <h1 className="mt-3 text-2xl font-black tracking-tight text-zinc-950 md:text-3xl">Execution control center</h1>
              <p className="mt-1 text-sm text-zinc-500">Review attention signals, move active work, and keep the cycle on track.</p>
            </div>
            <div className="flex flex-col gap-3 xl:items-end">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <HeaderMetric label="Active tasks" value={activeTasks.length} />
                <HeaderMetric label="Unassigned" value={unassignedTasks.length} />
                <HeaderMetric label="Execution rate" value={`${executionRate}%`} />
                <button onClick={() => navigate('/tasks')} className="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800">
                  Open priority queue
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-zinc-500">
                <button onClick={() => navigate('/team')} className="transition hover:text-zinc-950">Review team</button>
                <button onClick={() => navigate('/week-13')} className="transition hover:text-zinc-950">Week review</button>
                <button onClick={() => navigate('/business-plan')} className="transition hover:text-zinc-950">Business plan</button>
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.5rem] border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5">
            <div>
              <h2 className="text-base font-bold text-zinc-950">Needs attention</h2>
              <p className="mt-0.5 text-xs text-zinc-500">Start here. These items need a decision or an owner.</p>
            </div>
            <TriangleAlert className="h-5 w-5 text-zinc-400" />
          </div>
          <div className="grid divide-y divide-zinc-100 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
            {attentionItems.map((item) => (
              <button key={item.title} onClick={() => navigate(item.path)} className="group p-4 text-left transition hover:bg-zinc-50">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-2xl font-black tracking-tight text-zinc-950">{item.count}</span>
                  <ArrowRight className="h-4 w-4 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-700" />
                </div>
                <h3 className="mt-2 text-sm font-bold text-zinc-900">{item.title}</h3>
                <p className="mt-1 text-xs leading-5 text-zinc-500">{item.detail}</p>
                <p className="mt-3 text-xs font-bold text-zinc-700">{item.action}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.5rem] border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-zinc-200 px-5 py-3.5">
            <div>
              <div className="flex items-center gap-2">
                <MessageSquareText className="h-4 w-4 text-zinc-400" />
                <h2 className="text-base font-bold text-zinc-950">Unseen team output</h2>
                {totalUnreadMessages > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-black text-white">
                    {totalUnreadMessages > 99 ? '99+' : totalUnreadMessages}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-zinc-500">New channel messages that have not been opened yet.</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/team-chat')}
              className="shrink-0 rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
            >
              Open chat
            </button>
          </div>
          {unreadMessages.length === 0 ? (
            <div className="px-5 py-5 text-sm text-zinc-500">No unseen team messages. You are caught up.</div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {unreadMessages.slice(0, 5).map((message) => (
                <button
                  key={message.id}
                  type="button"
                  onClick={() => navigate(`/team-chat?channel=${encodeURIComponent(message.channelId)}`)}
                  className="flex w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-zinc-50"
                >
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-black text-zinc-950">{message.authorName}</span>
                      <span className="text-xs font-bold text-zinc-400">#{message.channelName}</span>
                    </span>
                    <span className="mt-1 line-clamp-2 block text-sm text-zinc-600">{message.content}</span>
                  </span>
                  <span className="shrink-0 text-[10px] font-bold text-zinc-400">
                    {new Date(message.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <WorkPanel title="Active goals" subtitle="Cycle outcomes that need visible progress." icon={<Target className="h-5 w-5 text-zinc-400" />} footerLabel="Manage goals" onFooter={() => navigate('/execution')}>
            {activeGoals.length === 0 ? (
              <EmptyRow>There are no active goals. Define the next cycle outcome.</EmptyRow>
            ) : activeGoals.slice(0, 6).map((goal) => {
              const goalTasks = committedTasks.filter((task) => task.cycleGoalId === goal.id);
              const doneGoalTasks = goalTasks.filter((task) => task.status === 'done');
              const progress = goalTasks.length > 0 ? Math.round((doneGoalTasks.length / goalTasks.length) * 100) : 0;
              return (
                <div key={goal.id} className="group px-5 py-3.5 transition hover:bg-zinc-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-zinc-950">{goal.title}</p>
                      <p className="mt-0.5 truncate text-xs text-zinc-500">{goal.description || 'No outcome detail added yet.'}</p>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-zinc-900" style={{ width: `${progress}%` }} /></div>
                        <span className="shrink-0 text-xs font-semibold text-zinc-400">{doneGoalTasks.length}/{goalTasks.length}</span>
                      </div>
                    </div>
                    <button onClick={() => toggleGoalStatus(goal)} className="p-1 text-zinc-300 opacity-0 transition hover:text-zinc-900 group-hover:opacity-100" title="Complete goal"><CheckCircle2 className="h-4 w-4" /></button>
                  </div>
                </div>
              );
            })}
          </WorkPanel>

          <WorkPanel title="Active tasks" subtitle="Work in progress and queued for execution." icon={<Activity className="h-5 w-5 text-zinc-400" />} footerLabel="View priority queue" onFooter={() => navigate('/tasks')}>
            {activeTasks.length === 0 ? (
              <EmptyRow>There are no active tasks. Add work to the priority queue.</EmptyRow>
            ) : activeTasks.slice(0, 6).map((task) => (
              <div key={task.id} className="px-5 py-3.5 transition hover:bg-zinc-50">
                <div className="flex items-center gap-3">
                  <button onClick={() => cycleTaskStatus(task)} className="shrink-0 text-zinc-300 transition hover:text-zinc-900"><Circle className="h-4 w-4" /></button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-950">{task.title}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">{task.effortPoints} pts{!task.assigneeId ? ' / Unassigned' : ''}{task.isLeadIndicator ? ' / Lead indicator' : ''}</p>
                  </div>
                  <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-500">{task.status}</span>
                </div>
              </div>
            ))}
          </WorkPanel>
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-zinc-950">Operational modules</h2>
              <p className="mt-0.5 text-xs text-zinc-500">Open the workspace that moves the next decision forward.</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ModuleCard dark icon={<Activity className="h-5 w-5" />} title="Tasks" description="Assign owners, prioritize work, and move the cycle forward." value={`${committedTasks.length} tasks`} meta={`${unassignedTasks.length} unassigned`} actionLabel="Open priority queue" onClick={() => navigate('/tasks')} />
            <ModuleCard icon={<Users className="h-5 w-5" />} title="Team" description="Review workload, ownership, and assignment gaps." value={`${assignedTasks.length} assigned`} meta={`${unassignedTasks.length} need owners`} actionLabel="Review team" onClick={() => navigate('/team')} />
            <ModuleCard icon={<Bug className="h-5 w-5" />} title="Technical Studio" description="Resolve bugs and track the roadmap currently in motion." value={`${openBugs.length} open bugs`} meta={`${blockedRoadmapItems.length} blocked / ${roadmapNowItems.length} now`} actionLabel="Open technical studio" onClick={() => navigate('/technical-studio')} />
            <ModuleCard icon={<Clock3 className="h-5 w-5" />} title="Week Review" description="Review cycle performance and reset the next operating window." value={`${activeGoals.length} goals`} meta={`${leadIndicators.length} lead indicators`} actionLabel="Open week review" onClick={() => navigate('/week-13')} />
            <ModuleCard icon={<TrendingUp className="h-5 w-5" />} title="Growth Pipeline" description="Track accounts, leads, and founder sales follow-ups." value={`${openLeads.length} open leads`} meta={`${accounts.length} accounts / ${followUpsDue.length} due`} actionLabel="Open pipeline" onClick={() => navigate('/growth')} />
            <ModuleCard icon={<Newspaper className="h-5 w-5" />} title="Blogs Hub" description="Plan evidence-backed articles and move the publishing roadmap forward." value={`${activeArticles.length} active`} meta={`${publishedArticles.length} published`} actionLabel="Open blogs hub" onClick={() => navigate('/blogs')} />
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-500"><Clock3 className="h-4 w-4" /> Current cycle</div>
              <h2 className="mt-2 text-lg font-black tracking-tight text-zinc-950">{latestVision?.title || 'No active cycle focus'}</h2>
              <p className="mt-1 max-w-3xl text-sm text-zinc-500">{latestVision?.description || 'Set the weekly vision in Execution Studio so the team can align active work.'}</p>
            </div>
            <button onClick={() => navigate('/business-plan')} className="inline-flex shrink-0 items-center gap-2 text-sm font-bold text-zinc-700 transition hover:text-zinc-950">
              <FilePenLine className="h-4 w-4" />
              Review business plan
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function HeaderMetric({ label, value }: { label: string; value: string | number }) {
  return <div><p className="text-xs font-semibold text-zinc-500">{label}</p><p className="text-lg font-black text-zinc-950">{value}</p></div>;
}

function WorkPanel({ title, subtitle, icon, footerLabel, onFooter, children }: { title: string; subtitle: string; icon: React.ReactNode; footerLabel: string; onFooter: () => void; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5">
        <div><h2 className="text-base font-bold text-zinc-950">{title}</h2><p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p></div>
        {icon}
      </div>
      <div className="divide-y divide-zinc-100">{children}</div>
      <button onClick={onFooter} className="flex w-full items-center justify-between border-t border-zinc-200 px-5 py-3 text-left text-xs font-bold text-zinc-700 transition hover:bg-zinc-50">{footerLabel}<ArrowRight className="h-4 w-4" /></button>
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-8 text-center text-sm text-zinc-500">{children}</div>;
}

function ModuleCard({ dark = false, icon, title, description, value, meta, actionLabel, onClick }: { dark?: boolean; icon: React.ReactNode; title: string; description: string; value: string; meta: string; actionLabel: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`group flex min-h-[220px] flex-col rounded-[1.5rem] border p-5 text-left shadow-sm transition hover:-translate-y-0.5 ${dark ? 'border-zinc-950 bg-zinc-950 text-white' : 'border-zinc-200 bg-white text-zinc-950 hover:border-zinc-300'}`}>
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${dark ? 'bg-white/10 text-white' : 'bg-zinc-100 text-zinc-700'}`}>{icon}</div>
      <h3 className="mt-4 text-base font-black tracking-tight">{title}</h3>
      <p className={`mt-1.5 text-sm leading-5 ${dark ? 'text-white/65' : 'text-zinc-500'}`}>{description}</p>
      <div className="mt-auto pt-5">
        <p className="text-2xl font-black tracking-tight">{value}</p>
        <p className={`mt-0.5 text-xs font-semibold ${dark ? 'text-white/50' : 'text-zinc-500'}`}>{meta}</p>
        <span className={`mt-4 flex items-center justify-between text-xs font-bold ${dark ? 'text-white' : 'text-zinc-700'}`}>{actionLabel}<ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
      </div>
    </button>
  );
}
