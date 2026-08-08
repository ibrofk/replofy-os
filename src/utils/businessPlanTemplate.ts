import type { BusinessPlan, BusinessPlanStatus } from '../types.js';

export const BUSINESS_PLAN_TEMPLATE_TITLE = 'Replofy Business Plan';
export const BUSINESS_PLAN_TEMPLATE_SUMMARY =
  'Operating model, service catalog, legal posture, and operating cadence for Replofy.';
export const BUSINESS_PLAN_TEMPLATE_TAGS = ['strategy', 'services', 'operations', 'legal'];

export const BUSINESS_PLAN_REQUIRED_SECTIONS = [
  {
    label: 'Services',
    keywords: ['service', 'offering', 'product'],
  },
  {
    label: 'CLA / Legal',
    keywords: ['cla', 'legal', 'agreement', 'policy'],
  },
  {
    label: 'Operations',
    keywords: ['operation', 'ops', 'process', 'cadence'],
  },
  {
    label: 'Revenue Model',
    keywords: ['revenue', 'commercial', 'pricing', 'margin'],
  },
  {
    label: 'Risks',
    keywords: ['risk', 'issue', 'constraint', 'blocker'],
  },
  {
    label: 'Next 90 Days',
    keywords: ['next', '90 day', 'roadmap', 'milestone'],
  },
] as const;

export const BUSINESS_PLAN_TEMPLATE_CONTENT = `# Replofy Business Plan

## Executive Summary
Replofy is the operating system for internal execution, content, systems, and support. The business plan should keep the company focused on productized services first, while the platform remains the source of truth for work.

## Services
- Internal helpdesk and ticket triage
- Content and documentation operations
- Systems, telemetry, and API tooling
- Context ingestion and AI-assisted execution

## CLA / Legal
- Standardized customer or contractor agreement terms
- Data handling, access control, and retention policy
- Liability boundaries and approval flow

## Operations
- Weekly planning and review cadence
- Ownership for work, approvals, and escalation
- Release and support process for internal tools

## Revenue Model
- Productized service packages
- Internal efficiencies that reduce operator overhead
- Future upsell paths from workflow automation

## Risks
- Scope creep across too many surfaces
- Manual handoffs that create drift
- Security and compliance gaps
- Unclear ownership across tools

## Next 90 Days
- Lock the service catalog
- Finalize CLA and legal language
- Document the operational cadence
- Define metrics and scorecards`;

export function createBusinessPlanTemplate(
  overrides: Partial<Pick<BusinessPlan, 'title' | 'summary' | 'content' | 'status' | 'tags' | 'links'>> = {},
): Pick<BusinessPlan, 'title' | 'summary' | 'content' | 'status' | 'tags' | 'links'> {
  return {
    title: overrides.title ?? BUSINESS_PLAN_TEMPLATE_TITLE,
    summary: overrides.summary ?? BUSINESS_PLAN_TEMPLATE_SUMMARY,
    content: overrides.content ?? BUSINESS_PLAN_TEMPLATE_CONTENT,
    status: overrides.status ?? ('draft' as BusinessPlanStatus),
    tags: overrides.tags ?? [...BUSINESS_PLAN_TEMPLATE_TAGS],
    links: overrides.links ?? [],
  };
}
