/**
 * Pure checks behind `pnpm configure:cloudflare`: the tracked
 * `wrangler.jsonc`, the NAMES of Worker secrets, the Hyperdrive caching flag
 * and the public probes of a deployed Worker. Text and JSON in, findings
 * out — never a secret value, never a network or account call from here.
 */

export type CloudflareIssue =
  | { code: 'config-unreadable' }
  | { code: 'worker-entry'; value: string | undefined }
  | { code: 'nodejs-compat-missing' }
  | { code: 'assets-not-spa' }
  | { code: 'api-not-worker-first' }
  | { code: 'auth-url-missing' }
  | { code: 'auth-url-invalid'; value: string }
  | { code: 'secret-in-config'; key: string }
  | { code: 'hyperdrive-missing' }
  | { code: 'hyperdrive-id-invalid'; value: string };

export type DeploymentIssue =
  | { code: 'unreachable'; path: string }
  | { code: 'not-worker'; runtime: string | undefined }
  | {
      code: 'database-not-connected';
      /** VNext-6.1: the Worker's generic class of the failure, if reported. */
      reason?: string;
    }
  | { code: 'readiness-missing' }
  | { code: 'schema-not-current'; schema: string }
  | { code: 'auth-unconfigured' }
  | { code: 'first-owner-required'; bootstrap: string | undefined };

export const WORKER_SECRETS = [
  'BETTER_AUTH_SECRET',
  'ROOFCALC_BOOTSTRAP_TOKEN',
] as const;
export const WORKER_ENTRY = './apps/api/src/edge/worker.ts';
/** Keys that must never appear in tracked `vars`. */
const PRIVATE_KEYS = [...WORKER_SECRETS, 'DATABASE_URL'];

/**
 * Parses the JSONC dialect wrangler accepts: `//` and block comments and
 * trailing commas, all outside strings. Returns `undefined` when invalid.
 */
export function parseJsonc(text: string): unknown {
  let output = '';
  let inString = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    const next = text[index + 1];
    if (inString) {
      output += char;
      if (char === '\\') output += text[++index] ?? '';
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
      output += char;
    } else if (char === '/' && next === '/') {
      while (index < text.length && text[index] !== '\n') index++;
      output += '\n';
    } else if (char === '/' && next === '*') {
      const end = text.indexOf('*/', index + 2);
      index = end < 0 ? text.length : end + 1;
    } else output += char;
  }
  try {
    return JSON.parse(output.replace(/,(\s*[}\]])/g, '$1'));
  } catch {
    return undefined;
  }
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/** An HTTPS browser origin: no credentials, path, query or fragment. */
export function isDeployedOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash &&
      !value.endsWith('/')
    );
  } catch {
    return false;
  }
}

export interface WranglerSummary {
  name?: string;
  authUrl?: string;
  hyperdriveId?: string;
}

export function summarizeWrangler(config: unknown): WranglerSummary {
  const root = record(config);
  const vars = record(root?.vars);
  const hyperdrive = Array.isArray(root?.hyperdrive)
    ? root.hyperdrive
        .map(record)
        .find((entry) => entry?.binding === 'HYPERDRIVE')
    : undefined;
  return {
    ...(typeof root?.name === 'string' ? { name: root.name } : {}),
    ...(typeof vars?.BETTER_AUTH_URL === 'string'
      ? { authUrl: vars.BETTER_AUTH_URL }
      : {}),
    ...(typeof hyperdrive?.id === 'string'
      ? { hyperdriveId: hyperdrive.id }
      : {}),
  };
}

/** Every problem of the tracked Worker configuration, most important first. */
export function analyzeWranglerConfig(config: unknown): CloudflareIssue[] {
  const root = record(config);
  if (!root) return [{ code: 'config-unreadable' }];
  const issues: CloudflareIssue[] = [];
  const vars = record(root.vars) ?? {};
  for (const key of PRIVATE_KEYS)
    if (key in vars) issues.push({ code: 'secret-in-config', key });
  if (root.main !== WORKER_ENTRY)
    issues.push({
      code: 'worker-entry',
      value: typeof root.main === 'string' ? root.main : undefined,
    });
  const flags = Array.isArray(root.compatibility_flags)
    ? root.compatibility_flags
    : [];
  if (!flags.includes('nodejs_compat'))
    issues.push({ code: 'nodejs-compat-missing' });
  const assets = record(root.assets);
  if (assets?.not_found_handling !== 'single-page-application')
    issues.push({ code: 'assets-not-spa' });
  const workerFirst = assets?.run_worker_first;
  if (
    workerFirst !== true &&
    !(Array.isArray(workerFirst) && workerFirst.includes('/api/*'))
  )
    issues.push({ code: 'api-not-worker-first' });
  const { authUrl, hyperdriveId } = summarizeWrangler(root);
  if (!authUrl) issues.push({ code: 'auth-url-missing' });
  else if (!isDeployedOrigin(authUrl))
    issues.push({ code: 'auth-url-invalid', value: authUrl });
  if (hyperdriveId === undefined) issues.push({ code: 'hyperdrive-missing' });
  else if (!/^[0-9a-f]{32}$/.test(hyperdriveId))
    issues.push({ code: 'hyperdrive-id-invalid', value: hyperdriveId });
  return issues;
}

/**
 * Names from `wrangler secret list --format json`. Wrangler may print
 * banner lines before the JSON array; values are never part of the output.
 */
export function parseSecretNames(output: string): string[] | undefined {
  const start = output.indexOf('[');
  const end = output.lastIndexOf(']');
  if (start < 0 || end < start) return undefined;
  try {
    const parsed: unknown = JSON.parse(output.slice(start, end + 1));
    if (!Array.isArray(parsed)) return undefined;
    return parsed
      .map((entry) => record(entry)?.name)
      .filter((name): name is string => typeof name === 'string');
  } catch {
    return undefined;
  }
}

/** `wrangler whoami --json` prints `{"loggedIn":false}` with exit code 0. */
export function parseLoggedIn(output: string): boolean {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start < 0 || end < start) return false;
  try {
    return record(JSON.parse(output.slice(start, end + 1)))?.loggedIn === true;
  } catch {
    return false;
  }
}

export function missingWorkerSecrets(names: readonly string[]): string[] {
  return WORKER_SECRETS.filter((key) => !names.includes(key));
}

/**
 * From `wrangler hyperdrive get <id>`: `true` when query caching is off,
 * `false` when on (the API default), `undefined` when unreadable.
 */
export function hyperdriveCachingDisabled(output: string): boolean | undefined {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start < 0 || end < start) return undefined;
  try {
    const caching = record(
      record(JSON.parse(output.slice(start, end + 1)))?.caching,
    );
    if (!caching) return false;
    return caching.disabled === true;
  } catch {
    return undefined;
  }
}

/** The MySQL TLS mode stored for the Hyperdrive origin, if any. */
export function hyperdriveSslMode(output: string): string | undefined {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start < 0 || end < start) return undefined;
  try {
    const mode = record(
      record(JSON.parse(output.slice(start, end + 1)))?.mtls,
    )?.sslmode;
    return typeof mode === 'string' ? mode : undefined;
  } catch {
    return undefined;
  }
}

/**
 * VNext-6.1: wrangler arguments that store a new origin password in
 * Hyperdrive while keeping everything else of the origin exactly as it is
 * (host, port, database, user, scheme, TLS mode). The password is one
 * argument of a shell-less child process — never logged, never in a file.
 */
export function hyperdrivePasswordUpdateArgs(input: {
  id: string;
  origin: DatabaseOrigin;
  password: string;
  sslmode?: string;
}): string[] {
  return [
    'hyperdrive',
    'update',
    input.id,
    '--origin-scheme',
    'mysql',
    '--origin-host',
    input.origin.host,
    '--origin-port',
    String(input.origin.port),
    '--database',
    input.origin.database,
    '--origin-user',
    input.origin.user,
    '--origin-password',
    input.password,
    ...(input.sslmode ? ['--sslmode', input.sslmode] : []),
  ];
}

/** The origin database behind a Hyperdrive configuration — never a password. */
export interface DatabaseOrigin {
  host: string;
  port: number;
  database: string;
  user: string;
}

/** From `wrangler hyperdrive get <id>` (the API never returns the password). */
export function parseHyperdriveOrigin(
  output: string,
): DatabaseOrigin | undefined {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start < 0 || end < start) return undefined;
  try {
    const origin = record(
      record(JSON.parse(output.slice(start, end + 1)))?.origin,
    );
    const port = Number(origin?.port ?? 3306);
    if (
      typeof origin?.host !== 'string' ||
      typeof origin.database !== 'string' ||
      typeof origin.user !== 'string' ||
      !Number.isInteger(port)
    )
      return undefined;
    return {
      host: origin.host,
      port,
      database: origin.database,
      user: origin.user,
    };
  } catch {
    return undefined;
  }
}

export interface Probe {
  status: number;
  body: unknown;
}

export interface DeploymentProbes {
  health?: Probe;
  readiness?: Probe;
  setup?: Probe;
}

/** What the public, read-only endpoints of the deployed Worker say. */
export function analyzeDeployment(probes: DeploymentProbes): DeploymentIssue[] {
  if (!probes.health || probes.health.status !== 200)
    return [{ code: 'unreachable', path: '/api/health' }];
  const issues: DeploymentIssue[] = [];
  const health = record(probes.health.body) ?? {};
  if (health.runtime !== 'cloudflare-worker')
    issues.push({
      code: 'not-worker',
      runtime: typeof health.runtime === 'string' ? health.runtime : undefined,
    });
  if (health.database !== 'connected')
    issues.push({
      code: 'database-not-connected',
      ...(typeof health.databaseReason === 'string'
        ? { reason: health.databaseReason }
        : {}),
    });
  // An older deployment predates the readiness endpoint: the SPA or a
  // generic 404 answers instead of `{ schema }`.
  const schema = record(probes.readiness?.body)?.schema;
  if (!probes.readiness || probes.readiness.status === 404 || !schema)
    issues.push({ code: 'readiness-missing' });
  else if (schema !== 'current')
    issues.push({ code: 'schema-not-current', schema: String(schema) });
  if (health.auth !== 'configured') issues.push({ code: 'auth-unconfigured' });
  const setup = record(probes.setup?.body);
  if (setup?.firstOwner === 'required')
    issues.push({
      code: 'first-owner-required',
      bootstrap:
        typeof setup.bootstrap === 'string' ? setup.bootstrap : undefined,
    });
  return issues;
}
