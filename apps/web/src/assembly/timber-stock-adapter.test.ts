import { describe, expect, it } from 'vitest';
import { createCuttingPlan } from '@cieslacalc/procurement-core';
import { timberSectionStockClassId } from './timber-stock-class';
import { timberCatalogItemToStockOption } from './timber-stock-adapter';

const settings = { kerfMm: 3, endTrimMm: 5, minimumReusableRemnantMm: 200 };

const spec45x145x4000Treated = {
  schemaVersion: 1 as const,
  kind: 'timber-stock' as const,
  widthMm: 45,
  depthMm: 145,
  lengthMm: 4000,
  strengthClass: 'C24',
  treated: true,
  salesUnit: 'piece' as const,
};
const spec45x145x4000 = {
  ...spec45x145x4000Treated,
  treated: undefined,
};
const spec45x95x3000 = {
  ...spec45x145x4000,
  depthMm: 95,
  lengthMm: 3000,
};

describe('timber stock class fingerprint', () => {
  it('is section-only, matching the K1 required-piece fingerprint exactly', () => {
    expect(timberSectionStockClassId(45, 145)).toBe(
      JSON.stringify(['timber-section', 45, 145]),
    );
  });

  it('never distinguishes by grade or treatment (documented, not a bug)', () => {
    const treated = timberCatalogItemToStockOption({
      id: 'variant:treated',
      spec: spec45x145x4000Treated,
    });
    const untreated = timberCatalogItemToStockOption({
      id: 'variant:untreated',
      spec: spec45x145x4000,
    });
    expect(treated.stockClassId).toBe(untreated.stockClassId);
  });

  it('distinguishes by section, so a narrower item never satisfies a wider requirement', () => {
    const wide = timberCatalogItemToStockOption({
      id: 'variant:wide',
      spec: spec45x145x4000,
    });
    const narrow = timberCatalogItemToStockOption({
      id: 'variant:narrow',
      spec: spec45x95x3000,
    });
    expect(wide.stockClassId).not.toBe(narrow.stockClassId);
  });
});

describe('timberCatalogItemToStockOption', () => {
  it('maps a catalogue pick into a pure StockOption with no grade metadata', () => {
    const option = timberCatalogItemToStockOption({
      id: 'variant:timber:c24-45x145x4000-treated:standard',
      spec: spec45x145x4000Treated,
      availability: 20,
    });
    expect(option).toEqual({
      id: 'variant:timber:c24-45x145x4000-treated:standard',
      stockClassId: timberSectionStockClassId(45, 145),
      lengthMm: 4000,
      availability: 20,
    });
  });

  it('omits availability when unset rather than writing undefined', () => {
    const option = timberCatalogItemToStockOption({
      id: 'variant:timber:c24-45x145x4000:standard',
      spec: spec45x145x4000,
    });
    expect(option).not.toHaveProperty('availability');
  });

  it('feeds a real createCuttingPlan call exactly like a K1 required piece would', () => {
    const stockClassId = timberSectionStockClassId(45, 145);
    const option = timberCatalogItemToStockOption({
      id: 'variant:timber:c24-45x145x4000:standard',
      spec: spec45x145x4000,
    });
    const plan = createCuttingPlan({
      requiredPieces: [
        {
          id: 'k1:1',
          stockClassId,
          requiredBlankLengthMm: 3800,
        },
      ],
      stockOptions: [option],
      settings,
    });
    expect(plan.status).toBe('complete');
    expect(plan.stockUsages[0]?.stockOptionId).toBe(option.id);
  });
});
