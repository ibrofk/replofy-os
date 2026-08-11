import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod/v4';
import { ApiKeyServerError } from '../apiKeyServer.js';
import { handleExternalApiRequest } from '../externalApiServer.js';
import {
  authorizeOAuthAccessToken,
  buildMcpWwwAuthenticate,
  CHATGPT_OAUTH_SCOPES,
  getAuthorizationServerMetadata,
  getMcpResource,
  getOAuthIssuer,
  getProtectedResourceMetadata,
} from './oauthServer.js';
import { REPLOFY_WIDGET_URI, replofyWidgetHtml } from './widgetHtml.js';
import type { ApiKeyScope } from '../../types.js';

type HeaderBag = Record<string, string | string[] | undefined> | undefined;

type McpHttpRequest = {
  method?: string;
  headers?: HeaderBag;
  url?: string;
  on?: (...args: any[]) => unknown;
};

type McpHttpResponse = {
  headersSent?: boolean;
  setHeader: (name: string, value: string) => void;
  writeHead: (status: number, headers?: Record<string, string>) => McpHttpResponse;
  end: (body?: string) => void;
  on?: (...args: any[]) => unknown;
};

type ReplofyApiResult = {
  data?: unknown;
  count?: number;
  [key: string]: unknown;
};

type WorkspaceContext = {
  generatedAt: string;
  scope: string;
  counts: {
    activeGoals: number;
    openTasks: number;
    openBugs: number;
    roadmapItems: number;
    blogArticles: number;
    creativeItems: number;
    openLeads: number;
    accounts: number;
    followUpsDue: number;
  };
  activeGoals: unknown[];
  openTasks: unknown[];
  openBugs: unknown[];
  roadmapItems: unknown[];
  blogArticles: unknown[];
  creativeItems: unknown[];
  openLeads: unknown[];
  accounts: unknown[];
  followUpsDue: unknown[];
};

const MCP_PATH = '/mcp';
const CHATGPT_API_KEY_ENV = 'REPLOFY_CHATGPT_APP_API_KEY';
const CHATGPT_API_KEY_FALLBACK_ENV = 'REPLOFY_CHATGPT_APP_API_KEY_FALLBACK';
type ChatGptAuthMode = 'oauth' | 'api-key' | 'hybrid' | 'unset';
const WORKSPACE_READ_SCOPES: ApiKeyScope[] = ['workspace:read'];
const WORKSPACE_WRITE_SCOPES: ApiKeyScope[] = ['workspace:write'];
const SYSTEMS_READ_SCOPES: ApiKeyScope[] = ['systems:read'];
const SYSTEMS_WRITE_SCOPES: ApiKeyScope[] = ['systems:write'];
const ROUTABLE_RESOURCES = [
  'tasks',
  'bugs',
  'roadmap-items',
  'blog-articles',
  'business-plans',
  'visions',
  'cycle-goals',
  'prompts',
  'api-endpoints',
  'environments',
  'social-posts',
  'seo-keywords',
  'feedbacks',
  'accounts',
  'leads',
  'time-blocks',
  'operator-desks',
  'work-orders',
  'operator-context-packs',
  'operator-memories',
  'operator-checkins',
  'operator-outputs',
  'operator-injections',
  'operator-approvals',
  'context-sources',
  'context-source-versions',
  'users',
  'companies',
  'invitations',
] as const;
const READ_ONLY_ANNOTATIONS = {
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
  readOnlyHint: true,
};
const NON_DESTRUCTIVE_WRITE_ANNOTATIONS = {
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
  readOnlyHint: false,
};
const BLOG_STATUS_SCHEMA = z.enum(['idea', 'planned', 'researching', 'drafting', 'review', 'scheduled', 'published', 'archived', 'rejected']);
const BLOG_ROADMAP_PHASE_SCHEMA = z.enum(['now', 'next', 'later']);
const BLOG_PRIORITY_SCHEMA = z.enum(['low', 'medium', 'high']);
const OPERATOR_DESK_TYPE_SCHEMA = z.enum(['ops', 'content', 'creative', 'bug', 'feature', 'research', 'growth', 'feedback']);
const OPERATOR_DESK_STATUS_SCHEMA = z.enum(['active', 'paused', 'archived']);
const OPERATOR_CHECK_FREQUENCY_SCHEMA = z.enum(['manual', 'daily', 'weekly', 'monthly', 'event']);
const OPERATOR_APPROVAL_MODE_SCHEMA = z.enum(['action_based', 'draft_only', 'propose_injection', 'approve_before_write', 'safe_auto_write']);
const OPERATOR_MEMORY_SCOPE_SCHEMA = z.enum(['global', 'operator', 'hub', 'goal', 'artifact', 'work_order', 'checkin']);
const OPERATOR_MEMORY_TYPE_SCHEMA = z.enum(['fact', 'preference', 'decision', 'style', 'constraint', 'lesson', 'avoid', 'source_note', 'workflow_rule']);
const OPERATOR_MEMORY_CONFIDENCE_SCHEMA = z.enum(['low', 'medium', 'high']);
const BUG_CODE_LINK_SCHEMA = z.object({
  type: z.enum(['repository', 'directory']).default('directory'),
  url: z.string().min(1).max(1000),
  label: z.string().max(160).optional(),
  notes: z.string().max(1000).optional(),
});
const BLOG_BRIEF_SCHEMA = z.object({
  audience: z.string().optional(),
  painPoint: z.string().optional(),
  buyingTrigger: z.string().optional(),
  brokenBelief: z.string().optional(),
  replofyAngle: z.string().optional(),
  thesis: z.string().optional(),
  cta: z.string().optional(),
  contentCluster: z.string().optional(),
});
const BLOG_EVIDENCE_SCHEMA = z.object({
  id: z.string().optional(),
  claim: z.string().min(1),
  value: z.string().optional(),
  sourceId: z.string().optional(),
  sourceUrl: z.string().optional(),
  quote: z.string().optional(),
  confidence: z.enum(['unverified', 'supported', 'verified']).default('unverified'),
  usedInDraft: z.boolean().default(false),
});
const BLOG_DISTRIBUTION_SCHEMA = z.object({
  seoTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  primaryKeyword: z.string().optional(),
  channels: z.array(z.string()).optional(),
  publicationUrl: z.string().optional(),
});

const TOOL_AUTH_SCOPES: Record<string, ApiKeyScope[]> = {
  open_workspace_panel: WORKSPACE_READ_SCOPES,
  get_workspace_context: WORKSPACE_READ_SCOPES,
  get_workspace_object: WORKSPACE_READ_SCOPES,
  list_operator_desks: WORKSPACE_READ_SCOPES,
  get_operator_desk: WORKSPACE_READ_SCOPES,
  create_operator_desk: WORKSPACE_WRITE_SCOPES,
  update_operator_desk: WORKSPACE_WRITE_SCOPES,
  archive_operator_desk: WORKSPACE_WRITE_SCOPES,
  restore_operator_desk: WORKSPACE_WRITE_SCOPES,
  get_operator_manifest: WORKSPACE_READ_SCOPES,
  list_ready_work_orders: WORKSPACE_READ_SCOPES,
  get_work_order: WORKSPACE_READ_SCOPES,
  get_context_pack: WORKSPACE_READ_SCOPES,
  list_operator_memory: WORKSPACE_READ_SCOPES,
  list_recent_operator_outputs: WORKSPACE_READ_SCOPES,
  claim_work_order: WORKSPACE_WRITE_SCOPES,
  release_work_order: WORKSPACE_WRITE_SCOPES,
  submit_agent_checkin: WORKSPACE_WRITE_SCOPES,
  submit_operator_output: WORKSPACE_WRITE_SCOPES,
  create_operator_memory: WORKSPACE_WRITE_SCOPES,
  update_operator_memory: WORKSPACE_WRITE_SCOPES,
  archive_operator_memory: WORKSPACE_WRITE_SCOPES,
  restore_operator_memory: WORKSPACE_WRITE_SCOPES,
  create_operator_memory_suggestion: WORKSPACE_WRITE_SCOPES,
  approve_operator_memory_suggestion: WORKSPACE_WRITE_SCOPES,
  reject_operator_memory_suggestion: WORKSPACE_WRITE_SCOPES,
  list_pending_operator_approvals: WORKSPACE_READ_SCOPES,
  list_operator_mcp_registry: WORKSPACE_READ_SCOPES,
  list_tasks: WORKSPACE_READ_SCOPES,
  list_leads: WORKSPACE_READ_SCOPES,
  list_accounts: WORKSPACE_READ_SCOPES,
  list_bugs: WORKSPACE_READ_SCOPES,
  list_roadmap_items: WORKSPACE_READ_SCOPES,
  list_blog_articles: WORKSPACE_READ_SCOPES,
  list_creative_items: WORKSPACE_READ_SCOPES,
  list_creative_assets: WORKSPACE_READ_SCOPES,
  download_creative_asset: WORKSPACE_READ_SCOPES,
  list_team_chat_channels: WORKSPACE_READ_SCOPES,
  list_team_chat_participants: WORKSPACE_READ_SCOPES,
  list_team_chat_messages: WORKSPACE_READ_SCOPES,
  get_weekly_changelog: WORKSPACE_READ_SCOPES,
  create_task: WORKSPACE_WRITE_SCOPES,
  create_lead: WORKSPACE_WRITE_SCOPES,
  update_lead: WORKSPACE_WRITE_SCOPES,
  create_account: WORKSPACE_WRITE_SCOPES,
  update_account: WORKSPACE_WRITE_SCOPES,
  update_task_status: WORKSPACE_WRITE_SCOPES,
  triage_bug: WORKSPACE_WRITE_SCOPES,
  create_cycle_goal: WORKSPACE_WRITE_SCOPES,
  create_creative_item: WORKSPACE_WRITE_SCOPES,
  update_creative_item: WORKSPACE_WRITE_SCOPES,
  create_blog_article: WORKSPACE_WRITE_SCOPES,
  update_blog_article: WORKSPACE_WRITE_SCOPES,
  create_team_chat_channel: WORKSPACE_WRITE_SCOPES,
  register_team_chat_participant: WORKSPACE_WRITE_SCOPES,
  rename_team_chat_participant: WORKSPACE_WRITE_SCOPES,
  add_team_chat_participant_to_channel: WORKSPACE_WRITE_SCOPES,
  post_team_chat_message: WORKSPACE_WRITE_SCOPES,
  extract_context_document: SYSTEMS_READ_SCOPES,
  ingest_context_document: SYSTEMS_WRITE_SCOPES,
};

function getChatGptAuthMode(): ChatGptAuthMode {
  const value = process.env.REPLOFY_CHATGPT_APP_AUTH_MODE?.trim().toLowerCase();
  if (value === 'oauth' || value === 'api-key' || value === 'hybrid') return value;
  return 'unset';
}

function isOAuthMode() {
  return getChatGptAuthMode() === 'oauth';
}

function isHybridAuthMode() {
  return getChatGptAuthMode() === 'hybrid';
}

function allowsServerApiKeyFallback() {
  const explicitFallback = process.env[CHATGPT_API_KEY_FALLBACK_ENV]?.trim().toLowerCase();
  return explicitFallback === 'true' || explicitFallback === '1' || explicitFallback === 'yes';
}

function logMcpAuthEvent(event: string, details: Record<string, unknown>) {
  console.info(`[replofy-os][chatgpt-mcp] ${event}`, JSON.stringify(details));
}

function oauthSecurity(scopes: ApiKeyScope[]) {
  return [{ type: 'oauth2', scopes }];
}

function scopesForOAuthPrompt(scopes: ApiKeyScope[]) {
  if (isOAuthMode() && scopes.length > 0) {
    return CHATGPT_OAUTH_SCOPES;
  }

  return scopes;
}

function toolConfig<T extends Record<string, unknown>>(config: T, scopes: ApiKeyScope[] = []): T {
  const meta = config._meta && typeof config._meta === 'object' ? (config._meta as Record<string, unknown>) : {};
  const advertisedScopes = allowsServerApiKeyFallback() && process.env[CHATGPT_API_KEY_ENV]?.trim()
    ? []
    : scopesForOAuthPrompt(scopes);

  if (advertisedScopes.length === 0) {
    const securitySchemes = [{ type: 'noauth' }];
    return {
      ...config,
      securitySchemes,
      _meta: {
        ...meta,
        securitySchemes,
      },
    } as T;
  }

  const securitySchemes = oauthSecurity(advertisedScopes);

  return {
    ...config,
    securitySchemes,
    _meta: {
      ...meta,
      securitySchemes,
    },
  } as T;
}

function getHeaderValue(headers: HeaderBag, name: string) {
  if (!headers) return undefined;
  const directValue = headers[name.toLowerCase()];
  if (Array.isArray(directValue)) return directValue[0];
  if (typeof directValue === 'string') return directValue;

  const headerKey = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
  if (!headerKey) return undefined;

  const value = headers[headerKey];
  return Array.isArray(value) ? value[0] : value;
}

function buildToolHeaders(headers: HeaderBag): Record<string, string | string[] | undefined> {
  const nextHeaders: Record<string, string | string[] | undefined> = { ...(headers || {}) };
  const hasRequestCredential = Boolean(getHeaderValue(nextHeaders, 'authorization') || getHeaderValue(nextHeaders, 'x-api-key'));
  const serverKey = process.env[CHATGPT_API_KEY_ENV]?.trim();

  if (!hasRequestCredential && serverKey && allowsServerApiKeyFallback()) {
    nextHeaders['x-api-key'] = serverKey;
  }

  return nextHeaders;
}

function mcpRequestId(body: unknown) {
  if (body && typeof body === 'object' && 'id' in body) {
    return (body as { id?: string | number | null }).id ?? null;
  }

  return null;
}

function getMcpResourceUri(body: unknown) {
  if (
    body &&
    typeof body === 'object' &&
    'params' in body &&
    typeof (body as { params?: unknown }).params === 'object' &&
    (body as { params?: Record<string, unknown> }).params &&
    typeof (body as { params: Record<string, unknown> }).params.uri === 'string'
  ) {
    return (body as { params: { uri: string } }).params.uri;
  }

  return undefined;
}

function isPublicWidgetTemplateRequest(rpcMethod: string, body: unknown) {
  return rpcMethod === 'resources/read' && getMcpResourceUri(body) === REPLOFY_WIDGET_URI;
}

function shouldEnforceTransportAuth(rpcMethod: string, body: unknown) {
  if (isPublicWidgetTemplateRequest(rpcMethod, body)) return false;

  const discoveryMethods = new Set([
    'initialize',
    'notifications/initialized',
    'ping',
    'tools/list',
    'resources/list',
    'resources/templates/list',
    'prompts/list',
  ]);

  if (discoveryMethods.has(rpcMethod)) return false;

  // Apps SDK OAuth is triggered for tools through _meta["mcp/www_authenticate"].
  // Let tool handlers run so ChatGPT receives the tool-level challenge.
  if (rpcMethod === 'tools/call') return false;

  return true;
}

function authScopesForRequest(rpcMethod: string, toolName?: string): ApiKeyScope[] {
  if (rpcMethod === 'tools/call' && toolName && TOOL_AUTH_SCOPES[toolName]?.length) {
    return TOOL_AUTH_SCOPES[toolName];
  }

  return CHATGPT_OAUTH_SCOPES;
}

async function enforceMcpResourceAuth(req: McpHttpRequest, res: McpHttpResponse, body: unknown, requiredScopes: ApiKeyScope[]) {
  try {
    await authorizeOAuthAccessToken(req.headers, []);
    return true;
  } catch (error) {
    const challenge = buildMcpWwwAuthenticate(
      req.headers,
      'invalid_token',
      'Sign in to Replofy OS to continue.',
      requiredScopes,
    );

    logMcpAuthEvent('resource_auth_challenge', {
      requiredScopes: requiredScopes.join(' '),
      hasAuthorization: Boolean(getHeaderValue(req.headers, 'authorization')),
      statusCode: error instanceof ApiKeyServerError ? error.statusCode : 401,
    });

    res.setHeader('WWW-Authenticate', challenge);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(401).end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Authentication required.',
          data: {
            scope: requiredScopes.join(' '),
          },
        },
        id: mcpRequestId(body),
      }),
    );
    return false;
  }
}

function toDataArray(result: ReplofyApiResult) {
  return Array.isArray(result.data) ? result.data : [];
}

async function addRelatedContextToList(
  headers: HeaderBag,
  resource: (typeof ROUTABLE_RESOURCES)[number],
  result: ReplofyApiResult,
) {
  const data = toDataArray(result);
  const routed = await Promise.all(
    data.slice(0, 10).map(async (record) => {
      if (!record || typeof record !== 'object' || !('id' in record) || typeof record.id !== 'string') {
        return record;
      }
      try {
        const context = await callReplofyApi(
          headers,
          'GET',
          `/api/v1/context-routing/${encodeURIComponent(resource)}/${encodeURIComponent(record.id)}`,
        );
        return {
          ...record,
          relatedContext: context.relatedContext,
          routing: context.routing,
        };
      } catch {
        return record;
      }
    }),
  );
  return {
    ...result,
    data: [...routed, ...data.slice(10)],
    contextRouting: {
      enrichedCount: routed.length,
      limit: 10,
    },
  };
}

function summarizeError(error: unknown) {
  if (error instanceof ApiKeyServerError) {
    return `${error.statusCode}: ${error.message}`;
  }

  return error instanceof Error ? error.message : 'The Replofy OS request failed.';
}

function textResult(message: string, structuredContent?: Record<string, unknown>, isError = false) {
  return {
    content: [{ type: 'text' as const, text: message }],
    structuredContent,
    isError,
  };
}

function toolError(error: unknown, headers?: HeaderBag, scopes: ApiKeyScope[] = []) {
  const result = textResult(summarizeError(error), undefined, true);
  if (isOAuthMode() && error instanceof ApiKeyServerError && (error.statusCode === 401 || error.statusCode === 403)) {
    const requiredScopes = error.statusCode === 403 ? error.requiredScopes ?? scopes : scopes;
    const challengeError = error.statusCode === 403 ? 'insufficient_scope' : 'invalid_token';
    const challenge = buildMcpWwwAuthenticate(
      headers,
      challengeError,
      error.statusCode === 403 ? 'Additional Replofy OS scopes are required.' : 'Sign in to Replofy OS to continue.',
      requiredScopes,
    );

    logMcpAuthEvent('tool_auth_challenge', {
      statusCode: error.statusCode,
      requiredScopes: requiredScopes.join(' '),
      hasAuthorization: Boolean(getHeaderValue(headers, 'authorization')),
      challengeError,
    });

    return {
      ...result,
      _meta: {
        'mcp/www_authenticate': [challenge],
      },
    };
  }

  return result;
}

async function callReplofyApi(
  headers: HeaderBag,
  method: string,
  path: string,
  body: unknown = {},
): Promise<ReplofyApiResult> {
  const result = await handleExternalApiRequest(buildToolHeaders(headers), method, path, body);
  return result.body as ReplofyApiResult;
}

async function buildWorkspaceContext(headers: HeaderBag, scope: string): Promise<WorkspaceContext> {
  const [goals, tasks, bugs, roadmapItems, blogArticles, creativeItems, leads, accounts] = await Promise.all([
    callReplofyApi(headers, 'GET', '/api/v1/cycle-goals?status=active&limit=12'),
    callReplofyApi(headers, 'GET', '/api/v1/tasks?status=todo&status=in-progress&limit=20'),
    callReplofyApi(headers, 'GET', '/api/v1/bugs?status=open&status=triaged&status=in-progress&status=blocked&limit=20'),
    callReplofyApi(headers, 'GET', '/api/v1/roadmap-items?limit=12'),
    callReplofyApi(headers, 'GET', `/api/v1/blog-articles?limit=${scope === 'content' ? '30' : '10'}`),
    callReplofyApi(headers, 'GET', `/api/v1/creative-items?limit=${scope === 'content' ? '25' : '12'}`),
    callReplofyApi(headers, 'GET', '/api/v1/leads?limit=50'),
    callReplofyApi(headers, 'GET', '/api/v1/accounts?limit=20'),
  ]);

  const activeGoals = toDataArray(goals);
  const openTasks = toDataArray(tasks);
  const openBugs = toDataArray(bugs);
  const roadmap = toDataArray(roadmapItems);
  const blogs = toDataArray(blogArticles);
  const creatives = toDataArray(creativeItems);
  const allLeads = toDataArray(leads) as Array<Record<string, unknown>>;
  const openLeads = allLeads.filter((lead) => lead.stage !== 'won' && lead.stage !== 'lost').slice(0, 20);
  const now = Date.now();
  const followUpsDue = openLeads.filter((lead) => {
    const value = typeof lead.nextActionAt === 'string' ? lead.nextActionAt : '';
    return value && Date.parse(value) <= now;
  });
  const accountRows = toDataArray(accounts);

  return {
    generatedAt: new Date().toISOString(),
    scope,
    counts: {
      activeGoals: activeGoals.length,
      openTasks: openTasks.length,
      openBugs: openBugs.length,
      roadmapItems: roadmap.length,
      blogArticles: blogs.length,
      creativeItems: creatives.length,
      openLeads: openLeads.length,
      accounts: accountRows.length,
      followUpsDue: followUpsDue.length,
    },
    activeGoals,
    openTasks,
    openBugs,
    roadmapItems: roadmap,
    blogArticles: blogs,
    creativeItems: creatives,
    openLeads,
    accounts: accountRows,
    followUpsDue,
  };
}

function getAuthMode(headers: HeaderBag) {
  const authorization = getHeaderValue(headers, 'authorization');
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer?.startsWith('roa_')) return 'oauth';
  if (authorization) return 'authorization-header';
  if (getHeaderValue(headers, 'x-api-key')) return 'x-api-key-header';
  if (process.env[CHATGPT_API_KEY_ENV]?.trim() && allowsServerApiKeyFallback()) return isHybridAuthMode() ? 'hybrid-server-env-key' : 'server-env-key';
  if (isOAuthMode()) return 'oauth-required';
  return 'missing';
}

export function createReplofyChatGptMcpServer(headers: HeaderBag = {}) {
  const server = new McpServer(
    {
      name: 'Replofy OS',
      version: '0.1.0',
    },
    {
      capabilities: {
        logging: {},
      },
    },
  );

  registerAppResource(
    server,
    'Replofy OS Workspace Panel',
    REPLOFY_WIDGET_URI,
    {
      description: 'Operational Replofy OS workspace panel for ChatGPT.',
    },
    async () => ({
      contents: [
        {
          uri: REPLOFY_WIDGET_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: replofyWidgetHtml,
          _meta: {
            ui: {
              prefersBorder: true,
              domain: process.env.REPLOFY_CHATGPT_APP_WIDGET_DOMAIN || getOAuthIssuer(headers),
              csp: {},
            },
          },
        },
      ],
    }),
  );

  registerAppResource(
    server,
    'Replofy OS Workspace Resources',
    'replofy://workspace/resources',
    {
      description: 'Discover the main Replofy OS workspace resources exposed by the ChatGPT app.',
    },
    async () => ({
      contents: [
        {
          uri: 'replofy://workspace/resources',
          mimeType: RESOURCE_MIME_TYPE,
          text: JSON.stringify(
            {
              title: 'Replofy OS Workspace Resources',
              description:
                'Desk operations, work orders, memories, approvals, and workspace collections available through the ChatGPT app.',
              resources: [
                'replofy://workspace/operator-desks',
                'replofy://workspace/work-orders',
                'replofy://workspace/operator-memories',
                'replofy://workspace/operator-approvals',
                'replofy://workspace/mcp-registry',
                'replofy://workspace/weekly-changelog',
                'replofy://workspace/tasks',
                'replofy://workspace/leads',
                'replofy://workspace/accounts',
                'replofy://workspace/bugs',
                'replofy://workspace/roadmap-items',
                'replofy://workspace/blog-articles',
                'replofy://workspace/creative-items',
                'replofy://workspace/creative-assets',
                'replofy://workspace/team-chat',
              ],
            },
            null,
            2,
          ),
          _meta: {
            ui: {
              prefersBorder: false,
              domain: process.env.REPLOFY_CHATGPT_APP_WIDGET_DOMAIN || getOAuthIssuer(headers),
              csp: {},
            },
          },
        },
      ],
    }),
  );

  const registerJsonResource = (
    resourceUri: string,
    title: string,
    description: string,
    loader: (headers: HeaderBag) => Promise<unknown>,
  ) => {
    registerAppResource(
      server,
      title,
      resourceUri,
      { description },
      async () => ({
        contents: [
          {
            uri: resourceUri,
            mimeType: RESOURCE_MIME_TYPE,
            text: JSON.stringify(await loader(headers), null, 2),
            _meta: {
              ui: {
                prefersBorder: true,
                domain: process.env.REPLOFY_CHATGPT_APP_WIDGET_DOMAIN || getOAuthIssuer(headers),
                csp: {},
              },
            },
          },
        ],
      }),
    );
  };

  registerJsonResource('replofy://workspace/operator-desks', 'Operator desks', 'List desk operations used by the operator runtime.', async (requestHeaders) => {
    const result = await callReplofyApi(requestHeaders, 'GET', '/api/v1/operator-desks?limit=50');
    return {
      resource: 'operator-desks',
      count: result.count ?? toDataArray(result).length,
      data: result,
    };
  });

  registerJsonResource('replofy://workspace/work-orders', 'Work orders', 'List ready work orders for operator desks.', async (requestHeaders) => {
    const result = await callReplofyApi(requestHeaders, 'GET', '/api/v1/work-orders?limit=50');
    return {
      resource: 'work-orders',
      count: result.count ?? toDataArray(result).length,
      data: result,
    };
  });

  registerJsonResource('replofy://workspace/operator-memories', 'Operator memories', 'List operator memory records.', async (requestHeaders) => {
    const result = await callReplofyApi(requestHeaders, 'GET', '/api/v1/operator-memories?limit=50');
    return {
      resource: 'operator-memories',
      count: result.count ?? toDataArray(result).length,
      data: result,
    };
  });

  registerJsonResource('replofy://workspace/operator-approvals', 'Operator approvals', 'List pending operator approvals.', async (requestHeaders) => {
    const result = await callReplofyApi(requestHeaders, 'GET', '/api/v1/operator-approvals?limit=50');
    return {
      resource: 'operator-approvals',
      count: result.count ?? toDataArray(result).length,
      data: result,
    };
  });

  registerJsonResource('replofy://workspace/mcp-registry', 'MCP registry', 'List MCP registry entries used for workspace routing.', async (requestHeaders) => {
    const result = await callReplofyApi(requestHeaders, 'GET', '/api/v1/mcp-registry?limit=50');
    return {
      resource: 'mcp-registry',
      count: result.count ?? toDataArray(result).length,
      data: result,
    };
  });

  registerJsonResource('replofy://workspace/weekly-changelog', 'Weekly changelog', 'Read the current weekly changelog summary.', async (requestHeaders) => {
    const result = await callReplofyApi(requestHeaders, 'GET', '/api/v1/reports/changelog?week=current');
    return {
      resource: 'weekly-changelog',
      data: result,
    };
  });

  registerAppTool(
    server,
    'open_workspace_panel',
    toolConfig({
      title: 'Open Replofy workspace panel',
      description: 'Render an interactive Replofy OS workspace panel inside ChatGPT.',
      inputSchema: {
        scope: z.enum(['auto', 'execution', 'strategy', 'content']).default('execution'),
      },
      outputSchema: {
        workspace: z.unknown(),
      },
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: {
        ui: {
          resourceUri: REPLOFY_WIDGET_URI,
        },
      },
    }, WORKSPACE_READ_SCOPES),
    async ({ scope }) => {
      try {
        const workspace = await buildWorkspaceContext(headers, scope);
        return textResult('Opened Replofy OS workspace panel.', { workspace });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_READ_SCOPES);
      }
    },
  );

  server.registerTool(
    'server_status',
    toolConfig({
      title: 'Get Replofy connector status',
      description: 'Return the Replofy OS ChatGPT connector status and advertised API surface.',
      inputSchema: {},
      outputSchema: {
        ok: z.boolean().optional(),
        mcp: z.boolean().optional(),
        authMode: z.string().optional(),
        api: z.unknown().optional(),
        resource: z.string().optional(),
        error: z.string().optional(),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    }),
    async () => {
      const authMode = getAuthMode(headers);

      if (authMode === 'missing' || authMode === 'oauth-required') {
        return textResult('Replofy OS MCP is reachable, but no API credential is configured.', {
          ok: true,
          mcp: true,
          authMode,
          resource: getMcpResource(headers),
        });
      }

      try {
        const api = await callReplofyApi(headers, 'GET', '/api/v1');
        return textResult('Replofy OS MCP and API are reachable.', {
          ok: true,
          mcp: true,
          authMode,
          api,
        });
      } catch (error) {
        return toolError(error, headers);
      }
    },
  );

  server.registerTool(
    'get_workspace_context',
    toolConfig({
      title: 'Get workspace context',
      description: 'Load a broad startup or no-anchor briefing with active goals, tasks, bugs, roadmap items, Blogs Hub, creative work, and Growth Pipeline context.',
      inputSchema: {
        scope: z.enum(['auto', 'execution', 'strategy', 'content']).default('execution'),
      },
      outputSchema: {
        workspace: z.unknown(),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    }, WORKSPACE_READ_SCOPES),
    async ({ scope }) => {
      try {
        const workspace = await buildWorkspaceContext(headers, scope);
        return textResult('Loaded Replofy OS workspace context.', { workspace });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_READ_SCOPES);
      }
    },
  );

  server.registerTool(
    'list_operator_desks',
    toolConfig({
      title: 'List Operator Desks',
      description: 'List passive Operator Desks that external agents can inspect through Replofy OS.',
      inputSchema: { status: z.enum(['active', 'paused', 'archived']).optional(), limit: z.number().int().positive().max(100).default(50) },
      outputSchema: { operatorDesks: z.unknown() },
      annotations: READ_ONLY_ANNOTATIONS,
    }, WORKSPACE_READ_SCOPES),
    async ({ status, limit }) => {
      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (status) params.set('status', status);
        const result = await callReplofyApi(headers, 'GET', `/api/v1/operator-desks?${params.toString()}`);
        return textResult(`Loaded ${result.count ?? toDataArray(result).length} Operator Desk(s).`, { operatorDesks: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_READ_SCOPES);
      }
    },
  );

  server.registerTool(
    'get_operator_desk',
    toolConfig({
      title: 'Get Operator Desk',
      description: 'Get one Operator Desk by id or slug.',
      inputSchema: { operatorDeskId: z.string().optional(), slug: z.string().optional() },
      outputSchema: { operatorDesk: z.unknown() },
      annotations: READ_ONLY_ANNOTATIONS,
    }, WORKSPACE_READ_SCOPES),
    async ({ operatorDeskId, slug }) => {
      try {
        if (operatorDeskId) {
          const result = await callReplofyApi(headers, 'GET', `/api/v1/operator-desks/${encodeURIComponent(operatorDeskId)}`);
          return textResult('Loaded Operator Desk.', { operatorDesk: result });
        }
        if (!slug) throw new ApiKeyServerError('operatorDeskId or slug is required.', 400);
        const result = await callReplofyApi(headers, 'GET', `/api/v1/operator-desks?slug=${encodeURIComponent(slug)}&limit=1`);
        return textResult('Loaded Operator Desk.', { operatorDesk: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_READ_SCOPES);
      }
    },
  );

  server.registerTool(
    'create_operator_desk',
    toolConfig({
      title: 'Create Operator Desk',
      description: 'Create an Operator Desk with approval, routing, and dangerous-action guardrails.',
      inputSchema: {
        name: z.string().min(1),
        slug: z.string().optional(),
        type: OPERATOR_DESK_TYPE_SCHEMA.default('ops'),
        mission: z.string().min(1),
        defaultCheckFrequency: OPERATOR_CHECK_FREQUENCY_SCHEMA.default('manual'),
        allowedSources: z.array(z.string()).default([]),
        allowedOutputTypes: z.array(z.string()).default(['execution_task', 'risk_note', 'memory_suggestion']),
        approvalMode: OPERATOR_APPROVAL_MODE_SCHEMA.default('action_based'),
        connectedExternalAgents: z.array(z.string()).default([]),
        dangerousActionRules: z.array(z.string()).optional(),
      },
      outputSchema: { operatorDesk: z.unknown() },
      annotations: NON_DESTRUCTIVE_WRITE_ANNOTATIONS,
    }, WORKSPACE_WRITE_SCOPES),
    async (input) => {
      try {
        const result = await callReplofyApi(headers, 'POST', '/api/v1/operator-desks', input);
        return textResult('Created Operator Desk.', { operatorDesk: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'update_operator_desk',
    toolConfig({
      title: 'Update Operator Desk',
      description: 'Edit safe Operator Desk settings.',
      inputSchema: {
        operatorDeskId: z.string().min(1),
        name: z.string().min(1).optional(),
        type: OPERATOR_DESK_TYPE_SCHEMA.optional(),
        mission: z.string().min(1).optional(),
        defaultCheckFrequency: OPERATOR_CHECK_FREQUENCY_SCHEMA.optional(),
        status: OPERATOR_DESK_STATUS_SCHEMA.optional(),
        allowedSources: z.array(z.string()).optional(),
        allowedOutputTypes: z.array(z.string()).optional(),
        approvalMode: OPERATOR_APPROVAL_MODE_SCHEMA.optional(),
        connectedExternalAgents: z.array(z.string()).optional(),
        dangerousActionRules: z.array(z.string()).optional(),
      },
      outputSchema: { operatorDesk: z.unknown() },
      annotations: NON_DESTRUCTIVE_WRITE_ANNOTATIONS,
    }, WORKSPACE_WRITE_SCOPES),
    async ({ operatorDeskId, ...patch }) => {
      try {
        const result = await callReplofyApi(headers, 'PATCH', `/api/v1/operator-desks/${encodeURIComponent(operatorDeskId)}`, patch);
        return textResult('Updated Operator Desk.', { operatorDesk: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'archive_operator_desk',
    toolConfig({
      title: 'Archive Operator Desk',
      description: 'Archive an Operator Desk. Archived desks cannot be claimed, run, or used for new output submissions.',
      inputSchema: { operatorDeskId: z.string().min(1) },
      outputSchema: { operatorDesk: z.unknown() },
      annotations: NON_DESTRUCTIVE_WRITE_ANNOTATIONS,
    }, WORKSPACE_WRITE_SCOPES),
    async ({ operatorDeskId }) => {
      try {
        const result = await callReplofyApi(headers, 'PATCH', `/api/v1/operator-desks/${encodeURIComponent(operatorDeskId)}`, { status: 'archived' });
        return textResult('Archived Operator Desk.', { operatorDesk: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'restore_operator_desk',
    toolConfig({
      title: 'Restore Operator Desk',
      description: 'Restore an archived Operator Desk to active use.',
      inputSchema: { operatorDeskId: z.string().min(1) },
      outputSchema: { operatorDesk: z.unknown() },
      annotations: NON_DESTRUCTIVE_WRITE_ANNOTATIONS,
    }, WORKSPACE_WRITE_SCOPES),
    async ({ operatorDeskId }) => {
      try {
        const result = await callReplofyApi(headers, 'PATCH', `/api/v1/operator-desks/${encodeURIComponent(operatorDeskId)}`, { status: 'active' });
        return textResult('Restored Operator Desk.', { operatorDesk: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'get_operator_manifest',
    toolConfig({
      title: 'Get Operator Manifest',
      description: 'Return the source-of-truth manifest external agents use: desk, ready work orders, context packs, memory, routing rules, recent outputs, and submission schema.',
      inputSchema: { operatorDeskId: z.string().optional(), slug: z.string().optional(), externalAgentName: z.string().optional() },
      outputSchema: { manifest: z.unknown() },
      annotations: READ_ONLY_ANNOTATIONS,
    }, WORKSPACE_READ_SCOPES),
    async ({ operatorDeskId, slug, externalAgentName }) => {
      try {
        const params = new URLSearchParams();
        if (operatorDeskId) params.set('operatorDeskId', operatorDeskId);
        if (slug) params.set('slug', slug);
        if (externalAgentName) params.set('externalAgentName', externalAgentName);
        const manifest = await callReplofyApi(headers, 'GET', `/api/v1/operator-manifest?${params.toString()}`);
        return textResult('Loaded Operator Manifest.', { manifest });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_READ_SCOPES);
      }
    },
  );

  server.registerTool(
    'list_ready_work_orders',
    toolConfig({
      title: 'List ready Work Orders',
      description: 'List ready Operator Desk Work Orders external agents can claim.',
      inputSchema: { operatorDeskId: z.string().optional(), limit: z.number().int().positive().max(100).default(50) },
      outputSchema: { workOrders: z.unknown() },
      annotations: READ_ONLY_ANNOTATIONS,
    }, WORKSPACE_READ_SCOPES),
    async ({ operatorDeskId, limit }) => {
      try {
        const params = new URLSearchParams({ status: 'ready', limit: String(limit) });
        if (operatorDeskId) params.set('operatorDeskId', operatorDeskId);
        const result = await callReplofyApi(headers, 'GET', `/api/v1/operator-work-orders?${params.toString()}`);
        return textResult(`Loaded ${result.count ?? toDataArray(result).length} ready Work Order(s).`, { workOrders: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_READ_SCOPES);
      }
    },
  );

  server.registerTool(
    'get_work_order',
    toolConfig({
      title: 'Get Work Order',
      description: 'Get one Operator Work Order by id.',
      inputSchema: { workOrderId: z.string().min(1) },
      outputSchema: { workOrder: z.unknown() },
      annotations: READ_ONLY_ANNOTATIONS,
    }, WORKSPACE_READ_SCOPES),
    async ({ workOrderId }) => {
      try {
        const result = await callReplofyApi(headers, 'GET', `/api/v1/operator-work-orders/${encodeURIComponent(workOrderId)}`);
        return textResult('Loaded Work Order.', { workOrder: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_READ_SCOPES);
      }
    },
  );

  server.registerTool(
    'get_context_pack',
    toolConfig({
      title: 'Get Context Pack',
      description: 'Get one Operator Context Pack by id.',
      inputSchema: { contextPackId: z.string().min(1) },
      outputSchema: { contextPack: z.unknown() },
      annotations: READ_ONLY_ANNOTATIONS,
    }, WORKSPACE_READ_SCOPES),
    async ({ contextPackId }) => {
      try {
        const result = await callReplofyApi(headers, 'GET', `/api/v1/operator-context-packs/${encodeURIComponent(contextPackId)}`);
        return textResult('Loaded Context Pack.', { contextPack: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_READ_SCOPES);
      }
    },
  );

  server.registerTool(
    'list_operator_memory',
    toolConfig({
      title: 'List Operator Memory',
      description: 'List Operator Memory. Archived, rejected, and expired memories are excluded unless a state filter is provided.',
      inputSchema: {
        scope: OPERATOR_MEMORY_SCOPE_SCHEMA.optional(),
        scopeId: z.string().optional(),
        state: z.enum(['suggested', 'active', 'pinned', 'rejected', 'expired', 'archived']).optional(),
        memoryType: OPERATOR_MEMORY_TYPE_SCHEMA.optional(),
        limit: z.number().int().positive().max(100).default(50),
      },
      outputSchema: { memories: z.unknown() },
      annotations: READ_ONLY_ANNOTATIONS,
    }, WORKSPACE_READ_SCOPES),
    async ({ scope, scopeId, state, memoryType, limit }) => {
      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (scope) params.set('scope', scope);
        if (scopeId) params.set('scopeId', scopeId);
        if (state) params.set('state', state);
        if (memoryType) params.set('memoryType', memoryType);
        const result = await callReplofyApi(headers, 'GET', `/api/v1/operator-memories?${params.toString()}`);
        return textResult(`Loaded ${result.count ?? toDataArray(result).length} Operator Memory item(s).`, { memories: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_READ_SCOPES);
      }
    },
  );

  server.registerTool(
    'list_recent_operator_outputs',
    toolConfig({
      title: 'List Recent Operator Outputs',
      description: 'List recent Operator Outputs, optionally filtered by desk or status.',
      inputSchema: {
        operatorDeskId: z.string().optional(),
        status: z.enum(['submitted', 'pending_approval', 'approved', 'rejected', 'injected', 'archived']).optional(),
        limit: z.number().int().positive().max(100).default(25),
      },
      outputSchema: { outputs: z.unknown() },
      annotations: READ_ONLY_ANNOTATIONS,
    }, WORKSPACE_READ_SCOPES),
    async ({ operatorDeskId, status, limit }) => {
      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (operatorDeskId) params.set('operatorDeskId', operatorDeskId);
        if (status) params.set('status', status);
        const result = await callReplofyApi(headers, 'GET', `/api/v1/operator-outputs?${params.toString()}`);
        return textResult(`Loaded ${result.count ?? toDataArray(result).length} Operator Output(s).`, { outputs: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_READ_SCOPES);
      }
    },
  );

  server.registerTool(
    'claim_work_order',
    toolConfig({
      title: 'Claim Work Order',
      description: 'Claim a ready Work Order for an external agent. This does not run the model; it records ownership.',
      inputSchema: { workOrderId: z.string().min(1), externalAgentName: z.string().min(1) },
      outputSchema: { workOrder: z.unknown() },
      annotations: NON_DESTRUCTIVE_WRITE_ANNOTATIONS,
    }, WORKSPACE_WRITE_SCOPES),
    async ({ workOrderId, externalAgentName }) => {
      try {
        const result = await callReplofyApi(headers, 'POST', `/api/v1/operator-work-orders/${encodeURIComponent(workOrderId)}/claim`, { externalAgentName });
        return textResult('Claimed Work Order.', { workOrder: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'release_work_order',
    toolConfig({
      title: 'Release Work Order',
      description: 'Release a claimed Work Order back to ready status.',
      inputSchema: { workOrderId: z.string().min(1), externalAgentName: z.string().min(1) },
      outputSchema: { workOrder: z.unknown() },
      annotations: NON_DESTRUCTIVE_WRITE_ANNOTATIONS,
    }, WORKSPACE_WRITE_SCOPES),
    async ({ workOrderId, externalAgentName }) => {
      try {
        const result = await callReplofyApi(headers, 'POST', `/api/v1/operator-work-orders/${encodeURIComponent(workOrderId)}/release`, { externalAgentName });
        return textResult('Released Work Order.', { workOrder: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'submit_agent_checkin',
    toolConfig({
      title: 'Submit Agent Check-in',
      description: 'Record passive external-agent activity such as manifest requested, work started, skipped, failed, or completed.',
      inputSchema: { operatorDeskId: z.string().min(1), workOrderId: z.string().optional(), externalAgentName: z.string().min(1), type: z.enum(['manifest_requested', 'work_order_claimed', 'work_started', 'output_submitted', 'needs_more_context', 'work_skipped', 'work_failed', 'work_completed']), summary: z.string().min(1), payload: z.unknown().optional() },
      outputSchema: { checkin: z.unknown() },
      annotations: NON_DESTRUCTIVE_WRITE_ANNOTATIONS,
    }, WORKSPACE_WRITE_SCOPES),
    async (input) => {
      try {
        const result = await callReplofyApi(headers, 'POST', '/api/v1/operator-checkins', input);
        return textResult('Submitted Agent Check-in.', { checkin: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'submit_operator_output',
    toolConfig({
      title: 'Submit Operator Output',
      description: 'Submit structured output from an external agent. Replofy OS stores it, proposes Smart Routing, and sends risky writes to Approval Inbox.',
      inputSchema: { operatorDeskId: z.string().min(1), workOrderId: z.string().optional(), externalAgentName: z.string().min(1), outputType: z.string().min(1), title: z.string().min(1), summary: z.string().min(1), content: z.string().min(1), structuredPayload: z.unknown().optional(), suggestedDestinations: z.array(z.string()).optional(), sourceReferences: z.array(z.unknown()).optional(), memorySuggestions: z.array(z.unknown()).optional(), confidence: z.enum(['low', 'medium', 'high']).optional() },
      outputSchema: { output: z.unknown() },
      annotations: NON_DESTRUCTIVE_WRITE_ANNOTATIONS,
    }, WORKSPACE_WRITE_SCOPES),
    async (input) => {
      try {
        const result = await callReplofyApi(headers, 'POST', '/api/v1/operator-outputs', input);
        return textResult('Submitted Operator Output for Smart Routing.', { output: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  const operatorMemoryInputSchema = {
    scope: OPERATOR_MEMORY_SCOPE_SCHEMA.default('operator'),
    scopeId: z.string().optional(),
    memoryType: OPERATOR_MEMORY_TYPE_SCHEMA.default('lesson'),
    content: z.string().min(1),
    confidence: OPERATOR_MEMORY_CONFIDENCE_SCHEMA.default('medium'),
    sourceCheckInId: z.string().optional(),
    sourceOutputId: z.string().optional(),
    expiresAt: z.string().optional(),
    pinned: z.boolean().default(false),
    sourceMetadata: z.record(z.string(), z.unknown()).optional(),
  };

  server.registerTool(
    'create_operator_memory',
    toolConfig({
      title: 'Create Operator Memory',
      description: 'Create active Operator Memory with source=mcp. Global memory requires company admin permission.',
      inputSchema: operatorMemoryInputSchema,
      outputSchema: { memory: z.unknown() },
      annotations: NON_DESTRUCTIVE_WRITE_ANNOTATIONS,
    }, WORKSPACE_WRITE_SCOPES),
    async (input) => {
      try {
        const result = await callReplofyApi(headers, 'POST', '/api/v1/operator-memories', {
          ...input,
          state: 'active',
          source: 'mcp',
        });
        return textResult('Created Operator Memory.', { memory: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'create_operator_memory_suggestion',
    toolConfig({
      title: 'Create Operator Memory Suggestion',
      description: 'Create suggested Operator Memory awaiting review.',
      inputSchema: operatorMemoryInputSchema,
      outputSchema: { memory: z.unknown() },
      annotations: NON_DESTRUCTIVE_WRITE_ANNOTATIONS,
    }, WORKSPACE_WRITE_SCOPES),
    async (input) => {
      try {
        const result = await callReplofyApi(headers, 'POST', '/api/v1/operator-memories', {
          ...input,
          state: 'suggested',
          source: 'mcp',
        });
        return textResult('Created Operator Memory suggestion.', { memory: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'update_operator_memory',
    toolConfig({
      title: 'Update Operator Memory',
      description: 'Update safe Operator Memory fields.',
      inputSchema: {
        memoryId: z.string().min(1),
        scope: OPERATOR_MEMORY_SCOPE_SCHEMA.optional(),
        scopeId: z.string().optional(),
        memoryType: OPERATOR_MEMORY_TYPE_SCHEMA.optional(),
        content: z.string().min(1).optional(),
        confidence: OPERATOR_MEMORY_CONFIDENCE_SCHEMA.optional(),
        sourceCheckInId: z.string().optional(),
        sourceOutputId: z.string().optional(),
        expiresAt: z.string().optional(),
        pinned: z.boolean().optional(),
        sourceMetadata: z.record(z.string(), z.unknown()).optional(),
      },
      outputSchema: { memory: z.unknown() },
      annotations: NON_DESTRUCTIVE_WRITE_ANNOTATIONS,
    }, WORKSPACE_WRITE_SCOPES),
    async ({ memoryId, ...patch }) => {
      try {
        const result = await callReplofyApi(headers, 'PATCH', `/api/v1/operator-memories/${encodeURIComponent(memoryId)}`, patch);
        return textResult('Updated Operator Memory.', { memory: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'archive_operator_memory',
    toolConfig({
      title: 'Archive Operator Memory',
      description: 'Archive Operator Memory so it is excluded from manifests and default memory lists.',
      inputSchema: { memoryId: z.string().min(1), reason: z.string().optional() },
      outputSchema: { memory: z.unknown() },
      annotations: NON_DESTRUCTIVE_WRITE_ANNOTATIONS,
    }, WORKSPACE_WRITE_SCOPES),
    async ({ memoryId, reason }) => {
      try {
        const result = await callReplofyApi(headers, 'POST', `/api/v1/operator-memories/${encodeURIComponent(memoryId)}/archive`, { reason });
        return textResult('Archived Operator Memory.', { memory: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'restore_operator_memory',
    toolConfig({
      title: 'Restore Operator Memory',
      description: 'Restore archived Operator Memory to active state.',
      inputSchema: { memoryId: z.string().min(1) },
      outputSchema: { memory: z.unknown() },
      annotations: NON_DESTRUCTIVE_WRITE_ANNOTATIONS,
    }, WORKSPACE_WRITE_SCOPES),
    async ({ memoryId }) => {
      try {
        const result = await callReplofyApi(headers, 'POST', `/api/v1/operator-memories/${encodeURIComponent(memoryId)}/restore`, {});
        return textResult('Restored Operator Memory.', { memory: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'approve_operator_memory_suggestion',
    toolConfig({
      title: 'Approve Operator Memory Suggestion',
      description: 'Approve suggested Operator Memory into active memory.',
      inputSchema: { memoryId: z.string().min(1) },
      outputSchema: { memory: z.unknown() },
      annotations: NON_DESTRUCTIVE_WRITE_ANNOTATIONS,
    }, WORKSPACE_WRITE_SCOPES),
    async ({ memoryId }) => {
      try {
        const result = await callReplofyApi(headers, 'POST', `/api/v1/operator-memories/${encodeURIComponent(memoryId)}/approve`, {});
        return textResult('Approved Operator Memory suggestion.', { memory: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'reject_operator_memory_suggestion',
    toolConfig({
      title: 'Reject Operator Memory Suggestion',
      description: 'Reject suggested Operator Memory.',
      inputSchema: { memoryId: z.string().min(1), reason: z.string().optional() },
      outputSchema: { memory: z.unknown() },
      annotations: NON_DESTRUCTIVE_WRITE_ANNOTATIONS,
    }, WORKSPACE_WRITE_SCOPES),
    async ({ memoryId, reason }) => {
      try {
        const result = await callReplofyApi(headers, 'POST', `/api/v1/operator-memories/${encodeURIComponent(memoryId)}/reject`, { reason });
        return textResult('Rejected Operator Memory suggestion.', { memory: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'list_pending_operator_approvals',
    toolConfig({
      title: 'List pending Operator Approvals',
      description: 'List Approval Inbox items created from Operator Desk Smart Routing.',
      inputSchema: { limit: z.number().int().positive().max(100).default(50) },
      outputSchema: { approvals: z.unknown() },
      annotations: READ_ONLY_ANNOTATIONS,
    }, WORKSPACE_READ_SCOPES),
    async ({ limit }) => {
      try {
        const result = await callReplofyApi(headers, 'GET', `/api/v1/operator-approvals?status=pending&limit=${limit}`);
        return textResult(`Loaded ${result.count ?? toDataArray(result).length} pending Operator Approval(s).`, { approvals: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_READ_SCOPES);
      }
    },
  );

  server.registerTool(
    'list_operator_mcp_registry',
    toolConfig({
      title: 'List Operator MCP Registry',
      description: 'List Operator Desk MCP/API actions, schemas, permissions, risk levels, enabled state, and last-used metadata.',
      inputSchema: {},
      outputSchema: { registry: z.unknown() },
      annotations: READ_ONLY_ANNOTATIONS,
    }, WORKSPACE_READ_SCOPES),
    async () => {
      try {
        const registry = await callReplofyApi(headers, 'GET', '/api/v1/operator-mcp-registry');
        return textResult('Loaded Operator MCP Registry.', { registry });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_READ_SCOPES);
      }
    },
  );

  server.registerTool(
    'get_workspace_object',
    toolConfig({
      title: 'Get workspace object with related context',
      description:
        'Fetch one Replofy OS object by resource and ID, then attach compact deterministic related context.',
      inputSchema: {
        resource: z.enum(ROUTABLE_RESOURCES),
        id: z.string().min(1),
        debug: z.boolean().default(false),
      },
      outputSchema: {
        object: z.unknown(),
        relatedContext: z.unknown().optional(),
        routing: z.unknown().optional(),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    }, WORKSPACE_READ_SCOPES),
    async ({ resource, id, debug }) => {
      try {
        const params = new URLSearchParams();
        if (debug) params.set('debug', 'true');
        const suffix = params.size > 0 ? `?${params.toString()}` : '';
        const result = await callReplofyApi(
          headers,
          'GET',
          `/api/v1/context-routing/${encodeURIComponent(resource)}/${encodeURIComponent(id)}${suffix}`,
        );
        return textResult('Loaded Replofy OS object with related context.', {
          object: result.data,
          relatedContext: result.relatedContext,
          routing: result.routing,
        });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_READ_SCOPES);
      }
    },
  );

  server.registerTool(
    'list_tasks',
    toolConfig({
      title: 'List tasks',
      description: 'List Replofy OS tasks, optionally filtered by status, assignee, cycle goal, or lead indicator.',
      inputSchema: {
        status: z.enum(['todo', 'in-progress', 'done', 'icebox']).optional(),
        assigneeId: z.string().optional(),
        cycleGoalId: z.string().optional(),
        isLeadIndicator: z.boolean().optional(),
        limit: z.number().int().positive().max(100).default(25),
      },
      outputSchema: {
        tasks: z.unknown(),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    }, WORKSPACE_READ_SCOPES),
    async ({ status, assigneeId, cycleGoalId, isLeadIndicator, limit }) => {
      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (status) params.set('status', status);
        if (assigneeId) params.set('assigneeId', assigneeId);
        if (cycleGoalId) params.set('cycleGoalId', cycleGoalId);
        if (typeof isLeadIndicator === 'boolean') params.set('isLeadIndicator', String(isLeadIndicator));
        const result = await callReplofyApi(headers, 'GET', `/api/v1/tasks?${params.toString()}`);
        const routedResult = await addRelatedContextToList(headers, 'tasks', result);
        return textResult(`Loaded ${result.count ?? toDataArray(result).length} task(s) with related context.`, {
          tasks: routedResult,
        });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_READ_SCOPES);
      }
    },
  );

  server.registerTool(
    'create_task',
    toolConfig({
      title: 'Create task',
      description: 'Create a Replofy OS task. ChatGPT should ask for confirmation before calling this write tool.',
      inputSchema: {
        title: z.string().min(1),
        status: z.enum(['todo', 'in-progress', 'done', 'icebox']).optional(),
        effortPoints: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(5), z.literal(8)]).default(1),
        isLeadIndicator: z.boolean().default(false),
        cycleGoalId: z.string().optional(),
        assigneeId: z.string().optional(),
      },
      outputSchema: {
        task: z.unknown(),
      },
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
    }, WORKSPACE_WRITE_SCOPES),
    async ({ title, status, effortPoints, isLeadIndicator, cycleGoalId, assigneeId }) => {
      try {
        const payload: Record<string, unknown> = {
          title,
          effortPoints,
          isLeadIndicator,
        };
        if (status) payload.status = status;
        if (cycleGoalId) payload.cycleGoalId = cycleGoalId;
        if (assigneeId) payload.assigneeId = assigneeId;

        const result = await callReplofyApi(headers, 'POST', '/api/v1/tasks', payload);
        return textResult('Created task in Replofy OS.', { task: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'list_leads',
    toolConfig({
      title: 'List leads',
      description: 'List Growth Pipeline leads, optionally filtered by stage, source, priority, owner, or account.',
      inputSchema: {
        stage: z.enum(['new', 'qualified', 'contacted', 'demo-booked', 'proposal', 'won', 'lost']).optional(),
        source: z.enum(['inbound', 'referral', 'cold-outreach', 'waitlist', 'twitter', 'linkedin', 'email', 'other']).optional(),
        priority: z.enum(['low', 'medium', 'high']).optional(),
        ownerId: z.string().optional(),
        accountId: z.string().optional(),
        limit: z.number().int().positive().max(100).default(25),
      },
      outputSchema: {
        leads: z.unknown(),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    }, WORKSPACE_READ_SCOPES),
    async ({ stage, source, priority, ownerId, accountId, limit }) => {
      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (stage) params.set('stage', stage);
        if (source) params.set('source', source);
        if (priority) params.set('priority', priority);
        if (ownerId) params.set('ownerId', ownerId);
        if (accountId) params.set('accountId', accountId);
        const result = await callReplofyApi(headers, 'GET', `/api/v1/leads?${params.toString()}`);
        return textResult(`Loaded ${result.count ?? toDataArray(result).length} lead(s).`, { leads: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_READ_SCOPES);
      }
    },
  );

  server.registerTool(
    'create_lead',
    toolConfig({
      title: 'Create lead',
      description: 'Create a Growth Pipeline lead. ChatGPT should ask for confirmation before calling this write tool.',
      inputSchema: {
        name: z.string().min(1),
        email: z.string().optional(),
        companyName: z.string().optional(),
        accountId: z.string().optional(),
        source: z.enum(['inbound', 'referral', 'cold-outreach', 'waitlist', 'twitter', 'linkedin', 'email', 'other']).default('inbound'),
        stage: z.enum(['new', 'qualified', 'contacted', 'demo-booked', 'proposal', 'won', 'lost']).default('new'),
        priority: z.enum(['low', 'medium', 'high']).default('medium'),
        ownerId: z.string().optional(),
        nextAction: z.string().optional(),
        nextActionAt: z.string().optional(),
        notes: z.string().optional(),
        linkedTaskIds: z.array(z.string()).optional(),
      },
      outputSchema: {
        lead: z.unknown(),
      },
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
    }, WORKSPACE_WRITE_SCOPES),
    async (input) => {
      try {
        const result = await callReplofyApi(headers, 'POST', '/api/v1/leads', input);
        return textResult('Created lead in Replofy OS.', { lead: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'update_lead',
    toolConfig({
      title: 'Update lead',
      description: 'Update a Growth Pipeline lead by id.',
      inputSchema: {
        leadId: z.string().min(1),
        name: z.string().optional(),
        email: z.string().optional(),
        companyName: z.string().optional(),
        accountId: z.string().nullable().optional(),
        source: z.enum(['inbound', 'referral', 'cold-outreach', 'waitlist', 'twitter', 'linkedin', 'email', 'other']).optional(),
        stage: z.enum(['new', 'qualified', 'contacted', 'demo-booked', 'proposal', 'won', 'lost']).optional(),
        priority: z.enum(['low', 'medium', 'high']).optional(),
        ownerId: z.string().nullable().optional(),
        nextAction: z.string().optional(),
        nextActionAt: z.string().nullable().optional(),
        notes: z.string().optional(),
        linkedTaskIds: z.array(z.string()).optional(),
      },
      outputSchema: {
        lead: z.unknown(),
      },
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
    }, WORKSPACE_WRITE_SCOPES),
    async ({ leadId, ...patch }) => {
      try {
        const result = await callReplofyApi(headers, 'PATCH', `/api/v1/leads/${encodeURIComponent(leadId)}`, patch);
        return textResult('Updated lead in Replofy OS.', { lead: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'list_accounts',
    toolConfig({
      title: 'List accounts',
      description: 'List Growth Pipeline accounts, optionally filtered by status.',
      inputSchema: {
        status: z.enum(['prospect', 'customer', 'partner', 'inactive']).optional(),
        limit: z.number().int().positive().max(100).default(25),
      },
      outputSchema: {
        accounts: z.unknown(),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    }, WORKSPACE_READ_SCOPES),
    async ({ status, limit }) => {
      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (status) params.set('status', status);
        const result = await callReplofyApi(headers, 'GET', `/api/v1/accounts?${params.toString()}`);
        return textResult(`Loaded ${result.count ?? toDataArray(result).length} account(s).`, { accounts: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_READ_SCOPES);
      }
    },
  );

  server.registerTool(
    'create_account',
    toolConfig({
      title: 'Create account',
      description: 'Create a Growth Pipeline account. ChatGPT should ask for confirmation before calling this write tool.',
      inputSchema: {
        name: z.string().min(1),
        website: z.string().optional(),
        industry: z.string().optional(),
        size: z.string().optional(),
        notes: z.string().optional(),
        status: z.enum(['prospect', 'customer', 'partner', 'inactive']).default('prospect'),
        linkedLeadIds: z.array(z.string()).optional(),
      },
      outputSchema: {
        account: z.unknown(),
      },
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
    }, WORKSPACE_WRITE_SCOPES),
    async (input) => {
      try {
        const result = await callReplofyApi(headers, 'POST', '/api/v1/accounts', input);
        return textResult('Created account in Replofy OS.', { account: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'update_account',
    toolConfig({
      title: 'Update account',
      description: 'Update a Growth Pipeline account by id.',
      inputSchema: {
        accountId: z.string().min(1),
        name: z.string().optional(),
        website: z.string().optional(),
        industry: z.string().optional(),
        size: z.string().optional(),
        notes: z.string().optional(),
        status: z.enum(['prospect', 'customer', 'partner', 'inactive']).optional(),
        linkedLeadIds: z.array(z.string()).optional(),
      },
      outputSchema: {
        account: z.unknown(),
      },
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
    }, WORKSPACE_WRITE_SCOPES),
    async ({ accountId, ...patch }) => {
      try {
        const result = await callReplofyApi(headers, 'PATCH', `/api/v1/accounts/${encodeURIComponent(accountId)}`, patch);
        return textResult('Updated account in Replofy OS.', { account: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'update_task_status',
    toolConfig({
      title: 'Update task status',
      description: 'Update one Replofy OS task status by id.',
      inputSchema: {
        taskId: z.string().min(1),
        status: z.enum(['todo', 'in-progress', 'done', 'icebox']),
      },
      outputSchema: {
        task: z.unknown(),
      },
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
    }, WORKSPACE_WRITE_SCOPES),
    async ({ taskId, status }) => {
      try {
        const result = await callReplofyApi(headers, 'PATCH', `/api/v1/tasks/${encodeURIComponent(taskId)}`, { status });
        return textResult('Updated task status in Replofy OS.', { task: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'list_bugs',
    toolConfig({
      title: 'List bugs',
      description: 'List Replofy OS bugs, optionally filtered by status or severity.',
      inputSchema: {
        status: z.enum(['open', 'triaged', 'in-progress', 'blocked', 'resolved', 'closed']).optional(),
        severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        limit: z.number().int().positive().max(100).default(25),
      },
      outputSchema: {
        bugs: z.unknown(),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    }, WORKSPACE_READ_SCOPES),
    async ({ status, severity, limit }) => {
      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (status) params.set('status', status);
        if (severity) params.set('severity', severity);
        const result = await callReplofyApi(headers, 'GET', `/api/v1/bugs?${params.toString()}`);
        const routedResult = await addRelatedContextToList(headers, 'bugs', result);
        return textResult(`Loaded ${result.count ?? toDataArray(result).length} bug(s) with related context.`, {
          bugs: routedResult,
        });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_READ_SCOPES);
      }
    },
  );

  server.registerTool(
    'triage_bug',
    toolConfig({
      title: 'Triage bug',
      description: 'Update a Replofy OS bug status, severity, resolution notes, linked task ids, or code links.',
      inputSchema: {
        bugId: z.string().min(1),
        status: z.enum(['open', 'triaged', 'in-progress', 'blocked', 'resolved', 'closed']).optional(),
        severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        resolutionNotes: z.string().optional(),
        linkedTaskIds: z.array(z.string()).optional(),
        codeLinks: z.array(BUG_CODE_LINK_SCHEMA).optional(),
      },
      outputSchema: {
        bug: z.unknown(),
      },
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
    }, WORKSPACE_WRITE_SCOPES),
    async ({ bugId, status, severity, resolutionNotes, linkedTaskIds, codeLinks }) => {
      try {
        const payload: Record<string, unknown> = {};
        if (status) payload.status = status;
        if (severity) payload.severity = severity;
        if (resolutionNotes !== undefined) payload.resolutionNotes = resolutionNotes;
        if (linkedTaskIds) payload.linkedTaskIds = linkedTaskIds;
        if (codeLinks) payload.codeLinks = codeLinks;

        const result = await callReplofyApi(headers, 'PATCH', `/api/v1/bugs/${encodeURIComponent(bugId)}`, payload);
        return textResult('Updated bug in Replofy OS.', { bug: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'list_roadmap_items',
    toolConfig({
      title: 'List roadmap items',
      description: 'List Replofy OS roadmap items for planning.',
      inputSchema: {
        phase: z.string().optional(),
        priority: z.string().optional(),
        status: z.string().optional(),
        limit: z.number().int().positive().max(100).default(25),
      },
      outputSchema: {
        roadmapItems: z.unknown(),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    }, WORKSPACE_READ_SCOPES),
    async ({ phase, priority, status, limit }) => {
      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (phase) params.set('phase', phase);
        if (priority) params.set('priority', priority);
        if (status) params.set('status', status);
        const result = await callReplofyApi(headers, 'GET', `/api/v1/roadmap-items?${params.toString()}`);
        return textResult(`Loaded ${result.count ?? toDataArray(result).length} roadmap item(s).`, { roadmapItems: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_READ_SCOPES);
      }
    },
  );

  server.registerTool(
    'list_blog_articles',
    toolConfig({
      title: 'List Blogs Hub articles',
      description: 'List structured Blogs Hub articles by workflow status, roadmap phase, priority, or owner.',
      inputSchema: {
        status: BLOG_STATUS_SCHEMA.optional(),
        roadmapPhase: BLOG_ROADMAP_PHASE_SCHEMA.optional(),
        priority: BLOG_PRIORITY_SCHEMA.optional(),
        ownerId: z.string().optional(),
        limit: z.number().int().positive().max(200).default(50),
      },
      outputSchema: {
        blogArticles: z.unknown(),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    }, WORKSPACE_READ_SCOPES),
    async ({ status, roadmapPhase, priority, ownerId, limit }) => {
      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (status) params.set('status', status);
        if (roadmapPhase) params.set('roadmapPhase', roadmapPhase);
        if (priority) params.set('priority', priority);
        if (ownerId) params.set('ownerId', ownerId);
        const result = await callReplofyApi(headers, 'GET', `/api/v1/blog-articles?${params.toString()}`);
        return textResult(`Loaded ${result.count ?? toDataArray(result).length} Blogs Hub article(s).`, { blogArticles: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_READ_SCOPES);
      }
    },
  );

  server.registerTool(
    'create_blog_article',
    toolConfig({
      title: 'Create Blogs Hub article',
      description: 'Create a structured Blogs Hub article with roadmap, brief, evidence, linked source registry ids, and distribution metadata.',
      inputSchema: {
        title: z.string().min(1).max(240),
        slug: z.string().max(280).optional(),
        summary: z.string().max(4000).default(''),
        content: z.string().max(40000).default(''),
        status: BLOG_STATUS_SCHEMA.default('idea'),
        roadmapPhase: BLOG_ROADMAP_PHASE_SCHEMA.default('next'),
        priority: BLOG_PRIORITY_SCHEMA.default('medium'),
        ownerId: z.string().nullable().optional(),
        targetPublishAt: z.string().nullable().optional(),
        scheduledFor: z.string().nullable().optional(),
        brief: BLOG_BRIEF_SCHEMA.optional(),
        evidence: z.array(BLOG_EVIDENCE_SCHEMA).max(500).optional(),
        linkedSourceIds: z.array(z.string()).optional(),
        distribution: BLOG_DISTRIBUTION_SCHEMA.optional(),
        tags: z.array(z.string()).optional(),
      },
      outputSchema: {
        blogArticle: z.unknown(),
      },
      annotations: NON_DESTRUCTIVE_WRITE_ANNOTATIONS,
    }, WORKSPACE_WRITE_SCOPES),
    async (input) => {
      try {
        const result = await callReplofyApi(headers, 'POST', '/api/v1/blog-articles', input);
        return textResult('Created Blogs Hub article in Replofy OS.', { blogArticle: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'update_blog_article',
    toolConfig({
      title: 'Update Blogs Hub article',
      description: 'Update one Blogs Hub article by id, including its roadmap, brief, evidence, source links, distribution, and publishing workflow.',
      inputSchema: {
        blogArticleId: z.string().min(1),
        title: z.string().min(1).max(240).optional(),
        slug: z.string().max(280).optional(),
        summary: z.string().max(4000).optional(),
        content: z.string().max(40000).optional(),
        status: BLOG_STATUS_SCHEMA.optional(),
        roadmapPhase: BLOG_ROADMAP_PHASE_SCHEMA.optional(),
        priority: BLOG_PRIORITY_SCHEMA.optional(),
        ownerId: z.string().nullable().optional(),
        targetPublishAt: z.string().nullable().optional(),
        scheduledFor: z.string().nullable().optional(),
        brief: BLOG_BRIEF_SCHEMA.optional(),
        evidence: z.array(BLOG_EVIDENCE_SCHEMA).max(500).optional(),
        linkedSourceIds: z.array(z.string()).optional(),
        distribution: BLOG_DISTRIBUTION_SCHEMA.optional(),
        tags: z.array(z.string()).optional(),
        validatedAt: z.string().nullable().optional(),
        publishedAt: z.string().nullable().optional(),
        rejectedAt: z.string().nullable().optional(),
      },
      outputSchema: {
        blogArticle: z.unknown(),
      },
      annotations: NON_DESTRUCTIVE_WRITE_ANNOTATIONS,
    }, WORKSPACE_WRITE_SCOPES),
    async ({ blogArticleId, ...patch }) => {
      try {
        const result = await callReplofyApi(headers, 'PATCH', `/api/v1/blog-articles/${encodeURIComponent(blogArticleId)}`, patch);
        return textResult('Updated Blogs Hub article in Replofy OS.', { blogArticle: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'list_creative_items',
    toolConfig({
      title: 'List Creative Hub items',
      description: 'List Creative Hub ideas, briefs, drafts, reviews, scheduled work, and published work.',
      inputSchema: {
        platform: z.enum(['Instagram', 'LinkedIn', 'X', 'TikTok', 'YouTube', 'Blog', 'Email', 'Other']).optional(),
        format: z.enum(['single-post', 'carousel', 'reel', 'story-sequence', 'motion-brief', 'static-ad', 'thread', 'other']).optional(),
        status: z.enum(['idea', 'brief', 'draft', 'in-review', 'changes-requested', 'approved', 'scheduled', 'published', 'rejected', 'archived']).optional(),
        ownerId: z.string().optional(),
        campaign: z.string().optional(),
        limit: z.number().int().positive().max(100).default(25),
      },
      outputSchema: {
        creativeItems: z.unknown(),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    }, WORKSPACE_READ_SCOPES),
    async ({ platform, format, status, ownerId, campaign, limit }) => {
      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (platform) params.set('platform', platform);
        if (format) params.set('format', format);
        if (status) params.set('status', status);
        if (ownerId) params.set('ownerId', ownerId);
        if (campaign) params.set('campaign', campaign);
        const result = await callReplofyApi(headers, 'GET', `/api/v1/creative-items?${params.toString()}`);
        return textResult(`Loaded ${result.count ?? toDataArray(result).length} Creative Hub item(s).`, { creativeItems: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_READ_SCOPES);
      }
    },
  );

  server.registerTool(
    'list_team_chat_channels',
    toolConfig({
      title: 'List team chat channels',
      description: 'List workspace team chat channels for human and AI-agent collaboration.',
      inputSchema: {
        status: z.enum(['active', 'archived']).optional(),
        limit: z.number().int().positive().max(100).default(50),
      },
      outputSchema: {
        channels: z.unknown(),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    }, WORKSPACE_READ_SCOPES),
    async ({ status, limit }) => {
      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (status) params.set('status', status);
        const result = await callReplofyApi(headers, 'GET', `/api/v1/team-chat-channels?${params.toString()}`);
        return textResult(`Loaded ${result.count ?? toDataArray(result).length} team chat channel(s).`, { channels: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_READ_SCOPES);
      }
    },
  );

  server.registerTool(
    'create_team_chat_channel',
    toolConfig({
      title: 'Create team chat channel',
      description: 'Create a workspace team chat channel with a custom name and optional initial participant ids.',
      inputSchema: {
        name: z.string().min(1).max(120),
        topic: z.string().max(500).optional(),
        participantIds: z.array(z.string()).max(200).optional(),
      },
      outputSchema: {
        channel: z.unknown(),
      },
      annotations: NON_DESTRUCTIVE_WRITE_ANNOTATIONS,
    }, WORKSPACE_WRITE_SCOPES),
    async ({ name, topic, participantIds }) => {
      try {
        const payload: Record<string, unknown> = { name };
        if (topic !== undefined) payload.topic = topic;
        if (participantIds !== undefined) payload.participantIds = participantIds;
        const result = await callReplofyApi(headers, 'POST', '/api/v1/team-chat-channels', payload);
        return textResult('Created team chat channel in Replofy OS.', { channel: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'list_team_chat_participants',
    toolConfig({
      title: 'List team chat identities',
      description: 'List named human and AI-agent identities available for team chat.',
      inputSchema: {
        participantType: z.enum(['team-member', 'ai-agent']).optional(),
        status: z.enum(['active', 'inactive']).optional(),
        linkedUserId: z.string().optional(),
        limit: z.number().int().positive().max(100).default(100),
      },
      outputSchema: {
        participants: z.unknown(),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    }, WORKSPACE_READ_SCOPES),
    async ({ participantType, status, linkedUserId, limit }) => {
      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (participantType) params.set('participantType', participantType);
        if (status) params.set('status', status);
        if (linkedUserId) params.set('linkedUserId', linkedUserId);
        const result = await callReplofyApi(headers, 'GET', `/api/v1/team-chat-participants?${params.toString()}`);
        return textResult(`Loaded ${result.count ?? toDataArray(result).length} team chat identity record(s).`, { participants: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_READ_SCOPES);
      }
    },
  );

  server.registerTool(
    'register_team_chat_participant',
    toolConfig({
      title: 'Register team chat identity',
      description: 'Register a human or AI-agent chat identity with a custom display name.',
      inputSchema: {
        displayName: z.string().min(1).max(120),
        participantType: z.enum(['team-member', 'ai-agent']).default('ai-agent'),
        linkedUserId: z.string().optional(),
        description: z.string().max(500).optional(),
      },
      outputSchema: {
        participant: z.unknown(),
      },
      annotations: NON_DESTRUCTIVE_WRITE_ANNOTATIONS,
    }, WORKSPACE_WRITE_SCOPES),
    async ({ displayName, participantType, linkedUserId, description }) => {
      try {
        const payload: Record<string, unknown> = {
          displayName,
          participantType,
        };
        if (linkedUserId !== undefined) payload.linkedUserId = linkedUserId;
        if (description !== undefined) payload.description = description;
        const result = await callReplofyApi(headers, 'POST', '/api/v1/team-chat-participants', payload);
        return textResult('Registered team chat identity in Replofy OS.', { participant: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'rename_team_chat_participant',
    toolConfig({
      title: 'Rename team chat identity',
      description: 'Change the custom display name for a human or AI-agent chat identity.',
      inputSchema: {
        participantId: z.string().min(1),
        displayName: z.string().min(1).max(120),
      },
      outputSchema: {
        participant: z.unknown(),
      },
      annotations: NON_DESTRUCTIVE_WRITE_ANNOTATIONS,
    }, WORKSPACE_WRITE_SCOPES),
    async ({ participantId, displayName }) => {
      try {
        const result = await callReplofyApi(headers, 'PATCH', `/api/v1/team-chat-participants/${encodeURIComponent(participantId)}`, { displayName });
        return textResult('Renamed team chat identity in Replofy OS.', { participant: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'add_team_chat_participant_to_channel',
    toolConfig({
      title: 'Add identity to team chat channel',
      description: 'Atomically add a registered human or AI-agent identity to a team chat channel.',
      inputSchema: {
        channelId: z.string().min(1),
        participantId: z.string().min(1),
      },
      outputSchema: {
        channel: z.unknown(),
      },
      annotations: NON_DESTRUCTIVE_WRITE_ANNOTATIONS,
    }, WORKSPACE_WRITE_SCOPES),
    async ({ channelId, participantId }) => {
      try {
        const result = await callReplofyApi(headers, 'POST', `/api/v1/team-chat/channels/${encodeURIComponent(channelId)}/participants`, { participantId });
        return textResult('Added identity to team chat channel.', { channel: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'post_team_chat_message',
    toolConfig({
      title: 'Post team chat message',
      description: 'Post a message as a registered channel identity. The identity must already belong to the channel.',
      inputSchema: {
        channelId: z.string().min(1),
        participantId: z.string().min(1),
        content: z.string().min(1).max(8000),
        replyToMessageId: z.string().optional(),
      },
      outputSchema: {
        message: z.unknown(),
      },
      annotations: NON_DESTRUCTIVE_WRITE_ANNOTATIONS,
    }, WORKSPACE_WRITE_SCOPES),
    async ({ channelId, participantId, content, replyToMessageId }) => {
      try {
        const payload: Record<string, unknown> = {
          channelId,
          participantId,
          content,
        };
        if (replyToMessageId !== undefined) payload.replyToMessageId = replyToMessageId;
        const result = await callReplofyApi(headers, 'POST', '/api/v1/team-chat-messages', payload);
        return textResult('Posted team chat message in Replofy OS.', { message: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'list_team_chat_messages',
    toolConfig({
      title: 'List team chat messages',
      description: 'Read bounded team chat history with channel, identity, sender type, ISO time-range, and text-search filters.',
      inputSchema: {
        channelId: z.string().optional(),
        participantId: z.string().optional(),
        participantType: z.enum(['team-member', 'ai-agent']).optional(),
        senderName: z.string().optional(),
        after: z.string().datetime().optional(),
        before: z.string().datetime().optional(),
        query: z.string().optional(),
        limit: z.number().int().positive().max(200).default(50),
      },
      outputSchema: {
        messages: z.unknown(),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    }, WORKSPACE_READ_SCOPES),
    async ({ channelId, participantId, participantType, senderName, after, before, query, limit }) => {
      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (channelId) params.set('channelId', channelId);
        if (participantId) params.set('participantId', participantId);
        if (participantType) params.set('participantType', participantType);
        if (senderName) params.set('senderName', senderName);
        if (after) params.set('after', after);
        if (before) params.set('before', before);
        if (query) params.set('query', query);
        const result = await callReplofyApi(headers, 'GET', `/api/v1/team-chat/messages?${params.toString()}`);
        return textResult(`Loaded ${result.count ?? toDataArray(result).length} team chat message(s).`, { messages: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_READ_SCOPES);
      }
    },
  );

  server.registerTool(
    'create_creative_item',
    toolConfig({
      title: 'Create Creative Hub item',
      description: 'Create a Creative Hub idea or brief. ChatGPT should ask for confirmation before calling this write tool.',
      inputSchema: {
        title: z.string().min(1),
        platform: z.enum(['Instagram', 'LinkedIn', 'X', 'TikTok', 'YouTube', 'Blog', 'Email', 'Other']).default('Other'),
        format: z.enum(['single-post', 'carousel', 'reel', 'story-sequence', 'motion-brief', 'static-ad', 'thread', 'other']).default('other'),
        campaign: z.string().optional(),
        audience: z.string().optional(),
        objective: z.string().optional(),
        hook: z.string().optional(),
        brief: z.string().optional(),
        caption: z.string().optional(),
        visualDirection: z.string().optional(),
        productionNotes: z.string().optional(),
        cta: z.string().optional(),
        status: z.enum(['idea', 'brief', 'draft', 'in-review', 'changes-requested', 'approved', 'scheduled', 'published', 'rejected', 'archived']).default('idea'),
        ownerId: z.string().optional(),
        targetPublishAt: z.string().optional(),
        scheduledFor: z.string().optional(),
        tags: z.array(z.string()).optional(),
      },
      outputSchema: {
        creativeItem: z.unknown(),
      },
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
    }, WORKSPACE_WRITE_SCOPES),
    async (input) => {
      try {
        const result = await callReplofyApi(headers, 'POST', '/api/v1/creative-items', input);
        return textResult('Created Creative Hub item in Replofy OS.', { creativeItem: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'update_creative_item',
    toolConfig({
      title: 'Update Creative Hub item',
      description: 'Update a Creative Hub item by id, including review, scheduling, and publication state.',
      inputSchema: {
        creativeItemId: z.string().min(1),
        title: z.string().optional(),
        platform: z.enum(['Instagram', 'LinkedIn', 'X', 'TikTok', 'YouTube', 'Blog', 'Email', 'Other']).optional(),
        format: z.enum(['single-post', 'carousel', 'reel', 'story-sequence', 'motion-brief', 'static-ad', 'thread', 'other']).optional(),
        campaign: z.string().optional(),
        audience: z.string().optional(),
        objective: z.string().optional(),
        hook: z.string().optional(),
        brief: z.string().optional(),
        caption: z.string().optional(),
        visualDirection: z.string().optional(),
        productionNotes: z.string().optional(),
        cta: z.string().optional(),
        status: z.enum(['idea', 'brief', 'draft', 'in-review', 'changes-requested', 'approved', 'scheduled', 'published', 'rejected', 'archived']).optional(),
        ownerId: z.string().nullable().optional(),
        approverId: z.string().nullable().optional(),
        targetPublishAt: z.string().nullable().optional(),
        scheduledFor: z.string().nullable().optional(),
        publishedAt: z.string().nullable().optional(),
        submittedAt: z.string().nullable().optional(),
        approvalNotes: z.string().optional(),
        assetIds: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
      },
      outputSchema: {
        creativeItem: z.unknown(),
      },
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
    }, WORKSPACE_WRITE_SCOPES),
    async ({ creativeItemId, ...patch }) => {
      try {
        const result = await callReplofyApi(headers, 'PATCH', `/api/v1/creative-items/${encodeURIComponent(creativeItemId)}`, patch);
        return textResult('Updated Creative Hub item in Replofy OS.', { creativeItem: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'list_creative_assets',
    toolConfig({
      title: 'List Creative Hub assets',
      description: 'List read-only Creative Hub asset metadata. Asset files remain behind authenticated download URLs.',
      inputSchema: {
        creativeId: z.string().optional(),
        assetType: z.enum(['image', 'video', 'document', 'source', 'other']).optional(),
        status: z.enum(['uploading', 'active', 'archived', 'error']).optional(),
        limit: z.number().int().positive().max(100).default(25),
      },
      outputSchema: {
        creativeAssets: z.unknown(),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    }, WORKSPACE_READ_SCOPES),
    async ({ creativeId, assetType, status, limit }) => {
      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (creativeId) params.set('creativeId', creativeId);
        if (assetType) params.set('assetType', assetType);
        if (status) params.set('status', status);
        const result = await callReplofyApi(headers, 'GET', `/api/v1/creative-assets?${params.toString()}`);
        return textResult(`Loaded ${result.count ?? toDataArray(result).length} Creative Hub asset(s).`, { creativeAssets: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_READ_SCOPES);
      }
    },
  );

  server.registerTool(
    'download_creative_asset',
    toolConfig({
      title: 'Download Creative Hub asset',
      description: 'Create an authenticated signed download URL for one active Creative Hub asset.',
      inputSchema: {
        assetId: z.string().min(1),
      },
      outputSchema: {
        download: z.unknown(),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    }, WORKSPACE_READ_SCOPES),
    async ({ assetId }) => {
      try {
        const result = await callReplofyApi(
          headers,
          'GET',
          `/api/v1/creative-assets/${encodeURIComponent(assetId)}/download`,
        );
        return textResult('Created a signed Creative Hub asset download URL.', { download: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_READ_SCOPES);
      }
    },
  );

  server.registerTool(
    'create_cycle_goal',
    toolConfig({
      title: 'Create cycle goal',
      description: 'Create a Replofy OS cycle goal.',
      inputSchema: {
        title: z.string().min(1),
        description: z.string().default(''),
        status: z.enum(['active', 'completed', 'archived']).default('active'),
      },
      outputSchema: {
        cycleGoal: z.unknown(),
      },
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
    }, WORKSPACE_WRITE_SCOPES),
    async ({ title, description, status }) => {
      try {
        const result = await callReplofyApi(headers, 'POST', '/api/v1/cycle-goals', { title, description, status });
        return textResult('Created cycle goal in Replofy OS.', { cycleGoal: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_WRITE_SCOPES);
      }
    },
  );

  server.registerTool(
    'get_weekly_changelog',
    toolConfig({
      title: 'Get weekly changelog',
      description: 'Generate the current or previous Replofy OS weekly changelog.',
      inputSchema: {
        week: z.enum(['current', 'last']).default('current'),
      },
      outputSchema: {
        changelog: z.unknown(),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    }, WORKSPACE_READ_SCOPES),
    async ({ week }) => {
      try {
        const result = await callReplofyApi(headers, 'GET', `/api/v1/reports/changelog?week=${encodeURIComponent(week)}`);
        return textResult('Generated Replofy OS weekly changelog.', { changelog: result });
      } catch (error) {
        return toolError(error, headers, WORKSPACE_READ_SCOPES);
      }
    },
  );

  server.registerTool(
    'extract_context_document',
    toolConfig({
      title: 'Extract context document',
      description: 'Extract structured Replofy OS context from a document without writing records.',
      inputSchema: {
        fileName: z.string().min(1),
        content: z.string().min(1),
        mimeType: z.string().default('text/markdown'),
      },
      outputSchema: {
        extraction: z.unknown(),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    }, SYSTEMS_READ_SCOPES),
    async ({ fileName, content, mimeType }) => {
      try {
        const result = await callReplofyApi(headers, 'POST', '/api/v1/context-ingestions/extract', {
          fileName,
          content,
          mimeType,
        });
        return textResult('Extracted context document.', { extraction: result });
      } catch (error) {
        return toolError(error, headers, SYSTEMS_READ_SCOPES);
      }
    },
  );

  server.registerTool(
    'ingest_context_document',
    toolConfig({
      title: 'Ingest context document',
      description: 'Ingest a document into Replofy OS context.',
      inputSchema: {
        fileName: z.string().min(1),
        content: z.string().min(1),
        mimeType: z.string().default('text/markdown'),
        payload: z.record(z.string(), z.unknown()).optional(),
      },
      outputSchema: {
        ingestion: z.unknown(),
      },
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
    }, SYSTEMS_WRITE_SCOPES),
    async ({ fileName, content, mimeType, payload }) => {
      try {
        const result = await callReplofyApi(headers, 'POST', '/api/v1/context-ingestions', {
          fileName,
          content,
          mimeType,
          payload,
        });
        return textResult('Ingested context document into Replofy OS.', { ingestion: result });
      } catch (error) {
        return toolError(error, headers, SYSTEMS_WRITE_SCOPES);
      }
    },
  );

  return server;
}

function getMcpAllowedOrigins() {
  const configured = process.env.REPLOFY_CHATGPT_APP_ALLOWED_ORIGINS?.trim();
  if (configured) {
    return new Set(configured.split(',').map((origin) => origin.trim().replace(/\/+$/, '')).filter(Boolean));
  }

  const origins = new Set([
    'https://chatgpt.com',
    'https://chat.openai.com',
    'http://localhost:4000',
    'http://localhost:4100',
  ]);
  for (const origin of (process.env.REPLOFY_TRUSTED_ORIGINS || '').split(',')) {
    const normalized = origin.trim().replace(/\/+$/, '');
    if (normalized) origins.add(normalized);
  }
  const widgetDomain = process.env.REPLOFY_CHATGPT_APP_WIDGET_DOMAIN?.trim();
  if (widgetDomain) {
    try {
      origins.add(new URL(widgetDomain).origin);
    } catch {
      // Invalid widget origins are handled by the application configuration.
    }
  }
  return origins;
}

function setMcpCorsHeaders(res: McpHttpResponse, req: McpHttpRequest) {
  const requestOrigin = getHeaderValue(req.headers, 'origin')?.trim().replace(/\/+$/, '');
  if (requestOrigin && getMcpAllowedOrigins().has(requestOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'accept, authorization, content-type, last-event-id, mcp-protocol-version, mcp-session-id, x-api-key',
  );
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, WWW-Authenticate');
}

function buildWebRequest(req: McpHttpRequest, body: unknown) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers || {})) {
    if (Array.isArray(value)) {
      headers.set(name, value.join(', '));
      continue;
    }

    if (typeof value === 'string') {
      headers.set(name, value);
    }
  }

  const host = headers.get('x-forwarded-host') || headers.get('host') || 'localhost';
  const proto = headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  const url = new URL(req.url || MCP_PATH, `${proto}://${host}`);
  const method = req.method?.toUpperCase() || 'GET';
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers.set('accept', 'application/json, text/event-stream');
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
  }

  const init: RequestInit = {
    method,
    headers,
  };

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && body !== undefined) {
    init.body = JSON.stringify(body);
  }

  return new Request(url, init);
}

async function writeWebResponse(res: McpHttpResponse, response: Response) {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    headers[name] = value;
  });

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream') && response.body) {
    res.writeHead(response.status, headers);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    res.end(text);
    return;
  }

  res.writeHead(response.status, headers);
  res.end(await response.text());
}

function exposeTopLevelSecuritySchemes(body: string) {
  if (!body.trim()) return body;

  try {
    const payload = JSON.parse(body) as {
      result?: {
        tools?: Array<{
          securitySchemes?: unknown;
          _meta?: {
            securitySchemes?: unknown;
          };
        }>;
      };
    };
    const tools = payload.result?.tools;
    if (!Array.isArray(tools)) return body;

    // The MCP SDK currently drops this Apps SDK extension from the top level.
    for (const tool of tools) {
      if (tool.securitySchemes === undefined && tool._meta?.securitySchemes !== undefined) {
        tool.securitySchemes = tool._meta.securitySchemes;
      }
    }

    return JSON.stringify(payload);
  } catch {
    return body;
  }
}

async function writeMcpResponse(res: McpHttpResponse, response: Response, rpcMethod: string) {
  if (rpcMethod !== 'tools/list') {
    await writeWebResponse(res, response);
    return;
  }

  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    headers[name] = value;
  });

  const body = exposeTopLevelSecuritySchemes(await response.text());
  headers['content-type'] = headers['content-type'] || 'application/json; charset=utf-8';
  headers['cache-control'] = headers['cache-control'] || 'no-store';
  delete headers['content-length'];
  res.writeHead(response.status, headers);
  res.end(body);
}

export async function handleReplofyMcpRequest(req: McpHttpRequest, res: McpHttpResponse, body?: unknown) {
  const method = req.method?.toUpperCase() || 'GET';
  setMcpCorsHeaders(res, req);
  const url = new URL(req.url || MCP_PATH, 'http://localhost');
  const rpcMethod =
    body && typeof body === 'object' && 'method' in body && typeof (body as { method?: unknown }).method === 'string'
      ? (body as { method: string }).method
      : 'unknown';
  const resourceUri = getMcpResourceUri(body);
  const toolName =
    body &&
    typeof body === 'object' &&
    'params' in body &&
    typeof (body as { params?: unknown }).params === 'object' &&
    (body as { params?: Record<string, unknown> }).params &&
    typeof (body as { params: Record<string, unknown> }).params.name === 'string'
      ? (body as { params: { name: string } }).params.name
      : undefined;

  if (method === 'POST') {
    logMcpAuthEvent('request_received', {
      rpcMethod,
      toolName,
      resourceUri,
      hasAuthorization: Boolean(getHeaderValue(req.headers, 'authorization')),
      hasApiKey: Boolean(getHeaderValue(req.headers, 'x-api-key')),
      authMode: process.env.REPLOFY_CHATGPT_APP_AUTH_MODE || 'unset',
    });
  }

  if (method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  if (method === 'GET' && url.pathname.endsWith('/health')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200).end(JSON.stringify({ ok: true, service: 'replofy-os-mcp' }));
    return;
  }

  if (method === 'GET' && url.pathname === `${MCP_PATH}/.well-known/oauth-protected-resource`) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200).end(JSON.stringify(getProtectedResourceMetadata(req.headers)));
    return;
  }

  if (method === 'GET' && url.pathname === `${MCP_PATH}/.well-known/oauth-authorization-server`) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200).end(JSON.stringify(getAuthorizationServerMetadata(req.headers)));
    return;
  }

  if (method === 'GET' && url.pathname === `${MCP_PATH}/.well-known/openid-configuration`) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(404).end(
      JSON.stringify({
        error: 'not_found',
        error_description: 'This Replofy OS connector supports OAuth 2.1, not OpenID Connect.',
      }),
    );
    return;
  }

  const isPublicMcpMetadata =
    method === 'GET' &&
    (url.pathname === `${MCP_PATH}/.well-known/oauth-protected-resource` ||
      url.pathname === `${MCP_PATH}/.well-known/oauth-authorization-server` ||
      url.pathname === `${MCP_PATH}/.well-known/openid-configuration`);

  if (
    isOAuthMode() &&
    !isPublicMcpMetadata &&
    shouldEnforceTransportAuth(rpcMethod, body) &&
    !(await enforceMcpResourceAuth(req, res, body, authScopesForRequest(rpcMethod, toolName)))
  ) {
    return;
  }

  const allowedMethods = new Set(['POST', 'GET', 'DELETE']);
  if (!allowedMethods.has(method)) {
    res.setHeader('Allow', 'POST, GET, DELETE, OPTIONS');
    res.writeHead(405).end('Method not allowed');
    return;
  }

  const server = createReplofyChatGptMcpServer(req.headers);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(buildWebRequest(req, body), { parsedBody: body });
    await writeMcpResponse(res, response, rpcMethod);
  } catch (error) {
    console.error('[replofy-os] MCP request failed:', error);
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.writeHead(500).end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        }),
      );
    }
  } finally {
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
}
