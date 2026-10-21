export type FeatureKey =
  `calculator.${string}` | `export.${string}` | `projects.${string}`;
/**
 * `connected`: a live `SELECT 1` succeeded. `unavailable`: configured but
 * unreachable. `not-configured`: no DATABASE_URL / HYPERDRIVE binding.
 * Geometry and saved local projects never depend on this.
 */
export type DatabaseHealth = 'connected' | 'unavailable' | 'not-configured';

/**
 * Why a configured database is unavailable — a generic class only. The
 * server's own message (host, user, detail) never leaves the API.
 */
export type DatabaseUnavailableReason =
  | 'access-denied'
  | 'database-missing'
  | 'timeout'
  | 'unreachable'
  | 'tls'
  | 'unknown';

export interface HealthResponse {
  /** `ok` only when the database is connected; the API itself is always up. */
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  runtime: 'node' | 'cloudflare-worker';
  database: DatabaseHealth;
  /** Present only when `database` is `unavailable`. */
  databaseReason?: DatabaseUnavailableReason;
  auth: 'configured' | 'unconfigured';
}
