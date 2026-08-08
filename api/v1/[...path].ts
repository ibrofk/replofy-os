import { ApiKeyServerError } from '../../src/services/apiKeyServer.js';
import { handleExternalApiRequest } from '../../src/services/externalApiServer.js';

type VercelRequest = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  url?: string;
};

type VercelResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

function sendJson(res: VercelResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [name, value] of Object.entries(headers)) {
    res.setHeader(name, value);
  }
  res.end(JSON.stringify(body));
}

function buildUrl(req: VercelRequest) {
  if (typeof req.url === 'string' && req.url.trim()) {
    return req.url;
  }

  const rawPath = req.query?.path;
  const pathSegments = Array.isArray(rawPath) ? rawPath : typeof rawPath === 'string' ? [rawPath] : [];
  const searchParams = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(req.query || {})) {
    if (key === 'path') {
      continue;
    }

    if (Array.isArray(rawValue)) {
      for (const value of rawValue) {
        if (typeof value === 'string') searchParams.append(key, value);
      }
      continue;
    }

    if (typeof rawValue === 'string') {
      searchParams.append(key, rawValue);
    }
  }

  const pathname = `/api/v1/${pathSegments.join('/')}`;
  const suffix = searchParams.toString();
  return suffix ? `${pathname}?${suffix}` : pathname;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Allow', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.statusCode = 204;
      res.end();
      return;
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const result = await handleExternalApiRequest(req.headers, req.method, buildUrl(req), body);
    sendJson(res, result.statusCode, result.body, result.headers);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process API request.';
    const status =
      error instanceof ApiKeyServerError
        ? error.statusCode
        : typeof error === 'object' &&
            error !== null &&
            'statusCode' in error &&
            typeof (error as { statusCode?: unknown }).statusCode === 'number'
          ? (error as { statusCode: number }).statusCode
          : error instanceof SyntaxError
            ? 400
            : 500;
    sendJson(res, status, { error: message });
  }
}
