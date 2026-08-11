import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertStandaloneScopeForSession,
  StandaloneApiKeyError,
} from './api-keys.js';

const member = { userId: 'member', workspaceId: 'workspace', role: 'member' as const };
const admin = { userId: 'admin', workspaceId: 'workspace', role: 'admin' as const };

test('browser sessions require an admin role for AI approval and administration scopes', () => {
  assert.throws(
    () => assertStandaloneScopeForSession(member, 'ai:approve'),
    (error: unknown) => error instanceof StandaloneApiKeyError && error.statusCode === 403,
  );
  assert.throws(
    () => assertStandaloneScopeForSession(member, 'ai:admin'),
    (error: unknown) => error instanceof StandaloneApiKeyError && error.statusCode === 403,
  );
  assert.doesNotThrow(() => assertStandaloneScopeForSession(admin, 'ai:approve'));
  assert.doesNotThrow(() => assertStandaloneScopeForSession(member, 'ai:write'));
});
