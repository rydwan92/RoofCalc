import { describe, expect, it } from 'vitest';
import {
  createQuoteDraft,
  quoteDraftSchema,
  quoteSectionStatus,
  summarizeQuote,
  summarizeQuoteBySection,
  withQuoteIncluded,
  withQuoteSection,
  withQuoteUnitPrice,
  type QuoteDraft,
  type QuoteLine,
} from './index';

function line(id: string, value: number, unitNetAmountMinor = 1000): QuoteLine {
  return {
    id,
    group: 'construction',
    description: `Pozycja ${id}`,
    technicalQuantity: { value, unit: 'piece' },
    offerQuantity: { value, unit: 'piece' },
    quantityOverridden: false,
    unitNetAmountMinor,
    priceSource: 'organization-price-list',
    vatRateBps: 2300,
    included: true,
  };
}

/** A one-roof quote: what each structure's part is built as. */
function oneRoof(lines: QuoteLine[], sourceFingerprint: string): QuoteDraft {
  return createQuoteDraft({
    id: 'quote:1',
    number: 'OF/2026/000007',
    organizationSnapshot: { id: 'org:1', name: 'Hurtownia ABC' },
    customerSnapshot: { name: 'Jan Kowalski' },
    projectReference: { id: 'project:1', name: 'Dom z garażem' },
    createdAt: '2026-10-25T08:00:00.000Z',
    currencyCode: 'PLN',
    sourceFingerprint,
    lines,
  });
}

const house = { id: 'structure:roof', label: 'Dom' };
const garage = { id: 'structure:2', label: 'Garaż' };

/** VNext-10F (ADR-017 §9): a quote of several structures, part by part. */
describe('a quote of several structures', () => {
  // The house was quoted while the project had one roof.
  const houseQuote = oneRoof(
    [line('material:k1', 22), line('material:plate', 2, 4500)],
    'fp-house',
  );
  // Then a garage was added, opened, and its part built.
  const withGarage = withQuoteSection({
    base: oneRoof([line('material:k1', 9)], 'fp-garage'),
    sectionId: garage.id,
    order: [house, garage],
    previous: houseQuote,
  });

  it('keeps the one-roof lines as the first structure and adds the open one', () => {
    expect(withGarage.sections).toEqual([
      { ...house, sourceFingerprint: 'fp-house' },
      { ...garage, sourceFingerprint: 'fp-garage' },
    ]);
    expect(
      withGarage.lines.map((entry) => [entry.sectionId, entry.id]),
    ).toEqual([
      ['structure:roof', 'material:k1'],
      ['structure:roof', 'material:plate'],
      ['structure:2', 'material:k1'],
    ]);
    // The header stays the quote's own.
    expect(withGarage.number).toBe('OF/2026/000007');
    expect(quoteDraftSchema.safeParse(withGarage).success).toBe(true);
  });

  it('identifies a line by its section and id, never one id alone', () => {
    const garageLine = withGarage.lines[2]!;
    const edited = withQuoteUnitPrice(
      withQuoteIncluded(withGarage, garageLine, false),
      garageLine,
      1250,
    );
    expect(edited.lines[0]).toEqual(withGarage.lines[0]);
    expect(edited.lines[2]).toMatchObject({
      included: false,
      unitNetAmountMinor: 1250,
      priceSource: 'manual-estimation',
    });
  });

  it('rebuilds only the open part; the others keep their frozen values and new names', () => {
    const edited = withQuoteUnitPrice(withGarage, withGarage.lines[2]!, 1250);
    const refreshed = withQuoteSection({
      base: oneRoof([line('material:k1', 24)], 'fp-house-2'),
      sectionId: house.id,
      order: [{ ...house, label: 'Budynek' }, garage],
      previous: edited,
    });
    expect(refreshed.sections).toEqual([
      { id: house.id, label: 'Budynek', sourceFingerprint: 'fp-house-2' },
      { ...garage, sourceFingerprint: 'fp-garage' },
    ]);
    expect(
      refreshed.lines.map((entry) => [
        entry.sectionId,
        entry.technicalQuantity.value,
        entry.unitNetAmountMinor,
      ]),
    ).toEqual([
      ['structure:roof', 24, 1000],
      ['structure:2', 9, 1250],
    ]);
    expect(refreshed.sourceFingerprint).not.toBe(withGarage.sourceFingerprint);
  });

  it('drops the part of a removed structure on the next refresh', () => {
    const refreshed = withQuoteSection({
      base: oneRoof([line('material:k1', 22)], 'fp-house'),
      sectionId: house.id,
      order: [house],
      previous: withGarage,
    });
    expect(refreshed.sections?.map((section) => section.id)).toEqual([
      house.id,
    ]);
    expect(refreshed.lines).toHaveLength(1);
  });

  it('refuses a part that is not one of the project', () => {
    expect(() =>
      withQuoteSection({
        base: oneRoof([], 'fp'),
        sectionId: 'structure:9',
        order: [house, garage],
      }),
    ).toThrow('quote-section-not-in-order');
  });

  it('says when the open part is stale and which parts have none', () => {
    const order = [house, garage];
    expect(
      quoteSectionStatus(withGarage, order, {
        id: garage.id,
        sourceFingerprint: 'fp-garage',
      }),
    ).toEqual({ stale: false, missing: [] });
    expect(
      quoteSectionStatus(withGarage, order, {
        id: garage.id,
        sourceFingerprint: 'fp-garage-2',
      }).stale,
    ).toBe(true);
    // A renamed or a removed structure makes the quote stale.
    expect(
      quoteSectionStatus(withGarage, [house, { ...garage, label: 'Wiata' }], {
        id: house.id,
        sourceFingerprint: 'fp-house',
      }).stale,
    ).toBe(true);
    expect(
      quoteSectionStatus(withGarage, [house], {
        id: house.id,
        sourceFingerprint: 'fp-house',
      }).stale,
    ).toBe(true);
    // A one-roof quote of a project that now has a garage: the house part
    // is current, the garage has none yet.
    expect(
      quoteSectionStatus(houseQuote, order, {
        id: house.id,
        sourceFingerprint: 'fp-house',
      }),
    ).toEqual({ stale: false, missing: [garage.id] });
    expect(
      quoteSectionStatus(houseQuote, order, {
        id: garage.id,
        sourceFingerprint: 'fp-garage',
      }),
    ).toEqual({ stale: true, missing: [garage.id] });
  });

  it('totals each part, and the parts add up to the quote', () => {
    const parts = summarizeQuoteBySection(withGarage);
    expect(parts.map((part) => part.section.id)).toEqual([house.id, garage.id]);
    // 22 × 10,00 zł + 2 × 45,00 zł = 310,00 zł; 9 × 10,00 zł = 90,00 zł.
    expect(parts.map((part) => part.summary.netMinor)).toEqual([31_000, 9_000]);
    expect(parts.reduce((sum, part) => sum + part.summary.netMinor, 0)).toBe(
      summarizeQuote(withGarage).netMinor,
    );
    expect(summarizeQuoteBySection(houseQuote)).toEqual([]);
  });

  it('parses sections all or nothing', () => {
    const parse = (draft: unknown) => quoteDraftSchema.safeParse(draft).success;
    // A line naming a section in a quote without sections.
    expect(
      parse({
        ...houseQuote,
        lines: [{ ...houseQuote.lines[0]!, sectionId: house.id }],
      }),
    ).toBe(false);
    // A quote with sections and a line naming none.
    expect(
      parse({
        ...withGarage,
        lines: [...withGarage.lines, line('material:extra', 1)],
      }),
    ).toBe(false);
    // The same line twice in one section.
    expect(
      parse({
        ...withGarage,
        lines: [...withGarage.lines, withGarage.lines[0]!],
      }),
    ).toBe(false);
    // An old quote without sections parses as before.
    expect(parse(houseQuote)).toBe(true);
  });
});
