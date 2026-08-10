import { z } from 'zod';

export const aiProviderIds = ['gemini', 'openai', 'anthropic'] as const;
export type AIProviderId = typeof aiProviderIds[number];

export const aiEngineStatuses = [
  'inactive_missing_provider_key',
  'inactive_missing_model',
  'active',
  'degraded_memory',
  'provider_error',
] as const;
export type AIEngineStatus = typeof aiEngineStatuses[number];

export const aiSurfaces = ['chat', 'analyze', 'inline', 'operator', 'system'] as const;
export type AISurface = typeof aiSurfaces[number];

export const aiContextModes = ['focused', 'workspace', 'deep'] as const;
export type AIContextMode = typeof aiContextModes[number];

export const aiActionabilitySchema = z.enum(['actionable', 'insufficient_evidence']).default('actionable');
export type AIActionability = z.infer<typeof aiActionabilitySchema>;

const AI_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024;
const AI_ATTACHMENT_TOTAL_MAX_BYTES = 40 * 1024 * 1024;

export const aiContextAttachmentSchema = z.object({
  id: z.string().trim().min(1).max(120),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(200),
  fileSize: z.number().int().min(1).max(AI_ATTACHMENT_MAX_BYTES),
  dataUrl: z.string().regex(/^data:[^,;]+;base64,[A-Za-z0-9+/=_-]+$/).max(22_000_000),
});
export type AIContextAttachment = z.infer<typeof aiContextAttachmentSchema>;

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

export const confidenceSchema = z.enum(['low', 'medium', 'high']);
export type AIConfidence = z.infer<typeof confidenceSchema>;

export const sourceReferenceSchema = z.object({
  sourceId: z.string().uuid().optional(),
  sourceVersionId: z.string().uuid().optional(),
  title: z.string().max(300).optional(),
  locator: z.string().max(500).optional(),
  excerpt: z.string().max(2_000).optional(),
}).passthrough();
export type SourceReference = z.infer<typeof sourceReferenceSchema>;

export const aiActionOperationSchema = z.enum([
  'create',
  'update',
  'draft',
  'link',
  'comment',
  'remember',
  'archive',
]);
export type AIActionOperation = z.infer<typeof aiActionOperationSchema>;

export const aiActionSchema = z.object({
  operation: aiActionOperationSchema,
  resourceType: z.string().trim().min(1).max(120),
  targetId: z.string().max(200).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  rationale: z.string().max(4_000).default(''),
  confidence: confidenceSchema.default('medium'),
  sourceReferences: z.array(sourceReferenceSchema).max(200).default([]),
  requiresApproval: z.boolean().default(true),
});
export type AIAction = z.infer<typeof aiActionSchema>;

export const memoryMutationOperationSchema = z.enum([
  'create',
  'update',
  'merge',
  'expire',
  'archive',
]);
export type MemoryMutationOperation = z.infer<typeof memoryMutationOperationSchema>;

export const memoryMutationSchema = z.object({
  operation: memoryMutationOperationSchema,
  memoryId: z.string().uuid().optional(),
  mergeMemoryIds: z.array(z.string().uuid()).max(20).default([]),
  scope: z.enum(['global', 'operator', 'hub', 'goal', 'artifact', 'work_order', 'checkin']).default('global'),
  scopeId: z.string().max(200).nullable().optional(),
  memoryType: z.enum([
    'fact',
    'preference',
    'decision',
    'style',
    'constraint',
    'lesson',
    'avoid',
    'source_note',
    'workflow_rule',
  ]).default('lesson'),
  content: z.string().trim().min(1).max(8_000),
  confidence: confidenceSchema.default('medium'),
  expiresAt: z.string().datetime().nullable().optional(),
  pinned: z.boolean().optional(),
  reason: z.string().trim().min(1).max(4_000).default('Updated from AI context.'),
  sourceReferences: z.array(sourceReferenceSchema).max(200).default([]),
});
export type MemoryMutation = z.infer<typeof memoryMutationSchema>;

export const aiEngineOutputSchema = z.object({
  answer: z.string().default(''),
  summary: z.string().default(''),
  actionability: aiActionabilitySchema,
  assumptions: z.array(z.string().max(2_000)).max(50).default([]),
  sourceReferences: z.array(sourceReferenceSchema).max(200).default([]),
  actions: z.array(aiActionSchema).max(100).default([]),
  memoryMutations: z.array(memoryMutationSchema).max(50).default([]),
});
export type AIEngineOutput = z.infer<typeof aiEngineOutputSchema>;

export const aiContextEnvelopeSchema = z.object({
  route: z.string().max(500).optional(),
  resourceType: z.string().max(120).optional(),
  resourceId: z.string().max(200).optional(),
  selectedRecords: z.array(z.record(z.string(), z.unknown())).max(50).default([]),
  attachments: z.array(aiContextAttachmentSchema).max(5).refine(
    (attachments) => attachments.reduce((total, attachment) => total + attachment.fileSize, 0) <= AI_ATTACHMENT_TOTAL_MAX_BYTES,
    'Attached files must be 40 MB or smaller together.',
  ).default([]),
  sourceIds: z.array(z.string().uuid()).max(100).default([]),
  sourceVersionIds: z.array(z.string().uuid()).max(100).default([]),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(20_000),
  })).max(12).default([]),
  userPrompt: z.string().trim().min(1).max(20_000),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type AIContextEnvelope = z.infer<typeof aiContextEnvelopeSchema>;
export type AIContextRequest = AIContextEnvelope;

export type AIUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
};

export type AIProviderCompletion = {
  output: AIEngineOutput;
  usage: AIUsage;
  rawText?: string;
};

export type AIProviderRequest = {
  provider: AIProviderId;
  model: string;
  apiKey: string;
  system: string;
  user: string;
  attachments?: AIContextAttachment[];
};

export interface AIModelGateway {
  complete(request: AIProviderRequest): Promise<AIProviderCompletion>;
  test(provider: AIProviderId, model: string, apiKey: string): Promise<void>;
}

export type AIToolPolicy = {
  workspaceId: string;
  actorId: string;
  surface: AISurface;
  allowMemoryWrites: boolean;
};

export type AIContextPart = {
  kind: 'route' | 'record' | 'source' | 'memory' | 'history' | 'instruction';
  title: string;
  content: string;
  sourceReferences?: SourceReference[];
};

export type AIValidationResult = {
  ok: boolean;
  message?: string;
};

export type AIPreview = {
  resourceType: string;
  operation: AIActionOperation;
  title: string;
  summary: string;
  changes: Record<string, unknown>;
};

export type AIApplyResult = {
  resourceType: string;
  targetId?: string;
  result: Record<string, unknown>;
};

export interface AIDomainAdapter {
  resourceTypes: string[];
  buildContext(input: AIContextRequest): Promise<AIContextPart[]>;
  getTools(policy: AIToolPolicy): Array<Record<string, unknown>>;
  validateAction(action: AIAction): Promise<AIValidationResult>;
  previewAction(action: AIAction): Promise<AIPreview>;
  applyAction(action: AIAction, transaction: unknown): Promise<AIApplyResult>;
}
