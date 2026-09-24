import { describe, expect, it } from 'vitest';
import {
  createCostLine,
  createEmptyCostScenario,
  addCostLine,
} from '@cieslacalc/cost-core';
import { summarizeQuote } from '@cieslacalc/quote-core';
import { deriveCommercialReadiness } from './commercial-readiness';
import {
  commercialProjectionFingerprint,
  createQuoteFromMaterialPlan,
} from './quote-adapter';
import type { MaterialPlanRow } from '../assembly/material-plan';

const row: MaterialPlanRow = {
  id: 'material:tile',
  category: 'covering',
  labelKey: 'tile',
  description: 'KODA antracyt',
  quantity: 120,
  unit: 'piece',
  basis: 'procurement-stock',
  suitability: 'exact-purchase',
  partial: false,
  product: { name: 'KODA', variantId: 'variant:koda', facts: [] },
  productSource: 'catalog',
  metrics: [],
  warnings: [],
  sourceReferences: [],
};

describe('commercial readiness projection', () => {
  it('separates technical, assortment and price issues', () => {
    const technical = { ...row, id: 'technical', partial: true };
    const outside = {
      ...row,
      id: 'outside',
      product: { ...row.product!, variantId: 'variant:outside' },
    };
    const missing = {
      ...row,
      id: 'missing',
      product: { ...row.product!, variantId: 'variant:missing' },
    };
    const readiness = deriveCommercialReadiness({
      rows: [technical, outside, missing, row],
      priceStateByVariant: new Map([
        ['variant:outside', { missing: 'not-in-assortment' as const }],
        ['variant:missing', { missing: 'no-organization-price' as const }],
        ['variant:koda', { price: {} }],
      ]),
      hasCovering: true,
      quoteExists: false,
      quoteStale: false,
    });
    expect(readiness).toMatchObject({
      technicalIssues: 1,
      assortmentIssues: 1,
      priceIssues: 1,
      readyItems: 1,
      primaryAction: 'complete-technical',
    });
  });
});

describe('quote adapter', () => {
  const costLine = createCostLine({
    id: row.id,
    category: 'material',
    label: 'Dachówka KODA',
    quantity: { value: 120, unit: 'piece' },
    quantityBasis: 'procurement-stock',
    suitability: 'exact-purchase',
    currencyCode: 'PLN',
    unitPriceMinor: 482,
    source: 'price-list',
    projectQuantityValue: 120,
    priceProvenance: {
      source: 'price-list',
      label: 'Aktualny cennik hurtowni',
      variantId: 'variant:koda',
      saleUnit: 'piece',
    },
  });
  const scenario = {
    ...addCostLine(
      createEmptyCostScenario('PLN', '2026-09-22T08:00:00.000Z'),
      costLine,
      '2026-09-22T08:00:00.000Z',
    ),
    taxRateBps: 2300,
  };
  const organizationPrices = [
    {
      commercialVariantId: 'variant:koda',
      externalKey: 'DACH-00384',
      vatRateBps: 2300,
      price: {
        priceListId: 'list:1',
        priceListLabel: 'Aktualny cennik hurtowni',
        entryId: 'entry:1',
        netAmountMinor: 482,
        currencyCode: 'PLN',
        saleUnit: 'piece' as const,
        validFrom: '2026-09-01',
      },
    },
  ];

  it('creates a commercial snapshot with company identity and explicit VAT', () => {
    const quote = createQuoteFromMaterialPlan({
      draft: {
        id: 'OF-1',
        organizationSnapshot: { id: 'org:1', name: 'Hurtownia ABC' },
        customerSnapshot: { name: 'Jan Kowalski' },
        projectReference: { id: 'project:1', name: 'Dom Kowalski' },
        createdAt: '2026-09-22T08:00:00.000Z',
        currencyCode: 'PLN',
      },
      rows: [row],
      scenario,
      prices: {},
      organizationPrices,
      label: () => 'Dachówka KODA',
    });
    expect(quote.lines[0]).toMatchObject({
      organizationSku: 'DACH-00384',
      technicalQuantity: { value: 120 },
      offerQuantity: { value: 120 },
      unitNetAmountMinor: 482,
      organizationUnitNetAmountMinor: 482,
      priceSource: 'organization-price-list',
      vatRateBps: 2300,
    });
    expect(summarizeQuote(quote).complete).toBe(true);
  });

  it('changes its fingerprint when technical quantity changes', () => {
    const original = commercialProjectionFingerprint({
      rows: [row],
      scenario,
      prices: {},
      organizationPrices,
    });
    const changed = commercialProjectionFingerprint({
      rows: [{ ...row, quantity: 125 }],
      scenario,
      prices: {},
      organizationPrices,
    });
    expect(changed).not.toBe(original);
  });

  it('snapshots organization VAT for a new quote', () => {
    const prices = organizationPrices.map((item) => ({
      ...item,
      vatRateBps: 800,
    }));
    const input = {
      draft: {
        id: 'OF-VAT',
        organizationSnapshot: { id: 'org:1', name: 'Hurtownia ABC' },
        customerSnapshot: { name: 'Jan Kowalski' },
        projectReference: { id: 'project:1', name: 'Dom' },
        createdAt: '2026-09-24T08:00:00.000Z',
        currencyCode: 'PLN',
      },
      rows: [row],
      scenario,
      prices: {},
      organizationPrices: prices,
      label: () => 'KODA',
    };
    const oldQuote = createQuoteFromMaterialPlan(input);
    expect(oldQuote.lines[0]?.vatRateBps).toBe(800);
    const missingVatQuote = createQuoteFromMaterialPlan({
      ...input,
      organizationPrices: [{ ...prices[0]!, vatRateBps: undefined }],
    });
    expect(missingVatQuote.lines[0]?.vatRateBps).toBeUndefined();
    const newQuote = createQuoteFromMaterialPlan({
      ...input,
      organizationPrices: [{ ...prices[0]!, vatRateBps: 500 }],
    });
    expect(newQuote.lines[0]?.vatRateBps).toBe(500);
    expect(oldQuote.lines[0]?.vatRateBps).toBe(800);
  });
});
