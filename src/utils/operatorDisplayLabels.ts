import type {
  ApprovalAction,
  ApprovalRiskLevel,
  ApprovalStatus,
  OperatorApproval,
  OperatorCheckFrequency,
  OperatorCheckinType,
  OperatorDesk,
  OperatorDeskStatus,
  OperatorMemoryConfidence,
  OperatorOutputStatus,
  OperatorOutputType,
  OperatorPriority,
  OperatorWorkOrderStatus,
  SmartInjectionDestination,
} from '../types';

const labelize = (value: string) =>
  value
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export const deskDisplayNames: Record<string, string> = {
  'launch-operator': 'Launch Desk',
  'blog-operator': 'Blog Desk',
  'creative-operator': 'Creative Desk',
  'bug-triage-operator': 'Bug Triage Desk',
  'feature-planner-operator': 'Feature Planning Desk',
  'research-operator': 'Research Desk',
  'weekly-ops-operator': 'Weekly Ops Desk',
  'seo-growth-operator': 'SEO Growth Desk',
};

export const outputTypeLabels: Record<OperatorOutputType, string> = {
  launch_summary: 'Launch summary',
  focus_recommendation: 'Focus recommendation',
  blog_idea: 'Blog idea',
  blog_article: 'Blog article',
  social_post: 'Social post',
  creative_brief: 'Creative brief',
  creative_item: 'Creative item',
  campaign_idea: 'Campaign idea',
  bug_report: 'Bug report',
  bug_triage: 'Bug triage',
  feature_spec: 'Feature spec',
  roadmap_item: 'Roadmap item',
  execution_task: 'Task',
  implementation_brief: 'Implementation brief',
  research_brief: 'Research brief',
  seo_keyword: 'SEO keyword',
  content_refresh: 'Content refresh',
  growth_task: 'Growth task',
  feedback_signal: 'Feedback signal',
  memory_suggestion: 'Memory suggestion',
  weekly_summary: 'Weekly summary',
  team_chat_update: 'Team update',
  time_block: 'Time block',
  risk_note: 'Risk note',
  prompt: 'Prompt',
};

export const desiredResultOptions: Array<{ label: string; value: OperatorOutputType }> = [
  { label: 'Task', value: 'execution_task' },
  { label: 'Blog idea', value: 'blog_idea' },
  { label: 'Research note', value: 'research_brief' },
  { label: 'Roadmap item', value: 'roadmap_item' },
  { label: 'Risk note', value: 'risk_note' },
  { label: 'Team update', value: 'team_chat_update' },
  { label: 'Memory suggestion', value: 'memory_suggestion' },
  { label: 'Creative brief', value: 'creative_brief' },
  { label: 'SEO opportunity', value: 'seo_keyword' },
];

export const targetHubLabels: Record<SmartInjectionDestination, string> = {
  tasks: 'Tasks',
  bugs: 'Bugs',
  'roadmap-items': 'Roadmap',
  'blog-articles': 'Blogs',
  'business-plans': 'Business plan',
  visions: 'Vision',
  prompts: 'Prompts',
  'social-posts': 'Social posts',
  'creative-items': 'Creative Hub',
  'seo-keywords': 'SEO keywords',
  feedbacks: 'Feedback',
  'time-blocks': 'Time blocks',
  'team-chat-messages': 'Team Chat',
  'context-sources': 'Docs',
  'operator-memories': 'Operator memory',
  'approval-inbox': 'Approvals',
};

export const actionLabels: Record<ApprovalAction, string> = {
  create: 'Create',
  update: 'Update',
  link: 'Link',
  comment: 'Comment',
  publish: 'Publish',
  send: 'Send',
  delete: 'Delete',
  deploy: 'Deploy',
  rollback: 'Rollback',
  remember: 'Save memory',
};

export const workOrderStatusLabels: Record<OperatorWorkOrderStatus, string> = {
  draft: 'Draft',
  ready: 'Ready',
  claimed: 'In progress',
  in_progress: 'In progress',
  submitted: 'Submitted',
  needs_review: 'Needs review',
  approved: 'Approved',
  rejected: 'Rejected',
  archived: 'Archived',
  cancelled: 'Cancelled',
};

export const outputStatusLabels: Record<OperatorOutputStatus, string> = {
  submitted: 'Submitted',
  pending_approval: 'Needs approval',
  approved: 'Approved',
  rejected: 'Rejected',
  injected: 'Completed',
  archived: 'Archived',
};

export const approvalStatusLabels: Record<ApprovalStatus, string> = {
  pending: 'Needs review',
  approved: 'Approved',
  rejected: 'Rejected',
  edited: 'Edited',
  expired: 'Archived',
  completed: 'Approved (legacy)',
  failed: 'Failed',
};

export const priorityLabels: Record<OperatorPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const riskLabels: Record<ApprovalRiskLevel, string> = {
  low: 'Low risk',
  medium: 'Medium risk',
  high: 'High risk',
  critical: 'Critical risk',
};

export const frequencyLabels: Record<OperatorCheckFrequency, string> = {
  manual: 'Manual',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  event: 'Event based',
};

export const deskStatusLabels: Record<OperatorDeskStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  archived: 'Archived',
};

export const checkinTypeLabels: Record<OperatorCheckinType, string> = {
  manifest_requested: 'Desk brief requested',
  work_order_claimed: 'Work started',
  work_started: 'Work started',
  output_submitted: 'Output submitted',
  needs_more_context: 'Needs more context',
  work_skipped: 'Work skipped',
  work_failed: 'Work failed',
  work_completed: 'Work completed',
};

export const confidenceLabels: Record<OperatorMemoryConfidence, string> = {
  low: 'Low confidence',
  medium: 'Medium confidence',
  high: 'High confidence',
};

export function getDeskName(desk?: Pick<OperatorDesk, 'name' | 'slug'> | null) {
  if (!desk) return 'Operator Desk';
  return deskDisplayNames[desk.slug] || desk.name.replace(/\s*Operator\s*/i, ' ').replace(/\s+/g, ' ').trim();
}

export function labelOutputType(value: string) {
  return outputTypeLabels[value as OperatorOutputType] || labelize(value);
}

export function labelTargetHub(value: string) {
  return targetHubLabels[value as SmartInjectionDestination] || labelize(value);
}

export function labelStatus(value: string) {
  return workOrderStatusLabels[value as OperatorWorkOrderStatus] || outputStatusLabels[value as OperatorOutputStatus] || approvalStatusLabels[value as ApprovalStatus] || labelize(value);
}

export function approvalPlainText(approval: Pick<OperatorApproval, 'action' | 'targetHub'>, deskName = 'This operator') {
  if (approval.targetHub === 'operator-memories') return `${deskName} wants to suggest a memory update.`;
  if (approval.targetHub === 'team-chat-messages') return `${deskName} wants to post a team update.`;
  if (approval.targetHub === 'tasks') return `${deskName} wants to create a task.`;
  if (approval.targetHub === 'blog-articles') return `${deskName} wants to add blog work.`;
  if (approval.targetHub === 'creative-items') return `${deskName} wants to add creative work.`;
  return `${deskName} wants to ${actionLabels[approval.action].toLowerCase()} work in ${labelTargetHub(approval.targetHub)}.`;
}

export function riskCopy(risk: ApprovalRiskLevel) {
  if (risk === 'critical') return 'Critical changes need careful human review before anything is written.';
  if (risk === 'high') return 'This can change important workspace records and needs approval first.';
  if (risk === 'medium') return 'This may update shared workspace information.';
  return 'This is low risk, but still waits for your review.';
}
