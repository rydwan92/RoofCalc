import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  COVERING_TECHNICAL_SCHEMA_VERSION,
  checkCoveringCompatibility,
  coveringAssignmentSpecSchema,
  coveringProductSelectionSchema,
  coveringTechnicalSpecSchema,
  evaluateRoofTileInstallation,
  membraneOverlapRuleSchema,
  membraneProductFieldSchema,
  membraneTechnicalSpecSchema,
  modularSheetTechnicalSpecSchema,
  modularSheetLayoutIntentSchema,
  resolvePrimaryCoveringAssignments,
  roofTileLayoutIntentSchema,
  roofTileTechnicalSpecSchema,
  standingSeamTechnicalSpecSchema,
  tileInstallationModeSchema,
  type RoofTileTechnicalSpec,
  type CoveringQuantitySemantic,
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
  it('keeps purchase-piece outside the covering quantity vocabulary', () => {
    expectTypeOf<CoveringQuantitySemantic>().not.toEqualTypeOf<'purchase-piece'>();
  });

  it('keeps old V18 roof-tile snapshots parseable without guessing a course pattern', () => {
    const parsed = roofTileTechnicalSpecSchema.parse(tile());
    expect(parsed.installationModes[0]!.coursePattern).toBeUndefined();
  });

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

  it('accepts the V35 range/recommendation fields without disturbing V18 shape', () => {
    const parsed = roofTileTechnicalSpecSchema.parse({
      ...tile(),
      installationModes: [
        {
          ...tile().installationModes[0]!,
          coverWidthRangeMm: { min: 258, max: 261 },
          recommendedMinPitchDeg: 30,
        },
      ],
    });
    expect(parsed.installationModes[0]!.coverWidthRangeMm).toEqual({
      min: 258,
      max: 261,
    });
    expect(parsed.installationModes[0]!.recommendedMinPitchDeg).toBe(30);
    // Old V18/V19 snapshots (neither field present) still parse unchanged.
    const legacy = roofTileTechnicalSpecSchema.parse(tile());
    expect(legacy.installationModes[0]!.coverWidthRangeMm).toBeUndefined();
    expect(legacy.installationModes[0]!.recommendedMinPitchDeg).toBeUndefined();
  });

  it('rejects a recommended pitch below the enforced minimum', () => {
    expect(() =>
      tileInstallationModeSchema.parse({
        id: 'standard',
        coverWidthMm: 260,
        gaugeRangeMm: { min: 390, max: 430 },
        minPitchDeg: 30,
        recommendedMinPitchDeg: 10,
      }),
    ).toThrow();
  });

  it('accepts installationRules as schema/type only, unused by the compatibility engine', () => {
    const parsed = tileInstallationModeSchema.parse({
      id: 'standard',
      coverWidthMm: 300,
      gaugeRangeMm: { min: 312, max: 340 },
      installationRules: [
        {
          id: 'steep',
          pitchRangeDeg: { min: 25 },
          gaugeRangeMm: { min: 312, max: 320 },
        },
      ],
    });
    expect(parsed.installationRules).toHaveLength(1);
  });

  it('keeps minPitchDeg as the sole enforced compatibility floor', () => {
    const spec: RoofTileTechnicalSpec = {
      ...tile(),
      installationModes: [
        {
          ...tile().installationModes[0]!,
          minPitchDeg: 10,
          recommendedMinPitchDeg: 30,
        },
      ],
    };
    // Below the hard minimum: still a hard-constraint block, unchanged.
    const belowMinimum = evaluateRoofTileInstallation({
      productSpec: spec,
      selectedInstallationModeId: 'scale',
      roofPitchDeg: 8,
    });
    expect(belowMinimum.issues).toContainEqual(
      expect.objectContaining({
        code: 'below-minimum-pitch',
        category: 'hard-constraint',
      }),
    );
    // Between the hard minimum and the recommendation: compatible, but flagged.
    const belowRecommended = evaluateRoofTileInstallation({
      productSpec: spec,
      selectedInstallationModeId: 'scale',
      roofPitchDeg: 15,
    });
    expect(belowRecommended.issues).toContainEqual(
      expect.objectContaining({
        code: 'below-recommended-pitch',
        category: 'recommendation',
        actual: 15,
        required: 30,
      }),
    );
    expect(
      belowRecommended.issues.some(
        (issue) => issue.category === 'hard-constraint',
      ),
    ).toBe(false);
    // At/above the recommendation: no pitch issue at all.
    const atRecommended = evaluateRoofTileInstallation({
      productSpec: spec,
      selectedInstallationModeId: 'scale',
      roofPitchDeg: 30,
    });
    expect(
      atRecommended.issues.some(
        (issue) =>
          issue.code === 'below-minimum-pitch' ||
          issue.code === 'below-recommended-pitch',
      ),
    ).toBe(false);
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

  it('round-trips explicit tile layout intent while keeping it optional', () => {
    expect(
      roofTileLayoutIntentSchema.parse({
        kind: 'roof-tile',
        horizontalAlignment: 'manual',
        planeOffsetsMm: { 'roof-plane:left': 75 },
      }),
    ).toEqual({
      kind: 'roof-tile',
      horizontalAlignment: 'manual',
      planeOffsetsMm: { 'roof-plane:left': 75 },
    });
    expect(
      coveringAssignmentSpecSchema.parse({
        id: 'covering:legacy',
        roofPlaneIds: ['roof-plane:left'],
        product: { technicalSpecSnapshot: tile() },
      }).layoutIntent,
    ).toBeUndefined();
  });

  it('parses a kind-specific modular layout intent without reusing the tile schema', () => {
    expect(
      modularSheetLayoutIntentSchema.parse({
        kind: 'modular-sheet',
        horizontalAlignment: 'manual',
        planeOffsetsMm: { 'roof-plane:left': 50 },
      }),
    ).toMatchObject({ kind: 'modular-sheet', horizontalAlignment: 'manual' });
  });

  it('reports primary plane conflicts while preserving non-conflicted ownership', () => {
    const sheet = coveringAssignmentSpecSchema.parse({
      id: 'covering:sheet',
      roofPlaneIds: ['roof-plane:right'],
      layoutIntent: { kind: 'modular-sheet', horizontalAlignment: 'centered' },
      product: {
        technicalSpecSnapshot: {
          schemaVersion: 1,
          kind: 'modular-sheet',
          effectiveWidthMm: 1145,
          lengthModel: { kind: 'fixed-sheet', effectiveLengthMm: 700 },
          moduleLengthMm: 350,
        },
      },
    });
    const tileAssignment = coveringAssignmentSpecSchema.parse({
      id: 'covering:tile',
      roofPlaneIds: ['roof-plane:left', 'roof-plane:right'],
      product: { technicalSpecSnapshot: tile() },
    });
    expect(resolvePrimaryCoveringAssignments([tileAssignment, sheet])).toEqual({
      conflicts: [
        {
          roofPlaneId: 'roof-plane:right',
          assignmentIds: ['covering:sheet', 'covering:tile'],
        },
      ],
      conflictedAssignmentIds: ['covering:sheet', 'covering:tile'],
      trustedRoofPlaneIdsByAssignment: {
        'covering:tile': ['roof-plane:left'],
        'covering:sheet': [],
      },
    });
  });
});

describe('V35 membrane catalogue selection', () => {
  const membraneSpec = () =>
    membraneTechnicalSpecSchema.parse({
      schemaVersion: 1,
      kind: 'membrane',
      rollWidthMm: 1500,
      rollLengthMm: 50_000,
      minimumOverlapMm: 100,
    });

  it('accepts directional overlap rules without disturbing the flat baseline', () => {
    const rule = membraneOverlapRuleSchema.parse({
      direction: 'longitudinal',
      minimumOverlapMm: 100,
      pitchRangeDeg: { min: 10 },
      requiresSealing: false,
    });
    expect(rule.direction).toBe('longitudinal');
    const spec = membraneTechnicalSpecSchema.parse({
      ...membraneSpec(),
      overlapRules: [rule],
    });
    expect(spec.overlapRules).toHaveLength(1);
    // The V1 solver still reads only the flat baseline (unchanged).
    expect(spec.minimumOverlapMm).toBe(100);
  });

  it('normalizes a V34C raw spec into a V35 selection wrapper on parse', () => {
    const raw = membraneSpec();
    const normalized = membraneProductFieldSchema.parse(raw);
    expect(normalized).toEqual({ technicalSpecSnapshot: raw });
    expect(normalized.catalogRef).toBeUndefined();
  });

  it('parses a V35 selection wrapper unchanged', () => {
    const selection = {
      catalogRef: {
        productId: 'product:dorken:delta-maxx-plus',
        technicalRevisionId: 'revision:dorken:delta-maxx-plus:2026-09',
      },
      displaySnapshot: {
        manufacturer: 'DÖRKEN',
        familyName: 'DELTA-MAXX PLUS',
      },
      technicalSpecSnapshot: membraneSpec(),
    };
    expect(membraneProductFieldSchema.parse(selection)).toEqual(selection);
  });

  it('rejects a spec whose overlap never advances up-slope, same as before V35', () => {
    expect(
      membraneTechnicalSpecSchema.safeParse({
        ...membraneSpec(),
        minimumOverlapMm: 1500,
      }).success,
    ).toBe(false);
  });
});
