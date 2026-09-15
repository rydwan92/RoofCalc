import { describe, expect, it } from 'vitest';
import {
  acceptProjectQuantity,
  addCostLine,
  calculateLine,
  createCostLine,
  createEmptyCostScenario,
  createMoney,
  CostValidationError,
  keepManualQuantity,
  projectQuantityDiverged,
  removeCostLine,
  restoreFromProject,
  setScenarioTaxRateBps,
  sortCostLines,
  summarizeCostScenario,
  validateMoney,
  withIncluded,
  withManualQuantity,
  withUnitPrice,
  type CostLine,
} from './index';

function line(overrides: Partial<CostLine> = {}): CostLine {
  return createCostLine({
    id: overrides.id ?? 'line-1',
    category: overrides.category ?? 'material',
    label: overrides.label ?? 'Łaty',
    quantity: overrides.quantity ?? { value: 100, unit: 'm' },
    quantityBasis: overrides.quantityBasis ?? 'geometric-length',
    suitability: overrides.suitability ?? 'geometric-estimate',
    currencyCode: overrides.currencyCode ?? 'PLN',
    unitPriceMinor: overrides.unitPriceMinor,
    source: overrides.source ?? 'project-derived',
    included: overrides.included,
    noteKeys: overrides.noteKeys,
    projectQuantityValue: overrides.projectQuantityValue,
  });
}

describe('money', () => {
  it('accepts valid minor-unit money', () => {
    expect(validateMoney(createMoney('PLN', 12345))).toEqual([]);
  });

  it('rejects a non-integer minor value', () => {
    expect(() => createMoney('PLN', 12.5)).toThrow(CostValidationError);
  });

  it('rejects NaN and Infinity', () => {
    expect(() => createMoney('PLN', NaN)).toThrow(CostValidationError);
    expect(() => createMoney('PLN', Infinity)).toThrow(CostValidationError);
  });

  it('rejects a negative minor value', () => {
    expect(() => createMoney('PLN', -100)).toThrow(CostValidationError);
  });

  it('rejects a malformed currency code', () => {
    expect(() => createMoney('zl', 100)).toThrow(CostValidationError);
  });
});

describe('line calculation', () => {
  it('multiplies quantity by unit price and rounds once', () => {
    const computed = calculateLine(
      line({ quantity: { value: 492.1, unit: 'm' }, unitPriceMinor: 733 }),
    );
    expect(computed.priced).toBe(true);
    expect(computed.netMinor).toBe(Math.round(492.1 * 733));
  });

  it('rounds tax independently from the already-rounded net value', () => {
    const computed = calculateLine(
      line({ quantity: { value: 3, unit: 'piece' }, unitPriceMinor: 333 }),
      2300,
    );
    expect(computed.netMinor).toBe(999);
    expect(computed.taxMinor).toBe(Math.round((999 * 2300) / 10000));
    expect(computed.grossMinor).toBe(computed.netMinor! + computed.taxMinor!);
  });

  it('an unpriced line has no net/tax/gross', () => {
    const computed = calculateLine(line({ unitPriceMinor: undefined }), 2300);
    expect(computed.priced).toBe(false);
    expect(computed.netMinor).toBeUndefined();
    expect(computed.taxMinor).toBeUndefined();
    expect(computed.grossMinor).toBeUndefined();
  });

  it('zero quantity is priced but contributes zero net', () => {
    const computed = calculateLine(
      line({ quantity: { value: 0, unit: 'm2' }, unitPriceMinor: 500 }),
    );
    expect(computed.priced).toBe(true);
    expect(computed.hasQuantity).toBe(false);
    expect(computed.netMinor).toBe(0);
  });

  it('zero unit price is valid and yields zero net', () => {
    const computed = calculateLine(
      line({ quantity: { value: 10, unit: 'm' }, unitPriceMinor: 0 }),
    );
    expect(computed.priced).toBe(true);
    expect(computed.netMinor).toBe(0);
  });

  it('an unset scenario tax rate leaves gross undefined', () => {
    const computed = calculateLine(
      line({ quantity: { value: 1, unit: 'piece' }, unitPriceMinor: 100 }),
      undefined,
    );
    expect(computed.taxMinor).toBeUndefined();
    expect(computed.grossMinor).toBeUndefined();
  });
});

describe('stable ordering', () => {
  it('orders lines by category then id, independent of insertion order', () => {
    const lines = [
      line({ id: 'z-other', category: 'other' }),
      line({ id: 'a-material', category: 'material' }),
      line({ id: 'b-labour', category: 'labour' }),
      line({ id: 'a-labour', category: 'labour' }),
    ];
    expect(sortCostLines(lines).map((l) => l.id)).toEqual([
      'a-material',
      'a-labour',
      'b-labour',
      'z-other',
    ]);
  });

  it('is deterministic regardless of input order', () => {
    const lines = [line({ id: 'x' }), line({ id: 'y' }), line({ id: 'a' })];
    const reversed = [...lines].reverse();
    expect(sortCostLines(lines).map((l) => l.id)).toEqual(
      sortCostLines(reversed).map((l) => l.id),
    );
  });
});

describe('scenario summary', () => {
  it('sums net totals per category and overall, only for included lines', () => {
    let scenario = createEmptyCostScenario('PLN');
    scenario = addCostLine(
      scenario,
      line({
        id: 'm1',
        category: 'material',
        quantity: { value: 10, unit: 'm2' },
        unitPriceMinor: 1000,
      }),
    );
    scenario = addCostLine(
      scenario,
      line({
        id: 'l1',
        category: 'labour',
        quantity: { value: 5, unit: 'hour' },
        unitPriceMinor: 8000,
      }),
    );
    scenario = addCostLine(
      scenario,
      line({
        id: 'skip',
        category: 'other',
        included: false,
        unitPriceMinor: 999999,
      }),
    );
    const summary = summarizeCostScenario(scenario);
    expect(summary.totalLineCount).toBe(3);
    expect(summary.includedLineCount).toBe(2);
    expect(summary.netMinor).toBe(10 * 1000 + 5 * 8000);
    expect(summary.categoryTotals.map((c) => c.category).sort()).toEqual([
      'labour',
      'material',
    ]);
  });

  it('is not complete while an included line lacks a price', () => {
    let scenario = createEmptyCostScenario('PLN');
    scenario = addCostLine(scenario, line({ id: 'unpriced' }));
    const summary = summarizeCostScenario(scenario);
    expect(summary.needsPriceCount).toBe(1);
    expect(summary.complete).toBe(false);
  });

  it('is not complete while an included line lacks a quantity', () => {
    let scenario = createEmptyCostScenario('PLN');
    scenario = addCostLine(
      scenario,
      line({
        id: 'needs-qty',
        quantity: { value: 0, unit: 'piece' },
        unitPriceMinor: 100,
        suitability: 'manual-required',
      }),
    );
    const summary = summarizeCostScenario(scenario);
    expect(summary.needsQuantityCount).toBe(1);
    expect(summary.complete).toBe(false);
  });

  it('is complete once every included line has quantity and price', () => {
    let scenario = createEmptyCostScenario('PLN');
    scenario = addCostLine(
      scenario,
      line({
        id: 'ready',
        quantity: { value: 1, unit: 'piece' },
        unitPriceMinor: 100,
      }),
    );
    expect(summarizeCostScenario(scenario).complete).toBe(true);
  });

  it('computes gross totals only when a scenario tax rate is configured', () => {
    let scenario = createEmptyCostScenario('PLN');
    scenario = addCostLine(
      scenario,
      line({ quantity: { value: 1, unit: 'piece' }, unitPriceMinor: 10000 }),
    );
    expect(summarizeCostScenario(scenario).grossMinor).toBeUndefined();
    scenario = setScenarioTaxRateBps(scenario, 2300);
    const summary = summarizeCostScenario(scenario);
    expect(summary.taxMinor).toBe(2300);
    expect(summary.grossMinor).toBe(12300);
  });

  it('rejects an invalid tax rate', () => {
    const scenario = createEmptyCostScenario('PLN');
    expect(() => setScenarioTaxRateBps(scenario, -1)).toThrow(
      CostValidationError,
    );
    expect(() => setScenarioTaxRateBps(scenario, 10001)).toThrow(
      CostValidationError,
    );
  });

  it('removes a line', () => {
    let scenario = createEmptyCostScenario('PLN');
    scenario = addCostLine(scenario, line({ id: 'gone' }));
    scenario = removeCostLine(scenario, 'gone');
    expect(scenario.lines).toHaveLength(0);
  });
});

describe('currency mismatch', () => {
  it('rejects adding a line whose currency does not match the scenario', () => {
    const scenario = createEmptyCostScenario('PLN');
    const foreign = line({ currencyCode: 'EUR' });
    expect(() => addCostLine(scenario, foreign)).toThrow(CostValidationError);
  });
});

describe('inclusion and manual overrides', () => {
  it('withIncluded toggles participation without losing suggestion identity', () => {
    const l = line();
    expect(withIncluded(l, false).included).toBe(false);
    expect(withIncluded(l, false).id).toBe(l.id);
  });

  it('a manual quantity edit converts ownership away from project-derived', () => {
    const derived = line({
      source: 'project-derived',
      projectQuantityValue: 100,
    });
    const edited = withManualQuantity(derived, 50);
    expect(edited.source).toBe('manual');
    expect(edited.projectQuantityValue).toBeUndefined();
    expect(edited.quantity.value).toBe(50);
  });

  it('withUnitPrice rejects an invalid price', () => {
    expect(() => withUnitPrice(line(), -1)).toThrow(CostValidationError);
  });
});

describe('project-derived quantity divergence', () => {
  it('detects a live project value change', () => {
    const l = line({ source: 'project-derived', projectQuantityValue: 492.1 });
    expect(projectQuantityDiverged(l, 510.7)).toBe(true);
    expect(projectQuantityDiverged(l, 492.1)).toBe(false);
  });

  it('never reports divergence for a manual line', () => {
    const l = line({ source: 'manual', projectQuantityValue: undefined });
    expect(projectQuantityDiverged(l, 999)).toBe(false);
  });

  it('acceptProjectQuantity updates the value and keeps project ownership', () => {
    const l = line({ source: 'project-derived', projectQuantityValue: 492.1 });
    const updated = acceptProjectQuantity(l, 510.7);
    expect(updated.quantity.value).toBe(510.7);
    expect(updated.projectQuantityValue).toBe(510.7);
    expect(updated.source).toBe('project-derived');
  });

  it('keepManualQuantity freezes the value and drops project tracking', () => {
    const l = line({ source: 'project-derived', projectQuantityValue: 492.1 });
    const kept = keepManualQuantity(l);
    expect(kept.quantity.value).toBe(l.quantity.value);
    expect(kept.source).toBe('manual');
    expect(kept.projectQuantityValue).toBeUndefined();
  });

  it('restoreFromProject resumes tracking at the current project value', () => {
    const l = keepManualQuantity(
      line({ source: 'project-derived', projectQuantityValue: 492.1 }),
    );
    const restored = restoreFromProject(l, 510.7);
    expect(restored.source).toBe('project-derived');
    expect(restored.quantity.value).toBe(510.7);
    expect(restored.projectQuantityValue).toBe(510.7);
  });
});

describe('input validation', () => {
  it('rejects a blank label or id', () => {
    expect(() => line({ label: '   ' })).toThrow(CostValidationError);
    expect(() => line({ id: '' })).toThrow(CostValidationError);
  });

  it('rejects a negative quantity', () => {
    expect(() => line({ quantity: { value: -1, unit: 'm' } })).toThrow(
      CostValidationError,
    );
  });

  it('rejects NaN and Infinity quantity', () => {
    expect(() => line({ quantity: { value: NaN, unit: 'm' } })).toThrow(
      CostValidationError,
    );
    expect(() => line({ quantity: { value: Infinity, unit: 'm' } })).toThrow(
      CostValidationError,
    );
  });
});
