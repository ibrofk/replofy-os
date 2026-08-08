import type { UserRole } from '../types';

function normalizeRole(role: UserRole | string | null | undefined) {
  return role?.trim().toLowerCase().replace(/[\s_]+/g, '-') ?? '';
}

export function isAdminRole(role: UserRole | string | null | undefined) {
  const normalizedRole = normalizeRole(role);
  return normalizedRole === 'master-admin' || normalizedRole === 'admin';
}
