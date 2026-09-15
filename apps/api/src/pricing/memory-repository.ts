import {
  priceListEntrySchema,
  priceListSchema,
  type PriceList,
  type PriceListEntry,
} from '@cieslacalc/pricing-core';
import type { PricingImportRepository, PricingRepository } from './repository';

/** Test double mirroring `apps/api/src/catalog/memory-repository.ts`. */
export class MemoryPricingRepository
  implements PricingRepository, PricingImportRepository
{
  private priceLists = new Map<string, PriceList>();
  private entries = new Map<string, PriceListEntry>();
  readonly audits: unknown[] = [];

  constructor(seed?: { priceLists?: PriceList[]; entries?: PriceListEntry[] }) {
    for (const item of seed?.priceLists ?? [])
      this.priceLists.set(item.id, priceListSchema.parse(item));
    for (const item of seed?.entries ?? [])
      this.entries.set(item.id, priceListEntrySchema.parse(item));
  }

  async entriesForVariants(variantIds: string[]): Promise<PriceListEntry[]> {
    const wanted = new Set(variantIds);
    return [...this.entries.values()].filter((entry) =>
      wanted.has(entry.commercialVariantId),
    );
  }

  async priceListsForIds(priceListIds: string[]): Promise<PriceList[]> {
    const wanted = new Set(priceListIds);
    return [...this.priceLists.values()].filter((list) => wanted.has(list.id));
  }

  async readImportState(ids: { priceListIds: string[]; entryIds: string[] }) {
    return {
      priceLists: ids.priceListIds.flatMap((id) => {
        const item = this.priceLists.get(id);
        return item ? [item] : [];
      }),
      entries: ids.entryIds.flatMap((id) => {
        const item = this.entries.get(id);
        return item ? [item] : [];
      }),
    };
  }

  async applyImport(input: {
    priceLists: PriceList[];
    entries: PriceListEntry[];
    audit: unknown;
  }) {
    for (const item of input.priceLists) this.priceLists.set(item.id, item);
    for (const item of input.entries) this.entries.set(item.id, item);
    this.audits.push(input.audit);
  }
}
