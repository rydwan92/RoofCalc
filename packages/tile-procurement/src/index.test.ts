import { describe, expect, it } from 'vitest';
import {
  resolveRoofTileLayout,
  roofTileAccessoryTechnicalSpecSchema,
  roofTilePurchaseDecisionSchema,
  type CoveringOpeningGeometry,
  type CoveringRoofSurfaceGeometry,
  type RoofTileAccessorySelection,
  type RoofTilePurchaseDecision,
  type RoofTileTechnicalSpec,
} from '@cieslacalc/covering-core';
import {
  checkManufacturerConsumption,
  countVergeCourses,
  purchasedPieces,
  reservePieces,
  resolveAccessoryRequirements,
  resolveRoofTilePurchaseRequirement,
  roundToPackaging,
  tilePositionContribution,
} from './index';

/*
 * Controlled fixtures: 300 mm cover width, battens every 300 mm with the
 * first at 150 mm, so every course band is exactly 300 mm high and a
 * 900 × 900 mm plane is a 3 × 3 grid of full positions.
 */
const tile = (declared = { min: 10, max: 12 }): RoofTileTechnicalSpec => ({
  schemaVersion: 1,
  kind: 'roof-tile',
  installationModes: [
    {
      id: 'standard',
      coverWidthMm: 300,
      gaugeRangeMm: { min: 250, max: 350 },
      coursePattern: {
        layers: [{ id: 'base', horizontalOffsetFraction: 0 }],
        battenRowOffsetCycle: [0],
      },
      declaredUnitsPerM2: declared,
    },
  ],
});

function plane(
  roofPlaneId: string,
  localPolygon: CoveringRoofSurfaceGeometry['localPolygon'],
  netAreaMm2: number,
): CoveringRoofSurfaceGeometry {
  return { roofPlaneId, pitchDeg: 35, localPolygon, netAreaMm2 };
}

function battens(roofPlaneId: string, count: number, width: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `batten:${roofPlaneId}:${index + 1}`,
    roofPlaneId,
    stationVMm: 150 + index * 300,
    segments: [{ fromUMm: -width, toUMm: width * 2 }],
  }));
}

function layout(args: {
  planes: CoveringRoofSurfaceGeometry[];
  openings?: CoveringOpeningGeometry[];
  courses?: number;
  width?: number;
  declared?: { min: number; max: number };
}) {
  return resolveRoofTileLayout({
    assignmentId: 'covering:main',
    roofPlaneIds: args.planes.map((item) => item.roofPlaneId),
    roofSurfaceGeometry: args.planes,
    openings: args.openings ?? [],
    battens: args.planes.flatMap((item) =>
      battens(item.roofPlaneId, args.courses ?? 3, args.width ?? 900),
    ),
    productSpec: tile(args.declared),
    selectedInstallationModeId: 'standard',
    layoutIntent: { kind: 'roof-tile', horizontalAlignment: 'from-u-min' },
  });
}

const square = (id: string, size = 900) =>
  plane(
    id,
    [
      { uMm: 0, vMm: 0 },
      { uMm: size, vMm: 0 },
      { uMm: size, vMm: size },
      { uMm: 0, vMm: size },
    ],
    size * size,
  );

const decision = (
  overrides: Partial<RoofTilePurchaseDecision> = {},
): RoofTilePurchaseDecision => ({
  kind: 'roof-tile',
  cutPolicy: 'no-offcut-reuse',
  reserveBps: 0,
  ...overrides,
});

describe('V50 — full positions are exact', () => {
  it('simple all-full gable: physical tiles = full positions, status exact', () => {
    const result = layout({ planes: [square('left'), square('right')] });
    expect(result.status).toBe('resolved');
    expect(result.fullPositions).toBe(18);
    expect(result.cutPositions).toBe(0);
    const requirement = resolveRoofTilePurchaseRequirement(result, decision());
    expect(requirement).toMatchObject({
      status: 'exact',
      fullPositionCount: 18,
      cutPositionCount: 0,
      physicalBaseTileCount: 18,
      reservePieces: 0,
      requiredPieces: 18,
    });
    expect(requirement.limitations).toEqual(['packaging-not-set']);
  });

  it('a full position reserves exactly one tile', () => {
    expect(
      tilePositionContribution({
        classification: 'full',
        visibleFragments: [{ polygon: [] }],
      }),
    ).toEqual({ baseTiles: 1, basis: 'full-tile' });
  });
});

describe('V50 — cut positions are conservative, never exact', () => {
  it('edge-cut roof: full + cut positions → physical base tiles', () => {
    // 1000 mm wide: the fourth column is 100 mm of a 300 mm tile.
    const result = layout({
      planes: [
        plane(
          'left',
          [
            { uMm: 0, vMm: 0 },
            { uMm: 1000, vMm: 0 },
            { uMm: 1000, vMm: 900 },
            { uMm: 0, vMm: 900 },
          ],
          900_000,
        ),
      ],
      width: 1000,
    });
    const requirement = resolveRoofTilePurchaseRequirement(result, decision());
    expect(requirement.fullPositionCount).toBe(9);
    expect(requirement.edgeCutPositionCount).toBe(3);
    expect(requirement.physicalBaseTileCount).toBe(12);
    expect(requirement.status).toBe('conservative');
    expect(requirement.limitations).toContain('cuts-without-offcut-reuse');
  });

  it('hip roof: a triangular hip plane is cut along both hips', () => {
    const triangle = plane(
      'front',
      [
        { uMm: 0, vMm: 0 },
        { uMm: 1800, vMm: 0 },
        { uMm: 900, vMm: 900 },
      ],
      810_000,
    );
    const result = layout({ planes: [triangle], width: 1800 });
    const requirement = resolveRoofTilePurchaseRequirement(result, decision());
    expect(requirement.status).toBe('conservative');
    expect(requirement.edgeCutPositionCount).toBeGreaterThan(0);
    expect(requirement.physicalBaseTileCount).toBe(
      requirement.fullPositionCount + requirement.edgeCutPositionCount,
    );
    // A hip plane has no verge: no verge courses exist to finish.
    expect(countVergeCourses(result, [triangle]).total).toBe(0);
  });
});

describe('V50 — openings never produce a silent exact count', () => {
  const window = (overrides: Partial<CoveringOpeningGeometry> = {}) => ({
    id: 'feature:roof-window-1',
    roofPlaneId: 'left',
    fromUMm: 400,
    toUMm: 500,
    fromVMm: 250,
    toVMm: 650,
    ...overrides,
  });

  it('roof window: notched positions are cut-opening and conservative', () => {
    const result = layout({
      planes: [square('left')],
      openings: [window({ fromUMm: 300, toUMm: 600 })],
    });
    const requirement = resolveRoofTilePurchaseRequirement(result, decision());
    expect(requirement.openingCutPositionCount).toBeGreaterThan(0);
    expect(requirement.status).toBe('conservative');
  });

  it('split-by-opening: one tile per visible fragment, never exact', () => {
    const result = layout({ planes: [square('left')], openings: [window()] });
    const requirement = resolveRoofTilePurchaseRequirement(result, decision());
    expect(requirement.splitPositionCount).toBe(1);
    expect(requirement.splitFragmentCount).toBe(2);
    expect(requirement.status).toBe('conservative');
    expect(requirement.limitations).toContain('split-fragments-one-tile-each');
    expect(requirement.physicalBaseTileCount).toBe(
      requirement.fullPositionCount +
        requirement.edgeCutPositionCount +
        requirement.openingCutPositionCount +
        requirement.splitFragmentCount,
    );
  });

  it('adding and removing an opening changes the requirement and back', () => {
    const without = resolveRoofTilePurchaseRequirement(
      layout({ planes: [square('left')] }),
      decision(),
    );
    const withOpening = resolveRoofTilePurchaseRequirement(
      layout({ planes: [square('left')], openings: [window()] }),
      decision(),
    );
    expect(without.status).toBe('exact');
    expect(withOpening.status).toBe('conservative');
    expect(withOpening.physicalBaseTileCount).toBe(10);
    expect(
      resolveRoofTilePurchaseRequirement(
        layout({ planes: [square('left')] }),
        decision(),
      ),
    ).toEqual(without);
  });
});

describe('V50 — user reserve is explicit', () => {
  it('reserve 0 % adds nothing', () => {
    expect(reservePieces(2070, 0)).toBe(0);
  });

  it('reserve 2 % of 2070 rounds up to 42 whole tiles', () => {
    expect(reservePieces(2070, 200)).toBe(42);
  });

  it('reserve 5 % is added on top of the geometry, shown separately', () => {
    const requirement = resolveRoofTilePurchaseRequirement(
      layout({ planes: [square('left', 1800)], courses: 6, width: 1800 }),
      decision({ reserveBps: 500 }),
    );
    expect(requirement.physicalBaseTileCount).toBe(36);
    expect(requirement.reservePieces).toBe(2);
    expect(requirement.requiredPieces).toBe(38);
  });

  it('rejects an invalid reserve', () => {
    expect(() => reservePieces(10, -1)).toThrow();
    expect(() => reservePieces(10, 1.5)).toThrow();
  });
});

describe('V50 — commercial packaging', () => {
  it('203 pieces at 20 per pack → 11 packs, 220 pieces, 17 overage', () => {
    expect(
      roundToPackaging(203, { saleUnit: 'pack', piecesPerUnit: 20 }),
    ).toEqual({
      saleUnit: 'pack',
      piecesPerUnit: 20,
      units: 11,
      purchasedPieces: 220,
      commercialOveragePieces: 17,
    });
  });

  it('piece sale unit buys exactly the requirement', () => {
    expect(
      roundToPackaging(203, { saleUnit: 'piece', piecesPerUnit: 1 }),
    ).toMatchObject({ units: 203, commercialOveragePieces: 0 });
  });

  it('rejects 0, negative and non-finite pieces per unit', () => {
    for (const piecesPerUnit of [0, -4, Number.NaN, Infinity, 2.5])
      expect(() =>
        roundToPackaging(203, { saleUnit: 'pack', piecesPerUnit }),
      ).toThrow('invalid_pieces_per_unit');
    expect(() =>
      roundToPackaging(203, { saleUnit: 'piece', piecesPerUnit: 4 }),
    ).toThrow();
  });

  it('the schema refuses the same invalid packaging', () => {
    for (const piecesPerUnit of [0, -1, Number.NaN, Infinity])
      expect(
        roofTilePurchaseDecisionSchema.safeParse(
          decision({
            packaging: { saleUnit: 'pack', piecesPerUnit, source: 'manual' },
          }),
        ).success,
      ).toBe(false);
  });

  it('the purchase uses the packaged count', () => {
    const requirement = resolveRoofTilePurchaseRequirement(
      layout({ planes: [square('left'), square('right')] }),
      decision({
        packaging: { saleUnit: 'pack', piecesPerUnit: 4, source: 'catalog' },
      }),
    );
    expect(requirement.purchase).toMatchObject({
      units: 5,
      purchasedPieces: 20,
      commercialOveragePieces: 2,
    });
    expect(purchasedPieces(requirement)).toBe(20);
  });

  it('an unresolved layout never yields a purchase quantity', () => {
    const unresolved = resolveRoofTilePurchaseRequirement(
      { ...layout({ planes: [square('left')] }), status: 'incompatible' },
      decision({
        packaging: { saleUnit: 'pack', piecesPerUnit: 4, source: 'catalog' },
      }),
    );
    expect(unresolved.status).toBe('unresolved');
    expect(unresolved.purchase).toBeUndefined();
    expect(purchasedPieces(unresolved)).toBeUndefined();
  });
});

describe('V50 — manufacturer consumption is a cross-check only', () => {
  it('reports within range without touching the count', () => {
    // 9 tiles on 0.81 m² = 11.1 szt./m², declared 10–12.
    const result = layout({ planes: [square('left')] });
    const requirement = resolveRoofTilePurchaseRequirement(result, decision());
    expect(requirement.manufacturerCheck?.verdict).toBe('within');
    expect(requirement.physicalBaseTileCount).toBe(9);
  });

  it('reports outside range and still does not force the values', () => {
    const result = layout({
      planes: [square('left')],
      declared: { min: 8, max: 9 },
    });
    const requirement = resolveRoofTilePurchaseRequirement(result, decision());
    expect(requirement.manufacturerCheck?.verdict).toBe('above');
    expect(requirement.physicalBaseTileCount).toBe(9);
    expect(
      checkManufacturerConsumption({
        physicalBaseTileCount: 5,
        netAreaMm2: 1_000_000,
        declaredMinimumPieces: 9.5,
        declaredMaximumPieces: 10.1,
      })?.verdict,
    ).toBe('below');
  });

  it('product change: a different declared range changes only the check', () => {
    const a = resolveRoofTilePurchaseRequirement(
      layout({ planes: [square('left')], declared: { min: 10, max: 12 } }),
      decision(),
    );
    const b = resolveRoofTilePurchaseRequirement(
      layout({ planes: [square('left')], declared: { min: 8, max: 9 } }),
      decision(),
    );
    expect(a.physicalBaseTileCount).toBe(b.physicalBaseTileCount);
    expect(a.manufacturerCheck?.verdict).not.toBe(b.manufacturerCheck?.verdict);
  });
});

describe('V50 — system accessories (declared semantics only)', () => {
  const accessory = (
    role: RoofTileAccessorySelection['role'],
    spec: Partial<RoofTileAccessorySelection['technicalSpecSnapshot']>,
    extra: Partial<RoofTileAccessorySelection> = {},
  ): RoofTileAccessorySelection => ({
    role,
    catalogRef: {
      productId: `accessory:${role}`,
      technicalRevisionId: `rev:${role}`,
    },
    technicalSpecSnapshot: roofTileAccessoryTechnicalSpecSchema.parse({
      schemaVersion: 1,
      kind: 'roof-tile-accessory',
      roles: [role],
      compatibleProductIds: ['product:tile'],
      ...spec,
    }),
    ...extra,
  });
  const gable = [square('left'), square('right')];
  const resolved = layout({ planes: gable });
  const lines = { ridgeMm: 10_050, hipMm: 0, complete: true };

  it('ridge from effective cover length: 10.05 m / 400 mm → 26', () => {
    const [ridge] = resolveAccessoryRequirements({
      layout: resolved,
      surfaces: gable,
      lines,
      accessories: [accessory('ridge', { effectiveCoverLengthMm: 400 })],
      tileProductId: 'product:tile',
    });
    expect(ridge).toMatchObject({
      role: 'ridge',
      status: 'resolved',
      basis: 'effective-cover-length',
      quantity: 26,
    });
  });

  it('ridge from an approximate declared 2.5 szt./mb stays approximate', () => {
    const [ridge] = resolveAccessoryRequirements({
      layout: resolved,
      surfaces: gable,
      lines,
      accessories: [
        accessory('ridge', {
          declaredUnitsPerMetre: { value: 2.5, approximate: true },
        }),
      ],
      tileProductId: 'product:tile',
    });
    expect(ridge).toMatchObject({
      status: 'declared-approximate',
      quantity: 26,
    });
  });

  it('an incompatible accessory is never counted', () => {
    const [ridge] = resolveAccessoryRequirements({
      layout: resolved,
      surfaces: gable,
      lines,
      accessories: [accessory('ridge', { effectiveCoverLengthMm: 400 })],
      tileProductId: 'product:other',
    });
    expect(ridge).toMatchObject({
      status: 'requires-decision',
      reason: 'accessory-not-compatible',
    });
    expect(ridge!.quantity).toBeUndefined();
  });

  it('hip lines need a hip-ridge role; a ridge-only accessory does not fill it', () => {
    const requirements = resolveAccessoryRequirements({
      layout: resolved,
      surfaces: gable,
      lines: { ridgeMm: 4000, hipMm: 12_000, complete: true },
      accessories: [accessory('ridge', { effectiveCoverLengthMm: 400 })],
      tileProductId: 'product:tile',
    });
    expect(
      requirements.find((item) => item.role === 'hip-ridge'),
    ).toMatchObject({
      status: 'requires-decision',
      reason: 'no-accessory-selected',
    });
  });

  it('verges: one per course when declared, from the resolved courses', () => {
    const requirements = resolveAccessoryRequirements({
      layout: resolved,
      surfaces: gable,
      lines,
      accessories: [
        accessory('verge-left', { quantityRule: 'one-per-course' }),
        accessory('verge-right', { quantityRule: 'one-per-course' }),
      ],
      tileProductId: 'product:tile',
    });
    // Two planes × three courses, one verge of each side per course.
    expect(
      requirements
        .filter((item) => item.role.startsWith('verge'))
        .map((item) => [item.role, item.status, item.quantity]),
    ).toEqual([
      ['verge-left', 'resolved', 6],
      ['verge-right', 'resolved', 6],
    ]);
  });

  it('verges without a declared rule require a decision until the user confirms', () => {
    const undeclared = resolveAccessoryRequirements({
      layout: resolved,
      surfaces: gable,
      lines,
      accessories: [accessory('verge-left', {})],
      tileProductId: 'product:tile',
    }).find((item) => item.role === 'verge-left');
    expect(undeclared).toMatchObject({
      status: 'requires-decision',
      reason: 'verge-rule-not-declared',
      courseCount: 6,
    });
    const confirmed = resolveAccessoryRequirements({
      layout: resolved,
      surfaces: gable,
      lines,
      accessories: [
        accessory('verge-left', {}, { userConfirmedRule: 'one-per-course' }),
      ],
      tileProductId: 'product:tile',
    }).find((item) => item.role === 'verge-left');
    expect(confirmed).toMatchObject({
      status: 'resolved',
      basis: 'one-per-course-user-confirmed',
      quantity: 6,
    });
  });

  it('a shared ridge line is not owned by one assignment', () => {
    const [ridge] = resolveAccessoryRequirements({
      layout: resolved,
      surfaces: gable,
      lines: { ...lines, complete: false },
      accessories: [accessory('ridge', { effectiveCoverLengthMm: 400 })],
      tileProductId: 'product:tile',
    });
    expect(ridge!.reason).toBe('line-shared-with-another-covering');
  });

  it('the accessory schema refuses two length semantics at once', () => {
    expect(
      roofTileAccessoryTechnicalSpecSchema.safeParse({
        schemaVersion: 1,
        kind: 'roof-tile-accessory',
        roles: ['ridge'],
        compatibleProductIds: ['p'],
        effectiveCoverLengthMm: 400,
        declaredUnitsPerMetre: { value: 2.5, approximate: true },
      }).success,
    ).toBe(false);
  });
});
