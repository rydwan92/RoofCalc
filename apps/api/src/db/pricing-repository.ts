import { inArray } from 'drizzle-orm';
import {
  priceListEntrySchema,
  priceListSchema,
  type PriceList,
  type PriceListEntry,
} from '@cieslacalc/pricing-core';
import type {
  PricingImportRepository,
  PricingRepository,
} from '../pricing/repository';
import type { CatalogDatabase } from './client';
import {
  priceListEntries,
  priceLists,
  pricingImportBatches,
} from './pricing-schema';

function listFromRow(row: typeof priceLists.$inferSelect): PriceList {
  return priceListSchema.parse({
    id: row.id,
    ownerLabel: row.ownerLabel,
    currencyCode: row.currencyCode,
    regionCode: row.regionCode ?? undefined,
    taxContext: row.taxContext ?? undefined,
    validFrom: row.validFrom,
    validTo: row.validTo ?? undefined,
  });
}

function entryFromRow(
  row: typeof priceListEntries.$inferSelect,
): PriceListEntry {
  return priceListEntrySchema.parse({
    id: row.id,
    priceListId: row.priceListId,
    commercialVariantId: row.commercialVariantId,
    saleUnit: row.saleUnit,
    netAmountMinor: row.netAmountMinor,
    sourceAmountBasis:
      (row.sourceAmountBasis as 'net' | 'gross' | null) ?? undefined,
    sourceVatRateBps: row.sourceVatRateBps ?? undefined,
    validFrom: row.validFrom,
    validTo: row.validTo ?? undefined,
  });
}

export class DrizzlePricingRepository
  implements PricingRepository, PricingImportRepository
{
  constructor(private readonly db: CatalogDatabase) {}

  async entriesForVariants(variantIds: string[]): Promise<PriceListEntry[]> {
    if (!variantIds.length) return [];
    const rows = await this.db
      .select()
      .from(priceListEntries)
      .where(inArray(priceListEntries.commercialVariantId, variantIds));
    return rows.map(entryFromRow);
  }

  async priceListsForIds(priceListIds: string[]): Promise<PriceList[]> {
    if (!priceListIds.length) return [];
    const rows = await this.db
      .select()
      .from(priceLists)
      .where(inArray(priceLists.id, priceListIds));
    return rows.map(listFromRow);
  }

  async readImportState(ids: { priceListIds: string[]; entryIds: string[] }) {
    const listRows = ids.priceListIds.length
      ? await this.db
          .select()
          .from(priceLists)
          .where(inArray(priceLists.id, ids.priceListIds))
      : [];
    const entryRows = ids.entryIds.length
      ? await this.db
          .select()
          .from(priceListEntries)
          .where(inArray(priceListEntries.id, ids.entryIds))
      : [];
    return {
      priceLists: listRows.map(listFromRow),
      entries: entryRows.map(entryFromRow),
    };
  }

  async applyImport(input: {
    priceLists: PriceList[];
    entries: PriceListEntry[];
    audit: Parameters<PricingImportRepository['applyImport']>[0]['audit'];
  }) {
    await this.db.transaction(async (tx) => {
      for (const item of input.priceLists)
        await tx
          .insert(priceLists)
          .values(item)
          .onDuplicateKeyUpdate({
            set: {
              ownerLabel: item.ownerLabel,
              currencyCode: item.currencyCode,
              regionCode: item.regionCode,
              taxContext: item.taxContext,
              validFrom: item.validFrom,
              validTo: item.validTo,
            },
          });
      if (input.entries.length)
        await tx.insert(priceListEntries).values(input.entries);
      await tx.insert(pricingImportBatches).values({
        id: input.audit.id,
        sourceId: input.audit.sourceId,
        sourceLabel: input.audit.sourceLabel,
        checksum: input.audit.checksum,
        status: input.audit.status,
        counts: input.audit.counts,
        startedAt: input.audit.startedAt,
        completedAt: input.audit.completedAt,
        schemaVersion: 1,
      });
    });
  }
}
