/**
 * The one ordered starter-data manifest. Import, status and bootstrap
 * validation consume these lists; filenames must never be duplicated in CLIs.
 */
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
] as const;

export const PRICING_SEED_BATCHES = [
  'prices-2026-09.json',
  'timber-prices-2026-09.json',
  'metal-prices-ruukki-2026-04-28.json',
  'timber-linear-prices-2026-09-18.json',
] as const;

export const BUSINESS_SEED = {
  file: 'demo-wholesaler.v1.json',
  organizationId: 'org:demo-hurtownia',
} as const;
