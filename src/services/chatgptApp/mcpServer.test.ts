import assert from 'node:assert/strict';
import { test } from 'node:test';
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
