/**
 * MariaDB before 10.10 (e.g. XAMPP 10.4) runs with a read-only
 * `explicit_defaults_for_timestamp = OFF`: a `timestamp` column without an
 * explicit NULL becomes NOT NULL with a zero-date default, which strict mode
 * rejects (1067), and the first NOT NULL timestamp silently gains
 * ON UPDATE CURRENT_TIMESTAMP.
 *
 * This makes each timestamp column say explicitly what the migration means
 * under the modern default: nullable columns get `NULL`, NOT NULL columns
 * without a default get `DEFAULT CURRENT_TIMESTAMP(n)` (never ON UPDATE).
 * The migration files and their journal hashes stay untouched.
 */
export function explicitTimestampDdl(sql: string): string {
  return sql.replace(
    /(`[^`]+`\s+timestamp)(\(\d\))?([^,\n]*)/gi,
    (match, column: string, precision: string | undefined, rest: string) => {
      const attributes = rest.toUpperCase();
      if (attributes.includes('DEFAULT') || attributes.includes('ON UPDATE'))
        return match;
      if (attributes.includes('NOT NULL'))
        return `${column}${precision ?? ''}${rest.replace(
          /NOT NULL/i,
          `NOT NULL DEFAULT CURRENT_TIMESTAMP${precision ?? ''}`,
        )}`;
      if (/\bNULL\b/.test(attributes)) return match;
      return `${column}${precision ?? ''} NULL${rest}`;
    },
  );
}
