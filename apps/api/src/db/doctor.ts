import type { RowDataPacket } from 'mysql2/promise';

export function databaseFailureReason(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? error.code
      : undefined;
  switch (code) {
    case 'ER_ACCESS_DENIED_ERROR':
    case 'ER_DBACCESS_DENIED_ERROR':
      return 'Access denied. Check the database user, password and grants in DATABASE_URL.';
    case 'ER_BAD_DB_ERROR':
      return 'Database does not exist. Create the database named in DATABASE_URL.';
    case 'ECONNREFUSED':
    case 'ETIMEDOUT':
    case 'ENOTFOUND':
      return 'Server unavailable. Check database host/port and provider remote-access ACL.';
    case 'ER_NOT_KEYFILE':
    case 'ER_CRASHED_ON_USAGE':
      return 'MariaDB reports a damaged table. Back up and check affected tables before repairing them.';
    default:
      return 'Database operation failed. Check DATABASE_URL and database server diagnostics.';
  }
}

export interface DoctorConnection {
  query(sql: string): Promise<[unknown, unknown]>;
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
  lines.push('Database: connected');
  try {
    const [server] = await connection.query(
      'SELECT VERSION() AS version, DATABASE() AS database_name',
    );
    const serverRow = (server as RowDataPacket[])[0];
    lines.push(
      `Server: ${String(serverRow?.version ?? 'unknown')}`,
      `Database name: ${String(serverRow?.database_name ?? 'unknown')}`,
    );
    const [migrations] = await connection.query(
      'SELECT COUNT(*) AS count FROM __drizzle_migrations',
    );
    const count = Number((migrations as RowDataPacket[])[0]?.count ?? 0);
    lines.push(
      `Schema migrations: ${count === expectedMigrations ? 'current' : 'pending'} (${count}/${expectedMigrations})`,
    );
    const [products] = await connection.query(
      'SELECT COUNT(*) AS count FROM technical_product_families WHERE active = 1',
    );
    const [manufacturers] = await connection.query(
      'SELECT COUNT(*) AS count FROM manufacturers WHERE active = 1',
    );
    const [kinds] = await connection.query(
      'SELECT covering_kind AS kind, COUNT(*) AS count FROM technical_product_families WHERE active = 1 GROUP BY covering_kind ORDER BY covering_kind',
    );
    const [prices] = await connection.query(
      'SELECT COUNT(*) AS count FROM price_list_entries',
    );
    lines.push(
      `Catalogue: ${Number((products as RowDataPacket[])[0]?.count ?? 0)} products`,
      `Manufacturers: ${Number((manufacturers as RowDataPacket[])[0]?.count ?? 0)}`,
      ...(kinds as RowDataPacket[]).map(
        (row) => `Kind ${String(row.kind)}: ${Number(row.count)}`,
      ),
      `Prices: ${Number((prices as RowDataPacket[])[0]?.count ?? 0)} entries`,
    );
  } catch {
    lines.push('Schema/catalogue/pricing: unavailable. Run pnpm db:bootstrap.');
  }
  return lines;
}
