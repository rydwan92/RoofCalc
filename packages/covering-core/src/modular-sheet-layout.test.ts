import { describe, expect, it } from 'vitest';
import {
  createModularSheetQuantitySource,
  resolveModularSheetLayout,
  type ModularSheetTechnicalSpec,
} from './index';

const fixedSpec = (
  overrides: Partial<ModularSheetTechnicalSpec> = {},
): ModularSheetTechnicalSpec => ({
  schemaVersion: 1,
  kind: 'modular-sheet',
  effectiveWidthMm: 1000,
  totalWidthMm: 1080,
  lengthModel: {
    kind: 'fixed-sheet',
    effectiveLengthMm: 700,
    totalLengthMm: 725,
  },
  moduleLengthMm: 350,
  minPitchDeg: 9,
  material: 'steel',
  salesUnit: 'piece',
  ...overrides,
});

const plane = (roofPlaneId = 'roof-plane:left', width = 2000) => ({
  roofPlaneId,
  pitchDeg: 35,
  localPolygon: [
    { uMm: 0, vMm: 0 },
    { uMm: width, vMm: 0 },
    { uMm: width, vMm: 1400 },
    { uMm: 0, vMm: 1400 },
  ],
  netAreaMm2: width * 1400,
});

const battens = (roofPlaneId = 'roof-plane:left', spacing = 350) =>
  [0, spacing, spacing * 2, spacing * 3, spacing * 4].map(
    (stationVMm, index) => ({
      id: `batten:${roofPlaneId}:${index}`,
      roofPlaneId,
      stationVMm,
      segments: [{ fromUMm: 0, toUMm: 2000 }],
    }),
  );

function fixture(
  overrides: Partial<Parameters<typeof resolveModularSheetLayout>[0]> = {},
) {
  return resolveModularSheetLayout({
    assignmentId: 'covering:sheet-1',
    roofPlaneIds: ['roof-plane:left'],
    roofSurfaceGeometry: [plane()],
    openings: [],
    battens: battens(),
    productSpec: fixedSpec(),
    layoutIntent: { kind: 'modular-sheet', horizontalAlignment: 'centered' },
    ...overrides,
  });
}

describe('fixed modular sheet layout strategy', () => {
  it('uses a declared batten gauge and preserves the legacy module fallback', () => {
    const legacy = fixture({ battens: battens(undefined, 350) });
    expect(legacy.status).toBe('resolved');
    const declared = fixture({
      battens: battens(undefined, 330),
      productSpec: fixedSpec({ battenGaugeMm: 330 }),
    });
    expect(declared.status).toBe('resolved');
    const mismatch = fixture({
      battens: battens(undefined, 350),
      productSpec: fixedSpec({ battenGaugeMm: 330 }),
    });
    expect(mismatch.issues).toContainEqual(
      expect.objectContaining({
        code: 'module-batten-spacing-mismatch',
        required: 330,
        actual: 350,
      }),
    );
  });
  it('uses effective width and effective length as the deterministic grid', () => {
    const result = fixture();
    expect(result.status).toBe('resolved');
    expect(result.planes[0]!.rows).toHaveLength(2);
    expect(result.planes[0]!.rows[0]!.positions).toHaveLength(2);
    expect(result.planes[0]!.rows[1]!.nominalFromVMm).toBe(700);
    expect(result.planes[0]!.rows[0]!.positions[1]!.nominalFromUMm).toBe(1000);
    expect(result.totalPositions).toBe(4);
    expect(result.fullPositions).toBe(4);
  });

  it('supports centered, edge and manual horizontal origins', () => {
    const narrow = plane('roof-plane:left', 2300);
    expect(
      fixture({ roofSurfaceGeometry: [narrow] }).planes[0]!.horizontalOriginUMm,
    ).toBe(-350);
    expect(
      fixture({
        roofSurfaceGeometry: [narrow],
        layoutIntent: {
          kind: 'modular-sheet',
          horizontalAlignment: 'from-u-min',
        },
      }).planes[0]!.horizontalOriginUMm,
    ).toBe(0);
    expect(
      fixture({
        roofSurfaceGeometry: [narrow],
        layoutIntent: {
          kind: 'modular-sheet',
          horizontalAlignment: 'manual',
          planeOffsetsMm: { 'roof-plane:left': 80 },
        },
      }).planes[0]!.horizontalOriginUMm,
    ).toBe(80);
  });

  it('clips one coherent grid against a narrowing hip plane', () => {
    const hip = {
      ...plane('roof-plane:front'),
      localPolygon: [
        { uMm: 0, vMm: 0 },
        { uMm: 2000, vMm: 0 },
        { uMm: 1000, vMm: 1400 },
      ],
      netAreaMm2: 1_400_000,
    };
    const result = fixture({
      roofPlaneIds: ['roof-plane:front'],
      roofSurfaceGeometry: [hip],
      battens: battens('roof-plane:front'),
    });
    expect(result.status).toBe('resolved');
    expect(result.cutPositions).toBeGreaterThan(0);
    expect(
      result.planes[0]!.rows.map((row) =>
        row.positions.map((item) => item.columnIndex),
      ),
    ).toEqual([
      [0, 1],
      [0, 1],
    ]);
  });

  it('classifies opening cuts and split-by-opening sheets without moving the grid', () => {
    const opening = {
      id: 'opening:split',
      roofPlaneId: 'roof-plane:left',
      fromUMm: 400,
      toUMm: 600,
      fromVMm: 0,
      toVMm: 700,
    };
    const result = fixture({ openings: [opening] });
    const affected = result.planes[0]!.rows[0]!.positions[0]!;
    expect(affected.classification).toBe('split-by-opening');
    expect(affected.visibleFragments).toHaveLength(2);
    expect(result.openingAffectedPositions).toBe(1);
    expect(result.splitPositions).toBe(1);
  });

  it('supports several openings and stable ordering/IDs', () => {
    const openings = [
      {
        id: 'opening:b',
        roofPlaneId: 'roof-plane:left',
        fromUMm: 1200,
        toUMm: 1500,
        fromVMm: 800,
        toVMm: 1100,
      },
      {
        id: 'opening:a',
        roofPlaneId: 'roof-plane:left',
        fromUMm: 100,
        toUMm: 300,
        fromVMm: 100,
        toVMm: 300,
      },
    ];
    const first = fixture({ openings });
    const second = fixture({ openings: [...openings].reverse() });
    expect(first.openingAffectedPositions).toBe(2);
    expect(
      first.planes.flatMap((item) =>
        item.rows.flatMap((row) =>
          row.positions.map((position) => position.id),
        ),
      ),
    ).toEqual(
      second.planes.flatMap((item) =>
        item.rows.flatMap((row) =>
          row.positions.map((position) => position.id),
        ),
      ),
    );
  });

  it('resolves multiple planes independently in stable plane order', () => {
    const result = fixture({
      roofPlaneIds: ['roof-plane:right', 'roof-plane:left'],
      roofSurfaceGeometry: [plane('roof-plane:right'), plane()],
      battens: [...battens('roof-plane:right'), ...battens()],
    });
    expect(result.planes.map((item) => item.roofPlaneId)).toEqual([
      'roof-plane:left',
      'roof-plane:right',
    ]);
    expect(result.totalPositions).toBe(8);
  });

  it('reports minimum-pitch and module/batten incompatibility without approval language', () => {
    const result = fixture({
      roofSurfaceGeometry: [{ ...plane(), pitchDeg: 8 }],
      battens: battens('roof-plane:left', 360),
    });
    expect(result.status).toBe('incompatible');
    expect(result.issueCodes).toEqual([
      'below-minimum-pitch',
      'module-batten-spacing-mismatch',
    ]);
  });

  it('requires real resolved batten context', () => {
    expect(fixture({ battens: [] })).toMatchObject({
      status: 'incomplete',
      issueCodes: ['batten-layout-required'],
    });
    expect(fixture({ battens: battens().slice(0, 1) })).toMatchObject({
      status: 'incomplete',
      issueCodes: ['batten-course-spacing-required'],
    });
  });

  it('returns an explicit limited result for cut-to-length sheets', () => {
    const result = fixture({
      productSpec: fixedSpec({
        lengthModel: {
          kind: 'cut-to-length',
          minPanelLengthMm: 700,
          maxPanelLengthMm: 6000,
        },
      }),
    });
    expect(result).toMatchObject({
      status: 'limited',
      issueCodes: ['cut-to-length-not-supported'],
      totalPositions: 0,
    });
  });

  it('rejects non-finite geometry without leaking non-finite results', () => {
    const result = fixture({
      roofSurfaceGeometry: [
        { ...plane(), localPolygon: [{ uMm: Number.NaN, vMm: 0 }] },
      ],
    });
    expect(result.status).toBe('invalid');
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
  });

  it('emits typed coverage positions only for resolved fixed layouts', () => {
    const source = createModularSheetQuantitySource({ layout: fixture() });
    expect(source).toMatchObject({
      layoutKind: 'modular-sheet',
      semantic: 'effective-coverage-position',
      unit: 'coverage-position',
      quantity: 4,
      requirementReadiness: 'geometric-only',
    });
    expect(source?.warningKeys).toContain(
      'geometric-sheet-positions-not-purchase-quantity',
    );
    expect(
      createModularSheetQuantitySource({ layout: fixture({ battens: [] }) }),
    ).toBeUndefined();
  });
});
