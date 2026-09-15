import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogImportBatchV1Schema } from '@cieslacalc/catalog-core';
import { priceImportBatchV1Schema } from '@cieslacalc/pricing-core';
import { CatalogImporter } from '../catalog/importer';
import { PricingImporter } from '../pricing/importer';
import { createCatalogDatabase } from '../db/client';
import { DrizzleCatalogRepository } from '../db/catalog-repository';
import { DrizzlePricingRepository } from '../db/pricing-repository';

const here = dirname(fileURLToPath(import.meta.url));
const BATCH_DIR = resolve(here, '../data/import-batches');

/**
 * Deterministic first-run seed order (V35). Technical catalogue batches
 * apply before any pricing batch that references their commercial variants
 * (`prices-2026-09.json` needs KODA/DOMINO variants; `timber-prices-2026-09
 * .json` needs the timber-stock variants). `tiles-2026-09-v35.json` runs
 * after `tiles-2026-09.json` because it corrects/supersedes some of that
 * batch's entities (the CREATON→swissporTON KODA rebrand) rather than
 * standing alone. Each entry here is idempotent: a repeat `seed-all` run
 * reports `unchanged`/`applied` for the same rows, never a conflict.
 */
const CATALOG_BATCHES = [
  'tiles-2026-09.json',
  'tiles-2026-09-v35.json',
  'membranes-2026-09.json',
  'timber-stock-2026-09.json',
] as const;
const PRICING_BATCHES = [
  'prices-2026-09.json',
  'timber-prices-2026-09.json',
] as const;

async function main() {
  const apply = process.argv.includes('--apply');
  const connection = createCatalogDatabase();
  if (!connection)
    throw new Error('DATABASE_URL is required to seed the database.');
  const results: Array<{ file: string; status: string }> = [];
  try {
    const catalogImporter = new CatalogImporter(
      new DrizzleCatalogRepository(connection.db),
    );
    for (const file of CATALOG_BATCHES) {
      const contents = await readFile(resolve(BATCH_DIR, file), 'utf8');
      const batch = catalogImportBatchV1Schema.parse(JSON.parse(contents));
      const report = await catalogImporter.import(batch, { apply });
      results.push({ file, ...report });
      if (report.status === 'conflict')
        throw new Error(`${file}: import conflict — see report above`);
    }
    const pricingImporter = new PricingImporter(
      new DrizzlePricingRepository(connection.db),
    );
    for (const file of PRICING_BATCHES) {
      const contents = await readFile(resolve(BATCH_DIR, file), 'utf8');
      const batch = priceImportBatchV1Schema.parse(JSON.parse(contents));
      const report = await pricingImporter.import(batch, { apply });
      results.push({ file, ...report });
      if (report.status === 'conflict')
        throw new Error(`${file}: import conflict — see report above`);
    }
    console.log(JSON.stringify({ apply, results }, null, 2));
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      error: {
        code: 'seed-all-failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    }),
  );
  process.exitCode = 1;
});
