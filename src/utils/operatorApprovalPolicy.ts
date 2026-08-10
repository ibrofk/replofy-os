import type { ApprovalAction, OperatorApprovalMode } from '../types.js';

const APPROVAL_REQUIRED_ACTIONS: ReadonlySet<ApprovalAction> = new Set([
  'send',
  'publish',
  'delete',
  'deploy',
  'rollback',
]);

export function normalizeOperatorApprovalMode(mode: OperatorApprovalMode): 'action_based' | 'draft_only' {
  return mode === 'draft_only' ? 'draft_only' : 'action_based';
}

export function operatorActionRequiresApproval(action: ApprovalAction): boolean {
  return APPROVAL_REQUIRED_ACTIONS.has(action);
}

export function operatorApprovalModeLabel(mode: OperatorApprovalMode): string {
  return normalizeOperatorApprovalMode(mode) === 'draft_only' ? 'Draft only' : 'Autonomous internal work';
}
