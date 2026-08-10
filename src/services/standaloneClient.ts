import type {
  Account,
  ApiEndpoint,
  BusinessPlan,
  BlogArticle,
  Bug,
  ChatReadState,
  CreativeAsset,
  CreativeItem,
  ContextSource,
  ContextSourceVersion,
  CycleGoal,
  EnvironmentState,
  Lead,
  Feedback,
  OperatorDesk,
  OperatorApproval,
  OperatorMemory,
  OperatorOutput,
  OperatorWorkOrder,
  RoadmapItem,
  Prompt,
  SeoKeyword,
  SocialPost,
  Task,
  TeamChatChannel,
  TeamChatMessage,
  TeamChatParticipant,
  TimeBlock,
  Vision,
} from '../types';

type CollectionResponse<T> = { data: T[] };

export type StandaloneWorkspace = {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'admin' | 'member';
  createdAt: string;
};

export type StandaloneWorkspaceState = {
  activeWorkspaceId: string | null;
  workspaces: StandaloneWorkspace[];
};

export type StandaloneMember = {
  id: string;
  email: string;
  displayName: string;
  role: 'owner' | 'admin' | 'member';
  workspaceId: string;
  companyId: string;
  onboardingCompleted: true;
  createdAt: string;
};

export type StandaloneInvitation = {
  id: string;
  email: string;
  role: 'admin' | 'member';
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  expiresAt: string;
  createdAt?: string;
  acceptUrl?: string;
};

export type StandaloneApiKeyScope =
  | 'workspace:read'
  | 'workspace:write'
  | 'execution:read'
  | 'execution:write'
  | 'members:read'
  | 'events:read'
  | 'chat:read'
  | 'chat:write'
  | 'content:read'
  | 'content:write'
  | 'operators:read'
  | 'operators:write'
  | 'creative:read'
  | 'creative:write'
  | 'growth:read'
  | 'growth:write'
  | 'technical:read'
  | 'technical:write'
  | 'systems:read'
  | 'systems:write'
  | 'ai:read'
  | 'ai:write'
  | 'ai:approve'
  | 'ai:admin';

export type StandaloneEnvironmentDeployment = {
  id: string;
  environmentId: string;
  action: 'deploy' | 'rollback';
  status: 'succeeded' | 'failed';
  version: string;
  previousVersion: string | null;
  message: string;
  requestedByUserId: string;
  createdAt: string;
  companyId: string;
};

export type StandaloneBusinessPlanEditingSession = {
  sessionId: string;
  userId: string;
  displayName: string;
  color: string;
  planId: string;
  activeBlockId: string;
  createdAt: string;
  updatedAt: string;
};

export type StandaloneContextSourceItem = {
  id: string;
  sourceId: string;
  sourceVersionId: string;
  kind: string;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  status: 'proposed' | 'accepted' | 'rejected' | 'archived';
  createdAt: string;
  updatedAt: string;
  authorId: string;
  companyId: string;
};

export type StandaloneContextSourceFolder = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  companyId: string;
};

export type StandaloneWeekMarker = {
  id: string;
  weekNumber: number;
  status: 'active' | 'completed' | 'upcoming';
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  companyId: string;
};

export type StandaloneNotificationReadState = {
  userId: string;
  lastReadAt: string;
  companyId: string;
};

export type StandaloneApiKey = {
  id: string;
  label: string;
  prefix: string;
  scopes: StandaloneApiKeyScope[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  key?: string;
};

export type StandaloneWorkspaceEvent = {
  id: number;
  workspaceId: string;
  type: 'created' | 'updated' | 'deleted';
  resource: 'tasks' | 'cycle-goals' | 'visions';
  resourceId: string;
  occurredAt: string;
  data: unknown;
};

export type AIProviderId = 'gemini' | 'openai' | 'anthropic';
export type AIEngineStatus = 'inactive_missing_provider_key' | 'inactive_missing_model' | 'active' | 'degraded_memory' | 'provider_error';
export type AIContextMode = 'focused' | 'workspace' | 'deep';
export type AIContextStats = {
  mode: AIContextMode;
  memoryCount: number;
  sourceCount: number;
  projectedSourceCount: number;
  selectedRecordCount: number;
  conversationMessageCount: number;
  domainPartCount: number;
  projection: 'enabled' | 'database-fallback' | 'degraded';
};
export type AIProviderModel = {
  id: string;
  label: string;
  description: string | null;
  createdAt: string | null;
  contextWindow: number | null;
  capabilities: string[];
  recommended: boolean;
};
export type AIContextEnvelope = {
  route?: string;
  resourceType?: string;
  resourceId?: string;
  selectedRecords?: Record<string, unknown>[];
  attachments?: AIContextAttachment[];
  sourceIds?: string[];
  sourceVersionIds?: string[];
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  userPrompt: string;
  metadata?: Record<string, unknown>;
};
export type AIContextAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  dataUrl: string;
};
export type AIAction = {
  operation: 'create' | 'update' | 'draft' | 'link' | 'comment' | 'remember' | 'archive';
  resourceType: string;
  targetId?: string | null;
  payload: Record<string, unknown>;
  rationale: string;
  confidence: 'low' | 'medium' | 'high';
  sourceReferences: Record<string, unknown>[];
  requiresApproval: boolean;
};
export type AIMemoryMutation = {
  operation: 'create' | 'update' | 'merge' | 'expire' | 'archive';
  memoryId?: string;
  mergeMemoryIds: string[];
  scope: OperatorMemory['scope'];
  scopeId?: string | null;
  memoryType: OperatorMemory['memoryType'];
  content: string;
  confidence: OperatorMemory['confidence'];
  expiresAt?: string | null;
  pinned?: boolean;
  reason: string;
  sourceReferences: Record<string, unknown>[];
};
export type AIRunOutput = {
  answer: string;
  summary: string;
  actionability: 'actionable' | 'insufficient_evidence';
  assumptions: string[];
  sourceReferences: Record<string, unknown>[];
  actions: AIAction[];
  memoryMutations: AIMemoryMutation[];
};
export type AIRunResult = {
  runId: string;
  status: 'succeeded';
  output: AIRunOutput;
  proposalId: string | null;
  memoryResults: Record<string, unknown>[];
  usage: Record<string, unknown>;
  contextStats?: AIContextStats;
};
export type AISettingsResponse = {
  settings: {
    defaultProvider: AIProviderId | null;
    defaultModel: string | null;
    fallbackEnabled: boolean;
    memoryServiceUrl: string | null;
    memoryServiceStatus: string;
  };
  activation: {
    status: AIEngineStatus;
    provider: AIProviderId | null;
    model: string | null;
    credentialId: string | null;
    fallbackEnabled: boolean;
  };
  credentials: Array<{
    id: string;
    provider: AIProviderId;
    label: string;
    configured: boolean;
    lastTestedAt: string | null;
    lastError: string | null;
    createdAt: string;
  }>;
};

export class StandaloneApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'StandaloneApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'include',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new StandaloneApiError(body?.error || `Request failed with status ${response.status}.`, response.status);
  }
  return response.json() as Promise<T>;
}

function jsonRequest(method: 'POST' | 'PATCH' | 'PUT', body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}

export const standaloneClient = {
  setupStatus: () => request<{ needsBootstrap: boolean }>('/api/setup/status'),
  bootstrap: (input: {
    token: string;
    name: string;
    email: string;
    password: string;
    workspaceName: string;
    workspaceSlug: string;
  }) => request<{ user: { id: string; email: string; name: string } }>(
    '/api/setup/bootstrap',
    jsonRequest('POST', input),
  ),
  workspaces: () => request<StandaloneWorkspaceState>('/api/workspaces'),
  activateWorkspace: (workspaceId: string) =>
    request<{ activeWorkspaceId: string; role: StandaloneWorkspace['role'] }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/activate`,
      { method: 'POST' },
    ),
  listMembers: () => request<CollectionResponse<StandaloneMember>>('/api/v1/members'),
  listInvitations: () =>
    request<CollectionResponse<StandaloneInvitation>>('/api/v1/invitations'),
  createInvitation: (input: { email: string; role: 'admin' | 'member' }) =>
    request<StandaloneInvitation>('/api/v1/invitations', jsonRequest('POST', input)),
  listApiKeys: () => request<CollectionResponse<StandaloneApiKey>>('/api/v1/api-keys'),
  createApiKey: (input: { label: string; scopes: StandaloneApiKeyScope[]; expiresAt?: string }) =>
    request<StandaloneApiKey>('/api/v1/api-keys', jsonRequest('POST', input)),
  revokeApiKey: (keyId: string) =>
    request<{ id: string; revoked: true }>(`/api/v1/api-keys/${encodeURIComponent(keyId)}`, {
      method: 'DELETE',
    }),
  listTeamChatChannels: () =>
    request<CollectionResponse<TeamChatChannel>>('/api/v1/team-chat-channels'),
  createTeamChatChannel: (input: { name: string; topic?: string; participantIds?: string[] }) =>
    request<TeamChatChannel>('/api/v1/team-chat-channels', jsonRequest('POST', input)),
  listTeamChatParticipants: () =>
    request<CollectionResponse<TeamChatParticipant>>('/api/v1/team-chat-participants'),
  createTeamChatParticipant: (input: {
    displayName: string;
    participantType: 'team-member' | 'ai-agent';
    linkedUserId?: string;
    description?: string;
  }) => request<TeamChatParticipant>('/api/v1/team-chat-participants', jsonRequest('POST', input)),
  addTeamChatParticipant: (channelId: string, participantId: string) =>
    request<{ data: TeamChatChannel }>(
      `/api/v1/team-chat/channels/${encodeURIComponent(channelId)}/participants`,
      jsonRequest('POST', { participantId }),
    ),
  listTeamChatMessages: (channelId: string) =>
    request<CollectionResponse<TeamChatMessage>>(
      `/api/v1/team-chat/messages?channelId=${encodeURIComponent(channelId)}&limit=100`,
    ),
  createTeamChatMessage: (input: {
    channelId: string;
    participantId: string;
    content: string;
    replyToMessageId?: string;
  }) => request<TeamChatMessage>('/api/v1/team-chat-messages', jsonRequest('POST', input)),
  listBlogArticles: () =>
    request<CollectionResponse<BlogArticle>>('/api/v1/blog-articles?limit=100'),
  createBlogArticle: (input: {
    title: string;
    summary?: string;
    content?: string;
    status?: BlogArticle['status'];
    roadmapPhase?: BlogArticle['roadmapPhase'];
    priority?: BlogArticle['priority'];
    tags?: string[];
  }) => request<BlogArticle>('/api/v1/blog-articles', jsonRequest('POST', input)),
  updateBlogArticle: (articleId: string, input: Partial<BlogArticle>) =>
    request<BlogArticle>(
      `/api/v1/blog-articles/${encodeURIComponent(articleId)}`,
      jsonRequest('PATCH', input),
    ),
  deleteBlogArticle: (articleId: string) =>
    request<{ id: string; deleted: true }>(
      `/api/v1/blog-articles/${encodeURIComponent(articleId)}`,
      { method: 'DELETE' },
    ),
  listPrompts: () => request<CollectionResponse<Prompt>>('/api/v1/prompts'),
  createPrompt: (input: Partial<Prompt> & { title: string; content: string }) =>
    request<Prompt>('/api/v1/prompts', jsonRequest('POST', input)),
  updatePrompt: (promptId: string, input: Partial<Prompt>) => request<Prompt>(
    `/api/v1/prompts/${encodeURIComponent(promptId)}`,
    jsonRequest('PATCH', input),
  ),
  deletePrompt: (promptId: string) => request<{ id: string; deleted: true }>(
    `/api/v1/prompts/${encodeURIComponent(promptId)}`,
    { method: 'DELETE' },
  ),
  listSocialPosts: () => request<CollectionResponse<SocialPost>>('/api/v1/social-posts'),
  createSocialPost: (input: Partial<SocialPost> & { content: string }) =>
    request<SocialPost>('/api/v1/social-posts', jsonRequest('POST', input)),
  updateSocialPost: (postId: string, input: Partial<SocialPost>) => request<SocialPost>(
    `/api/v1/social-posts/${encodeURIComponent(postId)}`,
    jsonRequest('PATCH', input),
  ),
  deleteSocialPost: (postId: string) => request<{ id: string; deleted: true }>(
    `/api/v1/social-posts/${encodeURIComponent(postId)}`,
    { method: 'DELETE' },
  ),
  listSeoKeywords: () => request<CollectionResponse<SeoKeyword>>('/api/v1/seo-keywords'),
  createSeoKeyword: (input: Partial<SeoKeyword> & { keyword: string }) =>
    request<SeoKeyword>('/api/v1/seo-keywords', jsonRequest('POST', input)),
  updateSeoKeyword: (keywordId: string, input: Partial<SeoKeyword>) => request<SeoKeyword>(
    `/api/v1/seo-keywords/${encodeURIComponent(keywordId)}`,
    jsonRequest('PATCH', input),
  ),
  deleteSeoKeyword: (keywordId: string) => request<{ id: string; deleted: true }>(
    `/api/v1/seo-keywords/${encodeURIComponent(keywordId)}`,
    { method: 'DELETE' },
  ),
  listFeedback: () => request<CollectionResponse<Feedback>>('/api/v1/feedbacks'),
  createFeedback: (input: Partial<Feedback> & { content: string }) =>
    request<Feedback>('/api/v1/feedbacks', jsonRequest('POST', input)),
  updateFeedback: (feedbackId: string, input: Partial<Feedback>) => request<Feedback>(
    `/api/v1/feedbacks/${encodeURIComponent(feedbackId)}`,
    jsonRequest('PATCH', input),
  ),
  deleteFeedback: (feedbackId: string) => request<{ id: string; deleted: true }>(
    `/api/v1/feedbacks/${encodeURIComponent(feedbackId)}`,
    { method: 'DELETE' },
  ),
  listTimeBlocks: () => request<CollectionResponse<TimeBlock>>('/api/v1/time-blocks'),
  createTimeBlock: (input: Partial<TimeBlock> & { title: string; startTime: string; endTime: string }) =>
    request<TimeBlock>('/api/v1/time-blocks', jsonRequest('POST', input)),
  updateTimeBlock: (timeBlockId: string, input: Partial<TimeBlock>) => request<TimeBlock>(
    `/api/v1/time-blocks/${encodeURIComponent(timeBlockId)}`,
    jsonRequest('PATCH', input),
  ),
  deleteTimeBlock: (timeBlockId: string) => request<{ id: string; deleted: true }>(
    `/api/v1/time-blocks/${encodeURIComponent(timeBlockId)}`,
    { method: 'DELETE' },
  ),
  listWeekMarkers: () => request<CollectionResponse<StandaloneWeekMarker>>('/api/v1/week-markers'),
  createWeekMarker: (input: { weekNumber: number; status?: StandaloneWeekMarker['status']; startedAt?: string; endedAt?: string | null }) =>
    request<StandaloneWeekMarker>('/api/v1/week-markers', jsonRequest('POST', input)),
  updateWeekMarker: (markerId: string, input: Partial<StandaloneWeekMarker>) => request<StandaloneWeekMarker>(
    `/api/v1/week-markers/${encodeURIComponent(markerId)}`,
    jsonRequest('PATCH', input),
  ),
  deleteWeekMarker: (markerId: string) => request<{ id: string; deleted: true }>(
    `/api/v1/week-markers/${encodeURIComponent(markerId)}`,
    { method: 'DELETE' },
  ),
  listChatReadStates: () => request<CollectionResponse<ChatReadState>>('/api/v1/chat-read-states'),
  upsertChatReadState: (input: { channelId: string; lastReadAt: string }) => request<ChatReadState>(
    '/api/v1/chat-read-states',
    { method: 'PUT', body: JSON.stringify(input) },
  ),
  getNotificationReadState: () => request<StandaloneNotificationReadState | null>('/api/v1/notification-read-state'),
  upsertNotificationReadState: (lastReadAt: string) => request<StandaloneNotificationReadState>(
    '/api/v1/notification-read-state',
    { method: 'PUT', body: JSON.stringify({ lastReadAt }) },
  ),
  listCreativeItems: () =>
    request<CollectionResponse<CreativeItem>>('/api/v1/creative-items'),
  createCreativeItem: (input: Partial<CreativeItem> & { title: string }) =>
    request<CreativeItem>('/api/v1/creative-items', jsonRequest('POST', input)),
  updateCreativeItem: (itemId: string, input: Partial<CreativeItem>) =>
    request<CreativeItem>(
      `/api/v1/creative-items/${encodeURIComponent(itemId)}`,
      jsonRequest('PATCH', input),
    ),
  deleteCreativeItem: (itemId: string) =>
    request<{ id: string; deleted: true }>(
      `/api/v1/creative-items/${encodeURIComponent(itemId)}`,
      { method: 'DELETE' },
    ),
  listCreativeAssets: () =>
    request<CollectionResponse<CreativeAsset>>('/api/v1/creative-assets'),
  uploadCreativeAsset: (file: File, input: {
    creativeId?: string | null;
    title?: string;
    assetType?: CreativeAsset['assetType'];
  } = {}) =>
    request<CreativeAsset>('/api/v1/creative-assets/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-File-Name': file.name,
        'X-File-Content-Type': file.type || 'application/octet-stream',
        'X-File-Size': String(file.size),
        ...(input.creativeId ? { 'X-Creative-Id': input.creativeId } : {}),
        ...(input.title ? { 'X-Asset-Title': input.title } : {}),
        ...(input.assetType ? { 'X-Asset-Type': input.assetType } : {}),
      },
      body: file,
    }),
  listBusinessPlans: () => request<CollectionResponse<BusinessPlan>>('/api/v1/business-plans'),
  getBusinessPlan: (planId: string) => request<BusinessPlan>(
    `/api/v1/business-plans/${encodeURIComponent(planId)}`,
  ),
  createBusinessPlan: (input: Partial<BusinessPlan> & { title: string }) => request<BusinessPlan>(
    '/api/v1/business-plans',
    jsonRequest('POST', input),
  ),
  updateBusinessPlan: (planId: string, input: Partial<BusinessPlan>) => request<BusinessPlan>(
    `/api/v1/business-plans/${encodeURIComponent(planId)}`,
    jsonRequest('PATCH', input),
  ),
  deleteBusinessPlan: (planId: string) => request<{ id: string; deleted: true }>(
    `/api/v1/business-plans/${encodeURIComponent(planId)}`,
    { method: 'DELETE' },
  ),
  listBusinessPlanSessions: (planId: string) => request<CollectionResponse<StandaloneBusinessPlanEditingSession>>(
    `/api/v1/business-plans/${encodeURIComponent(planId)}/editing-sessions`,
  ),
  upsertBusinessPlanSession: (planId: string, input: {
    sessionId: string;
    displayName: string;
    color: string;
    activeBlockId: string;
  }) => request<StandaloneBusinessPlanEditingSession>(
    `/api/v1/business-plans/${encodeURIComponent(planId)}/editing-sessions`,
    jsonRequest('POST', input),
  ),
  updateBusinessPlanSession: (planId: string, sessionId: string, input: Partial<StandaloneBusinessPlanEditingSession>) => request<StandaloneBusinessPlanEditingSession>(
    `/api/v1/business-plans/${encodeURIComponent(planId)}/editing-sessions/${encodeURIComponent(sessionId)}`,
    jsonRequest('PATCH', input),
  ),
  deleteBusinessPlanSession: (planId: string, sessionId: string) => request<{ sessionId: string; deleted: true }>(
    `/api/v1/business-plans/${encodeURIComponent(planId)}/editing-sessions/${encodeURIComponent(sessionId)}`,
    { method: 'DELETE' },
  ),
  updateCreativeAsset: (assetId: string, input: {
    creativeId?: string | null;
    title?: string;
    status?: CreativeAsset['status'];
  }) => request<CreativeAsset>(
    `/api/v1/creative-assets/${encodeURIComponent(assetId)}`,
    jsonRequest('PATCH', input),
  ),
  creativeAssetDownloadUrl: (assetId: string) =>
    `/api/v1/creative-assets/${encodeURIComponent(assetId)}/content`,
  listAccounts: () => request<CollectionResponse<Account>>('/api/v1/accounts'),
  createAccount: (input: Partial<Account> & { name: string }) =>
    request<Account>('/api/v1/accounts', jsonRequest('POST', input)),
  updateAccount: (accountId: string, input: Partial<Account>) =>
    request<Account>(`/api/v1/accounts/${encodeURIComponent(accountId)}`, jsonRequest('PATCH', input)),
  deleteAccount: (accountId: string) =>
    request<{ id: string; deleted: true }>(`/api/v1/accounts/${encodeURIComponent(accountId)}`, {
      method: 'DELETE',
    }),
  listLeads: () => request<CollectionResponse<Lead>>('/api/v1/leads'),
  createLead: (input: Partial<Lead> & { name: string }) =>
    request<Lead>('/api/v1/leads', jsonRequest('POST', input)),
  updateLead: (leadId: string, input: Partial<Lead>) =>
    request<Lead>(`/api/v1/leads/${encodeURIComponent(leadId)}`, jsonRequest('PATCH', input)),
  deleteLead: (leadId: string) =>
    request<{ id: string; deleted: true }>(`/api/v1/leads/${encodeURIComponent(leadId)}`, {
      method: 'DELETE',
    }),
  listBugs: () => request<CollectionResponse<Bug>>('/api/v1/bugs'),
  createBug: (input: Partial<Bug> & { title: string }) =>
    request<Bug>('/api/v1/bugs', jsonRequest('POST', input)),
  updateBug: (bugId: string, input: Partial<Bug>) =>
    request<Bug>(`/api/v1/bugs/${encodeURIComponent(bugId)}`, jsonRequest('PATCH', input)),
  deleteBug: (bugId: string) =>
    request<{ id: string; deleted: true }>(`/api/v1/bugs/${encodeURIComponent(bugId)}`, {
      method: 'DELETE',
    }),
  listRoadmapItems: () => request<CollectionResponse<RoadmapItem>>('/api/v1/roadmap-items'),
  createRoadmapItem: (input: Partial<RoadmapItem> & { title: string }) =>
    request<RoadmapItem>('/api/v1/roadmap-items', jsonRequest('POST', input)),
  updateRoadmapItem: (itemId: string, input: Partial<RoadmapItem>) =>
    request<RoadmapItem>(
      `/api/v1/roadmap-items/${encodeURIComponent(itemId)}`,
      jsonRequest('PATCH', input),
    ),
  deleteRoadmapItem: (itemId: string) =>
    request<{ id: string; deleted: true }>(`/api/v1/roadmap-items/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
    }),
  listApiEndpoints: () => request<CollectionResponse<ApiEndpoint>>('/api/v1/api-endpoints'),
  getApiEndpoint: (endpointId: string) => request<ApiEndpoint>(
    `/api/v1/api-endpoints/${encodeURIComponent(endpointId)}`,
  ),
  createApiEndpoint: (input: Partial<ApiEndpoint> & { path: string; description: string }) =>
    request<ApiEndpoint>('/api/v1/api-endpoints', jsonRequest('POST', input)),
  updateApiEndpoint: (endpointId: string, input: Partial<ApiEndpoint>) => request<ApiEndpoint>(
    `/api/v1/api-endpoints/${encodeURIComponent(endpointId)}`,
    jsonRequest('PATCH', input),
  ),
  deleteApiEndpoint: (endpointId: string) => request<{ id: string; deleted: true }>(
    `/api/v1/api-endpoints/${encodeURIComponent(endpointId)}`,
    { method: 'DELETE' },
  ),
  listEnvironments: () => request<CollectionResponse<EnvironmentState>>('/api/v1/environments'),
  getEnvironment: (environmentId: string) => request<EnvironmentState>(
    `/api/v1/environments/${encodeURIComponent(environmentId)}`,
  ),
  createEnvironment: (input: { name: EnvironmentState['name']; version?: string }) =>
    request<EnvironmentState>('/api/v1/environments', jsonRequest('POST', input)),
  updateEnvironment: (environmentId: string, input: Partial<EnvironmentState>) => request<EnvironmentState>(
    `/api/v1/environments/${encodeURIComponent(environmentId)}`,
    jsonRequest('PATCH', input),
  ),
  deployEnvironment: (environmentId: string, input: { version: string; message?: string }) => request<{
    environment: EnvironmentState;
    deployment: StandaloneEnvironmentDeployment;
  }>(
    `/api/v1/environments/${encodeURIComponent(environmentId)}/deploy`,
    jsonRequest('POST', input),
  ),
  rollbackEnvironment: (environmentId: string, input: { targetVersion?: string; message?: string } = {}) => request<{
    environment: EnvironmentState;
    deployment: StandaloneEnvironmentDeployment;
  }>(
    `/api/v1/environments/${encodeURIComponent(environmentId)}/rollback`,
    jsonRequest('POST', input),
  ),
  listEnvironmentDeployments: (environmentId?: string) => request<CollectionResponse<StandaloneEnvironmentDeployment>>(
    `/api/v1/environment-deployments${environmentId ? `?environmentId=${encodeURIComponent(environmentId)}` : ''}`,
  ),
  listContextSources: () => request<CollectionResponse<ContextSource>>('/api/v1/context-sources'),
  getContextSource: (sourceId: string) => request<ContextSource>(
    `/api/v1/context-sources/${encodeURIComponent(sourceId)}`,
  ),
  updateContextSource: (sourceId: string, input: Partial<ContextSource>) => request<ContextSource>(
    `/api/v1/context-sources/${encodeURIComponent(sourceId)}`,
    jsonRequest('PATCH', input),
  ),
  listContextSourceVersions: (sourceId: string) => request<CollectionResponse<ContextSourceVersion>>(
    `/api/v1/context-sources/${encodeURIComponent(sourceId)}/versions`,
  ),
  getContextSourceVersion: (versionId: string) => request<ContextSourceVersion>(
    `/api/v1/context-source-versions/${encodeURIComponent(versionId)}`,
  ),
  listContextSourceItems: (sourceId?: string) => request<CollectionResponse<StandaloneContextSourceItem>>(
    `/api/v1/context-source-items${sourceId ? `?sourceId=${encodeURIComponent(sourceId)}` : ''}`,
  ),
  updateContextSourceItem: (itemId: string, status: StandaloneContextSourceItem['status']) => request<StandaloneContextSourceItem>(
    `/api/v1/context-source-items/${encodeURIComponent(itemId)}`,
    jsonRequest('PATCH', { status }),
  ),
  listContextSourceFolders: () => request<CollectionResponse<StandaloneContextSourceFolder>>('/api/v1/context-source-folders'),
  createContextSourceFolder: (name: string) => request<StandaloneContextSourceFolder>(
    '/api/v1/context-source-folders',
    jsonRequest('POST', { name }),
  ),
  extractContext: (input: { fileName: string; content: string; mimeType?: string }) => request<{
    fileName: string;
    mimeType: string;
    fileSize: number;
    contentHash: string;
    payload: Record<string, unknown>;
    usedGemini: boolean;
    model: string;
    warning?: string;
  }>('/api/v1/context-ingestions/extract', jsonRequest('POST', input)),
  ingestContext: (input: { fileName: string; content: string; mimeType?: string; payload?: Record<string, unknown> }) => request<{
    result: Record<string, unknown>;
    extraction: Record<string, unknown> | null;
  }>('/api/v1/context-ingestions', jsonRequest('POST', input)),
  listOperatorDesks: () =>
    request<CollectionResponse<OperatorDesk>>('/api/v1/operator-desks'),
  createOperatorDesk: (input: {
    name: string;
    mission: string;
    type?: OperatorDesk['type'];
    approvalMode?: OperatorDesk['approvalMode'];
    allowedOutputTypes?: OperatorDesk['allowedOutputTypes'];
  }) => request<OperatorDesk>('/api/v1/operator-desks', jsonRequest('POST', input)),
  updateOperatorDesk: (deskId: string, input: Partial<OperatorDesk>) =>
    request<OperatorDesk>(
      `/api/v1/operator-desks/${encodeURIComponent(deskId)}`,
      jsonRequest('PATCH', input),
    ),
  listOperatorWorkOrders: (deskId?: string) =>
    request<CollectionResponse<OperatorWorkOrder>>(
      `/api/v1/operator-work-orders${deskId ? `?operatorDeskId=${encodeURIComponent(deskId)}` : ''}`,
    ),
  createOperatorWorkOrder: (input: {
    operatorDeskId: string;
    title: string;
    brief: string;
    priority?: OperatorWorkOrder['priority'];
    expectedOutputTypes?: OperatorWorkOrder['expectedOutputTypes'];
    assignedExternalAgent?: string | null;
  }) => request<OperatorWorkOrder>('/api/v1/operator-work-orders', jsonRequest('POST', input)),
  updateOperatorWorkOrder: (workOrderId: string, input: Partial<OperatorWorkOrder>) =>
    request<OperatorWorkOrder>(
      `/api/v1/operator-work-orders/${encodeURIComponent(workOrderId)}`,
      jsonRequest('PATCH', input),
    ),
  claimOperatorWorkOrder: (workOrderId: string, externalAgentName: string) =>
    request<OperatorWorkOrder>(
      `/api/v1/operator-work-orders/${encodeURIComponent(workOrderId)}/claim`,
      jsonRequest('POST', { externalAgentName }),
    ),
  releaseOperatorWorkOrder: (workOrderId: string, externalAgentName: string) =>
    request<OperatorWorkOrder>(
      `/api/v1/operator-work-orders/${encodeURIComponent(workOrderId)}/release`,
      jsonRequest('POST', { externalAgentName }),
    ),
  listOperatorMemories: () =>
    request<CollectionResponse<OperatorMemory>>('/api/v1/operator-memories'),
  createOperatorMemory: (input: {
    scope: OperatorMemory['scope'];
    scopeId?: string | null;
    memoryType?: OperatorMemory['memoryType'];
    state?: OperatorMemory['state'];
    content: string;
    confidence?: OperatorMemory['confidence'];
  }) => request<OperatorMemory>('/api/v1/operator-memories', jsonRequest('POST', input)),
  transitionOperatorMemory: (
    memoryId: string,
    action: 'approve' | 'reject' | 'archive' | 'restore',
  ) => request<{ data: OperatorMemory; idempotent: boolean }>(
    `/api/v1/operator-memories/${encodeURIComponent(memoryId)}/${action}`,
    jsonRequest('POST', {}),
  ),
  listOperatorOutputs: () =>
    request<CollectionResponse<OperatorOutput>>('/api/v1/operator-outputs'),
  submitOperatorOutput: (input: {
    operatorDeskId: string;
    workOrderId?: string | null;
    externalAgentName: string;
    outputType: OperatorOutput['outputType'];
    title: string;
    summary: string;
    content: string;
    structuredPayload?: Record<string, unknown>;
    suggestedDestinations?: string[];
    confidence?: OperatorOutput['confidence'];
  }) => request<{
    data: OperatorOutput;
    routes: Array<{
      approval: OperatorApproval | null;
      injection: Record<string, unknown>;
      target?: { hub: string; id: string };
    }>;
  }>('/api/v1/operator-outputs', jsonRequest('POST', input)),
  listOperatorApprovals: () =>
    request<CollectionResponse<OperatorApproval>>('/api/v1/operator-approvals'),
  approveOperatorApproval: (approvalId: string, summary?: string) =>
    request<{ data: OperatorApproval; idempotent: boolean; target?: { hub: string; id: string } }>(
      `/api/v1/operator-approvals/${encodeURIComponent(approvalId)}/approve`,
      jsonRequest('POST', summary ? { summary } : {}),
    ),
  rejectOperatorApproval: (approvalId: string, reason: string) =>
    request<{ data: OperatorApproval; idempotent: boolean }>(
      `/api/v1/operator-approvals/${encodeURIComponent(approvalId)}/reject`,
      jsonRequest('POST', { reason }),
    ),
  getAIStatus: () => request<{
    status: AIEngineStatus;
    provider: AIProviderId | null;
    model: string | null;
    credentialId: string | null;
    fallbackEnabled: boolean;
    memoryProjection: string;
    active: boolean;
  }>('/api/v1/ai/status'),
  getAISettings: () => request<AISettingsResponse>('/api/v1/ai/settings'),
  listAIProviders: () => request<{ data: Array<{ provider: AIProviderId; configured: boolean; credential: Record<string, unknown> | null }> }>('/api/v1/ai/providers'),
  listAIProviderModels: (provider: AIProviderId) => request<{ data: AIProviderModel[]; provider: AIProviderId; fetchedAt: string }>(
    `/api/v1/ai/providers/${provider}/models`,
  ),
  updateAISettings: (input: {
    defaultProvider?: AIProviderId | null;
    defaultModel?: string | null;
    fallbackEnabled?: boolean;
    memoryServiceUrl?: string | null;
  }) => request<AISettingsResponse>('/api/v1/ai/settings', { method: 'PUT', body: JSON.stringify(input) }),
  saveAIProviderKey: (provider: AIProviderId, apiKey: string, label?: string) => request<{
    id: string;
    provider: AIProviderId;
    label: string;
    configured: boolean;
    lastTestedAt: string | null;
    lastError: string | null;
  }>(`/api/v1/ai/providers/${provider}`, jsonRequest('PUT', { apiKey, label })),
  deleteAIProviderKey: (provider: AIProviderId) => request<{ id: string | null; deleted: boolean }>(
    `/api/v1/ai/providers/${provider}`,
    { method: 'DELETE' },
  ),
  testAIProvider: (provider: AIProviderId, model: string) => request<{ ok: true; provider: AIProviderId; model: string }>(
    `/api/v1/ai/providers/${provider}/test`,
    jsonRequest('POST', { model }),
  ),
  listAIAgents: () => request<CollectionResponse<Record<string, unknown>>>('/api/v1/ai/agents'),
  createAIAgent: (input: Record<string, unknown>) => request<Record<string, unknown>>('/api/v1/ai/agents', jsonRequest('POST', input)),
  updateAIAgent: (id: string, input: Record<string, unknown>) => request<Record<string, unknown>>(`/api/v1/ai/agents/${encodeURIComponent(id)}`, jsonRequest('PATCH', input)),
  runAI: (input: { surface?: 'chat' | 'analyze' | 'inline' | 'operator' | 'system'; context: AIContextEnvelope; agentProfileId?: string }) => request<AIRunResult>('/api/v1/ai/runs', jsonRequest('POST', input)),
  analyzeWithAI: (context: AIContextEnvelope, agentProfileId?: string) => request<AIRunResult>('/api/v1/ai/analyze', jsonRequest('POST', { context, agentProfileId })),
  listAIRuns: () => request<CollectionResponse<Record<string, unknown>>>('/api/v1/ai/runs'),
  enqueueAIJob: (input: {
    type: 'analyze_source' | 'generate_proposal' | 'apply_memory_mutations' | 'index_memory' | 'index_context' | 'reindex_workspace' | 'delete_source_projection' | 'learn_patterns';
    payload?: Record<string, unknown>;
    runId?: string;
    idempotencyKey?: string;
  }) => request<Record<string, unknown>>('/api/v1/ai/jobs', jsonRequest('POST', input)),
  createAIChatSession: (title?: string, context?: Record<string, unknown>) => request<Record<string, unknown>>('/api/v1/ai/chat/sessions', jsonRequest('POST', { title, context })),
  listAIChatSessions: () => request<CollectionResponse<Record<string, unknown>>>('/api/v1/ai/chat/sessions'),
  listAIChatMessages: (sessionId: string) => request<CollectionResponse<Record<string, unknown>>>(`/api/v1/ai/chat/sessions/${encodeURIComponent(sessionId)}/messages`),
  sendAIChatMessage: (sessionId: string, content: string, context?: Partial<AIContextEnvelope>) => request<{
    userMessage: Record<string, unknown>;
    assistantMessage: Record<string, unknown>;
    run: AIRunResult;
  }>(`/api/v1/ai/chat/sessions/${encodeURIComponent(sessionId)}/messages`, jsonRequest('POST', { content, context })),
  listAIProposals: () => request<CollectionResponse<Record<string, unknown>>>('/api/v1/ai/proposals'),
  getAIProposal: (id: string) => request<Record<string, unknown>>(`/api/v1/ai/proposals/${encodeURIComponent(id)}`),
  approveAIProposalAction: (proposalId: string, actionId: string) => request<Record<string, unknown>>(`/api/v1/ai/proposals/${encodeURIComponent(proposalId)}/actions/${encodeURIComponent(actionId)}/approve`, jsonRequest('POST', {})),
  rejectAIProposalAction: (proposalId: string, actionId: string) => request<Record<string, unknown>>(`/api/v1/ai/proposals/${encodeURIComponent(proposalId)}/actions/${encodeURIComponent(actionId)}/reject`, jsonRequest('POST', {})),
  editAIProposalAction: (proposalId: string, actionId: string, input: { payload?: Record<string, unknown>; rationale?: string }) => request<Record<string, unknown>>(`/api/v1/ai/proposals/${encodeURIComponent(proposalId)}/actions/${encodeURIComponent(actionId)}`, jsonRequest('PATCH', input)),
  applyAIProposalAction: (proposalId: string, actionId: string) => request<Record<string, unknown>>(`/api/v1/ai/proposals/${encodeURIComponent(proposalId)}/actions/${encodeURIComponent(actionId)}/apply`, jsonRequest('POST', {})),
  applyAIProposal: (proposalId: string) => request<Record<string, unknown>>(`/api/v1/ai/proposals/${encodeURIComponent(proposalId)}/apply`, jsonRequest('POST', {})),
  listAIMemories: (query?: string) => request<CollectionResponse<OperatorMemory>>(`/api/v1/ai/memory${query ? `?query=${encodeURIComponent(query)}` : ''}`),
  listAIMemoryHistory: (memoryId: string) => request<CollectionResponse<Record<string, unknown>>>(`/api/v1/ai/memory/${encodeURIComponent(memoryId)}/history`),
  undoAIMemoryRevision: (memoryId: string, revisionId: string) => request<Record<string, unknown>>(`/api/v1/ai/memory/${encodeURIComponent(memoryId)}/undo`, jsonRequest('POST', { revisionId })),
  reindexAIMemory: () => request<Record<string, unknown>>('/api/v1/ai/memory/reindex', jsonRequest('POST', {})),
  invitation: (token: string) =>
    request<{
      email: string;
      role: 'admin' | 'member';
      workspaceName: string;
      expiresAt: string;
    }>(`/api/invitations/${encodeURIComponent(token)}`),
  acceptInvitation: (token: string, input: { name?: string; password?: string }) =>
    request<{ user: { id: string; email: string; name: string }; workspaceId: string; role: 'admin' | 'member' }>(
      `/api/invitations/${encodeURIComponent(token)}/accept`,
      jsonRequest('POST', input),
    ),
  listTasks: () => request<CollectionResponse<Task>>('/api/v1/tasks?limit=100'),
  createTask: (input: unknown) => request<Task>('/api/v1/tasks', jsonRequest('POST', input)),
  updateTask: (id: string, input: unknown) =>
    request<Task>(`/api/v1/tasks/${encodeURIComponent(id)}`, jsonRequest('PATCH', input)),
  deleteTask: (id: string) =>
    request<{ id: string; deleted: true }>(`/api/v1/tasks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  listCycleGoals: () => request<CollectionResponse<CycleGoal>>('/api/v1/cycle-goals?limit=100'),
  createCycleGoal: (input: unknown) =>
    request<CycleGoal>('/api/v1/cycle-goals', jsonRequest('POST', input)),
  updateCycleGoal: (id: string, input: unknown) =>
    request<CycleGoal>(`/api/v1/cycle-goals/${encodeURIComponent(id)}`, jsonRequest('PATCH', input)),
  deleteCycleGoal: (id: string) =>
    request<{ id: string; deleted: true }>(`/api/v1/cycle-goals/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  listVisions: () => request<CollectionResponse<Vision>>('/api/v1/visions?limit=100'),
  createVision: (input: unknown) => request<Vision>('/api/v1/visions', jsonRequest('POST', input)),
  updateVision: (id: string, input: unknown) =>
    request<Vision>(`/api/v1/visions/${encodeURIComponent(id)}`, jsonRequest('PATCH', input)),
  deleteVision: (id: string) =>
    request<{ id: string; deleted: true }>(`/api/v1/visions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
};

export function subscribeToStandaloneEvents(
  listener: (event: StandaloneWorkspaceEvent) => void,
) {
  const source = new EventSource('/api/v1/events', { withCredentials: true });
  const eventTypes = [
    'tasks.created',
    'tasks.updated',
    'tasks.deleted',
    'cycle-goals.created',
    'cycle-goals.updated',
    'cycle-goals.deleted',
    'visions.created',
    'visions.updated',
    'visions.deleted',
  ];
  const handleEvent = (event: Event) => {
    listener(JSON.parse((event as MessageEvent<string>).data) as StandaloneWorkspaceEvent);
  };
  for (const eventType of eventTypes) source.addEventListener(eventType, handleEvent);
  return () => source.close();
}
