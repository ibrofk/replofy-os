import { handleApiKeySettingsRequest, ApiKeyServerError } from '../src/services/apiKeyServer.js';

type VercelRequest = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

function sendJson(res: VercelResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Allow', 'GET, POST, DELETE, OPTIONS');
      res.statusCode = 204;
      res.end();
      return;
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const result = await handleApiKeySettingsRequest(req.headers, req.method, body);

    if (req.method === 'POST') {
      sendJson(res, 201, result);
      return;
    }

    sendJson(res, 200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process API key request.';
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
