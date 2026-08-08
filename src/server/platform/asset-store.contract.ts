import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import type { AssetStore } from './asset-store.js';

async function readStream(stream: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/**
 * Shared behavior required from every configured AssetStore adapter.
 * Keeping this fixture provider-agnostic makes new object backends prove the
 * same workspace boundary, metadata, and deletion semantics as the default.
 */
export async function runAssetStoreContract(store: AssetStore, label = store.provider) {
  const workspaceId = `contract-${label}`;
  const objectKey = 'asset-one.txt';
  const payload = Buffer.from(`private ${label} workspace asset`);

  const result = await store.put({
    workspaceId,
    objectKey,
    contentType: 'text/plain',
    size: payload.length,
    body: Readable.from(payload),
  });
  assert.equal(result.size, payload.length);

  const stored = await store.get(workspaceId, objectKey);
  assert.ok(stored);
  assert.equal(stored.workspaceId, workspaceId);
  assert.equal(stored.objectKey, objectKey);
  assert.equal(stored.contentType, 'text/plain');
  assert.equal(stored.size, payload.length);
  assert.deepEqual(await readStream(stored.stream), payload);

  assert.equal(await store.get('other-workspace', objectKey), null);
  assert.equal(await store.delete(workspaceId, objectKey), true);
  assert.equal(await store.delete(workspaceId, objectKey), false);

  await assert.rejects(
    store.get('..', objectKey),
    /unsupported path characters/,
  );
  await assert.rejects(
    store.delete(workspaceId, '../escape.txt'),
    /unsupported path characters/,
  );
}
