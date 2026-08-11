import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeAIActivation } from './settings.js';

test('AI activation requires a provider, a selected model, and a workspace credential', () => {
  assert.equal(computeAIActivation({
    defaultProvider: null,
    defaultModel: null,
    credentialId: null,
    fallbackEnabled: false,
  }).status, 'inactive_missing_model');

  assert.equal(computeAIActivation({
    defaultProvider: 'openai',
    defaultModel: null,
    credentialId: 'credential-1',
    fallbackEnabled: false,
  }).status, 'inactive_missing_model');

  assert.equal(computeAIActivation({
    defaultProvider: 'openai',
    defaultModel: 'gpt-5-mini',
    credentialId: null,
    fallbackEnabled: false,
  }).status, 'inactive_missing_provider_key');

  const active = computeAIActivation({
    defaultProvider: 'openai',
    defaultModel: 'gpt-5-mini',
    credentialId: 'credential-1',
    fallbackEnabled: false,
  });
  assert.equal(active.status, 'active');
  assert.equal(active.provider, 'openai');
  assert.equal(active.model, 'gpt-5-mini');
});
