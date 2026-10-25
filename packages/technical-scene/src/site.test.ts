import { describe, expect, it } from 'vitest';
import {
  mergeTechnicalScenes,
  placeTechnicalScene,
  SCENE_COORDINATE_SYSTEM,
  boundsOfEntities,
  type TechnicalScene,
  type TechnicalSceneEntity,
} from './index';

function box(id: string): TechnicalSceneEntity {
  return {
    id,
    kind: 'timber-member',
    semanticGroup: 'rafter',
    label: { family: 'K1', name: 'Krokiew' },
    geometry: {
      kind: 'oriented-box',
      center: { x: 1000, y: 0, z: 100 },
      basis: {
        width: { x: 0, y: 1, z: 0 },
        along: { x: 1, y: 0, z: 0 },
        depth: { x: 0, y: 0, z: 1 },
      },
      size: { widthMm: 80, alongMm: 2000, depthMm: 200 },
      axis: { from: { x: 0, y: 0, z: 100 }, to: { x: 2000, y: 0, z: 100 } },
    },
    selectable: true,
    sourceRef: { kind: 'timber-member', memberId: 'member:1' },
    geometryStatus: 'reference',
    limitations: [],
  } as unknown as TechnicalSceneEntity;
}

function scene(entities: TechnicalSceneEntity[]): TechnicalScene {
  return {
    coordinateSystem: SCENE_COORDINATE_SYSTEM,
    bounds: boundsOfEntities(entities),
    entities,
  };
}

/** VNext-14: structures placed on the site, as one scene. */
describe('the site scene', () => {
  it('turns a structure a quarter about the vertical, then moves it', () => {
    const placed = placeTechnicalScene(scene([box('scene:entity:0')]), {
      translation: { x: 5000, y: 0, z: 300 },
      rotationAboutVerticalDeg: 90,
    });
    const geometry = placed.entities[0]!.geometry;
    if (geometry.kind !== 'oriented-box') throw new Error('box expected');
    // (1000, 0) turned a quarter is (0, 1000); then moved by (5000, 0, 300).
    expect(geometry.center.x).toBeCloseTo(5000, 9);
    expect(geometry.center.y).toBeCloseTo(1000, 9);
    expect(geometry.center.z).toBeCloseTo(400, 9);
    // The member now runs along y; its section and length are unchanged.
    expect(geometry.basis.along.x).toBeCloseTo(0, 9);
    expect(geometry.basis.along.y).toBeCloseTo(1, 9);
    expect(geometry.size).toEqual({ widthMm: 80, alongMm: 2000, depthMm: 200 });
    expect(geometry.axis.to.y).toBeCloseTo(2000, 9);
    expect(placed.bounds.center.x).toBeCloseTo(5000, 6);
  });

  it('mints new ids for the merged scene and keeps each part beside it', () => {
    const merged = mergeTechnicalScenes([
      { key: 'structure:roof', scene: scene([box('scene:entity:0')]) },
      {
        key: 'structure:2',
        scene: placeTechnicalScene(scene([box('scene:entity:0')]), {
          translation: { x: 0, y: 10_000, z: 0 },
          rotationAboutVerticalDeg: 0,
        }),
      },
    ]);
    expect(merged.scene.entities.map((entity) => entity.id)).toEqual([
      'site:entity:0',
      'site:entity:1',
    ]);
    expect(merged.partOf).toEqual({
      'site:entity:0': 'structure:roof',
      'site:entity:1': 'structure:2',
    });
    // The bounds span both structures.
    expect(merged.scene.bounds.size.y).toBeGreaterThan(10_000);
  });
});
