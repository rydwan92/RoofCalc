import { describe, expect, it } from 'vitest';
import type { RoofWindowFeature } from '@cieslacalc/timber-model';
import { assemblyDefaults } from './assembly';
import { gableTemplateFromAssembly } from './gable-roof';
import { createRoofSkeleton } from './roof-template';
import {
  clampRoofWindow,
  createDefaultRoofWindow,
  placeRoofWindowBetweenRafters,
  projectPlaneLocalToWorld,
  projectPlaneWorldToLocal,
  resolveBattenLayout,
  resolveRoofFeatureCollisions,
  resolveRoofWindowPlacement,
  resolveRoofPlaneBasis,
} from './roof-features';

const template = () => gableTemplateFromAssembly(assemblyDefaults, {
  id: 'template:gable-1',
  buildingLengthMm: 8100,
  rafterSpacing: { mode: 'max-even-spacing', spacingMm: 1000 },
});
const window = (position: { uMm: number; vMm: number }): RoofWindowFeature => ({
  id: 'feature:roof-window-1', kind: 'roof-window', roofPlaneId: 'roof-plane:left',
  widthMm: 780, heightMm: 1180, position,
});

describe('roof feature geometry', () => {
  it('round-trips gable and hip local roof-plane coordinates without pixels', () => {
    const gable = template();
    const local = { uMm: 1300.25, vMm: 2200.5 };
    const world = projectPlaneLocalToWorld(resolveRoofPlaneBasis(gable, 'roof-plane:left'), local);
    expect(projectPlaneWorldToLocal(resolveRoofPlaneBasis(gable, 'roof-plane:left'), world)).toEqual(local);
    const hip = { ...gable, type: 'hip' as const, id: 'template:hip-1', buildingLengthMm: 10000, hipRafterSection: { widthMm: 100, depthMm: 240 } };
    const hipWorld = projectPlaneLocalToWorld(resolveRoofPlaneBasis(hip, 'roof-plane:front'), local);
    expect(projectPlaneWorldToLocal(resolveRoofPlaneBasis(hip, 'roof-plane:front'), hipWorld)).toEqual(local);
  });

  it('creates and clamps a serializable window within its roof plane', () => {
    const created = createDefaultRoofWindow(template());
    expect(created.id).toBe('feature:roof-window-1');
    expect(clampRoofWindow(template(), { ...created, position: { uMm: -1000, vMm: -1000 } }).position).not.toEqual({ uMm: -1000, vMm: -1000 });
    expect(() => clampRoofWindow(template(), { ...created, widthMm: 0 })).toThrow('invalid_roof_window_size');
  });

  it('detects rafter intersections and finds the nearest clear bay', () => {
    const roof = template();
    const skeleton = createRoofSkeleton(roof);
    const collision = resolveRoofFeatureCollisions({ template: roof, skeleton, feature: window({ uMm: 0, vMm: 1200 }) });
    expect(collision).toHaveLength(1);
    expect(collision[0]!.memberInstanceId).toContain('rafter-pair-1:left');
    const placed = placeRoofWindowBetweenRafters({ template: roof, skeleton, feature: window({ uMm: 100, vMm: 1200 }) });
    expect(placed?.memberInstanceIds).toHaveLength(2);
    expect(resolveRoofFeatureCollisions({ template: roof, skeleton, feature: placed!.feature })).toEqual([]);
  });

  it('reports a too-wide geometric opening using clear face-to-face bay width', () => {
    const roof = template();
    const skeleton = createRoofSkeleton(roof);
    const feature = { ...window({ uMm: 100, vMm: 1200 }), clearanceMm: 30 };
    const placement = resolveRoofWindowPlacement({ template: roof, skeleton, feature });
    expect(placement).toMatchObject({
      placed: false,
      reason: 'opening-too-wide',
      requiredWidthMm: 840,
    });
    if (placement.placed || !placement.nearestBay) throw new Error('expected nearest bay');
    expect(placement.nearestBay.availableWidthMm).toBe(820);
  });

  it('projects deterministic batten rows and splits rows intersecting a roof window', () => {
    const roof = template();
    const layout = { enabled: true, roofPlaneIds: ['roof-plane:left'], battenHeightMm: 40, battenWidthMm: 60, gaugeMm: 350, eaveOffsetMm: 250 };
    const withoutWindow = resolveBattenLayout({ template: roof, layout });
    const withWindow = resolveBattenLayout({ template: roof, layout, features: [window({ uMm: 1000, vMm: 900 })] });
    expect(withoutWindow.battens[0]?.stationMm).toBe(250);
    expect(withoutWindow.battens).toHaveLength(withWindow.battens.length);
    expect(withWindow.battens.some((batten) => batten.segments.length === 2)).toBe(true);
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
      features: [window({ uMm: 1000, vMm: 900 }), { ...window({ uMm: 2200, vMm: 900 }), id: 'feature:roof-window-2' }],
    });
    expect(result.battens[0]).toMatchObject({ stationMm: 900 });
    expect(result.battens[0]!.segments).toHaveLength(3);
    expect(result.totalLengthMm).toBe(
      result.battens.reduce((total, row) => total + row.usableLengthMm, 0),
    );
  });

  it('rejects non-finite or non-positive batten geometry before row iteration', () => {
    const roof = template();
    expect(() =>
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
    ).toThrow('invalid_batten_gauge');
  });
});
