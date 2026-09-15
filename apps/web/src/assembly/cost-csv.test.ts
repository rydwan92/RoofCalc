import { describe, expect, it } from 'vitest';
import {
  addCostLine,
  createCostLine,
  createEmptyCostScenario,
  setScenarioTaxRateBps,
} from '@cieslacalc/cost-core';
import { costEstimateCsvFilename, costScenarioToCsv } from './cost-csv';

describe('cost estimate CSV export', () => {
  it('starts with a UTF-8 BOM and semicolon-delimited header', () => {
    const csv = costScenarioToCsv(createEmptyCostScenario('PLN'));
    const bom = String.fromCharCode(0xfeff);
    expect(csv.startsWith(bom)).toBe(true);
    expect(csv.split('\r\n')[0]).toBe(
      `${bom}Lp;Kategoria;Pozycja;Podstawa;Ilość;Jm;Cena netto;Wartość netto;VAT;Wartość brutto;Uwagi`,
    );
  });

  it('includes only included lines, mirroring the printed estimate', () => {
    let scenario = createEmptyCostScenario('PLN');
    scenario = addCostLine(
      scenario,
      createCostLine({
        id: 'battens',
        category: 'material',
        label: 'Łaty',
        quantity: { value: 100, unit: 'm' },
        quantityBasis: 'geometric-length',
        suitability: 'geometric-estimate',
        currencyCode: 'PLN',
        unitPriceMinor: 733,
        source: 'project-derived',
        noteKeys: ['no-allowance-no-stock-length'],
      }),
    );
    scenario = addCostLine(
      scenario,
      createCostLine({
        id: 'skipped',
        category: 'other',
        label: 'Pominięte',
        quantity: { value: 1, unit: 'piece' },
        quantityBasis: 'manual',
        suitability: 'manual-required',
        currencyCode: 'PLN',
        source: 'manual',
        included: false,
      }),
    );
    scenario = setScenarioTaxRateBps(scenario, 2300);
    const csv = costScenarioToCsv(scenario);
    const rows = csv.split('\r\n');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain('Łaty');
    expect(rows[1]).toContain('no-allowance-no-stock-length');
    expect(rows[1]).toContain('23%');
    expect(csv).not.toContain('Pominięte');
  });

  it('quotes a label containing a semicolon', () => {
    let scenario = createEmptyCostScenario('PLN');
    scenario = addCostLine(
      scenario,
      createCostLine({
        id: 'quoted',
        category: 'other',
        label: 'Transport; dostawa',
        quantity: { value: 1, unit: 'flat' },
        quantityBasis: 'manual',
        suitability: 'manual-required',
        currencyCode: 'PLN',
        source: 'manual',
      }),
    );
    const csv = costScenarioToCsv(scenario);
    expect(csv).toContain('"Transport; dostawa"');
  });

  it('sanitizes the project name into a safe filename', () => {
    expect(costEstimateCsvFilename('Dach A / próba')).toBe(
      'Dach_A_proba_kosztorys.csv',
    );
    expect(costEstimateCsvFilename('')).toBe('projekt_kosztorys.csv');
  });
});
