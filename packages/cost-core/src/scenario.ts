import type {
  CostCategoryTotal,
  CostLine,
  CostLineCategory,
  CostScenario,
  CostScenarioSummary,
} from './model';
import { COST_LINE_CATEGORIES } from './model';
import { calculateLine, sortCostLines } from './line';
import {
  CostValidationError,
  costIssue,
  isValidCurrencyCode,
  isValidTaxRateBps,
} from './validation';

export function createEmptyCostScenario(
  currencyCode = 'PLN',
  now = new Date().toISOString(),
): CostScenario {
  if (!isValidCurrencyCode(currencyCode))
    throw new CostValidationError([
      costIssue('currencyCode', 'invalid-currency-code'),
    ]);
  return {
    schemaVersion: 1,
    currencyCode,
    taxRateBps: undefined,
    lines: [],
    metadata: { updatedAt: now },
  };
}

function touched(scenario: CostScenario, now: string): CostScenario {
  return { ...scenario, metadata: { updatedAt: now } };
}

export function addCostLine(
  scenario: CostScenario,
  line: CostLine,
  now = new Date().toISOString(),
): CostScenario {
  if (line.currencyCode !== scenario.currencyCode)
    throw new CostValidationError([
      costIssue('currencyCode', 'currency-mismatch'),
    ]);
  if (scenario.lines.some((existing) => existing.id === line.id))
    throw new CostValidationError([costIssue('id', 'invalid-id')]);
  return touched({ ...scenario, lines: [...scenario.lines, line] }, now);
}

export function removeCostLine(
  scenario: CostScenario,
  lineId: string,
  now = new Date().toISOString(),
): CostScenario {
  return touched(
    { ...scenario, lines: scenario.lines.filter((line) => line.id !== lineId) },
    now,
  );
}

export function replaceCostLine(
  scenario: CostScenario,
  nextLine: CostLine,
  now = new Date().toISOString(),
): CostScenario {
  if (nextLine.currencyCode !== scenario.currencyCode)
    throw new CostValidationError([
      costIssue('currencyCode', 'currency-mismatch'),
    ]);
  return touched(
    {
      ...scenario,
      lines: scenario.lines.map((line) =>
        line.id === nextLine.id ? nextLine : line,
      ),
    },
    now,
  );
}

export function setScenarioTaxRateBps(
  scenario: CostScenario,
  taxRateBps: number | undefined,
  now = new Date().toISOString(),
): CostScenario {
  if (taxRateBps !== undefined && !isValidTaxRateBps(taxRateBps))
    throw new CostValidationError([
      costIssue('taxRateBps', 'invalid-tax-rate'),
    ]);
  return touched({ ...scenario, taxRateBps }, now);
}

/**
 * Deterministic estimate totals. Only `included` lines contribute; an unpriced
 * or quantity-less included line contributes zero to the net total but still
 * blocks `complete`, so a partial estimate is never reported as finished.
 */
export function summarizeCostScenario(
  scenario: CostScenario,
): CostScenarioSummary {
  const included = scenario.lines.filter((line) => line.included);
  const computed = included.map((line) =>
    calculateLine(line, scenario.taxRateBps),
  );
  const categoryTotals: CostCategoryTotal[] = COST_LINE_CATEGORIES.map(
    (category) => {
      const rows = computed.filter((row) => row.line.category === category);
      return {
        category,
        lineCount: rows.length,
        netMinor: rows.reduce((sum, row) => sum + (row.netMinor ?? 0), 0),
      };
    },
  ).filter((total) => total.lineCount > 0);
  const netMinor = computed.reduce((sum, row) => sum + (row.netMinor ?? 0), 0);
  const hasTax =
    scenario.taxRateBps !== undefined && isValidTaxRateBps(scenario.taxRateBps);
  const taxMinor = hasTax
    ? computed.reduce((sum, row) => sum + (row.taxMinor ?? 0), 0)
    : undefined;
  return {
    currencyCode: scenario.currencyCode,
    taxRateBps: scenario.taxRateBps,
    totalLineCount: scenario.lines.length,
    includedLineCount: included.length,
    pricedLineCount: computed.filter((row) => row.priced).length,
    needsPriceCount: computed.filter((row) => !row.priced).length,
    needsQuantityCount: computed.filter((row) => !row.hasQuantity).length,
    categoryTotals,
    netMinor,
    taxMinor,
    grossMinor: hasTax ? netMinor + (taxMinor ?? 0) : undefined,
    complete:
      included.length > 0 &&
      computed.every((row) => row.priced && row.hasQuantity),
  };
}

export function sortedScenarioLines(scenario: CostScenario): CostLine[] {
  return sortCostLines(scenario.lines);
}

export function linesByCategory(
  scenario: CostScenario,
): Map<CostLineCategory, CostLine[]> {
  const map = new Map<CostLineCategory, CostLine[]>();
  for (const line of sortedScenarioLines(scenario))
    map.set(line.category, [...(map.get(line.category) ?? []), line]);
  return map;
}
