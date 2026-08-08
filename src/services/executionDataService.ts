import type { CycleGoal, Task, Vision } from '../types';
import { standaloneClient } from './standaloneClient';

export type ExecutionActor = {
  userId: string;
  workspaceId?: string;
};

async function firebaseService() {
  return (await import('./firebaseExecutionDataService')).firebaseExecutionDataService;
}

export const executionDataService = {
  async createTask(input: Partial<Task>, actor: ExecutionActor) {
    if (import.meta.env.VITE_REPLOFY_PLATFORM === 'standalone') return standaloneClient.createTask(input);
    return (await firebaseService()).createTask(input, actor);
  },

  async updateTask(id: string, input: Partial<Task>, previousGoalId?: string | null) {
    if (import.meta.env.VITE_REPLOFY_PLATFORM === 'standalone') return standaloneClient.updateTask(id, input);
    return (await firebaseService()).updateTask(id, input, previousGoalId);
  },

  async deleteTask(id: string) {
    if (import.meta.env.VITE_REPLOFY_PLATFORM === 'standalone') return standaloneClient.deleteTask(id);
    return (await firebaseService()).deleteTask(id);
  },

  async createCycleGoal(input: Partial<CycleGoal>, actor: ExecutionActor) {
    if (import.meta.env.VITE_REPLOFY_PLATFORM === 'standalone') return standaloneClient.createCycleGoal(input);
    return (await firebaseService()).createCycleGoal(input, actor);
  },

  async updateCycleGoal(id: string, input: Partial<CycleGoal>) {
    if (import.meta.env.VITE_REPLOFY_PLATFORM === 'standalone') return standaloneClient.updateCycleGoal(id, input);
    return (await firebaseService()).updateCycleGoal(id, input);
  },

  async deleteCycleGoal(id: string) {
    if (import.meta.env.VITE_REPLOFY_PLATFORM === 'standalone') return standaloneClient.deleteCycleGoal(id);
    return (await firebaseService()).deleteCycleGoal(id);
  },

  async createVision(input: Partial<Vision>, actor: ExecutionActor) {
    if (import.meta.env.VITE_REPLOFY_PLATFORM === 'standalone') return standaloneClient.createVision(input);
    return (await firebaseService()).createVision(input, actor);
  },

  async updateVision(id: string, input: Partial<Vision>) {
    if (import.meta.env.VITE_REPLOFY_PLATFORM === 'standalone') return standaloneClient.updateVision(id, input);
    return (await firebaseService()).updateVision(id, input);
  },

  async deleteVision(id: string) {
    if (import.meta.env.VITE_REPLOFY_PLATFORM === 'standalone') return standaloneClient.deleteVision(id);
    return (await firebaseService()).deleteVision(id);
  },
};
