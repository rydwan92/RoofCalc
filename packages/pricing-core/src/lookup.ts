import type { PriceListEntry } from './model';

function activeAt(entry: PriceListEntry, atDate: string): boolean {
  return (
    entry.validFrom <= atDate &&
    (entry.validTo === undefined || entry.validTo >= atDate)
  );
}

/** All entries active at the given date (default: today, UTC calendar date). */
export function activePriceListEntries(
  entries: readonly PriceListEntry[],
  atDate: string = new Date().toISOString().slice(0, 10),
): PriceListEntry[] {
  return entries.filter((entry) => activeAt(entry, atDate));
}

/**
 * The active entry for one variant, if any. When several price lists cover
 * the same variant at the same date, the entry with the latest `validFrom`
 * wins (the most recently published price), tie-broken by entry ID for
 * determinism.
 */
export function resolvePriceForVariant(
  entries: readonly PriceListEntry[],
  commercialVariantId: string,
  atDate?: string,
): PriceListEntry | undefined {
  const candidates = activePriceListEntries(entries, atDate).filter(
    (entry) => entry.commercialVariantId === commercialVariantId,
  );
  return candidates.sort(
    (a, b) =>
      b.validFrom.localeCompare(a.validFrom) || a.id.localeCompare(b.id),
  )[0];
}
