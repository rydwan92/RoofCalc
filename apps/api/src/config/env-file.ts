import { DatabaseConfigError, parseDatabaseUrl } from '../db/config';

/**
 * The root `.env` is the ONE place of local configuration: database, API
 * port, local Business auth. This module reads it the way Node's
 * `process.loadEnvFile` does, explains every line Node would silently
 * ignore (a pasted SQL statement, a missing `=`), and updates single keys
 * without touching comments or other lines. Pure: text in, text out; it
 * never prints a value of a secret.
 */

export type EnvLine =
  | { kind: 'blank' | 'comment'; line: number; raw: string }
  | { kind: 'entry'; line: number; raw: string; key: string; value: string }
  | { kind: 'invalid'; line: number; raw: string };

const ENTRY = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

function unquote(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if (
    (quote === '"' || quote === "'" || quote === '`') &&
    trimmed.length >= 2 &&
    trimmed.endsWith(quote)
  )
    return trimmed.slice(1, -1);
  // An unquoted value ends at an inline comment.
  return trimmed.replace(/\s+#.*$/, '').trim();
}

export function parseEnvFile(text: string): EnvLine[] {
  return text.split(/\r?\n/).map((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (!trimmed) return { kind: 'blank', line, raw };
    if (trimmed.startsWith('#')) return { kind: 'comment', line, raw };
    const match = ENTRY.exec(raw);
    if (!match) return { kind: 'invalid', line, raw };
    return {
      kind: 'entry',
      line,
      raw,
      key: match[1]!,
      value: unquote(match[2]!),
    };
  });
}

export function envValues(lines: readonly EnvLine[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of lines)
    if (line.kind === 'entry' && !(line.key in values))
      values[line.key] = line.value;
  return values;
}

export type EnvIssue =
  | { code: 'not-key-value'; line: number; looksLikeSql: boolean }
  | { code: 'duplicate-key'; key: string; lines: number[] }
  | { code: 'database-url-missing' }
  | { code: 'database-url-invalid'; message: string }
  | { code: 'database-url-remote'; host: string }
  | { code: 'port-invalid'; value: string }
  | { code: 'port-collides-with-web'; port: number }
  | { code: 'auth-url-not-local-dev'; value: string }
  | { code: 'secret-too-short'; key: string; length: number }
  | { code: 'auth-incomplete'; missing: string[] };

export type IssueSeverity = 'error' | 'warning';

export function issueSeverity(issue: EnvIssue): IssueSeverity {
  return issue.code === 'database-url-remote' ||
    issue.code === 'auth-url-not-local-dev' ||
    issue.code === 'auth-incomplete'
    ? 'warning'
    : 'error';
}

const SQL =
  /^\s*(create|grant|alter|drop|insert|update|delete|select|use|flush|identified|on|to)\b/i;
export const WEB_DEV_PORT = 5173;
export const LOCAL_DEV_ORIGINS = [
  `http://127.0.0.1:${WEB_DEV_PORT}`,
  `http://localhost:${WEB_DEV_PORT}`,
] as const;
export const AUTH_KEYS = [
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'ROOFCALC_BOOTSTRAP_TOKEN',
] as const;
export const MIN_SECRET_LENGTH = 32;

/** Every problem of a local `.env`, most important first. */
export function analyzeLocalEnv(lines: readonly EnvLine[]): EnvIssue[] {
  const issues: EnvIssue[] = [];
  for (const line of lines)
    if (line.kind === 'invalid')
      issues.push({
        code: 'not-key-value',
        line: line.line,
        looksLikeSql: SQL.test(line.raw),
      });
  const seen = new Map<string, number[]>();
  for (const line of lines)
    if (line.kind === 'entry')
      seen.set(line.key, [...(seen.get(line.key) ?? []), line.line]);
  for (const [key, at] of seen)
    if (at.length > 1) issues.push({ code: 'duplicate-key', key, lines: at });

  const values = envValues(lines);
  const databaseUrl = values.DATABASE_URL;
  if (!databaseUrl) issues.push({ code: 'database-url-missing' });
  else
    try {
      const options = parseDatabaseUrl(databaseUrl);
      if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(options.host))
        issues.push({ code: 'database-url-remote', host: options.host });
    } catch (error) {
      issues.push({
        code: 'database-url-invalid',
        message:
          error instanceof DatabaseConfigError
            ? error.message
            : 'DATABASE_URL could not be read.',
      });
    }

  if (values.PORT !== undefined) {
    const port = Number(values.PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      issues.push({ code: 'port-invalid', value: values.PORT });
    else if (port === WEB_DEV_PORT)
      issues.push({ code: 'port-collides-with-web', port });
  }

  const present = AUTH_KEYS.filter((key) => values[key]);
  if (present.length > 0 && present.length < AUTH_KEYS.length)
    issues.push({
      code: 'auth-incomplete',
      missing: AUTH_KEYS.filter((key) => !values[key]),
    });
  for (const key of ['BETTER_AUTH_SECRET', 'ROOFCALC_BOOTSTRAP_TOKEN'])
    if (values[key] && values[key]!.length < MIN_SECRET_LENGTH)
      issues.push({
        code: 'secret-too-short',
        key,
        length: values[key]!.length,
      });
  if (
    values.BETTER_AUTH_URL &&
    !(LOCAL_DEV_ORIGINS as readonly string[]).includes(
      values.BETTER_AUTH_URL.replace(/\/$/, ''),
    )
  )
    issues.push({
      code: 'auth-url-not-local-dev',
      value: values.BETTER_AUTH_URL,
    });
  return issues;
}

/** Values that never need quoting in a Node env file. */
const PLAIN = /^[A-Za-z0-9_./:@%+=,-]*$/;

function formatValue(value: string): string {
  if (PLAIN.test(value)) return value;
  if (value.includes('"'))
    throw new Error('Env values containing a double quote are not supported.');
  return `"${value}"`;
}

/**
 * Sets one key, replacing its first occurrence in place (comments and
 * every other line untouched) or appending it. Line endings are kept.
 */
export function setEnvValue(text: string, key: string, value: string): string {
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.length ? text.split(/\r?\n/) : [];
  const entry = `${key}=${formatValue(value)}`;
  const index = lines.findIndex((raw) => ENTRY.exec(raw)?.[1] === key);
  if (index >= 0) lines[index] = entry;
  else {
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    lines.push(entry, '');
  }
  return lines.join(newline);
}

/** A local MySQL URL with the password percent-encoded. */
export function localDatabaseUrl(input: {
  user: string;
  password: string;
  host?: string;
  port?: number;
  database: string;
}): string {
  const host = input.host ?? '127.0.0.1';
  const port = input.port ?? 3306;
  const credentials = input.password
    ? `${encodeURIComponent(input.user)}:${encodeURIComponent(input.password)}`
    : encodeURIComponent(input.user);
  return `mysql://${credentials}@${host}:${port}/${encodeURIComponent(input.database)}`;
}

/** Identifiers we are willing to put into DDL, without quoting tricks. */
export function isSafeIdentifier(value: string): boolean {
  return /^[A-Za-z0-9_]{1,64}$/.test(value);
}
