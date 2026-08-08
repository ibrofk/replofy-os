export type WorkspaceEvent = {
  id: number;
  workspaceId: string;
  type: 'created' | 'updated' | 'deleted';
  resource: 'tasks' | 'cycle-goals' | 'visions';
  resourceId: string;
  occurredAt: string;
  data: unknown;
};

export type WorkspaceEventInput = Omit<WorkspaceEvent, 'id' | 'occurredAt'>;
export type WorkspaceEventListener = (event: WorkspaceEvent) => void;

export interface WorkspaceEventBus {
  publish(event: WorkspaceEventInput): WorkspaceEvent;
  subscribe(
    workspaceId: string,
    listener: WorkspaceEventListener,
    afterEventId?: number,
  ): () => void;
}

export class InMemoryWorkspaceEventBus implements WorkspaceEventBus {
  private nextEventId = 0;
  private readonly histories = new Map<string, WorkspaceEvent[]>();
  private readonly listeners = new Map<string, Set<WorkspaceEventListener>>();

  constructor(private readonly historyLimit = 100) {
    if (!Number.isInteger(historyLimit) || historyLimit < 1) {
      throw new Error('Event history limit must be a positive integer.');
    }
  }

  publish(input: WorkspaceEventInput) {
    const event: WorkspaceEvent = {
      ...input,
      id: ++this.nextEventId,
      occurredAt: new Date().toISOString(),
    };
    const history = this.histories.get(input.workspaceId) || [];
    history.push(event);
    if (history.length > this.historyLimit) history.splice(0, history.length - this.historyLimit);
    this.histories.set(input.workspaceId, history);

    for (const listener of this.listeners.get(input.workspaceId) || []) listener(event);
    return event;
  }

  subscribe(
    workspaceId: string,
    listener: WorkspaceEventListener,
    afterEventId = this.nextEventId,
  ) {
    const listeners = this.listeners.get(workspaceId) || new Set<WorkspaceEventListener>();
    listeners.add(listener);
    this.listeners.set(workspaceId, listeners);

    for (const event of this.histories.get(workspaceId) || []) {
      if (event.id > afterEventId) listener(event);
    }

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(workspaceId);
    };
  }
}
