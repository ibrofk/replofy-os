import { handleReplofyMcpRequest } from '../src/services/chatgptApp/mcpServer.js';

type VercelRequest = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  url?: string;
  on?: (...args: any[]) => unknown;
};

type VercelResponse = {
  headersSent?: boolean;
  setHeader: (name: string, value: string) => void;
  writeHead: (status: number, headers?: Record<string, string>) => VercelResponse;
  end: (body?: string) => void;
  on?: (...args: any[]) => unknown;
};

function buildUrl(req: VercelRequest) {
  if (typeof req.url === 'string' && req.url.trim()) {
    return req.url;
  }

  const searchParams = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(req.query || {})) {
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

  const suffix = searchParams.toString();
  return suffix ? `/mcp?${suffix}` : '/mcp';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  await handleReplofyMcpRequest(
    {
      method: req.method,
      headers: req.headers,
      url: buildUrl(req),
      on: req.on?.bind(req),
    },
    res,
    body,
  );
}
