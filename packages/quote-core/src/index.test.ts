import { describe, expect, it } from 'vitest';
import {
  calculateQuoteLine,
  createQuoteDraft,
  quoteIsStale,
  quoteSourceFingerprint,
  summarizeQuote,
  withQuoteDiscount,
  withQuoteQuantity,
  withQuoteUnitPrice,
  withQuoteVat,
  type QuoteLine,
} from './index';

const line: QuoteLine = {
  id: 'line:tile',
  group: 'covering',
  description: 'Dachówka KODA',
  organizationSku: 'DACH-00384',
  technicalQuantity: { value: 120, unit: 'piece' },
  offerQuantity: { value: 120, unit: 'piece' },
  quantityOverridden: false,
  unitNetAmountMinor: 482,
  organizationUnitNetAmountMinor: 482,
  priceSource: 'organization-price-list',
  discountBps: 500,
  vatRateBps: 2300,
  included: true,
};

function draft(lines = [line]) {
  return createQuoteDraft({
    id: 'quote:1',
    organizationSnapshot: { id: 'org:1', name: 'Hurtownia ABC' },
    customerSnapshot: { name: 'Jan Kowalski' },
    projectReference: { id: 'project:1', name: 'Dom Kowalski' },
    createdAt: '2026-09-22T08:00:00.000Z',
    currencyCode: 'PLN',
    sourceFingerprint: 'q1-source',
    lines,
  });
}

describe('quote-core', () => {
  it('calculates money with integer minor units and per-line rounding', () => {
    expect(calculateQuoteLine(line)).toMatchObject({
      netBeforeDiscountMinor: 57_840,
      discountMinor: 2_892,
      netMinor: 54_948,
      taxMinor: 12_638,
      grossMinor: 67_586,
    });
  });

  it('keeps technical quantity unchanged when the offer quantity changes', () => {
    const changed = withQuoteQuantity(draft(), line.id, 125);
    expect(changed.lines[0]).toMatchObject({
      technicalQuantity: { value: 120 },
      offerQuantity: { value: 125 },
      quantityOverridden: true,
    });
  });

  it('keeps the organization amount visible after a manual quote override', () => {
    const changed = withQuoteUnitPrice(draft(), line.id, 9450);
    expect(changed.lines[0]).toMatchObject({
      unitNetAmountMinor: 9450,
      organizationUnitNetAmountMinor: 482,
      priceSource: 'manual-estimation',
    });
  });

  it('supports explicit line discount and VAT without floats in the model', () => {
    const changed = withQuoteVat(
      withQuoteDiscount(draft(), line.id, 750),
      line.id,
      800,
    );
    expect(changed.lines[0]).toMatchObject({
      discountBps: 750,
      vatRateBps: 800,
    });
  });

  it('withholds final gross totals while any included line has missing VAT', () => {
    const noVat: QuoteLine = {
      ...line,
      id: 'line:no-vat',
      vatRateBps: undefined,
    };
    const summary = summarizeQuote(draft([line, noVat]));
    expect(summary).toMatchObject({
      missingVatCount: 1,
      complete: false,
    });
    expect(summary.taxMinor).toBeUndefined();
    expect(summary.grossMinor).toBeUndefined();
  });

  it('shows a VAT breakdown when more than one explicit rate is present', () => {
    const lower: QuoteLine = { ...line, id: 'line:lower', vatRateBps: 800 };
    const summary = summarizeQuote(draft([line, lower]));
    expect(summary.complete).toBe(true);
    expect(summary.vatTotals.map((item) => item.vatRateBps)).toEqual([
      800, 2300,
    ]);
  });

  it('detects project/commercial drift deterministically', () => {
    const first = quoteSourceFingerprint({ b: 2, a: 1 });
    expect(first).toBe(quoteSourceFingerprint({ a: 1, b: 2 }));
    expect(quoteIsStale(draft(), first)).toBe(true);
    expect(quoteIsStale({ ...draft(), sourceFingerprint: first }, first)).toBe(
      false,
    );
  });
});
