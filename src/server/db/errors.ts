/**
 * Return a PostgreSQL error code from a driver error or a Drizzle wrapper.
 *
 * Drizzle exposes the native driver error as `cause`, so checking only the
 * outer error makes expected unique/foreign-key failures look like 500s.
 */
export function postgresErrorCode(error: unknown): string | undefined {
  const seen = new Set<object>();
  let current: unknown = error;

  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    if ('code' in current) {
      const code = (current as { code?: unknown }).code;
      if (typeof code === 'string') return code;
    }
    current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined;
  }

  return undefined;
}
