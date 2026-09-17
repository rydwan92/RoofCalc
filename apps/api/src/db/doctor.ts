import type { RowDataPacket } from 'mysql2/promise';
import type { DatabaseConnectionOptions } from './config';

export function databaseFailureReason(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? error.code
      : undefined;
  switch (code) {
    case 'ER_ACCESS_DENIED_ERROR':
      return 'Access denied. Check the user and password in DATABASE_URL (encode @ as %40). Accounts with REQUIRE SSL also reject plaintext logins — do not use ?ssl=disabled for remote hosts.';
    case 'ER_DBACCESS_DENIED_ERROR':
      return 'Access to the database denied. Grant the user privileges on the database named in DATABASE_URL.';
    case 'ER_BAD_DB_ERROR':
      return 'Database does not exist. Create the database named in DATABASE_URL.';
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return 'Host name does not resolve. Check the host in DATABASE_URL (alwaysdata uses mysql-<account>.alwaysdata.net).';
    case 'ECONNREFUSED':
    case 'ETIMEDOUT':
    case 'ECONNRESET':
      return 'Server unavailable. Check database host/port and provider remote-access ACL.';
    case 'HANDSHAKE_NO_SSL_SUPPORT':
      return 'The server does not offer TLS. Use ?ssl=disabled only for a trusted local database.';
    case 'HANDSHAKE_SSL_ERROR':
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
    case 'CERT_HAS_EXPIRED':
      return 'TLS certificate could not be verified. Hyperdrive also requires a publicly trusted certificate for its default mode.';
    case 'ER_NOT_KEYFILE':
    case 'ER_CRASHED_ON_USAGE':
      return 'MariaDB reports a damaged table. Back up and check affected tables before repairing them.';
    default:
      return 'Database operation failed. Check DATABASE_URL and database server diagnostics.';
  }
}

export interface NetworkProbe {
  lookup(host: string): Promise<string[]>;
  connect(host: string, port: number): Promise<void>;
}

/**
 * DNS and TCP reachability before any credentials are sent. Prints only the
 * host/port/database/TLS mode — never the user or password.
 */
export async function diagnoseNetwork(
  options: DatabaseConnectionOptions,
  probe: NetworkProbe,
): Promise<{ ok: boolean; lines: string[] }> {
  const lines = [
    `Target: ${options.host}:${options.port}/${options.database}`,
    `TLS: ${options.ssl ? 'required (certificate verified)' : 'disabled (loopback or explicit ?ssl=disabled)'}`,
  ];
  try {
    const addresses = await probe.lookup(options.host);
    lines.push(`DNS: ok (${addresses.join(', ')})`);
  } catch (error) {
    lines.push('DNS: failed', `Reason: ${databaseFailureReason(error)}`);
    return { ok: false, lines };
  }
  try {
    await probe.connect(options.host, options.port);
    lines.push('TCP: ok');
  } catch (error) {
    lines.push('TCP: failed', `Reason: ${databaseFailureReason(error)}`);
    return { ok: false, lines };
  }
  return { ok: true, lines };
}

export interface DoctorConnection {
  query(sql: string): Promise<[unknown, unknown]>;
}

const rows = (result: [unknown, unknown]) => result[0] as RowDataPacket[];

/** Drops password hashes from a SHOW GRANTS line. */
export function sanitizeGrant(grant: string): string {
  return grant
    .replace(
      /IDENTIFIED\s+(BY|VIA|WITH)\s+.*?(?=\s+REQUIRE\b|\s+WITH\b|$)/i,
      '',
    )
    .replace(/\s+TO\s+\S+/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** A read-only diagnostic. Never forwards a driver message or connection URI. */
export async function diagnoseDatabase(
  connection: DoctorConnection | undefined,
  expectedMigrations: number,
): Promise<string[]> {
  const lines = [`DATABASE_URL configured: ${connection ? 'yes' : 'no'}`];
  if (!connection)
    return [
      ...lines,
      'Database: unavailable',
      'Reason: Set DATABASE_URL in root .env or the environment. Local geometry remains available.',
    ];
  try {
    await connection.query('SELECT 1');
  } catch (error) {
    return [
      ...lines,
      'Database: unavailable',
      `Reason: ${databaseFailureReason(error)}`,
    ];
  }
  lines.push('Database: connected (authentication ok)');
  try {
    const serverRow = rows(
      await connection.query(
        'SELECT VERSION() AS version, DATABASE() AS database_name',
      ),
    )[0];
    lines.push(
      `Server: ${String(serverRow?.version ?? 'unknown')}`,
      `Database name: ${String(serverRow?.database_name ?? 'unknown')}`,
    );
    const tls = rows(
      await connection.query("SHOW SESSION STATUS LIKE 'Ssl_version'"),
    )[0];
    lines.push(`Session TLS: ${String(tls?.Value || 'none')}`);
    for (const grant of rows(await connection.query('SHOW GRANTS')))
      lines.push(`Grant: ${sanitizeGrant(String(Object.values(grant)[0]))}`);
    const tables = Number(
      rows(
        await connection.query(
          'SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()',
        ),
      )[0]?.count ?? 0,
    );
    lines.push(`Read access: ok (${tables} tables)`);
    if (tables === 0) {
      lines.push(
        `Schema migrations: pending (0/${expectedMigrations})`,
        'Schema: empty. Run pnpm db:bootstrap.',
      );
      return lines;
    }
  } catch (error) {
    lines.push(`Server checks: failed. ${databaseFailureReason(error)}`);
    return lines;
  }
  try {
    const count = Number(
      rows(
        await connection.query(
          'SELECT COUNT(*) AS count FROM __drizzle_migrations',
        ),
      )[0]?.count ?? 0,
    );
    lines.push(
      `Schema migrations: ${count === expectedMigrations ? 'current' : 'pending'} (${count}/${expectedMigrations})`,
    );
    const products = rows(
      await connection.query(
        'SELECT COUNT(*) AS count FROM technical_product_families WHERE active = 1',
      ),
    );
    const manufacturers = rows(
      await connection.query(
        'SELECT COUNT(*) AS count FROM manufacturers WHERE active = 1',
      ),
    );
    const kinds = rows(
      await connection.query(
        'SELECT covering_kind AS kind, COUNT(*) AS count FROM technical_product_families WHERE active = 1 GROUP BY covering_kind ORDER BY covering_kind',
      ),
    );
    const prices = rows(
      await connection.query(
        'SELECT COUNT(*) AS count FROM price_list_entries',
      ),
    );
    lines.push(
      `Catalogue: ${Number(products[0]?.count ?? 0)} products`,
      `Manufacturers: ${Number(manufacturers[0]?.count ?? 0)}`,
      ...kinds.map((row) => `Kind ${String(row.kind)}: ${Number(row.count)}`),
      `Prices: ${Number(prices[0]?.count ?? 0)} entries`,
    );
  } catch {
    lines.push('Schema/catalogue/pricing: unavailable. Run pnpm db:bootstrap.');
  }
  return lines;
}
