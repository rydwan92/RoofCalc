import {
  perimeter,
  pitchOf,
  planArea,
  planeFrame,
  polygonArea,
  upwardNormal,
  distance,
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

/** Puts several structure graphs into one scene (IDs must already differ). */
export function mergeRoofScenes(
  ...scenes: readonly RoofSceneGraph[]
): RoofSceneGraph {
  return {
    contractVersion: ROOF_SCENE_CONTRACT_VERSION,
    structures: scenes.flatMap((scene) => scene.structures),
    planes: scenes.flatMap((scene) => scene.planes),
    edges: scenes.flatMap((scene) => scene.edges),
    openings: scenes.flatMap((scene) => scene.openings),
    connections: scenes.flatMap((scene) => scene.connections),
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
  /** Sum of the openings' areas on this plane (overlaps counted twice). */
  openingAreaMm2: number;
  pitchDeg: number;
  perimeterMm: number;
}

export interface RoofSceneMetrics {
  planes: RoofPlaneMetrics[];
  totalAreaMm2: number;
  totalPlanAreaMm2: number;
  totalOpeningAreaMm2: number;
  edges: Record<RoofEdgeKind, { count: number; lengthMm: number }>;
}

export function roofSceneMetrics(graph: RoofSceneGraph): RoofSceneMetrics {
  const planes = graph.planes.map((plane) => ({
    planeId: plane.id,
    structureId: plane.structureId,
    areaMm2: polygonArea(plane.polygon),
    planAreaMm2: planArea(plane.polygon),
    openingAreaMm2: graph.openings
      .filter((opening) => opening.planeId === plane.id)
      .reduce((sum, opening) => sum + polygonArea(opening.polygon), 0),
    pitchDeg: plane.pitchDeg,
    perimeterMm: perimeter(plane.polygon),
  }));
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
