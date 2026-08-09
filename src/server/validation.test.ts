import test from 'node:test';
import assert from 'node:assert/strict';
import { pickProvided } from './validation.js';

test('pickProvided preserves only fields explicitly present in a patch', () => {
  const parsed = {
    title: 'updated title',
    status: 'active',
    effortPoints: 1,
  } as const;

  assert.deepEqual(
    pickProvided({ title: 'updated title' }, parsed),
    { title: 'updated title' },
  );
  assert.deepEqual(
    pickProvided({ status: undefined }, parsed),
    { status: 'active' },
  );
});

test('pickProvided ignores unknown fields from a request body', () => {
  const parsed = { title: 'title' } as const;

  assert.deepEqual(
    pickProvided({ title: 'title', unexpected: 'ignored' }, parsed),
    { title: 'title' },
  );
});
