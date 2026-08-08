import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createS3Client, s3OptionsFromEnvironment } from './s3-client.mjs';

const fixedDate = new Date('2026-08-01T12:34:56.000Z');

async function readStream(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test('S3 CLI client lists and transfers objects with signed requests', async () => {
  const calls = [];
  const fetcher = async (input, init = {}) => {
    const url = new URL(input);
    calls.push({ url, init });
    if (init.method === 'GET' && url.searchParams.has('list-type')) {
      return new Response(
        '<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>workspace-one/asset.txt</Key><Size>7</Size></Contents></ListBucketResult>',
        { status: 200 },
      );
    }
    if (init.method === 'GET') return new Response('payload', { status: 200, headers: { 'content-length': '7', 'content-type': 'text/plain' } });
    if (init.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-length': '7', 'content-type': 'text/plain' } });
    if (init.method === 'PUT' && init.body) await readStream(init.body);
    return new Response(null, { status: init.method === 'DELETE' ? 204 : 200 });
  };
  const client = createS3Client({
    endpoint: 'https://objects.example.test',
    bucket: 'replofy-assets',
    accessKeyId: 'access-key',
    secretAccessKey: 'secret-key',
    fetch: fetcher,
    now: () => fixedDate,
  });

  assert.deepEqual(await client.listObjects(), [{ key: 'workspace-one/asset.txt', size: 7 }]);
  const metadata = await client.headObject('workspace-one/asset.txt');
  assert.deepEqual(metadata, { size: 7, contentType: 'text/plain' });
  const object = await client.getObject('workspace-one/asset.txt');
  assert.ok(object);
  assert.deepEqual(await readStream(object.body), Buffer.from('payload'));
  await client.putObject('workspace-one/asset.txt', Readable.from('payload'), 'text/plain', 7);
  assert.equal(await client.deleteObject('workspace-one/asset.txt'), true);
  assert.equal(calls[0].url.searchParams.get('list-type'), '2');
  assert.match(calls[0].init.headers.Authorization, /^AWS4-HMAC-SHA256 Credential=access-key\//);
});

test('S3 CLI client validates required environment configuration', () => {
  assert.throws(
    () => s3OptionsFromEnvironment({}),
    /REPLOFY_S3_ENDPOINT, REPLOFY_S3_BUCKET, REPLOFY_S3_ACCESS_KEY_ID, REPLOFY_S3_SECRET_ACCESS_KEY required/,
  );
  assert.deepEqual(
    s3OptionsFromEnvironment({
      REPLOFY_S3_ENDPOINT: 'http://minio:9000',
      REPLOFY_S3_BUCKET: 'replofy-assets',
      REPLOFY_S3_ACCESS_KEY_ID: 'access-key',
      REPLOFY_S3_SECRET_ACCESS_KEY: 'secret-key',
      REPLOFY_S3_FORCE_PATH_STYLE: 'false',
    }),
    {
      endpoint: 'http://minio:9000',
      bucket: 'replofy-assets',
      accessKeyId: 'access-key',
      secretAccessKey: 'secret-key',
      region: 'us-east-1',
      forcePathStyle: false,
    },
  );
});
