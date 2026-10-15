/**
 * The driver error code behind a database failure. drizzle-orm (0.45+) wraps
 * every failed query in a `DrizzleQueryError` whose `cause` is the original
 * mysql2 error, so the code may sit one or more `cause` links below the error
 * that reached us. The walk is bounded so a cyclic cause chain cannot hang.
 */
export function databaseErrorCode(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!current || typeof current !== 'object') return undefined;
    if ('code' in current && typeof current.code === 'string')
      return current.code;
    current = 'cause' in current ? current.cause : undefined;
  }
  return undefined;
}
