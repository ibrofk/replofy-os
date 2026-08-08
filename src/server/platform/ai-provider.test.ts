import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractContextPayload } from '../context.js';
import type { AIProvider } from './ai-provider.js';
import { GeminiAIProvider } from './gemini-ai-provider.js';

const rateLimit = {
  requestsPerMinute: { used: 0, limit: 15, resetAt: new Date(0).toISOString() },
  tokensPerMinute: { used: 0, limit: 250_000, resetAt: new Date(0).toISOString() },
  requestsPerDay: { used: 0, limit: 500, resetAt: new Date(0).toISOString() },
};

test('context extraction can use an injected AI provider without a cloud call', async () => {
  const calls: Array<{ fileName: string; content: string }> = [];
  const provider: AIProvider = {
    async extractContext(input) {
      calls.push(input);
      return {
        payload: {
          source: {
            title: 'Stub source',
            aliases: ['stub'],
            summary: 'Local provider result',
          },
          items: [],
        },
        usedGemini: false,
        model: 'stub-local',
        rateLimit,
      };
    },
  };

  const result = await extractContextPayload({
    fileName: 'notes.md',
    content: '# Local notes',
  }, provider);

  assert.deepEqual(calls, [{ fileName: 'notes.md', content: '# Local notes' }]);
  assert.equal(result.usedGemini, false);
  assert.equal(result.model, 'stub-local');
  assert.equal(result.payload.source.title, 'Stub source');
  assert.equal(result.contentHash.length, 64);
});

test('the default Gemini adapter falls back locally when no key is configured', async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const result = await new GeminiAIProvider().extractContext({
      fileName: 'local.md',
      content: '- Verify the local setup\n',
    });
    assert.equal(result.usedGemini, false);
    assert.match(result.warning || '', /Using local parsing/);
    assert.equal(result.payload.items[0]?.kind, 'task');
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});
