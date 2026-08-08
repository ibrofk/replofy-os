import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Task, CycleGoal } from '../types';
import { handleFirestoreError, OperationType } from './firestoreErrorHandler';

/**
 * Checks and auto-updates a cycle goal's status based on its linked tasks.
 * - If ALL linked tasks are 'done' → goal becomes 'completed'
 * - If a task is linked to a 'completed' goal → goal becomes 'active'
 */
export async function syncGoalStatusWithTasks(goalId: string, updatedTask: Task): Promise<void> {
  try {
    const goalRef = doc(db, 'cycleGoals', goalId);
    const goalSnap = await getDocs(query(collection(db, 'cycleGoals'), where('__name__', '==', goalId)));

    if (goalSnap.empty) return;

    const goal = goalSnap.docs[0].data() as CycleGoal & { id: string };

    // If a task was just linked to a completed goal, reactivate the goal
    if (goal.status === 'completed' && updatedTask.status !== 'done') {
      await updateDoc(goalRef, { status: 'active' });
      return;
    }

    // Check all tasks linked to this goal
    const tasksSnap = await getDocs(query(collection(db, 'tasks'), where('cycleGoalId', '==', goalId)));
    const linkedTasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() } as Task));

    if (linkedTasks.length === 0) return;

    const allDone = linkedTasks.every(t => t.status === 'done');
    const anyNotDone = linkedTasks.some(t => t.status !== 'done');

    if (allDone && goal.status !== 'completed') {
      await updateDoc(goalRef, { status: 'completed' });
    } else if (anyNotDone && goal.status === 'completed') {
      await updateDoc(goalRef, { status: 'active' });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `cycleGoals/${goalId}/sync`);
  }
}

/**
 * Determines which goal(s) need syncing when a task's cycleGoalId changes.
 * Returns the old goal ID (if unlinked) and new goal ID (if linked).
 */
export function getGoalsToSync(oldGoalId: string | undefined | null, newGoalId: string | undefined | null): { unlinkedGoalId?: string; linkedGoalId?: string } {
  return {
    unlinkedGoalId: oldGoalId || undefined,
    linkedGoalId: newGoalId || undefined,
  };
}
