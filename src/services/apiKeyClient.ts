import { auth } from '../firebase';
import type { ApiKeyCreateResponse, ApiKeyListResponse, ApiKeyRevokeResponse, ApiKeyScope } from '../types';

const API_KEY_ENDPOINT = '/api/api-keys';

type ApiKeyPayload = {
  label: string;
  scopes: ApiKeyScope[];
};

type ApiKeyDeletePayload = {
  keyId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getErrorMessage(value: unknown, fallback: string) {
  if (isRecord(value) && typeof value.error === 'string' && value.error.trim()) {
    return value.error;
  }

  return fallback;
}

async function getAuthHeaders() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in to manage API keys.');
  }

  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function requestJson<T>(method: 'GET' | 'POST' | 'DELETE', body?: unknown): Promise<T> {
  const response = await fetch(API_KEY_ENDPOINT, {
    method,
    headers: await getAuthHeaders(),
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getErrorMessage(data, `API key request failed (${response.status})`));
  }

  return data as T;
}

export async function fetchApiKeys(): Promise<ApiKeyListResponse> {
  return requestJson<ApiKeyListResponse>('GET');
}

export async function createApiKey(payload: ApiKeyPayload): Promise<ApiKeyCreateResponse> {
  return requestJson<ApiKeyCreateResponse>('POST', payload);
}

export async function revokeApiKey(payload: ApiKeyDeletePayload): Promise<ApiKeyRevokeResponse> {
  return requestJson<ApiKeyRevokeResponse>('DELETE', payload);
}
