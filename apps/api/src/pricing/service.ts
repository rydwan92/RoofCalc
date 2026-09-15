import {
  resolvePriceForVariant,
  type PriceListEntry,
} from '@cieslacalc/pricing-core';
import type { PricingRepository } from './repository';

export class PricingServiceError extends Error {
  constructor(readonly code: 'pricing-invalid-request') {
    super(code);
  }
}

export interface VariantPrice {
  variantId: string;
  entry: PriceListEntry;
  currencyCode: string;
}

/**
 * Read-only price lookup for already-known `commercialVariantId`s. Mirrors
 * `CatalogService`'s shape but is deliberately much smaller: pricing has no
 * search/browse surface yet, only "what does the catalogue say this variant
 * costs today" for a project's already-selected products. The response
 * denormalizes the owning price list's `currencyCode` onto each entry so a
 * caller never has to join the two itself.
 */
export class PricingService {
  constructor(private readonly repository: PricingRepository) {}

  async pricesForVariants(variantIds: string[]): Promise<VariantPrice[]> {
    if (!variantIds.length) return [];
    if (variantIds.some((id) => !id.trim()))
      throw new PricingServiceError('pricing-invalid-request');
    const entries = await this.repository.entriesForVariants(variantIds);
    const priceLists = await this.repository.priceListsForIds([
      ...new Set(entries.map((entry) => entry.priceListId)),
    ]);
    const currencyByListId = new Map(
      priceLists.map((list) => [list.id, list.currencyCode]),
    );
    return variantIds.flatMap((variantId) => {
      const entry = resolvePriceForVariant(entries, variantId);
      const currencyCode = entry
        ? currencyByListId.get(entry.priceListId)
        : undefined;
      return entry && currencyCode ? [{ variantId, entry, currencyCode }] : [];
    });
  }
}
