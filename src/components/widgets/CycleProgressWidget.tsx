import React from 'react';
import { Target, TrendingUp, Clock, CheckCircle2 } from 'lucide-react';
import { useGlobalState } from '../../contexts/GlobalStateContext';
import { useCycleWeek } from '../../hooks/useCycleWeek';

export function CycleProgressWidget() {
  const { tasks, cycleGoals } = useGlobalState();
  const { week, progress } = useCycleWeek(tasks, cycleGoals);

  const totalWeeks = 12;

  const committedTasks = tasks.filter(t => t.status !== 'icebox');
  const leadIndicators = committedTasks.filter(t => t.isLeadIndicator);
  const completedLeadIndicators = leadIndicators.filter(t => t.status === 'done');
  const leadTotal = leadIndicators.length;
  const leadCompleted = completedLeadIndicators.length;
  const executionRate = leadTotal > 0 ? Math.round((leadCompleted / leadTotal) * 100) : 0;

  const totalGoals = cycleGoals.filter(g => g.status === 'active' || g.status === 'completed');
  const completedGoals = cycleGoals.filter(g => g.status === 'completed');

  return (
    <div className="flex flex-col w-full p-5 shadow-inner bg-zinc-50/50 rounded-b-2xl">
      <div className="flex items-end justify-between mb-4 shrink-0">
        <div>
          <h3 className="text-3xl font-black tracking-tight text-zinc-950 leading-none">Week {week}</h3>
          <p className="text-[10px] font-bold text-zinc-400 mt-1 uppercase tracking-[0.24em]">of {totalWeeks} Week Year</p>
        </div>
        <div className="text-right flex flex-col items-end gap-1 shrink-0">
          <span className="text-xl font-black text-zinc-950 leading-none">{Math.round(progress)}%</span>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.24em]">Cycle Progress</p>
        </div>
      </div>
      
      <div className="h-2.5 w-full bg-zinc-200 rounded-full overflow-hidden mb-6 shadow-inner relative flex shrink-0">
        <div 
          className="h-full bg-zinc-900 rounded-full transition-all duration-1000 ease-out relative overflow-hidden"
          style={{ width: `${progress}%` }}
        >
           <div className="absolute inset-0 bg-white/20" style={{ transform: 'skewX(-45deg)', animation: 'pulse 2s infinite' }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="group bg-white rounded-2xl p-4 border border-zinc-200 shadow-sm hover:border-zinc-300 hover:shadow-md transition-all duration-200">
          <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-[0.24em] mb-3 border-b border-zinc-100 pb-2">
            <TrendingUp className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-900 transition-colors" />
            Lead Indicators
          </div>
          <div className="flex items-end gap-2 mb-1">
            <div className="text-3xl font-black text-zinc-950 leading-none">{leadCompleted}</div>
            <div className="text-sm font-semibold text-zinc-400 mb-0.5">/ {leadTotal}</div>
          </div>
          <p className="text-xs font-semibold text-emerald-600 mt-2 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {executionRate}% Execution
          </p>
        </div>
        <div className="group bg-white rounded-2xl p-4 border border-zinc-200 shadow-sm hover:border-zinc-300 hover:shadow-md transition-all duration-200">
          <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-[0.24em] mb-3 border-b border-zinc-100 pb-2">
            <Target className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-900 transition-colors" />
            Lag Results
          </div>
          <div className="flex items-end gap-2 mb-1">
            <div className="text-3xl font-black text-zinc-950 leading-none">{completedGoals.length}</div>
            <div className="text-sm font-semibold text-zinc-400 mb-0.5">/ {totalGoals.length}</div>
          </div>
          <p className="text-xs font-semibold text-zinc-500 mt-2 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Goals completed
          </p>
        </div>
      </div>
    </div>
  );
}
