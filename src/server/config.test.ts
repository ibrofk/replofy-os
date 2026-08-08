import assert from 'node:assert/strict';
import test from 'node:test';
import { loadServerConfig } from './config.js';

const required = {
  DATABASE_URL: 'postgres://replofy:password@127.0.0.1:5432/replofy',
  BETTER_AUTH_SECRET: 'auth-secret-at-least-thirty-two-characters',
  REPLOFY_BOOTSTRAP_TOKEN: 'bootstrap-token-at-least-thirty-two-characters',
};

test('secure cookies follow the public URL unless explicitly overridden', () => {
  assert.equal(loadServerConfig({
    ...required,
    REPLOFY_SERVER_URL: 'http://localhost:4100',
  }).secureCookies, false);
  assert.equal(loadServerConfig({
    ...required,
    REPLOFY_SERVER_URL: 'https://replofy.example.com',
  }).secureCookies, true);
  assert.equal(loadServerConfig({
    ...required,
    REPLOFY_SERVER_URL: 'https://replofy.example.com',
    REPLOFY_SECURE_COOKIES: 'false',
  }).secureCookies, false);
});

test('asset storage defaults to filesystem and validates S3 configuration', () => {
  assert.equal(loadServerConfig(required).assetStore, 'filesystem');
  assert.throws(
    () => loadServerConfig({ ...required, REPLOFY_ASSET_STORE: 's3' }),
    /REPLOFY_S3_ENDPOINT, REPLOFY_S3_BUCKET, REPLOFY_S3_ACCESS_KEY_ID, REPLOFY_S3_SECRET_ACCESS_KEY required/,
  );
  const config = loadServerConfig({
    ...required,
    REPLOFY_ASSET_STORE: 's3',
    REPLOFY_S3_ENDPOINT: 'http://minio:9000',
    REPLOFY_S3_BUCKET: 'replofy-assets',
    REPLOFY_S3_ACCESS_KEY_ID: 'access-key',
    REPLOFY_S3_SECRET_ACCESS_KEY: 'secret-key',
    REPLOFY_S3_FORCE_PATH_STYLE: 'false',
    REPLOFY_S3_CREATE_BUCKET: 'true',
  });
  assert.deepEqual(config.s3, {
    endpoint: 'http://minio:9000',
    bucket: 'replofy-assets',
    accessKeyId: 'access-key',
    secretAccessKey: 'secret-key',
    region: 'us-east-1',
    forcePathStyle: false,
    createBucket: true,
  });
});
