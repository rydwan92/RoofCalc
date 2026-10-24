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

/**
 * VNext-10B: the total of several estimates (one per roof structure of a
 * project). Integer minor units, summed only within one currency; VAT and
 * gross only when every summed part carries VAT. A part without an
 * estimate is never counted as zero — it is named instead.
 */
export interface CostScenarioPartsSummary {
  /** The currency of every summed part (the first part with lines). */
  currencyCode?: string;
  netMinor: number;
  taxMinor?: number;
  grossMinor?: number;
  /** Parts in the total, with their own summaries. */
  summed: { key: string; summary: CostScenarioSummary }[];
  /** Parts without an estimate or without lines: not in the total. */
  missingKeys: string[];
  /** Parts in another currency: not in the total. */
  otherCurrencyKeys: string[];
  /** Every part summed, one currency, every summed estimate complete. */
  complete: boolean;
}

export function summarizeCostScenarioParts(
  parts: readonly { key: string; scenario?: CostScenario }[],
): CostScenarioPartsSummary {
  const missingKeys: string[] = [];
  const otherCurrencyKeys: string[] = [];
  const summed: CostScenarioPartsSummary['summed'] = [];
  let currencyCode: string | undefined;
  for (const { key, scenario } of parts) {
    if (!scenario || scenario.lines.length === 0) {
      missingKeys.push(key);
      continue;
    }
    currencyCode ??= scenario.currencyCode;
    if (scenario.currencyCode !== currencyCode) {
      otherCurrencyKeys.push(key);
      continue;
    }
    summed.push({ key, summary: summarizeCostScenario(scenario) });
  }
  const netMinor = summed.reduce((sum, part) => sum + part.summary.netMinor, 0);
  const taxed =
    summed.length > 0 &&
    summed.every((part) => part.summary.taxMinor !== undefined);
  const taxMinor = taxed
    ? summed.reduce((sum, part) => sum + part.summary.taxMinor!, 0)
    : undefined;
  return {
    ...(currencyCode ? { currencyCode } : {}),
    netMinor,
    ...(taxMinor !== undefined
      ? { taxMinor, grossMinor: netMinor + taxMinor }
      : {}),
    summed,
    missingKeys,
    otherCurrencyKeys,
    complete:
      summed.length > 0 &&
      missingKeys.length === 0 &&
      otherCurrencyKeys.length === 0 &&
      summed.every((part) => part.summary.complete),
  };
}
