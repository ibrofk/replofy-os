export type Company = {
  id: string;
  name: string;
  createdAt: string;
  ownerId: string;
};

export type UserRole = 'master-admin' | 'admin' | 'member';

export type SourceLineage = {
  sourceIds?: string[];
  sourceVersionIds?: string[];
  sourceKey?: string;
  sourceTitle?: string;
  sourceVersion?: number;
  sourceUpdatedAt?: string;
  aliases?: string[];
  matchKey?: string;
};

export type UserProfile = {
  id: string;
  email: string;
  displayName: string;
  companyId?: string;
  role: UserRole;
  onboardingCompleted: boolean;
  acceptedInvitationId?: string;
  rejectedInvitationId?: string;
  invitationAcceptedAt?: string;
  invitationRejectedAt?: string;
  createdAt: string;
};

export type InvitationStatus = 'pending' | 'accepted' | 'rejected';

export type Invitation = {
  id: string;
  email: string;
  companyId: string;
  role: UserRole;
  invitedBy: string;
  status?: InvitationStatus;
  respondedAt?: string;
  respondedBy?: string;
  createdAt: string;
};

export type ChatChannel = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  companyId?: string | null;
};

export type ChatMessage = {
  id: string;
  channelId: string;
  channelName: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  companyId?: string | null;
};

export type ChatReadState = {
  id: string;
  channelId: string;
  userId: string;
  authorId: string;
  lastReadAt: string;
  companyId?: string | null;
};

export type WorkspaceNotification = {
  id: string;
  type: 'message' | 'task' | 'bug' | 'roadmap' | 'feedback' | 'lead';
  title: string;
  body: string;
  createdAt: string;
  href: string;
  isUnread: boolean;
};

export type Task = {
  id: string;
  title: string;
  isLeadIndicator: boolean;
  effortPoints: 1 | 2 | 3 | 5 | 8;
  status: 'todo' | 'in-progress' | 'done' | 'icebox';
  createdAt: string;
  completedAt?: string | null;
  authorId: string;
  assigneeId?: string | null;
  companyId?: string;
  cycleGoalId?: string; // If not set, goes to icebox
  executionNotes?: string;
  acceptanceCriteria?: string[];
  planOrder?: number | null;
} & SourceLineage;

export type BugSeverity = 'low' | 'medium' | 'high' | 'critical';

export type BugStatus = 'open' | 'triaged' | 'in-progress' | 'blocked' | 'resolved' | 'closed';

export type BugCodeLinkType = 'repository' | 'directory';

export type BugCodeLink = {
  type: BugCodeLinkType;
  url: string;
  label?: string;
  notes?: string;
};

export type Bug = {
  id: string;
  title: string;
  description: string;
  severity: BugSeverity;
  status: BugStatus;
  resolutionNotes: string;
  linkedTaskIds: string[];
  codeLinks?: BugCodeLink[];
  createdAt: string;
  updatedAt: string;
  authorId: string;
  companyId?: string;
} & SourceLineage;

export type RoadmapPhase = 'now' | 'next' | 'later';

export type RoadmapPriority = 'low' | 'medium' | 'high';

export type RoadmapStatus = 'planned' | 'building' | 'blocked' | 'shipped';

export type RoadmapItem = {
  id: string;
  title: string;
  description: string;
  phase: RoadmapPhase;
  priority: RoadmapPriority;
  status: RoadmapStatus;
  linkedTaskIds: string[];
  createdAt: string;
  updatedAt: string;
  authorId: string;
  companyId?: string;
};

export type Prompt = {
  id: string;
  title: string;
  version: string;
  content: string;
  createdAt: string;
  authorId: string;
  companyId?: string;
};

export type LegacyBlogArticleStatus =
  | 'brainstorming'
  | 'collecting-data'
  | 'collecting-docs'
  | 'validating'
  | 'progressing'
  | 'finished';

export type BlogArticleStatus =
  | 'idea'
  | 'planned'
  | 'researching'
  | 'drafting'
  | 'review'
  | 'scheduled'
  | 'published'
  | 'archived'
  | 'rejected';

export type BlogRoadmapPhase = 'now' | 'next' | 'later';

export type BlogPriority = 'low' | 'medium' | 'high';

export type BlogEvidenceConfidence = 'unverified' | 'supported' | 'verified';

export type BlogBrief = {
  audience: string;
  painPoint: string;
  buyingTrigger: string;
  brokenBelief: string;
  replofyAngle: string;
  thesis: string;
  cta: string;
  contentCluster: string;
};

export type BlogEvidence = {
  id: string;
  claim: string;
  value?: string;
  sourceId?: string;
  sourceUrl?: string;
  quote?: string;
  confidence: BlogEvidenceConfidence;
  usedInDraft: boolean;
};

export type BlogDistribution = {
  seoTitle: string;
  metaDescription: string;
  primaryKeyword: string;
  channels: string[];
  publicationUrl: string;
};

export type BlogArticle = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  status: BlogArticleStatus | LegacyBlogArticleStatus;
  roadmapPhase?: BlogRoadmapPhase;
  priority?: BlogPriority;
  ownerId?: string | null;
  targetPublishAt?: string | null;
  scheduledFor?: string | null;
  brief?: BlogBrief;
  evidence?: BlogEvidence[];
  linkedSourceIds?: string[];
  distribution?: BlogDistribution;
  tags?: string[];
  dataPoints?: string[];
  docLinks?: string[];
  validationNotes?: string[];
  validatedAt?: string | null;
  publishedAt?: string | null;
  rejectedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  companyId?: string;
};

export type BusinessPlanStatus = 'draft' | 'review' | 'active' | 'archived';

export type BusinessPlanLinkType =
  | 'task'
  | 'cycleGoal'
  | 'vision'
  | 'blogArticle'
  | 'contextSource'
  | 'apiEndpoint'
  | 'feedback'
  | 'socialPost'
  | 'prompt'
  | 'timeBlock'
  | 'environment'
  | 'teamMember';

export type BusinessPlanLink = {
  id: string;
  type: BusinessPlanLinkType;
  recordId: string;
  createdAt: string;
  createdBy: string;
};

export type BusinessPlanBlockType =
  | 'heading'
  | 'paragraph'
  | 'list-item'
  | 'quote'
  | 'code'
  | 'divider'
  | 'card';

export type BusinessPlanBlockMapItem = {
  id: string;
  type: BusinessPlanBlockType;
};

export type BusinessPlan = {
  id: string;
  title: string;
  summary: string;
  content: string;
  status: BusinessPlanStatus;
  tags: string[];
  links: BusinessPlanLink[];
  contentRevision: number;
  blockMap: BusinessPlanBlockMapItem[];
  createdAt: string;
  updatedAt: string;
  authorId: string;
  companyId?: string;
};

export type BusinessPlanEditingSession = {
  sessionId: string;
  userId: string;
  displayName: string;
  color: string;
  planId: string;
  activeBlockId: string;
  createdAt: string;
  updatedAt: string;
};

export type Vision = {
  id: string;
  title: string;
  description: string;
  focusItems: string[];
  createdAt: string;
  authorId: string;
  companyId?: string;
} & SourceLineage;

export type EnvironmentState = {
  id: string;
  name: 'Local' | 'Staging' | 'Production';
  status: 'healthy' | 'deploying' | 'failed';
  lastSync: string;
  version: string;
  companyId?: string;
};

export type CycleGoal = {
  id: string;
  title: string;
  description: string;
  outcome?: string;
  successCriteria?: string[];
  targetDate?: string | null;
  status: 'active' | 'completed' | 'archived';
  createdAt: string;
  authorId: string;
  companyId?: string;
} & SourceLineage;

export type ApiEndpoint = {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  description: string;
  status: 'draft' | 'active' | 'deprecated';
  createdAt: string;
  authorId: string;
  companyId?: string;
};

export type SocialPost = {
  id: string;
  platform: 'Twitter' | 'LinkedIn' | 'Loom';
  content: string;
  scheduledFor: string;
  status: 'draft' | 'scheduled' | 'published';
  createdAt: string;
  authorId: string;
  companyId?: string;
} & SourceLineage;

export type CreativePlatform = 'Instagram' | 'LinkedIn' | 'X' | 'TikTok' | 'YouTube' | 'Blog' | 'Email' | 'Other';

export type CreativeFormat =
  | 'single-post'
  | 'carousel'
  | 'reel'
  | 'story-sequence'
  | 'motion-brief'
  | 'static-ad'
  | 'thread'
  | 'other';

export type CreativeStatus =
  | 'idea'
  | 'brief'
  | 'draft'
  | 'in-review'
  | 'changes-requested'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'rejected'
  | 'archived';

export type CreativeAssetType = 'image' | 'video' | 'document' | 'source' | 'other';

export type CreativeAssetStatus = 'uploading' | 'active' | 'archived' | 'error';

export type CreativeAssetProvider = 'cloudinary' | 'filesystem' | 's3';

export type CreativeAssetResourceType = 'image' | 'video' | 'raw';

export type CreativeItem = {
  id: string;
  title: string;
  platform: CreativePlatform;
  format: CreativeFormat;
  campaign: string;
  audience: string;
  objective: string;
  hook: string;
  brief: string;
  caption: string;
  visualDirection: string;
  productionNotes: string;
  cta: string;
  status: CreativeStatus;
  ownerId?: string | null;
  approverId?: string | null;
  targetPublishAt?: string | null;
  scheduledFor?: string | null;
  publishedAt?: string | null;
  submittedAt?: string | null;
  approvalNotes: string;
  assetIds: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  authorId: string;
  companyId?: string | null;
} & SourceLineage;

export type CreativeAsset = {
  id: string;
  creativeId?: string | null;
  title: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  assetType: CreativeAssetType;
  storagePath: string;
  provider?: CreativeAssetProvider;
  cloudinaryAssetId?: string | null;
  cloudinaryResourceType?: CreativeAssetResourceType | null;
  cloudinaryDeliveryType?: 'authenticated' | null;
  cloudinaryVersion?: number | null;
  cloudinaryFormat?: string | null;
  status: CreativeAssetStatus;
  uploadedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  companyId?: string | null;
};

export type SeoKeyword = {
  id: string;
  keyword: string;
  intent: 'high' | 'medium' | 'low';
  cycleGoalId?: string;
  createdAt: string;
  authorId: string;
  companyId?: string;
};

export type Feedback = {
  id: string;
  source: 'Discord' | 'Twitter' | 'Email';
  content: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  createdAt: string;
  authorId: string;
  companyId?: string;
} & SourceLineage;

export type AccountStatus = 'prospect' | 'customer' | 'partner' | 'inactive';

export type LeadStage = 'new' | 'qualified' | 'contacted' | 'demo-booked' | 'proposal' | 'won' | 'lost';

export type LeadSource = 'inbound' | 'referral' | 'cold-outreach' | 'waitlist' | 'twitter' | 'linkedin' | 'email' | 'other';

export type LeadPriority = 'low' | 'medium' | 'high';

export type Account = {
  id: string;
  name: string;
  website: string;
  industry: string;
  size: string;
  notes: string;
  status: AccountStatus;
  linkedLeadIds: string[];
  createdAt: string;
  updatedAt: string;
  authorId: string;
  companyId?: string;
} & SourceLineage;

export type Lead = {
  id: string;
  name: string;
  email: string;
  companyName: string;
  accountId?: string | null;
  source: LeadSource;
  stage: LeadStage;
  priority: LeadPriority;
  ownerId?: string | null;
  nextAction: string;
  nextActionAt?: string | null;
  notes: string;
  linkedTaskIds: string[];
  createdAt: string;
  updatedAt: string;
  authorId: string;
  companyId?: string;
} & SourceLineage;

export type TimeBlock = {
  id: string;
  title: string;
  type: 'strategic' | 'buffer' | 'breakout';
  startTime: string;
  endTime: string;
  dayOfWeek: number;
  createdAt: string;
  authorId: string;
  companyId?: string;
};

export type TeamChatChannelStatus = 'active' | 'archived';

export type TeamChatParticipantType = 'team-member' | 'ai-agent';

export type TeamChatParticipantStatus = 'active' | 'inactive';

export type TeamChatChannel = {
  id: string;
  name: string;
  topic: string;
  status: TeamChatChannelStatus;
  participantIds: string[];
  createdAt: string;
  updatedAt: string;
  authorId: string;
  companyId?: string | null;
};

export type TeamChatParticipant = {
  id: string;
  displayName: string;
  participantType: TeamChatParticipantType;
  linkedUserId?: string | null;
  description: string;
  status: TeamChatParticipantStatus;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  companyId?: string | null;
};

export type TeamChatMessage = {
  id: string;
  channelId: string;
  participantId: string;
  participantType: TeamChatParticipantType;
  senderName: string;
  content: string;
  replyToMessageId?: string | null;
  createdAt: string;
  authorId: string;
  companyId?: string | null;
};

export type ContextSource = {
  id: string;
  title: string;
  normalizedTitle: string;
  aliases: string[];
  sourceKey: string;
  latestVersion: number;
  latestFileName: string;
  latestMimeType: string;
  latestSummary: string;
  linkedTaskIds: string[];
  linkedVisionIds: string[];
  linkedCycleGoalIds: string[];
  linkedFeedbackIds: string[];
  linkedSocialPostIds: string[];
  linkedCreativeItemIds?: string[];
  linkedLeadIds?: string[];
  linkedAccountIds?: string[];
  createdAt: string;
  updatedAt: string;
  lastUploadedAt: string;
  authorId: string;
  companyId?: string;
  status: 'active' | 'archived';
  folderId?: string | null;
};

export type ContextSourceFolder = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  companyId?: string | null;
};

export type ContextSourceVersion = {
  id: string;
  sourceId: string;
  sourceKey: string;
  version: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  contentHash: string;
  contentPreview: string;
  fullContent?: string;
  contentStorage?: 'full' | 'preview-only';
  routingContentAvailable?: boolean;
  payload: Record<string, unknown>;
  linkedTaskIds: string[];
  linkedVisionIds: string[];
  linkedCycleGoalIds: string[];
  linkedFeedbackIds: string[];
  linkedSocialPostIds: string[];
  linkedCreativeItemIds?: string[];
  linkedLeadIds?: string[];
  linkedAccountIds?: string[];
  createdAt: string;
  authorId: string;
  companyId?: string;
  status: 'processed' | 'error';
};

export type ApiKeyScope = 'workspace:read' | 'workspace:write' | 'systems:read' | 'systems:write' | 'identity:read' | 'identity:write';

export type ApiKeyRecord = {
  id: string;
  label: string;
  scopes: ApiKeyScope[];
  createdAt: string;
  createdBy: string;
  ownerUid: string;
  companyId?: string | null;
  isActive: boolean;
  keyLast4: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
};

export type ApiKeyListResponse = {
  canManageKeys: boolean;
  keys: ApiKeyRecord[];
};

export type ApiKeyCreateResponse = {
  key: string;
  record: ApiKeyRecord;
  warning: string;
};

export type ApiKeyRevokeResponse = {
  record: ApiKeyRecord;
};

export type OperatorDeskType = 'ops' | 'content' | 'creative' | 'bug' | 'feature' | 'research' | 'growth' | 'feedback';
export type OperatorCheckFrequency = 'manual' | 'daily' | 'weekly' | 'monthly' | 'event';
export type OperatorDeskStatus = 'active' | 'paused' | 'archived';
export type OperatorApprovalMode = 'action_based' | 'draft_only' | 'propose_injection' | 'approve_before_write' | 'safe_auto_write';
export type OperatorHealthState = 'healthy' | 'needs_approval' | 'paused' | 'missing_sources' | 'no_recent_checkins' | 'routing_warning' | 'failed_submission';
export type OperatorWorkOrderStatus = 'draft' | 'ready' | 'claimed' | 'in_progress' | 'submitted' | 'needs_review' | 'approved' | 'rejected' | 'archived' | 'cancelled';
export type OperatorPriority = 'low' | 'medium' | 'high' | 'critical';
export type OperatorClaimPolicy = 'single_agent' | 'multi_agent' | 'manual_assignment';
export type OperatorContextPackScope = 'global' | 'operator' | 'work_order' | 'hub' | 'goal' | 'artifact' | 'campaign' | 'bug' | 'feature' | 'blog' | 'creative' | 'research';
export type OperatorMemoryScope = 'global' | 'operator' | 'hub' | 'goal' | 'artifact' | 'work_order' | 'checkin';
export type OperatorMemoryType = 'fact' | 'preference' | 'decision' | 'style' | 'constraint' | 'lesson' | 'avoid' | 'source_note' | 'workflow_rule';
export type OperatorMemoryState = 'suggested' | 'active' | 'pinned' | 'rejected' | 'expired' | 'archived';
export type OperatorMemoryConfidence = 'low' | 'medium' | 'high';
export type OperatorCheckinType = 'manifest_requested' | 'work_order_claimed' | 'work_started' | 'output_submitted' | 'needs_more_context' | 'work_skipped' | 'work_failed' | 'work_completed';
export type OperatorOutputType = 'launch_summary' | 'focus_recommendation' | 'blog_idea' | 'blog_article' | 'social_post' | 'creative_brief' | 'creative_item' | 'campaign_idea' | 'bug_report' | 'bug_triage' | 'feature_spec' | 'roadmap_item' | 'execution_task' | 'implementation_brief' | 'research_brief' | 'seo_keyword' | 'content_refresh' | 'growth_task' | 'feedback_signal' | 'memory_suggestion' | 'weekly_summary' | 'team_chat_update' | 'time_block' | 'risk_note' | 'prompt';
export type OperatorOutputStatus = 'submitted' | 'pending_approval' | 'approved' | 'rejected' | 'injected' | 'archived';
export type SmartInjectionDestination = 'tasks' | 'bugs' | 'roadmap-items' | 'blog-articles' | 'business-plans' | 'visions' | 'prompts' | 'social-posts' | 'creative-items' | 'seo-keywords' | 'feedbacks' | 'time-blocks' | 'team-chat-messages' | 'context-sources' | 'operator-memories' | 'approval-inbox';
export type ApprovalAction = 'create' | 'update' | 'link' | 'comment' | 'publish' | 'send' | 'delete' | 'deploy' | 'rollback' | 'remember';
export type ApprovalRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'edited' | 'expired' | 'completed' | 'failed';
export type ApprovalWriteBackStatus = 'pending' | 'completed' | 'failed';
export type OperatorInjectionStatus = 'proposed' | 'pending_approval' | 'approved' | 'completed' | 'failed' | 'rejected';

export type OperatorDesk = {
  id: string;
  name: string;
  slug: string;
  type: OperatorDeskType;
  mission: string;
  defaultCheckFrequency: OperatorCheckFrequency;
  status: OperatorDeskStatus;
  connectedExternalAgents: string[];
  allowedSources: string[];
  allowedOutputTypes: OperatorOutputType[];
  approvalMode: OperatorApprovalMode;
  routingRules: Record<string, unknown>;
  dangerousActionRules: string[];
  createdAt: string;
  updatedAt: string;
  authorId: string;
  companyId?: string;
};

export type OperatorWorkOrder = {
  id: string;
  operatorDeskId: string;
  title: string;
  brief: string;
  status: OperatorWorkOrderStatus;
  priority: OperatorPriority;
  contextPackIds: string[];
  expectedOutputTypes: OperatorOutputType[];
  approvalMode: OperatorApprovalMode;
  claimPolicy: OperatorClaimPolicy;
  assignedExternalAgent?: string | null;
  claimedBy?: string | null;
  claimedAt?: string | null;
  availableFrom?: string | null;
  dueAt?: string | null;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  companyId?: string;
};

export type OperatorContextPack = {
  id: string;
  title: string;
  description: string;
  scope: OperatorContextPackScope;
  scopeId?: string | null;
  sourceIds: string[];
  sourceSnapshots: Record<string, unknown>[];
  instructions: string;
  constraints: string[];
  expectedUse: string;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  companyId?: string;
};

export type OperatorMemory = {
  id: string;
  scope: OperatorMemoryScope;
  scopeId?: string | null;
  memoryType: OperatorMemoryType;
  state: OperatorMemoryState;
  content: string;
  confidence: OperatorMemoryConfidence;
  sourceCheckInId?: string | null;
  sourceOutputId?: string | null;
  pinned: boolean;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string | null;
  usedCount: number;
  source?: string;
  sourceMetadata?: Record<string, unknown>;
  sourceRunId?: string | null;
  supersededMemoryId?: string | null;
  evidenceMetadata?: Record<string, unknown>;
  revision?: number;
  archivedAt?: string | null;
  authorId: string;
  companyId?: string;
};

export type OperatorCheckin = {
  id: string;
  operatorDeskId: string;
  workOrderId?: string | null;
  externalAgentName: string;
  externalAgentProvider?: string | null;
  type: OperatorCheckinType;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
  authorId: string;
  companyId?: string;
};

export type OperatorOutput = {
  id: string;
  operatorDeskId: string;
  workOrderId?: string | null;
  externalAgentName: string;
  outputType: OperatorOutputType;
  title: string;
  summary: string;
  content: string;
  structuredPayload: Record<string, unknown>;
  suggestedDestinations: string[];
  sourceReferences: Record<string, unknown>[];
  memorySuggestions: Array<string | Record<string, unknown>>;
  confidence: OperatorMemoryConfidence;
  status: OperatorOutputStatus;
  routingWarning?: string | null;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  companyId?: string;
};

export type OperatorInjection = {
  id: string;
  outputId: string;
  targetHub: SmartInjectionDestination;
  targetRecordId?: string | null;
  action: 'create' | 'update' | 'link' | 'comment' | 'remember';
  riskLevel: ApprovalRiskLevel;
  status: OperatorInjectionStatus;
  createdAt: string;
  completedAt?: string | null;
  authorId: string;
  companyId?: string;
};

export type OperatorApproval = {
  id: string;
  operatorDeskId: string;
  workOrderId?: string | null;
  outputId?: string | null;
  injectionId?: string | null;
  title: string;
  summary: string;
  targetHub: SmartInjectionDestination;
  action: ApprovalAction;
  riskLevel: ApprovalRiskLevel;
  status: ApprovalStatus;
  writeBackStatus?: ApprovalWriteBackStatus | null;
  writeBackCompletedAt?: string | null;
  targetRecordId?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  expiresAt?: string | null;
  authorId: string;
  companyId?: string;
};

export type OperatorMcpRegistryAction = {
  id: string;
  actionName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  permissionLevel: 'read' | 'suggest_only' | 'write_requires_approval' | 'dangerous_requires_approval';
  riskLevel: ApprovalRiskLevel;
  enabled: boolean;
  lastUsedAt?: string | null;
};

export type OperatorDeskManifest = {
  operatorDesk: OperatorDesk;
  readyWorkOrders: OperatorWorkOrder[];
  claimedWorkOrders: OperatorWorkOrder[];
  contextPacks: OperatorContextPack[];
  activeMemory: OperatorMemory[];
  pinnedMemory: OperatorMemory[];
  allowedSources: string[];
  allowedOutputTypes: OperatorOutputType[];
  routingRules: Record<string, unknown>;
  approvalRules: {
    approvalMode: OperatorApprovalMode;
    dangerousActionRules: string[];
  };
  recentOutputs: OperatorOutput[];
  recentCheckins: OperatorCheckin[];
  duplicatePreventionRules: string[];
  submissionSchema: Record<string, unknown>;
};
