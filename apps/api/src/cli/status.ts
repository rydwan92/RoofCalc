import type { RowDataPacket } from 'mysql2/promise';
import { createCatalogDatabase } from '../db/client';
import { databaseFailureReason } from '../db/doctor';
import { describeDatabaseTarget, isLoopbackHost } from '../db/config';
import { readSystemStatus } from '../db/system-status';

async function main() {
  const connection = createCatalogDatabase();
  if (!connection) {
    console.log('DATABASE NOT READY — DATABASE_URL is not configured.');
    if (process.argv.includes('--require-ready')) process.exitCode = 1;
    return;
  }
  console.log(
    `TARGET: ${isLoopbackHost(connection.options.host) ? 'local' : 'remote'}`,
  );
  console.log(`SERVER: ${describeDatabaseTarget(connection.options)}`);
  try {
    const [versionRows] = await connection.pool.query<RowDataPacket[]>(
      'SELECT VERSION() AS version',
    );
    console.log(
      `SERVER VERSION: ${String(versionRows[0]?.version ?? 'unknown')}`,
    );
    const state = await readSystemStatus(connection.db);
    console.log(
      `MIGRATIONS: ${state.migrations.state} (${state.migrations.applied}/${state.migrations.expected})`,
    );
    console.log(
      `CATALOGUE SEEDS: ${state.seeds.catalogue.state} (${state.seeds.catalogue.current}/${state.seeds.catalogue.expected})`,
    );
    console.log(
      `PRICING SEEDS: ${state.seeds.pricing.state} (${state.seeds.pricing.current}/${state.seeds.pricing.expected})`,
    );
    console.log(
      `BUSINESS SEED: ${state.seeds.business.state} (${state.seeds.business.current}/${state.seeds.business.expected})`,
    );
    const ready =
      state.migrations.state === 'current' &&
      Object.values(state.seeds).every(
        (category) => category.state === 'current',
      );
    console.log(ready ? 'DATABASE READY' : 'DATABASE NOT READY');
    if (!ready && process.argv.includes('--require-ready'))
      process.exitCode = 1;
  } catch (error) {
    console.log(`DATABASE NOT READY — ${databaseFailureReason(error)}`);
    process.exitCode = 1;
  } finally {
    await connection.close();
  }
}

void main().catch(() => {
  console.error('Database status failed.');
  process.exitCode = 1;
});
