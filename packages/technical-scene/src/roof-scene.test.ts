import { describe, expect, it } from 'vitest';
import {
  createRoofSkeletonFromResolved,
  resolveRoofTemplate,
} from '@cieslacalc/roof-math';
import type {
  RoofSkeleton,
  RoofTemplateSpec,
  SkeletonMember3D,
} from '@cieslacalc/timber-model';
import {
  createRoofTechnicalScene,
  orientedBoxForMember,
  sceneGeometryCorners,
  type TechnicalScene,
  type TechnicalSceneEntity,
} from './index';

/**
 * The scene adapter is the V38 truth boundary: it may copy resolved facts and
 * nothing else. These tests are renderer-free on purpose — no WebGL, no
 * Three.js, no DOM — so the correctness of the 3D view is provable in Node.
 */

const WALL_PLATE = {
  id: 'support:wall-plate-1',
  kind: 'wall-plate',
  section: { widthMm: 140, heightMm: 140 },
  placement: { mode: 'horizontal-from-wall', xMm: 0 },
  joint: { kind: 'seat-notch', control: 'seat', valueMm: 100 },
} as const;

const GABLE: RoofTemplateSpec = {
  id: 'template:gable-1',
  type: 'gable',
  buildingLengthMm: 8000,
  halfRunMm: 4000,
  pitchDeg: 35,
  eaveOverhangMm: 500,
  rafterSpacing: { mode: 'max-even-spacing', spacingMm: 800 },
  rafterSection: { widthMm: 80, depthMm: 200 },
  wallPlate: WALL_PLATE,
  ridge: { id: 'terminal:ridge-1', thicknessMm: 40 },
  intermediateSupports: [],
};

const HIP: RoofTemplateSpec = {
  id: 'template:hip-1',
  type: 'hip',
  buildingLengthMm: 12000,
  halfRunMm: 4000,
  pitchDeg: 35,
  eaveOverhangMm: 500,
  rafterSpacing: { mode: 'max-even-spacing', spacingMm: 800 },
  rafterSection: { widthMm: 80, depthMm: 200 },
  hipRafterSection: { widthMm: 80, depthMm: 240 },
  wallPlate: WALL_PLATE,
  ridge: { id: 'terminal:ridge-1', thicknessMm: 40 },
  intermediateSupports: [],
};

const COLLAR_TIE: RoofTemplateSpec = {
  ...GABLE,
  ridge: {
    id: 'terminal:ridge-1',
    thicknessMm: 40,
    connection: 'direct-meeting',
  },
  structure: {
    system: 'rafter-collar-tie',
    collarTie: {
      heightAboveWallPlateMm: 1400,
      section: { widthMm: 100, depthMm: 38 },
    },
  },
};

function skeletonOf(template: RoofTemplateSpec): RoofSkeleton {
  return createRoofSkeletonFromResolved(resolveRoofTemplate(template));
}

function sceneOf(template: RoofTemplateSpec): TechnicalScene {
  return createRoofTechnicalScene({ skeleton: skeletonOf(template) });
}

function groupOf(scene: TechnicalScene, group: string) {
  return scene.entities.filter((entity) => entity.semanticGroup === group);
}

function memberOf(skeleton: RoofSkeleton, id: string): SkeletonMember3D {
  return skeleton.members.find((member) => member.id === id)!;
}

describe('scene identity', () => {
  it('gives every selectable entity a canonical source identity', () => {
    for (const template of [GABLE, HIP, COLLAR_TIE])
      for (const entity of sceneOf(template).entities)
        if (entity.selectable) {
          expect(entity.sourceRef.kind).toBe('skeleton-member');
          expect(typeof entity.sourceRef.memberId).toBe('string');
          expect(entity.sourceRef.memberId!.length).toBeGreaterThan(0);
          expect(typeof entity.sourceRef.selectionId).toBe('string');
          expect(typeof entity.sourceRef.prototypeId).toBe('string');
        }
  });

  it('mints unique entity IDs and never reuses a domain ID as scene identity', () => {
    for (const template of [GABLE, HIP, COLLAR_TIE]) {
      const scene = sceneOf(template);
      const ids = scene.entities.map((entity) => entity.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const entity of scene.entities)
        expect(entity.id).not.toBe(entity.sourceRef.memberId);
    }
  });

  it('maps every K1, H1 and J1 scene entity to its own member identity', () => {
    const skeleton = skeletonOf(HIP);
    const scene = createRoofTechnicalScene({ skeleton });
    for (const [group, kind] of [
      ['common-rafter', 'rafter'],
      ['hip-rafter', 'hip-rafter'],
      ['jack-rafter', 'jack-rafter'],
    ] as const) {
      const entities = groupOf(scene, group);
      expect(entities.length).toBeGreaterThan(0);
      for (const entity of entities) {
        const member = memberOf(skeleton, entity.sourceRef.memberId!);
        expect(member).toBeDefined();
        expect(member.kind).toBe(kind);
        expect(entity.sourceRef.selectionId).toBe(member.selectionId);
        expect(entity.sourceRef.prototypeId).toBe(member.prototypeId);
      }
    }
  });

  it('maps every collar tie to its own member identity', () => {
    const skeleton = skeletonOf(COLLAR_TIE);
    const scene = createRoofTechnicalScene({ skeleton });
    const ties = groupOf(scene, 'collar-tie');
    expect(ties.length).toBeGreaterThan(0);
    for (const entity of ties)
      expect(memberOf(skeleton, entity.sourceRef.memberId!).kind).toBe(
        'collar-tie',
      );
  });

  it('derives the semantic family from the structured kind, not a display code', () => {
    const scene = createRoofTechnicalScene({ skeleton: skeletonOf(HIP) });
    expect(groupOf(scene, 'hip-rafter')[0]!.label.familyCode).toBe('H1');
    expect(groupOf(scene, 'jack-rafter')[0]!.label.familyCode).toBe('J1');
    expect(groupOf(scene, 'common-rafter')[0]!.label.familyCode).toBe('K1');
    // A display code is shared by a whole family and therefore cannot be
    // identity: the members behind it stay individually addressable.
    const jacks = groupOf(scene, 'jack-rafter');
    expect(jacks.length).toBeGreaterThan(1);
    expect(new Set(jacks.map((entity) => entity.label.familyCode)).size).toBe(
      1,
    );
    expect(new Set(jacks.map((entity) => entity.sourceRef.memberId)).size).toBe(
      jacks.length,
    );
  });

  it('draws supports and openings only when the model resolves them', () => {
    const gable = sceneOf(GABLE);
    expect(groupOf(gable, 'collar-tie')).toHaveLength(0);
    expect(groupOf(gable, 'hip-rafter')).toHaveLength(0);
    expect(groupOf(gable, 'jack-rafter')).toHaveLength(0);
    expect(groupOf(gable, 'wall-plate').length).toBeGreaterThan(0);
    expect(groupOf(gable, 'ridge').length).toBeGreaterThan(0);
  });

  it('never claims finished connection geometry, and names the H1/J1 limit', () => {
    const scene = sceneOf(HIP);
    for (const entity of scene.entities)
      expect(entity.geometryStatus).toBe('reference');
    for (const entity of groupOf(scene, 'hip-rafter'))
      expect(entity.limitations).toContain('compound-connection-not-resolved');
    for (const entity of groupOf(scene, 'jack-rafter'))
      expect(entity.limitations).toContain('compound-connection-not-resolved');
    for (const entity of groupOf(scene, 'common-rafter')) {
      expect(entity.limitations).toContain('no-cut-solids');
      expect(entity.limitations).not.toContain(
        'compound-connection-not-resolved',
      );
    }
  });

  it('carries roof planes as unselectable presentation context', () => {
    const planes = groupOf(sceneOf(HIP), 'roof-plane');
    expect(planes.length).toBeGreaterThan(0);
    for (const plane of planes) {
      expect(plane.selectable).toBe(false);
      expect(plane.geometry.kind).toBe('polygon');
      expect(plane.sourceRef.roofPlaneId).toBeTruthy();
    }
    expect(
      createRoofTechnicalScene({
        skeleton: skeletonOf(HIP),
        includeRoofPlanes: false,
      }).entities.filter((entity) => entity.kind === 'roof-plane'),
    ).toHaveLength(0);
  });

  it('is pure: the same skeleton always produces the same scene', () => {
    const skeleton = skeletonOf(HIP);
    expect(createRoofTechnicalScene({ skeleton })).toEqual(
      createRoofTechnicalScene({ skeleton }),
    );
  });
});

describe('solids follow resolved values', () => {
  it('changing the section changes the visible cross section only', () => {
    const wide = sceneOf({
      ...GABLE,
      rafterSection: { widthMm: 120, depthMm: 200 },
    });
    const base = sceneOf(GABLE);
    const first = (scene: TechnicalScene) =>
      groupOf(scene, 'common-rafter')[0]!.geometry as Extract<
        TechnicalSceneEntity['geometry'],
        { kind: 'oriented-box' }
      >;
    expect(first(base).size.widthMm).toBe(80);
    expect(first(wide).size.widthMm).toBe(120);
    expect(first(wide).size.depthMm).toBe(first(base).size.depthMm);
    expect(first(wide).size.alongMm).toBeCloseTo(first(base).size.alongMm, 9);
  });

  it('changing the resolved length changes the solid length', () => {
    const first = (template: RoofTemplateSpec) =>
      groupOf(sceneOf(template), 'common-rafter')[0]!;
    const shortEave = first(GABLE);
    const longEave = first({ ...GABLE, eaveOverhangMm: 1200 });
    expect(longEave.lengthMm!).toBeGreaterThan(shortEave.lengthMm!);
  });

  it('centres the solid exactly on the resolved member axis', () => {
    const skeleton = skeletonOf(HIP);
    const scene = createRoofTechnicalScene({ skeleton });
    for (const entity of scene.entities) {
      if (entity.geometry.kind !== 'oriented-box') continue;
      const member = memberOf(skeleton, entity.sourceRef.memberId!);
      expect(entity.geometry.axis.from).toEqual(member.from);
      expect(entity.geometry.axis.to).toEqual(member.to);
      expect(entity.geometry.center.x).toBeCloseTo(
        (member.from.x + member.to.x) / 2,
        9,
      );
      expect(entity.geometry.center.y).toBeCloseTo(
        (member.from.y + member.to.y) / 2,
        9,
      );
      expect(entity.geometry.center.z).toBeCloseTo(
        (member.from.z + member.to.z) / 2,
        9,
      );
      expect(entity.lengthMm).toBeCloseTo(
        Math.hypot(
          member.to.x - member.from.x,
          member.to.y - member.from.y,
          member.to.z - member.from.z,
        ),
        9,
      );
    }
  });

  it('keeps the canonical millimetre, Z-up coordinate system untouched', () => {
    const scene = sceneOf(GABLE);
    expect(scene.coordinateSystem).toEqual({
      unit: 'mm',
      handedness: 'right',
      upAxis: 'z',
      axes: { x: 'transverse', y: 'longitudinal', z: 'vertical' },
    });
  });
});

describe('oriented-box transform', () => {
  const section = { widthMm: 80, depthMm: 180 };
  const cases = {
    horizontal: {
      from: { x: -4000, y: 0, z: 0 },
      to: { x: -4000, y: 10000, z: 0 },
    },
    sloped: {
      from: { x: -4600, y: 900, z: -469 },
      to: { x: 0, y: 900, z: 3125 },
    },
    diagonal: {
      from: { x: -4500, y: -500, z: 0 },
      to: { x: 0, y: 4000, z: 2800 },
    },
  } as const;

  for (const [name, axis] of Object.entries(cases))
    it(`resolves a finite orthonormal frame for a ${name} member`, () => {
      const box = orientedBoxForMember({ ...axis, section, kind: 'rafter' });
      const expected = Math.hypot(
        axis.to.x - axis.from.x,
        axis.to.y - axis.from.y,
        axis.to.z - axis.from.z,
      );
      expect(box.size.alongMm).toBeCloseTo(expected, 9);
      expect(box.size.widthMm).toBe(80);
      expect(box.size.depthMm).toBe(180);
      const { width, along, depth } = box.basis;
      for (const vector of [width, along, depth]) {
        expect([vector.x, vector.y, vector.z].every(Number.isFinite)).toBe(
          true,
        );
        expect(Math.hypot(vector.x, vector.y, vector.z)).toBeCloseTo(1, 9);
      }
      const dot = (a: typeof width, b: typeof width) =>
        a.x * b.x + a.y * b.y + a.z * b.z;
      expect(dot(width, along)).toBeCloseTo(0, 9);
      expect(dot(width, depth)).toBeCloseTo(0, 9);
      expect(dot(along, depth)).toBeCloseTo(0, 9);
      // Right-handed in the declared order (width, along, depth).
      const cross = {
        x: along.y * depth.z - along.z * depth.y,
        y: along.z * depth.x - along.x * depth.z,
        z: along.x * depth.y - along.y * depth.x,
      };
      expect(dot(width, cross)).toBeCloseTo(1, 9);
      // `along` points from `from` to `to`, and the axis stays verbatim.
      expect(box.axis.from).toEqual(axis.from);
      expect(along.x * (axis.to.x - axis.from.x)).toBeGreaterThanOrEqual(0);
    });

  it('keeps a vertical member out of the scene rather than inventing a frame', () => {
    // A purely vertical axis has no plan direction, so the section cannot be
    // oriented by the shared rule. The solver produces none today; the scene
    // must not fabricate one.
    expect(() =>
      orientedBoxForMember({
        from: { x: 0, y: 0, z: 0 },
        to: { x: 0, y: 0, z: 2400 },
        section,
        kind: 'purlin',
      }),
    ).toThrow('invalid_prism_orientation');
    const scene = createRoofTechnicalScene({
      skeleton: {
        ridgeHeightMm: 2400,
        members: [
          {
            id: 'instance:vertical',
            prototypeId: 'member:post',
            selectionId: 'member:post',
            kind: 'purlin',
            from: { x: 0, y: 0, z: 0 },
            to: { x: 0, y: 0, z: 2400 },
            section,
            side: 'center',
          },
        ],
      },
    });
    expect(scene.entities).toHaveLength(0);
    expect(scene.bounds.empty).toBe(true);
  });
});

describe('scene bounds', () => {
  it('contains every corner of every entity', () => {
    for (const template of [GABLE, HIP, COLLAR_TIE]) {
      const scene = sceneOf(template);
      expect(scene.bounds.empty).toBe(false);
      for (const entity of scene.entities)
        for (const corner of sceneGeometryCorners(entity.geometry)) {
          expect(corner.x).toBeGreaterThanOrEqual(scene.bounds.min.x - 1e-6);
          expect(corner.x).toBeLessThanOrEqual(scene.bounds.max.x + 1e-6);
          expect(corner.y).toBeGreaterThanOrEqual(scene.bounds.min.y - 1e-6);
          expect(corner.y).toBeLessThanOrEqual(scene.bounds.max.y + 1e-6);
          expect(corner.z).toBeGreaterThanOrEqual(scene.bounds.min.z - 1e-6);
          expect(corner.z).toBeLessThanOrEqual(scene.bounds.max.z + 1e-6);
        }
    }
  });

  it('reports a finite radius and centre for the fit helper', () => {
    const { bounds } = sceneOf(HIP);
    expect(
      [
        bounds.radiusMm,
        bounds.center.x,
        bounds.center.y,
        bounds.center.z,
      ].every(Number.isFinite),
    ).toBe(true);
    expect(bounds.radiusMm).toBeGreaterThan(0);
  });

  it('falls back safely for an empty scene', () => {
    const scene = createRoofTechnicalScene({
      skeleton: { ridgeHeightMm: 0, members: [] },
    });
    expect(scene.entities).toEqual([]);
    expect(scene.bounds.empty).toBe(true);
    expect(scene.bounds.radiusMm).toBeGreaterThan(0);
  });
});
