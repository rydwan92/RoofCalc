import type { RowDataPacket } from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createCatalogDatabase } from '../db/client';
import { databaseFailureReason } from '../db/doctor';
import { describeDatabaseTarget, isLoopbackHost } from '../db/config';
import { classifySeedStatus, type ObservedSeed } from '../db/seed-status';
import { loadExpectedSeeds } from '../data/seed-manifest-loader';
import { findWorkspaceRoot } from '../environment';

const rows = (result: [unknown, unknown]) => result[0] as RowDataPacket[];

async function main() {
  const expected = await loadExpectedSeeds();
  const root = findWorkspaceRoot() ?? process.cwd();
  const journal = JSON.parse(
    await readFile(resolve(root, 'migrations/meta/_journal.json'), 'utf8'),
  ) as { entries: unknown[] };
  const connection = createCatalogDatabase();
  if (!connection) {
    console.log('TARGET: not configured');
    console.log('SERVER: unavailable');
    console.log(`MIGRATIONS: unknown (0/${journal.entries.length})`);
    console.log('TABLE COUNTS: unavailable');
    console.log('SEED STATUS: unavailable — DATABASE_URL is not configured');
    return;
  }
  const target = isLoopbackHost(connection.options.host) ? 'local' : 'remote';
  console.log(`TARGET: ${target}`);
  console.log(`SERVER: ${describeDatabaseTarget(connection.options)}`);
  try {
    const version = rows(
      await connection.pool.query('SELECT VERSION() AS version'),
    )[0];
    console.log(`SERVER VERSION: ${String(version?.version ?? 'unknown')}`);
    const migrationCount = Number(
      rows(
        await connection.pool.query(
          'SELECT COUNT(*) AS count FROM __drizzle_migrations',
        ),
      )[0]?.count ?? 0,
    );
    console.log(
      `MIGRATIONS: ${migrationCount === journal.entries.length ? 'current' : 'pending'} (${migrationCount}/${journal.entries.length})`,
    );
    const countTables = [
      'manufacturers',
      'technical_product_families',
      'technical_product_revisions',
      'commercial_variants',
      'price_lists',
      'price_list_entries',
      'organizations',
      'organization_assortment_items',
    ];
    console.log('TABLE COUNTS:');
    for (const table of countTables) {
      const count = Number(
        rows(
          await connection.pool.query(`SELECT COUNT(*) AS count FROM ${table}`),
        )[0]?.count ?? 0,
      );
      console.log(`  ${table}: ${count}`);
    }
    const observed: ObservedSeed[] = [
      ...rows(
        await connection.pool.query(
          "SELECT source_id, checksum FROM catalog_import_batches WHERE status = 'completed'",
        ),
      ).map((row) => ({
        category: 'catalogue' as const,
        sourceId: String(row.source_id),
        checksum: String(row.checksum),
      })),
      ...rows(
        await connection.pool.query(
          "SELECT source_id, checksum FROM pricing_import_batches WHERE status = 'completed'",
        ),
      ).map((row) => ({
        category: 'pricing' as const,
        sourceId: String(row.source_id),
        checksum: String(row.checksum),
      })),
    ];
    observed.push(
      ...rows(
        await connection.pool.query(
          "SELECT organization_id, checksum FROM organization_import_batches WHERE source_label = 'roofcalc-starter-business' AND status = 'completed'",
        ),
      ).map((row) => ({
        category: 'business' as const,
        sourceId: String(row.organization_id),
        checksum: String(row.checksum),
      })),
    );
    console.log('SEED STATUS:');
    const states = classifySeedStatus(expected, observed);
    for (const category of ['catalogue', 'pricing', 'business'] as const) {
      const group = states.filter((entry) => entry.category === category);
      const current = group.filter((entry) => entry.state === 'current').length;
      console.log(
        `  ${category}: ${current === group.length ? 'current' : 'incomplete'} (${current}/${group.length})`,
      );
    }
    for (const seed of classifySeedStatus(expected, observed))
      console.log(
        `  ${seed.state === 'current' ? '✓' : seed.state === 'outdated' ? '!' : '—'} ${seed.file}${seed.state === 'current' ? '' : ` — ${seed.state}`}`,
      );
  } catch (error) {
    console.log(
      `DATABASE STATUS: unavailable — ${databaseFailureReason(error)}`,
    );
    process.exitCode = 1;
  } finally {
    await connection.close();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Database status failed.',
  );
  process.exitCode = 1;
});
