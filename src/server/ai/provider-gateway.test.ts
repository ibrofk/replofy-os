import assert from 'node:assert/strict';
import test from 'node:test';
import { isRecommendedModel } from './provider-gateway.js';

test('provider recommendations only mark the configured preferred model', () => {
  assert.equal(isRecommendedModel('openai', 'gpt-5.6-luna'), true);
  assert.equal(isRecommendedModel('openai', 'gpt-5'), false);
  assert.equal(isRecommendedModel('openai', 'gpt-5-chat-latest'), false);

  assert.equal(isRecommendedModel('gemini', 'gemini-3.6-flash-lite'), true);
  assert.equal(isRecommendedModel('gemini', 'gemini-2.5-flash-lite'), false);

  assert.equal(isRecommendedModel('anthropic', 'claude-haiku-latest'), true);
  assert.equal(isRecommendedModel('anthropic', 'claude-sonnet-latest'), false);
});
