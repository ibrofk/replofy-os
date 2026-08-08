import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { S3AssetStore } from './s3-asset-store.js';

const fixedDate = new Date('2026-08-01T12:34:56.000Z');

async function readStream(stream: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test('S3 asset store signs path-style upload, download, and delete requests', async () => {
  const calls: Array<{ url: string; method: string; headers: Headers }> = [];
  const fetcher = async (input: string | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(input), method: init?.method || 'GET', headers });
    if (init?.method === 'PUT' && init.body && typeof init.body !== 'string') {
      await readStream(init.body as unknown as Readable);
    }
    if (init?.method === 'GET') {
      return new Response('s3 payload', {
        status: 200,
        headers: { 'content-type': 'text/plain', 'content-length': '10' },
      });
    }
    return new Response(null, { status: init?.method === 'DELETE' ? 204 : 200 });
  };
  const store = new S3AssetStore({
    endpoint: 'https://objects.example.test',
    bucket: 'replofy-assets',
    accessKeyId: 'access-key',
    secretAccessKey: 'secret-key',
    region: 'us-east-1',
    fetch: fetcher,
    now: () => fixedDate,
  });

  const payload = Buffer.from('s3 payload');
  assert.deepEqual(
    await store.put({
      workspaceId: 'workspace-one',
      objectKey: 'asset-one.txt',
      contentType: 'text/plain',
      size: payload.length,
      body: Readable.from(payload),
    }),
    { size: payload.length },
  );
  const stored = await store.get('workspace-one', 'asset-one.txt');
  assert.ok(stored);
  assert.equal(stored.contentType, 'text/plain');
  assert.equal(stored.size, payload.length);
  assert.deepEqual(await readStream(stored.stream), payload);
  assert.equal(await store.delete('workspace-one', 'asset-one.txt'), true);

  assert.equal(calls[0]?.url, 'https://objects.example.test/replofy-assets/workspace-one/asset-one.txt');
  assert.equal(calls[1]?.method, 'GET');
  assert.equal(calls[2]?.method, 'DELETE');
  assert.equal(calls[0]?.headers.get('x-amz-date'), '20260801T123456Z');
  assert.equal(calls[0]?.headers.get('x-amz-content-sha256'), 'UNSIGNED-PAYLOAD');
  assert.equal(calls[0]?.headers.get('content-length'), String(payload.length));
  assert.match(calls[0]?.headers.get('authorization') || '', /^AWS4-HMAC-SHA256 Credential=access-key\//);
  assert.doesNotMatch(calls[0]?.headers.get('authorization') || '', /secret-key/);
});

test('S3 asset store can create a missing bucket once when explicitly enabled', async () => {
  const methods: string[] = [];
  const fetcher = async (_input: string | URL, init?: RequestInit) => {
    methods.push(init?.method || 'GET');
    if (init?.method === 'PUT' && init.body && typeof init.body !== 'string') {
      await readStream(init.body as unknown as Readable);
    }
    if (init?.method === 'HEAD') return new Response(null, { status: 404 });
    return new Response(null, { status: init?.method === 'DELETE' ? 204 : 200 });
  };
  const store = new S3AssetStore({
    endpoint: 'http://minio.test:9000',
    bucket: 'replofy-assets',
    accessKeyId: 'access-key',
    secretAccessKey: 'secret-key',
    createBucket: true,
    fetch: fetcher,
    now: () => fixedDate,
  });

  await store.put({
    workspaceId: 'workspace-one',
    objectKey: 'asset-one.txt',
    contentType: 'text/plain',
    size: 7,
    body: Readable.from('payload'),
  });
  await store.put({
    workspaceId: 'workspace-one',
    objectKey: 'asset-two.txt',
    contentType: 'text/plain',
    size: 7,
    body: Readable.from('payload'),
  });
  assert.deepEqual(methods, ['HEAD', 'PUT', 'PUT', 'PUT']);
});

test('S3 asset store rejects path traversal before making a request', async () => {
  let requests = 0;
  const store = new S3AssetStore({
    endpoint: 'https://objects.example.test',
    bucket: 'replofy-assets',
    accessKeyId: 'access-key',
    secretAccessKey: 'secret-key',
    fetch: async () => {
      requests += 1;
      return new Response(null, { status: 500 });
    },
  });

  await assert.rejects(store.get('..', 'asset.txt'), /unsupported path characters/);
  await assert.rejects(store.delete('workspace-one', '../asset.txt'), /unsupported path characters/);
  assert.equal(requests, 0);
});
