import type { StockOption } from '@cieslacalc/procurement-core';
import type { TimberStockTechnicalSpec } from '@cieslacalc/catalog-core';
import { timberSectionStockClassId } from './timber-stock-class';

/**
 * One catalogue-picked timber-stock item, ready to become a `StockOption`.
 * `id` identifies the specific commercial item (its variant ID when picked,
 * falling back to the revision ID) — never the section alone, so two
 * differently-priced/sourced items of the same section stay distinguishable
 * in a resolved cutting plan's `StockUsage`/`StockRequirement` rows.
 */
export interface TimberCatalogPick {
  id: string;
  spec: TimberStockTechnicalSpec;
  availability?: number;
}

/**
 * Maps a catalogue timber-stock pick into `procurement-core`'s pure
 * `StockOption` contract, unchanged (`packages/procurement-core` stays
 * untouched — this is the only place that bridges catalogue data into it).
 * `stockClassId` is section-only, matching `k1-cutting-adapter.ts`'s own
 * required-piece fingerprint exactly (see `timber-stock-class.ts` for why).
 */
export function timberCatalogItemToStockOption(
  pick: TimberCatalogPick,
): StockOption {
  return {
    id: pick.id,
    stockClassId: timberSectionStockClassId(
      pick.spec.widthMm,
      pick.spec.depthMm,
    ),
    lengthMm: pick.spec.lengthMm,
    ...(pick.availability === undefined
      ? {}
      : { availability: pick.availability }),
  };
}
