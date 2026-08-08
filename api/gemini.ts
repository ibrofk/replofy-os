import { getGeminiRateLimitSnapshot, handleGeminiIngestionRequest } from '../src/services/geminiServer.js';
import { authorizeFirebaseUserFromHeaders } from '../src/services/apiKeyServer.js';

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
    await authorizeFirebaseUserFromHeaders(req.headers);

    if (req.method === 'GET') {
      sendJson(res, 200, {
        ok: true,
        model: 'gemini-3.1-flash-lite-preview',
        rateLimit: getGeminiRateLimitSnapshot(),
      });
      return;
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const result = await handleGeminiIngestionRequest(body);
    sendJson(res, 200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process Gemini request.';
    const status =
      typeof error === 'object' &&
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
