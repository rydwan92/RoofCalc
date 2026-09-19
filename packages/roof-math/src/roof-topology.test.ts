import { describe, expect, it } from 'vitest';
import type { RoofWindowFeature } from '@cieslacalc/timber-model';
import { assemblyDefaults } from './assembly';
import { gableTemplateFromAssembly } from './gable-roof';
import { resolveRoofSurfaceGeometry } from './roof-surface';
import {
  resolveRoofFeatureTopology,
  roofFeatureLength,
  type RoofLineFeatureKind,
} from './roof-topology';

const gable = (buildingLengthMm = 8000) =>
  gableTemplateFromAssembly(assemblyDefaults, {
    id: 'template:topology-gable',
    buildingLengthMm,
    rafterSpacing: { mode: 'max-even-spacing', spacingMm: 1000 },
  });
const hip = (buildingLengthMm = 12000) => ({
  ...gable(buildingLengthMm),
  id: 'template:topology-hip',
  type: 'hip' as const,
  hipRafterSection: { widthMm: 100, depthMm: 240 },
});

const topologyOf = (
  template: ReturnType<typeof gable> | ReturnType<typeof hip>,
  features: RoofWindowFeature[] = [],
) =>
  resolveRoofFeatureTopology(
    resolveRoofSurfaceGeometry({ template, features }),
  );
const count = (
  topology: ReturnType<typeof topologyOf>,
  kind: RoofLineFeatureKind,
) => topology.features.filter((feature) => feature.kind === kind).length;

describe('canonical roof features — gable', () => {
  const roof = gable();
  const topology = topologyOf(roof);
  const tan = Math.tan((roof.pitchDeg * Math.PI) / 180);
  const slope =
    (roof.halfRunMm + roof.eaveOverhangMm) /
    Math.cos((roof.pitchDeg * Math.PI) / 180);

  it('has one physical ridge shared by both planes, two eaves and four verges', () => {
    expect(count(topology, 'ridge')).toBe(1);
    expect(count(topology, 'eave')).toBe(2);
    expect(count(topology, 'verge')).toBe(4);
    expect(count(topology, 'hip')).toBe(0);
    expect(count(topology, 'valley')).toBe(0);
    const ridge = topology.features.find((item) => item.kind === 'ridge')!;
    expect(ridge.incidentPlaneIds).toEqual([
      'roof-plane:left',
      'roof-plane:right',
    ]);
    expect(ridge.lengthMm).toBeCloseTo(roof.buildingLengthMm, 6);
  });

  it('measures true 3D lengths, independently of the resolver', () => {
    for (const eave of topology.features.filter((f) => f.kind === 'eave')) {
      expect(eave.lengthMm).toBeCloseTo(roof.buildingLengthMm, 6);
      expect(eave.incidentPlaneIds).toHaveLength(1);
    }
    for (const verge of topology.features.filter((f) => f.kind === 'verge'))
      expect(verge.lengthMm).toBeCloseTo(slope, 6);
    expect(slope).toBeCloseTo(
      Math.hypot(
        roof.halfRunMm + roof.eaveOverhangMm,
        (roof.halfRunMm + roof.eaveOverhangMm) * tan,
      ),
      6,
    );
  });

  it('never merges the two eaves or verges on opposite sides', () => {
    const eaves = topology.features.filter((f) => f.kind === 'eave');
    expect(new Set(eaves.flatMap((f) => f.incidentPlaneIds)).size).toBe(2);
    expect(topology.eaveCorners).toEqual([]);
  });

  it('is symmetric: left and right eaves point outwards in opposite directions', () => {
    const [left, right] = topology.features.filter((f) => f.kind === 'eave');
    expect(left!.outwardPlan!.x).toBeCloseTo(-1, 9);
    expect(right!.outwardPlan!.x).toBeCloseTo(1, 9);
    expect(left!.incidentPlaneIds).toEqual(['roof-plane:left']);
  });

  it('maps every plane edge to exactly one canonical feature', () => {
    for (const plane of topology.planeEdges) {
      expect(plane.edges).toHaveLength(4);
      expect(plane.edges.map((edge) => edge.kind).sort()).toEqual([
        'eave',
        'ridge',
        'verge',
        'verge',
      ]);
    }
  });
});

describe('canonical roof features — hip', () => {
  const roof = hip();
  const topology = topologyOf(roof);
  const reach = roof.halfRunMm + roof.eaveOverhangMm;
  const tan = Math.tan((roof.pitchDeg * Math.PI) / 180);

  it('has one ridge, four unique hips, four eaves and no verge', () => {
    expect(count(topology, 'ridge')).toBe(1);
    expect(count(topology, 'hip')).toBe(4);
    expect(count(topology, 'eave')).toBe(4);
    expect(count(topology, 'verge')).toBe(0);
    expect(count(topology, 'valley')).toBe(0);
    expect(new Set(topology.features.map((f) => f.id)).size).toBe(
      topology.features.length,
    );
  });

  it('measures ridge, hips and eaves from independent formulas', () => {
    const ridge = topology.features.find((f) => f.kind === 'ridge')!;
    expect(ridge.lengthMm).toBeCloseTo(
      roof.buildingLengthMm - 2 * roof.halfRunMm,
      6,
    );
    expect(ridge.incidentPlaneIds).toEqual([
      'roof-plane:left',
      'roof-plane:right',
    ]);
    const hipLength = Math.hypot(reach, reach, reach * tan);
    for (const line of topology.features.filter((f) => f.kind === 'hip')) {
      expect(line.lengthMm).toBeCloseTo(hipLength, 6);
      expect(line.incidentPlaneIds).toHaveLength(2);
    }
    const eaveLengths = topology.features
      .filter((f) => f.kind === 'eave')
      .map((f) => Math.round(f.lengthMm));
    expect(eaveLengths).toEqual([
      roof.buildingLengthMm + 2 * roof.eaveOverhangMm,
      2 * reach,
      roof.buildingLengthMm + 2 * roof.eaveOverhangMm,
      2 * reach,
    ]);
    // Same totals the V50 per-plane boundaries implied (half of each line).
    const surface = resolveRoofSurfaceGeometry({ template: roof });
    expect(roofFeatureLength(topology, 'hip')).toBeCloseTo(
      surface.planes.reduce((sum, p) => sum + p.hipBoundaryLengthMm / 2, 0),
      6,
    );
  });

  it('adjacent eaves meet at four external corners, each under a hip', () => {
    expect(topology.eaveCorners).toHaveLength(4);
    const hipIds = topology.features
      .filter((f) => f.kind === 'hip')
      .map((f) => f.id);
    for (const corner of topology.eaveCorners) {
      expect(corner.kind).toBe('external');
      expect(hipIds).toContain(corner.riseFeatureId);
      const ending = topology.features.find(
        (f) => f.id === corner.endingEaveId,
      )!;
      const starting = topology.features.find(
        (f) => f.id === corner.startingEaveId,
      )!;
      expect(ending.end.x).toBeCloseTo(starting.start.x, 6);
      expect(ending.end.y).toBeCloseTo(starting.start.y, 6);
    }
    // Every eave ends exactly once and starts exactly once: a closed loop.
    expect(
      new Set(topology.eaveCorners.map((corner) => corner.endingEaveId)).size,
    ).toBe(4);
  });

  it('a square hip (pyramid) has no ridge and four hips', () => {
    const pyramid = topologyOf(hip(gable().halfRunMm * 2));
    expect(count(pyramid, 'ridge')).toBe(0);
    expect(count(pyramid, 'hip')).toBe(4);
    expect(count(pyramid, 'eave')).toBe(4);
  });

  it('IDs are deterministic for identical geometry', () => {
    expect(topologyOf(hip()).features.map((f) => f.id)).toEqual(
      topology.features.map((f) => f.id),
    );
    expect(topology.features.map((f) => f.id)).toEqual([
      'roof-line:eave-1',
      'roof-line:eave-2',
      'roof-line:eave-3',
      'roof-line:eave-4',
      'roof-line:ridge-1',
      'roof-line:hip-1',
      'roof-line:hip-2',
      'roof-line:hip-3',
      'roof-line:hip-4',
    ]);
    // Structured fields carry the meaning; ordinals exist only for labels.
    expect(topology.features[0]!.incidentPlaneIds).toEqual(['roof-plane:left']);
  });
});

describe('opening edges', () => {
  it('stay separate from outer roof lines', () => {
    const roof = gable();
    const window: RoofWindowFeature = {
      id: 'feature:roof-window-1',
      kind: 'roof-window',
      roofPlaneId: 'roof-plane:left',
      widthMm: 780,
      heightMm: 1180,
      position: { uMm: 2000, vMm: 1500 },
    };
    const withWindow = topologyOf(roof, [window]);
    const without = topologyOf(roof);
    expect(withWindow.features).toEqual(without.features);
    expect(withWindow.openingEdges).toHaveLength(4);
    expect(withWindow.openingEdges.map((edge) => edge.side).sort()).toEqual([
      'lower',
      'side',
      'side',
      'upper',
    ]);
    expect(
      withWindow.openingEdges.every(
        (edge) => edge.sourceFeatureId === window.id,
      ),
    ).toBe(true);
    expect(count(withWindow, 'eave')).toBe(2);
  });
});
