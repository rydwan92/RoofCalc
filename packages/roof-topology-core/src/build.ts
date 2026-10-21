import {
  distance,
  perimeter,
  pitchOf,
  planArea,
  planeFrame,
  polygonArea,
  polygonsOverlap,
  upwardNormal,
} from './geometry';
import {
  ROOF_EDGE_KINDS,
  ROOF_SCENE_CONTRACT_VERSION,
  type EntityStatus,
  type RoofEdge,
  type RoofEdgeKind,
  type RoofPlane,
  type RoofSceneGraph,
  type SceneSource,
  type Vec3,
} from './model';

/**
 * Builders fill in what follows from the given polygon (frame, normal,
 * pitch) so every producer — solver adapter, drawing recognition, test
 * fixture — describes a plane the same way.
 */
export function createRoofPlane(input: {
  id: string;
  structureId: string;
  polygon: readonly Vec3[];
  source: SceneSource;
  status?: EntityStatus;
}): RoofPlane {
  const polygon = input.polygon.map((point) => ({ ...point }));
  const normal = upwardNormal(polygon);
  return {
    id: input.id,
    structureId: input.structureId,
    polygon,
    frame: planeFrame(polygon, normal),
    normal,
    pitchDeg: pitchOf(normal),
    status: input.status ?? 'resolved',
    source: input.source,
  };
}

export function createRoofEdge(input: {
  id: string;
  kind: RoofEdgeKind;
  from: Vec3;
  to: Vec3;
  planeIds: readonly string[];
  source: SceneSource;
  status?: EntityStatus;
}): RoofEdge {
  return {
    id: input.id,
    kind: input.kind,
    from: { ...input.from },
    to: { ...input.to },
    planeIds: [...input.planeIds],
    status: input.status ?? 'resolved',
    source: input.source,
  };
}

export function emptyRoofScene(): RoofSceneGraph {
  return {
    contractVersion: ROOF_SCENE_CONTRACT_VERSION,
    structures: [],
    planes: [],
    edges: [],
    openings: [],
    connections: [],
  };
}

export class RoofSceneMergeError extends Error {
  override readonly name = 'RoofSceneMergeError';
  constructor(readonly ids: readonly string[]) {
    super(`Roof scenes share entity IDs: ${ids.join(', ')}`);
  }
}

/**
 * Puts several structure graphs into one scene. IDs are opaque and must
 * already differ: a collision throws instead of silently letting one
 * entity shadow another (VNext-6.1 audit).
 */
export function mergeRoofScenes(
  ...scenes: readonly RoofSceneGraph[]
): RoofSceneGraph {
  const merged: RoofSceneGraph = {
    contractVersion: ROOF_SCENE_CONTRACT_VERSION,
    structures: scenes.flatMap((scene) => scene.structures),
    planes: scenes.flatMap((scene) => scene.planes),
    edges: scenes.flatMap((scene) => scene.edges),
    openings: scenes.flatMap((scene) => scene.openings),
    connections: scenes.flatMap((scene) => scene.connections),
  };
  const seen = new Set<string>();
  const collisions = new Set<string>();
  for (const entity of [
    ...merged.structures,
    ...merged.planes,
    ...merged.edges,
    ...merged.openings,
    ...merged.connections,
  ]) {
    if (seen.has(entity.id)) collisions.add(entity.id);
    seen.add(entity.id);
  }
  if (collisions.size) throw new RoofSceneMergeError([...collisions]);
  return merged;
}

/**
 * Places a structure's graph in the world (ADR-008): rotation about the
 * vertical axis through the origin, then translation. Frames, normals and
 * pitches are recomputed from the moved polygons, so the result is
 * described exactly like any other graph.
 */
export function transformRoofScene(
  scene: RoofSceneGraph,
  transform: { translation: Vec3; rotationAboutVerticalDeg: number },
): RoofSceneGraph {
  const radians = (transform.rotationAboutVerticalDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const move = (point: Vec3): Vec3 => ({
    x: point.x * cos - point.y * sin + transform.translation.x,
    y: point.x * sin + point.y * cos + transform.translation.y,
    z: point.z + transform.translation.z,
  });
  return {
    ...scene,
    structures: scene.structures.map((structure) => ({
      ...structure,
      transform: {
        translation: move(structure.transform.translation),
        rotationAboutVerticalDeg:
          structure.transform.rotationAboutVerticalDeg +
          transform.rotationAboutVerticalDeg,
      },
    })),
    planes: scene.planes.map((plane) =>
      createRoofPlane({ ...plane, polygon: plane.polygon.map(move) }),
    ),
    edges: scene.edges.map((edge) => ({
      ...edge,
      from: move(edge.from),
      to: move(edge.to),
    })),
    openings: scene.openings.map((opening) => ({
      ...opening,
      polygon: opening.polygon.map(move),
    })),
  };
}

/* -------------------------------- metrics -------------------------------- */

export interface RoofPlaneMetrics {
  planeId: string;
  structureId: string;
  /** True sloped area, mm². */
  areaMm2: number;
  /** Horizontal projection, mm². */
  planAreaMm2: number;
  /** Sum of the openings' areas on this plane. */
  openingAreaMm2: number;
  /**
   * False when openings on this plane overlap: the sum then counts the
   * shared part twice, so no net area is given (VNext-6.1 audit).
   */
  openingAreaExact: boolean;
  /** Sloped area minus openings — only when the opening area is exact. */
  netAreaMm2?: number;
  pitchDeg: number;
  perimeterMm: number;
}

export interface RoofSceneMetrics {
  planes: RoofPlaneMetrics[];
  totalAreaMm2: number;
  totalPlanAreaMm2: number;
  totalOpeningAreaMm2: number;
  /** False when any plane's openings overlap (no exact net area). */
  openingAreaExact: boolean;
  edges: Record<RoofEdgeKind, { count: number; lengthMm: number }>;
}

export function roofSceneMetrics(graph: RoofSceneGraph): RoofSceneMetrics {
  const planes = graph.planes.map((plane): RoofPlaneMetrics => {
    const openings = graph.openings
      .filter((opening) => opening.planeId === plane.id)
      .map((opening) => opening.polygon);
    const areaMm2 = polygonArea(plane.polygon);
    const openingAreaMm2 = openings.reduce(
      (sum, polygon) => sum + polygonArea(polygon),
      0,
    );
    const openingAreaExact = openings.every((polygon, index) =>
      openings
        .slice(index + 1)
        .every((other) => !polygonsOverlap(polygon, other)),
    );
    return {
      planeId: plane.id,
      structureId: plane.structureId,
      areaMm2,
      planAreaMm2: planArea(plane.polygon),
      openingAreaMm2,
      openingAreaExact,
      ...(openingAreaExact
        ? { netAreaMm2: Math.max(0, areaMm2 - openingAreaMm2) }
        : {}),
      pitchDeg: plane.pitchDeg,
      perimeterMm: perimeter(plane.polygon),
    };
  });
  const edges = Object.fromEntries(
    ROOF_EDGE_KINDS.map((kind) => {
      const ofKind = graph.edges.filter((edge) => edge.kind === kind);
      return [
        kind,
        {
          count: ofKind.length,
          lengthMm: ofKind.reduce(
            (sum, edge) => sum + distance(edge.from, edge.to),
            0,
          ),
        },
      ];
    }),
  ) as RoofSceneMetrics['edges'];
  return {
    planes,
    totalAreaMm2: planes.reduce((sum, plane) => sum + plane.areaMm2, 0),
    totalPlanAreaMm2: planes.reduce((sum, plane) => sum + plane.planAreaMm2, 0),
    totalOpeningAreaMm2: planes.reduce(
      (sum, plane) => sum + plane.openingAreaMm2,
      0,
    ),
    openingAreaExact: planes.every((plane) => plane.openingAreaExact),
    edges,
  };
}

/** Which planes meet which, and along which edge. */
export function planeAdjacency(graph: RoofSceneGraph): {
  planeId: string;
  neighbours: { planeId: string; edgeId: string; kind: RoofEdgeKind }[];
}[] {
  return graph.planes.map((plane) => ({
    planeId: plane.id,
    neighbours: graph.edges.flatMap((edge) =>
      edge.planeIds.length === 2 && edge.planeIds.includes(plane.id)
        ? [
            {
              planeId: edge.planeIds.find((id) => id !== plane.id)!,
              edgeId: edge.id,
              kind: edge.kind,
            },
          ]
        : [],
    ),
  }));
}
