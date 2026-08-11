import type {
  AIDomainAdapter,
  AIAction,
  AIContextRequest,
  AIContextEnvelope,
  AIContextPart,
  AIApplyResult,
  AIPreview,
  AIToolPolicy,
} from './types.js';

export const AI_RESOURCE_TYPES = [
  'context-sources',
  'context-source-versions',
  'context-source-items',
  'business-plans',
  'visions',
  'cycle-goals',
  'tasks',
  'roadmap-items',
  'team-chat-channels',
  'team-chat-messages',
  'blog-articles',
  'prompts',
  'social-posts',
  'seo-keywords',
  'feedbacks',
  'time-blocks',
  'creative-items',
  'creative-assets',
  'accounts',
  'leads',
  'bugs',
  'api-endpoints',
  'environments',
  'operator-desks',
  'operator-work-orders',
  'operator-context-packs',
  'operator-outputs',
  'operator-memories',
] as const;

export const AI_DOMAIN_CATALOG = [
  { id: 'context', label: 'Files and context', resourceTypes: ['context-sources', 'context-source-versions', 'context-source-items', 'business-plans'] },
  { id: 'planning', label: 'Planning and strategy', resourceTypes: ['visions', 'cycle-goals', 'tasks', 'roadmap-items'] },
  { id: 'team', label: 'Team and communication', resourceTypes: ['team-chat-channels', 'team-chat-messages'] },
  { id: 'content', label: 'Content and creative', resourceTypes: ['blog-articles', 'prompts', 'social-posts', 'creative-items', 'creative-assets'] },
  { id: 'growth', label: 'Growth', resourceTypes: ['accounts', 'leads', 'seo-keywords', 'feedbacks'] },
  { id: 'technical', label: 'Technical and systems', resourceTypes: ['bugs', 'api-endpoints', 'environments'] },
  { id: 'operators', label: 'Operators', resourceTypes: ['operator-desks', 'operator-work-orders', 'operator-context-packs', 'operator-outputs', 'operator-memories'] },
] as const;

function createDomainAdapter(id: string, label: string, resourceTypes: string[]): AIDomainAdapter {
  return {
    resourceTypes,
    async buildContext(input: AIContextRequest) {
      return [{
        kind: 'instruction',
        title: `${label} adapter`,
        content: JSON.stringify({ domain: id, route: input.route, resourceType: input.resourceType, resourceId: input.resourceId }),
      }, ...(input.selectedRecords.length > 0 ? [{
        kind: 'record' as const,
        title: `${label} records`,
        content: JSON.stringify(input.selectedRecords),
      }] : [])];
    },
    getTools(policy: AIToolPolicy) {
      return [{
        name: `${id}_context`,
        description: `Read ${label.toLowerCase()} context through workspace-scoped native services.`,
        access: 'read',
        surface: policy.surface,
      }, {
        name: `${id}_propose`,
        description: `Create approval-required ${label.toLowerCase()} actions; never apply them directly.`,
        access: 'proposal',
        surface: policy.surface,
      }];
    },
    async validateAction(action: AIAction) {
      if (!resourceTypes.includes(action.resourceType)) {
        return { ok: false, message: `${action.resourceType} is not supported by the ${id} adapter.` };
      }
      return { ok: true };
    },
    async previewAction(action: AIAction): Promise<AIPreview> {
      return {
        resourceType: action.resourceType,
        operation: action.operation,
        title: `${action.operation} ${action.resourceType}`,
        summary: action.rationale,
        changes: action.payload,
      };
    },
    async applyAction(action: AIAction, _transaction: unknown): Promise<AIApplyResult> {
      throw new Error(`The ${id} adapter is proposal-first. Apply ${action.resourceType} through its native Replofy service.`);
    },
  };
}

export const AI_DOMAIN_ADAPTERS: Record<string, AIDomainAdapter> = Object.fromEntries(
  AI_DOMAIN_CATALOG.map((domain) => [domain.id, createDomainAdapter(domain.id, domain.label, [...domain.resourceTypes])]),
);

function adapterForContext(context: AIContextEnvelope) {
  return AI_DOMAIN_CATALOG.reduce<AIDomainAdapter | undefined>((match, domain) => {
    if (match || !domain.resourceTypes.includes(context.resourceType as never)) return match;
    return AI_DOMAIN_ADAPTERS[domain.id];
  }, undefined);
}

export async function buildDomainContext(context: AIContextEnvelope): Promise<AIContextPart[]> {
  const domain = AI_DOMAIN_CATALOG.find((candidate) => candidate.resourceTypes.includes(context.resourceType as never));
  const adapterParts = await adapterForContext(context)?.buildContext(context) || [];
  return [
    {
      kind: 'route',
      title: domain?.label || 'Replofy workspace',
      content: JSON.stringify({ route: context.route, resourceType: context.resourceType, resourceId: context.resourceId }),
    },
    ...adapterParts,
  ];
}

export function getAITools(policy: AIToolPolicy) {
  const adapterTools = Object.values(AI_DOMAIN_ADAPTERS).flatMap((adapter) => adapter.getTools(policy));
  return [
    {
      name: 'search_workspace_context',
      description: 'Search workspace records, sources, and active memories. The server enforces workspace scope.',
      access: 'read',
      surface: policy.surface,
    },
    {
      name: 'propose_resource_action',
      description: 'Create a proposal for a domain record change. It never applies the change directly.',
      access: 'proposal',
      surface: policy.surface,
    },
    {
      name: 'remember_workspace_fact',
      description: 'Create or update durable workspace memory. Autonomous memory mode is controlled server-side.',
      access: policy.allowMemoryWrites ? 'autonomous-memory' : 'disabled',
      surface: policy.surface,
    },
    ...adapterTools,
  ];
}

export function normalizeAIAction(action: AIAction): AIAction {
  return {
    ...action,
    resourceType: action.resourceType.trim().toLowerCase(),
    requiresApproval: action.operation === 'remember' ? false : true,
  };
}
