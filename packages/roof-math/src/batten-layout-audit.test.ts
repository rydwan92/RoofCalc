import { describe, expect, it } from 'vitest';
import type {
  BattenLayoutSpec,
  RoofTemplateSpec,
  RoofWindowFeature,
} from '@cieslacalc/timber-model';
import { assemblyDefaults } from './assembly';
import { resolveCounterBattenLayout } from './counter-battens';
import { gableTemplateFromAssembly } from './gable-roof';
import {
  resolveBattenLayout,
  resolveRoofPlaneBasis,
  roofPlaneIntervalsAtV,
  type BattenLayoutResult,
} from './roof-features';
import { resolveRoofSurfaceGeometry } from './roof-surface';
import { createRoofSkeleton } from './roof-template';

/**
 * V43B batten/counter-batten quantity audit.
 *
 * The production result is the exact sum of clipped row segments. These tests
 * cross-check it with an independent, deliberately different calculation so a
 * missing plane, a wrong local axis or a unit mistake cannot hide behind a
 * self-consistent total.
 */

const gable = (overrides: Partial<RoofTemplateSpec> = {}): RoofTemplateSpec =>
  ({
    ...gableTemplateFromAssembly(assemblyDefaults, {
      id: 'template:audit-gable',
      buildingLengthMm: 8000,
      rafterSpacing: { mode: 'max-even-spacing', spacingMm: 800 },
    }),
    ...overrides,
  }) as RoofTemplateSpec;

const hip = (overrides: Partial<RoofTemplateSpec> = {}): RoofTemplateSpec =>
  ({
    ...gableTemplateFromAssembly(assemblyDefaults, {
      id: 'template:audit-hip',
      buildingLengthMm: 12000,
      rafterSpacing: { mode: 'max-even-spacing', spacingMm: 800 },
    }),
    type: 'hip',
    hipRafterSection: { widthMm: 80, depthMm: 240 },
    ...overrides,
  }) as RoofTemplateSpec;

const layout = (
  overrides: Partial<BattenLayoutSpec> = {},
): BattenLayoutSpec => ({
  enabled: true,
  battenWidthMm: 60,
  battenHeightMm: 40,
  gaugeMm: 350,
  eaveOffsetMm: 250,
  ridgeOffsetMm: 40,
  ...overrides,
});

/**
 * Gauge ranges of three seeded roof-tile snapshots with different families
 * (apps/api/src/data/import-batches/tiles-2026-09*.json). Neutral numbers only:
 * roof-math never reads covering products.
 */
const SEEDED_RANGES = [
  { minimumGaugeMm: 390, maximumGaugeMm: 430 },
  { minimumGaugeMm: 338, maximumGaugeMm: 366 },
  { minimumGaugeMm: 355, maximumGaugeMm: 380 },
] as const;

/**
 * DIAGNOSTIC INVARIANT — not the solver.
 *
 * Every row stands for the band of roof half a gauge below and above it. On a
 * planar plane an eave-parallel slice width is linear in v, so the midpoint
 * rule is exact inside the band: `sum(row length) * gauge` equals the plane
 * area between `first - g/2` and `last + g/2`. What remains is the eave and
 * ridge boundary strip, bounded by its height times the widest slice. A
 * missing plane, a wrong u/v axis or a unit slip breaks this by far more.
 */
function expectAreaInvariant(
  template: RoofTemplateSpec,
  result: BattenLayoutResult,
) {
  const surface = resolveRoofSurfaceGeometry({ template, features: [] });
  for (const plane of result.planes) {
    const gauge = plane.actualGaugeMm!;
    const basis = resolveRoofPlaneBasis(template, plane.roofPlaneId);
    const minV = Math.min(...basis.polygon.map((point) => point.vMm));
    const maxV = Math.max(...basis.polygon.map((point) => point.vMm));
    const widest = Math.max(
      ...[minV + 1e-6, maxV - 1e-6].map((vMm) =>
        roofPlaneIntervalsAtV(template, plane.roofPlaneId, vMm).reduce(
          (sum, segment) => sum + segment.toUMm - segment.fromUMm,
          0,
        ),
      ),
    );
    const firstStation = plane.stations[0]!;
    const lastStation = plane.stations.at(-1)!;
    const eaveStrip = Math.abs(firstStation - gauge / 2 - minV);
    const ridgeStrip = Math.abs(maxV - (lastStation + gauge / 2));
    const toleranceMm2 = (eaveStrip + ridgeStrip) * widest + 1;
    const areaMm2 = surface.planes.find(
      (candidate) => candidate.roofPlaneId === plane.roofPlaneId,
    )!.grossAreaMm2;
    // Uneven last interval (manual gauge) is covered by the ridge strip.
    expect(Math.abs(plane.totalRowLengthMm * gauge - areaMm2)).toBeLessThan(
      toleranceMm2,
    );
    // Order-of-magnitude guard: never below half or above double area / gauge.
    const estimate = areaMm2 / gauge;
    expect(plane.totalRowLengthMm).toBeGreaterThan(estimate * 0.5);
    expect(plane.totalRowLengthMm).toBeLessThan(estimate * 2);
  }
}

/** Numerical assertions required for every audit fixture. */
function expectHealthyBattens(result: BattenLayoutResult) {
  const planeSum = result.planes.reduce(
    (sum, plane) => sum + plane.totalRowLengthMm,
    0,
  );
  const rowSum = result.battens.reduce(
    (sum, row) => sum + row.usableLengthMm,
    0,
  );
  const segmentSum = result.battens.reduce(
    (sum, row) =>
      sum +
      row.segments.reduce(
        (inner, segment) => inner + segment.toUMm - segment.fromUMm,
        0,
      ),
    0,
  );
  expect(result.totalLengthMm).toBeCloseTo(planeSum, 6);
  expect(result.totalLengthMm).toBeCloseTo(rowSum, 6);
  expect(result.totalLengthMm).toBeCloseTo(segmentSum, 6);
  expect(new Set(result.battens.map((row) => row.id)).size).toBe(
    result.battens.length,
  );
  for (const plane of result.planes) {
    const rows = result.battens.filter(
      (row) => row.roofPlaneId === plane.roofPlaneId,
    );
    expect(rows).toHaveLength(plane.courseCount);
    expect(rows.reduce((sum, row) => sum + row.usableLengthMm, 0)).toBeCloseTo(
      plane.totalRowLengthMm,
      6,
    );
    expect(Number.isFinite(plane.openingDeductionMm)).toBe(true);
    expect(plane.openingDeductionMm).toBeGreaterThanOrEqual(0);
    rows.forEach((row, index) => {
      expect(row.rowNumber).toBe(index + 1);
      if (index > 0)
        expect(row.stationMm).toBeGreaterThan(rows[index - 1]!.stationMm);
    });
  }
  for (const row of result.battens) {
    expect(Number.isFinite(row.usableLengthMm)).toBe(true);
    expect(row.usableLengthMm).toBeGreaterThanOrEqual(0);
    for (const segment of row.segments) {
      expect(segment.toUMm).toBeGreaterThan(segment.fromUMm);
    }
  }
}

describe('V43B batten quantity audit', () => {
  it('gable manual 350 mm: both planes, exact multiples and area invariant', () => {
    const roof = gable();
    const result = resolveBattenLayout({ template: roof, layout: layout() });
    expect(result.status).toBe('resolved');
    expect(result.scope.kind).toBe('whole-roof');
    expect(result.planes.map((plane) => plane.roofPlaneId)).toEqual([
      'roof-plane:left',
      'roof-plane:right',
    ]);
    expectHealthyBattens(result);
    expectAreaInvariant(roof, result);
    for (const plane of result.planes)
      plane.stations.forEach((station, index) =>
        // Exact multiple of the gauge: no float drift from repeated addition.
        expect(station).toBe(plane.firstStationMm + index * 350),
      );
    // Controlled fixture: 8 m eave, 5493 mm slope, first row at 250 mm and a
    // 40 mm ridge reference: floor(5203 / 350) + 1 = 15 rows per plane.
    expect(result.planes[0]!.courseCount).toBe(15);
    expect(result.totalLengthMm).toBeCloseTo(2 * 15 * 8000, 6);
  });

  it('gable Auto: whole intervals for three seeded tile ranges', () => {
    const roof = gable();
    for (const range of SEEDED_RANGES) {
      const result = resolveBattenLayout({
        template: roof,
        layout: layout({ mode: 'auto-from-covering' }),
        autoSource: { status: 'resolved', ...range },
      });
      expect(result.status).toBe('resolved');
      expectHealthyBattens(result);
      expectAreaInvariant(roof, result);
      for (const plane of result.planes) {
        const auto = plane.autoPlan!;
        expect(plane.stations[0]).toBe(plane.firstStationMm);
        expect(plane.stations.at(-1)).toBe(plane.lastStationMm);
        expect(auto.courseCount).toBe(auto.intervalCount + 1);
        expect(auto.actualGaugeMm * auto.intervalCount).toBeCloseTo(
          plane.regularSpanMm,
          6,
        );
        expect(auto.actualGaugeMm).toBeGreaterThanOrEqual(range.minimumGaugeMm);
        expect(auto.actualGaugeMm).toBeLessThanOrEqual(range.maximumGaugeMm);
        expect(Math.ceil(plane.regularSpanMm / range.maximumGaugeMm)).toBe(
          auto.minimumIntervalCount,
        );
      }
    }
  });

  it('hip Auto covers all four planes and every plane passes the invariant', () => {
    const roof = hip();
    const result = resolveBattenLayout({
      template: roof,
      layout: layout({ mode: 'auto-from-covering' }),
      autoSource: { status: 'resolved', ...SEEDED_RANGES[1] },
    });
    expect(result.status).toBe('resolved');
    expect(result.planes.map((plane) => plane.roofPlaneId).sort()).toEqual([
      'roof-plane:front',
      'roof-plane:left',
      'roof-plane:rear',
      'roof-plane:right',
    ]);
    expectHealthyBattens(result);
    expectAreaInvariant(roof, result);
    const surface = resolveRoofSurfaceGeometry({
      template: roof,
      features: [],
    });
    const gauge = result.planes[0]!.actualGaugeMm!;
    // Whole-roof sanity: within 10 % of area / gauge on this fixture.
    expect(result.totalLengthMm).toBeGreaterThan(
      (surface.grossAreaMm2 / gauge) * 0.9,
    );
    expect(result.totalLengthMm).toBeLessThan(
      (surface.grossAreaMm2 / gauge) * 1.1,
    );
  });

  it('documents the V43B field defect: a one-plane scope explains a ~27 % total', () => {
    const roof = hip({ halfRunMm: 7500, buildingLengthMm: 15000 } as never);
    const whole = resolveBattenLayout({ template: roof, layout: layout() });
    const narrowed = resolveBattenLayout({
      template: roof,
      layout: layout({ roofPlaneIds: ['roof-plane:left'] }),
    });
    expect(narrowed.scope).toMatchObject({
      kind: 'subset',
      roofPlaneIds: ['roof-plane:left'],
    });
    expect(whole.scope.kind).toBe('whole-roof');
    const share = narrowed.totalLengthMm / whole.totalLengthMm;
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.35);
  });

  it('hip opening: rows split truthfully without double subtraction', () => {
    const roof = hip();
    const window: RoofWindowFeature = {
      id: 'feature:roof-window-1',
      kind: 'roof-window',
      roofPlaneId: 'roof-plane:left',
      widthMm: 780,
      heightMm: 1180,
      position: { uMm: 4000, vMm: 1500 },
    };
    const overlapping: RoofWindowFeature = {
      ...window,
      id: 'feature:roof-window-2',
      position: { uMm: 4400, vMm: 1500 },
    };
    const plain = resolveBattenLayout({ template: roof, layout: layout() });
    const clipped = resolveBattenLayout({
      template: roof,
      layout: layout(),
      features: [window, overlapping],
    });
    expectHealthyBattens(clipped);
    const plane = clipped.planes.find(
      (candidate) => candidate.roofPlaneId === 'roof-plane:left',
    )!;
    const crossing = plane.stations.filter(
      (station) => station >= 1500 && station <= 2680,
    ).length;
    expect(crossing).toBeGreaterThan(0);
    // Union of the two openings is 1180 mm wide, not 1560 mm.
    expect(plane.openingDeductionMm).toBeCloseTo(crossing * 1180, 6);
    expect(plain.totalLengthMm - clipped.totalLengthMm).toBeCloseTo(
      crossing * 1180,
      6,
    );
    for (const row of clipped.battens.filter(
      (candidate) =>
        candidate.roofPlaneId === 'roof-plane:left' &&
        candidate.stationMm >= 1500 &&
        candidate.stationMm <= 2680,
    )) {
      expect(row.segments).toHaveLength(2);
      for (const segment of row.segments)
        expect(segment.toUMm <= 4000 || segment.fromUMm >= 5180).toBe(true);
    }
    // Other planes are untouched.
    for (const other of clipped.planes.filter(
      (candidate) => candidate.roofPlaneId !== 'roof-plane:left',
    ))
      expect(other.openingDeductionMm).toBe(0);
  });

  it('segments never leave their owning plane', () => {
    const roof = hip();
    const result = resolveBattenLayout({ template: roof, layout: layout() });
    for (const row of result.battens) {
      const extent = roofPlaneIntervalsAtV(
        roof,
        row.roofPlaneId,
        row.stationMm,
      );
      for (const segment of row.segments)
        expect(
          extent.some(
            (interval) =>
              segment.fromUMm >= interval.fromUMm - 1e-6 &&
              segment.toUMm <= interval.toUMm + 1e-6,
          ),
        ).toBe(true);
    }
  });
});

describe('V43B counter-batten quantity audit', () => {
  const section = { enabled: true, widthMm: 40, heightMm: 60 };

  it.each([
    ['not-decided', 'partial', 0],
    ['no-dedicated-run', 'resolved', 0],
    ['paired-plane-runs', 'resolved', 8],
  ] as const)(
    'hip %s: aggregate equals resolved runs',
    (detail, status, hipRuns) => {
      const roof = hip();
      const result = resolveCounterBattenLayout({
        template: roof,
        skeleton: createRoofSkeleton(roof),
        layout: { ...section, hipBoundaryDetail: detail },
      });
      expect(result.status).toBe(status);
      expect(result.hipBoundaryRunCount).toBe(hipRuns);
      expect(result.totalVisibleLengthMm).toBeCloseTo(
        result.rows.reduce((sum, row) => sum + row.visibleLengthMm, 0),
        6,
      );
      expect(new Set(result.rows.map((row) => row.id)).size).toBe(
        result.rows.length,
      );
      expect(result.roofPlaneIds.sort()).toEqual([
        'roof-plane:front',
        'roof-plane:left',
        'roof-plane:rear',
        'roof-plane:right',
      ]);
      for (const row of result.rows) {
        expect(Number.isFinite(row.visibleLengthMm)).toBe(true);
        expect(row.visibleLengthMm).toBeGreaterThan(0);
        expect(
          row.segments.reduce((sum, segment) => sum + segment.lengthMm, 0),
        ).toBeCloseTo(row.visibleLengthMm, 6);
      }
      expect(result.unresolvedHipBoundaryCount).toBe(
        detail === 'not-decided' ? 4 : 0,
      );
    },
  );

  it('opening splits intersecting axes and never keeps a segment inside it', () => {
    const roof = gable();
    const skeleton = createRoofSkeleton(roof);
    const plain = resolveCounterBattenLayout({
      template: roof,
      skeleton,
      layout: section,
    });
    const axis = plain.rows.find(
      (row) => row.roofPlaneId === 'roof-plane:left',
    )!;
    const uMm = axis.segments[0]!.fromLocal.uMm;
    const window: RoofWindowFeature = {
      id: 'feature:roof-window-1',
      kind: 'roof-window',
      roofPlaneId: 'roof-plane:left',
      widthMm: 600,
      heightMm: 1000,
      position: { uMm: uMm - 300, vMm: 2000 },
    };
    const clipped = resolveCounterBattenLayout({
      template: roof,
      skeleton,
      layout: section,
      features: [window],
    });
    const split = clipped.rows.find((row) => row.id === axis.id)!;
    expect(split.segments).toHaveLength(2);
    expect(axis.visibleLengthMm - split.visibleLengthMm).toBeCloseTo(1000, 6);
    for (const segment of split.segments)
      expect(
        segment.toLocal.vMm <= 2000 + 1e-6 ||
          segment.fromLocal.vMm >= 3000 - 1e-6,
      ).toBe(true);
    expect(
      plain.totalVisibleLengthMm - clipped.totalVisibleLengthMm,
    ).toBeCloseTo(1000, 6);
  });
});
