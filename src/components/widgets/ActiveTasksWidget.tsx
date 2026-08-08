import React from 'react';
import { ListTodo, Flame, CheckCircle2, Circle, Archive, User } from 'lucide-react';
import { useGlobalState } from '../../contexts/GlobalStateContext';
import { useUser } from '../../contexts/UserContext';
import { executionDataService } from '../../services/executionDataService';
import { Task } from '../../types';

export function ActiveTasksWidget() {
  const { tasks, teamMembers: globalTeamMembers } = useGlobalState();
  const { userProfile } = useUser();
  const teamMembers = globalTeamMembers.length > 0
    ? globalTeamMembers
    : userProfile
      ? [userProfile]
      : [];

  const activeTasks = tasks
    .filter(t => t.status === 'todo' || t.status === 'in-progress')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const totalPoints = activeTasks.reduce((acc, task) => acc + task.effortPoints, 0);

  const toggleTaskStatus = async (task: Task) => {
    try {
      let newStatus = task.status;
      if (task.status === 'done') newStatus = task.cycleGoalId ? 'todo' : 'icebox';
      else if (task.status === 'todo' || task.status === 'in-progress' || task.status === 'icebox') newStatus = 'done';

      await executionDataService.updateTask(task.id, {
        status: newStatus,
        completedAt: newStatus === 'done' ? new Date().toISOString() : null,
      }, task.cycleGoalId);
    } catch (error) {
      console.error('[ActiveTasksWidget] Failed to update task:', error);
    }
  };

  const delayTask = async (task: Task) => {
    try {
      await executionDataService.updateTask(task.id, {
        status: 'icebox',
      }, task.cycleGoalId);
    } catch (error) {
      console.error('[ActiveTasksWidget] Failed to delay task:', error);
    }
  };

  return (
    <div className="bento-card h-full w-full">
      <div className="bento-title">
        <ListTodo className="w-4 h-4 text-zinc-600" />
        Active Sprint Tasks
      </div>
      
      <div className="flex flex-col h-full justify-between gap-4">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold tracking-tight text-gray-900">Current Work</h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-zinc-500" />
                <span className="text-sm font-mono font-bold text-gray-700">{totalPoints} pts</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {activeTasks.length === 0 ? (
              <p className="text-sm text-gray-500">No active tasks. Add some in the Tasks module.</p>
            ) : (
              activeTasks.map((task) => {
                const assignee = teamMembers.find(m => m.id === task.assigneeId);
                return (
                <div key={task.id} className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-200 hover:border-gray-300 transition-colors group">
                  <div className="flex items-center gap-3">
                    <button onClick={() => toggleTaskStatus(task)} className="text-zinc-400 hover:text-zinc-500 transition-colors">
                      {task.status === 'done' ? (
                        <CheckCircle2 className="w-5 h-5 text-zinc-500" />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </button>
                    <span className={`text-sm font-medium ${task.status === 'done' ? 'text-zinc-400 line-through' : 'text-zinc-700'}`}>
                      {task.title}
                    </span>
                    {task.isLeadIndicator && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-[0.24em] bg-zinc-50 text-zinc-600 border border-zinc-200">
                        Lead
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {assignee ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded">
                        <User className="w-3 h-3" />
                        {assignee.displayName || assignee.email}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-400">Unassigned</span>
                    )}
                    <span className="text-xs font-mono text-gray-500">
                      {task.effortPoints} pts
                    </span>
                    <button
                      onClick={() => delayTask(task)}
                      title="Delay to Icebox"
                      className="text-zinc-400 hover:text-zinc-500 opacity-0 group-hover:opacity-100 transition-all ml-2"
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
