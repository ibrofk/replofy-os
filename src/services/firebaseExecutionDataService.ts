import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { CycleGoal, Task, Vision } from '../types';
import { syncGoalStatusWithTasks } from '../utils/syncGoalStatus';
import type { ExecutionActor } from './executionDataService';

export const firebaseExecutionDataService = {
  async createTask(input: Partial<Task>, actor: ExecutionActor) {
    const created = await addDoc(collection(db, 'tasks'), {
      ...input,
      createdAt: new Date().toISOString(),
      authorId: actor.userId,
      companyId: actor.workspaceId ?? null,
    });
    if (input.cycleGoalId) {
      await syncGoalStatusWithTasks(input.cycleGoalId, { id: created.id, ...input } as Task);
    }
    return { id: created.id };
  },

  async updateTask(id: string, input: Partial<Task>, previousGoalId?: string | null) {
    await updateDoc(doc(db, 'tasks', id), input);
    const nextGoalId = input.cycleGoalId;
    if (previousGoalId && previousGoalId !== nextGoalId) {
      await syncGoalStatusWithTasks(previousGoalId, { id, ...input } as Task);
    }
    if (nextGoalId) await syncGoalStatusWithTasks(nextGoalId, { id, ...input } as Task);
    return { id };
  },

  async deleteTask(id: string) {
    await deleteDoc(doc(db, 'tasks', id));
    return { id, deleted: true as const };
  },

  async createCycleGoal(input: Partial<CycleGoal>, actor: ExecutionActor) {
    const created = await addDoc(collection(db, 'cycleGoals'), {
      ...input,
      createdAt: new Date().toISOString(),
      authorId: actor.userId,
      companyId: actor.workspaceId ?? null,
    });
    return { id: created.id };
  },

  async updateCycleGoal(id: string, input: Partial<CycleGoal>) {
    await updateDoc(doc(db, 'cycleGoals', id), input);
    return { id };
  },

  async deleteCycleGoal(id: string) {
    await deleteDoc(doc(db, 'cycleGoals', id));
    return { id, deleted: true as const };
  },

  async createVision(input: Partial<Vision>, actor: ExecutionActor) {
    const created = await addDoc(collection(db, 'visions'), {
      ...input,
      createdAt: new Date().toISOString(),
      authorId: actor.userId,
      companyId: actor.workspaceId ?? null,
    });
    return { id: created.id };
  },

  async updateVision(id: string, input: Partial<Vision>) {
    await updateDoc(doc(db, 'visions', id), input);
    return { id };
  },

  async deleteVision(id: string) {
    await deleteDoc(doc(db, 'visions', id));
    return { id, deleted: true as const };
  },
};
