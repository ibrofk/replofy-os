import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiKeyServerError } from '../apiKeyServer.js';
import { handleExternalApiRequest } from '../externalApiServer.js';
import { handleReplofyMcpRequest } from './mcpServer.js';

type CapturedResponse = {
  status: number | null;
  headers: Record<string, string>;
  body: string;
  headersSent: boolean;
  setHeader: (name: string, value: string) => void;
  writeHead: (status: number, headers?: Record<string, string>) => CapturedResponse;
  end: (body?: string) => CapturedResponse;
};

function createResponse(): CapturedResponse {
  const response: CapturedResponse = {
    status: null,
    headers: {},
    body: '',
    headersSent: false,
    setHeader(name, value) {
      response.headers[name.toLowerCase()] = value;
    },
    writeHead(status, headers = {}) {
      response.status = status;
      response.headersSent = true;
      for (const [name, value] of Object.entries(headers)) {
        response.headers[name.toLowerCase()] = value;
      }
      return response;
    },
    end(body = '') {
      response.body += body;
      return response;
    },
  };
  return response;
}

test('hosted MCP health and OAuth metadata are reachable without credentials', async () => {
  const health = createResponse();
  await handleReplofyMcpRequest({ method: 'GET', url: '/mcp/health', headers: { host: 'localhost' } }, health);
  assert.equal(health.status, 200);
  assert.deepEqual(JSON.parse(health.body), { ok: true, service: 'replofy-os-mcp' });

  const metadata = createResponse();
  await handleReplofyMcpRequest(
    { method: 'GET', url: '/mcp/.well-known/oauth-protected-resource', headers: { host: 'localhost' } },
    metadata,
  );
  assert.equal(metadata.status, 200);
  const metadataBody = JSON.parse(metadata.body) as { resource?: string; authorization_servers?: string[] };
  assert.equal(metadataBody.resource, 'http://localhost/mcp');
  assert.deepEqual(metadataBody.authorization_servers, ['http://localhost']);

  const blockedOrigin = createResponse();
  await handleReplofyMcpRequest(
    { method: 'GET', url: '/mcp/health', headers: { host: 'localhost', origin: 'https://evil.example' } },
    blockedOrigin,
  );
  assert.equal(blockedOrigin.headers['access-control-allow-origin'], undefined);

  const allowedOrigin = createResponse();
  await handleReplofyMcpRequest(
    { method: 'GET', url: '/mcp/health', headers: { host: 'localhost', origin: 'https://chatgpt.com' } },
    allowedOrigin,
  );
  assert.equal(allowedOrigin.headers['access-control-allow-origin'], 'https://chatgpt.com');
});

test('hosted MCP tools/list exposes the connector contract without making an API call', async () => {
  const previousAuthMode = process.env.REPLOFY_CHATGPT_APP_AUTH_MODE;
  delete process.env.REPLOFY_CHATGPT_APP_AUTH_MODE;
  try {
    const response = createResponse();
    await handleReplofyMcpRequest(
      { method: 'POST', url: '/mcp', headers: { host: 'localhost' } },
      response,
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
    );

    assert.equal(response.status, 200);
    const payload = JSON.parse(response.body) as {
      result?: {
        tools?: Array<{
          name?: string;
          securitySchemes?: unknown;
          _meta?: { securitySchemes?: unknown };
        }>;
      };
    };
    const tools = payload.result?.tools || [];
    assert.ok(tools.some((tool) => tool.name === 'server_status'));
    const workspaceTool = tools.find((tool) => tool.name === 'get_workspace_context');
    assert.ok(workspaceTool);
    assert.ok(workspaceTool.securitySchemes || workspaceTool._meta?.securitySchemes);
  } finally {
    if (previousAuthMode === undefined) delete process.env.REPLOFY_CHATGPT_APP_AUTH_MODE;
    else process.env.REPLOFY_CHATGPT_APP_AUTH_MODE = previousAuthMode;
  }
});

test('hosted MCP rejects every API-key management path before routing', async () => {
  for (const [method, path] of [
    ['POST', '/api/v1/api-keys'],
    ['GET', '/api/v1/api-keys'],
    ['DELETE', '/api/v1/api-keys/key-1'],
  ] as const) {
    await assert.rejects(
      () => handleExternalApiRequest({}, method, path, { label: 'not allowed' }),
      (error: unknown) => error instanceof ApiKeyServerError
        && error.statusCode === 403
        && error.message === 'API key management is prohibited through MCP.',
    );
  }
});

test('hosted MCP does not silently use a server API key without explicit fallback opt-in', async () => {
  const previousAuthMode = process.env.REPLOFY_CHATGPT_APP_AUTH_MODE;
  const previousApiKey = process.env.REPLOFY_CHATGPT_APP_API_KEY;
  const previousFallback = process.env.REPLOFY_CHATGPT_APP_API_KEY_FALLBACK;
  process.env.REPLOFY_CHATGPT_APP_AUTH_MODE = 'api-key';
  process.env.REPLOFY_CHATGPT_APP_API_KEY = 'rpo_local_test-key';
  delete process.env.REPLOFY_CHATGPT_APP_API_KEY_FALLBACK;
  try {
    const response = createResponse();
    await handleReplofyMcpRequest(
      { method: 'POST', url: '/mcp', headers: { host: 'localhost' } },
      response,
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'server_status', arguments: {} } },
    );
    assert.equal(response.status, 200);
    assert.match(response.body, /no API credential is configured/i);
  } finally {
    if (previousAuthMode === undefined) delete process.env.REPLOFY_CHATGPT_APP_AUTH_MODE;
    else process.env.REPLOFY_CHATGPT_APP_AUTH_MODE = previousAuthMode;
    if (previousApiKey === undefined) delete process.env.REPLOFY_CHATGPT_APP_API_KEY;
    else process.env.REPLOFY_CHATGPT_APP_API_KEY = previousApiKey;
    if (previousFallback === undefined) delete process.env.REPLOFY_CHATGPT_APP_API_KEY_FALLBACK;
    else process.env.REPLOFY_CHATGPT_APP_API_KEY_FALLBACK = previousFallback;
  }
});
