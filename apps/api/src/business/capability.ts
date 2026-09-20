/**
 * ============================================================================
 * PRODUCTION ADMIN AUTHENTICATION IS NOT IMPLEMENTED YET.
 * ============================================================================
 *
 * V54 builds the Admin MVP's domain, repositories and services in full, but
 * RoofCalc has no user, session or role model. Publishing an unauthenticated
 * write endpoint would mean anyone who can reach the server could rewrite a
 * wholesaler's assortment and prices.
 *
 * So admin mutations are gated twice, and both gates must pass:
 *
 *   1. `BUSINESS_ADMIN_DEV_MODE=true` must be set in the server environment;
 *   2. the request must arrive over loopback (127.0.0.1 / ::1 / localhost).
 *
 * Cloud and production default to **disabled**: the flag is absent, and the
 * Cloudflare Worker never constructs an admin service at all (see
 * `edge/worker.ts`), so the edge deployment has no write surface to reach.
 *
 * This is a development affordance, not a security model. Do not treat it as
 * multi-user admin, and do not extend it — the next iteration that needs real
 * admin access must add authentication first.
 */

export interface AdminRequestContext {
  /** The socket's remote address, as the transport reports it. */
  remoteAddress?: string;
  /** The request `Host` header, used to reject a non-loopback host. */
  host?: string;
}

const LOOPBACK_ADDRESSES = new Set([
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
  'localhost',
]);

/** Env flag only. Exported separately so a test can assert the default. */
export function adminDevModeEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.BUSINESS_ADMIN_DEV_MODE === 'true';
}

function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  // Strip the port; an IPv6 host arrives bracketed, e.g. `[::1]:3001`.
  const withoutPort = host.startsWith('[')
    ? host.slice(1, host.indexOf(']'))
    : (host.split(':')[0] ?? '');
  return LOOPBACK_ADDRESSES.has(withoutPort.toLowerCase());
}

function isLoopbackAddress(address: string | undefined): boolean {
  return address !== undefined && LOOPBACK_ADDRESSES.has(address.toLowerCase());
}

/**
 * Both gates. A missing remote address fails closed: if the transport cannot
 * prove the request came from this machine, it is treated as remote.
 */
export function adminWritesAllowed(
  context: AdminRequestContext,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return (
    adminDevModeEnabled(env) &&
    isLoopbackAddress(context.remoteAddress) &&
    isLoopbackHost(context.host)
  );
}
