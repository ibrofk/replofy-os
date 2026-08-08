import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { useGlobalState } from '../../contexts/GlobalStateContext';
import { useUser } from '../../contexts/UserContext';
import { handleFirestoreError, OperationType } from '../../utils/firestoreErrorHandler';
import { CheckCircle2, RotateCcw, Play, Square } from 'lucide-react';

interface WeekMarker {
  id: string;
  weekNumber: number;
  startedAt: string;
  endedAt?: string | null;
  status: 'active' | 'completed' | 'upcoming';
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function getCycleStartDate(tasks: { createdAt: string }[], goals: { createdAt: string }[]): Date | null {
  const allDates = [
    ...tasks.map(t => new Date(t.createdAt).getTime()),
    ...goals.map(g => new Date(g.createdAt).getTime()),
  ].filter(t => !isNaN(t));
  if (allDates.length === 0) return null;
  return new Date(Math.min(...allDates));
}

function sortWeekMarkers(markers: WeekMarker[]) {
  return markers.sort((a, b) => a.weekNumber - b.weekNumber);
}

export function CycleWeekManager() {
  const { tasks, cycleGoals, visions } = useGlobalState();
  const { userProfile } = useUser();
  const [weekMarkers, setWeekMarkers] = useState<WeekMarker[]>([]);
  const [isTransitioning, setIsTransitioning] = useState<number | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState<{ week: number; action: 'start' | 'end' } | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;

    const scopeQuery = userProfile?.companyId
      ? query(collection(db, 'weekMarkers'), where('companyId', '==', userProfile.companyId))
      : query(collection(db, 'weekMarkers'), where('authorId', '==', auth.currentUser.uid));

    const loadWeekMarkers = async () => {
      try {
        const snapshot = await getDocs(scopeQuery);
        const markers = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as WeekMarker));
        setWeekMarkers(sortWeekMarkers(markers));
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'weekMarkers');
      }
    };

    loadWeekMarkers();
  }, [userProfile?.companyId]);

  const cycleStart = useMemo(() => getCycleStartDate(tasks, cycleGoals), [tasks, cycleGoals]);

  const currentActiveWeek = useMemo(() => {
    return weekMarkers.find(w => w.status === 'active');
  }, [weekMarkers]);

  const autoWeek = useMemo(() => {
    if (!cycleStart) return 1;
    const elapsed = Date.now() - cycleStart.getTime();
    return Math.min(13, Math.max(1, Math.ceil(elapsed / MS_PER_WEEK) + 1));
  }, [cycleStart]);

  const displayWeek = currentActiveWeek ? currentActiveWeek.weekNumber : Math.min(autoWeek, 12);
  const [selectedWeek, setSelectedWeek] = useState<number>(displayWeek);

  useEffect(() => {
    setSelectedWeek(displayWeek);
  }, [displayWeek]);

  const getWeekMarkerQuery = () => (
    userProfile?.companyId
      ? query(collection(db, 'weekMarkers'), where('companyId', '==', userProfile.companyId))
      : query(collection(db, 'weekMarkers'), where('authorId', '==', auth.currentUser!.uid))
  );

  const refreshWeekMarkers = async () => {
    const snapshot = await getDocs(getWeekMarkerQuery());
    const markers = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as WeekMarker));
    setWeekMarkers(sortWeekMarkers(markers));
  };

  const getDerivedCompletedWindow = (weekNumber: number, now: Date) => {
    if (!cycleStart) {
      const nowIso = now.toISOString();
      return {
        startedAt: nowIso,
        endedAt: nowIso,
      };
    }

    const start = new Date(cycleStart.getTime() + ((weekNumber - 1) * MS_PER_WEEK));
    const end = new Date(start.getTime() + MS_PER_WEEK);
    const safeStart = start.getTime() > now.getTime() ? now : start;
    const safeEnd = end.getTime() > now.getTime() ? now : end;

    return {
      startedAt: safeStart.toISOString(),
      endedAt: safeEnd.toISOString(),
    };
  };

  const applySequentialTransition = async (activeWeekNumber: number | null, completedThroughWeek: number) => {
    if (!auth.currentUser) return;

    const now = new Date();
    const nowIso = now.toISOString();
    const batch = writeBatch(db);
    const existingByWeek = new Map<number, WeekMarker>(weekMarkers.map((marker) => [marker.weekNumber, marker]));

    for (const marker of weekMarkers) {
      const shouldKeep = marker.weekNumber <= completedThroughWeek || marker.weekNumber === activeWeekNumber;
      if (!shouldKeep) {
        batch.delete(doc(db, 'weekMarkers', marker.id));
      }
    }

    for (let weekNumber = 1; weekNumber <= completedThroughWeek; weekNumber++) {
      const existingMarker = existingByWeek.get(weekNumber);
      const derivedWindow = getDerivedCompletedWindow(weekNumber, now);

      if (existingMarker) {
        batch.update(doc(db, 'weekMarkers', existingMarker.id), {
          status: 'completed',
          startedAt: existingMarker.startedAt || derivedWindow.startedAt,
          endedAt: existingMarker.endedAt || derivedWindow.endedAt,
        });
      } else {
        const newWeekRef = doc(collection(db, 'weekMarkers'));
        batch.set(newWeekRef, {
          weekNumber,
          status: 'completed',
          startedAt: derivedWindow.startedAt,
          endedAt: derivedWindow.endedAt,
          authorId: auth.currentUser.uid,
          companyId: userProfile?.companyId || null,
          createdAt: derivedWindow.startedAt,
        });
      }
    }

    if (activeWeekNumber !== null) {
      const existingActiveMarker = existingByWeek.get(activeWeekNumber);

      if (existingActiveMarker) {
        batch.update(doc(db, 'weekMarkers', existingActiveMarker.id), {
          status: 'active',
          startedAt: nowIso,
          endedAt: null,
        });
      } else {
        const newWeekRef = doc(collection(db, 'weekMarkers'));
        batch.set(newWeekRef, {
          weekNumber: activeWeekNumber,
          status: 'active',
          startedAt: nowIso,
          authorId: auth.currentUser.uid,
          companyId: userProfile?.companyId || null,
          createdAt: nowIso,
        });
      }
    }

    await batch.commit();
    await refreshWeekMarkers();
  };

  const handleStartWeek = async (weekNumber: number) => {
    if (!auth.currentUser) return;
    setIsTransitioning(weekNumber);
    try {
      await applySequentialTransition(weekNumber, weekNumber - 1);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'weekMarkers');
    } finally {
      setIsTransitioning(null);
      setShowConfirmDialog(null);
    }
  };

  const handleEndWeek = async (weekNumber: number) => {
    if (!auth.currentUser) return;
    setIsTransitioning(weekNumber);
    try {
      const nextWeekNumber = weekNumber < 12 ? weekNumber + 1 : 1;
      const completedThroughWeek = weekNumber < 12 ? weekNumber : 0;
      await applySequentialTransition(nextWeekNumber, completedThroughWeek);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'weekMarkers');
    } finally {
      setIsTransitioning(null);
      setShowConfirmDialog(null);
    }
  };

  const handleResetCycle = async () => {
    if (!auth.currentUser) return;
    if (!window.confirm('Reset all week markers? This will clear all manual week transitions.')) return;
    setIsTransitioning(-1);
    try {
      const batch = writeBatch(db);
      weekMarkers.forEach(marker => {
        batch.delete(doc(db, 'weekMarkers', marker.id));
      });
      await batch.commit();
      setWeekMarkers([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'weekMarkers');
    } finally {
      setIsTransitioning(null);
    }
  };

  const getWeekStats = (weekNumber: number) => {
    const weekVisions = visions.filter(v => {
      if (!v.createdAt) return false;
      const visionDate = new Date(v.createdAt);
      const marker = weekMarkers.find(w => w.weekNumber === weekNumber);
      if (!marker) return false;
      const startedAt = new Date(marker.startedAt);
      const endedAt = marker.endedAt ? new Date(marker.endedAt) : new Date();
      return visionDate >= startedAt && visionDate <= endedAt;
    });

    const weekTasks = tasks.filter(t => {
      if (!t.createdAt) return false;
      const taskDate = new Date(t.createdAt);
      const marker = weekMarkers.find(w => w.weekNumber === weekNumber);
      if (!marker) return false;
      const startedAt = new Date(marker.startedAt);
      const endedAt = marker.endedAt ? new Date(marker.endedAt) : new Date();
      return taskDate >= startedAt && taskDate <= endedAt;
    });

    return {
      visions: weekVisions.length,
      tasks: weekTasks.length,
      completedTasks: weekTasks.filter(t => t.status === 'done').length,
    };
  };

  return (
    <div className="space-y-6">
      {/* Current Week Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight text-zinc-950">Cycle Progress</h2>
          <p className="text-sm text-zinc-500 mt-1">
            {currentActiveWeek ? `Week ${currentActiveWeek.weekNumber} is currently active.` : 'No active week in the cycle.'}
          </p>
        </div>
        <button
          onClick={handleResetCycle}
          disabled={isTransitioning === -1 || weekMarkers.length === 0}
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
          title="Reset all week markers"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset Cycle
        </button>
      </div>

      {/* Interactive 12-Week Grid */}
      <div className="grid grid-cols-6 sm:grid-cols-12 gap-2">
        {Array.from({ length: 12 }, (_, i) => i + 1).map(weekNumber => {
          const marker = weekMarkers.find(w => w.weekNumber === weekNumber);
          const isCurrentActive = currentActiveWeek?.weekNumber === weekNumber;
          const isCompleted = marker?.status === 'completed';
          const isSelected = selectedWeek === weekNumber;

          return (
            <button
              key={weekNumber}
              onClick={() => setSelectedWeek(weekNumber)}
              className={`relative flex items-center justify-center w-full aspect-square rounded-xl text-sm font-bold transition-all ${
                isSelected ? 'ring-2 ring-zinc-900 ring-offset-2 scale-105 z-10 shadow-sm' : 'hover:scale-105 z-0'
              } ${
                isCurrentActive
                  ? 'bg-zinc-900 text-white'
                  : isCompleted
                  ? 'bg-zinc-900 border border-zinc-900 text-white'
                  : 'bg-white border border-zinc-200 text-zinc-400 hover:text-zinc-600 hover:border-zinc-300'
              }`}
            >
              {isCompleted && !isCurrentActive ? (
                <CheckCircle2 className="w-5 h-5 text-white" />
              ) : (
                weekNumber
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Week Action Panel */}
      {(() => {
        const marker = weekMarkers.find(w => w.weekNumber === selectedWeek);
        const isSelectedActive = currentActiveWeek?.weekNumber === selectedWeek;
        const isSelectedCompleted = marker?.status === 'completed';
        const stats = getWeekStats(selectedWeek);
        const isLoading = isTransitioning === selectedWeek;

        return (
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 mt-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                Manage Week {selectedWeek}
                {isSelectedActive && <span className="flex h-2 w-2 rounded-full bg-emerald-500" />}
              </h3>
              <p className="text-xs text-zinc-500 mt-1">
                {isSelectedActive 
                  ? `Active since ${new Date(marker!.startedAt).toLocaleDateString()}` 
                  : isSelectedCompleted
                  ? `Completed on ${marker!.endedAt ? new Date(marker!.endedAt).toLocaleDateString() : 'Unknown'}`
                  : 'Upcoming or skipped week'
                }
                {stats.tasks > 0 && ` • ${stats.completedTasks}/${stats.tasks} tasks`}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {isSelectedActive && (
                <button
                  onClick={() => setShowConfirmDialog({ week: selectedWeek, action: 'end' })}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-50 transition"
                >
                  <Square className="h-3.5 w-3.5" />
                  End Week {selectedWeek}
                </button>
              )}
              {(!isSelectedActive) && (
                <button
                  onClick={() => setShowConfirmDialog({ week: selectedWeek, action: 'start' })}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 transition"
                >
                  <Play className="h-3.5 w-3.5" />
                  {isSelectedCompleted ? 'Restart Week' : 'Start Week'} {selectedWeek}
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-bold text-zinc-900">
              {showConfirmDialog.action === 'start' ? `Start Week ${showConfirmDialog.week}?` : `End Week ${showConfirmDialog.week}?`}
            </h3>
              <p className="text-sm text-zinc-500 mt-2">
                {showConfirmDialog.action === 'start'
                ? `This will make week ${showConfirmDialog.week} active, mark all earlier weeks as completed, and clear any later stray weeks.`
                : showConfirmDialog.week < 12
                  ? `This will complete week ${showConfirmDialog.week} and start week ${showConfirmDialog.week + 1}.`
                  : 'This will close the current cycle and restart at week 1.'}
              </p>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowConfirmDialog(null)}
                className="flex-1 rounded-full border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (showConfirmDialog.action === 'start') {
                    handleStartWeek(showConfirmDialog.week);
                  } else {
                    handleEndWeek(showConfirmDialog.week);
                  }
                }}
                className="flex-1 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 transition"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
