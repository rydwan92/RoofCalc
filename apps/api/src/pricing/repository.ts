import type { PriceList, PriceListEntry } from '@cieslacalc/pricing-core';

export interface PricingRepository {
  /**
   * Entries for the given variant IDs, across every **global** price list.
   *
   * V54: since a price list may now belong to an organization (§9), this
   * deliberately excludes organization-scoped lists. `/api/pricing/variants`
   * is the unscoped, catalogue-wide endpoint — it has no tenant to be, so it
   * must never return a wholesaler's commercial data (§10, §58).
   * Organization prices are read through `/api/business/.../prices`.
   */
  entriesForVariants(variantIds: string[]): Promise<PriceListEntry[]>;
  priceListsForIds(priceListIds: string[]): Promise<PriceList[]>;
}

export interface PricingImportState {
  priceLists: PriceList[];
  entries: PriceListEntry[];
}

export interface PricingImportAudit {
  id: string;
  sourceId: string;
  sourceLabel: string;
  checksum: string;
  startedAt: string;
  completedAt: string;
  status: 'completed';
  counts: unknown;
}

export interface PricingImportRepository {
  readImportState(ids: {
    priceListIds: string[];
    entryIds: string[];
  }): Promise<PricingImportState>;
  applyImport(input: {
    priceLists: PriceList[];
    entries: PriceListEntry[];
    audit: PricingImportAudit;
  }): Promise<void>;
}
