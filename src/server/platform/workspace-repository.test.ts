import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PostgresDatabase } from '../db/client.js';
import { DrizzleWorkspaceRepository } from './workspace-repository.js';

test('DrizzleWorkspaceRepository delegates the database capability surface', () => {
  const calls: string[] = [];
  const database = {
    select() {
      calls.push('select');
      return 'select-result';
    },
    insert() {
      calls.push('insert');
      return 'insert-result';
    },
    update() {
      calls.push('update');
      return 'update-result';
    },
    delete() {
      calls.push('delete');
      return 'delete-result';
    },
    transaction() {
      calls.push('transaction');
      return 'transaction-result';
    },
    execute() {
      calls.push('execute');
      return 'execute-result';
    },
  } as unknown as PostgresDatabase;

  const repository = new DrizzleWorkspaceRepository(database);
  assert.equal((repository.select as unknown as () => unknown)(), 'select-result');
  assert.equal((repository.insert as unknown as () => unknown)(), 'insert-result');
  assert.equal((repository.update as unknown as () => unknown)(), 'update-result');
  assert.equal((repository.delete as unknown as () => unknown)(), 'delete-result');
  assert.equal((repository.transaction as unknown as () => unknown)(), 'transaction-result');
  assert.equal((repository.execute as unknown as () => unknown)(), 'execute-result');
  assert.deepEqual(calls, ['select', 'insert', 'update', 'delete', 'transaction', 'execute']);
});
