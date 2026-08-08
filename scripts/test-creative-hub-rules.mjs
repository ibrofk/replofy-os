import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID || 'demo-replofy-os';
const databaseId = process.env.FIREBASE_DATABASE_ID || '(default)';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8081';
const apiKey = 'demo-creative-hub-rules-test';
const runId = Date.now().toString(36);
const adminApp = initializeApp({ projectId }, `creative-hub-rules-${runId}`);
const adminDb = getFirestore(adminApp);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function toFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  return { stringValue: String(value) };
}

function toFirestoreDocument(value) {
  return {
    fields: Object.fromEntries(Object.entries(value).map(([key, fieldValue]) => [key, toFirestoreValue(fieldValue)])),
  };
}

async function request(url, options = {}, expectedStatus = 200) {
  const response = await fetch(url, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  assert(
    response.status === expectedStatus,
    `${options.method || 'GET'} ${url} expected ${expectedStatus}, received ${response.status}: ${text}`,
  );

  return body;
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function firestoreUrl(path) {
  return `http://${firestoreHost}/v1/projects/${projectId}/databases/${databaseId}/documents/${path}`;
}

async function createActor(label, companyId, role) {
  const email = `${label}-${runId}@example.com`;
  const auth = await request(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'creative-hub-test-password',
        returnSecureToken: true,
      }),
    },
  );

  const effectiveRole = role === 'master-admin' ? 'admin' : role;
  const invitationId = `creative-hub-invite-${label}-${runId}`;
  await adminDb.doc(`invitations/${invitationId}`).set({
    id: invitationId,
    email,
    companyId,
    role: effectiveRole,
    status: 'pending',
  });

  const profile = {
    email,
    displayName: label,
    role: effectiveRole,
    companyId,
    onboardingCompleted: true,
    createdAt: new Date().toISOString(),
    acceptedInvitationId: invitationId,
    invitationAcceptedAt: new Date().toISOString(),
  };

  await request(
    firestoreUrl(`users/${auth.localId}`),
    {
      method: 'PATCH',
      headers: authHeaders(auth.idToken),
      body: JSON.stringify(toFirestoreDocument(profile)),
    },
  );

  return {
    uid: auth.localId,
    token: auth.idToken,
    profile,
  };
}

function creativeDocument(authorId, companyId) {
  const now = new Date().toISOString();
  return {
    title: 'Creative Hub rules test',
    platform: 'Instagram',
    format: 'carousel',
    campaign: 'Rules smoke test',
    audience: 'Support leaders',
    objective: 'Validate approval permissions',
    hook: 'Approval boundaries must hold.',
    brief: '',
    caption: '',
    visualDirection: '',
    productionNotes: '',
    cta: '',
    status: 'idea',
    ownerId: authorId,
    approverId: null,
    targetPublishAt: null,
    scheduledFor: null,
    publishedAt: null,
    submittedAt: null,
    approvalNotes: '',
    assetIds: [],
    tags: [],
    sourceIds: [`source-${runId}`],
    sourceVersionIds: [`source-version-${runId}`],
    sourceKey: 'creative-hub-rules-test',
    sourceTitle: 'Creative Hub rules test source',
    sourceVersion: 1,
    sourceUpdatedAt: now,
    aliases: ['Creative Hub rules test'],
    matchKey: 'creative hub rules test',
    createdAt: now,
    updatedAt: now,
    authorId,
    companyId,
  };
}

async function writeCreative(path, token, creative, expectedStatus = 200) {
  return request(
    firestoreUrl(path),
    {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(toFirestoreDocument(creative)),
    },
    expectedStatus,
  );
}

const admin = await createActor('master-admin', 'company-a', 'admin');
const member = await createActor('member', 'company-a', 'member');
const outsider = await createActor('outsider', 'company-b', 'admin');
const creativePath = `creativeItems/creative-${runId}`;
const creative = creativeDocument(member.uid, 'company-a');

await request(
  firestoreUrl(`users/${member.uid}`),
  {
    method: 'PATCH',
    headers: authHeaders(member.token),
    body: JSON.stringify(toFirestoreDocument({ ...member.profile, role: 'master-admin' })),
  },
  403,
);

await writeCreative(creativePath, member.token, creative);

creative.status = 'in-review';
creative.submittedAt = new Date().toISOString();
creative.updatedAt = new Date().toISOString();
await writeCreative(creativePath, member.token, creative);

creative.status = 'approved';
creative.approverId = member.uid;
creative.updatedAt = new Date().toISOString();
await writeCreative(creativePath, member.token, creative, 403);

creative.approverId = admin.uid;
creative.approvalNotes = 'Approved by master admin.';
creative.updatedAt = new Date().toISOString();
await writeCreative(creativePath, admin.token, creative);

creative.status = 'scheduled';
creative.scheduledFor = new Date(Date.now() + 60 * 60 * 1000).toISOString();
creative.updatedAt = new Date().toISOString();
await writeCreative(creativePath, admin.token, creative);

await request(
  firestoreUrl(creativePath),
  {
    headers: authHeaders(outsider.token),
  },
  403,
);

console.log('Creative Hub Firestore rules smoke test passed.');
