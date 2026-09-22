import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RowDataPacket } from 'mysql2/promise';
import { catalogImportBatchV1Schema } from '@cieslacalc/catalog-core';
import { priceImportBatchV1Schema } from '@cieslacalc/pricing-core';
import { CatalogImporter } from '../catalog/importer';
import { PricingImporter } from '../pricing/importer';
import { createCatalogDatabase } from '../db/client';
import { DrizzleCatalogRepository } from '../db/catalog-repository';
import { DrizzlePricingRepository } from '../db/pricing-repository';
import {
  CATALOGUE_SEED_BATCHES,
  PRICING_SEED_BATCHES,
} from '../data/seed-manifest';

const here = dirname(fileURLToPath(import.meta.url));
const BATCH_DIR = resolve(here, '../data/import-batches');

/**
 * Deterministic first-run seed order (V35). Technical catalogue batches
 * apply before any pricing batch that references their commercial variants
 * (`prices-2026-09.json` needs KODA/DOMINO variants; `timber-prices-2026-09
 * .json` needs the timber-stock variants). `tiles-2026-09-v35.json` runs
 * after `tiles-2026-09.json` because it corrects/supersedes some of that
 * batch's entities (the CREATON→swissporTON KODA rebrand) rather than
 * standing alone. The ordered run is idempotent in its final database state:
 * repeating it adds no canonical rows and causes no immutable conflicts.
 * Earlier V35 batches may temporarily update mutable family/variant rows
 * before the later correction batch restores their final values.
 */
async function main() {
  const apply = process.argv.includes('--apply');
  const connection = createCatalogDatabase();
  if (!connection)
    throw new Error('DATABASE_URL is required to seed the database.');
  const results: Array<{ file: string; status: string }> = [];
  try {
    const protectedIds = new Set<string>();
    for (const table of [
      'manufacturers',
      'technical_product_families',
      'technical_product_revisions',
      'commercial_variants',
      'price_lists',
      'price_list_entries',
    ]) {
      const [rows] = await connection.pool.query<RowDataPacket[]>(
        `SELECT id FROM ${table}`,
      );
      for (const row of rows) protectedIds.add(String(row.id));
    }
    const catalogImporter = new CatalogImporter(
      new DrizzleCatalogRepository(connection.db),
    );
    for (const file of CATALOGUE_SEED_BATCHES) {
      const contents = await readFile(resolve(BATCH_DIR, file), 'utf8');
      const batch = catalogImportBatchV1Schema.parse(JSON.parse(contents));
      const report = await catalogImporter.import(batch, {
        apply,
        protectedIds,
      });
      results.push({ file, ...report });
      if (report.status === 'conflict')
        throw new Error(`${file}: import conflict — see report above`);
    }
    const pricingImporter = new PricingImporter(
      new DrizzlePricingRepository(connection.db),
    );
    for (const file of PRICING_SEED_BATCHES) {
      const contents = await readFile(resolve(BATCH_DIR, file), 'utf8');
      const batch = priceImportBatchV1Schema.parse(JSON.parse(contents));
      const report = await pricingImporter.import(batch, {
        apply,
        protectedIds,
      });
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
