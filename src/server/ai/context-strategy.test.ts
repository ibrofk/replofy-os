import { strict as assert } from 'node:assert';
import test from 'node:test';
import { getAIContextStrategy } from './context-strategy.js';

test('defaults missing context recipe to balanced workspace retrieval', () => {
  const strategy = getAIContextStrategy({ metadata: {} });
  assert.equal(strategy.mode, 'workspace');
  assert.equal(strategy.memoryLimit, 16);
});

test('keeps focused retrieval bounded and deep retrieval wider', () => {
  const focused = getAIContextStrategy({ metadata: { contextMode: 'focused' } });
  const deep = getAIContextStrategy({ metadata: { contextMode: 'deep' } });
  assert.equal(focused.projectionLimit, 8);
  assert.equal(deep.projectionLimit, 40);
  assert.ok(deep.sourceChars > focused.sourceChars);
});

test('ignores untrusted context recipe values', () => {
  const strategy = getAIContextStrategy({ metadata: { contextMode: 'admin-all-data' } });
  assert.equal(strategy.mode, 'workspace');
});
