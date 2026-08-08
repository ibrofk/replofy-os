import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID || 'demo-replofy-os';
const databaseId = process.env.FIREBASE_DATABASE_ID || '(default)';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8081';
const apiBase = process.env.CREATIVE_HUB_TEST_API_BASE || 'http://127.0.0.1:4000';
const runId = Date.now().toString(36);
const fileName = `cloudinary-live-probe-${runId}.png`;
const imageBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  return response.json().catch(() => null);
}

async function expectStatus(response, expectedStatus, label) {
  const body = await readJson(response);
  assert(response.status === expectedStatus, `${label} expected ${expectedStatus}, received ${response.status}.`);
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

function describeCloudinaryUploadError(body, status) {
  const message = typeof body?.error?.message === 'string' ? body.error.message : '';
  if (/invalid signature/i.test(message)) return 'Cloudinary rejected the generated upload signature.';
  if (/api key/i.test(message)) return 'Cloudinary rejected the configured API key.';
  if (/timestamp/i.test(message)) return 'Cloudinary rejected the signed upload timestamp.';
  if (/public[_ ]id/i.test(message)) return 'Cloudinary rejected the generated asset identifier.';
  return `Cloudinary file upload failed with status ${status}.`;
}

const email = `cloudinary-live-${runId}@example.com`;
let localId = null;
let assetId = null;
let authHeaders = null;
let archiveCompleted = false;

process.env.FIRESTORE_EMULATOR_HOST = firestoreHost;
const adminApp = initializeApp({ projectId }, `creative-asset-cloudinary-live-${runId}`);
const adminDb = getFirestore(adminApp, databaseId);

try {
  const signUp = await expectStatus(
    await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=creative-hub-live-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'creative-hub-live-test',
        returnSecureToken: true,
      }),
    }),
    200,
    'Auth emulator sign-up',
  );
  localId = signUp.localId;
  authHeaders = {
    Authorization: `Bearer ${signUp.idToken}`,
    'Content-Type': 'application/json',
  };

  await expectStatus(
    await fetch(`http://${firestoreHost}/v1/projects/${projectId}/databases/${databaseId}/documents/users/${localId}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify(
        toFirestoreDocument({
          email,
          displayName: 'Cloudinary Live Probe',
          role: 'master-admin',
          onboardingCompleted: true,
          createdAt: new Date().toISOString(),
        }),
      ),
    }),
    200,
    'Create live probe profile',
  );

  const uploadInit = await expectStatus(
    await fetch(`${apiBase}/api/internal/creative-assets/uploads`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        fileName,
        mimeType: 'image/png',
        fileSize: imageBytes.length,
        title: 'Cloudinary live probe',
      }),
    }),
    201,
    'Cloudinary upload init',
  );
  assetId = uploadInit.asset.id;
  assert(uploadInit.asset.provider === 'cloudinary', 'Upload provider should be Cloudinary.');

  const uploadBody = new FormData();
  for (const [key, value] of Object.entries(uploadInit.upload.fields)) {
    uploadBody.append(key, value);
  }
  uploadBody.append('file', new Blob([imageBytes], { type: 'image/png' }), fileName);

  const uploadResponse = await fetch(uploadInit.upload.url, {
    method: uploadInit.upload.method,
    body: uploadBody,
  });
  const uploadReceipt = await readJson(uploadResponse);
  assert(uploadResponse.ok, describeCloudinaryUploadError(uploadReceipt, uploadResponse.status));

  await expectStatus(
    await fetch(`${apiBase}/api/internal/creative-assets/${assetId}/complete`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ upload: uploadReceipt }),
    }),
    200,
    'Cloudinary upload complete',
  );

  const download = await expectStatus(
    await fetch(`${apiBase}/api/internal/creative-assets/${assetId}/download`, {
      headers: authHeaders,
    }),
    200,
    'Cloudinary signed delivery URL',
  );
  const deliveredAsset = await fetch(download.url);
  assert(deliveredAsset.ok, `Cloudinary signed delivery failed with status ${deliveredAsset.status}.`);
  assert(deliveredAsset.headers.get('content-type')?.startsWith('image/'), 'Cloudinary delivery should return an image.');

  await expectStatus(
    await fetch(`${apiBase}/api/internal/creative-assets/${assetId}/archive`, {
      method: 'PATCH',
      headers: authHeaders,
      body: '{}',
    }),
    200,
    'Cloudinary asset archive',
  );
  archiveCompleted = true;

  const assetSnapshot = await adminDb.collection('creativeAssets').doc(assetId).get();
  assert(assetSnapshot.get('status') === 'archived', 'Archive should persist archived status.');

  await expectStatus(
    await fetch(`${apiBase}/api/internal/creative-assets/${assetId}/download`, {
      headers: authHeaders,
    }),
    409,
    'Archived asset download denial',
  );

  console.log('Live Cloudinary asset lifecycle passed.');
} finally {
  if (assetId && authHeaders && !archiveCompleted) {
    await fetch(`${apiBase}/api/internal/creative-assets/${assetId}/archive`, {
      method: 'PATCH',
      headers: authHeaders,
      body: '{}',
    }).catch(() => undefined);
  }
  if (assetId) {
    await adminDb.collection('creativeAssets').doc(assetId).delete().catch(() => undefined);
  }
  if (localId) {
    await adminDb.collection('users').doc(localId).delete().catch(() => undefined);
  }
  await deleteApp(adminApp);
}
