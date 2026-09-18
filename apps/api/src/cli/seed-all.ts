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
 * standing alone. The ordered run is idempotent in its final database state:
 * repeating it adds no canonical rows and causes no immutable conflicts.
 * Earlier V35 batches may temporarily update mutable family/variant rows
 * before the later correction batch restores their final values.
 */
const CATALOG_BATCHES = [
  'tiles-2026-09.json',
  'tiles-2026-09-v35.json',
  'membranes-2026-09.json',
  'timber-stock-2026-09.json',
  // V39: the first real metal roofing products. The modular-sheet catalogue
  // was empty before this, so the covering picker could only offer manual
  // entry for blachodachówka and blacha trapezowa.
  'metal-sheets-2026-09.json',
  'metal-roofing-additions-2026-09-v42.json',
  // V49: verified batten-sized timber with source-declared applications.
  // Additive to the V35 timber batch, which it never touches.
  'timber-linear-stock-2026-09.json',
] as const;
const PRICING_BATCHES = [
  'prices-2026-09.json',
  'timber-prices-2026-09.json',
  'metal-prices-ruukki-2026-04-28.json',
  // V49: only prices whose source stated the tax basis (BAT, VAT 23%).
  'timber-linear-prices-2026-09-18.json',
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
