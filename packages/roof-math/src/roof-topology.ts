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

/**
 * V52: one roof opening as a physical perimeter in its own roof plane.
 *
 * Built from the canonical opening edges (plane-local `u` along the eave,
 * `v` up the slope) — never from screen or SVG coordinates. Edges are ordered
 * bottom → right → top → left (counter-clockwise seen from above the plane).
 * An opening clipped by the plane boundary is not a rectangle; it keeps its
 * edges but reports `rectangular: false`, so a flashing kit is never assumed
 * to fit it.
 */
export type OpeningPerimeterSide = 'bottom' | 'right' | 'top' | 'left';

export interface ResolvedOpeningPerimeterEdge {
  edgeId: string;
  side: OpeningPerimeterSide | 'other';
  from: RoofPlanePosition;
  to: RoofPlanePosition;
  /** The same edge in resolved 3D world coordinates. */
  worldFrom: Point3D;
  worldTo: Point3D;
  lengthMm: number;
}

export interface ResolvedRoofOpening {
  /** The roof-window feature (opaque). */
  featureId: string;
  roofPlaneId: string;
  /** 1-based, by plane order then position; display labels only (O1…). */
  ordinal: number;
  widthMm: number;
  heightMm: number;
  centre: RoofPlanePosition;
  perimeterMm: number;
  rectangular: boolean;
  /** Pitch of the owning plane from its resolved 3D polygon. */
  pitchDeg: number;
  edges: ResolvedOpeningPerimeterEdge[];
}

const SIDE_ORDER: (OpeningPerimeterSide | 'other')[] = [
  'bottom',
  'right',
  'top',
  'left',
  'other',
];

/**
 * The plane's own local → world map, recovered from its resolved polygon
 * pairs (local polygon[i] ↔ worldPolygon[i]); the pair of edge vectors with
 * the largest local determinant is used, so it is exact for a planar plane.
 */
function localToWorld(plane: RoofSurfaceGeometryResult['planes'][number]) {
  const local = plane.polygon;
  const world = plane.worldPolygon;
  let best = { det: 0, i: 1, j: 2 };
  for (let i = 1; i < local.length; i += 1)
    for (let j = i + 1; j < local.length; j += 1) {
      const det =
        (local[i]!.uMm - local[0]!.uMm) * (local[j]!.vMm - local[0]!.vMm) -
        (local[i]!.vMm - local[0]!.vMm) * (local[j]!.uMm - local[0]!.uMm);
      if (Math.abs(det) > Math.abs(best.det)) best = { det, i, j };
    }
  const a = {
    u: local[best.i]!.uMm - local[0]!.uMm,
    v: local[best.i]!.vMm - local[0]!.vMm,
  };
  const b = {
    u: local[best.j]!.uMm - local[0]!.uMm,
    v: local[best.j]!.vMm - local[0]!.vMm,
  };
  const wa = sub(world[best.i]!, world[0]!);
  const wb = sub(world[best.j]!, world[0]!);
  const det = best.det || 1;
  // Solve [a; b] · [U; V] = [wa; wb] for the world u and v axes.
  const axis = (key: 'x' | 'y' | 'z') => ({
    u: (wa[key] * b.v - wb[key] * a.v) / det,
    v: (a.u * wb[key] - b.u * wa[key]) / det,
  });
  const x = axis('x');
  const y = axis('y');
  const z = axis('z');
  const origin = world[0]!;
  const u0 = local[0]!.uMm;
  const v0 = local[0]!.vMm;
  return (point: RoofPlanePosition): Point3D => ({
    x: origin.x + x.u * (point.uMm - u0) + x.v * (point.vMm - v0),
    y: origin.y + y.u * (point.uMm - u0) + y.v * (point.vMm - v0),
    z: origin.z + z.u * (point.uMm - u0) + z.v * (point.vMm - v0),
  });
}

export function resolveRoofOpenings(
  surface: RoofSurfaceGeometryResult,
  topology: RoofFeatureTopology,
): ResolvedRoofOpening[] {
  const openings: ResolvedRoofOpening[] = [];
  for (const plane of surface.planes) {
    if (plane.worldPolygon.length < 3) continue;
    const toWorld = localToWorld(plane);
    const normal = upwardNormal(plane.worldPolygon);
    const pitchDeg =
      (Math.acos(Math.min(1, Math.max(-1, normal.z))) * 180) / Math.PI;
    const ordered = [...plane.openingPolygons].sort((a, b) => {
      const av = Math.min(...a.polygon.map((p) => p.vMm));
      const bv = Math.min(...b.polygon.map((p) => p.vMm));
      const au = Math.min(...a.polygon.map((p) => p.uMm));
      const bu = Math.min(...b.polygon.map((p) => p.uMm));
      return au - bu || av - bv;
    });
    for (const opening of ordered) {
      const us = opening.polygon.map((p) => p.uMm);
      const vs = opening.polygon.map((p) => p.vMm);
      const minU = Math.min(...us);
      const maxU = Math.max(...us);
      const minV = Math.min(...vs);
      const maxV = Math.max(...vs);
      const near = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE_MM;
      const edges = topology.openingEdges
        .filter(
          (edge) =>
            edge.sourceFeatureId === opening.featureId &&
            edge.roofPlaneId === plane.roofPlaneId,
        )
        .map((edge): ResolvedOpeningPerimeterEdge => {
          const horizontal = near(edge.from.vMm, edge.to.vMm);
          const vertical = near(edge.from.uMm, edge.to.uMm);
          const side: ResolvedOpeningPerimeterEdge['side'] =
            horizontal && near(edge.from.vMm, minV)
              ? 'bottom'
              : horizontal && near(edge.from.vMm, maxV)
                ? 'top'
                : vertical && near(edge.from.uMm, minU)
                  ? 'left'
                  : vertical && near(edge.from.uMm, maxU)
                    ? 'right'
                    : 'other';
          return {
            edgeId: edge.id,
            side,
            from: edge.from,
            to: edge.to,
            worldFrom: toWorld(edge.from),
            worldTo: toWorld(edge.to),
            lengthMm: edge.lengthMm,
          };
        })
        .sort(
          (a, b) =>
            SIDE_ORDER.indexOf(a.side) - SIDE_ORDER.indexOf(b.side) ||
            a.from.uMm - b.from.uMm ||
            a.from.vMm - b.from.vMm,
        );
      const rectangular =
        edges.length === 4 &&
        ['bottom', 'right', 'top', 'left'].every((side) =>
          edges.some((edge) => edge.side === side),
        );
      openings.push({
        featureId: opening.featureId,
        roofPlaneId: plane.roofPlaneId,
        ordinal: openings.length + 1,
        widthMm: maxU - minU,
        heightMm: maxV - minV,
        centre: { uMm: (minU + maxU) / 2, vMm: (minV + maxV) / 2 },
        perimeterMm: edges.reduce((sum, edge) => sum + edge.lengthMm, 0),
        rectangular,
        pitchDeg,
        edges,
      });
    }
  }
  return openings;
}

/**
 * V52: the ends of the ridge/hip line network. A ridge or hip end that meets
 * another ridge or hip is a junction (covered by the neighbouring line's
 * pieces); any other end is open and may need a closure. Decided by resolved
 * 3D endpoints only — never "2 × number of ridges".
 */
export type RoofLineEndContext = 'verge' | 'eave-corner' | 'free';

export interface RoofLineEnd {
  featureId: string;
  kind: 'ridge' | 'hip';
  end: 'start' | 'end';
  point: Point3D;
  open: boolean;
  /** Other ridge/hip features meeting at this end. */
  meetsFeatureIds: string[];
  /** What an open end stops at. */
  context?: RoofLineEndContext;
}

export function resolveRoofLineEnds(
  topology: RoofFeatureTopology,
): RoofLineEnd[] {
  const lines = topology.features.filter(
    (feature): feature is ResolvedRoofFeature & { kind: 'ridge' | 'hip' } =>
      feature.kind === 'ridge' || feature.kind === 'hip',
  );
  const others = topology.features.filter(
    (feature) => feature.kind !== 'ridge' && feature.kind !== 'hip',
  );
  return lines.flatMap((line) =>
    (['start', 'end'] as const).map((end) => {
      const point = line[end];
      const meets = lines
        .filter(
          (other) =>
            other !== line &&
            (same(other.start, point) || same(other.end, point)),
        )
        .map((other) => other.id);
      const touching = others.filter(
        (other) => same(other.start, point) || same(other.end, point),
      );
      const open = meets.length === 0;
      return {
        featureId: line.id,
        kind: line.kind,
        end,
        point,
        open,
        meetsFeatureIds: meets,
        ...(open
          ? {
              context: touching.some((item) => item.kind === 'eave')
                ? ('eave-corner' as const)
                : touching.some((item) => item.kind === 'verge')
                  ? ('verge' as const)
                  : ('free' as const),
            }
          : {}),
      };
    }),
  );
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
