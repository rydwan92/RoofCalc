/**
 * Pure cost-estimate contracts. No React, DOM, HTTP, database, catalogue fetch,
 * translation or roof-geometry concept may enter this package (ADR-005): it
 * knows money, quantity and provenance, never a product, a plane or a cut.
 */

/** Integer minor-unit money. `minorUnits` is always a whole number (e.g. grosze). */
export interface Money {
  readonly currencyCode: string;
  readonly minorUnits: number;
}

export type QuantityUnit = 'piece' | 'm' | 'm2' | 'm3' | 'kg' | 'hour' | 'flat';

export interface Quantity {
  readonly value: number;
  readonly unit: QuantityUnit;
}

/**
 * What a line's quantity actually means. Never blend these: a purchase
 * quantity and a geometric fact answer different questions even when the
 * number is the same.
 */
export type CostQuantityBasis =
  | 'procurement-stock'
  | 'fabrication-requirement'
  | 'geometric-length'
  | 'net-area'
  | 'effective-coverage'
  | 'manual';

/**
 * How safe it is to let RoofCalc price this quantity automatically. Never a
 * numeric confidence score — a named, explainable status only.
 */
export type CostSuitability =
  | 'exact-purchase'
  | 'execution-based'
  | 'geometric-estimate'
  | 'manual-required'
  | 'unavailable';

export type CostLineCategory =
  'material' | 'labour' | 'transport' | 'equipment' | 'other';

/** Where a line's price came from, ready for a future price-list source. */
export type CostLineSource = 'project-derived' | 'manual' | 'price-list';

export const COST_LINE_CATEGORIES: readonly CostLineCategory[] = [
  'material',
  'labour',
  'transport',
  'equipment',
  'other',
];

export interface CostLine {
  id: string;
  category: CostLineCategory;
  label: string;
  quantity: Quantity;
  quantityBasis: CostQuantityBasis;
  suitability: CostSuitability;
  currencyCode: string;
  /** Undefined means the line is not yet priced. */
  unitPriceMinor?: number;
  source: CostLineSource;
  /** Whether this line counts toward totals; a skipped suggestion stays out. */
  included: boolean;
  /** Stable machine warning keys (e.g. `net-area-no-overlap`); web layer translates. */
  noteKeys: readonly string[];
  /**
   * The project-derived quantity value last accepted into this line. Only
   * meaningful while `source === 'project-derived'`; used to detect a live
   * project change without silently overwriting the line (§26).
   */
  projectQuantityValue?: number;
}

export interface ComputedCostLine {
  line: CostLine;
  priced: boolean;
  hasQuantity: boolean;
  netMinor?: number;
  taxRateBps?: number;
  taxMinor?: number;
  grossMinor?: number;
}

export interface CostCategoryTotal {
  category: CostLineCategory;
  netMinor: number;
  lineCount: number;
}

export interface CostScenarioSummary {
  currencyCode: string;
  taxRateBps?: number;
  totalLineCount: number;
  includedLineCount: number;
  pricedLineCount: number;
  needsPriceCount: number;
  needsQuantityCount: number;
  categoryTotals: CostCategoryTotal[];
  netMinor: number;
  taxMinor?: number;
  grossMinor?: number;
  /** True only when every included line has a valid quantity and price. */
  complete: boolean;
}

export interface CostScenario {
  schemaVersion: 1;
  currencyCode: string;
  /** Scenario-level VAT. Undefined means "not configured" — net-only display. */
  taxRateBps?: number;
  lines: CostLine[];
  metadata: { updatedAt: string };
}

export type CostValidationIssueCode =
  | 'invalid-currency-code'
  | 'invalid-minor-units'
  | 'invalid-quantity-value'
  | 'invalid-unit-price'
  | 'invalid-tax-rate'
  | 'invalid-label'
  | 'invalid-id'
  | 'currency-mismatch';

export interface CostValidationIssue {
  path: string;
  code: CostValidationIssueCode;
}
