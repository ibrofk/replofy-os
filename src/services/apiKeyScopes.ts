import type { ApiKeyScope } from '../types';

export type ApiKeyScopeDefinition = {
  scope: ApiKeyScope;
  title: string;
  description: string;
  group: 'Workspace' | 'Systems' | 'Identity';
};

export const API_KEY_SCOPE_DEFINITIONS: ApiKeyScopeDefinition[] = [
  {
    scope: 'workspace:read',
    title: 'Workspace read',
    description: 'Read tasks, bugs, roadmap items, growth pipeline records, visions, cycle goals, prompts, business plans, feedback, SEO, and time blocks.',
    group: 'Workspace',
  },
  {
    scope: 'workspace:write',
    title: 'Workspace write',
    description: 'Create and update the core execution, growth, bug, and roadmap surfaces in the workspace.',
    group: 'Workspace',
  },
  {
    scope: 'systems:read',
    title: 'Systems read',
    description: 'Read infrastructure, context engine, and API catalog records.',
    group: 'Systems',
  },
  {
    scope: 'systems:write',
    title: 'Systems write',
    description: 'Create and update infrastructure, context engine, and API catalog records.',
    group: 'Systems',
  },
  {
    scope: 'identity:read',
    title: 'Identity read',
    description: 'Read user, company, and invitation records.',
    group: 'Identity',
  },
  {
    scope: 'identity:write',
    title: 'Identity write',
    description: 'Create and update user, company, and invitation records.',
    group: 'Identity',
  },
] as const;

export const API_KEY_SCOPE_GROUPS = ['Workspace', 'Systems', 'Identity'] as const;

export const API_KEY_FULL_ACCESS_SCOPES = API_KEY_SCOPE_DEFINITIONS.map((definition) => definition.scope) as ApiKeyScope[];

export function isApiKeyScope(value: unknown): value is ApiKeyScope {
  return API_KEY_SCOPE_DEFINITIONS.some((definition) => definition.scope === value);
}

export function dedupeScopes(scopes: ApiKeyScope[]) {
  return Array.from(new Set(scopes));
}
