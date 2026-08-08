import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { after, before, test } from 'node:test';
import { S3AssetStore } from './s3-asset-store.js';
import { FilesystemAssetStore } from './filesystem-asset-store.js';
import { runAssetStoreContract } from './asset-store.contract.js';

const fixedDate = new Date('2026-08-01T12:34:56.000Z');
const filesystemDirectory = path.resolve('.tmp', `asset-contract-${randomUUID()}`);

async function readStream(stream: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

before(async () => {
  await mkdir(filesystemDirectory, { recursive: true });
});

after(async () => {
  await rm(filesystemDirectory, { recursive: true, force: true });
});

function createMockS3Store() {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  const fetcher = async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const key = url.pathname.split('/').slice(-2).join('/');
    const method = init?.method || 'GET';

    if (method === 'PUT') {
      assert.ok(init?.body && typeof init.body !== 'string');
      const body = await readStream(init.body as unknown as Readable);
      objects.set(key, {
        body,
        contentType: new Headers(init?.headers).get('content-type') || 'application/octet-stream',
      });
      return new Response(null, { status: 200 });
    }

    if (method === 'GET') {
      const object = objects.get(key);
      if (!object) return new Response(null, { status: 404 });
      return new Response(object.body, {
        status: 200,
        headers: {
          'content-type': object.contentType,
          'content-length': String(object.body.length),
        },
      });
    }

    if (method === 'HEAD') {
      return new Response(null, { status: objects.has(key) ? 200 : 404 });
    }

    if (method === 'DELETE') {
      const existed = objects.delete(key);
      return new Response(null, { status: existed ? 204 : 404 });
    }

    return new Response(null, { status: 405 });
  };

  return new S3AssetStore({
    endpoint: 'https://objects.example.test',
    bucket: 'replofy-assets',
    accessKeyId: 'access-key',
    secretAccessKey: 'secret-key',
    fetch: fetcher,
    now: () => fixedDate,
  });
}

test('filesystem and S3 adapters satisfy the shared AssetStore contract', async () => {
  const filesystem = new FilesystemAssetStore(filesystemDirectory);
  const s3 = createMockS3Store();

  await runAssetStoreContract(filesystem);
  await runAssetStoreContract(s3);
});
