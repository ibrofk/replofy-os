import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Clock3, Sparkles, Target, TrendingUp, Server, Globe2, Cpu, Activity, History } from 'lucide-react';
import { db, auth } from '../firebase';
import { useGlobalState } from '../contexts/GlobalStateContext';
import { useUser } from '../contexts/UserContext';
import { ContextSource } from '../types';
import { logFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { useCycleWeek } from '../hooks/useCycleWeek';
import { EnvironmentStatesWidget } from '../components/widgets/EnvironmentStatesWidget';
import { ExecutionScorecardWidget } from '../components/widgets/ExecutionScorecardWidget';
import { CycleProgressWidget } from '../components/widgets/CycleProgressWidget';
import { WeeklyIdentityVisionWidget } from '../components/widgets/WeeklyIdentityVisionWidget';
import { CycleHealthScoreCard } from '../components/widgets/CycleHealthScoreCard';
import { CycleWeekManager } from '../components/widgets/CycleWeekManager';
import { ChangelogFeed } from '../components/widgets/ChangelogFeed';
import { MetricCard } from '../components/ui/MetricCard';
import { InfoPill } from '../components/ui/InfoPill';
import { StudioHeader } from '../components/ui/StudioHeader';
import { DashboardCard } from '../components/ui/DashboardCard';
import { SectionHeader } from '../components/ui/SectionHeader';
import { EmptyState } from '../components/ui/EmptyState';

export function SystemsStudioPage() {
  const { tasks, visions, cycleGoals, environments, feedbacks } = useGlobalState();
  const { userProfile } = useUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [contextSources, setContextSources] = useState<ContextSource[]>([]);
  const highlightSourceId = searchParams.get('highlightSourceId');

  useEffect(() => {
    if (highlightSourceId && contextSources.length > 0) {
      const el = document.getElementById(`source-row-${highlightSourceId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-zinc-900', 'ring-offset-2');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-zinc-900', 'ring-offset-2');
        }, 3000);
      }
    }
  }, [highlightSourceId, contextSources]);

  useEffect(() => {
    if (!auth.currentUser) return;

    const scopeQuery = userProfile?.companyId
      ? query(collection(db, 'contextSources'), where('companyId', '==', userProfile.companyId))
      : query(collection(db, 'contextSources'), where('authorId', '==', auth.currentUser.uid));

    const unsubscribe = onSnapshot(
      scopeQuery,
      (snapshot) => {
        const data = snapshot.docs.map((snap) => ({
          id: snap.id,
          ...snap.data(),
        })) as ContextSource[];
        setContextSources(data.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'contextSources');
      }
    );

    return unsubscribe;
  }, [userProfile?.companyId]);

  const latestVision = useMemo(() => {
    if (visions.length === 0) return null;
    return [...visions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  }, [visions]);

  const committedTasks = useMemo(() => tasks.filter(t => t.status !== 'icebox'), [tasks]);
  const leadIndicators = useMemo(() => committedTasks.filter(t => t.isLeadIndicator), [committedTasks]);
  const completedLeads = useMemo(() => leadIndicators.filter(t => t.status === 'done'), [leadIndicators]);
  const executionRate = useMemo(() => {
    if (leadIndicators.length > 0) {
      return Math.round((completedLeads.length / leadIndicators.length) * 100);
    }
    const completedCount = committedTasks.filter(t => t.status === 'done').length;
    return committedTasks.length > 0 ? Math.round((completedCount / committedTasks.length) * 100) : 0;
  }, [leadIndicators, completedLeads, committedTasks]);

  const activeGoals = useMemo(() => cycleGoals.filter(g => g.status === 'active'), [cycleGoals]);
  const completedGoals = useMemo(() => cycleGoals.filter(g => g.status === 'completed'), [cycleGoals]);

  const totalPoints = useMemo(() => committedTasks.reduce((acc, t) => acc + t.effortPoints, 0), [committedTasks]);
  const completedPoints = useMemo(() => committedTasks.filter(t => t.status === 'done').reduce((acc, t) => acc + t.effortPoints, 0), [committedTasks]);
  const { week: currentWeek, progress: cycleProgress } = useCycleWeek(tasks, cycleGoals);

  const isOnTrack = executionRate >= 85;
  const isAtRisk = executionRate >= 50 && executionRate < 85;

  const statusLabel = currentWeek >= 12 ? 'Cycle closing' : isOnTrack ? 'On Track' : isAtRisk ? 'Behind Pace' : 'Needs Attention';
  const statusColor = currentWeek >= 12 ? 'bg-violet-50 border-violet-100 text-violet-800' : isOnTrack ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : isAtRisk ? 'bg-amber-50 border-amber-100 text-amber-800' : 'bg-red-50 border-red-100 text-red-800';
  const dotColor = currentWeek >= 12 ? 'bg-violet-500' : isOnTrack ? 'bg-emerald-500' : isAtRisk ? 'bg-amber-500' : 'bg-red-500';

  const unhealthyEnvs = environments.filter(e => e.status !== 'healthy').length;
  const negativeFeedback = feedbacks.filter(f => f.sentiment === 'negative').length;

  return (
    <div className="relative min-h-full overflow-y-auto overflow-x-hidden bg-zinc-50 font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(24,24,27,0.08),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(161,161,170,0.09),transparent_25%)] pointer-events-none" />
      
      <div className="relative mx-auto max-w-7xl px-4 py-4 md:px-6 md:py-6 lg:px-8 space-y-8">
        
        {/* Header */}
        <StudioHeader
          badge="Systems & Telemetry"
          badgeIcon={<Activity className="h-3.5 w-3.5" />}
          title="Cycle Performance"
          subtitle="Execution rate, lead indicators, and goal progress across your 12-week cycle."
          actions={
            <div className="flex items-center gap-3">
              <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm ${statusColor}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${dotColor} relative`}>
                  <div className={`absolute inset-0 rounded-full ${dotColor} animate-ping opacity-75`}></div>
                </div>
                Week {currentWeek}/12 · {statusLabel}
              </div>
              <button
                onClick={() => navigate('/week-13')}
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                <Clock3 className="h-3.5 w-3.5" />
                Week 13
              </button>
            </div>
          }
        />

        {/* Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Execution rate" value={`${executionRate}%`} icon={<Sparkles className="h-4 w-4" />} />
          <MetricCard label="Cycle week" value={`${currentWeek}/12`} icon={<Clock3 className="h-4 w-4" />} />
          <MetricCard label="Velocity" value={`${completedPoints}/${totalPoints}`} icon={<TrendingUp className="h-4 w-4" />} />
          <MetricCard label="Goals" value={`${completedGoals.length}/${activeGoals.length + completedGoals.length}`} icon={<Target className="h-4 w-4" />} />
        </div>

        {/* Intelligence Grid */}
        <div>
          <SectionHeader title="Cycle Intelligence" />
          <div className="grid gap-4 md:grid-cols-2 mt-4">
            <DashboardCard title="Execution Scorecard" subtitle="Committed tasks and completion rate." icon={<Target className="h-4 w-4" />} noPadding>
              <ExecutionScorecardWidget />
            </DashboardCard>
            <DashboardCard title="Cycle Progress" subtitle="Lead indicators, lag results, and timeline." icon={<Clock3 className="h-4 w-4" />} noPadding>
              <CycleProgressWidget />
            </DashboardCard>
          </div>
        </div>

        {/* Cycle Week Management */}
        <div>
          <SectionHeader title="Week Management" subtitle="Manually start and end weeks to control your cycle cadence." icon={<Clock3 className="h-4 w-4" />} />
          <div className="mt-4 rounded-[2rem] border border-zinc-200 bg-white p-6 md:p-8 shadow-sm">
            <CycleWeekManager />
          </div>
        </div>


        {/* Deep Analysis Grid */}
        <div>
          <SectionHeader title="Deep Analysis" />
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr] mt-4">
            
            {/* Left Column */}
            <div className="space-y-4">
              {/* Vision Alignment */}
              <DashboardCard title="Vision Alignment" subtitle="How committed work maps to this week's focus." icon={<Globe2 className="h-4 w-4" />}>
                <div className="space-y-4">
                  <div>
                    <p className="text-lg font-black tracking-tight text-zinc-950">
                      {latestVision ? latestVision.title : 'No active vision set'}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-500">
                      {latestVision ? latestVision.description : 'Set a vision in Execution Studio to align your cycle.'}
                    </p>
                  </div>

                  {latestVision?.focusItems && latestVision.focusItems.length > 0 && (
                    <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-100">
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400 mb-3">
                        <Target className="h-3.5 w-3.5" />
                        Focus Items
                      </div>
                      <ul className="space-y-2">
                        {latestVision.focusItems.map((item, idx) => {
                          const linkedTasks = committedTasks.filter(t =>
                            t.title.toLowerCase().includes(item.toLowerCase().slice(0, 15)) ||
                            (t.sourceTitle && t.sourceTitle.toLowerCase().includes(item.toLowerCase().slice(0, 15)))
                          );
                          return (
                            <li key={idx} className="flex items-start justify-between gap-3 text-sm text-zinc-700">
                              <div className="flex items-start gap-2">
                                <span className="text-zinc-400 mt-0.5">•</span>
                                <span>{item}</span>
                              </div>
                              {linkedTasks.length > 0 && (
                                <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">
                                  {linkedTasks.length} task{linkedTasks.length > 1 ? 's' : ''}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3 pt-2">
                    <InfoPill label="Committed" value={committedTasks.length} />
                    <InfoPill label="Lead ind." value={leadIndicators.length} />
                    <InfoPill label="Done" value={committedTasks.filter(t => t.status === 'done').length} />
                  </div>
                </div>
              </DashboardCard>

              {/* Environment Health */}
              <DashboardCard title="Infrastructure Health" subtitle="Local, staging, and production states." icon={<Server className="h-4 w-4" />} noPadding>
                <EnvironmentStatesWidget />
              </DashboardCard>
            </div>

            {/* Right Column */}
            <CycleHealthScoreCard contextSources={contextSources} />
          </div>
        </div>

        {/* Context Sources */}
        <div>
          <SectionHeader title="Context Source Activity" subtitle="Latest document ingestions and version updates." icon={<Cpu className="h-4 w-4" />} />
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            {contextSources.length === 0 ? (
              <EmptyState icon={<Cpu className="w-6 h-6 text-zinc-300" />} title="No context sources" subtitle="Upload documents in Content Studio." />
            ) : (
              <div className="divide-y divide-zinc-100">
                {contextSources.slice(0, 6).map((source) => (
                  <div id={`source-row-${source.id}`} key={source.id} className={`flex items-start gap-4 px-5 py-4 transition-colors ${highlightSourceId === source.id ? 'bg-zinc-50' : 'hover:bg-zinc-50/50'}`}>
                    <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${
                      source.status === 'active' ? 'bg-emerald-500' : 'bg-amber-500'
                    }`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-zinc-950">{source.title}</p>
                          <p className="mt-0.5 text-xs text-zinc-500 font-mono">{source.latestFileName}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-500">
                            v{source.latestVersion}
                          </span>
                          <span className={`text-[10px] font-bold ${source.status === 'active' ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {source.status}
                          </span>
                        </div>
                      </div>
                      {source.latestSummary && (
                        <p className="mt-2 text-xs text-zinc-400 line-clamp-2">{source.latestSummary}</p>
                      )}
                      <div className="mt-2 flex gap-3 text-[10px] text-zinc-400">
                        {source.linkedTaskIds?.length > 0 && <span>{source.linkedTaskIds.length} tasks</span>}
                        {source.linkedCycleGoalIds?.length > 0 && <span>{source.linkedCycleGoalIds.length} goals</span>}
                        {source.linkedVisionIds?.length > 0 && <span>{source.linkedVisionIds.length} visions</span>}
                        {source.linkedFeedbackIds?.length > 0 && <span>{source.linkedFeedbackIds.length} feedback</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Activity Changelog */}
        <ChangelogFeed />

      </div>
    </div>
  );
}
