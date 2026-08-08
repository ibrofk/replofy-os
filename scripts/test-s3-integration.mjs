import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createS3Client, s3OptionsFromEnvironment } from './lib/s3-client.mjs';

async function readStream(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test('S3-compatible endpoint persists and isolates an asset object', async () => {
  const client = createS3Client(s3OptionsFromEnvironment());
  await client.ensureBucket();
  const prefix = `replofy-ci-${randomUUID()}`;
  const key = `${prefix}/asset.txt`;
  const payload = Buffer.from('replofy s3 integration proof');
  try {
    await client.putObject(key, Readable.from(payload), 'text/plain');
    assert.deepEqual(await client.headObject(key), { size: payload.length, contentType: 'text/plain' });
    const stored = await client.getObject(key);
    assert.ok(stored);
    assert.deepEqual(await readStream(stored.body), payload);
    assert.deepEqual(await client.listObjects(`${prefix}/`), [{ key, size: payload.length }]);
  } finally {
    await client.deleteObject(key);
  }
  assert.deepEqual(await client.listObjects(`${prefix}/`), []);
});
