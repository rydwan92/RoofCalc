import { createHash, randomUUID } from 'node:crypto';
import {
  canonicalJson,
  comparePriceListEntry,
  priceImportBatchV1Schema,
  type PriceImportBatchV1,
  type PriceList,
  type PriceListEntry,
} from '@cieslacalc/pricing-core';
import type { PricingImportRepository, PricingImportState } from './repository';
import { preserveSeedRows } from '../data/ensure-seed';

export interface PricingImportCounts {
  total: number;
  new: number;
  unchanged: number;
  updated: number;
  conflicts: number;
}

export interface PricingImportConflict {
  entity: 'price-list' | 'entry';
  id: string;
  code: 'immutable-currency' | 'immutable-price-entry';
}

export interface PricingImportReport {
  batchId: string;
  checksum: string;
  dryRun: boolean;
  status: 'valid' | 'applied' | 'conflict';
  priceLists: PricingImportCounts;
  entries: PricingImportCounts;
  conflicts: PricingImportConflict[];
}

const emptyCounts = (total: number): PricingImportCounts => ({
  total,
  new: 0,
  unchanged: 0,
  updated: 0,
  conflicts: 0,
});

function equal(left: unknown, right: unknown) {
  return canonicalJson(left) === canonicalJson(right);
}

function createPlan(batch: PriceImportBatchV1, existing: PricingImportState) {
  const conflicts: PricingImportConflict[] = [];
  const priceListCounts = emptyCounts(batch.priceLists.length);
  const entryCounts = emptyCounts(batch.entries.length);

  const existingLists = new Map(
    existing.priceLists.map((item) => [item.id, item]),
  );
  const priceListWrites: PriceList[] = [];
  for (const list of batch.priceLists) {
    const old = existingLists.get(list.id);
    if (!old) {
      priceListCounts.new++;
      priceListWrites.push(list);
    } else if (equal(old, list)) priceListCounts.unchanged++;
    else if (old.currencyCode !== list.currencyCode) {
      priceListCounts.conflicts++;
      conflicts.push({
        entity: 'price-list',
        id: list.id,
        code: 'immutable-currency',
      });
    } else {
      priceListCounts.updated++;
      priceListWrites.push(list);
    }
  }

  const existingEntries = new Map(
    existing.entries.map((item) => [item.id, item]),
  );
  const entryWrites: PriceListEntry[] = [];
  for (const entry of batch.entries) {
    const result = comparePriceListEntry(existingEntries.get(entry.id), entry);
    if (result === 'new') {
      entryCounts.new++;
      entryWrites.push(entry);
    } else if (result === 'unchanged') entryCounts.unchanged++;
    else {
      entryCounts.conflicts++;
      conflicts.push({
        entity: 'entry',
        id: entry.id,
        code: 'immutable-price-entry',
      });
    }
  }

  return {
    conflicts,
    counts: { priceLists: priceListCounts, entries: entryCounts },
    writes: { priceLists: priceListWrites, entries: entryWrites },
  };
}

/**
 * Mirrors `CatalogImporter`'s shape (dry-run by default, full validation
 * before any write, deterministic checksum, never a silent overwrite).
 * A price *list*'s metadata (owner label, dates) may be corrected in place;
 * its currency may not change under an existing ID. A price *entry* is
 * write-once — a real price change is always a new entry ID.
 */
export class PricingImporter {
  constructor(private readonly repository: PricingImportRepository) {}

  async import(
    input: unknown,
    options: { apply?: boolean; protectedIds?: ReadonlySet<string> } = {},
  ): Promise<PricingImportReport> {
    const batch = priceImportBatchV1Schema.parse(input);
    const checksum = createHash('sha256')
      .update(canonicalJson(batch))
      .digest('hex');
    const batchId = randomUUID();
    const state = await this.repository.readImportState({
      priceListIds: batch.priceLists.map((item) => item.id),
      entryIds: batch.entries.map((item) => item.id),
    });
    const plan = createPlan({ ...batch,
      priceLists: preserveSeedRows(batch.priceLists, state.priceLists, options.protectedIds),
      entries: preserveSeedRows(batch.entries, state.entries, options.protectedIds),
    }, state);
    const base = {
      batchId,
      checksum,
      dryRun: !options.apply,
      ...plan.counts,
      conflicts: plan.conflicts,
    };
    if (plan.conflicts.length) return { ...base, status: 'conflict' as const };
    if (!options.apply) return { ...base, status: 'valid' as const };
    const startedAt = new Date().toISOString();
    await this.repository.applyImport({
      ...plan.writes,
      audit: {
        id: batchId,
        sourceId: batch.source.id,
        sourceLabel: batch.source.label,
        checksum,
        startedAt,
        completedAt: new Date().toISOString(),
        status: 'completed',
        counts: plan.counts,
      },
    });
    return { ...base, dryRun: false, status: 'applied' };
  }
}
