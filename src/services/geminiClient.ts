import type { IngestionPayload } from './contextIngestionService';
import { auth } from '../firebase';

const GEMINI_ENDPOINT = '/api/gemini';
const REQUEST_PREVIEW_LIMIT = 18_000;

export type GeminiIngestionRequest = {
  content: string;
  fileName: string;
};

type GeminiRateLimitBucket = {
  used: number;
  limit: number;
  resetAt: string;
};

type GeminiIngestionResponse = {
  payload: IngestionPayload;
  usedGemini: boolean;
  model: string;
  rateLimit: {
    requestsPerMinute: GeminiRateLimitBucket;
    tokensPerMinute: GeminiRateLimitBucket;
    requestsPerDay: GeminiRateLimitBucket;
  };
  warning?: string;
};

function truncate(value: string, max = REQUEST_PREVIEW_LIMIT) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isIngestionPayload(value: unknown): value is IngestionPayload {
  return (
    isRecord(value) &&
    isRecord(value.source) &&
    typeof value.source.title === 'string' &&
    Array.isArray(value.source.aliases) &&
    typeof value.source.summary === 'string' &&
    Array.isArray(value.items)
  );
}

function isGeminiIngestionResponse(value: unknown): value is GeminiIngestionResponse {
  return (
    isRecord(value) &&
    isIngestionPayload(value.payload) &&
    typeof value.usedGemini === 'boolean' &&
    typeof value.model === 'string' &&
    isRecord(value.rateLimit)
  );
}

function getErrorMessage(value: unknown, fallback: string) {
  if (isRecord(value) && typeof value.error === 'string' && value.error.trim()) {
    return value.error;
  }

  return fallback;
}

export async function requestGeminiIngestion(params: GeminiIngestionRequest): Promise<GeminiIngestionResponse> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Sign in before using Gemini ingestion.');
  }
  const idToken = await user.getIdToken();

  const response = await fetch(GEMINI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      content: truncate(params.content),
      fileName: params.fileName,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getErrorMessage(data, `Gemini request failed (${response.status})`));
  }

  if (!isGeminiIngestionResponse(data)) {
    throw new Error('Invalid Gemini API response.');
  }

  if (!data.usedGemini && data.warning) {
    console.warn(data.warning);
  }

  return data;
}
