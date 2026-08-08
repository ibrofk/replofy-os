import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { S3AssetStore } from './s3-asset-store.js';

async function readStream(stream: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the MinIO S3AssetStore integration test.`);
  return value;
}

test('S3AssetStore persists and isolates objects against the configured MinIO endpoint', async () => {
  const store = new S3AssetStore({
    endpoint: requiredEnvironment('REPLOFY_S3_ENDPOINT'),
    bucket: requiredEnvironment('REPLOFY_S3_BUCKET'),
    accessKeyId: requiredEnvironment('REPLOFY_S3_ACCESS_KEY_ID'),
    secretAccessKey: requiredEnvironment('REPLOFY_S3_SECRET_ACCESS_KEY'),
    region: process.env.REPLOFY_S3_REGION || 'us-east-1',
    forcePathStyle: process.env.REPLOFY_S3_FORCE_PATH_STYLE !== 'false',
    createBucket: true,
  });
  const runId = randomUUID();
  const workspaceId = `s3-asset-test-${runId}`;
  const objectKey = `direct-${runId}.txt`;
  const payload = Buffer.from('direct S3AssetStore MinIO proof');

  try {
    assert.deepEqual(
      await store.put({
        workspaceId,
        objectKey,
        contentType: 'text/plain',
        size: payload.length,
        body: Readable.from(payload),
      }),
      { size: payload.length },
    );

    const stored = await store.get(workspaceId, objectKey);
    assert.ok(stored);
    assert.equal(stored.workspaceId, workspaceId);
    assert.equal(stored.objectKey, objectKey);
    assert.equal(stored.contentType, 'text/plain');
    assert.equal(stored.size, payload.length);
    assert.deepEqual(await readStream(stored.stream), payload);

    assert.equal(await store.get(`other-${runId}`, objectKey), null);
    assert.equal(await store.delete(workspaceId, objectKey), true);
    assert.equal(await store.delete(workspaceId, objectKey), false);
  } finally {
    await store.delete(workspaceId, objectKey).catch(() => false);
  }
});
