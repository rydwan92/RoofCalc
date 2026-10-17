/**
 * The one ordered starter-data manifest. Import, status and bootstrap
 * validation consume these lists; filenames must never be duplicated in CLIs.
 */
/** Technical catalogue batches: owned by `@cieslacalc/catalog-data`. */
export { CATALOGUE_SEED_BATCHES } from '@cieslacalc/catalog-data';

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
