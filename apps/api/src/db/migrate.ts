import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import type { Connection, RowDataPacket } from 'mysql2/promise';

class MigrationPreflightError extends Error {}

/** DDL is not transactional on MySQL. Never hide duplicate-object errors or
 * rewrite journal rows to "repair" a partially applied migration. */
export async function migrateDatabase(connection: Connection, folder: string) {
  const migrations = readMigrationFiles({ migrationsFolder: folder });
  let applied: RowDataPacket[] = [];
  try {
    [applied] = await connection.query<RowDataPacket[]>(
      'SELECT hash, created_at FROM __drizzle_migrations ORDER BY id',
    );
  } catch (error) {
    if ((error as { code?: string }).code !== 'ER_NO_SUCH_TABLE') throw error;
  }
  if (
    applied.length > migrations.length ||
    applied.some(
      (row, index) =>
        row.hash !== migrations[index]?.hash ||
        Number(row.created_at) !== migrations[index]?.folderMillis,
    )
  )
    throw new MigrationPreflightError(
      'Migration history differs from this checkout. No DDL applied.',
    );

  // MariaDB <=10.9 can implicitly add zero TIMESTAMP defaults. Explicit
  // defaults preserve Drizzle's nullable timestamps without changing old SQL,
  // disabling strict date validation or changing the server globally.
  const [settings] = await connection.query<RowDataPacket[]>(
    'SELECT @@explicit_defaults_for_timestamp AS explicit_defaults',
  );
  if (!Number(settings[0]?.explicit_defaults)) {
    try {
      await connection.query('SET SESSION explicit_defaults_for_timestamp = 1');
    } catch {
      throw new MigrationPreflightError(
        'Enable explicit_defaults_for_timestamp=ON in the MariaDB server configuration and restart it before migrating. MariaDB 10.4 has no session override. No DDL applied.',
      );
    }
  }
  await migrate(drizzle(connection), { migrationsFolder: folder });
}

/** Only structured driver metadata; query parameters/credentials stay private. */
export function migrationFailure(error: unknown): string {
  if (error instanceof MigrationPreflightError) return error.message;
  let cause = error;
  while (cause && typeof cause === 'object' && 'cause' in cause && cause.cause)
    cause = cause.cause;
  const details = cause as { code?: string; errno?: number; sqlState?: string };
  return `Migration failed: ${details?.code ?? 'unknown'} (${details?.errno ?? '?'}; SQLSTATE ${details?.sqlState ?? '?'}). DDL may be partially applied; inspect the schema before retrying. Existing journal rows were not reset.`;
}
