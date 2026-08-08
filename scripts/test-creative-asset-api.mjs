import { createHash } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID || 'demo-replofy-os';
const databaseId = process.env.FIREBASE_DATABASE_ID || '(default)';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8081';
const apiBase = process.env.CREATIVE_HUB_TEST_API_BASE || 'http://localhost:4010';
const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;
const runId = Date.now().toString(36);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readResponse(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function expectStatus(response, expectedStatus, label) {
  const body = await readResponse(response);
  assert(
    response.status === expectedStatus,
    `${label} expected ${expectedStatus}, received ${response.status}: ${JSON.stringify(body)}`,
  );
  return body;
}

function toFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  return { stringValue: String(value) };
}

function toFirestoreDocument(value) {
  return {
    fields: Object.fromEntries(Object.entries(value).map(([key, fieldValue]) => [key, toFirestoreValue(fieldValue)])),
  };
}

function signCloudinaryUploadResponse(publicId, version) {
  return createHash('sha1').update(`public_id=${publicId}&version=${version}${cloudinaryApiSecret}`).digest('hex');
}

await expectStatus(
  await fetch(`${apiBase}/api/internal/creative-assets/missing/download`),
  401,
  'Unauthorized download',
);
await expectStatus(
  await fetch(`${apiBase}/api/internal/creative-assets/uploads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }),
  401,
  'Unauthorized upload init',
);
await expectStatus(
  await fetch(`${apiBase}/api/internal/creative-assets/missing/complete`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }),
  401,
  'Unauthorized upload complete',
);
await expectStatus(
  await fetch(`${apiBase}/api/internal/creative-assets/missing/archive`, {
    method: 'PATCH',
  }),
  401,
  'Unauthorized archive',
);

const email = `creative-api-${runId}@example.com`;
const signUp = await expectStatus(
  await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=creative-hub-api-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'creative-hub-api-test',
      returnSecureToken: true,
    }),
  }),
  200,
  'Auth emulator sign-up',
);

const authHeaders = {
  Authorization: `Bearer ${signUp.idToken}`,
  'Content-Type': 'application/json',
};

await expectStatus(
  await fetch(`http://${firestoreHost}/v1/projects/${projectId}/databases/${databaseId}/documents/users/${signUp.localId}`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify(
      toFirestoreDocument({
        email,
        displayName: 'Creative Asset API Test',
        role: 'master-admin',
        onboardingCompleted: true,
        createdAt: new Date().toISOString(),
      }),
    ),
  }),
  200,
  'Create API test profile',
);

await expectStatus(
  await fetch(`${apiBase}/api/internal/creative-assets/uploads`, {
    method: 'POST',
    headers: authHeaders,
    body: '{}',
  }),
  400,
  'Authenticated upload validation',
);

await expectStatus(
  await fetch(`${apiBase}/api/internal/creative-assets/missing/download`, {
    headers: authHeaders,
  }),
  404,
  'Authenticated missing asset',
);

process.env.FIRESTORE_EMULATOR_HOST = firestoreHost;
const adminApp = initializeApp({ projectId }, `creative-asset-api-test-${runId}`);
const adminDb = getFirestore(adminApp, databaseId);
const archiveAssetId = `archive-${runId}`;
const now = new Date().toISOString();
let uploadedAssetId = null;

if (cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret) {
  const uploadInit = await expectStatus(
    await fetch(`${apiBase}/api/internal/creative-assets/uploads`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        fileName: 'cloudinary-route-test.png',
        mimeType: 'image/png',
        fileSize: 42,
        title: 'Cloudinary route test',
      }),
    }),
    201,
    'Authenticated Cloudinary upload init',
  );
  uploadedAssetId = uploadInit.asset.id;
  assert(uploadInit.asset.provider === 'cloudinary', 'Upload init should persist Cloudinary as the asset provider.');
  assert(uploadInit.upload.method === 'POST', 'Cloudinary uploads should use POST.');
  assert(
    uploadInit.upload.url === `https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/image/upload`,
    'Cloudinary upload URL should target the configured product environment.',
  );
  assert(uploadInit.upload.fields.api_key === cloudinaryApiKey, 'Upload init should return the configured public API key.');
  assert(uploadInit.upload.fields.type === 'authenticated', 'Cloudinary upload should use authenticated delivery.');

  const version = 1719307544;
  await expectStatus(
    await fetch(`${apiBase}/api/internal/creative-assets/${uploadedAssetId}/complete`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        upload: {
          asset_id: `cloudinary-${runId}`,
          public_id: uploadInit.asset.storagePath,
          resource_type: 'image',
          type: 'authenticated',
          version,
          format: 'png',
          bytes: 42,
          signature: signCloudinaryUploadResponse(uploadInit.asset.storagePath, version),
        },
      }),
    }),
    200,
    'Authenticated Cloudinary upload complete',
  );

  const download = await expectStatus(
    await fetch(`${apiBase}/api/internal/creative-assets/${uploadedAssetId}/download`, {
      headers: authHeaders,
    }),
    200,
    'Authenticated Cloudinary download',
  );
  assert(download.url.includes('/image/authenticated/'), 'Download should return a signed authenticated Cloudinary URL.');
}

await adminDb.collection('creativeAssets').doc(archiveAssetId).set({
  id: archiveAssetId,
  creativeId: null,
  title: 'Archive route test',
  fileName: 'archive-route-test.png',
  mimeType: 'image/png',
  fileSize: 42,
  assetType: 'image',
  storagePath: `creative-assets/users/${signUp.localId}/${archiveAssetId}/archive-route-test.png`,
  status: 'active',
  uploadedAt: now,
  createdAt: now,
  updatedAt: now,
  authorId: signUp.localId,
  companyId: null,
});

await expectStatus(
  await fetch(`${apiBase}/api/internal/creative-assets/${archiveAssetId}/archive`, {
    method: 'PATCH',
    headers: authHeaders,
  }),
  200,
  'Authenticated archive',
);

const archivedAsset = await adminDb.collection('creativeAssets').doc(archiveAssetId).get();
assert(archivedAsset.get('status') === 'archived', 'Archive endpoint should persist archived status.');
if (uploadedAssetId) {
  await adminDb.collection('creativeAssets').doc(uploadedAssetId).delete();
}
await deleteApp(adminApp);

console.log('Creative asset internal API smoke test passed.');
