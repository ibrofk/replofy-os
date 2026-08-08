import {
  OperatorDesk,
  OperatorDeskType,
  OperatorMcpRegistryAction,
  OperatorOutputType,
  SmartInjectionDestination,
} from '../types.js';

export type OperatorDeskTemplate = Pick<
  OperatorDesk,
  | 'name'
  | 'slug'
  | 'type'
  | 'mission'
  | 'defaultCheckFrequency'
  | 'allowedSources'
  | 'allowedOutputTypes'
  | 'approvalMode'
> & {
  defaultMemory: string[];
  starterWorkOrder: {
    title: string;
    brief: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
  };
};

export const DANGEROUS_ACTION_RULES = [
  'publish blog',
  'post social content',
  'send email',
  'delete records',
  'deploy production',
  'rollback production',
  'mark high severity bug resolved',
  'mark critical bug resolved',
  'change pricing',
  'change legal document',
  'change security document',
  'change roadmap priority to high',
  'invite users',
  'change company settings',
];

export const OPERATOR_DESK_TEMPLATES: OperatorDeskTemplate[] = [
  {
    name: 'Launch Operator Desk',
    slug: 'launch-operator',
    type: 'ops',
    defaultCheckFrequency: 'daily',
    mission: 'Check active goals, open tasks, launch risks, bugs, roadmap conflicts, changelog, and current context. Return the most important next actions and blockers.',
    allowedSources: ['cycle-goals', 'tasks', 'bugs', 'roadmap-items', 'business-plans', 'visions', 'team-chat-messages', 'weekly-changelog', 'context-sources'],
    allowedOutputTypes: ['launch_summary', 'focus_recommendation', 'execution_task', 'risk_note', 'memory_suggestion', 'team_chat_update'],
    approvalMode: 'action_based',
    defaultMemory: [
      'Current launch focus should stay close to trust, legal, security, pricing, demo flow, onboarding, and offer clarity.',
      'Do not create new low-priority roadmap work while launch-critical tasks are incomplete.',
      'Launch summaries should be direct and action-oriented.',
    ],
    starterWorkOrder: {
      title: 'Daily launch desk review',
      brief: 'Review launch goals, open tasks, bugs, roadmap conflicts, and context. Submit a launch summary, focus recommendation, risks, and proposed execution tasks.',
      priority: 'high',
    },
  },
  {
    name: 'Blog Operator Desk',
    slug: 'blog-operator',
    type: 'content',
    defaultCheckFrequency: 'weekly',
    mission: 'Use Replofy product context, existing blog articles, SEO keywords, roadmap direction, feedback, and uploaded docs to produce useful, non-generic content work.',
    allowedSources: ['blog-articles', 'seo-keywords', 'business-plans', 'visions', 'roadmap-items', 'feedbacks', 'context-sources', 'team-chat-messages', 'web-research-notes'],
    allowedOutputTypes: ['blog_idea', 'blog_article', 'seo_keyword', 'social_post', 'creative_brief', 'execution_task', 'memory_suggestion'],
    approvalMode: 'action_based',
    defaultMemory: [
      'Avoid generic AI blog content.',
      'Prefer sharp, practical, slightly clickbait B2B support angles.',
      'Always check existing blog topics before creating new ideas.',
      'Every strong blog idea should include a repurposing path for social and creative.',
      'Replofy blog tone should be direct, useful, critical, and operator-focused.',
    ],
    starterWorkOrder: {
      title: 'Weekly content opportunity review',
      brief: 'Check existing blogs, SEO keywords, roadmap direction, feedback, and context packs. Submit useful blog ideas, drafts, SEO suggestions, social repurposing, and creative briefs.',
      priority: 'medium',
    },
  },
  {
    name: 'Creative Operator Desk',
    slug: 'creative-operator',
    type: 'creative',
    defaultCheckFrequency: 'weekly',
    mission: 'Turn blogs, product updates, launch goals, and campaign ideas into creative items, captions, visual directions, and production notes.',
    allowedSources: ['creative-items', 'creative-assets', 'social-posts', 'blog-articles', 'business-plans', 'visions', 'context-sources', 'team-chat-messages'],
    allowedOutputTypes: ['creative_brief', 'creative_item', 'social_post', 'campaign_idea', 'execution_task', 'memory_suggestion'],
    approvalMode: 'action_based',
    defaultMemory: [
      'Creative work should fit Replofy’s monochrome, minimal, modern B2B style.',
      'Avoid generic AI visuals and overused robot imagery.',
      'Prefer clear product metaphors: inbox, routing, context, handoff, memory, control, and operating system.',
      'Captions should be direct and not overly corporate.',
    ],
    starterWorkOrder: {
      title: 'Weekly creative production queue',
      brief: 'Review content, launch goals, campaigns, and creative assets. Submit visual briefs, captions, social concepts, and production notes.',
      priority: 'medium',
    },
  },
  {
    name: 'Bug Triage Operator Desk',
    slug: 'bug-triage-operator',
    type: 'bug',
    defaultCheckFrequency: 'daily',
    mission: 'Review open bugs, related tasks, roadmap impact, and technical context. Return clear triage notes, reproduction steps, fix briefs, and linked task proposals.',
    allowedSources: ['bugs', 'tasks', 'roadmap-items', 'team-chat-messages', 'context-sources', 'prompts'],
    allowedOutputTypes: ['bug_triage', 'bug_report', 'execution_task', 'risk_note', 'memory_suggestion', 'team_chat_update'],
    approvalMode: 'action_based',
    defaultMemory: [
      'Security/privacy bugs should stay high priority until explicitly resolved and verified.',
      'Bugs should include expected behavior, actual behavior, risk, and suggested verification.',
      'Never mark a high or critical bug as resolved without human confirmation.',
      'Do not create duplicate bug records if an open bug already covers the issue.',
    ],
    starterWorkOrder: {
      title: 'Daily bug triage review',
      brief: 'Review open bugs and related context. Submit triage notes, reproduction checklists, risk notes, and safe linked task proposals.',
      priority: 'high',
    },
  },
  {
    name: 'Feature Planner Operator Desk',
    slug: 'feature-planner-operator',
    type: 'feature',
    defaultCheckFrequency: 'weekly',
    mission: 'Review roadmap items, feedback, active goals, business plans, and context. Convert useful product ideas into clear specs and executable tasks.',
    allowedSources: ['roadmap-items', 'tasks', 'bugs', 'feedbacks', 'business-plans', 'visions', 'context-sources', 'prompts'],
    allowedOutputTypes: ['feature_spec', 'roadmap_item', 'execution_task', 'implementation_brief', 'prompt', 'memory_suggestion'],
    approvalMode: 'action_based',
    defaultMemory: [
      'Feature work should connect to active goals or clear roadmap priority.',
      'Do not expand scope without identifying user value and implementation risk.',
      'Feature specs should include problem, user, expected behavior, acceptance criteria, and linked tasks.',
    ],
    starterWorkOrder: {
      title: 'Weekly roadmap planning pass',
      brief: 'Review roadmap, feedback, active goals, business plans, and context. Submit feature specs, implementation briefs, risks, and task breakdowns.',
      priority: 'medium',
    },
  },
  {
    name: 'Research Operator Desk',
    slug: 'research-operator',
    type: 'research',
    defaultCheckFrequency: 'weekly',
    mission: 'Research market, product, competitor, customer support, AI tooling, and content opportunities. Convert useful findings into briefs, tasks, content ideas, roadmap suggestions, and memory updates.',
    allowedSources: ['web-research-notes', 'business-plans', 'visions', 'roadmap-items', 'blog-articles', 'seo-keywords', 'feedbacks', 'context-sources'],
    allowedOutputTypes: ['research_brief', 'blog_idea', 'roadmap_item', 'execution_task', 'seo_keyword', 'memory_suggestion'],
    approvalMode: 'action_based',
    defaultMemory: [
      'Research should end with recommended actions, not just summaries.',
      'Prioritize findings that support Replofy launch, positioning, content, product direction, or sales proof.',
      'Do not add weak competitor observations to memory unless they affect strategy.',
    ],
    starterWorkOrder: {
      title: 'Weekly research opportunity review',
      brief: 'Review research notes, business context, product direction, feedback, and context packs. Submit research briefs, content ideas, roadmap suggestions, and tasks.',
      priority: 'medium',
    },
  },
  {
    name: 'Weekly Ops Operator Desk',
    slug: 'weekly-ops-operator',
    type: 'ops',
    defaultCheckFrequency: 'weekly',
    mission: 'Review completed tasks, open tasks, active goals, bugs, roadmap movement, and recent outputs. Return a weekly internal summary and recommended next focus.',
    allowedSources: ['weekly-changelog', 'tasks', 'bugs', 'cycle-goals', 'roadmap-items', 'operator-checkins', 'team-chat-messages'],
    allowedOutputTypes: ['weekly_summary', 'execution_task', 'risk_note', 'team_chat_update', 'memory_suggestion'],
    approvalMode: 'action_based',
    defaultMemory: [
      'Weekly summaries should be honest about lack of progress.',
      'Separate completed work, blocked work, active risks, and next-week recommendations.',
      'Do not hide unresolved high-severity bugs.',
    ],
    starterWorkOrder: {
      title: 'Weekly ops summary request',
      brief: 'Review completed work, open tasks, active goals, bugs, roadmap movement, and submitted outputs. Submit a weekly summary and next-focus recommendation.',
      priority: 'medium',
    },
  },
  {
    name: 'SEO Growth Operator Desk',
    slug: 'seo-growth-operator',
    type: 'growth',
    defaultCheckFrequency: 'weekly',
    mission: 'Review SEO keywords, blog articles, product positioning, competitor research, and growth context. Return keyword opportunities, content refresh ideas, distribution angles, and measurable growth tasks.',
    allowedSources: ['seo-keywords', 'blog-articles', 'social-posts', 'business-plans', 'visions', 'roadmap-items', 'feedbacks', 'context-sources', 'web-research-notes'],
    allowedOutputTypes: ['seo_keyword', 'blog_idea', 'content_refresh', 'social_post', 'growth_task', 'research_brief', 'memory_suggestion'],
    approvalMode: 'action_based',
    defaultMemory: [
      'SEO work should support Replofy’s B2B support/helpdesk positioning.',
      'Avoid weak generic AI keywords unless tied to a sharp Replofy angle.',
      'Every keyword opportunity should include search intent, target reader, article angle, and distribution use.',
      'Content refresh suggestions should avoid duplicating existing articles.',
    ],
    starterWorkOrder: {
      title: 'Weekly SEO growth opportunity review',
      brief: 'Review SEO keywords, articles, product positioning, research, and feedback. Submit keyword opportunities, content refresh ideas, distribution angles, and growth tasks.',
      priority: 'medium',
    },
  },
];

export const OPERATOR_DESK_TEMPLATE_SLUGS = OPERATOR_DESK_TEMPLATES.map((template) => template.slug);

export const OUTPUT_ROUTING: Record<OperatorOutputType, SmartInjectionDestination[]> = {
  launch_summary: ['team-chat-messages'],
  focus_recommendation: ['tasks'],
  blog_idea: ['blog-articles'],
  blog_article: ['blog-articles'],
  social_post: ['social-posts'],
  creative_brief: ['creative-items'],
  creative_item: ['creative-items'],
  campaign_idea: ['creative-items'],
  bug_report: ['bugs'],
  bug_triage: ['bugs'],
  feature_spec: ['roadmap-items'],
  roadmap_item: ['roadmap-items'],
  execution_task: ['tasks'],
  implementation_brief: ['prompts'],
  research_brief: ['context-sources'],
  seo_keyword: ['seo-keywords'],
  content_refresh: ['blog-articles', 'tasks'],
  growth_task: ['tasks'],
  feedback_signal: ['feedbacks'],
  memory_suggestion: ['operator-memories'],
  weekly_summary: ['team-chat-messages'],
  team_chat_update: ['team-chat-messages'],
  time_block: ['time-blocks'],
  risk_note: ['tasks'],
  prompt: ['prompts'],
};

export const ENABLED_ROUTING_DESTINATIONS: SmartInjectionDestination[] = [
  'tasks',
  'bugs',
  'roadmap-items',
  'blog-articles',
  'social-posts',
  'creative-items',
  'seo-keywords',
  'prompts',
  'operator-memories',
];

export const DUPLICATE_PREVENTION_RULES = [
  'title',
  'slug',
  'matchKey',
  'sourceTitle',
  'sourceKey',
  'linked source IDs',
  'same workOrderId',
  'same externalAgentName',
  'recent outputs from same desk',
  'existing records in target hub',
];

const readAction = (name: string, description: string): OperatorMcpRegistryAction => ({
  id: name,
  actionName: name,
  description,
  inputSchema: {},
  outputSchema: {},
  permissionLevel: 'read',
  riskLevel: 'low',
  enabled: true,
  lastUsedAt: null,
});

const writeAction = (name: string, description: string, riskLevel: OperatorMcpRegistryAction['riskLevel'] = 'medium'): OperatorMcpRegistryAction => ({
  id: name,
  actionName: name,
  description,
  inputSchema: {},
  outputSchema: {},
  permissionLevel: 'write_requires_approval',
  riskLevel,
  enabled: true,
  lastUsedAt: null,
});

export const OPERATOR_MCP_REGISTRY_ACTIONS: OperatorMcpRegistryAction[] = [
  readAction('list_operator_desks', 'List Operator Desks available to external agents.'),
  readAction('get_operator_desk', 'Get one Operator Desk by id or slug.'),
  writeAction('create_operator_desk', 'Create an Operator Desk with approval and routing guardrails.'),
  writeAction('update_operator_desk', 'Edit safe Operator Desk settings.'),
  writeAction('archive_operator_desk', 'Archive an Operator Desk so MCP agents cannot run it.', 'high'),
  writeAction('restore_operator_desk', 'Restore an archived Operator Desk to active use.', 'high'),
  readAction('get_operator_manifest', 'Get desk mission, work orders, context packs, memory, routing rules, approval rules, recent outputs, and submission schema.'),
  readAction('list_ready_work_orders', 'List ready Work Orders that external agents can claim.'),
  readAction('get_work_order', 'Get one Work Order.'),
  readAction('get_context_pack', 'Get one Context Pack.'),
  readAction('list_operator_memory', 'List active and pinned Operator Memory.'),
  readAction('list_recent_operator_outputs', 'List recent Submitted Outputs.'),
  readAction('list_routing_rules', 'List Smart Routing rules for output types.'),
  writeAction('claim_work_order', 'Claim a ready Work Order for an external agent.'),
  writeAction('release_work_order', 'Release a claimed Work Order.'),
  writeAction('submit_agent_checkin', 'Submit an Agent Check-in.'),
  writeAction('submit_operator_output', 'Submit structured output for Smart Routing.'),
  writeAction('suggest_operator_memory', 'Suggest visible memory that requires approval.'),
  writeAction('create_operator_memory', 'Create safe Operator Memory with MCP source tracking.'),
  writeAction('update_operator_memory', 'Edit safe Operator Memory fields.'),
  writeAction('archive_operator_memory', 'Archive Operator Memory so it is excluded from manifests.', 'high'),
  writeAction('restore_operator_memory', 'Restore archived Operator Memory.'),
  writeAction('create_operator_memory_suggestion', 'Create a suggested Operator Memory awaiting review.'),
  writeAction('approve_operator_memory_suggestion', 'Approve a suggested Operator Memory.', 'high'),
  writeAction('reject_operator_memory_suggestion', 'Reject a suggested Operator Memory.'),
  writeAction('request_more_context', 'Ask for more Context Packs or source material.'),
  writeAction('mark_work_order_submitted', 'Mark a Work Order as submitted after external work is complete.'),
  readAction('list_pending_operator_approvals', 'List pending Operator Approval items.'),
  writeAction('route_operator_output_to_hub', 'Create Smart Routing proposals for an output.', 'high'),
];

export function buildRoutingRules(allowedOutputTypes: OperatorOutputType[]) {
  return Object.fromEntries(allowedOutputTypes.map((outputType) => [outputType, OUTPUT_ROUTING[outputType] || []]));
}

export function isKnownDeskType(value: string): value is OperatorDeskType {
  return ['ops', 'content', 'creative', 'bug', 'feature', 'research', 'growth', 'feedback'].includes(value);
}
