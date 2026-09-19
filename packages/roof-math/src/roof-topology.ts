import type { Point3D, RoofPlanePosition } from '@cieslacalc/timber-model';
import type { RoofSurfaceGeometryResult } from './roof-surface';

/**
 * V51 canonical roof features: the physical lines of one resolved roof.
 *
 * Every plane polygon edge is matched against every other plane's edges in
 * resolved 3D world coordinates. A line shared by two planes is ONE physical
 * feature (a ridge, hip or valley) carrying both incident plane IDs; a line
 * owned by one plane is an eave (horizontal, at that plane's lowest level) or a
 * verge (sloped). Semantics come from topology and geometry only — never from
 * parsing a plane or feature ID (ADR-007).
 *
 * Visualization, covering accessories, drainage, the material plan, cost and
 * documents all read this one result. Nothing here knows a product or price.
 */
export type RoofLineFeatureKind = 'eave' | 'ridge' | 'hip' | 'verge' | 'valley';

export type RoofLineEvidence =
  | 'unshared-horizontal-lowest'
  | 'unshared-horizontal-highest'
  | 'unshared-sloped'
  | 'shared-horizontal'
  | 'shared-sloped-convex'
  | 'shared-sloped-concave';

export interface ResolvedRoofFeature {
  /** Opaque, deterministic for identical geometry. Never parse it. */
  id: string;
  kind: RoofLineFeatureKind;
  /** 1-based ordinal within its kind, for generated display labels only. */
  ordinal: number;
  start: Point3D;
  end: Point3D;
  /** True resolved 3D length, mm. */
  lengthMm: number;
  incidentPlaneIds: string[];
  evidence: RoofLineEvidence;
  /**
   * Eaves only: unit plan direction pointing away from the roof. Eaves are
   * oriented so the roof lies to the left walking start → end (viewed from
   * above), which makes adjacent eaves meet end-to-start around the roof.
   */
  outwardPlan?: { x: number; y: number };
}

export type OpeningEdgeSide = 'lower' | 'upper' | 'side';

/**
 * A roof-window boundary. Deliberately not a roof-line kind: an opening edge
 * is never an eave or verge, and later drives flashings and tile cuts.
 */
export interface ResolvedOpeningEdge {
  id: string;
  sourceFeatureId: string;
  roofPlaneId: string;
  side: OpeningEdgeSide;
  from: RoofPlanePosition;
  to: RoofPlanePosition;
  lengthMm: number;
}

/** Where two eaves meet. Its kind follows the sloped line at the vertex. */
export interface ResolvedEaveCorner {
  id: string;
  point: Point3D;
  /** The eave that ends here, then the eave that starts here. */
  endingEaveId: string;
  startingEaveId: string;
  kind: 'external' | 'internal';
  /** The hip (external) or valley (internal) rising from the corner, if any. */
  riseFeatureId?: string;
}

/** A plane's own polygon edge mapped to its canonical feature. */
export interface RoofPlaneFeatureEdge {
  featureId: string;
  kind: RoofLineFeatureKind;
  from: RoofPlanePosition;
  to: RoofPlanePosition;
  /** The plane edge runs from the feature's start to its end. */
  sameDirectionAsFeature: boolean;
}

export interface RoofFeatureTopology {
  features: ResolvedRoofFeature[];
  openingEdges: ResolvedOpeningEdge[];
  eaveCorners: ResolvedEaveCorner[];
  planeEdges: { roofPlaneId: string; edges: RoofPlaneFeatureEdge[] }[];
}

const TOLERANCE_MM = 1;
const KIND_ORDER: RoofLineFeatureKind[] = [
  'eave',
  'ridge',
  'hip',
  'valley',
  'verge',
];

const same = (a: Point3D, b: Point3D) =>
  Math.abs(a.x - b.x) <= TOLERANCE_MM &&
  Math.abs(a.y - b.y) <= TOLERANCE_MM &&
  Math.abs(a.z - b.z) <= TOLERANCE_MM;
const distance = (a: Point3D, b: Point3D) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const sub = (a: Point3D, b: Point3D) => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
const crossZ = (a: Point3D, b: Point3D) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const centroid = (points: readonly Point3D[]) => ({
  x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
  y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  z: points.reduce((sum, p) => sum + p.z, 0) / points.length,
});

/** Upward unit normal of a planar polygon (Newell's method). */
function upwardNormal(points: readonly Point3D[]) {
  let normal = { x: 0, y: 0, z: 0 };
  points.forEach((a, index) => {
    const b = points[(index + 1) % points.length]!;
    normal = {
      x: normal.x + (a.y - b.y) * (a.z + b.z),
      y: normal.y + (a.z - b.z) * (a.x + b.x),
      z: normal.z + (a.x - b.x) * (a.y + b.y),
    };
  });
  const size = Math.hypot(normal.x, normal.y, normal.z) || 1;
  const sign = normal.z < 0 ? -1 : 1;
  return {
    x: (sign * normal.x) / size,
    y: (sign * normal.y) / size,
    z: (sign * normal.z) / size,
  };
}

interface RawEdge {
  roofPlaneId: string;
  index: number;
  from: Point3D;
  to: Point3D;
  localFrom: RoofPlanePosition;
  localTo: RoofPlanePosition;
}

interface RawFeature {
  kind: RoofLineFeatureKind;
  start: Point3D;
  end: Point3D;
  incidentPlaneIds: string[];
  evidence: RoofLineEvidence;
  edges: RawEdge[];
  outwardPlan?: { x: number; y: number };
}

/**
 * Resolves the canonical physical roof lines, eave corners and opening edges
 * from an already-resolved roof surface. Pure and cheap: it re-runs no solver.
 */
export function resolveRoofFeatureTopology(
  surface: RoofSurfaceGeometryResult,
): RoofFeatureTopology {
  const planes = surface.planes.filter(
    (plane) => plane.worldPolygon.length >= 3,
  );
  const allPoints = planes.flatMap((plane) => plane.worldPolygon);
  if (!allPoints.length)
    return { features: [], openingEdges: [], eaveCorners: [], planeEdges: [] };
  const center = centroid(allPoints);
  const edges: RawEdge[] = planes.flatMap((plane) =>
    plane.worldPolygon.flatMap((from, index) => {
      const next = (index + 1) % plane.worldPolygon.length;
      const to = plane.worldPolygon[next]!;
      if (distance(from, to) <= TOLERANCE_MM) return [];
      return [
        {
          roofPlaneId: plane.roofPlaneId,
          index,
          from,
          to,
          localFrom: plane.polygon[index]!,
          localTo: plane.polygon[next]!,
        },
      ];
    }),
  );
  const planeById = new Map(planes.map((plane) => [plane.roofPlaneId, plane]));
  const used = new Set<RawEdge>();
  const raw: RawFeature[] = [];
  for (const edge of edges) {
    if (used.has(edge)) continue;
    used.add(edge);
    const partners = edges.filter(
      (other) =>
        !used.has(other) &&
        other.roofPlaneId !== edge.roofPlaneId &&
        ((same(other.from, edge.from) && same(other.to, edge.to)) ||
          (same(other.from, edge.to) && same(other.to, edge.from))),
    );
    partners.forEach((partner) => used.add(partner));
    const horizontal = Math.abs(edge.to.z - edge.from.z) <= TOLERANCE_MM;
    const incidentPlaneIds = [
      edge.roofPlaneId,
      ...partners.map((partner) => partner.roofPlaneId),
    ].sort();
    if (partners.length) {
      if (horizontal) {
        raw.push({
          kind: 'ridge',
          start: edge.from,
          end: edge.to,
          incidentPlaneIds,
          evidence: 'shared-horizontal',
          edges: [edge, ...partners],
        });
        continue;
      }
      // Convex when the neighbouring plane lies below this plane's surface.
      const own = planeById.get(edge.roofPlaneId)!;
      const other = planeById.get(partners[0]!.roofPlaneId)!;
      const normal = upwardNormal(own.worldPolygon);
      const offset = sub(centroid(other.worldPolygon), edge.from);
      const convex =
        normal.x * offset.x + normal.y * offset.y + normal.z * offset.z <
        -TOLERANCE_MM;
      raw.push({
        kind: convex ? 'hip' : 'valley',
        start: edge.from.z <= edge.to.z ? edge.from : edge.to,
        end: edge.from.z <= edge.to.z ? edge.to : edge.from,
        incidentPlaneIds,
        evidence: convex ? 'shared-sloped-convex' : 'shared-sloped-concave',
        edges: [edge, ...partners],
      });
      continue;
    }
    if (!horizontal) {
      raw.push({
        kind: 'verge',
        start: edge.from.z <= edge.to.z ? edge.from : edge.to,
        end: edge.from.z <= edge.to.z ? edge.to : edge.from,
        incidentPlaneIds,
        evidence: 'unshared-sloped',
        edges: [edge],
      });
      continue;
    }
    const plane = planeById.get(edge.roofPlaneId)!;
    const lowest = Math.min(...plane.worldPolygon.map((point) => point.z));
    if (Math.abs(edge.from.z - lowest) > TOLERANCE_MM) {
      raw.push({
        kind: 'ridge',
        start: edge.from,
        end: edge.to,
        incidentPlaneIds,
        evidence: 'unshared-horizontal-highest',
        edges: [edge],
      });
      continue;
    }
    // Orient so the plane lies to the left walking start → end (from above).
    const inside = centroid(plane.worldPolygon);
    const direction = sub(edge.to, edge.from);
    const toInside = sub(inside, edge.from);
    const left = crossZ(direction, toInside).z > 0;
    const start = left ? edge.from : edge.to;
    const end = left ? edge.to : edge.from;
    const planLength = Math.hypot(end.x - start.x, end.y - start.y) || 1;
    raw.push({
      kind: 'eave',
      start,
      end,
      incidentPlaneIds,
      evidence: 'unshared-horizontal-lowest',
      edges: [edge],
      outwardPlan: {
        x: (end.y - start.y) / planLength,
        y: -(end.x - start.x) / planLength,
      },
    });
  }
  // Deterministic order: kind, then plan angle around the roof starting at
  // the left (−x) side and turning towards the front (−y), then height.
  const angleKey = (feature: RawFeature) => {
    const mid = {
      x: (feature.start.x + feature.end.x) / 2 - center.x,
      y: (feature.start.y + feature.end.y) / 2 - center.y,
    };
    if (Math.hypot(mid.x, mid.y) <= TOLERANCE_MM) return 0;
    const degrees = (Math.atan2(mid.y, mid.x) * 180) / Math.PI;
    return (((180 - degrees) % 360) + 360) % 360;
  };
  raw.sort(
    (a, b) =>
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      angleKey(a) - angleKey(b) ||
      (a.start.z + a.end.z) / 2 - (b.start.z + b.end.z) / 2,
  );
  const ordinals = new Map<RoofLineFeatureKind, number>();
  const features: ResolvedRoofFeature[] = [];
  const planeEdges = new Map<
    string,
    (RoofPlaneFeatureEdge & { index: number })[]
  >();
  for (const item of raw) {
    const ordinal = (ordinals.get(item.kind) ?? 0) + 1;
    ordinals.set(item.kind, ordinal);
    const id = `roof-line:${item.kind}-${ordinal}`;
    features.push({
      id,
      kind: item.kind,
      ordinal,
      start: item.start,
      end: item.end,
      lengthMm: distance(item.start, item.end),
      incidentPlaneIds: item.incidentPlaneIds,
      evidence: item.evidence,
      ...(item.outwardPlan ? { outwardPlan: item.outwardPlan } : {}),
    });
    for (const edge of item.edges) {
      const list = planeEdges.get(edge.roofPlaneId) ?? [];
      list.push({
        featureId: id,
        kind: item.kind,
        from: edge.localFrom,
        to: edge.localTo,
        sameDirectionAsFeature: same(edge.from, item.start),
        index: edge.index,
      });
      planeEdges.set(edge.roofPlaneId, list);
    }
  }
  const eaves = features.filter((feature) => feature.kind === 'eave');
  const rising = features.filter(
    (feature) => feature.kind === 'hip' || feature.kind === 'valley',
  );
  const eaveCorners: ResolvedEaveCorner[] = [];
  for (const ending of eaves)
    for (const starting of eaves) {
      if (ending === starting || !same(ending.end, starting.start)) continue;
      const rise = rising.find(
        (feature) =>
          same(feature.start, ending.end) || same(feature.end, ending.end),
      );
      const a = sub(ending.end, ending.start);
      const b = sub(starting.end, starting.start);
      // Roof on the left of both eaves: a left turn is an external corner.
      const turn = a.x * b.y - a.y * b.x;
      eaveCorners.push({
        id: `eave-corner:${eaveCorners.length + 1}`,
        point: ending.end,
        endingEaveId: ending.id,
        startingEaveId: starting.id,
        kind: rise
          ? rise.kind === 'hip'
            ? 'external'
            : 'internal'
          : turn >= 0
            ? 'external'
            : 'internal',
        ...(rise ? { riseFeatureId: rise.id } : {}),
      });
    }
  const openingEdges: ResolvedOpeningEdge[] = [];
  for (const plane of planes)
    for (const opening of plane.openingPolygons) {
      const minV = Math.min(...opening.polygon.map((point) => point.vMm));
      const maxV = Math.max(...opening.polygon.map((point) => point.vMm));
      opening.polygon.forEach((from, index) => {
        const to = opening.polygon[(index + 1) % opening.polygon.length]!;
        const lengthMm = Math.hypot(to.uMm - from.uMm, to.vMm - from.vMm);
        if (lengthMm <= TOLERANCE_MM) return;
        const horizontal = Math.abs(to.vMm - from.vMm) <= TOLERANCE_MM;
        const side: OpeningEdgeSide = !horizontal
          ? 'side'
          : Math.abs(from.vMm - minV) <= TOLERANCE_MM
            ? 'lower'
            : Math.abs(from.vMm - maxV) <= TOLERANCE_MM
              ? 'upper'
              : 'side';
        openingEdges.push({
          id: `opening-edge:${openingEdges.length + 1}`,
          sourceFeatureId: opening.featureId,
          roofPlaneId: plane.roofPlaneId,
          side,
          from,
          to,
          lengthMm,
        });
      });
    }
  return {
    features,
    openingEdges,
    eaveCorners,
    planeEdges: planes.map((plane) => ({
      roofPlaneId: plane.roofPlaneId,
      edges: (planeEdges.get(plane.roofPlaneId) ?? [])
        .sort((a, b) => a.index - b.index)
        .map(({ featureId, kind, from, to, sameDirectionAsFeature }) => ({
          featureId,
          kind,
          from,
          to,
          sameDirectionAsFeature,
        })),
    })),
  };
}

/** Total true length of every feature of one kind. */
export function roofFeatureLength(
  topology: RoofFeatureTopology,
  kind: RoofLineFeatureKind,
): number {
  return topology.features
    .filter((feature) => feature.kind === kind)
    .reduce((sum, feature) => sum + feature.lengthMm, 0);
}
