import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, where, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, logFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { Task, CycleGoal } from '../types';
import { Calendar, Archive } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { NotificationBell } from '../components/NotificationBell';

export function Week13ReviewPage() {
  const { userProfile } = useUser();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<CycleGoal[]>([]);
  const [isArchiving, setIsArchiving] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;
    
    const tasksQuery = userProfile?.companyId
      ? query(collection(db, 'tasks'), where('companyId', '==', userProfile.companyId))
      : query(collection(db, 'tasks'), where('authorId', '==', auth.currentUser.uid));
    
    const goalsQuery = userProfile?.companyId
      ? query(collection(db, 'cycleGoals'), where('companyId', '==', userProfile.companyId))
      : query(collection(db, 'cycleGoals'), where('authorId', '==', auth.currentUser.uid));

    const unsubscribeTasks = onSnapshot(tasksQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Task[];
      setTasks(data);
    }, (error) => {
      logFirestoreError(error, OperationType.GET, 'tasks');
    });

    const unsubscribeGoals = onSnapshot(goalsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CycleGoal[];
      setGoals(data);
    }, (error) => {
      logFirestoreError(error, OperationType.GET, 'cycleGoals');
    });

    return () => {
      unsubscribeTasks();
      unsubscribeGoals();
    };
  }, [userProfile?.companyId]);

  const cycleTasks = tasks.filter(t => t.status !== 'icebox');
  const completedTasks = cycleTasks.filter(t => t.status === 'done');
  const leadIndicators = cycleTasks.filter(t => t.isLeadIndicator);
  const completedLeadIndicators = leadIndicators.filter(t => t.status === 'done');
  const executionRate = leadIndicators.length > 0 
    ? Math.round((completedLeadIndicators.length / leadIndicators.length) * 100) 
    : 0;

  const totalEffortPlanned = cycleTasks.reduce((sum, t) => sum + (t.effortPoints || 0), 0);
  const totalEffortCompleted = completedTasks.reduce((sum, t) => sum + (t.effortPoints || 0), 0);

  const activeGoals = goals.filter(g => g.status !== 'archived');
  const archivedGoals = goals.filter(g => g.status === 'archived');

  const handleStartNewCycle = async () => {
    if (!auth.currentUser || isArchiving) return;
    if (!window.confirm("Are you sure? This will archive all active goals and icebox unfinished tasks.")) return;
    setIsArchiving(true);

    try {
      const unfinishedTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'icebox');
      const activeGoalsToUpdate = goals.filter(g => g.status === 'active');

      const updates = [
        ...unfinishedTasks.map(t => updateDoc(doc(db, 'tasks', t.id), { status: 'icebox' })),
        ...activeGoalsToUpdate.map(g => updateDoc(doc(db, 'cycleGoals', g.id), { status: 'archived' })),
      ];

      await Promise.all(updates);
    } catch (error) {
      handleFirestoreError(error as Error, OperationType.UPDATE, 'cycle');
    } finally {
      setIsArchiving(false);
    }
  };

  const currentDate = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', month: 'long', day: 'numeric' 
  }).toUpperCase();

  const currentTime = new Date().toLocaleTimeString('en-US', { 
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' 
  });

  return (
    <div className="min-h-full bg-zinc-100 flex justify-center p-4 py-12 md:py-24 font-mono">
      <div className="w-full max-w-xl bg-white shadow-xl shadow-black/5" style={{ filter: 'drop-shadow(0 20px 25px rgba(0, 0, 0, 0.05))' }}>
        
        {/* Receipt Header */}
        <div className="relative p-8 pb-4 border-b-2 border-dashed border-zinc-300 text-center space-y-2">
          <div className="absolute right-4 top-4 font-sans">
            <NotificationBell />
          </div>
          <Calendar className="h-6 w-6 mx-auto mb-4 text-zinc-950" />
          <h1 className="text-xl font-black uppercase tracking-[0.24em] text-zinc-950">
            Replofy OS
          </h1>
          <p className="text-sm font-bold text-zinc-500 uppercase tracking-[0.24em]">
            Cycle Execution Receipt
          </p>
          <div className="pt-4 text-xs font-bold text-zinc-400 flex justify-between uppercase">
            <span>DATE: {currentDate}</span>
            <span>TIME: {currentTime}</span>
          </div>
          <div className="text-xs font-bold text-zinc-400 text-left uppercase">
            AUTH: {userProfile?.email || 'OFFLINE'}
          </div>
        </div>

        {/* Global Metrics */}
        <div className="p-8 border-b-2 border-dashed border-zinc-300">
          <h2 className="text-sm font-black uppercase tracking-[0.24em] text-zinc-950 mb-6">Global Sum</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-[0.24em]">Execution Rate</span>
              <span className="text-2xl font-black text-zinc-950 leading-none">{executionRate}%</span>
            </div>
            <div className="flex justify-between items-end">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-[0.24em]">Total Velocity (PTS)</span>
              <span className="text-xl font-black text-zinc-950 leading-none">{totalEffortCompleted}/{totalEffortPlanned}</span>
            </div>
            <div className="flex justify-between items-end">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-[0.24em]">Tasks Delivered</span>
              <span className="text-xl font-black text-zinc-950 leading-none">{completedTasks.length}/{cycleTasks.length}</span>
            </div>
          </div>
        </div>

        {/* Cycle Goals Breakdown */}
        <div className="p-8 border-b-2 border-dashed border-zinc-300">
          <h2 className="text-sm font-black uppercase tracking-[0.24em] text-zinc-950 mb-6 flex justify-between">
            <span>Goal Breakdown</span>
            <span>[{activeGoals.length}]</span>
          </h2>
          
          <div className="space-y-6">
            {activeGoals.length === 0 ? (
              <p className="text-xs text-zinc-500 uppercase tracking-[0.24em] text-center py-4">NO ACTIVE GOALS</p>
            ) : (
              activeGoals.map((goal, index) => {
                const goalTasks = cycleTasks.filter(t => t.cycleGoalId === goal.id);
                const completedGoalTasks = goalTasks.filter(t => t.status === 'done');
                const progress = goalTasks.length > 0 ? Math.round((completedGoalTasks.length / goalTasks.length) * 100) : 0;
                const ptSum = goalTasks.reduce((acc, t) => acc + (t.effortPoints || 0), 0);
                const ptDone = completedGoalTasks.reduce((acc, t) => acc + (t.effortPoints || 0), 0);

                return (
                  <div key={goal.id} className="relative">
                    <div className="flex gap-4">
                      <span className="text-xs font-black text-zinc-400 w-6">{(index+1).toString().padStart(2, '0')}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-zinc-950 leading-snug break-words">
                          {goal.title.toUpperCase()}
                        </div>
                        <div className="mt-2 text-[10px] text-zinc-500 font-bold uppercase tracking-[0.24em] flex justify-between">
                          <span>{goal.status === 'completed' ? 'PASS' : 'FAIL'}</span>
                          <span>{progress}% ACC</span>
                        </div>
                        <div className="mt-1 flex gap-2 w-full">
                          {Array.from({ length: 20 }).map((_, i) => (
                             <div key={i} className={`flex-1 h-2 ${i < (progress/100 * 20) ? 'bg-zinc-950' : 'bg-zinc-200'} transition-all`} />
                          ))}
                        </div>
                        <div className="mt-2 text-[10px] text-zinc-400 font-bold uppercase tracking-[0.24em] flex justify-between">
                          <span>TASKS: {completedGoalTasks.length}/{goalTasks.length}</span>
                          <span>PTS: {ptDone}/{ptSum}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Historical Archive Count */}
        <div className="p-8 border-b-2 border-dashed border-zinc-300">
           <div className="flex justify-between items-center text-xs font-bold text-zinc-500 uppercase tracking-[0.24em] mb-1">
             <span>Archived Cycles</span>
             <span>[{archivedGoals.length}]</span>
           </div>
           <p className="text-[10px] text-zinc-400 uppercase tracking-[0.24em]">Awaiting permanent storage allocation.</p>
        </div>

        {/* Action Tape */}
        <div className="bg-zinc-950 p-8 text-white relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full flex justify-around">
             {Array.from({length: 30}).map((_, i) => <div key={i} className="w-1 h-2 bg-white/20 rounded-b" />)}
          </div>
          <div className="text-center pt-4">
            <Archive className="w-8 h-8 mx-auto mb-4 text-white" />
            <h2 className="text-lg font-black uppercase tracking-[0.24em] mb-2">Initialize Next Cycle</h2>
            <p className="text-[10px] text-zinc-400 uppercase tracking-[0.24em] leading-relaxed mb-6 max-w-xs mx-auto">
              End sequence confirmed. This action will archive active goals and return pending tasks to cold storage.
            </p>
            <button
              onClick={handleStartNewCycle}
              disabled={isArchiving}
              className="w-full py-4 bg-white text-zinc-950 text-sm font-black uppercase tracking-[0.24em] hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {isArchiving ? 'PROCESSING...' : '[ EXECUTE ARCHIVE ]'}
            </button>
          </div>
        </div>
        
        {/* Receipt Tape Serration Edge Bottom */}
        <div className="h-4 w-full" style={{ backgroundImage: 'radial-gradient(circle at 10px 0, transparent 10px, #fff 11px)', backgroundSize: '20px 20px', backgroundRepeat: 'repeat-x', backgroundPosition: 'bottom' }} />

      </div>
    </div>
  );
}
