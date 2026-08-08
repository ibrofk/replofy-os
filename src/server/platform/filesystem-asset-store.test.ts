import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { after, before, test } from 'node:test';
import { FilesystemAssetStore } from './filesystem-asset-store.js';

const testDirectory = path.resolve('.tmp', `asset-store-${randomUUID()}`);
const store = new FilesystemAssetStore(testDirectory);

before(async () => {
  await mkdir(testDirectory, { recursive: true });
});

after(async () => {
  await rm(testDirectory, { force: true, recursive: true });
});

async function readStream(stream: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test('filesystem assets persist with workspace isolation and metadata', async () => {
  const payload = Buffer.from('private workspace asset');
  const result = await store.put({
    workspaceId: 'workspace-one',
    objectKey: 'asset-one.txt',
    contentType: 'text/plain',
    size: payload.length,
    body: Readable.from(payload),
  });

  assert.equal(result.size, payload.length);

  const stored = await store.get('workspace-one', 'asset-one.txt');
  assert.ok(stored);
  assert.equal(stored.contentType, 'text/plain');
  assert.equal(stored.size, payload.length);
  assert.deepEqual(await readStream(stored.stream), payload);

  assert.equal(await store.get('workspace-two', 'asset-one.txt'), null);
  assert.equal(await store.delete('workspace-one', 'asset-one.txt'), true);
  assert.equal(await store.delete('workspace-one', 'asset-one.txt'), false);
});

test('filesystem assets reject path traversal', async () => {
  await assert.rejects(
    store.put({
      workspaceId: '..',
      objectKey: 'escape.txt',
      contentType: 'text/plain',
      size: 7,
      body: Readable.from('blocked'),
    }),
    /unsupported path characters/,
  );

  await assert.rejects(
    store.put({
      workspaceId: 'workspace-one',
      objectKey: '../escape.txt',
      contentType: 'text/plain',
      size: 7,
      body: Readable.from('blocked'),
    }),
    /unsupported path characters/,
  );
});
