import React, { useMemo } from 'react';
import { Activity, Target, TrendingUp, MessageCircle, Server } from 'lucide-react';
import { useGlobalState } from '../../contexts/GlobalStateContext';
import { ContextSource } from '../../types';
import { useCycleWeek } from '../../hooks/useCycleWeek';

interface PriorityItem {
  type: 'task' | 'goal' | 'feedback' | 'environment' | 'context';
  title: string;
  subtitle: string;
  tone: 'red' | 'amber' | 'blue' | 'green';
  icon: React.ReactNode;
}

interface CycleHealthScoreCardProps {
  contextSources: ContextSource[];
}

export function CycleHealthScoreCard({ contextSources }: CycleHealthScoreCardProps) {
  const { tasks, cycleGoals, feedbacks, environments } = useGlobalState();
  const { week, progress: cycleProgress } = useCycleWeek(tasks, cycleGoals);

  const healthAnalysis = useMemo(() => {
    const committedTasks = tasks.filter(t => t.status !== 'icebox');
    const leadIndicators = committedTasks.filter(t => t.isLeadIndicator);
    const completedLeads = leadIndicators.filter(t => t.status === 'done');
    const incompleteTasks = committedTasks.filter(t => t.status !== 'done');
    const executionRate = leadIndicators.length > 0
      ? Math.round((completedLeads.length / leadIndicators.length) * 100)
      : (() => {
          const completedCount = committedTasks.filter(t => t.status === 'done').length;
          return committedTasks.length > 0 ? Math.round((completedCount / committedTasks.length) * 100) : 0;
        })();

    const activeGoals = cycleGoals.filter(g => g.status === 'active');
    const completedGoals = cycleGoals.filter(g => g.status === 'completed');
    const totalGoals = activeGoals.length + completedGoals.length;
    const goalProgress = totalGoals > 0
      ? Math.round((completedGoals.length / totalGoals) * 100)
      : committedTasks.length > 0
        ? Math.round((committedTasks.filter(t => t.status === 'done').length / committedTasks.length) * 100)
        : 0;

    const sentimentScore = feedbacks.length > 0
      ? (() => {
          const scores = feedbacks.map(f => f.sentiment === 'positive' ? 1 : f.sentiment === 'negative' ? -1 : 0);
          const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
          return Math.round(((avg + 1) / 2) * 100);
        })()
      : 50;

    const envHealth = environments.length > 0
      ? Math.round((environments.filter(e => e.status === 'healthy').length / environments.length) * 100)
      : 100;

    const compositeScore = Math.round(
      executionRate * 0.4 +
      goalProgress * 0.3 +
      sentimentScore * 0.15 +
      envHealth * 0.15
    );

    const analysisParts: string[] = [];
    if (executionRate >= 85) analysisParts.push('Execution rate above target');
    else if (executionRate >= 50) analysisParts.push('Execution rate below 85% target');
    else if (executionRate > 0) analysisParts.push('Execution rate critically low');
    else analysisParts.push('No lead indicators set');

    const atRiskGoals = activeGoals.filter(goal => {
      const goalTasks = committedTasks.filter(t => t.cycleGoalId === goal.id);
      const goalDone = goalTasks.filter(t => t.status === 'done').length;
      return goalTasks.length > 0 && goalDone / goalTasks.length < 0.5;
    });
    if (atRiskGoals.length > 0) analysisParts.push(`${atRiskGoals.length} goal${atRiskGoals.length > 1 ? 's' : ''} at risk`);

    const totalPoints = committedTasks.reduce((acc, t) => acc + t.effortPoints, 0);
    const completedPoints = committedTasks.filter(t => t.status === 'done').reduce((acc, t) => acc + t.effortPoints, 0);
    if (totalPoints > 0) analysisParts.push(`velocity ${completedPoints}/${totalPoints} pts`);

    const negativeFeedback = feedbacks.filter(f => f.sentiment === 'negative').length;
    if (negativeFeedback > 2) analysisParts.push(`${negativeFeedback} negative feedback items`);

    const unhealthyEnvs = environments.filter(e => e.status !== 'healthy').length;
    if (unhealthyEnvs > 0) analysisParts.push(`${unhealthyEnvs} environment${unhealthyEnvs > 1 ? 's' : ''} degraded`);

    return {
      executionRate,
      goalProgress,
      sentimentScore,
      envHealth,
      compositeScore,
      analysis: analysisParts.join('. ') + '.',
      activeGoalsCount: activeGoals.length,
      completedGoalsCount: completedGoals.length,
      committedTasksCount: committedTasks.length,
      completedTasksCount: committedTasks.filter(t => t.status === 'done').length,
      totalPoints,
      completedPoints,
      negativeFeedbackCount: negativeFeedback,
      unhealthyEnvCount: unhealthyEnvs,
      atRiskGoalsCount: atRiskGoals.length,
    };
  }, [tasks, cycleGoals, feedbacks, environments]);

  const priorityItems: PriorityItem[] = useMemo(() => {
    const items: PriorityItem[] = [];
    const committedTasks = tasks.filter(t => t.status !== 'icebox');
    const leadIndicators = committedTasks.filter(t => t.isLeadIndicator);
    const incompleteTasks = committedTasks.filter(t => t.status !== 'done');

    if (leadIndicators.length > 0) {
      const overdueLeads = incompleteTasks
        .filter(t => t.isLeadIndicator)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .slice(0, 2);
      overdueLeads.forEach(task => {
        items.push({
          type: 'task',
          title: task.title,
          subtitle: `Lead indicator · ${task.effortPoints} pts · ${task.status}`,
          tone: 'red',
          icon: <Target className="h-4 w-4" />,
        });
      });
    }

    const incompleteNonLead = incompleteTasks.filter(t => !t.isLeadIndicator).slice(0, 3);
    incompleteNonLead.forEach(task => {
      items.push({
        type: 'task',
        title: task.title,
        subtitle: `${task.effortPoints} pts · ${task.status}`,
        tone: task.isLeadIndicator ? 'red' : 'amber',
        icon: <Target className="h-4 w-4" />,
      });
    });

    const atRiskGoals = cycleGoals.filter(g => g.status === 'active').filter(goal => {
      const goalTasks = committedTasks.filter(t => t.cycleGoalId === goal.id);
      const goalDone = goalTasks.filter(t => t.status === 'done').length;
      return goalTasks.length > 0 && goalDone / goalTasks.length < 0.5;
    });
    atRiskGoals.forEach(goal => {
      const goalTasks = committedTasks.filter(t => t.cycleGoalId === goal.id);
      const goalDone = goalTasks.filter(t => t.status === 'done').length;
      items.push({
        type: 'goal',
        title: goal.title,
        subtitle: `${goalDone}/${goalTasks.length} tasks completed`,
        tone: 'amber',
        icon: <TrendingUp className="h-4 w-4" />,
      });
    });

    feedbacks
      .filter(f => f.sentiment === 'negative')
      .slice(0, 2)
      .forEach(fb => {
        items.push({
          type: 'feedback',
          title: fb.source,
          subtitle: fb.content.length > 80 ? fb.content.slice(0, 80) + '...' : fb.content,
          tone: 'red',
          icon: <MessageCircle className="h-4 w-4" />,
        });
      });

    environments
      .filter(e => e.status !== 'healthy')
      .forEach(env => {
        items.push({
          type: 'environment',
          title: env.name,
          subtitle: `${env.status} · ${env.version}`,
          tone: 'blue',
          icon: <Server className="h-4 w-4" />,
        });
      });

    contextSources
      .filter(s => s.status !== 'active')
      .slice(0, 2)
      .forEach(source => {
        items.push({
          type: 'context',
          title: source.title,
          subtitle: `${source.latestFileName} · ${source.status}`,
          tone: 'amber',
          icon: <Activity className="h-4 w-4" />,
        });
      });

    return items.slice(0, 8);
  }, [tasks, cycleGoals, feedbacks, environments, contextSources]);

  return (
    <div className="space-y-6 flex flex-col h-full min-w-0">
      {/* Cycle Health Score */}
      <div className="relative rounded-[2rem] border border-white/10 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800 p-6 text-left text-white shadow-xl overflow-hidden shrink-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.05),transparent_30%)] pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-start justify-between gap-3 mb-6">
            <div>
              <h3 className="text-xl font-black tracking-tight flex items-center gap-2">Cycle Engine Status <Activity className="h-4 w-4 text-white/50" /></h3>
              <p className="mt-1 text-xs font-semibold text-white/60">
                Week {Math.min(week, 12)} of 12 · {Math.round(cycleProgress)}% through cycle
              </p>
            </div>
            <div className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] shadow-sm backdrop-blur-md ${
              healthAnalysis.compositeScore >= 70
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : healthAnalysis.compositeScore >= 40
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                : 'border-red-500/30 bg-red-500/10 text-red-400'
            }`}>
              {healthAnalysis.compositeScore >= 70 ? 'On Track' : healthAnalysis.compositeScore >= 40 ? 'At Risk' : 'Critical'}
            </div>
          </div>
          
          <div className="flex flex-col mb-6">
            <p className="text-5xl font-black tracking-tighter leading-none">{healthAnalysis.compositeScore}%</p>
            <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-white/50 border-b border-white/10 pb-4">Composite Health</p>
          </div>
          
          <div className="pt-2">
            <p className="text-sm font-medium leading-relaxed text-zinc-300 backdrop-blur-md border border-white/5 bg-white/5 rounded-xl p-3 shadow-inner">{healthAnalysis.analysis}</p>
          </div>
          
          <div className="mt-5 grid grid-cols-4 gap-2">
            {[
              { label: 'Execution', value: healthAnalysis.executionRate },
              { label: 'Goals', value: healthAnalysis.goalProgress },
              { label: 'Sentiment', value: healthAnalysis.sentimentScore },
              { label: 'Infra', value: healthAnalysis.envHealth }
            ].map((stat, idx) => (
              <div key={idx} className="text-center bg-white/5 rounded-xl py-3 border border-white/5 hover:bg-white/10 transition-colors">
                <p className="text-lg font-black tracking-tight">{stat.value}%</p>
                <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/40 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Priority Operations Feed */}
      <div className="rounded-[2rem] border border-zinc-200 bg-white shadow-sm overflow-hidden flex-1 flex flex-col min-h-[300px]">
        <div className="border-b border-zinc-100 px-5 py-4 shrink-0 bg-zinc-50/50">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[10px] font-black uppercase tracking-[0.24em] text-zinc-400">Priority Operations Feed</h2>
              <p className="mt-0.5 text-xs font-semibold text-zinc-600">What needs attention right now.</p>
            </div>
          </div>
        </div>

        <div className="divide-y divide-zinc-100 overflow-y-auto flex-1 bg-zinc-50/20">
          {priorityItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center border border-zinc-100 mb-3 shadow-sm">
                <Target className="w-5 h-5 text-zinc-300" />
              </div>
              <p className="text-sm font-semibold text-zinc-500">No urgent signals.</p>
              <p className="text-xs text-zinc-400 mt-1">The cycle is running smoothly.</p>
            </div>
          ) : (
            priorityItems.map((item, index) => (
              <div key={`${item.type}-${index}`} className="flex items-start gap-4 px-5 py-4 hover:bg-zinc-50/80 transition-colors group">
                <div className={`mt-0.5 h-8 w-8 rounded-full flex items-center justify-center shrink-0 border shadow-sm ${
                  item.tone === 'red' ? 'bg-red-50 text-red-600 border-red-100' :
                  item.tone === 'amber' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                  item.tone === 'blue' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                  'bg-emerald-50 text-emerald-600 border-emerald-100'
                }`}>
                   {item.icon}
                </div>
                <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-3">
                  <div className="min-w-0 pr-2">
                    <p className="truncate text-sm font-bold text-zinc-950 group-hover:text-zinc-700 transition-colors">{item.title}</p>
                    <p className="mt-0.5 text-xs font-semibold text-zinc-500 truncate">{item.subtitle}</p>
                  </div>
                  <span className="shrink-0 self-start sm:self-auto rounded bg-white border border-zinc-200 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.24em] text-zinc-500 shadow-sm group-hover:bg-zinc-50 transition-colors">
                    {item.type}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
