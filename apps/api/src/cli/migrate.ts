import '../environment';
import { resolve } from 'node:path';
import { createConnection } from 'mysql2/promise';
import { findWorkspaceRoot } from '../environment';
import { parseDatabaseUrl } from '../db/config';
import {
  assertLocalSetupTarget,
  assertSharedDevSetupTarget,
} from '../db/setup-target';
import { migrateDatabase, migrationFailure } from '../db/migrate';

async function main() {
  const confirmation = process.argv.indexOf('--confirm');
  const target =
    process.env.ROOFCALC_DB_ENV === 'shared-dev'
      ? assertSharedDevSetupTarget({
          databaseUrl: process.env.DATABASE_URL,
          environment: process.env.ROOFCALC_DB_ENV,
          apply: process.argv.includes('--apply'),
          confirmation:
            confirmation >= 0 ? process.argv[confirmation + 1] : undefined,
        })
      : assertLocalSetupTarget(process.env.DATABASE_URL);
  console.log(`Migrate ${target.environment}: ${target.description}`);
  const connection = await createConnection(
    parseDatabaseUrl(process.env.DATABASE_URL!),
  );
  try {
    await migrateDatabase(
      connection,
      resolve(findWorkspaceRoot()!, 'migrations'),
    );
    console.log('Migrations applied; history preserved.');
  } catch (error) {
    console.error(migrationFailure(error));
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}
void main().catch(() => {
  console.error(
    'Migration refused or connection unavailable. Check db:doctor and the local/shared-dev target acknowledgement.',
  );
  process.exitCode = 1;
});
