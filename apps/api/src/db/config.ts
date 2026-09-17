/**
 * `DATABASE_URL` is the single Node-side database setting. This parser turns
 * it into explicit mysql2/drizzle-kit options so every Node entry point
 * (API, bootstrap, doctor, drizzle-kit) applies the same TLS policy.
 *
 * TLS policy:
 * - loopback hosts (local XAMPP, Docker, CI service) default to plain TCP;
 * - every other host defaults to TLS with full certificate and hostname
 *   verification — remote shared databases (alwaysdata DEV requires
 *   `REQUIRE SSL`) never silently fall back to plaintext;
 * - `?ssl=required` forces verified TLS, `?ssl=disabled` opts out explicitly.
 *
 * Errors never include the URL, user or password.
 */
export interface DatabaseTlsOptions {
  rejectUnauthorized: true;
  minVersion: 'TLSv1.2';
}

export interface DatabaseConnectionOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: DatabaseTlsOptions;
}

export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseConfigError';
  }
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.toLowerCase());
}

function decode(value: string, field: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new DatabaseConfigError(
      `DATABASE_URL ${field} is not valid percent-encoding (encode @ as %40).`,
    );
  }
}

export function parseDatabaseUrl(
  databaseUrl: string,
): DatabaseConnectionOptions {
  let url: URL;
  try {
    url = new URL(databaseUrl.trim());
  } catch {
    throw new DatabaseConfigError(
      'DATABASE_URL is not a valid URL. Expected mysql://user:password@host:3306/database (encode @ in the password as %40).',
    );
  }
  if (url.protocol !== 'mysql:' && url.protocol !== 'mariadb:')
    throw new DatabaseConfigError('DATABASE_URL must use the mysql:// scheme.');
  if (!url.hostname) throw new DatabaseConfigError('DATABASE_URL has no host.');
  const database = decode(url.pathname.replace(/^\//, ''), 'database');
  if (!database || database.includes('/'))
    throw new DatabaseConfigError(
      'DATABASE_URL must name exactly one database in its path.',
    );
  const user = decode(url.username, 'user');
  if (!user) throw new DatabaseConfigError('DATABASE_URL has no user.');
  const port = url.port ? Number(url.port) : 3306;
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new DatabaseConfigError('DATABASE_URL has an invalid port.');

  const host = url.hostname;
  const sslParam = (
    url.searchParams.get('ssl') ??
    url.searchParams.get('sslmode') ??
    ''
  ).toLowerCase();
  let tls: boolean;
  if (sslParam === '') tls = !isLoopbackHost(host);
  else if (
    ['required', 'require', 'true', '1', 'verify-identity'].includes(sslParam)
  )
    tls = true;
  else if (['disabled', 'disable', 'false', '0'].includes(sslParam))
    tls = false;
  else
    throw new DatabaseConfigError(
      'DATABASE_URL ssl parameter must be "required" or "disabled".',
    );

  return {
    host,
    port,
    user,
    password: decode(url.password, 'password'),
    database,
    ...(tls
      ? { ssl: { rejectUnauthorized: true, minVersion: 'TLSv1.2' } as const }
      : {}),
  };
}

/** Safe, credential-free description for logs and diagnostics. */
export function describeDatabaseTarget(
  options: DatabaseConnectionOptions,
): string {
  return `${options.host}:${options.port}/${options.database} (${options.ssl ? 'TLS verified' : 'plain TCP'})`;
}
