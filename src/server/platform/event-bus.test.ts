import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryWorkspaceEventBus, type WorkspaceEvent } from './event-bus.js';

test('event bus isolates workspaces and replays only events after the cursor', () => {
  const bus = new InMemoryWorkspaceEventBus(3);
  const workspaceAEvents: WorkspaceEvent[] = [];
  const workspaceBEvents: WorkspaceEvent[] = [];
  const stopA = bus.subscribe('workspace-a', (event) => workspaceAEvents.push(event));
  const stopB = bus.subscribe('workspace-b', (event) => workspaceBEvents.push(event));

  const first = bus.publish({
    workspaceId: 'workspace-a',
    type: 'created',
    resource: 'tasks',
    resourceId: 'task-1',
    data: { title: 'First' },
  });
  bus.publish({
    workspaceId: 'workspace-b',
    type: 'created',
    resource: 'visions',
    resourceId: 'vision-1',
    data: { title: 'Other workspace' },
  });
  const second = bus.publish({
    workspaceId: 'workspace-a',
    type: 'updated',
    resource: 'tasks',
    resourceId: 'task-1',
    data: { title: 'Second' },
  });

  assert.deepEqual(workspaceAEvents.map((event) => event.id), [first.id, second.id]);
  assert.equal(workspaceBEvents.length, 1);
  stopA();
  stopB();

  const replayed: WorkspaceEvent[] = [];
  bus.subscribe('workspace-a', (event) => replayed.push(event), first.id)();
  assert.deepEqual(replayed.map((event) => event.id), [second.id]);
});

test('event history is bounded', () => {
  const bus = new InMemoryWorkspaceEventBus(2);
  for (let index = 0; index < 3; index += 1) {
    bus.publish({
      workspaceId: 'workspace',
      type: 'created',
      resource: 'tasks',
      resourceId: `task-${index}`,
      data: null,
    });
  }

  const replayed: WorkspaceEvent[] = [];
  bus.subscribe('workspace', (event) => replayed.push(event), 0)();
  assert.deepEqual(replayed.map((event) => event.resourceId), ['task-1', 'task-2']);
});
