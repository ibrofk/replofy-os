import assert from 'node:assert/strict';
import test from 'node:test';
import { enforceAIActionability, hasInsufficientEvidenceSignal } from './actionability.js';
import type { AIEngineOutput } from './types.js';

function output(overrides: Partial<AIEngineOutput> = {}): AIEngineOutput {
  return {
    answer: 'A supported answer.',
    summary: 'A supported summary.',
    actionability: 'actionable',
    assumptions: [],
    sourceReferences: [],
    actions: [{
      operation: 'draft',
      resourceType: 'planning_goal',
      payload: { title: 'A goal' },
      rationale: 'Supported by the source.',
      confidence: 'medium',
      sourceReferences: [],
      requiresApproval: true,
    }],
    memoryMutations: [{
      operation: 'create',
      scope: 'global',
      scopeId: null,
      memoryType: 'lesson',
      content: 'A supported durable lesson.',
      confidence: 'medium',
      reason: 'Supported by the source.',
      sourceReferences: [],
      mergeMemoryIds: [],
    }],
    ...overrides,
  };
}

test('explicit insufficient evidence is a hard stop for proposals and memory', () => {
  const guarded = enforceAIActionability(output({
    actionability: 'insufficient_evidence',
    answer: 'The source does not contain enough reliable information.',
  }));

  assert.equal(hasInsufficientEvidenceSignal(guarded), true);
  assert.deepEqual(guarded.actions, []);
  assert.deepEqual(guarded.memoryMutations, []);
});

test('contradictory provider prose is also treated as insufficient evidence', () => {
  const guarded = enforceAIActionability(output({
    answer: 'The source contains no meaningful facts, so a practical operating plan cannot be grounded.',
  }));

  assert.equal(guarded.actionability, 'insufficient_evidence');
  assert.deepEqual(guarded.actions, []);
  assert.deepEqual(guarded.memoryMutations, []);
});

test('supported output keeps its actions and memory mutations', () => {
  const supported = output();

  assert.equal(hasInsufficientEvidenceSignal(supported), false);
  assert.equal(enforceAIActionability(supported), supported);
});
