import { describe, expect, it } from 'vitest';
import type { RoofWindowFeature } from '@cieslacalc/timber-model';
import { assemblyDefaults } from './assembly';
import { gableTemplateFromAssembly } from './gable-roof';
import { resolveRoofSurfaceGeometry } from './roof-surface';
import {
  resolveRoofFeatureTopology,
  resolveRoofLineEnds,
  resolveRoofOpenings,
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

describe('V52 opening perimeters', () => {
  const roof = gable();
  const window: RoofWindowFeature = {
    id: 'feature:roof-window-1',
    kind: 'roof-window',
    roofPlaneId: 'roof-plane:left',
    widthMm: 780,
    heightMm: 1180,
    position: { uMm: 2000, vMm: 1500 },
  };
  const surface = resolveRoofSurfaceGeometry({
    template: roof,
    features: [window],
  });
  const openings = resolveRoofOpenings(
    surface,
    resolveRoofFeatureTopology(surface),
  );

  it('groups the four edges of one opening in a stable bottom → right → top → left order', () => {
    expect(openings).toHaveLength(1);
    const opening = openings[0]!;
    expect(opening.featureId).toBe(window.id);
    expect(opening.roofPlaneId).toBe('roof-plane:left');
    expect(opening.rectangular).toBe(true);
    expect(opening.edges.map((edge) => edge.side)).toEqual([
      'bottom',
      'right',
      'top',
      'left',
    ]);
    const lengths = Object.fromEntries(
      opening.edges.map((edge) => [edge.side, edge.lengthMm]),
    );
    expect(lengths.bottom).toBeCloseTo(780, 6);
    expect(lengths.top).toBeCloseTo(780, 6);
    expect(lengths.left).toBeCloseTo(1180, 6);
    expect(lengths.right).toBeCloseTo(1180, 6);
    expect(opening.perimeterMm).toBeCloseTo(2 * (780 + 1180), 6);
    expect(opening.widthMm).toBeCloseTo(780, 6);
    expect(opening.heightMm).toBeCloseTo(1180, 6);
    expect(opening.centre).toEqual({ uMm: 2390, vMm: 2090 });
  });

  it('every edge is finite and lies inside the owning plane', () => {
    const plane = surface.planes.find(
      (item) => item.roofPlaneId === 'roof-plane:left',
    )!;
    const us = plane.polygon.map((p) => p.uMm);
    const vs = plane.polygon.map((p) => p.vMm);
    for (const edge of openings[0]!.edges)
      for (const point of [edge.from, edge.to]) {
        expect(Number.isFinite(point.uMm) && Number.isFinite(point.vMm)).toBe(
          true,
        );
        expect(point.uMm).toBeGreaterThanOrEqual(Math.min(...us) - 1e-6);
        expect(point.uMm).toBeLessThanOrEqual(Math.max(...us) + 1e-6);
        expect(point.vMm).toBeGreaterThanOrEqual(Math.min(...vs) - 1e-6);
        expect(point.vMm).toBeLessThanOrEqual(Math.max(...vs) + 1e-6);
      }
  });

  it('maps every edge into resolved 3D with its true length', () => {
    for (const edge of openings[0]!.edges)
      expect(
        Math.hypot(
          edge.worldTo.x - edge.worldFrom.x,
          edge.worldTo.y - edge.worldFrom.y,
          edge.worldTo.z - edge.worldFrom.z,
        ),
      ).toBeCloseTo(edge.lengthMm, 6);
    // The bottom edge is horizontal in the world, the sides rise.
    const bottom = openings[0]!.edges.find((edge) => edge.side === 'bottom')!;
    expect(bottom.worldFrom.z).toBeCloseTo(bottom.worldTo.z, 6);
    const left = openings[0]!.edges.find((edge) => edge.side === 'left')!;
    expect(Math.abs(left.worldTo.z - left.worldFrom.z)).toBeGreaterThan(100);
  });

  it('reports the owning plane pitch from resolved 3D geometry', () => {
    expect(openings[0]!.pitchDeg).toBeCloseTo(roof.pitchDeg, 6);
  });

  it('is deterministic and needs no screen coordinates', () => {
    const again = resolveRoofOpenings(
      surface,
      resolveRoofFeatureTopology(surface),
    );
    expect(again).toEqual(openings);
  });

  it('a roof without openings has none', () => {
    const plain = resolveRoofSurfaceGeometry({ template: roof, features: [] });
    expect(
      resolveRoofOpenings(plain, resolveRoofFeatureTopology(plain)),
    ).toEqual([]);
  });
});

describe('V52 ridge / hip line ends', () => {
  it('a gable ridge has two open ends, both at verges', () => {
    const ends = resolveRoofLineEnds(topologyOf(gable()));
    expect(ends).toHaveLength(2);
    expect(ends.every((end) => end.open && end.context === 'verge')).toBe(true);
  });

  it('on a hip roof the ridge meets hips (junctions); only hip feet are open', () => {
    const topology = topologyOf(hip());
    const ends = resolveRoofLineEnds(topology);
    expect(ends).toHaveLength(10);
    const open = ends.filter((end) => end.open);
    expect(open).toHaveLength(4);
    expect(open.every((end) => end.kind === 'hip')).toBe(true);
    expect(open.every((end) => end.context === 'eave-corner')).toBe(true);
    const ridge = ends.filter((end) => end.kind === 'ridge');
    expect(ridge.every((end) => !end.open)).toBe(true);
    expect(ridge.every((end) => end.meetsFeatureIds.length === 2)).toBe(true);
  });

  it('a square hip (pyramid) has four open hip feet and a closed apex', () => {
    const ends = resolveRoofLineEnds(topologyOf(hip(gable().halfRunMm * 2)));
    expect(ends.filter((end) => end.open)).toHaveLength(4);
    expect(ends.filter((end) => !end.open)).toHaveLength(4);
  });
});
