import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID || 'demo-replofy-os';
const databaseId = process.env.FIREBASE_DATABASE_ID || '(default)';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8081';
const apiKey = 'demo-team-invitation-rules-test';
const runId = Date.now().toString(36);

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

async function createAuthUser(label) {
  const email = `${label}-${runId}@example.com`;
  const auth = await request(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'team-invite-rules-test-password',
        returnSecureToken: true,
      }),
    },
  );

  return {
    uid: auth.localId,
    token: auth.idToken,
    email,
  };
}

async function writeDoc(path, token, data, expectedStatus = 200, updateMask = []) {
  const mask = updateMask.map((fieldPath) => `updateMask.fieldPaths=${encodeURIComponent(fieldPath)}`).join('&');
  const url = `${firestoreUrl(path)}${mask ? `?${mask}` : ''}`;
  return request(
    url,
    {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(toFirestoreDocument(data)),
    },
    expectedStatus,
  );
}

const now = new Date().toISOString();
const companyId = `company-invite-${runId}`;
const owner = await createAuthUser('owner');
const invitee = await createAuthUser('invitee');
const rejectInvitee = await createAuthUser('reject-invitee');
const existingMember = await createAuthUser('existing-member');
const outsider = await createAuthUser('outsider');

process.env.FIRESTORE_EMULATOR_HOST = firestoreHost;
const adminApp = initializeApp({ projectId }, `team-invitation-rules-${runId}`);
const adminDb = databaseId === '(default)'
  ? getFirestore(adminApp)
  : getFirestore(adminApp, databaseId);

await adminDb.doc(`companies/${companyId}`).set({
  id: companyId,
  name: 'Invite Rules Co',
  createdAt: now,
  ownerId: owner.uid,
});

await adminDb.doc(`users/${owner.uid}`).set({
  email: owner.email,
  displayName: 'Owner',
  role: 'master-admin',
  companyId,
  onboardingCompleted: true,
  createdAt: now,
});

await writeDoc(`companies/outsider-company-${runId}`, outsider.token, {
  id: `outsider-company-${runId}`,
  name: 'Unauthorized Bootstrap Co',
  createdAt: now,
  ownerId: outsider.uid,
}, 403);

await writeDoc(`users/${outsider.uid}`, outsider.token, {
  email: outsider.email,
  displayName: 'Outsider',
  role: 'member',
  companyId,
  onboardingCompleted: true,
  createdAt: now,
}, 403);

const acceptedInviteId = `accepted-invite-${runId}`;
const rejectedInviteId = `rejected-invite-${runId}`;
const existingRejectInviteId = `existing-reject-invite-${runId}`;
const existingCompanyId = `existing-company-${runId}`;

await adminDb.doc(`companies/${existingCompanyId}`).set({
  id: existingCompanyId,
  name: 'Existing Member Co',
  createdAt: now,
  ownerId: existingMember.uid,
});

await adminDb.doc(`users/${existingMember.uid}`).set({
  email: existingMember.email,
  displayName: 'Existing Member',
  role: 'master-admin',
  companyId: existingCompanyId,
  onboardingCompleted: true,
  createdAt: now,
});

await writeDoc(`invitations/${acceptedInviteId}`, owner.token, {
  email: invitee.email.toLowerCase(),
  companyId,
  role: 'member',
  invitedBy: owner.uid,
  status: 'pending',
  createdAt: now,
});

await writeDoc(`invitations/${rejectedInviteId}`, owner.token, {
  email: rejectInvitee.email.toLowerCase(),
  companyId,
  role: 'member',
  invitedBy: owner.uid,
  status: 'pending',
  createdAt: now,
});

await writeDoc(`invitations/${existingRejectInviteId}`, owner.token, {
  email: existingMember.email.toLowerCase(),
  companyId,
  role: 'member',
  invitedBy: owner.uid,
  status: 'pending',
  createdAt: now,
});

await writeDoc(`invitations/${acceptedInviteId}`, invitee.token, {
  email: invitee.email.toLowerCase(),
  companyId: `tampered-${companyId}`,
  role: 'member',
  invitedBy: owner.uid,
  status: 'accepted',
  respondedAt: now,
  respondedBy: invitee.uid,
  createdAt: now,
}, 403);

await writeDoc(`users/${invitee.uid}`, invitee.token, {
  email: invitee.email,
  displayName: 'Invitee',
  role: 'member',
  companyId,
  onboardingCompleted: true,
  acceptedInvitationId: acceptedInviteId,
  invitationAcceptedAt: now,
  createdAt: now,
});

await writeDoc(`invitations/${acceptedInviteId}`, invitee.token, {
  status: 'accepted',
  respondedAt: now,
  respondedBy: invitee.uid,
}, 200, ['status', 'respondedAt', 'respondedBy']);

await writeDoc(`users/${rejectInvitee.uid}`, rejectInvitee.token, {
  email: rejectInvitee.email,
  displayName: 'Reject Invitee',
  role: 'member',
  onboardingCompleted: false,
  rejectedInvitationId: rejectedInviteId,
  invitationRejectedAt: now,
  createdAt: now,
});

await writeDoc(`invitations/${rejectedInviteId}`, rejectInvitee.token, {
  status: 'rejected',
  respondedAt: now,
  respondedBy: rejectInvitee.uid,
}, 200, ['status', 'respondedAt', 'respondedBy']);

await writeDoc(`users/${existingMember.uid}`, existingMember.token, {
  email: existingMember.email,
  displayName: 'Existing Member',
  role: 'master-admin',
  companyId: existingCompanyId,
  onboardingCompleted: true,
  rejectedInvitationId: existingRejectInviteId,
  invitationRejectedAt: now,
  createdAt: now,
});

await writeDoc(`invitations/${existingRejectInviteId}`, existingMember.token, {
  status: 'rejected',
  respondedAt: now,
  respondedBy: existingMember.uid,
}, 200, ['status', 'respondedAt', 'respondedBy']);

await writeDoc(`invitations/${acceptedInviteId}`, invitee.token, {
  status: 'rejected',
  respondedAt: now,
  respondedBy: invitee.uid,
}, 403, ['status', 'respondedAt', 'respondedBy']);

console.log('Team invitation rules smoke passed.');
