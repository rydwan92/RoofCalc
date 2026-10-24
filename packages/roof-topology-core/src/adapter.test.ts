import { describe, expect, it } from 'vitest';
import {
  assemblyDefaults,
  createDefaultRoofWindow,
  gableTemplateFromAssembly,
  projectPlaneLocalToWorld,
  resolveRoofFeatureTopology,
  resolveRoofPlaneBasis,
  resolveRoofSurfaceGeometry,
} from '@cieslacalc/roof-math';
import type {
  GableRoofTemplateSpec,
  HipRoofTemplateSpec,
  RoofTemplateSpec,
} from '@cieslacalc/timber-model';
import { assessRoofScene } from './assess';
import { planeAdjacency, roofSceneMetrics } from './build';
import { roofSceneFromResolvedRoof } from './adapter';

/**
 * Reusability proof (VNext-6 P2.3): today's gable and hip, solved by
 * roof-math exactly as the workbench solves them, become the neutral graph
 * WITHOUT a number changing and without replacing the solver.
 */
const gable = (buildingLengthMm = 9000): GableRoofTemplateSpec =>
  gableTemplateFromAssembly(assemblyDefaults, {
    id: 'template:topology-gable',
    buildingLengthMm,
    rafterSpacing: { mode: 'max-even-spacing', spacingMm: 900 },
  });
const hip = (buildingLengthMm = 12000): HipRoofTemplateSpec => ({
  ...gable(buildingLengthMm),
  id: 'template:topology-hip',
  type: 'hip',
  hipRafterSection: { widthMm: 100, depthMm: 240 },
});

function adapt(template: RoofTemplateSpec, withWindow = false) {
  const features = withWindow ? [createDefaultRoofWindow(template)] : [];
  const surface = resolveRoofSurfaceGeometry({ template, features });
  const topology = resolveRoofFeatureTopology(surface);
  const scene = roofSceneFromResolvedRoof({
    structureId: 'structure:main',
    template: template.type,
    planes: surface.planes,
    lines: topology.features,
    openings: surface.planes.flatMap((plane) => {
      const basis = resolveRoofPlaneBasis(template, plane.roofPlaneId);
      return plane.openingPolygons.map((opening) => ({
        featureId: opening.featureId,
        roofPlaneId: plane.roofPlaneId,
        worldPolygon: opening.polygon.map((point) =>
          projectPlaneLocalToWorld(basis, point),
        ),
      }));
    }),
  });
  return { surface, topology, scene };
}

describe.each([
  ['gable', gable()],
  ['hip', hip()],
  ['hip with a short ridge', hip(9000)],
])('existing %s → neutral graph', (_, template) => {
  const { surface, topology, scene } = adapt(template);
  const metrics = roofSceneMetrics(scene);
  const assessment = assessRoofScene(scene);

  it('keeps every plane area exactly', () => {
    expect(scene.planes).toHaveLength(surface.planes.length);
    surface.planes.forEach((plane, index) => {
      expect(metrics.planes[index]!.areaMm2).toBeCloseTo(plane.grossAreaMm2, 3);
      expect(scene.planes[index]!.source.ref).toBe(plane.roofPlaneId);
    });
    expect(metrics.totalAreaMm2).toBeCloseTo(surface.grossAreaMm2, 3);
  });

  it('keeps the pitch of every plane', () => {
    for (const plane of scene.planes)
      expect(plane.pitchDeg).toBeCloseTo(template.pitchDeg, 9);
  });

  it('keeps every roof line, its kind and its length', () => {
    expect(scene.edges.map((edge) => edge.kind)).toEqual(
      topology.features.map((feature) => feature.kind),
    );
    for (const kind of ['eave', 'ridge', 'hip', 'verge', 'valley'] as const)
      expect(metrics.edges[kind].lengthMm).toBeCloseTo(
        topology.features
          .filter((feature) => feature.kind === kind)
          .reduce((sum, feature) => sum + feature.lengthMm, 0),
        6,
      );
  });

  it("is geometrically complete and calculated by today's solver", () => {
    expect(assessment.issues).toEqual([]);
    expect(assessment).toMatchObject({
      geometry: 'complete',
      calculation: 'supported',
      limits: [],
    });
  });

  it('every shared line links exactly the two planes that meet there', () => {
    const adjacency = planeAdjacency(scene);
    const shared = scene.edges.filter((edge) => edge.planeIds.length === 2);
    expect(
      adjacency.reduce((sum, plane) => sum + plane.neighbours.length, 0),
    ).toBe(shared.length * 2);
  });
});

describe('openings travel with their plane', () => {
  it('a roof window keeps its area and stays on its plane', () => {
    const { surface, scene } = adapt(gable(), true);
    const metrics = roofSceneMetrics(scene);
    expect(scene.openings).toHaveLength(1);
    expect(metrics.totalOpeningAreaMm2).toBeCloseTo(surface.openingAreaMm2, 3);
    expect(assessRoofScene(scene).issues).toEqual([]);
  });
});

describe('the adapter reports, it does not repair', () => {
  it('a line pointing at an unknown plane makes the graph invalid', () => {
    const { surface, topology } = adapt(gable());
    const scene = roofSceneFromResolvedRoof({
      structureId: 'structure:main',
      template: 'gable',
      planes: surface.planes,
      lines: [
        ...topology.features,
        {
          ...topology.features[0]!,
          id: 'roof-line:stray',
          incidentPlaneIds: ['roof-plane:missing'],
        },
      ],
    });
    const assessment = assessRoofScene(scene);
    expect(assessment.geometry).toBe('invalid');
    expect(assessment.calculation).toBe('not-supported');
    expect(assessment.issues.map((issue) => issue.code)).toContain(
      'edge-unknown-plane',
    );
  });
});
