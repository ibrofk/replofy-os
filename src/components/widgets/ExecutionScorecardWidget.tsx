import React from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { useGlobalState } from '../../contexts/GlobalStateContext';

export function ExecutionScorecardWidget() {
  const { tasks } = useGlobalState();

  const committedTasks = tasks.filter(t => t.status !== 'icebox');
  const doneCount = committedTasks.filter(t => t.status === 'done').length;
  const executionRate = committedTasks.length > 0 ? Math.round((doneCount / committedTasks.length) * 100) : 0;

  const displayTasks = committedTasks.slice(0, 4);

  return (
    <div className="flex flex-col w-full p-5 shadow-inner bg-zinc-50/50 rounded-b-2xl h-full">
      <div className="flex items-end justify-between mb-4 shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-4xl font-black tracking-tight text-zinc-950 leading-none">{executionRate}%</h3>
          </div>
        </div>
        <div className="text-right flex flex-col items-end gap-1 shrink-0">
           <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.24em]">Target: 85%</span>
           <span className={`text-[10px] font-bold uppercase tracking-[0.24em] ${executionRate >= 85 ? 'text-emerald-500' : executionRate >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
             {executionRate >= 85 ? 'On Track' : executionRate >= 50 ? 'At Risk' : 'Critical'}
           </span>
        </div>
      </div>
      
      <div className="h-2.5 w-full bg-zinc-200 rounded-full overflow-hidden mb-6 shadow-inner relative flex shrink-0">
        <div 
          className={`h-full rounded-full transition-all duration-1000 ease-out relative overflow-hidden ${
            executionRate >= 85 ? 'bg-zinc-900' : 'bg-zinc-800'
          }`}
          style={{ width: `${executionRate}%` }}
        >
          <div className="absolute inset-0 bg-white/20" style={{ transform: 'skewX(-45deg)', animation: 'pulse 2s infinite' }} />
        </div>
      </div>

      <div className="space-y-2.5 flex-1 overflow-y-auto">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400 mb-2 border-b border-zinc-100 pb-2">Recent activity</p>
        
        {displayTasks.map((task) => (
          <div 
            key={task.id} 
            className={`flex items-start gap-3 p-3 rounded-xl border transition-all duration-200 group ${
              task.status === 'done' 
                ? 'bg-zinc-50 border-zinc-200 text-zinc-400 shadow-sm' 
                : 'bg-white border-zinc-200 text-zinc-900 shadow-sm hover:border-zinc-300 hover:shadow-md'
            }`}
          >
            {task.status === 'done' ? (
              <CheckCircle2 className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
            ) : (
              <Circle className="w-4 h-4 text-zinc-300 shrink-0 mt-0.5 group-hover:text-zinc-500 transition-colors" />
            )}
            <div className="flex flex-col min-w-0">
               <span className={`text-xs font-semibold leading-relaxed truncate ${task.status === 'done' ? 'line-through decoration-zinc-300 text-zinc-400' : 'text-zinc-800'}`}>
                 {task.title}
               </span>
               <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">{task.effortPoints} pts</span>
            </div>
          </div>
        ))}
        {committedTasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
             <div className="w-10 h-10 rounded-full bg-zinc-50 flex items-center justify-center border border-zinc-100 mb-3">
               <CheckCircle2 className="w-4 h-4 text-zinc-300" />
             </div>
             <p className="text-xs font-medium text-zinc-500">No committed tasks yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
