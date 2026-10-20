import { describe, expect, it } from 'vitest';
import { assessRoofScene } from './assess';
import { createRoofEdge, createRoofPlane, roofSceneMetrics } from './build';
import {
  ROOF_SCENE_CONTRACT_VERSION,
  type RoofEdgeKind,
  type RoofSceneGraph,
  type RoofStructureConnection,
  type StructureTemplate,
  type Vec3,
} from './model';

/**
 * Hand-checked scenes for the shapes RoofCalc does not calculate yet
 * (VNext-6 P2.3). Every coordinate below is worked out by hand from the
 * stated dimensions — the graph only records and checks them. They prove
 * the contract can describe a mono-pitch roof, an asymmetric gable and an L
 * with a valley, and that an unresolved junction is reported, not hidden.
 */
const p = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const fixture = { kind: 'fixture' as const, stage: 'confirmed' as const };

interface SceneSpec {
  structures: { id: string; template: StructureTemplate }[];
  planes: { id: string; structureId: string; polygon: Vec3[] }[];
  edges: {
    id: string;
    kind: RoofEdgeKind;
    from: Vec3;
    to: Vec3;
    planes: string[];
  }[];
  connections?: RoofStructureConnection[];
}

function scene(spec: SceneSpec): RoofSceneGraph {
  return {
    contractVersion: ROOF_SCENE_CONTRACT_VERSION,
    structures: spec.structures.map((structure) => ({
      ...structure,
      transform: {
        translation: { x: 0, y: 0, z: 0 },
        rotationAboutVerticalDeg: 0,
      },
      status: 'resolved',
      source: fixture,
    })),
    planes: spec.planes.map((plane) =>
      createRoofPlane({ ...plane, source: fixture }),
    ),
    edges: spec.edges.map((edge) =>
      createRoofEdge({ ...edge, planeIds: edge.planes, source: fixture }),
    ),
    openings: [],
    connections: spec.connections ?? [],
  };
}

/**
 * Mono-pitch (pulpitowy) lean-to: 6.00 × 4.00 m in plan, 15°, eave at
 * y = 0 on z = 0, top edge against a wall at y = 4.00 m on
 * z = 4000·tan 15° = 1071.797 mm.
 */
const MONO_TOP = 4000 * Math.tan((15 * Math.PI) / 180);
const MONO: SceneSpec = {
  structures: [{ id: 'lean-to', template: 'mono-pitch' }],
  planes: [
    {
      id: 'lean-to/plane',
      structureId: 'lean-to',
      polygon: [
        p(0, 0, 0),
        p(6000, 0, 0),
        p(6000, 4000, MONO_TOP),
        p(0, 4000, MONO_TOP),
      ],
    },
  ],
  edges: [
    {
      id: 'e1',
      kind: 'eave',
      from: p(0, 0, 0),
      to: p(6000, 0, 0),
      planes: ['lean-to/plane'],
    },
    {
      id: 'e2',
      kind: 'abutment',
      from: p(0, 4000, MONO_TOP),
      to: p(6000, 4000, MONO_TOP),
      planes: ['lean-to/plane'],
    },
    {
      id: 'e3',
      kind: 'verge',
      from: p(0, 0, 0),
      to: p(0, 4000, MONO_TOP),
      planes: ['lean-to/plane'],
    },
    {
      id: 'e4',
      kind: 'verge',
      from: p(6000, 0, 0),
      to: p(6000, 4000, MONO_TOP),
      planes: ['lean-to/plane'],
    },
  ],
};

/**
 * Asymmetric gable: 10.00 m long, 8.00 m span, ridge 3.00 m from the front
 * eave at 3.00 m height → front 45°, rear atan(3/5) = 30.9638°.
 */
const ASYMMETRIC: SceneSpec = {
  structures: [{ id: 'house', template: 'asymmetric-gable' }],
  planes: [
    {
      id: 'house/front',
      structureId: 'house',
      polygon: [
        p(0, 0, 0),
        p(10000, 0, 0),
        p(10000, 3000, 3000),
        p(0, 3000, 3000),
      ],
    },
    {
      id: 'house/rear',
      structureId: 'house',
      polygon: [
        p(0, 3000, 3000),
        p(10000, 3000, 3000),
        p(10000, 8000, 0),
        p(0, 8000, 0),
      ],
    },
  ],
  edges: [
    {
      id: 'eave-front',
      kind: 'eave',
      from: p(0, 0, 0),
      to: p(10000, 0, 0),
      planes: ['house/front'],
    },
    {
      id: 'eave-rear',
      kind: 'eave',
      from: p(10000, 8000, 0),
      to: p(0, 8000, 0),
      planes: ['house/rear'],
    },
    {
      id: 'ridge',
      kind: 'ridge',
      from: p(0, 3000, 3000),
      to: p(10000, 3000, 3000),
      planes: ['house/front', 'house/rear'],
    },
    {
      id: 'v1',
      kind: 'verge',
      from: p(0, 0, 0),
      to: p(0, 3000, 3000),
      planes: ['house/front'],
    },
    {
      id: 'v2',
      kind: 'verge',
      from: p(10000, 0, 0),
      to: p(10000, 3000, 3000),
      planes: ['house/front'],
    },
    {
      id: 'v3',
      kind: 'verge',
      from: p(0, 8000, 0),
      to: p(0, 3000, 3000),
      planes: ['house/rear'],
    },
    {
      id: 'v4',
      kind: 'verge',
      from: p(10000, 8000, 0),
      to: p(10000, 3000, 3000),
      planes: ['house/rear'],
    },
  ],
};

/**
 * L-shaped roof, all planes 45°: main wing 12 × 8 m (x 0…12, y 0…8), side
 * wing 8 × 8 m (x 4…12, y 8…16). The ridges (z = 4 m) meet at
 * (8, 4, 4); a hip runs from the outer corner (12, 0, 0) and a valley from
 * the inner corner (4, 8, 0) to that point. Hip and valley are each
 * 4·√3 m = 6928.2 mm. Plan areas 40 + 24 + 56 + 40 = 160 m² equal the
 * L footprint 96 + 64 m².
 */
const L_RESOLVED: SceneSpec = {
  structures: [
    { id: 'main', template: 'gable' },
    { id: 'wing', template: 'gable' },
  ],
  planes: [
    {
      id: 'main/front',
      structureId: 'main',
      polygon: [
        p(0, 0, 0),
        p(12000, 0, 0),
        p(8000, 4000, 4000),
        p(0, 4000, 4000),
      ],
    },
    {
      id: 'main/rear',
      structureId: 'main',
      polygon: [
        p(0, 4000, 4000),
        p(8000, 4000, 4000),
        p(4000, 8000, 0),
        p(0, 8000, 0),
      ],
    },
    {
      id: 'wing/right',
      structureId: 'wing',
      polygon: [
        p(12000, 0, 0),
        p(12000, 16000, 0),
        p(8000, 16000, 4000),
        p(8000, 4000, 4000),
      ],
    },
    {
      id: 'wing/left',
      structureId: 'wing',
      polygon: [
        p(4000, 8000, 0),
        p(8000, 4000, 4000),
        p(8000, 16000, 4000),
        p(4000, 16000, 0),
      ],
    },
  ],
  edges: [
    {
      id: 'ridge-main',
      kind: 'ridge',
      from: p(0, 4000, 4000),
      to: p(8000, 4000, 4000),
      planes: ['main/front', 'main/rear'],
    },
    {
      id: 'ridge-wing',
      kind: 'ridge',
      from: p(8000, 4000, 4000),
      to: p(8000, 16000, 4000),
      planes: ['wing/right', 'wing/left'],
    },
    {
      id: 'hip',
      kind: 'hip',
      from: p(12000, 0, 0),
      to: p(8000, 4000, 4000),
      planes: ['main/front', 'wing/right'],
    },
    {
      id: 'valley',
      kind: 'valley',
      from: p(4000, 8000, 0),
      to: p(8000, 4000, 4000),
      planes: ['main/rear', 'wing/left'],
    },
    {
      id: 'eave-1',
      kind: 'eave',
      from: p(0, 0, 0),
      to: p(12000, 0, 0),
      planes: ['main/front'],
    },
    {
      id: 'eave-2',
      kind: 'eave',
      from: p(12000, 0, 0),
      to: p(12000, 16000, 0),
      planes: ['wing/right'],
    },
    {
      id: 'eave-3',
      kind: 'eave',
      from: p(4000, 8000, 0),
      to: p(0, 8000, 0),
      planes: ['main/rear'],
    },
    {
      id: 'eave-4',
      kind: 'eave',
      from: p(4000, 16000, 0),
      to: p(4000, 8000, 0),
      planes: ['wing/left'],
    },
    {
      id: 'verge-1',
      kind: 'verge',
      from: p(0, 0, 0),
      to: p(0, 4000, 4000),
      planes: ['main/front'],
    },
    {
      id: 'verge-2',
      kind: 'verge',
      from: p(0, 8000, 0),
      to: p(0, 4000, 4000),
      planes: ['main/rear'],
    },
    {
      id: 'verge-3',
      kind: 'verge',
      from: p(12000, 16000, 0),
      to: p(8000, 16000, 4000),
      planes: ['wing/right'],
    },
    {
      id: 'verge-4',
      kind: 'verge',
      from: p(4000, 16000, 0),
      to: p(8000, 16000, 4000),
      planes: ['wing/left'],
    },
  ],
  connections: [
    {
      id: 'junction',
      structureIds: ['main', 'wing'],
      kind: 'roof-to-roof',
      edgeIds: ['hip', 'valley'],
      status: 'resolved',
      source: fixture,
    },
  ],
};

describe('mono-pitch roof', () => {
  const graph = scene(MONO);
  const metrics = roofSceneMetrics(graph);

  it('measures the sloped area, the plan area and the pitch', () => {
    expect(graph.planes[0]!.pitchDeg).toBeCloseTo(15, 9);
    expect(metrics.totalPlanAreaMm2).toBeCloseTo(24_000_000, 3);
    expect(metrics.totalAreaMm2).toBeCloseTo(
      24_000_000 / Math.cos((15 * Math.PI) / 180),
      3,
    );
    expect(metrics.edges.verge.lengthMm).toBeCloseTo(
      2 * Math.hypot(4000, MONO_TOP),
      6,
    );
  });

  it('is complete geometry but NOT a roof RoofCalc calculates yet', () => {
    const assessment = assessRoofScene(graph);
    expect(assessment.geometry).toBe('complete');
    expect(assessment.calculation).toBe('not-supported');
    expect(assessment.limits).toEqual([
      {
        code: 'template-not-calculated',
        structureId: 'lean-to',
        template: 'mono-pitch',
      },
      { code: 'not-from-solver', structureId: 'lean-to' },
    ]);
  });

  it('rejects a line whose declared kind contradicts the geometry', () => {
    const wrong = scene({
      ...MONO,
      edges: MONO.edges.map((edge) =>
        edge.id === 'e1' ? { ...edge, kind: 'ridge' as const } : edge,
      ),
    });
    const assessment = assessRoofScene(wrong);
    expect(assessment.geometry).toBe('invalid');
    expect(assessment.issues).toContainEqual({
      code: 'edge-kind-mismatch',
      severity: 'invalid',
      entityId: 'e1',
      expected: ['eave', 'abutment'],
    });
  });

  it('a boundary without a line is incomplete, not invalid', () => {
    const missing = scene({
      ...MONO,
      edges: MONO.edges.filter((edge) => edge.id !== 'e4'),
    });
    const assessment = assessRoofScene(missing);
    expect(assessment.geometry).toBe('partial');
    expect(assessment.issues.map((issue) => issue.code)).toEqual([
      'boundary-unclassified',
    ]);
  });
});

describe('asymmetric gable', () => {
  const graph = scene(ASYMMETRIC);
  const metrics = roofSceneMetrics(graph);

  it('keeps two different pitches meeting at one ridge', () => {
    const [front, rear] = graph.planes;
    expect(front!.pitchDeg).toBeCloseTo(45, 9);
    expect(rear!.pitchDeg).toBeCloseTo((Math.atan(3 / 5) * 180) / Math.PI, 9);
    expect(metrics.planes[0]!.areaMm2).toBeCloseTo(
      10_000 * 3000 * Math.SQRT2,
      3,
    );
    expect(metrics.planes[1]!.areaMm2).toBeCloseTo(
      10_000 * Math.hypot(5000, 3000),
      3,
    );
    expect(metrics.totalPlanAreaMm2).toBeCloseTo(80_000_000, 3);
    expect(metrics.edges.ridge).toEqual({ count: 1, lengthMm: 10_000 });
  });

  it('frames each plane: u along the eave, v up the slope', () => {
    const rear = graph.planes[1]!;
    expect(rear.frame.origin.z).toBe(0);
    expect(Math.abs(rear.frame.u.x)).toBeCloseTo(1, 9);
    expect(rear.frame.v.z).toBeGreaterThan(0);
    expect(rear.frame.v.y).toBeLessThan(0);
  });

  it('is complete geometry, not yet calculated', () => {
    const assessment = assessRoofScene(graph);
    expect(assessment.geometry).toBe('complete');
    expect(assessment.calculation).toBe('not-supported');
  });
});

describe('L-shaped roof with a valley', () => {
  it('a resolved junction: hip and valley classified from geometry', () => {
    const graph = scene(L_RESOLVED);
    const assessment = assessRoofScene(graph);
    expect(assessment.issues).toEqual([]);
    expect(assessment.geometry).toBe('complete');
    const metrics = roofSceneMetrics(graph);
    expect(metrics.totalPlanAreaMm2).toBeCloseTo(160_000_000, 3);
    expect(metrics.totalAreaMm2).toBeCloseTo(160_000_000 * Math.SQRT2, 2);
    expect(metrics.edges.valley.lengthMm).toBeCloseTo(4000 * Math.sqrt(3), 6);
    expect(metrics.edges.hip.lengthMm).toBeCloseTo(4000 * Math.sqrt(3), 6);
    // Two structures and a connection: honest about what is not calculated.
    expect(assessment.calculation).toBe('not-supported');
    expect(assessment.limits).toContainEqual({
      code: 'several-structures',
      count: 2,
    });
    expect(assessment.limits).toContainEqual({
      code: 'structure-connection',
      connectionId: 'junction',
    });
  });

  it('calling the valley a hip is caught', () => {
    const graph = scene({
      ...L_RESOLVED,
      edges: L_RESOLVED.edges.map((edge) =>
        edge.id === 'valley' ? { ...edge, kind: 'hip' as const } : edge,
      ),
    });
    expect(assessRoofScene(graph).issues).toContainEqual({
      code: 'edge-kind-mismatch',
      severity: 'invalid',
      entityId: 'valley',
      expected: ['valley'],
    });
  });

  it('two overlapping wings without a solved junction are partial', () => {
    // Each wing drawn as a full gable over its own rectangle: the side wing
    // runs into the main roof, where nobody has solved the intersection.
    const graph = scene({
      structures: L_RESOLVED.structures,
      planes: [
        {
          id: 'main/front',
          structureId: 'main',
          polygon: [
            p(0, 0, 0),
            p(12000, 0, 0),
            p(12000, 4000, 4000),
            p(0, 4000, 4000),
          ],
        },
        {
          id: 'main/rear',
          structureId: 'main',
          polygon: [
            p(0, 4000, 4000),
            p(12000, 4000, 4000),
            p(12000, 8000, 0),
            p(0, 8000, 0),
          ],
        },
        {
          id: 'wing/right',
          structureId: 'wing',
          polygon: [
            p(12000, 4000, 0),
            p(12000, 16000, 0),
            p(8000, 16000, 4000),
            p(8000, 4000, 4000),
          ],
        },
        {
          id: 'wing/left',
          structureId: 'wing',
          polygon: [
            p(4000, 4000, 0),
            p(8000, 4000, 4000),
            p(8000, 16000, 4000),
            p(4000, 16000, 0),
          ],
        },
      ],
      edges: [],
      connections: [
        {
          id: 'junction',
          structureIds: ['main', 'wing'],
          kind: 'roof-to-roof',
          edgeIds: [],
          status: 'unresolved',
          source: { kind: 'cad', stage: 'proposed' },
        },
      ],
    });
    const assessment = assessRoofScene(graph);
    expect(assessment.geometry).toBe('partial');
    const codes = assessment.issues.map((issue) => issue.code);
    expect(codes).toContain('connection-unresolved');
    expect(codes).toContain('junction-unresolved');
    expect(codes).not.toContain('edge-kind-mismatch');
    expect(assessment.calculation).toBe('not-supported');
  });
});
