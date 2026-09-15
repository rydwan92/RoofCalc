import type {
  ComputedCostLine,
  CostLine,
  CostLineCategory,
  CostLineSource,
  CostQuantityBasis,
  CostSuitability,
  Quantity,
  QuantityUnit,
} from './model';
import { COST_LINE_CATEGORIES } from './model';
import {
  CostValidationError,
  costIssue,
  isValidQuantityValue,
  isValidTaxRateBps,
  isValidUnitPriceMinor,
  isValidCurrencyCode,
} from './validation';

const QUANTITY_DIVERGENCE_EPSILON = 1e-6;

export interface CostLineInput {
  id: string;
  category: CostLineCategory;
  label: string;
  quantity: { value: number; unit: QuantityUnit };
  quantityBasis: CostQuantityBasis;
  suitability: CostSuitability;
  currencyCode: string;
  unitPriceMinor?: number;
  source: CostLineSource;
  included?: boolean;
  noteKeys?: readonly string[];
  projectQuantityValue?: number;
}

function validateLineInput(input: CostLineInput) {
  const issues = [];
  if (!input.id.trim()) issues.push(costIssue('id', 'invalid-id'));
  if (!input.label.trim()) issues.push(costIssue('label', 'invalid-label'));
  if (!isValidCurrencyCode(input.currencyCode))
    issues.push(costIssue('currencyCode', 'invalid-currency-code'));
  if (!isValidQuantityValue(input.quantity.value))
    issues.push(costIssue('quantity.value', 'invalid-quantity-value'));
  if (
    input.unitPriceMinor !== undefined &&
    !isValidUnitPriceMinor(input.unitPriceMinor)
  )
    issues.push(costIssue('unitPriceMinor', 'invalid-unit-price'));
  if (issues.length) throw new CostValidationError(issues);
}

/** Creates a stored cost line from user/adapter input. Always priced-or-not honestly. */
export function createCostLine(input: CostLineInput): CostLine {
  validateLineInput(input);
  return {
    id: input.id,
    category: input.category,
    label: input.label,
    quantity: { value: input.quantity.value, unit: input.quantity.unit },
    quantityBasis: input.quantityBasis,
    suitability: input.suitability,
    currencyCode: input.currencyCode,
    unitPriceMinor: input.unitPriceMinor,
    source: input.source,
    included: input.included ?? true,
    noteKeys: input.noteKeys ?? [],
    projectQuantityValue: input.projectQuantityValue,
  };
}

/**
 * Line-level rounding rule: multiply first, round once.
 * `netMinor = round(quantity.value * unitPriceMinor)`. Tax, when the scenario
 * configures a rate, rounds independently from the already-rounded net value.
 */
export function calculateLine(
  line: CostLine,
  scenarioTaxRateBps?: number,
): ComputedCostLine {
  const priced = isValidUnitPriceMinor(line.unitPriceMinor);
  const hasQuantity = line.quantity.value > 0;
  if (!priced)
    return { line, priced: false, hasQuantity, taxRateBps: scenarioTaxRateBps };
  const netMinor = Math.round(line.quantity.value * line.unitPriceMinor!);
  if (
    scenarioTaxRateBps === undefined ||
    !isValidTaxRateBps(scenarioTaxRateBps)
  )
    return { line, priced: true, hasQuantity, netMinor };
  const taxMinor = Math.round((netMinor * scenarioTaxRateBps) / 10000);
  return {
    line,
    priced: true,
    hasQuantity,
    netMinor,
    taxRateBps: scenarioTaxRateBps,
    taxMinor,
    grossMinor: netMinor + taxMinor,
  };
}

const CATEGORY_ORDER = new Map(
  COST_LINE_CATEGORIES.map((category, index) => [category, index]),
);

/** Stable order: category first (material → labour → transport → equipment → other), then id. */
export function sortCostLines(lines: readonly CostLine[]): CostLine[] {
  return [...lines].sort(
    (a, b) =>
      (CATEGORY_ORDER.get(a.category) ?? 99) -
        (CATEGORY_ORDER.get(b.category) ?? 99) || a.id.localeCompare(b.id),
  );
}

export function withIncluded(line: CostLine, included: boolean): CostLine {
  return { ...line, included };
}

export function withUnitPrice(
  line: CostLine,
  unitPriceMinor: number,
): CostLine {
  if (!isValidUnitPriceMinor(unitPriceMinor))
    throw new CostValidationError([
      costIssue('unitPriceMinor', 'invalid-unit-price'),
    ]);
  return { ...line, unitPriceMinor };
}

/** A direct manual quantity edit always drops project ownership (§25). */
export function withManualQuantity(line: CostLine, value: number): CostLine {
  if (!isValidQuantityValue(value))
    throw new CostValidationError([
      costIssue('quantity.value', 'invalid-quantity-value'),
    ]);
  return {
    ...line,
    quantity: { ...line.quantity, value },
    source: 'manual',
    projectQuantityValue: undefined,
  };
}

/** True only when a project-derived line's live project value has moved. */
export function projectQuantityDiverged(
  line: CostLine,
  currentProjectValue: number | undefined,
): boolean {
  return (
    line.source === 'project-derived' &&
    line.projectQuantityValue !== undefined &&
    currentProjectValue !== undefined &&
    Math.abs(currentProjectValue - line.projectQuantityValue) >
      QUANTITY_DIVERGENCE_EPSILON
  );
}

/** "Aktualizuj": accept the new project value, staying project-derived. */
export function acceptProjectQuantity(
  line: CostLine,
  currentProjectValue: number,
): CostLine {
  if (!isValidQuantityValue(currentProjectValue))
    throw new CostValidationError([
      costIssue('quantity.value', 'invalid-quantity-value'),
    ]);
  return {
    ...line,
    quantity: { ...line.quantity, value: currentProjectValue },
    projectQuantityValue: currentProjectValue,
  };
}

/** "Zachowaj ręczną": keep the current value, dropping project ownership. */
export function keepManualQuantity(line: CostLine): CostLine {
  return { ...line, source: 'manual', projectQuantityValue: undefined };
}

/** "Przywróć z projektu": resume tracking the live project value. */
export function restoreFromProject(
  line: CostLine,
  currentProjectValue: number,
): CostLine {
  if (!isValidQuantityValue(currentProjectValue))
    throw new CostValidationError([
      costIssue('quantity.value', 'invalid-quantity-value'),
    ]);
  return {
    ...line,
    quantity: { ...line.quantity, value: currentProjectValue },
    source: 'project-derived',
    projectQuantityValue: currentProjectValue,
  };
}

export type { Quantity };
