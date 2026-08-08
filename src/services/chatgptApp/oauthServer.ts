import { createHash, randomBytes } from 'crypto';
import { ApiKeyServerError, authorizeFirebaseUserFromHeaders, getAdminFirestore, type AuthorizedApiKeyActor } from '../apiKeyServer.js';
import type { ApiKeyRecord, ApiKeyScope, UserRole } from '../../types.js';

type HeaderBag = Record<string, string | string[] | undefined> | undefined;

type OAuthClientRecord = {
  clientId: string;
  clientSecretHash?: string;
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: TokenEndpointAuthMethod;
  createdAt: string;
};

type OAuthCodeRecord = {
  codeHash: string;
  clientId: string;
  redirectUri: string;
  resource: string;
  scopes: ApiKeyScope[];
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  ownerUid: string;
  ownerEmail: string | null;
  companyId: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
};

type OAuthAccessTokenRecord = {
  tokenHash: string;
  refreshTokenHash?: string;
  clientId: string;
  resource: string;
  scopes: ApiKeyScope[];
  ownerUid: string;
  ownerEmail: string | null;
  companyId: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
};

type OAuthRefreshTokenRecord = {
  tokenHash: string;
  clientId: string;
  resource: string;
  scopes: ApiKeyScope[];
  ownerUid: string;
  ownerEmail: string | null;
  companyId: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
};

type ParsedTokenBody = Record<string, string>;
type TokenEndpointAuthMethod = 'none' | 'client_secret_basic' | 'client_secret_post';

const ACCESS_TOKEN_PREFIX = 'roa_';
const REFRESH_TOKEN_PREFIX = 'ror_';
const AUTH_CODE_PREFIX = 'roc_';
const CLIENT_SECRET_PREFIX = 'ros_';
const CLIENT_ID_PREFIX = 'replofy_chatgpt_';
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const AUTH_CODE_TTL_SECONDS = 10 * 60;

export const CHATGPT_OAUTH_SCOPES: ApiKeyScope[] = [
  'workspace:read',
  'workspace:write',
  'systems:read',
  'systems:write',
  'identity:read',
  'identity:write',
];

function nowIso() {
  return new Date().toISOString();
}

function logOAuthEvent(event: string, details: Record<string, unknown>) {
  console.info(`[replofy-os][chatgpt-oauth] ${event}`, JSON.stringify(details));
}

function addSeconds(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function base64Url(buffer: Buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomToken(prefix: string) {
  return `${prefix}${randomBytes(32).toString('hex')}`;
}

function tokenDocId(token: string) {
  return sha256(token);
}

function getHeaderValue(headers: HeaderBag, name: string) {
  if (!headers) return undefined;
  const lowerCaseName = name.toLowerCase();
  const direct = headers[lowerCaseName];
  if (Array.isArray(direct)) return direct[0];
  if (typeof direct === 'string') return direct;
  const fallbackKey = Object.keys(headers).find((key) => key.toLowerCase() === lowerCaseName);
  if (!fallbackKey) return undefined;
  const value = headers[fallbackKey];
  return Array.isArray(value) ? value[0] : value;
}

function requestOrigin(headers: HeaderBag) {
  const configured = process.env.REPLOFY_CHATGPT_APP_BASE_URL || process.env.APP_URL;
  if (configured?.trim()) return configured.trim().replace(/\/$/, '');

  const host = getHeaderValue(headers, 'x-forwarded-host') || getHeaderValue(headers, 'host') || 'localhost:4000';
  const proto =
    getHeaderValue(headers, 'x-forwarded-proto') ||
    (host.includes('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export function getOAuthIssuer(headers?: HeaderBag) {
  return requestOrigin(headers);
}

export function getMcpResource(headers?: HeaderBag) {
  return `${requestOrigin(headers)}/mcp`;
}

export function getProtectedResourceMetadataUrl(headers?: HeaderBag) {
  return `${requestOrigin(headers)}/.well-known/oauth-protected-resource/mcp`;
}

function quoteHeaderValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function buildMcpWwwAuthenticate(
  headers?: HeaderBag,
  error = 'invalid_token',
  description = 'Sign in to Replofy OS to continue.',
  scopes: ApiKeyScope[] = [],
) {
  const attributes = [
    `resource_metadata="${quoteHeaderValue(getProtectedResourceMetadataUrl(headers))}"`,
    `error="${quoteHeaderValue(error)}"`,
    `error_description="${quoteHeaderValue(description)}"`,
  ];

  if (scopes.length > 0) {
    attributes.push(`scope="${quoteHeaderValue(Array.from(new Set(scopes)).join(' '))}"`);
  }

  return `Bearer ${attributes.join(', ')}`;
}

function isSupportedScope(scope: string): scope is ApiKeyScope {
  return (CHATGPT_OAUTH_SCOPES as string[]).includes(scope);
}

function parseScopes(scopeValue: string | undefined): ApiKeyScope[] {
  if (!scopeValue?.trim()) return [...CHATGPT_OAUTH_SCOPES];
  const scopes = scopeValue.split(/\s+/).filter(Boolean);
  const unsupported = scopes.filter((scope) => !isSupportedScope(scope));
  if (unsupported.length > 0) {
    throw new ApiKeyServerError(`Unsupported OAuth scope: ${unsupported.join(', ')}`, 400);
  }
  return Array.from(new Set(scopes)) as ApiKeyScope[];
}

function resolveGrantedScopes(scopeValue: string | undefined): ApiKeyScope[] {
  return parseScopes(scopeValue);
}

function validateRedirectUri(redirectUri: string) {
  try {
    const parsed = new URL(redirectUri);
    const isChatGptConnector =
      parsed.origin === 'https://chatgpt.com' &&
      (parsed.pathname.startsWith('/connector/oauth/') ||
        parsed.pathname === '/connector_platform_oauth_redirect');
    if (!isChatGptConnector) {
      throw new Error('Redirect URI must be a ChatGPT connector callback.');
    }
  } catch {
    throw new ApiKeyServerError('Invalid OAuth redirect_uri.', 400);
  }
}

function isChatGptClientId(clientId: string) {
  if (clientId.startsWith(CLIENT_ID_PREFIX)) return true;
  try {
    const parsed = new URL(clientId);
    return parsed.origin === 'https://chatgpt.com';
  } catch {
    return false;
  }
}

function pkceChallengeForVerifier(verifier: string) {
  return base64Url(createHash('sha256').update(verifier).digest());
}

function collection(name: string) {
  return getAdminFirestore().collection(name);
}

async function getRegisteredClient(clientId: string): Promise<OAuthClientRecord | null> {
  if (!clientId.startsWith(CLIENT_ID_PREFIX)) return null;
  const snapshot = await collection('oauthClients').doc(clientId).get();
  return snapshot.exists ? (snapshot.data() as OAuthClientRecord) : null;
}

function parseBasicClientAuth(headers: HeaderBag) {
  const authorization = getHeaderValue(headers, 'authorization');
  const match = authorization?.match(/^Basic\s+(.+)$/i);
  if (!match) return null;

  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;
    return {
      clientId: decoded.slice(0, separator),
      clientSecret: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

function resolveTokenClientId(headers: HeaderBag, input: ParsedTokenBody) {
  const basicAuth = parseBasicClientAuth(headers);
  const bodyClientId = input.client_id;
  const clientId = bodyClientId || basicAuth?.clientId || '';

  if (bodyClientId && basicAuth?.clientId && bodyClientId !== basicAuth.clientId) {
    throw new ApiKeyServerError('OAuth client authentication parameters do not match.', 401);
  }

  return clientId;
}

function requestedTokenEndpointAuthMethod(value: unknown): TokenEndpointAuthMethod {
  return value === 'none' || value === 'client_secret_post' || value === 'client_secret_basic'
    ? value
    : 'client_secret_basic';
}

async function validateTokenClientAuthentication(headers: HeaderBag, input: ParsedTokenBody, clientId: string) {
  if (!isChatGptClientId(clientId)) {
    throw new ApiKeyServerError('Unsupported OAuth client.', 401);
  }

  const registered = await getRegisteredClient(clientId);
  const basicAuth = parseBasicClientAuth(headers);
  const postSecret = input.client_secret;
  const authMethod: TokenEndpointAuthMethod = basicAuth
    ? 'client_secret_basic'
    : postSecret
      ? 'client_secret_post'
      : 'none';

  if (!registered?.clientSecretHash) {
    logOAuthEvent('token_client_authenticated', {
      clientIdPrefix: clientId.slice(0, 32),
      authMethod,
      registered: Boolean(registered),
      secretRequired: false,
    });
    return;
  }

  const suppliedSecret = basicAuth?.clientSecret ?? postSecret;
  if (!suppliedSecret || tokenDocId(suppliedSecret) !== registered.clientSecretHash) {
    throw new ApiKeyServerError('Invalid OAuth client authentication.', 401);
  }

  logOAuthEvent('token_client_authenticated', {
    clientIdPrefix: clientId.slice(0, 32),
    authMethod,
    registered: true,
    secretRequired: true,
  });
}

async function validateClientAndRedirect(clientId: string, redirectUri: string) {
  if (!isChatGptClientId(clientId)) {
    throw new ApiKeyServerError('Unsupported OAuth client.', 400);
  }

  validateRedirectUri(redirectUri);
  const registered = await getRegisteredClient(clientId);
  if (registered && !registered.redirectUris.includes(redirectUri)) {
    throw new ApiKeyServerError('OAuth redirect_uri is not registered for this client.', 400);
  }
}

export function getProtectedResourceMetadata(headers?: HeaderBag) {
  const resource = getMcpResource(headers);
  const issuer = getOAuthIssuer(headers);

  return {
    resource,
    authorization_servers: [issuer],
    scopes_supported: CHATGPT_OAUTH_SCOPES,
    bearer_methods_supported: ['header'],
    resource_documentation: `${issuer}/settings`,
  };
}

export function getAuthorizationServerMetadata(headers?: HeaderBag) {
  const issuer = getOAuthIssuer(headers);

  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/api/oauth/token`,
    registration_endpoint: `${issuer}/api/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
    resource_parameter_supported: true,
    scopes_supported: CHATGPT_OAUTH_SCOPES,
  };
}

export async function registerOAuthClient(body: unknown) {
  const input = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const redirectUris = Array.isArray(input.redirect_uris)
    ? input.redirect_uris.filter((item): item is string => typeof item === 'string')
    : [];

  if (redirectUris.length === 0) {
    throw new ApiKeyServerError('redirect_uris is required.', 400);
  }

  for (const redirectUri of redirectUris) {
    validateRedirectUri(redirectUri);
  }

  const tokenEndpointAuthMethod = requestedTokenEndpointAuthMethod(input.token_endpoint_auth_method);
  const clientId = `${CLIENT_ID_PREFIX}${randomBytes(16).toString('hex')}`;
  const clientSecret = tokenEndpointAuthMethod === 'none' ? undefined : randomToken(CLIENT_SECRET_PREFIX);
  const createdAt = nowIso();
  const record: OAuthClientRecord = {
    clientId,
    clientSecretHash: clientSecret ? tokenDocId(clientSecret) : undefined,
    clientName: typeof input.client_name === 'string' && input.client_name.trim() ? input.client_name.trim() : 'ChatGPT',
    redirectUris,
    tokenEndpointAuthMethod,
    createdAt,
  };

  await collection('oauthClients').doc(clientId).set(record);

  logOAuthEvent('client_registered', {
    clientIdPrefix: clientId.slice(0, CLIENT_ID_PREFIX.length + 8),
    redirectUriCount: redirectUris.length,
    tokenEndpointAuthMethod,
    hasClientSecret: Boolean(clientSecret),
  });

  return {
    client_id: clientId,
    ...(clientSecret
      ? {
          client_secret: clientSecret,
          client_secret_expires_at: 0,
        }
      : {}),
    client_id_issued_at: Math.floor(new Date(createdAt).getTime() / 1000),
    client_name: record.clientName,
    redirect_uris: redirectUris,
    response_types: ['code'],
    grant_types: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_method: tokenEndpointAuthMethod,
    scope: CHATGPT_OAUTH_SCOPES.join(' '),
  };
}

export async function completeOAuthAuthorization(headers: HeaderBag, body: unknown) {
  const actor = await authorizeFirebaseUserFromHeaders(headers);
  const input = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

  const responseType = typeof input.response_type === 'string' ? input.response_type : '';
  const clientId = typeof input.client_id === 'string' ? input.client_id : '';
  const redirectUri = typeof input.redirect_uri === 'string' ? input.redirect_uri : '';
  const state = typeof input.state === 'string' ? input.state : '';
  const codeChallenge = typeof input.code_challenge === 'string' ? input.code_challenge : '';
  const codeChallengeMethod = typeof input.code_challenge_method === 'string' ? input.code_challenge_method : '';
  const resource = typeof input.resource === 'string' ? input.resource : getMcpResource(headers);
  const scopes = resolveGrantedScopes(typeof input.scope === 'string' ? input.scope : undefined);

  if (responseType !== 'code') {
    throw new ApiKeyServerError('Only response_type=code is supported.', 400);
  }
  if (!clientId || !redirectUri || !codeChallenge) {
    throw new ApiKeyServerError('Missing required OAuth authorization parameters.', 400);
  }
  if (codeChallengeMethod !== 'S256') {
    throw new ApiKeyServerError('Only code_challenge_method=S256 is supported.', 400);
  }
  if (resource !== getMcpResource(headers)) {
    throw new ApiKeyServerError('Invalid OAuth resource.', 400);
  }

  await validateClientAndRedirect(clientId, redirectUri);

  const code = randomToken(AUTH_CODE_PREFIX);
  const codeHash = tokenDocId(code);
  const record: OAuthCodeRecord = {
    codeHash,
    clientId,
    redirectUri,
    resource,
    scopes,
    codeChallenge,
    codeChallengeMethod: 'S256',
    ownerUid: actor.uid,
    ownerEmail: actor.email,
    companyId: actor.companyId,
    createdAt: nowIso(),
    expiresAt: addSeconds(AUTH_CODE_TTL_SECONDS),
    usedAt: null,
  };

  await collection('oauthAuthorizationCodes').doc(codeHash).set(record);

  logOAuthEvent('authorization_completed', {
    clientIdPrefix: clientId.slice(0, 32),
    requestedScope: typeof input.scope === 'string' ? input.scope : '',
    grantedScope: scopes.join(' '),
    resource,
    ownerUid: actor.uid,
    hasCompanyId: Boolean(actor.companyId),
  });

  const redirect = new URL(redirectUri);
  redirect.searchParams.set('code', code);
  if (state) redirect.searchParams.set('state', state);

  return {
    redirectTo: redirect.toString(),
  };
}

function parseTokenBody(body: unknown): ParsedTokenBody {
  if (typeof body === 'string') {
    return Object.fromEntries(new URLSearchParams(body));
  }

  if (body && typeof body === 'object') {
    const record: ParsedTokenBody = {};
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (typeof value === 'string') record[key] = value;
      else if (Array.isArray(value) && typeof value[0] === 'string') record[key] = value[0];
    }
    return record;
  }

  return {};
}

async function createTokenPair(record: Omit<OAuthAccessTokenRecord, 'tokenHash' | 'refreshTokenHash' | 'createdAt' | 'expiresAt' | 'revokedAt' | 'lastUsedAt'>) {
  const accessToken = randomToken(ACCESS_TOKEN_PREFIX);
  const refreshToken = randomToken(REFRESH_TOKEN_PREFIX);
  const accessTokenHash = tokenDocId(accessToken);
  const refreshTokenHash = tokenDocId(refreshToken);
  const createdAt = nowIso();

  const accessRecord: OAuthAccessTokenRecord = {
    ...record,
    tokenHash: accessTokenHash,
    refreshTokenHash,
    createdAt,
    expiresAt: addSeconds(ACCESS_TOKEN_TTL_SECONDS),
    revokedAt: null,
    lastUsedAt: null,
  };
  const refreshRecord: OAuthRefreshTokenRecord = {
    ...record,
    tokenHash: refreshTokenHash,
    createdAt,
    expiresAt: addSeconds(REFRESH_TOKEN_TTL_SECONDS),
    revokedAt: null,
    lastUsedAt: null,
  };

  await Promise.all([
    collection('oauthAccessTokens').doc(accessTokenHash).set(accessRecord),
    collection('oauthRefreshTokens').doc(refreshTokenHash).set(refreshRecord),
  ]);

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    scope: record.scopes.join(' '),
    resource: record.resource,
  };
}

function resolveRefreshGrantScopes(inputScope: string | undefined, storedScopes: ApiKeyScope[]) {
  if (!inputScope?.trim()) return storedScopes;

  const requestedScopes = parseScopes(inputScope);
  const unsupported = requestedScopes.filter((scope) => !storedScopes.includes(scope));
  if (unsupported.length > 0) {
    throw new ApiKeyServerError(`Requested scope was not granted: ${unsupported.join(', ')}`, 400);
  }

  return requestedScopes;
}

async function exchangeAuthorizationCode(headers: HeaderBag, input: ParsedTokenBody) {
  const code = input.code;
  const clientId = resolveTokenClientId(headers, input);
  const redirectUri = input.redirect_uri;
  const codeVerifier = input.code_verifier;
  const resource = input.resource || getMcpResource(headers);

  if (!code || !clientId || !redirectUri || !codeVerifier) {
    throw new ApiKeyServerError('Missing authorization_code token parameters.', 400);
  }
  await validateTokenClientAuthentication(headers, input, clientId);

  const codeHash = tokenDocId(code);
  const snapshot = await collection('oauthAuthorizationCodes').doc(codeHash).get();
  if (!snapshot.exists) {
    throw new ApiKeyServerError('Invalid authorization code.', 400);
  }

  const record = snapshot.data() as OAuthCodeRecord;
  if (record.usedAt) {
    throw new ApiKeyServerError('Authorization code has already been used.', 400);
  }
  if (new Date(record.expiresAt).getTime() <= Date.now()) {
    throw new ApiKeyServerError('Authorization code has expired.', 400);
  }
  if (record.clientId !== clientId || record.redirectUri !== redirectUri || record.resource !== resource) {
    throw new ApiKeyServerError('Authorization code parameters do not match.', 400);
  }
  if (pkceChallengeForVerifier(codeVerifier) !== record.codeChallenge) {
    throw new ApiKeyServerError('Invalid PKCE verifier.', 400);
  }

  await snapshot.ref.update({ usedAt: nowIso() });

  logOAuthEvent('authorization_code_exchanged', {
    clientIdPrefix: clientId.slice(0, 32),
    requestedScope: input.scope || '',
    scope: record.scopes.join(' '),
    requestedResource: input.resource || '',
    resource,
  });

  return createTokenPair({
    clientId: record.clientId,
    resource: record.resource,
    scopes: record.scopes,
    ownerUid: record.ownerUid,
    ownerEmail: record.ownerEmail,
    companyId: record.companyId,
  });
}

async function refreshAccessToken(headers: HeaderBag, input: ParsedTokenBody) {
  const refreshToken = input.refresh_token;
  const clientId = resolveTokenClientId(headers, input);
  const resource = input.resource || getMcpResource(headers);

  if (!refreshToken || !clientId) {
    throw new ApiKeyServerError('Missing refresh_token parameters.', 400);
  }
  await validateTokenClientAuthentication(headers, input, clientId);

  const refreshTokenHash = tokenDocId(refreshToken);
  const snapshot = await collection('oauthRefreshTokens').doc(refreshTokenHash).get();
  if (!snapshot.exists) {
    throw new ApiKeyServerError('Invalid refresh token.', 400);
  }

  const record = snapshot.data() as OAuthRefreshTokenRecord;
  if (record.revokedAt || new Date(record.expiresAt).getTime() <= Date.now()) {
    throw new ApiKeyServerError('Refresh token has expired.', 401);
  }
  if (record.clientId !== clientId || record.resource !== resource) {
    throw new ApiKeyServerError('Refresh token parameters do not match.', 400);
  }
  const grantedScopes = resolveRefreshGrantScopes(input.scope, record.scopes);

  await snapshot.ref.update({ revokedAt: nowIso(), lastUsedAt: nowIso() });

  logOAuthEvent('refresh_token_exchanged', {
    clientIdPrefix: clientId.slice(0, 32),
    requestedScope: input.scope || '',
    scope: grantedScopes.join(' '),
    requestedResource: input.resource || '',
    resource,
  });

  return createTokenPair({
    clientId: record.clientId,
    resource: record.resource,
    scopes: grantedScopes,
    ownerUid: record.ownerUid,
    ownerEmail: record.ownerEmail,
    companyId: record.companyId,
  });
}

export async function handleOAuthTokenRequest(headers: HeaderBag, body: unknown) {
  const input = parseTokenBody(body);
  const grantType = input.grant_type;

  if (grantType === 'authorization_code') {
    return exchangeAuthorizationCode(headers, input);
  }

  if (grantType === 'refresh_token') {
    return refreshAccessToken(headers, input);
  }

  throw new ApiKeyServerError('Unsupported OAuth grant_type.', 400);
}

export async function authorizeOAuthAccessToken(
  headers: HeaderBag,
  requiredScopes: ApiKeyScope[] = [],
): Promise<AuthorizedApiKeyActor> {
  const authorization = getHeaderValue(headers, 'authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();

  if (!token?.startsWith(ACCESS_TOKEN_PREFIX)) {
    throw new ApiKeyServerError('Unauthorized.', 401);
  }

  const tokenHash = tokenDocId(token);
  const snapshot = await collection('oauthAccessTokens').doc(tokenHash).get();
  if (!snapshot.exists) {
    throw new ApiKeyServerError('Unauthorized.', 401);
  }

  const record = snapshot.data() as OAuthAccessTokenRecord;
  if (record.revokedAt || new Date(record.expiresAt).getTime() <= Date.now()) {
    throw new ApiKeyServerError('Unauthorized.', 401);
  }
  if (record.resource !== getMcpResource(headers)) {
    logOAuthEvent('access_token_resource_mismatch', {
      tokenResource: record.resource,
      requestResource: getMcpResource(headers),
      requiredScopes,
    });
    throw new ApiKeyServerError('Unauthorized.', 401);
  }

  const hasScopes = requiredScopes.every((scope) => record.scopes.includes(scope));
  if (!hasScopes) {
    logOAuthEvent('access_token_insufficient_scope', {
      tokenScopes: record.scopes.join(' '),
      requiredScopes: requiredScopes.join(' '),
    });
    throw new ApiKeyServerError('Forbidden.', 403, requiredScopes);
  }

  const ownerSnapshot = await getAdminFirestore().collection('users').doc(record.ownerUid).get();
  if (!ownerSnapshot.exists) {
    throw new ApiKeyServerError('OAuth token owner is no longer available.', 403);
  }

  const ownerProfile = ownerSnapshot.data() as { companyId?: string | null; role?: UserRole };
  const ownerCompanyId =
    typeof ownerProfile.companyId === 'string' && ownerProfile.companyId.trim() ? ownerProfile.companyId : null;
  const ownerRole = ownerProfile.role === 'member' ? 'member' : 'admin';

  if (record.companyId && record.companyId !== ownerCompanyId) {
    logOAuthEvent('access_token_workspace_mismatch', {
      tokenCompanyId: record.companyId,
      ownerCompanyId,
    });
    throw new ApiKeyServerError('OAuth token workspace access is no longer valid.', 403);
  }

  void snapshot.ref.update({ lastUsedAt: nowIso() }).catch(() => {});

  const key: ApiKeyRecord = {
    id: `oauth:${tokenHash.slice(0, 12)}`,
    label: 'ChatGPT OAuth session',
    scopes: record.scopes,
    createdAt: record.createdAt,
    createdBy: record.ownerUid,
    ownerUid: record.ownerUid,
    companyId: record.companyId,
    isActive: true,
    keyLast4: token.slice(-4),
    lastUsedAt: nowIso(),
    revokedAt: null,
  };

  return {
    key,
    companyId: record.companyId,
    ownerUid: record.ownerUid,
    ownerEmail: record.ownerEmail,
    ownerRole,
    ownerCompanyId,
  };
}
