import '../environment';
import { resolve } from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { describeDatabaseTarget, parseDatabaseUrl } from '../db/config';
import { explicitTimestampDdl } from '../db/legacy-timestamps';
import { findWorkspaceRoot } from '../environment';

/**
 * Applies `migrations/` with the same journal table and hashes as
 * drizzle-kit, over the API's own TLS policy. On MariaDB < 10.10, where
 * `explicit_defaults_for_timestamp` is OFF and read-only, timestamp columns
 * are made explicit at apply time (see legacy-timestamps.ts).
 */
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.trim()) throw new Error('DATABASE_URL is required.');
  const options = parseDatabaseUrl(databaseUrl);
  const connection = await mysql.createConnection({
    ...options,
    connectTimeout: 10000,
  });
  try {
    const [rows] = await connection.query(
      'SELECT @@explicit_defaults_for_timestamp AS explicitDefaults',
    );
    const legacy =
      Number(
        (rows as Array<{ explicitDefaults: unknown }>)[0]?.explicitDefaults,
      ) !== 1;
    const config = {
      migrationsFolder: resolve(
        findWorkspaceRoot() ?? process.cwd(),
        'migrations',
      ),
    };
    const migrations = readMigrationFiles(config).map((migration) =>
      legacy
        ? { ...migration, sql: migration.sql.map(explicitTimestampDdl) }
        : migration,
    );
    const db = drizzle(connection) as unknown as {
      dialect: {
        migrate(
          migrations: unknown,
          session: unknown,
          config: unknown,
        ): Promise<void>;
      };
      session: unknown;
    };
    await db.dialect.migrate(migrations, db.session, config);
    console.log(
      `Migrations applied: ${describeDatabaseTarget(options)}${legacy ? ' (explicit timestamp DDL for MariaDB < 10.10)' : ''}`,
    );
  } finally {
    await connection.end();
  }
}

void main().catch((error: unknown) => {
  // mysql2 messages carry the SQL error, never the credentials.
  console.error(
    error instanceof Error
      ? `Migration failed: ${error.message}`
      : 'Migration failed.',
  );
  process.exitCode = 1;
});
