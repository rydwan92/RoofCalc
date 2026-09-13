import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { catalogImportBatchV1Schema } from '@cieslacalc/catalog-core';
import { CatalogImporter } from '../catalog/importer';
import { createCatalogDatabase } from '../db/client';
import { DrizzleCatalogRepository } from '../db/catalog-repository';

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((argument) => !argument.startsWith('--'));
  const apply = args.includes('--apply');
  if (!file || args.includes('--help')) {
    console.error(
      'Usage: pnpm --filter @cieslacalc/api catalog:import <catalog.json> [--dry-run|--apply]\nDefault mode is --dry-run.',
    );
    process.exitCode = file ? 0 : 2;
    return;
  }
  if (apply && args.includes('--dry-run'))
    throw new Error('Choose either --dry-run or --apply.');
  const contents = await readFile(resolve(file), 'utf8');
  const batch = catalogImportBatchV1Schema.parse(JSON.parse(contents));
  const connection = createCatalogDatabase();
  if (!connection)
    throw new Error('DATABASE_URL is required for catalogue import.');
  try {
    const report = await new CatalogImporter(
      new DrizzleCatalogRepository(connection.db),
    ).import(batch, { apply });
    console.log(JSON.stringify(report, null, 2));
    if (report.status === 'conflict') process.exitCode = 3;
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      error: {
        code: 'catalog-import-failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    }),
  );
  process.exitCode = 1;
});
