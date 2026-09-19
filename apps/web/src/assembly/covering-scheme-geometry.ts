import type {
  RoofFeatureTopology,
  RoofLineFeatureKind,
} from '@cieslacalc/roof-math';

/**
 * V46 covering scheme presentation geometry (view layer only).
 *
 * V51: the edge semantics (eave, ridge, hip, verge, valley) are no longer
 * decided here. They come from the canonical roof features resolved by
 * `roof-math` (`resolveRoofFeatureTopology`), the same features the V50
 * accessories, drainage and documents read. This module only projects them
 * into the plane-local drawing and keeps presentation helpers. Nothing here
 * is counted.
 */
export interface LocalPoint {
  uMm: number;
  vMm: number;
}

export type PlaneEdgeKind = RoofLineFeatureKind;

export interface PlaneEdge {
  kind: PlaneEdgeKind;
  featureId: string;
  from: LocalPoint;
  to: LocalPoint;
  lengthMm: number;
  sameDirectionAsFeature: boolean;
}

/** Plane-local point at a normalized station along an edge's feature. */
export function pointAtFeatureStation(edge: PlaneEdge, station: number) {
  const t = edge.sameDirectionAsFeature ? station : 1 - station;
  return {
    uMm: edge.from.uMm + (edge.to.uMm - edge.from.uMm) * t,
    vMm: edge.from.vMm + (edge.to.vMm - edge.from.vMm) * t,
  };
}

/** A plane's own edges, labelled with their canonical roof feature. */
export function planeFeatureEdges(
  topology: RoofFeatureTopology,
  roofPlaneId: string,
): PlaneEdge[] {
  return (
    topology.planeEdges.find((plane) => plane.roofPlaneId === roofPlaneId)
      ?.edges ?? []
  ).map((edge) => ({
    kind: edge.kind,
    featureId: edge.featureId,
    from: edge.from,
    to: edge.to,
    sameDirectionAsFeature: edge.sameDirectionAsFeature,
    lengthMm: Math.hypot(
      edge.to.uMm - edge.from.uMm,
      edge.to.vMm - edge.from.vMm,
    ),
  }));
}

/**
 * Deterministic tone bucket for an illustrative tile (0..count-1). A stable
 * hash keeps the texture identical between renders, exports and screenshots.
 */
export function tileToneIndex(id: string, count = 3): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % count;
}

/** Regular gauge shared by the middle courses, or undefined when irregular. */
export function regularCourseGauge(
  stations: readonly number[],
): number | undefined {
  const sorted = [...stations].sort((a, b) => a - b);
  const gaps = sorted.slice(1).map((value, index) => value - sorted[index]!);
  if (!gaps.length) return undefined;
  const first = gaps[0]!;
  return gaps.every((gap) => Math.abs(gap - first) <= 0.5) ? first : undefined;
}
