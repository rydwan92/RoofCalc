/**
 * @cieslacalc/catalog-data — the technical catalogue starter data, one
 * source for two consumers:
 *
 * - the API seed (`pnpm db:seed`), which imports these batches into SQL;
 * - the web app's bundled offline catalogue (ADR-013), loaded only when the
 *   user deliberately chooses it while the catalogue API is unavailable.
 *
 * Technical data only (manufacturers, product families, immutable technical
 * revisions, commercial sale variants). Price lists stay in the API's own
 * data directory: commerce never ships inside the client bundle.
 *
 * Data, not code: no imports, no platform APIs.
 */

/** Ordered import manifest; a later batch may add revisions to earlier products. */
export const CATALOGUE_SEED_BATCHES = [
  'tiles-2026-09.json',
  'tiles-2026-09-v35.json',
  'membranes-2026-09.json',
  'timber-stock-2026-09.json',
  'metal-sheets-2026-09.json',
  'metal-roofing-additions-2026-09-v42.json',
  'timber-linear-stock-2026-09.json',
  'tiles-commercial-2026-09-v50.json',
  'drainage-galeco-stal2-2026-09-v51.json',
  'roof-system-2026-09-v52.json',
  'drainage-galeco-stal2-colours-2026-10-vnext4.json',
  'tiles-membranes-koramic-dorken-2026-10-vnext14.json',
] as const;

export type CatalogueSeedBatch = (typeof CATALOGUE_SEED_BATCHES)[number];

/** Month of the newest batch, shown as the data date of the offline catalogue. */
export const CATALOGUE_DATA_AS_OF = '2026-10';
