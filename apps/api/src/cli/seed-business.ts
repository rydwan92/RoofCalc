import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCatalogDatabase } from '../db/client';
import { DrizzleBusinessRepository } from '../db/business-repository';
import { businessSeedSchema, resolveBusinessSeed } from '../business/seed';
import { seedBusinessOrganization } from '../business/seed-runner';

const here = dirname(fileURLToPath(import.meta.url));
const SEED_FILE = resolve(here, '../data/business/demo-wholesaler.v1.json');

/**
 * Seeds the DEMO wholesaler (§35). Idempotent: rows are keyed by
 * `(organization, external key)`, so running it twice updates in place and
 * creates nothing new. Dry-run by default, like the catalogue importer.
 */
async function main() {
  const apply = process.argv.includes('--apply');
  const connection = createCatalogDatabase();
  if (!connection)
    throw new Error('DATABASE_URL is required to seed the business layer.');
  try {
    const seed = businessSeedSchema.parse(
      JSON.parse(await readFile(SEED_FILE, 'utf8')),
    );
    const repository = new DrizzleBusinessRepository(connection.db);
    const report = await seedBusinessOrganization(
      repository,
      repository,
      resolveBusinessSeed(seed),
      { apply },
    );
    console.log(JSON.stringify({ apply, ...report }, null, 2));
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      error: {
        code: 'seed-business-failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    }),
  );
  process.exitCode = 1;
});
