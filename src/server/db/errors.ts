/**
 * Return a PostgreSQL error code from a driver error or a Drizzle wrapper.
 *
 * Drizzle exposes the native driver error as `cause`, so checking only the
 * outer error makes expected unique/foreign-key failures look like 500s.
 */
export function postgresErrorCode(error: unknown): string | undefined {
  const seen = new Set<object>();
  const pending: unknown[] = [error];

  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    if ('code' in current) {
      const code = (current as { code?: unknown }).code;
      if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    }
    for (const key of ['cause', 'originalError', 'error'] as const) {
      if (key in current) pending.push((current as Record<string, unknown>)[key]);
    }
  }

  return undefined;
}
