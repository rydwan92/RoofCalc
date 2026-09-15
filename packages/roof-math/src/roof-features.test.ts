import { describe, expect, it } from 'vitest';
import type { RoofWindowFeature } from '@cieslacalc/timber-model';
import { assemblyDefaults } from './assembly';
import { gableTemplateFromAssembly } from './gable-roof';
import { createRoofSkeleton } from './roof-template';
import {
  alignRoofWindows,
  clampRoofWindow,
  createDefaultRoofWindow,
  distributeRoofWindowsAlongEave,
  placeRoofWindowBetweenRafters,
  projectPlaneLocalToWorld,
  projectPlaneWorldToLocal,
  resolveBattenLayout,
  resolveMembraneLayout,
  resolveRoofFeatureCollisions,
  resolveRoofWindowAlignmentSnap,
  resolveRoofWindowPlacement,
  resolveRoofPlaneBasis,
} from './roof-features';

const template = () =>
  gableTemplateFromAssembly(assemblyDefaults, {
    id: 'template:gable-1',
    buildingLengthMm: 8100,
    rafterSpacing: { mode: 'max-even-spacing', spacingMm: 1000 },
  });
const window = (position: { uMm: number; vMm: number }): RoofWindowFeature => ({
  id: 'feature:roof-window-1',
  kind: 'roof-window',
  roofPlaneId: 'roof-plane:left',
  widthMm: 780,
  heightMm: 1180,
  position,
});

describe('roof feature geometry', () => {
  it('round-trips gable and hip local roof-plane coordinates without pixels', () => {
    const gable = template();
    const local = { uMm: 1300.25, vMm: 2200.5 };
    const world = projectPlaneLocalToWorld(
      resolveRoofPlaneBasis(gable, 'roof-plane:left'),
      local,
    );
    expect(
      projectPlaneWorldToLocal(
        resolveRoofPlaneBasis(gable, 'roof-plane:left'),
        world,
      ),
    ).toEqual(local);
    const hip = {
      ...gable,
      type: 'hip' as const,
      id: 'template:hip-1',
      buildingLengthMm: 10000,
      hipRafterSection: { widthMm: 100, depthMm: 240 },
    };
    const hipWorld = projectPlaneLocalToWorld(
      resolveRoofPlaneBasis(hip, 'roof-plane:front'),
      local,
    );
    expect(
      projectPlaneWorldToLocal(
        resolveRoofPlaneBasis(hip, 'roof-plane:front'),
        hipWorld,
      ),
    ).toEqual(local);
  });

  it('creates and clamps a serializable window within its roof plane', () => {
    const created = createDefaultRoofWindow(template());
    expect(created.id).toBe('feature:roof-window-1');
    expect(
      clampRoofWindow(template(), {
        ...created,
        position: { uMm: -1000, vMm: -1000 },
      }).position,
    ).not.toEqual({ uMm: -1000, vMm: -1000 });
    expect(() =>
      clampRoofWindow(template(), { ...created, widthMm: 0 }),
    ).toThrow('invalid_roof_window_size');
  });

  it('detects rafter intersections and finds the nearest clear bay', () => {
    const roof = template();
    const skeleton = createRoofSkeleton(roof);
    const collision = resolveRoofFeatureCollisions({
      template: roof,
      skeleton,
      feature: window({ uMm: 0, vMm: 1200 }),
    });
    expect(collision).toHaveLength(1);
    expect(collision[0]!.memberInstanceId).toContain('rafter-pair-1:left');
    const placed = placeRoofWindowBetweenRafters({
      template: roof,
      skeleton,
      feature: window({ uMm: 100, vMm: 1200 }),
    });
    expect(placed?.memberInstanceIds).toHaveLength(2);
    expect(
      resolveRoofFeatureCollisions({
        template: roof,
        skeleton,
        feature: placed!.feature,
      }),
    ).toEqual([]);
  });

  it('reports a too-wide geometric opening using clear face-to-face bay width', () => {
    const roof = template();
    const skeleton = createRoofSkeleton(roof);
    const feature = { ...window({ uMm: 100, vMm: 1200 }), clearanceMm: 30 };
    const placement = resolveRoofWindowPlacement({
      template: roof,
      skeleton,
      feature,
    });
    expect(placement).toMatchObject({
      placed: false,
      reason: 'opening-too-wide',
      requiredWidthMm: 840,
    });
    if (placement.placed || !placement.nearestBay)
      throw new Error('expected nearest bay');
    expect(placement.nearestBay.availableWidthMm).toBe(820);
  });

  it('projects deterministic batten rows and splits rows intersecting a roof window', () => {
    const roof = template();
    const layout = {
      enabled: true,
      roofPlaneIds: ['roof-plane:left'],
      battenHeightMm: 40,
      battenWidthMm: 60,
      gaugeMm: 350,
      eaveOffsetMm: 250,
    };
    const withoutWindow = resolveBattenLayout({ template: roof, layout });
    const withWindow = resolveBattenLayout({
      template: roof,
      layout,
      features: [window({ uMm: 1000, vMm: 900 })],
    });
    expect(withoutWindow.battens[0]?.stationMm).toBe(250);
    expect(withoutWindow.battens).toHaveLength(withWindow.battens.length);
    expect(
      withWindow.battens.some((batten) => batten.segments.length === 2),
    ).toBe(true);
    expect(withWindow.totalLengthMm).toBeLessThan(withoutWindow.totalLengthMm);
  });

  it('clips multiple geometric openings at an exact row station without persisting rows', () => {
    const roof = template();
    const layout = {
      enabled: true,
      roofPlaneIds: ['roof-plane:left'],
      battenHeightMm: 40,
      battenWidthMm: 60,
      gaugeMm: 350,
      eaveOffsetMm: 900,
    };
    const result = resolveBattenLayout({
      template: roof,
      layout,
      features: [
        window({ uMm: 1000, vMm: 900 }),
        { ...window({ uMm: 2200, vMm: 900 }), id: 'feature:roof-window-2' },
      ],
    });
    expect(result.battens[0]).toMatchObject({ stationMm: 900 });
    expect(result.battens[0]!.segments).toHaveLength(3);
    expect(result.totalLengthMm).toBe(
      result.battens.reduce((total, row) => total + row.usableLengthMm, 0),
    );
  });

  it('fits automatic rows per plane to exact eave and ridge references', () => {
    const roof = template();
    const result = resolveBattenLayout({
      template: roof,
      layout: {
        enabled: true,
        mode: 'auto-from-covering',
        roofPlaneIds: ['roof-plane:left', 'roof-plane:right'],
        battenHeightMm: 40,
        battenWidthMm: 60,
        gaugeMm: 347,
        eaveOffsetMm: 250,
        ridgeOffsetMm: 120,
      },
      autoSource: {
        status: 'resolved',
        minimumGaugeMm: 320,
        maximumGaugeMm: 380,
        preferredGaugeMm: 350,
      },
    });
    expect(result.status).toBe('resolved');
    expect(result.mode).toBe('auto-from-covering');
    expect(result.planes).toHaveLength(2);
    for (const plane of result.planes) {
      expect(plane.stations[0]).toBe(plane.firstStationMm);
      expect(plane.stations.at(-1)).toBe(plane.lastStationMm);
      expect(plane.actualGaugeMm).toBeGreaterThanOrEqual(320);
      expect(plane.actualGaugeMm).toBeLessThanOrEqual(380);
      expect(plane.courseCount).toBe(plane.intervalCount! + 1);
    }
    expect(result.battens).toHaveLength(
      result.planes.reduce((sum, plane) => sum + plane.courseCount, 0),
    );
  });

  it('keeps automatic source problems explicit instead of falling back to manual gauge', () => {
    const roof = template();
    const base = {
      enabled: true,
      mode: 'auto-from-covering' as const,
      battenHeightMm: 40,
      battenWidthMm: 60,
      gaugeMm: 350,
      eaveOffsetMm: 250,
    };
    expect(resolveBattenLayout({ template: roof, layout: base })).toMatchObject(
      {
        status: 'incomplete',
        mode: 'auto-from-covering',
        battens: [],
        issues: ['auto-source-missing'],
      },
    );
    expect(
      resolveBattenLayout({
        template: roof,
        layout: base,
        autoSource: { status: 'conflict' },
      }),
    ).toMatchObject({
      status: 'incomplete',
      issues: ['auto-source-conflict'],
    });
  });

  it('treats a legacy layout with no mode as manual', () => {
    const roof = template();
    const result = resolveBattenLayout({
      template: roof,
      layout: {
        enabled: true,
        battenHeightMm: 40,
        battenWidthMm: 60,
        gaugeMm: 350,
        eaveOffsetMm: 250,
      },
    });
    expect(result.mode).toBe('manual');
    expect(result.status).toBe('resolved');
    expect(result.planes[0]?.actualGaugeMm).toBe(350);
  });

  it('rejects non-finite or non-positive batten geometry before row iteration', () => {
    const roof = template();
    expect(
      resolveBattenLayout({
        template: roof,
        layout: {
          enabled: true,
          battenHeightMm: 40,
          battenWidthMm: 60,
          gaugeMm: Number.NaN,
          eaveOffsetMm: 0,
        },
      }),
    ).toMatchObject({
      status: 'incomplete',
      battens: [],
      issues: ['invalid-batten-gauge'],
    });
  });

  it.each([
    ['lower-edge', 900, 900],
    ['centre', 900, 600],
    ['upper-edge', 900, 300],
  ] as const)(
    'aligns different-height windows by the %s plane-local reference',
    (mode, anchorV, expectedOtherV) => {
      const roof = template();
      const anchor = {
        ...window({ uMm: 1000, vMm: anchorV }),
        id: 'feature:roof-window-1',
        heightMm: 1200,
      };
      const other = {
        ...window({ uMm: 2200, vMm: 1400 }),
        id: 'feature:roof-window-2',
        heightMm: 1800,
      };
      const result = alignRoofWindows({
        template: roof,
        windows: [anchor, other],
        anchorFeatureId: anchor.id,
        mode,
      });
      expect(result.status).toBe('ready');
      if (result.status !== 'ready') throw new Error('expected proposal');
      expect(result.changes[0]!.proposedPosition).toEqual(anchor.position);
      expect(result.changes[1]!.proposedPosition).toEqual({
        uMm: other.position.uMm,
        vMm: expectedOtherV,
      });
    },
  );

  it('rejects cross-plane and impossible alignment explicitly', () => {
    const roof = template();
    const anchor = window({ uMm: 1000, vMm: 0 });
    const other = {
      ...window({ uMm: 2000, vMm: 1000 }),
      id: 'feature:roof-window-2',
    };
    expect(
      alignRoofWindows({
        template: roof,
        windows: [anchor, { ...other, roofPlaneId: 'roof-plane:right' }],
        anchorFeatureId: anchor.id,
        mode: 'lower-edge',
      }),
    ).toMatchObject({
      status: 'rejected',
      reason: 'cross-plane-selection',
    });
    expect(
      alignRoofWindows({
        template: roof,
        windows: [anchor, { ...other, heightMm: 3000 }],
        anchorFeatureId: anchor.id,
        mode: 'upper-edge',
      }),
    ).toMatchObject({
      status: 'rejected',
      reason: 'alignment-does-not-fit',
      featureId: other.id,
    });
  });

  it('distributes different widths with equal clear gaps and fixed outer anchors', () => {
    const roof = template();
    const windows = [
      { ...window({ uMm: 1000, vMm: 900 }), widthMm: 500 },
      {
        ...window({ uMm: 1900, vMm: 900 }),
        id: 'feature:roof-window-2',
        widthMm: 800,
      },
      {
        ...window({ uMm: 3200, vMm: 900 }),
        id: 'feature:roof-window-3',
        widthMm: 600,
      },
      {
        ...window({ uMm: 4600, vMm: 900 }),
        id: 'feature:roof-window-4',
        widthMm: 700,
      },
    ];
    const result = distributeRoofWindowsAlongEave({ template: roof, windows });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('expected proposal');
    expect(result.clearGapMm).toBeCloseTo(566.666_666_7);
    expect(result.changes.map((change) => change.proposedPosition.uMm)).toEqual(
      [1000, 2066.666_666_666_666_5, 3433.333_333_333_333, 4600],
    );
    expect(result.changes[0]!.proposedPosition).toEqual(windows[0]!.position);
    expect(result.changes.at(-1)!.proposedPosition).toEqual(
      windows.at(-1)!.position,
    );
  });

  it('requires at least three same-plane windows for distribution', () => {
    const roof = template();
    const first = window({ uMm: 1000, vMm: 900 });
    const second = {
      ...window({ uMm: 2200, vMm: 900 }),
      id: 'feature:roof-window-2',
    };
    expect(
      distributeRoofWindowsAlongEave({
        template: roof,
        windows: [first, second],
      }),
    ).toMatchObject({ status: 'rejected', reason: 'not-enough-windows' });
    expect(
      distributeRoofWindowsAlongEave({
        template: roof,
        windows: [
          first,
          second,
          {
            ...second,
            id: 'feature:roof-window-3',
            roofPlaneId: 'roof-plane:right',
          },
        ],
      }),
    ).toMatchObject({
      status: 'rejected',
      reason: 'cross-plane-selection',
    });
  });

  it.each([
    ['lower-edge', 1000, 600, 1000],
    ['centre', 800, 800, 1000],
    ['upper-edge', 600, 800, 1000],
  ] as const)(
    'snaps the %s to an exact canonical v target',
    (expectedMode, sourceV, sourceHeight, expectedV) => {
      const roof = template();
      const source = {
        ...window({ uMm: 1000, vMm: sourceV }),
        id: 'feature:roof-window-1',
        heightMm: sourceHeight,
      };
      const dragged = {
        ...window({ uMm: 2200, vMm: expectedV + 7 }),
        id: 'feature:roof-window-2',
        heightMm: 400,
      };
      const result = resolveRoofWindowAlignmentSnap({
        template: roof,
        feature: dragged,
        otherWindows: [source],
        maxDistanceMm: 10,
      });
      expect(result.guide?.mode).toBe(expectedMode);
      expect(result.feature.position.vMm).toBe(expectedV);
      expect(result.feature.position.uMm).toBe(dragged.position.uMm);
    },
  );
});

describe('membrane course layout', () => {
  const product = {
    rollWidthMm: 1500,
    rollLengthMm: 50_000,
    minimumOverlapMm: 100,
  };

  it('is disabled without an enabled layer', () => {
    expect(
      resolveMembraneLayout({
        template: template(),
        layout: { enabled: false },
        product,
      }),
    ).toMatchObject({ status: 'disabled', planes: [] });
  });

  it('fits whole courses to each gable plane without a taper warning', () => {
    const roof = template();
    const basis = resolveRoofPlaneBasis(roof, 'roof-plane:left');
    const vValues = basis.polygon.map((point) => point.vMm);
    const spanMm = Math.max(...vValues) - Math.min(...vValues);
    const result = resolveMembraneLayout({
      template: roof,
      layout: { enabled: true, roofPlaneIds: ['roof-plane:left'] },
      product,
    });
    expect(result.status).toBe('resolved');
    expect(result.warnings).not.toContain('hip-course-width-approximated');
    const [plane] = result.planes;
    expect(plane).toMatchObject({
      roofPlaneId: 'roof-plane:left',
      status: 'resolved',
      courseWidthMm: roof.buildingLengthMm,
      tapers: false,
      hasOpenings: false,
    });
    expect(plane!.spanMm).toBeCloseTo(spanMm, 6);
    // Gross area is exactly courses × roll width × eave width — never derived
    // from net area, since gross intentionally includes the lap waste.
    expect(plane!.grossAreaMm2).toBeCloseTo(
      plane!.courseCount * product.rollWidthMm * roof.buildingLengthMm,
      6,
    );
    expect(result.grossAreaMm2).toBeCloseTo(plane!.grossAreaMm2, 6);
    expect(result.rollCount).toBeGreaterThan(0);
  });

  it('flags a hip plane that narrows from eave to ridge', () => {
    const roof = {
      ...template(),
      type: 'hip' as const,
      hipRafterSection: { widthMm: 100, depthMm: 240 },
    };
    const result = resolveMembraneLayout({
      template: roof,
      layout: { enabled: true, roofPlaneIds: ['roof-plane:left'] },
      product,
    });
    expect(result.status).toBe('resolved');
    expect(result.warnings).toContain('hip-course-width-approximated');
    expect(result.planes[0]).toMatchObject({ tapers: true });
  });

  it('flags an assigned plane carrying a roof window without subtracting it', () => {
    const roof = template();
    const result = resolveMembraneLayout({
      template: roof,
      layout: { enabled: true, roofPlaneIds: ['roof-plane:left'] },
      product,
      features: [window({ uMm: 1000, vMm: 900 })],
    });
    expect(result.warnings).toContain('openings-not-subtracted');
    expect(result.planes[0]).toMatchObject({ hasOpenings: true });
    // The course fit ignores the opening entirely — same gross area with or
    // without it, disclosed rather than silently wrong.
    const withoutWindow = resolveMembraneLayout({
      template: roof,
      layout: { enabled: true, roofPlaneIds: ['roof-plane:left'] },
      product,
    });
    expect(result.grossAreaMm2).toBeCloseTo(withoutWindow.grossAreaMm2, 6);
  });

  it('fails safe for an overlap that cannot advance up-slope', () => {
    const result = resolveMembraneLayout({
      template: template(),
      layout: { enabled: true, roofPlaneIds: ['roof-plane:left'] },
      product: { ...product, minimumOverlapMm: product.rollWidthMm },
    });
    expect(result.status).toBe('incomplete');
    expect(result.issues).toContain('invalid-overlap');
  });

  it('rejects an unknown roof plane', () => {
    const result = resolveMembraneLayout({
      template: template(),
      layout: { enabled: true, roofPlaneIds: ['roof-plane:front'] },
      product,
    });
    expect(result).toMatchObject({
      status: 'incomplete',
      issues: ['roof-plane-not-found'],
    });
  });
});
