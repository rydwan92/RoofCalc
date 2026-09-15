/**
 * Pure commercial price-list contracts (V34C). This is the `PriceList` /
 * `PriceListEntry` boundary `docs/ARCHITECTURE_COVERING_CATALOG_AND_
 * PRICING_BOUNDARY.md` reserved since V21/V24: a supplier's price list and
 * its per-variant entries, kept structurally separate from `catalog-core`'s
 * technical contracts (ADR-005) and referencing a `CommercialVariant` only
 * by its opaque ID — this package never imports `catalog-core`.
 *
 * Deliberately generic: nothing here names a roof, a tile or a covering.
 * `commercialVariantId` is any opaque catalogue-item reference, so this
 * module can price any future product family without change.
 */

export type PriceQuantityUnit =
  'piece' | 'm' | 'm2' | 'm3' | 'kg' | 'hour' | 'flat';

/** A supplier/owner's price list: one currency, one validity window. */
export interface PriceList {
  id: string;
  ownerLabel: string;
  currencyCode: string;
  regionCode?: string;
  /** Free-text label only (e.g. "net, 23% VAT excluded") — never tax logic. */
  taxContext?: string;
  validFrom: string;
  validTo?: string;
}

/**
 * One priced variant at one point in time. Write-once, like a technical
 * revision (ADR-004's pattern): a changed amount under an existing ID is a
 * conflict, never a silent overwrite — a new price is a new entry with a
 * later `validFrom`, so price history stays auditable.
 */
export interface PriceListEntry {
  id: string;
  priceListId: string;
  /** Opaque `CommercialVariant.id` reference — never a catalog-core import. */
  commercialVariantId: string;
  saleUnit: PriceQuantityUnit;
  /** Integer minor units, same convention as `cost-core`'s `unitPriceMinor`. */
  netAmountMinor: number;
  validFrom: string;
  validTo?: string;
}

export type PricingValidationIssueCode =
  | 'invalid-id'
  | 'invalid-currency-code'
  | 'invalid-minor-units'
  | 'invalid-date'
  | 'invalid-date-range'
  | 'invalid-owner-label'
  | 'duplicate-id'
  | 'missing-price-list';

export interface PricingValidationIssue {
  path: string;
  code: PricingValidationIssueCode;
}
