import type { PriceList, PriceListEntry } from '@cieslacalc/pricing-core';

export interface PricingRepository {
  /** All entries for the given variant IDs, across every price list. */
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
