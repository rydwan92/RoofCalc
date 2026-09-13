import { describe, expect, it } from 'vitest';
import {
  createRoofTileQuantitySource,
  resolveRoofTileLayout,
  type RoofTileTechnicalSpec,
} from './index';

const rectanglePlane = (roofPlaneId = 'roof-plane:left') => ({
  roofPlaneId,
  pitchDeg: 35,
  localPolygon: [
    { uMm: 0, vMm: 0 },
    { uMm: 1000, vMm: 0 },
    { uMm: 1000, vMm: 1000 },
    { uMm: 0, vMm: 1000 },
  ],
  netAreaMm2: 1_000_000,
});

const battenRows = (roofPlaneId = 'roof-plane:left', spacing = 300) =>
  [100, 100 + spacing, 100 + spacing * 2].map((stationVMm, index) => ({
    id: `batten:${roofPlaneId}:${index + 1}`,
    roofPlaneId,
    stationVMm,
    segments: [{ fromUMm: 0, toUMm: 1000 }],
  }));

const tileWithPattern = (
  coursePattern: NonNullable<
    RoofTileTechnicalSpec['installationModes'][number]['coursePattern']
  >,
  overrides: Partial<RoofTileTechnicalSpec['installationModes'][number]> = {},
): RoofTileTechnicalSpec => ({
  schemaVersion: 1,
  kind: 'roof-tile',
  installationModes: [
    {
      id: 'standard',
      coverWidthMm: 300,
      gaugeRangeMm: { min: 250, max: 350 },
      coursePattern,
      minPitchDeg: 20,
      declaredUnitsPerM2: { min: 9.8, max: 10.7 },
      ...overrides,
    },
  ],
});

const straightPattern = {
  layers: [{ id: 'base', horizontalOffsetFraction: 0 }],
  battenRowOffsetCycle: [0],
};

function layoutFixture(
  overrides: Partial<Parameters<typeof resolveRoofTileLayout>[0]> = {},
) {
  return resolveRoofTileLayout({
    assignmentId: 'covering:main',
    roofPlaneIds: ['roof-plane:left'],
    roofSurfaceGeometry: [rectanglePlane()],
    openings: [],
    battens: battenRows(),
    productSpec: tileWithPattern(straightPattern),
    selectedInstallationModeId: 'standard',
    layoutIntent: { kind: 'roof-tile', horizontalAlignment: 'centered' },
    ...overrides,
  });
}

describe('roof tile coverage layout strategy', () => {
  it('reports a valid old snapshot as incomplete when placement pattern is absent', () => {
    const legacy: RoofTileTechnicalSpec = {
      schemaVersion: 1,
      kind: 'roof-tile',
      installationModes: [
        {
          id: 'legacy',
          coverWidthMm: 300,
          gaugeRangeMm: { min: 250, max: 350 },
        },
      ],
    };
    expect(
      layoutFixture({
        productSpec: legacy,
        selectedInstallationModeId: 'legacy',
      }),
    ).toMatchObject({
      status: 'incomplete',
      issueCodes: ['tile-placement-pattern-required'],
      totalPositions: 0,
    });
  });

  it('resolves a deterministic straight single-layer plane grid', () => {
    const first = layoutFixture();
    const second = layoutFixture();
    expect(first.status).toBe('resolved');
    expect(first.planes[0]!.courses).toHaveLength(3);
    expect(first.planes[0]!.horizontalOriginUMm).toBe(-100);
    expect(first.totalPositions).toBe(12);
    expect(
      first.planes[0]!.courses[0]!.positions.map((item) => item.id),
    ).toEqual(second.planes[0]!.courses[0]!.positions.map((item) => item.id));
    expect(
      first.planes[0]!.courses[0]!.positions.map((item) => item.columnIndex),
    ).toEqual([0, 1, 2, 3]);
  });

  it('keeps one global grid while alternating rows by half a cover width', () => {
    const layout = layoutFixture({
      productSpec: tileWithPattern({
        layers: [{ id: 'base', horizontalOffsetFraction: 0 }],
        battenRowOffsetCycle: [0, 0.5],
      }),
    });
    expect(
      layout.planes[0]!.courses.map(
        (course) => course.horizontalOffsetFraction,
      ),
    ).toEqual([0, 0.5, 0]);
    expect(layout.planes[0]!.courses[1]!.positions[0]!.nominalFromUMm).toBe(
      -250,
    );
  });

  it('represents two same-batten layers without duplicating canonical battens', () => {
    const layout = layoutFixture({
      productSpec: tileWithPattern({
        layers: [
          { id: 'lower', horizontalOffsetFraction: 0 },
          { id: 'upper', horizontalOffsetFraction: 0.5 },
        ],
        battenRowOffsetCycle: [0],
      }),
    });
    expect(layout.planes[0]!.courses).toHaveLength(6);
    expect(layout.planes[0]!.courses.map((course) => course.battenId)).toEqual([
      'batten:roof-plane:left:1',
      'batten:roof-plane:left:1',
      'batten:roof-plane:left:2',
      'batten:roof-plane:left:2',
      'batten:roof-plane:left:3',
      'batten:roof-plane:left:3',
    ]);
  });

  it('supports centered, from-start and manual plane origins', () => {
    expect(layoutFixture().planes[0]!.horizontalOriginUMm).toBe(-100);
    expect(
      layoutFixture({
        layoutIntent: {
          kind: 'roof-tile',
          horizontalAlignment: 'from-u-min',
        },
      }).planes[0]!.horizontalOriginUMm,
    ).toBe(0);
    expect(
      layoutFixture({
        layoutIntent: {
          kind: 'roof-tile',
          horizontalAlignment: 'manual',
          planeOffsetsMm: { 'roof-plane:left': 75 },
        },
      }).planes[0]!.horizontalOriginUMm,
    ).toBe(75);
  });

  it('clips narrowing hip rows to the same plane-level grid and marks edge cuts', () => {
    const hipPlane = {
      ...rectanglePlane('roof-plane:front'),
      localPolygon: [
        { uMm: 0, vMm: 0 },
        { uMm: 1000, vMm: 0 },
        { uMm: 500, vMm: 1000 },
      ],
      netAreaMm2: 500_000,
    };
    const layout = layoutFixture({
      roofPlaneIds: ['roof-plane:front'],
      roofSurfaceGeometry: [hipPlane],
      battens: battenRows('roof-plane:front'),
    });
    expect(layout.status).toBe('resolved');
    expect(layout.cutPositions).toBeGreaterThan(0);
    expect(layout.planes[0]!.courses.every(() => true)).toBe(true);
  });

  it('removes fully voided positions and preserves columns around openings', () => {
    const opening = {
      id: 'opening:1',
      roofPlaneId: 'roof-plane:left',
      fromUMm: 300,
      toUMm: 600,
      fromVMm: 0,
      toVMm: 1000,
    };
    const layout = layoutFixture({
      openings: [opening],
      layoutIntent: {
        kind: 'roof-tile',
        horizontalAlignment: 'from-u-min',
      },
    });
    expect(layout.totalPositions).toBe(9);
    expect(
      layout.planes[0]!.courses.flatMap((course) =>
        course.positions.map((position) => position.columnIndex),
      ),
    ).not.toContain(1);
  });

  it('classifies window-boundary cuts and split visible fragments', () => {
    const boundary = layoutFixture({
      openings: [
        {
          id: 'opening:boundary',
          roofPlaneId: 'roof-plane:left',
          fromUMm: 250,
          toUMm: 450,
          fromVMm: 0,
          toVMm: 1000,
        },
      ],
      layoutIntent: {
        kind: 'roof-tile',
        horizontalAlignment: 'from-u-min',
      },
    });
    expect(
      boundary.planes[0]!.courses[0]!.positions.map(
        (position) => position.columnIndex,
      ),
    ).toEqual([0, 1, 2, 3]);
    expect(boundary.cutPositions).toBeGreaterThan(0);

    const split = layoutFixture({
      openings: [
        {
          id: 'opening:split',
          roofPlaneId: 'roof-plane:left',
          fromUMm: 100,
          toUMm: 200,
          fromVMm: 0,
          toVMm: 1000,
        },
      ],
      layoutIntent: {
        kind: 'roof-tile',
        horizontalAlignment: 'from-u-min',
      },
    });
    expect(split.splitPositions).toBe(3);
    expect(
      split.planes[0]!.courses[0]!.positions[0]!.visibleFragments.length,
    ).toBe(2);
  });

  it('handles multiple openings and assigned planes in deterministic order', () => {
    const layout = layoutFixture({
      roofPlaneIds: ['roof-plane:right', 'roof-plane:left'],
      roofSurfaceGeometry: [
        rectanglePlane('roof-plane:right'),
        rectanglePlane('roof-plane:left'),
      ],
      battens: [
        ...battenRows('roof-plane:right'),
        ...battenRows('roof-plane:left'),
      ],
      openings: [
        {
          id: 'opening:b',
          roofPlaneId: 'roof-plane:right',
          fromUMm: 50,
          toUMm: 220,
          fromVMm: 200,
          toVMm: 450,
        },
        {
          id: 'opening:a',
          roofPlaneId: 'roof-plane:left',
          fromUMm: 400,
          toUMm: 700,
          fromVMm: 350,
          toVMm: 550,
        },
      ],
    });
    expect(layout.roofPlaneIds).toEqual([
      'roof-plane:left',
      'roof-plane:right',
    ]);
    expect(layout.planes.map((plane) => plane.roofPlaneId)).toEqual([
      'roof-plane:left',
      'roof-plane:right',
    ]);
    expect(layout.totalPositions).toBe(
      layout.planes.reduce((sum, plane) => sum + plane.totalPositions, 0),
    );
  });

  it('reports missing battens, actual gauge violations and low pitch without repair', () => {
    expect(layoutFixture({ battens: [] })).toMatchObject({
      status: 'incomplete',
      issueCodes: ['batten-layout-required'],
    });
    expect(
      layoutFixture({ battens: battenRows('roof-plane:left', 200) }),
    ).toMatchObject({
      status: 'incompatible',
      issueCodes: ['batten-gauge-below-minimum'],
    });
    expect(
      layoutFixture({ battens: battenRows('roof-plane:left', 400) }),
    ).toMatchObject({
      status: 'incompatible',
      issueCodes: ['batten-gauge-above-maximum'],
    });
    expect(
      layoutFixture({
        roofSurfaceGeometry: [{ ...rectanglePlane(), pitchDeg: 10 }],
      }),
    ).toMatchObject({
      status: 'incompatible',
      issueCodes: ['below-minimum-pitch'],
    });
  });

  it('exposes declared consumption only as an area cross-check', () => {
    expect(layoutFixture().declaredConsumptionReference).toEqual({
      netAssignedAreaMm2: 1_000_000,
      minimumPieces: 9.8,
      maximumPieces: 10.7,
    });
  });

  it('emits a trusted piece source only for a fully resolved layout', () => {
    const source = createRoofTileQuantitySource({ layout: layoutFixture() });
    expect(source).toMatchObject({
      unit: 'piece',
      quantity: 12,
      basis: 'roof-tile-geometric-coverage-position-v1',
    });
    expect(source).not.toHaveProperty('price');
    expect(
      createRoofTileQuantitySource({ layout: layoutFixture({ battens: [] }) }),
    ).toBeUndefined();
    expect(
      createRoofTileQuantitySource({
        layout: layoutFixture({ roofPlaneIds: [] }),
      }),
    ).toBeUndefined();
  });

  it('rejects non-finite geometry without leaking it into results', () => {
    const invalid = layoutFixture({
      battens: [
        {
          id: 'bad',
          roofPlaneId: 'roof-plane:left',
          stationVMm: Number.NaN,
          segments: [],
        },
      ],
    });
    expect(invalid.status).toBe('invalid');
    expect(invalid.totalPositions).toBe(0);
    expect(JSON.stringify(invalid)).not.toMatch(/NaN|Infinity/);
  });
});
