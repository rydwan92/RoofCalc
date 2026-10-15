import type { PriceListEntry } from './model';

/**
 * How current a price is (VNext). A price list's validity window says when a
 * price *may* be used; it does not say the price is still what a supplier
 * charges today. An open-ended entry (`validTo` absent) observed months ago
 * must not be shown as if it were today's price.
 *
 * - `current` — inside an explicit, closed validity window, or observed
 *   recently enough under the policy;
 * - `aging`   — open-ended and older than `agingAfterDays`: usable, but the
 *   user is told its date;
 * - `stale`   — open-ended and older than `staleAfterDays`: may be outdated,
 *   the user should confirm it with the supplier.
 *
 * Pure and deterministic: the reference date is an explicit argument.
 */
export type PriceFreshness = 'current' | 'aging' | 'stale';

export interface PriceFreshnessPolicy {
  agingAfterDays: number;
  staleAfterDays: number;
}

export const DEFAULT_PRICE_FRESHNESS_POLICY: PriceFreshnessPolicy = {
  agingAfterDays: 45,
  staleAfterDays: 120,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole calendar days between two `YYYY-MM-DD` dates (never negative). */
export function calendarDaysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / DAY_MS));
}

export interface PriceFreshnessResult {
  freshness: PriceFreshness;
  /** Days since the entry's `validFrom` (its publication/observation date). */
  ageDays: number;
  /** True when a closed validity window, not the age, decided `current`. */
  withinStatedValidity: boolean;
}

export function classifyPriceFreshness(
  entry: Pick<PriceListEntry, 'validFrom' | 'validTo'>,
  atDate: string,
  policy: PriceFreshnessPolicy = DEFAULT_PRICE_FRESHNESS_POLICY,
): PriceFreshnessResult {
  const ageDays = calendarDaysBetween(entry.validFrom, atDate);
  if (entry.validTo !== undefined && entry.validTo >= atDate)
    return { freshness: 'current', ageDays, withinStatedValidity: true };
  const freshness: PriceFreshness =
    ageDays > policy.staleAfterDays
      ? 'stale'
      : ageDays > policy.agingAfterDays
        ? 'aging'
        : 'current';
  return { freshness, ageDays, withinStatedValidity: false };
}
