/**
 * Keep only fields that were explicitly supplied by the caller after a Zod
 * schema has parsed the input. This is important for PATCH schemas derived
 * from create schemas: create-time defaults must never overwrite omitted
 * fields during a partial update.
 */
export function pickProvided<T extends Record<string, unknown>>(
  input: unknown,
  parsed: T,
): Partial<T> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(source)
      .filter((key) => Object.prototype.hasOwnProperty.call(parsed, key))
      .map((key) => [key, parsed[key]]),
  ) as Partial<T>;
}
