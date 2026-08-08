import { createHash, randomBytes } from 'crypto';
import { applicationDefault, cert, getApp, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import type { ApiKeyCreateResponse, ApiKeyListResponse, ApiKeyRecord, ApiKeyRevokeResponse, ApiKeyScope, UserRole } from '../types.js';
import { API_KEY_FULL_ACCESS_SCOPES, API_KEY_SCOPE_DEFINITIONS, dedupeScopes, isApiKeyScope } from './apiKeyScopes.js';

export const REPLIFY_API_KEY_PREFIX = 'ros_live_';

type HeaderBag = Record<string, string | string[] | undefined> | undefined;

type UserProfileDocument = {
  companyId?: string | null;
  role?: UserRole;
};

export type FirebaseRequestActor = {
  uid: string;
  email: string | null;
  companyId: string | null;
  role: 'admin' | 'member';
};

export type AuthorizedApiKeyActor = {
  key: ApiKeyRecord;
  companyId: string | null;
  ownerUid: string;
  ownerEmail: string | null;
  ownerRole: 'admin' | 'member';
  ownerCompanyId: string | null;
};

type ApiKeyDocument = ApiKeyRecord & {
  keyHash: string;
  updatedAt?: string | null;
};

export class ApiKeyServerError extends Error {
  statusCode: number;
  requiredScopes?: ApiKeyScope[];

  constructor(message: string, statusCode = 400, requiredScopes?: ApiKeyScope[]) {
    super(message);
    this.name = 'ApiKeyServerError';
    this.statusCode = statusCode;
    this.requiredScopes = requiredScopes;
  }
}

type ApiKeyServerGlobals = typeof globalThis & {
  __replofyApiAdminApp?: App;
  __replofyApiAdminInitError?: ApiKeyServerError;
};

const globalState = globalThis as ApiKeyServerGlobals;
const LOCAL_FIREBASE_PROJECT_ID = 'demo-replofy-os';

function getHeaderValue(headers: HeaderBag, name: string) {
  if (!headers) return undefined;

  const lowerCaseName = name.toLowerCase();
  const directValue = headers[lowerCaseName];

  if (Array.isArray(directValue)) {
    return directValue[0];
  }

  if (typeof directValue === 'string') {
    return directValue;
  }

  const fallbackKey = Object.keys(headers).find((key) => key.toLowerCase() === lowerCaseName);
  if (!fallbackKey) return undefined;

  const value = headers[fallbackKey];
  return Array.isArray(value) ? value[0] : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getProjectId() {
  const configuredProjectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.FIREBASE_PROJECT_ID;
  if (configuredProjectId) return configuredProjectId;
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    return LOCAL_FIREBASE_PROJECT_ID;
  }
  return '';
}

function getDatabaseId() {
  return process.env.FIREBASE_DATABASE_ID || process.env.FIRESTORE_DATABASE_ID || undefined;
}

function getServiceAccountCredentials() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (json) {
    const parsed = JSON.parse(json) as ServiceAccount;
    return cert(parsed);
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || getProjectId();
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    return cert({
      projectId,
      clientEmail,
      privateKey,
    });
  }

  return applicationDefault();
}

function hasConfiguredAdminCredentials() {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ||
      (
        process.env.FIREBASE_ADMIN_PROJECT_ID &&
        process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim() &&
        process.env.FIREBASE_ADMIN_PRIVATE_KEY
      ) ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS,
  );
}

function getAdminApp() {
  if (globalState.__replofyApiAdminApp) {
    return globalState.__replofyApiAdminApp;
  }

  if (globalState.__replofyApiAdminInitError) {
    throw globalState.__replofyApiAdminInitError;
  }

  try {
    const projectId = getProjectId();
    if (!projectId) {
      throw new Error('Missing Firebase project id.');
    }

    const useEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST);
    const app = getApps().length
      ? getApp()
      : initializeApp(
          useEmulator && !hasConfiguredAdminCredentials()
            ? { projectId }
            : {
                credential: getServiceAccountCredentials(),
                projectId,
              },
        );

    globalState.__replofyApiAdminApp = app;
    return app;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Firebase Admin is not configured.';
    const initError = new ApiKeyServerError(
      'API key management is unavailable until Firebase Admin credentials are configured.',
      503,
    );

    globalState.__replofyApiAdminInitError = initError;

    if (message) {
      console.warn('[replofy-os] Firebase Admin initialization failed:', message);
    }

    throw initError;
  }
}

function getDb() {
  const databaseId = getDatabaseId();
  return databaseId ? getFirestore(getAdminApp(), databaseId) : getFirestore(getAdminApp());
}

export function getAdminFirestore() {
  return getDb();
}

function getAdminAuth() {
  return getAuth(getAdminApp());
}

function getApiKeysCollection() {
  return getDb().collection('apiKeys');
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeLabel(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function isAllowedScopeSet(scopes: ApiKeyScope[]) {
  return scopes.every((scope) => API_KEY_SCOPE_DEFINITIONS.some((definition) => definition.scope === scope));
}

function hashApiKey(rawKey: string) {
  return createHash('sha256').update(rawKey).digest('hex');
}

function generateRawKey() {
  return `${REPLIFY_API_KEY_PREFIX}${randomBytes(32).toString('hex')}`;
}

function buildRecord(id: string, data: Partial<ApiKeyDocument>): ApiKeyRecord {
  return {
    id,
    label: typeof data.label === 'string' ? data.label : '',
    scopes: Array.isArray(data.scopes) ? data.scopes.filter(isApiKeyScope) : [],
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : nowIso(),
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : '',
    ownerUid: typeof data.ownerUid === 'string' ? data.ownerUid : '',
    companyId: typeof data.companyId === 'string' || data.companyId === null ? data.companyId ?? null : null,
    isActive: data.isActive !== false,
    keyLast4: typeof data.keyLast4 === 'string' ? data.keyLast4 : '0000',
    lastUsedAt: typeof data.lastUsedAt === 'string' || data.lastUsedAt === null ? data.lastUsedAt ?? null : null,
    revokedAt: typeof data.revokedAt === 'string' || data.revokedAt === null ? data.revokedAt ?? null : null,
  };
}

function buildDocument(data: ApiKeyRecord & { keyHash: string; updatedAt?: string | null }): ApiKeyDocument {
  return {
    ...data,
    companyId: data.companyId ?? null,
    lastUsedAt: data.lastUsedAt ?? null,
    revokedAt: data.revokedAt ?? null,
    updatedAt: data.updatedAt ?? null,
  };
}

function canManageKeys(actor: FirebaseRequestActor) {
  return !actor.companyId || actor.role === 'admin';
}

async function resolveActor(headers: HeaderBag): Promise<FirebaseRequestActor> {
  const authorization = getHeaderValue(headers, 'authorization');
  if (!authorization) {
    throw new ApiKeyServerError('Unauthorized.', 401);
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new ApiKeyServerError('Unauthorized.', 401);
  }

  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(match[1], true);
  } catch {
    throw new ApiKeyServerError('Invalid or expired Firebase ID token.', 401);
  }
  const profileSnap = await getDb().collection('users').doc(decoded.uid).get();

  if (!profileSnap.exists) {
    throw new ApiKeyServerError('User profile is not ready yet.', 403);
  }

  const profile = profileSnap.data() as UserProfileDocument;
  const companyId = typeof profile.companyId === 'string' && profile.companyId.trim() ? profile.companyId : null;
  const role = profile.role === 'member' ? 'member' : 'admin';

  return {
    uid: decoded.uid,
    email: decoded.email ?? null,
    companyId,
    role,
  };
}

export async function authorizeFirebaseUserFromHeaders(headers: HeaderBag): Promise<FirebaseRequestActor> {
  return resolveActor(headers);
}

function ensureKeyManagementAccess(actor: FirebaseRequestActor) {
  if (!canManageKeys(actor)) {
    throw new ApiKeyServerError('Only company admins can manage API keys.', 403);
  }
}

function validateCreateBody(body: unknown) {
  if (!isRecord(body)) {
    throw new ApiKeyServerError('Request body must be a JSON object.', 400);
  }

  const label = normalizeLabel(body.label);
  const scopesInput = Array.isArray(body.scopes) ? body.scopes : null;

  if (!label) {
    throw new ApiKeyServerError('label is required.', 400);
  }

  if (label.length < 3 || label.length > 80) {
    throw new ApiKeyServerError('label must be between 3 and 80 characters.', 400);
  }

  if (!scopesInput || scopesInput.length === 0) {
    throw new ApiKeyServerError('At least one scope is required.', 400);
  }

  if (scopesInput.some((scope) => !isApiKeyScope(scope))) {
    throw new ApiKeyServerError('One or more scopes are invalid.', 400);
  }

  const scopes = dedupeScopes(scopesInput as ApiKeyScope[]);

  if (!isAllowedScopeSet(scopes)) {
    throw new ApiKeyServerError('One or more scopes are invalid.', 400);
  }

  return { label, scopes };
}

function validateRevokeBody(body: unknown) {
  if (!isRecord(body)) {
    throw new ApiKeyServerError('Request body must be a JSON object.', 400);
  }

  const keyId = typeof body.keyId === 'string' ? body.keyId.trim() : '';

  if (!keyId) {
    throw new ApiKeyServerError('keyId is required.', 400);
  }

  return { keyId };
}

async function queryKeys(actor: FirebaseRequestActor) {
  const query = actor.companyId
    ? getApiKeysCollection().where('companyId', '==', actor.companyId)
    : getApiKeysCollection().where('ownerUid', '==', actor.uid);

  const snapshot = await query.get();
  return snapshot.docs
    .map((doc) => buildRecord(doc.id, doc.data() as Partial<ApiKeyDocument>))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function listApiKeysFromHeaders(headers: HeaderBag): Promise<ApiKeyListResponse> {
  const actor = await resolveActor(headers);
  ensureKeyManagementAccess(actor);

  return {
    canManageKeys: true,
    keys: await queryKeys(actor),
  };
}

export async function createApiKeyFromHeaders(
  headers: HeaderBag,
  body: unknown,
): Promise<ApiKeyCreateResponse> {
  const actor = await resolveActor(headers);
  ensureKeyManagementAccess(actor);

  const { label, scopes } = validateCreateBody(body);
  const rawKey = generateRawKey();
  const keyId = getApiKeysCollection().doc().id;
  const createdAt = nowIso();

  const record = buildRecord(keyId, {
    id: keyId,
    label,
    scopes,
    createdAt,
    createdBy: actor.uid,
    ownerUid: actor.uid,
    companyId: actor.companyId,
    isActive: true,
    keyLast4: rawKey.slice(-4),
    lastUsedAt: null,
    revokedAt: null,
  });

  await getApiKeysCollection().doc(keyId).set(
    buildDocument({
      ...record,
      keyHash: hashApiKey(rawKey),
      updatedAt: createdAt,
    }),
  );

  return {
    key: rawKey,
    record,
    warning: 'Store this key securely. It will not be shown again.',
  };
}

export async function revokeApiKeyFromHeaders(headers: HeaderBag, body: unknown): Promise<ApiKeyRevokeResponse> {
  const actor = await resolveActor(headers);
  ensureKeyManagementAccess(actor);

  const { keyId } = validateRevokeBody(body);
  const ref = getApiKeysCollection().doc(keyId);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    throw new ApiKeyServerError('API key not found.', 404);
  }

  const record = buildRecord(snapshot.id, snapshot.data() as Partial<ApiKeyDocument>);
  const isOwner = actor.companyId ? record.companyId === actor.companyId : record.ownerUid === actor.uid;

  if (!isOwner) {
    throw new ApiKeyServerError('API key not found.', 404);
  }

  const now = nowIso();
  await ref.update({
    isActive: false,
    revokedAt: now,
    updatedAt: now,
  });

  return {
    record: {
      ...record,
      isActive: false,
      revokedAt: now,
    },
  };
}

export async function authorizeExternalApiKey(
  headers: HeaderBag,
  requiredScopes: ApiKeyScope[] = [],
): Promise<AuthorizedApiKeyActor> {
  const rawKey = getHeaderValue(headers, 'x-api-key') || getHeaderValue(headers, 'authorization');

  if (!rawKey) {
    throw new ApiKeyServerError('Unauthorized.', 401);
  }

  const candidate = rawKey.replace(/^Bearer\s+/i, '').trim();
  if (!candidate.startsWith(REPLIFY_API_KEY_PREFIX)) {
    throw new ApiKeyServerError('Unauthorized.', 401);
  }

  const keyHash = hashApiKey(candidate);
  const snapshot = await getApiKeysCollection()
    .where('keyHash', '==', keyHash)
    .where('isActive', '==', true)
    .limit(1)
    .get();

  if (snapshot.empty) {
    throw new ApiKeyServerError('Unauthorized.', 401);
  }

  const doc = snapshot.docs[0];
  const record = buildRecord(doc.id, doc.data() as Partial<ApiKeyDocument>);
  const hasScopes = requiredScopes.every((scope) => record.scopes.includes(scope));

  if (!hasScopes) {
    throw new ApiKeyServerError('Forbidden.', 403, requiredScopes);
  }

  const ownerSnapshot = await getDb().collection('users').doc(record.ownerUid).get();
  if (!ownerSnapshot.exists) {
    throw new ApiKeyServerError('API key owner is no longer available.', 403);
  }

  const ownerProfile = ownerSnapshot.data() as UserProfileDocument;
  const ownerCompanyId =
    typeof ownerProfile.companyId === 'string' && ownerProfile.companyId.trim() ? ownerProfile.companyId : null;
  const ownerRole = ownerProfile.role === 'member' ? 'member' : 'admin';

  if (record.companyId && record.companyId !== ownerCompanyId) {
    throw new ApiKeyServerError('API key workspace access is no longer valid.', 403);
  }

  const now = nowIso();
  void doc.ref
    .update({
      lastUsedAt: now,
      updatedAt: now,
    })
    .catch(() => {});

  return {
    key: record,
    companyId: record.companyId,
    ownerUid: record.ownerUid,
    ownerEmail: typeof ownerSnapshot.get('email') === 'string' ? ownerSnapshot.get('email') : null,
    ownerRole,
    ownerCompanyId,
  };
}

export async function handleApiKeySettingsRequest(
  headers: HeaderBag,
  method: string | undefined,
  body: unknown,
) {
  switch (method?.toUpperCase()) {
    case 'GET':
      return listApiKeysFromHeaders(headers);
    case 'POST':
      return createApiKeyFromHeaders(headers, body);
    case 'DELETE':
      return revokeApiKeyFromHeaders(headers, body);
    default:
      throw new ApiKeyServerError('Method not allowed.', 405);
  }
}

export function getDefaultScopes() {
  return [...API_KEY_FULL_ACCESS_SCOPES];
}
