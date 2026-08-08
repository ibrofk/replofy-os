import { ApiKeyServerError } from '../../src/services/apiKeyServer.js';

export type VercelRequest = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  url?: string;
};

export type VercelResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

export function sendJson(res: VercelResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [name, value] of Object.entries(headers)) {
    res.setHeader(name, value);
  }
  res.end(JSON.stringify(body));
}

export function sendOAuthError(res: VercelResponse, error: unknown) {
  const status =
    error instanceof ApiKeyServerError
      ? error.statusCode
      : error instanceof SyntaxError
        ? 400
        : 500;
  const message = error instanceof Error ? error.message : 'OAuth request failed.';
  sendJson(res, status, {
    error: status === 500 ? 'server_error' : 'invalid_request',
    error_description: message,
  });
}

export function parseBody(req: VercelRequest) {
  if (typeof req.body === 'string') {
    const contentType = Object.entries(req.headers || {}).find(([key]) => key.toLowerCase() === 'content-type')?.[1];
    const normalizedContentType = Array.isArray(contentType) ? contentType[0] : contentType;
    if (normalizedContentType?.includes('application/x-www-form-urlencoded')) {
      return Object.fromEntries(new URLSearchParams(req.body));
    }
    return JSON.parse(req.body);
  }

  return req.body || {};
}
