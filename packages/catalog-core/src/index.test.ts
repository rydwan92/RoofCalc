import { describe, expect, it } from 'vitest';
import {
  catalogImportBatchV1Schema,
  commercialVariantSchema,
  compareTechnicalRevision,
  createCatalogProductSelection,
  manufacturerSchema,
  technicalProductFamilySchema,
  technicalProductRevisionSchema,
  type CatalogImportBatchV1,
} from './index';
import { resolveRoofTileLayout } from '@cieslacalc/covering-core';

const manufacturer = manufacturerSchema.parse({
  id: 'manufacturer:demo',
  slug: 'demo',
  name: 'Demo',
  countryCode: 'PL',
  active: true,
});
const products = [
  {
    id: 'product:tile',
    manufacturerId: manufacturer.id,
    slug: 'tile',
    name: 'Demo Tile',
    coveringKind: 'roof-tile' as const,
    active: true,
  },
  {
    id: 'product:sheet',
    manufacturerId: manufacturer.id,
    slug: 'sheet',
    name: 'Demo Sheet',
    coveringKind: 'modular-sheet' as const,
    active: true,
  },
  {
    id: 'product:seam',
    manufacturerId: manufacturer.id,
    slug: 'seam',
    name: 'Demo Seam',
    coveringKind: 'standing-seam' as const,
    active: true,
  },
].map((item) => technicalProductFamilySchema.parse(item));
const specs = [
  {
    schemaVersion: 1 as const,
    kind: 'roof-tile' as const,
    installationModes: [
      {
        id: 'standard',
        coverWidthMm: 300,
        gaugeRangeMm: { min: 320, max: 360 },
        minPitchDeg: 20,
        coursePattern: {
          layers: [{ id: 'base', horizontalOffsetFraction: 0 }],
          battenRowOffsetCycle: [0],
        },
      },
    ],
  },
  {
    schemaVersion: 1 as const,
    kind: 'modular-sheet' as const,
    effectiveWidthMm: 1140,
    lengthModel: { kind: 'fixed-sheet' as const, effectiveLengthMm: 700 },
    moduleLengthMm: 350,
    minPitchDeg: 9,
  },
  {
    schemaVersion: 1 as const,
    kind: 'standing-seam' as const,
    installationModes: [{ id: 'standard', effectiveWidthMm: 500 }],
    minPanelLengthMm: 500,
    maxPanelLengthMm: 8000,
    seamHeightMm: 25,
    minPitchDeg: 8,
  },
];
const revisions = products.map((product, index) =>
  technicalProductRevisionSchema.parse({
    id: `revision:${index + 1}`,
    productId: product.id,
    revisionCode: '2026-01',
    technicalSpec: specs[index],
    source: { label: 'DEMO fixture' },
  }),
);
const batch: CatalogImportBatchV1 = {
  schemaVersion: 1,
  source: { id: 'source:demo', label: 'DEMO fixture' },
  manufacturers: [manufacturer],
  products,
  revisions,
  variants: [
    commercialVariantSchema.parse({
      id: 'variant:tile:red',
      productId: products[0]!.id,
      sku: 'DEMO-RED',
      name: 'Red',
      color: 'red',
      active: true,
    }),
  ],
};

describe('catalog contracts', () => {
  it('parses manufacturer, product, variant and all three covering revisions', () => {
    expect(manufacturer.id).toBe('manufacturer:demo');
    expect(products.map((item) => item.coveringKind)).toEqual([
      'roof-tile',
      'modular-sheet',
      'standing-seam',
    ]);
    expect(revisions.map((item) => item.technicalSpec.kind)).toEqual([
      'roof-tile',
      'modular-sheet',
      'standing-seam',
    ]);
    expect(batch.variants[0]?.sku).toBe('DEMO-RED');
  });

  it('validates canonical import references and rejects duplicate IDs', () => {
    expect(catalogImportBatchV1Schema.parse(batch)).toEqual(batch);
    expect(
      catalogImportBatchV1Schema.safeParse({
        ...batch,
        manufacturers: [manufacturer, manufacturer],
      }).success,
    ).toBe(false);
    expect(
      catalogImportBatchV1Schema.safeParse({
        ...batch,
        revisions: [{ ...revisions[0]!, productId: 'product:missing' }],
      }).success,
    ).toBe(false);
  });

  it('treats revision IDs as immutable and identical re-imports as unchanged', () => {
    const original = revisions[0]!;
    if (original.technicalSpec.kind !== 'roof-tile')
      throw new Error('test fixture');
    expect(compareTechnicalRevision(undefined, original)).toBe('new');
    expect(compareTechnicalRevision(original, original)).toBe('unchanged');
    expect(
      compareTechnicalRevision(original, {
        ...original,
        technicalSpec: {
          ...original.technicalSpec,
          installationModes: [
            {
              ...original.technicalSpec.installationModes[0]!,
              coverWidthMm: 301,
            },
          ],
        },
      }),
    ).toBe('conflict');
  });

  it('maps catalogue identity and immutable technical data to one covering selection', () => {
    const selection = createCatalogProductSelection({
      manufacturer,
      product: products[0]!,
      revision: revisions[0]!,
      variant: batch.variants[0],
    });
    expect(selection.catalogRef).toEqual({
      productId: products[0]!.id,
      technicalRevisionId: revisions[0]!.id,
      variantId: 'variant:tile:red',
    });
    expect(selection.displaySnapshot).toEqual({
      manufacturer: 'Demo',
      familyName: 'Demo Tile',
      variantName: 'Red',
      revisionCode: '2026-01',
    });
    expect(selection.technicalSpecSnapshot).toEqual(specs[0]);
  });

  it('does not admit price fields into technical revisions', () => {
    expect(
      technicalProductRevisionSchema.safeParse({
        ...revisions[0],
        price: 42,
      }).success,
    ).toBe(false);
  });

  it('keeps an R1 project calculation reproducible after the catalogue moves to R2', () => {
    const selection = createCatalogProductSelection({
      manufacturer,
      product: products[0]!,
      revision: revisions[0]!,
    });
    const r2 = structuredClone(revisions[0]!);
    if (
      r2.technicalSpec.kind !== 'roof-tile' ||
      selection.technicalSpecSnapshot.kind !== 'roof-tile'
    )
      throw new Error('test fixture');
    r2.id = 'revision:tile:2';
    r2.revisionCode = '2026-02';
    r2.technicalSpec.installationModes[0]!.coverWidthMm = 250;
    const result = resolveRoofTileLayout({
      assignmentId: 'covering:catalog',
      roofPlaneIds: ['roof-plane:left'],
      roofSurfaceGeometry: [
        {
          roofPlaneId: 'roof-plane:left',
          pitchDeg: 35,
          localPolygon: [
            { uMm: 0, vMm: 0 },
            { uMm: 1000, vMm: 0 },
            { uMm: 1000, vMm: 1000 },
            { uMm: 0, vMm: 1000 },
          ],
          netAreaMm2: 1_000_000,
        },
      ],
      openings: [],
      battens: [100, 430, 760].map((stationVMm, index) => ({
        id: `batten:${index}`,
        roofPlaneId: 'roof-plane:left',
        stationVMm,
        segments: [{ fromUMm: 0, toUMm: 1000 }],
      })),
      productSpec: selection.technicalSpecSnapshot,
      selectedInstallationModeId: 'standard',
      layoutIntent: { kind: 'roof-tile', horizontalAlignment: 'centered' },
    });
    expect(selection.catalogRef?.technicalRevisionId).toBe('revision:1');
    expect(
      selection.technicalSpecSnapshot.installationModes[0]?.coverWidthMm,
    ).toBe(300);
    expect(result.totalPositions).toBe(12);
  });
});
