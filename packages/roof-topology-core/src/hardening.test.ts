import { describe, expect, it } from 'vitest';
import {
  assemblyDefaults,
  gableTemplateFromAssembly,
  resolveRoofFeatureTopology,
  resolveRoofSurfaceGeometry,
} from '@cieslacalc/roof-math';
import type { RoofTemplateSpec } from '@cieslacalc/timber-model';
import { roofSceneFromResolvedRoof } from './adapter';
import { assessRoofScene, type RoofSceneIssueCode } from './assess';
import {
  createRoofEdge,
  createRoofPlane,
  mergeRoofScenes,
  RoofSceneMergeError,
  roofSceneMetrics,
  transformRoofScene,
} from './build';
import {
  ROOF_SCENE_CONTRACT_VERSION,
  type RoofEdgeKind,
  type RoofSceneGraph,
  type Vec3,
} from './model';

/**
 * VNext-6.1 audit-driven hardening of the topology checks. Every rule has a
 * negative case (it fires), a positive case (it stays quiet) and the
 * existing gable/hip regression under rotation, scale and point order.
 */
const fixture = { kind: 'fixture' as const, stage: 'confirmed' as const };
const TAN15 = Math.tan((15 * Math.PI) / 180);
/** A mono-pitch plane rising along +y at 15°. */
const p = (x: number, y: number): Vec3 => ({ x, y, z: y * TAN15 });

function graph(input: {
  planes: { id: string; structureId?: string; polygon: Vec3[] }[];
  edges?: {
    id: string;
    kind: RoofEdgeKind;
    from: Vec3;
    to: Vec3;
    planes: string[];
  }[];
  structures?: string[];
  openings?: { id: string; planeId: string; polygon: Vec3[] }[];
}): RoofSceneGraph {
  return {
    contractVersion: ROOF_SCENE_CONTRACT_VERSION,
    structures: (input.structures ?? ['s']).map((id) => ({
      id,
      transform: {
        translation: { x: 0, y: 0, z: 0 },
        rotationAboutVerticalDeg: 0,
      },
      template: 'mono-pitch',
      status: 'resolved',
      source: fixture,
    })),
    planes: input.planes.map((plane) =>
      createRoofPlane({
        id: plane.id,
        structureId: plane.structureId ?? 's',
        polygon: plane.polygon,
        source: fixture,
      }),
    ),
    edges: (input.edges ?? []).map((edge) =>
      createRoofEdge({ ...edge, planeIds: edge.planes, source: fixture }),
    ),
    openings: (input.openings ?? []).map((opening) => ({
      ...opening,
      kind: 'roof-window' as const,
      status: 'resolved' as const,
      source: fixture,
    })),
    connections: [],
  };
}

/** 6 × 4 m mono-pitch with its four lines. */
const MONO = {
  planes: [
    { id: 'm', polygon: [p(0, 0), p(6000, 0), p(6000, 4000), p(0, 4000)] },
  ],
  edges: [
    {
      id: 'eave',
      kind: 'eave' as const,
      from: p(0, 0),
      to: p(6000, 0),
      planes: ['m'],
    },
    {
      id: 'top',
      kind: 'abutment' as const,
      from: p(0, 4000),
      to: p(6000, 4000),
      planes: ['m'],
    },
    {
      id: 'v1',
      kind: 'verge' as const,
      from: p(0, 0),
      to: p(0, 4000),
      planes: ['m'],
    },
    {
      id: 'v2',
      kind: 'verge' as const,
      from: p(6000, 0),
      to: p(6000, 4000),
      planes: ['m'],
    },
  ],
};
const codes = (scene: RoofSceneGraph) =>
  assessRoofScene(scene).issues.map((issue) => issue.code);

describe('boundary coverage is an interval union (audit P0-A.1)', () => {
  it('the complete mono-pitch stays complete', () => {
    expect(assessRoofScene(graph(MONO)).geometry).toBe('complete');
  });

  it('two copies of half an eave no longer hide the missing half', () => {
    const half = {
      kind: 'eave' as const,
      from: p(0, 0),
      to: p(3000, 0),
      planes: ['m'],
    };
    const scene = graph({
      ...MONO,
      edges: [
        ...MONO.edges.filter((edge) => edge.id !== 'eave'),
        { id: 'eave-a', ...half },
        { id: 'eave-b', ...half },
      ],
    });
    const found = codes(scene);
    expect(found).toContain('edge-overlap');
    expect(found).toContain('boundary-unclassified');
    expect(assessRoofScene(scene).geometry).toBe('invalid');
  });

  it('an eave split into two touching pieces is still one covered side', () => {
    const scene = graph({
      ...MONO,
      edges: [
        ...MONO.edges.filter((edge) => edge.id !== 'eave'),
        {
          id: 'eave-a',
          kind: 'eave',
          from: p(0, 0),
          to: p(2500, 0),
          planes: ['m'],
        },
        {
          id: 'eave-b',
          kind: 'eave',
          from: p(2500, 0),
          to: p(6000, 0),
          planes: ['m'],
        },
      ],
    });
    expect(assessRoofScene(scene).issues).toEqual([]);
  });
});

describe('plane outlines (audit P0-A.2)', () => {
  it('a bow-tie outline is self-intersecting', () => {
    const scene = graph({
      planes: [
        { id: 'm', polygon: [p(0, 0), p(6000, 4000), p(6000, 0), p(0, 4000)] },
      ],
    });
    expect(codes(scene)).toContain<RoofSceneIssueCode>(
      'plane-self-intersecting',
    );
  });

  it('a repeated vertex and an explicit closing vertex are only notes', () => {
    const scene = graph({
      ...MONO,
      planes: [
        {
          id: 'm',
          polygon: [
            p(0, 0),
            p(6000, 0),
            p(6000, 0),
            p(6000, 4000),
            p(0, 4000),
            p(0, 0),
          ],
        },
      ],
    });
    const assessment = assessRoofScene(scene);
    expect(
      assessment.issues.map((issue) => [issue.code, issue.severity]),
    ).toEqual([['plane-repeated-vertex', 'note']]);
    expect(assessment.geometry).toBe('complete');
  });

  it('a stored pitch, normal or frame that disagrees with the polygon is caught', () => {
    const base = graph(MONO);
    const tamper = (change: Partial<RoofSceneGraph['planes'][number]>) =>
      codes({ ...base, planes: [{ ...base.planes[0]!, ...change }] });
    expect(tamper({ pitchDeg: 20 })).toContain('plane-frame-mismatch');
    expect(tamper({ normal: { x: 0, y: 0, z: 1 } })).toContain(
      'plane-frame-mismatch',
    );
    expect(
      tamper({
        frame: { ...base.planes[0]!.frame, u: { x: 0, y: 1, z: 0 } },
      }),
    ).toContain('plane-frame-mismatch');
    expect(tamper({})).not.toContain('plane-frame-mismatch');
  });

  it('a degenerate line, a line naming a plane twice and an old contract are invalid', () => {
    const scene = graph({
      ...MONO,
      edges: [
        ...MONO.edges,
        {
          id: 'zero',
          kind: 'verge',
          from: p(10, 10),
          to: p(10, 10),
          planes: ['m'],
        },
        {
          id: 'twice',
          kind: 'verge',
          from: p(0, 0),
          to: p(0, 4000),
          planes: ['m', 'm'],
        },
      ],
    });
    const found = codes(scene);
    expect(found).toContain('edge-degenerate');
    expect(found).toContain('edge-plane-repeated');
    expect(
      codes({ ...graph(MONO), contractVersion: 2 as unknown as 1 }),
    ).toContain('contract-version');
  });
});

/** A concave (L-shaped) mono-pitch plane: the notch x 6–10 m, y 4–8 m. */
const CONCAVE = [
  p(0, 0),
  p(10000, 0),
  p(10000, 4000),
  p(6000, 4000),
  p(6000, 8000),
  p(0, 8000),
];

describe('openings on concave planes (audit P0-A.3/4)', () => {
  it('an opening whose corners are all on the plane but whose side crosses the notch is off the plane', () => {
    const scene = graph({
      planes: [{ id: 'c', polygon: CONCAVE }],
      openings: [
        {
          id: 'w',
          planeId: 'c',
          polygon: [p(5000, 3000), p(9000, 3000), p(5000, 7000)],
        },
      ],
    });
    expect(codes(scene)).toContain('opening-off-plane');
  });

  it('an opening fully on the plane passes; overlapping openings make the net area inexact', () => {
    const window = (x: number) => [
      p(x, 1000),
      p(x + 780, 1000),
      p(x + 780, 2180),
      p(x, 2180),
    ];
    const apart = graph({
      planes: [{ id: 'c', polygon: CONCAVE }],
      openings: [
        { id: 'w1', planeId: 'c', polygon: window(1000) },
        { id: 'w2', planeId: 'c', polygon: window(3000) },
      ],
    });
    expect(codes(apart).filter((code) => code.startsWith('opening'))).toEqual(
      [],
    );
    expect(roofSceneMetrics(apart).planes[0]).toMatchObject({
      openingAreaExact: true,
    });
    expect(roofSceneMetrics(apart).planes[0]!.netAreaMm2).toBeGreaterThan(0);

    const overlapping = graph({
      planes: [{ id: 'c', polygon: CONCAVE }],
      openings: [
        { id: 'w1', planeId: 'c', polygon: window(1000) },
        { id: 'w2', planeId: 'c', polygon: window(1400) },
      ],
    });
    expect(codes(overlapping)).toContain('openings-overlap');
    const metrics = roofSceneMetrics(overlapping);
    expect(metrics.openingAreaExact).toBe(false);
    expect(metrics.planes[0]!.netAreaMm2).toBeUndefined();
  });
});

describe('structure overlap by real outlines, not boxes (audit P0-A.4)', () => {
  const twoStructures = (b: Vec3[]) =>
    graph({
      structures: ['house', 'shed'],
      planes: [
        { id: 'c', structureId: 'house', polygon: CONCAVE },
        { id: 'b', structureId: 'shed', polygon: b },
      ],
    });

  it('a separate roof standing in the notch of an L is not a junction', () => {
    const scene = twoStructures([
      p(6500, 4500),
      p(9500, 4500),
      p(9500, 7500),
      p(6500, 7500),
    ]);
    expect(codes(scene)).not.toContain('junction-unresolved');
  });

  it('a roof that really overlaps the L is an unresolved junction', () => {
    const scene = twoStructures([
      p(4000, 2000),
      p(7000, 2000),
      p(7000, 6000),
      p(4000, 6000),
    ]);
    expect(codes(scene)).toContain('junction-unresolved');
  });

  it('a junction line must join a plane of each connected structure', () => {
    const scene = twoStructures([
      p(6500, 4500),
      p(9500, 4500),
      p(9500, 7500),
      p(6500, 7500),
    ]);
    scene.edges.push(
      createRoofEdge({
        id: 'own-eave',
        kind: 'eave',
        from: p(0, 0),
        to: p(10000, 0),
        planeIds: ['c'],
        source: fixture,
      }),
    );
    scene.connections.push({
      id: 'j',
      structureIds: ['house', 'shed'],
      kind: 'roof-to-roof',
      edgeIds: ['own-eave'],
      status: 'resolved',
      source: fixture,
    });
    expect(codes(scene)).toContain('connection-edge-foreign');
  });
});

describe('mergeRoofScenes never lets IDs collide silently (audit P0-B)', () => {
  it('throws with the colliding IDs', () => {
    expect(() => mergeRoofScenes(graph(MONO), graph(MONO))).toThrowError(
      RoofSceneMergeError,
    );
    try {
      mergeRoofScenes(graph(MONO), graph(MONO));
    } catch (error) {
      expect((error as RoofSceneMergeError).ids).toEqual(
        expect.arrayContaining(['s', 'm', 'eave']),
      );
    }
  });
});

describe('gable and hip regression under rotation, scale and point order', () => {
  const gable = (lengthMm: number): RoofTemplateSpec =>
    gableTemplateFromAssembly(assemblyDefaults, {
      id: 'template:hardening',
      buildingLengthMm: lengthMm,
      rafterSpacing: { mode: 'max-even-spacing', spacingMm: 900 },
    });
  const hip = (lengthMm: number): RoofTemplateSpec => ({
    ...gable(lengthMm),
    type: 'hip',
    hipRafterSection: { widthMm: 100, depthMm: 240 },
  });
  const adapt = (template: RoofTemplateSpec) => {
    const surface = resolveRoofSurfaceGeometry({ template });
    return roofSceneFromResolvedRoof({
      structureId: 'main',
      template: template.type,
      planes: surface.planes,
      lines: resolveRoofFeatureTopology(surface).features,
    });
  };

  it.each([
    ['gable 9 m', gable(9000)],
    ['hip 12 m', hip(12000)],
    ['large hip 60 m', hip(60000)],
  ])(
    '%s: rotated, moved and reversed it stays complete with the same areas',
    (_, template) => {
      const scene = adapt(template);
      const before = roofSceneMetrics(scene);
      const moved = transformRoofScene(scene, {
        translation: { x: 123_456, y: -98_765, z: 2_500 },
        rotationAboutVerticalDeg: 33,
      });
      const reversed: RoofSceneGraph = {
        ...moved,
        planes: moved.planes.map((plane) =>
          createRoofPlane({ ...plane, polygon: [...plane.polygon].reverse() }),
        ),
      };
      for (const variant of [moved, reversed]) {
        const assessment = assessRoofScene(variant);
        expect(assessment.issues).toEqual([]);
        expect(assessment).toMatchObject({
          geometry: 'complete',
          calculation: 'supported',
        });
        const after = roofSceneMetrics(variant);
        after.planes.forEach((plane, index) => {
          expect(plane.areaMm2).toBeCloseTo(before.planes[index]!.areaMm2, 1);
          expect(plane.pitchDeg).toBeCloseTo(template.pitchDeg, 9);
        });
      }
    },
  );
});
