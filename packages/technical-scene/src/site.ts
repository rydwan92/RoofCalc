import {
  SCENE_COORDINATE_SYSTEM,
  boundsOfEntities,
  type SceneGeometry,
  type ScenePoint3,
  type SceneVector3,
  type TechnicalScene,
  type TechnicalSceneEntity,
} from './scene';

/**
 * Where a structure stands on the site: a plan rotation about the vertical,
 * then a translation — the same rigid placement the roof topology core
 * applies to a structure's roof (`transformRoofScene`), so the site plan
 * and the site in 3D agree.
 */
export interface ScenePlacement {
  translation: ScenePoint3;
  rotationAboutVerticalDeg: number;
}

function placer({ translation, rotationAboutVerticalDeg }: ScenePlacement) {
  const radians = (rotationAboutVerticalDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const turn = (vector: SceneVector3): SceneVector3 => ({
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
    z: vector.z,
  });
  const move = (point: ScenePoint3): ScenePoint3 => {
    const turned = turn(point);
    return {
      x: turned.x + translation.x,
      y: turned.y + translation.y,
      z: turned.z + translation.z,
    };
  };
  return { turn, move };
}

function placeGeometry(
  geometry: SceneGeometry,
  { turn, move }: ReturnType<typeof placer>,
): SceneGeometry {
  switch (geometry.kind) {
    case 'oriented-box':
      return {
        ...geometry,
        center: move(geometry.center),
        basis: {
          width: turn(geometry.basis.width),
          along: turn(geometry.basis.along),
          depth: turn(geometry.basis.depth),
        },
        axis: { from: move(geometry.axis.from), to: move(geometry.axis.to) },
      };
    case 'polygon':
      return { ...geometry, points: geometry.points.map(move) };
    case 'line':
      return { ...geometry, from: move(geometry.from), to: move(geometry.to) };
    case 'extruded-profile':
      return {
        ...geometry,
        origin: move(geometry.origin),
        basis: {
          along: turn(geometry.basis.along),
          width: turn(geometry.basis.width),
          up: turn(geometry.basis.up),
        },
      };
  }
}

/**
 * VNext-14: one structure's scene placed on the site. A rigid motion only:
 * every solid keeps its real section, length and cuts.
 */
export function placeTechnicalScene(
  scene: TechnicalScene,
  placement: ScenePlacement,
): TechnicalScene {
  const motion = placer(placement);
  const entities = scene.entities.map((entity) => ({
    ...entity,
    geometry: placeGeometry(entity.geometry, motion),
  }));
  return { ...scene, entities, bounds: boundsOfEntities(entities) };
}

export interface MergedTechnicalScene {
  scene: TechnicalScene;
  /** Which part each merged entity came from, by its new id. */
  partOf: Record<string, string>;
}

/**
 * VNext-14: the scenes of several structures as one site scene. Entity ids
 * are scene-local, so they are minted anew; the part each came from is
 * carried beside the scene, never inside an id.
 */
export function mergeTechnicalScenes(
  parts: readonly { key: string; scene: TechnicalScene }[],
): MergedTechnicalScene {
  const entities: TechnicalSceneEntity[] = [];
  const partOf: Record<string, string> = {};
  for (const part of parts)
    for (const entity of part.scene.entities) {
      const id = `site:entity:${entities.length}`;
      entities.push({ ...entity, id });
      partOf[id] = part.key;
    }
  return {
    scene: {
      coordinateSystem:
        parts[0]?.scene.coordinateSystem ?? SCENE_COORDINATE_SYSTEM,
      bounds: boundsOfEntities(entities),
      entities,
    },
    partOf,
  };
}
