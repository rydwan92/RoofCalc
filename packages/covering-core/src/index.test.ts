import { describe, expect, it } from 'vitest';
import {
  COVERING_TECHNICAL_SCHEMA_VERSION,
  checkCoveringCompatibility,
  coveringAssignmentSpecSchema,
  coveringProductSelectionSchema,
  coveringTechnicalSpecSchema,
  modularSheetTechnicalSpecSchema,
  roofTileTechnicalSpecSchema,
  standingSeamTechnicalSpecSchema,
  type RoofTileTechnicalSpec,
} from './index';

const tile = (): RoofTileTechnicalSpec => ({
  schemaVersion: 1,
  kind: 'roof-tile',
  physicalWidthMm: 180,
  physicalLengthMm: 380,
  material: 'ceramic',
  salesUnit: 'piece',
  installationModes: [
    {
      id: 'scale',
      coverWidthMm: 180,
      gaugeRangeMm: { min: 145, max: 165 },
      declaredUnitsPerM2: { min: 33.7, max: 38.3 },
      minPitchDeg: 30,
    },
    {
      id: 'crown',
      coverWidthMm: 180,
      gaugeRangeMm: { min: 290, max: 330 },
      minPitchDeg: 30,
    },
  ],
});

describe('covering technical product contracts', () => {
  it('parses a tile with physical dimensions and multiple installation modes', () => {
    const parsed = roofTileTechnicalSpecSchema.parse(tile());
    expect(parsed.installationModes.map((mode) => mode.id)).toEqual([
      'scale',
      'crown',
    ]);
    expect(parsed.installationModes[0]!.gaugeRangeMm).toEqual({
      min: 145,
      max: 165,
    });
  });

  it('parses fixed and cut-to-length modular sheet families', () => {
    expect(
      modularSheetTechnicalSpecSchema.parse({
        schemaVersion: 1,
        kind: 'modular-sheet',
        effectiveWidthMm: 1190,
        totalWidthMm: 1250,
        lengthModel: {
          kind: 'fixed-sheet',
          effectiveLengthMm: 700,
          totalLengthMm: 725,
        },
        moduleLengthMm: 350,
        minPitchDeg: 9,
        physicalThicknessMm: 0.5,
      }).lengthModel.kind,
    ).toBe('fixed-sheet');
    expect(
      modularSheetTechnicalSpecSchema.parse({
        schemaVersion: 1,
        kind: 'modular-sheet',
        effectiveWidthMm: 1100,
        lengthModel: {
          kind: 'cut-to-length',
          minPanelLengthMm: 720,
          maxPanelLengthMm: 5970,
        },
        moduleLengthMm: 350,
      }).lengthModel.kind,
    ).toBe('cut-to-length');
  });

  it('parses standing seam with selectable effective widths and panel limits', () => {
    const parsed = standingSeamTechnicalSpecSchema.parse({
      schemaVersion: 1,
      kind: 'standing-seam',
      installationModes: [475, 355, 271].map((width) => ({
        id: `width-${width}`,
        effectiveWidthMm: width,
      })),
      minPanelLengthMm: 200,
      maxPanelLengthMm: 10_000,
      seamHeightMm: 32,
      minPitchDeg: 8,
      transverseOverlap: { minimumOverlapMm: 200, minPitchDeg: 14 },
    });
    expect(
      parsed.installationModes.map((mode) => mode.effectiveWidthMm),
    ).toEqual([475, 355, 271]);
  });

  it.each([
    [{ ...tile(), physicalWidthMm: Number.NaN }],
    [{ ...tile(), physicalLengthMm: -1 }],
    [
      {
        ...tile(),
        installationModes: [
          {
            id: 'bad',
            coverWidthMm: 180,
            gaugeRangeMm: { min: 330, max: 290 },
          },
        ],
      },
    ],
    [
      {
        schemaVersion: 1,
        kind: 'modular-sheet',
        effectiveWidthMm: 0,
        lengthModel: { kind: 'fixed-sheet', effectiveLengthMm: 700 },
        moduleLengthMm: 350,
      },
    ],
    [
      {
        schemaVersion: 1,
        kind: 'modular-sheet',
        effectiveWidthMm: 1100,
        lengthModel: { kind: 'fixed-sheet', effectiveLengthMm: -700 },
        moduleLengthMm: 350,
      },
    ],
    [
      {
        schemaVersion: 1,
        kind: 'standing-seam',
        installationModes: [{ id: 'wide', effectiveWidthMm: -475 }],
        minPanelLengthMm: 800,
        maxPanelLengthMm: 200,
        seamHeightMm: 32,
      },
    ],
  ])('rejects invalid finite/range/effective geometry', (candidate) => {
    expect(coveringTechnicalSpecSchema.safeParse(candidate).success).toBe(
      false,
    );
  });

  it('discriminates supported covering kinds and rejects unknown kinds', () => {
    expect(coveringTechnicalSpecSchema.parse(tile()).kind).toBe('roof-tile');
    expect(
      coveringTechnicalSpecSchema.safeParse({
        schemaVersion: 1,
        kind: 'generic-product',
      }).success,
    ).toBe(false);
  });

  it('round-trips catalogue and manual product snapshots through one contract', () => {
    const catalogued = coveringProductSelectionSchema.parse({
      catalogRef: {
        productId: 'product:opal',
        technicalRevisionId: 'technical-revision:2026-01',
        variantId: 'sku:brown',
      },
      displaySnapshot: {
        manufacturer: 'Example',
        familyName: 'Plain tile',
        variantName: 'Brown',
      },
      technicalSpecSnapshot: tile(),
    });
    const manual = coveringProductSelectionSchema.parse({
      technicalSpecSnapshot: tile(),
    });
    expect(catalogued.catalogRef?.technicalRevisionId).toBe(
      'technical-revision:2026-01',
    );
    expect(manual.catalogRef).toBeUndefined();
    expect(manual.technicalSpecSnapshot).toEqual(tile());
  });

  it('keeps the technical schema version stable and strips commercial price fields', () => {
    const parsed = coveringTechnicalSpecSchema.parse({
      ...tile(),
      price: 12.34,
      currency: 'PLN',
      sku: 'not-technical',
    });
    expect(parsed.schemaVersion).toBe(COVERING_TECHNICAL_SCHEMA_VERSION);
    expect(parsed).not.toHaveProperty('price');
    expect(parsed).not.toHaveProperty('currency');
    expect(parsed).not.toHaveProperty('sku');
  });

  it('validates minimum pitch and current batten gauge without changing either', () => {
    expect(
      checkCoveringCompatibility({
        productSpec: tile(),
        selectedInstallationModeId: 'scale',
        roofPitchDeg: 28,
        battenGaugeMm: 170,
      }),
    ).toEqual({
      status: 'incompatible',
      issues: [
        {
          code: 'below-minimum-pitch',
          severity: 'error',
          actual: 28,
          required: 30,
        },
        {
          code: 'batten-gauge-above-maximum',
          severity: 'error',
          actual: 170,
          maximum: 165,
        },
      ],
    });
    expect(
      checkCoveringCompatibility({
        productSpec: tile(),
        selectedInstallationModeId: 'crown',
        roofPitchDeg: 35,
        battenGaugeMm: 310,
      }).status,
    ).toBe('compatible');
  });

  it('reports missing mode or gauge as incomplete compatibility data', () => {
    expect(
      checkCoveringCompatibility({ productSpec: tile(), roofPitchDeg: 35 }),
    ).toMatchObject({
      status: 'incomplete',
      issues: [{ code: 'installation-mode-required' }],
    });
    expect(
      checkCoveringCompatibility({
        productSpec: tile(),
        selectedInstallationModeId: 'scale',
        roofPitchDeg: 35,
      }).issues,
    ).toContainEqual(
      expect.objectContaining({ code: 'batten-gauge-required' }),
    );
    expect(
      checkCoveringCompatibility({
        productSpec: standingSeamTechnicalSpecSchema.parse({
          schemaVersion: 1,
          kind: 'standing-seam',
          installationModes: [{ id: 'wide', effectiveWidthMm: 475 }],
          minPanelLengthMm: 200,
          maxPanelLengthMm: 10_000,
          seamHeightMm: 32,
          minPitchDeg: 8,
        }),
        roofPitchDeg: 25,
      }),
    ).toMatchObject({
      status: 'incomplete',
      issues: [{ code: 'installation-mode-required' }],
    });
  });

  it('validates a project assignment against stable installation mode IDs', () => {
    const assignment = coveringAssignmentSpecSchema.parse({
      id: 'covering:main',
      roofPlaneIds: ['roof-plane:left', 'roof-plane:right'],
      product: { technicalSpecSnapshot: tile() },
      selectedInstallationModeId: 'scale',
    });
    expect(assignment.roofPlaneIds).toHaveLength(2);
    expect(
      coveringAssignmentSpecSchema.safeParse({
        ...assignment,
        selectedInstallationModeId: 'missing',
      }).success,
    ).toBe(false);
  });
});
