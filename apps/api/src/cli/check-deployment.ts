import { createCatalogDatabase } from '../db/client';
import { isLoopbackHost } from '../db/config';
import { readSchemaState } from '../db/schema-readiness';
import { readSystemStatus } from '../db/system-status';

/** Read-only predeploy gate. Local XAMPP can never certify the remote DB. */
async function main() {
  const connection = createCatalogDatabase();
  if (!connection) throw Error('A private remote DATABASE_URL is required.');
  try {
    if (
      isLoopbackHost(connection.options.host) ||
      !connection.options.ssl ||
      !['shared-dev', 'production'].includes(process.env.ROOFCALC_DB_ENV ?? '')
    )
      throw Error(
        'Deployment check requires an explicitly named remote environment; local XAMPP is not the Worker database.',
      );
    const state = await readSchemaState(connection.pool);
    const system = await readSystemStatus(connection.db);
    if (
      state !== 'current' ||
      Object.values(system.seeds).some((seed) => seed.state !== 'current')
    )
      throw Error(
        'Remote schema/seeds are not ready. Run separately approved maintenance before deploying.',
      );
    console.log(
      'Remote database ready for this checkout. No migrations or seeds executed.',
    );
  } finally {
    await connection.close();
  }
}
void main().catch(() => {
  console.error(
    'Deployment readiness failed. Check remote DATABASE_URL, ROOFCALC_DB_ENV and db:status -- --require-ready. No deployment performed.',
  );
  process.exitCode = 1;
});
