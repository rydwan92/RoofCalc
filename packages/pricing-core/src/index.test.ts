import { describe, expect, it } from 'vitest';
import {
  activePriceListEntries,
  canonicalJson,
  comparePriceListEntry,
  isValidCurrencyCode,
  isValidDateString,
  isValidMinorUnits,
  isValidValidityRange,
  priceImportBatchV1Schema,
  priceListEntrySchema,
  priceListSchema,
  resolvePriceForVariant,
  type PriceListEntry,
} from './index';

function entry(overrides: Partial<PriceListEntry> = {}): PriceListEntry {
  return {
    id: 'entry-1',
    priceListId: 'list-1',
    commercialVariantId: 'variant:creaton:koda:copper-nuance',
    saleUnit: 'piece',
    netAmountMinor: 924,
    validFrom: '2026-09-01',
    ...overrides,
  };
}

describe('validation primitives', () => {
  it('accepts a three-letter uppercase currency code', () => {
    expect(isValidCurrencyCode('PLN')).toBe(true);
    expect(isValidCurrencyCode('pln')).toBe(false);
    expect(isValidCurrencyCode('PLNN')).toBe(false);
  });

  it('rejects a non-integer or negative minor amount', () => {
    expect(isValidMinorUnits(924)).toBe(true);
    expect(isValidMinorUnits(9.24)).toBe(false);
    expect(isValidMinorUnits(-1)).toBe(false);
    expect(isValidMinorUnits(NaN)).toBe(false);
    expect(isValidMinorUnits(Infinity)).toBe(false);
  });

  it('validates an ISO calendar date string', () => {
    expect(isValidDateString('2026-09-01')).toBe(true);
    expect(isValidDateString('2026-09-01T00:00:00Z')).toBe(false);
    expect(isValidDateString('not-a-date')).toBe(false);
  });

  it('requires validTo on or after validFrom when present', () => {
    expect(isValidValidityRange('2026-09-01', undefined)).toBe(true);
    expect(isValidValidityRange('2026-09-01', '2026-12-31')).toBe(true);
    expect(isValidValidityRange('2026-09-01', '2026-01-01')).toBe(false);
  });
});

describe('schema validation', () => {
  it('accepts a valid price list', () => {
    expect(() =>
      priceListSchema.parse({
        id: 'list-1',
        ownerLabel: 'rabatplus.pl (retail, illustrative)',
        currencyCode: 'PLN',
        validFrom: '2026-09-01',
      }),
    ).not.toThrow();
  });

  it('rejects a price list whose validTo precedes validFrom', () => {
    expect(() =>
      priceListSchema.parse({
        id: 'list-1',
        ownerLabel: 'Test',
        currencyCode: 'PLN',
        validFrom: '2026-09-01',
        validTo: '2026-01-01',
      }),
    ).toThrow();
  });

  it('accepts a valid entry and rejects a malformed one', () => {
    expect(() => priceListEntrySchema.parse(entry())).not.toThrow();
    expect(() =>
      priceListEntrySchema.parse({ ...entry(), netAmountMinor: -1 }),
    ).toThrow();
    expect(() =>
      priceListEntrySchema.parse({ ...entry(), netAmountMinor: 9.24 }),
    ).toThrow();
  });

  it('parses an old-shaped entry with no source-basis provenance (V34C backward compatibility)', () => {
    const parsed = priceListEntrySchema.parse(entry());
    expect(parsed.sourceAmountBasis).toBeUndefined();
    expect(parsed.sourceVatRateBps).toBeUndefined();
  });

  it('accepts a V35 entry carrying gross-with-stated-VAT provenance', () => {
    expect(() =>
      priceListEntrySchema.parse(
        entry({ sourceAmountBasis: 'gross', sourceVatRateBps: 2300 }),
      ),
    ).not.toThrow();
    expect(() =>
      priceListEntrySchema.parse(entry({ sourceAmountBasis: 'net' })),
    ).not.toThrow();
  });

  it('rejects an invalid source-basis value or an out-of-range VAT rate', () => {
    expect(() =>
      priceListEntrySchema.parse({
        ...entry(),
        sourceAmountBasis: 'wholesale',
      }),
    ).toThrow();
    expect(() =>
      priceListEntrySchema.parse({ ...entry(), sourceVatRateBps: -1 }),
    ).toThrow();
    expect(() =>
      priceListEntrySchema.parse({ ...entry(), sourceVatRateBps: 10_001 }),
    ).toThrow();
  });

  it('rejects an import batch whose entry references an unknown price list', () => {
    expect(() =>
      priceImportBatchV1Schema.parse({
        schemaVersion: 1,
        source: { id: 'src', label: 'Test' },
        priceLists: [],
        entries: [entry()],
      }),
    ).toThrow();
  });

  it('rejects an import batch with a duplicate entry ID', () => {
    expect(() =>
      priceImportBatchV1Schema.parse({
        schemaVersion: 1,
        source: { id: 'src', label: 'Test' },
        priceLists: [
          {
            id: 'list-1',
            ownerLabel: 'Test',
            currencyCode: 'PLN',
            validFrom: '2026-09-01',
          },
        ],
        entries: [entry(), entry()],
      }),
    ).toThrow();
  });

  it('accepts a self-contained, valid batch', () => {
    expect(() =>
      priceImportBatchV1Schema.parse({
        schemaVersion: 1,
        source: { id: 'src', label: 'Test' },
        priceLists: [
          {
            id: 'list-1',
            ownerLabel: 'Test',
            currencyCode: 'PLN',
            validFrom: '2026-09-01',
          },
        ],
        entries: [entry()],
      }),
    ).not.toThrow();
  });
});

describe('write-once entry comparison', () => {
  it('is new when no existing entry shares the ID', () => {
    expect(comparePriceListEntry(undefined, entry())).toBe('new');
  });

  it('is unchanged for identical data under the same ID', () => {
    expect(comparePriceListEntry(entry(), entry())).toBe('unchanged');
  });

  it('is a conflict for a changed amount under the same ID — never a silent overwrite', () => {
    expect(
      comparePriceListEntry(entry(), entry({ netAmountMinor: 1000 })),
    ).toBe('conflict');
  });

  it('is a conflict when only the source-basis provenance changes', () => {
    expect(
      comparePriceListEntry(
        entry(),
        entry({ sourceAmountBasis: 'gross', sourceVatRateBps: 2300 }),
      ),
    ).toBe('conflict');
  });

  it('is insensitive to key order (canonical comparison)', () => {
    const a = entry();
    const b = { ...entry() };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });
});

describe('price lookup', () => {
  it('resolves the entry active on a given date', () => {
    const entries = [
      entry({ id: 'a', validFrom: '2026-01-01', validTo: '2026-06-30' }),
    ];
    expect(
      resolvePriceForVariant(entries, entry().commercialVariantId, '2026-03-01')
        ?.id,
    ).toBe('a');
    expect(
      resolvePriceForVariant(
        entries,
        entry().commercialVariantId,
        '2026-09-01',
      ),
    ).toBeUndefined();
  });

  it('prefers the most recently published price when several are active', () => {
    const variantId = entry().commercialVariantId;
    const entries = [
      entry({ id: 'old', validFrom: '2026-01-01' }),
      entry({ id: 'new', validFrom: '2026-06-01', netAmountMinor: 1000 }),
    ];
    const resolved = resolvePriceForVariant(entries, variantId, '2026-09-01');
    expect(resolved?.id).toBe('new');
    expect(resolved?.netAmountMinor).toBe(1000);
  });

  it('never resolves a price for an unrelated variant', () => {
    const entries = [entry()];
    expect(resolvePriceForVariant(entries, 'variant:other')).toBeUndefined();
  });

  it('lists only entries active at the reference date', () => {
    const entries = [
      entry({ id: 'a', validFrom: '2026-01-01', validTo: '2026-03-31' }),
      entry({ id: 'b', validFrom: '2026-06-01' }),
    ];
    expect(
      activePriceListEntries(entries, '2026-02-01').map((e) => e.id),
    ).toEqual(['a']);
    expect(
      activePriceListEntries(entries, '2026-07-01').map((e) => e.id),
    ).toEqual(['b']);
  });
});
