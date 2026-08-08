import { useEffect, useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { standaloneClient } from '../services/standaloneClient';

type CycleSource = {
  createdAt: string;
};

type WeekMarker = {
  id: string;
  weekNumber: number;
  startedAt: string;
  endedAt?: string | null;
  status: 'active' | 'completed' | 'upcoming';
};

interface UseCycleWeekResult {
  week: number;
  rawWeek: number;
  progress: number;
  hasManualWeek: boolean;
}

function getCycleStartDate(items: CycleSource[]): Date | null {
  const timestamps = items
    .map((item) => new Date(item.createdAt).getTime())
    .filter((timestamp) => !Number.isNaN(timestamp));

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.min(...timestamps));
}

function getAutoWeek(tasks: CycleSource[], goals: CycleSource[]): number {
  const cycleStart = getCycleStartDate([...tasks, ...goals]);
  if (!cycleStart) return 1;

  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const elapsed = Date.now() - cycleStart.getTime();
  return Math.min(13, Math.max(1, Math.ceil(elapsed / msPerWeek) + 1));
}

function getCycleProgress(week: number): number {
  return Math.min(100, Math.max(0, ((week - 1) / 12) * 100));
}

export function useCycleWeek(tasks: CycleSource[], goals: CycleSource[]): UseCycleWeekResult {
  const { userProfile } = useUser();
  const currentUserId = userProfile?.id ?? null;
  const [weekMarkers, setWeekMarkers] = useState<WeekMarker[]>([]);

  useEffect(() => {
    if (!currentUserId) {
      setWeekMarkers([]);
      return;
    }

    if (import.meta.env.VITE_REPLOFY_PLATFORM === 'standalone') {
      let disposed = false;
      void standaloneClient.listWeekMarkers().then((result) => {
        if (!disposed) setWeekMarkers(result.data);
      }).catch((error) => {
        if (!disposed) console.error('[useCycleWeek] Failed to load standalone week markers:', error);
      });
      return () => {
        disposed = true;
      };
    }

    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void import('../services/firebaseWeekMarkers').then(({ subscribeToFirebaseWeekMarkers }) => {
      if (disposed) return;
      unsubscribe = subscribeToFirebaseWeekMarkers({
        userId: currentUserId,
        companyId: userProfile?.companyId,
        onData: setWeekMarkers,
      });
    }).catch((error) => {
      if (!disposed) console.error('[useCycleWeek] Failed to initialize week markers:', error);
    });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [currentUserId, userProfile?.companyId]);

  const activeWeek = weekMarkers.find((weekMarker) => weekMarker.status === 'active') ?? null;
  const highestCompletedWeek = weekMarkers
    .filter((weekMarker) => weekMarker.status === 'completed')
    .reduce((maxWeek, weekMarker) => Math.max(maxWeek, weekMarker.weekNumber), 0);
  const rawWeek = activeWeek?.weekNumber ?? (highestCompletedWeek > 0 ? highestCompletedWeek : getAutoWeek(tasks, goals));

  return {
    week: Math.min(rawWeek, 12),
    rawWeek,
    progress: getCycleProgress(rawWeek),
    hasManualWeek: activeWeek !== null,
  };
}
