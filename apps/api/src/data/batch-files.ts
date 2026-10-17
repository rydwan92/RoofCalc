import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOGUE_SEED_BATCHES } from '@cieslacalc/catalog-data';

/**
 * Where a seed batch file lives. Technical catalogue batches belong to the
 * shared `@cieslacalc/catalog-data` package (also the source of the web
 * app's offline catalogue, ADR-013); price lists stay in this API's own
 * data directory, so commerce never ships in the client bundle.
 */
const require = createRequire(import.meta.url);
const CATALOGUE_DIRECTORY = resolve(
  dirname(require.resolve('@cieslacalc/catalog-data/package.json')),
  'batches',
);
const PRICING_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'import-batches',
);

export function seedBatchPath(file: string): string {
  return (CATALOGUE_SEED_BATCHES as readonly string[]).includes(file)
    ? resolve(CATALOGUE_DIRECTORY, file)
    : resolve(PRICING_DIRECTORY, file);
}
