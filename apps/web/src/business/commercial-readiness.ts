import type { CostScenarioSummary } from '@cieslacalc/cost-core';
import type { OrganizationPriceMissingReason } from '@cieslacalc/business-core';
import type { MaterialPlanRow } from '../assembly/material-plan';

export type CommercialPrimaryAction =
  | 'choose-covering'
  | 'complete-technical'
  | 'match-assortment'
  | 'fill-prices'
  | 'prepare-quote'
  | 'refresh-quote'
  | 'preview-quote';

export interface CommercialReadiness {
  technicalIssues: number;
  assortmentIssues: number;
  priceIssues: number;
  identityIssues: number;
  readyItems: number;
  quoteIssues: number;
  primaryAction: CommercialPrimaryAction;
}

export function deriveCommercialReadiness(input: {
  rows: readonly MaterialPlanRow[];
  priceStateByVariant: ReadonlyMap<
    string,
    { price?: unknown; missing?: OrganizationPriceMissingReason }
  >;
  hasCovering: boolean;
  cost?: CostScenarioSummary;
  quoteExists: boolean;
  quoteStale: boolean;
}): CommercialReadiness {
  const technicalIssues = input.rows.filter(
    (row) => row.partial || row.suitability === 'manual-required',
  ).length;
  let assortmentIssues = 0;
  let priceIssues = 0;
  let identityIssues = 0;
  let readyItems = 0;
  for (const row of input.rows) {
    if (row.partial || row.suitability === 'manual-required') continue;
    const variantId = row.product?.variantId;
    if (!variantId) {
      identityIssues++;
      continue;
    }
    const state = input.priceStateByVariant.get(variantId);
    if (
      !state ||
      state.missing === 'not-in-assortment' ||
      state.missing === 'assortment-inactive' ||
      state.missing === 'assortment-unmatched'
    ) {
      assortmentIssues++;
      continue;
    }
    if (!state.price) {
      priceIssues++;
      continue;
    }
    readyItems++;
  }
  const quoteIssues =
    (input.cost?.needsPriceCount ?? 0) +
    (input.cost?.needsQuantityCount ?? 0) +
    (input.cost && input.cost.taxRateBps === undefined ? 1 : 0);
  const primaryAction: CommercialPrimaryAction = !input.hasCovering
    ? 'choose-covering'
    : technicalIssues > 0
      ? 'complete-technical'
      : assortmentIssues + identityIssues > 0
        ? 'match-assortment'
        : priceIssues + (input.cost?.needsPriceCount ?? 0) > 0
          ? 'fill-prices'
          : !input.quoteExists
            ? 'prepare-quote'
            : input.quoteStale
              ? 'refresh-quote'
              : 'preview-quote';
  return {
    technicalIssues,
    assortmentIssues,
    priceIssues,
    identityIssues,
    readyItems,
    quoteIssues,
    primaryAction,
  };
}
