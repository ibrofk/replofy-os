import type { BugCodeLink, BugCodeLinkType } from '../types';

export const BUG_SEVERITY_OPTIONS = ['low', 'medium', 'high', 'critical'] as const;

export const BUG_STATUS_OPTIONS = ['open', 'triaged', 'in-progress', 'blocked', 'resolved', 'closed'] as const;

export const BUG_CODE_LINK_TYPES = ['repository', 'directory'] as const satisfies readonly BugCodeLinkType[];

export const BUG_CODE_LINK_TYPE_LABELS: Record<BugCodeLinkType, string> = {
  repository: 'Repository',
  directory: 'Directory',
};

export const ROADMAP_PHASE_OPTIONS = ['now', 'next', 'later'] as const;

export const ROADMAP_PRIORITY_OPTIONS = ['low', 'medium', 'high'] as const;

export const ROADMAP_STATUS_OPTIONS = ['planned', 'building', 'blocked', 'shipped'] as const;

export const BUG_SEVERITY_LABELS: Record<(typeof BUG_SEVERITY_OPTIONS)[number], string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const BUG_STATUS_LABELS: Record<(typeof BUG_STATUS_OPTIONS)[number], string> = {
  open: 'Open',
  triaged: 'Triaged',
  'in-progress': 'In Progress',
  blocked: 'Blocked',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const ROADMAP_PHASE_LABELS: Record<(typeof ROADMAP_PHASE_OPTIONS)[number], string> = {
  now: 'Now',
  next: 'Next',
  later: 'Later',
};

export const ROADMAP_PRIORITY_LABELS: Record<(typeof ROADMAP_PRIORITY_OPTIONS)[number], string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const ROADMAP_STATUS_LABELS: Record<(typeof ROADMAP_STATUS_OPTIONS)[number], string> = {
  planned: 'Planned',
  building: 'Building',
  blocked: 'Blocked',
  shipped: 'Shipped',
};

export function parseLinkedTaskIds(value: string) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function formatLinkedTaskIds(taskIds: string[]) {
  return taskIds.join(', ');
}

function isBugCodeLinkType(value: unknown): value is BugCodeLinkType {
  return value === 'repository' || value === 'directory';
}

function trimText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

export function normalizeBugCodeLinks(value: unknown): BugCodeLink[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const links: BugCodeLink[] = [];

  for (const rawLink of value) {
    if (!rawLink || typeof rawLink !== 'object' || Array.isArray(rawLink)) continue;
    const link = rawLink as Record<string, unknown>;
    const url = trimText(link.url, 1000);
    if (!url) continue;

    const type = isBugCodeLinkType(link.type) ? link.type : 'directory';
    const label = trimText(link.label, 160);
    const notes = trimText(link.notes, 1000);
    const dedupeKey = `${type}:${url.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    links.push({
      type,
      url,
      ...(label ? { label } : {}),
      ...(notes ? { notes } : {}),
    });

    if (links.length >= 25) break;
  }

  return links;
}
