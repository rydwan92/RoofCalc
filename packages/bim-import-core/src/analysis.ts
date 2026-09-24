import type { IfcRoofCandidate } from './index';
import { recognizeRegularHip } from './hip-analysis';

/** Physical IFC Z-up coordinates in source length units; never display data. */
export interface IfcAnalysisGeometry {
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
}

export interface IfcRoofAnalysisInput {
  sourceRoof: IfcRoofCandidate;
  sourceToMillimetres?: number;
  geometry: readonly IfcAnalysisGeometry[];
  semanticEvidence?: readonly string[];
}

export type IfcRoofAnalysis = {
  sourceRoof: IfcRoofCandidate;
  evidence: string[];
  warnings: string[];
} & (
  | {
      status: 'supported';
      roofType: 'gable' | 'hip';
      proposed: {
        buildingLengthMm: number;
        buildingWidthMm: number;
        pitchDeg: number;
      };
      geometry: {
        ridgeDirection: readonly [number, number];
        /** Elevations relative to the first physical input vertex, not world datum. */
        eaveLevelMm: number;
        ridgeLevelMm: number;
        halfRunMm: number;
        /** Plan centre of the roof outline, in the same frame as the levels. */
        planCentreMm: readonly [number, number];
        /** Hip only: horizontal ridge length between the hip apexes. */
        ridgeLengthMm?: number;
      };
    }
  | {
      status: 'ambiguous' | 'unsupported';
      reason:
        'missing-units' | 'insufficient-geometry' | 'unsupported-roof-shape';
    }
);

type Point = [number, number, number];

/** Recognizes complete two-plane surfaces only, not solids or bounding boxes. */
export function analyzeIfcRoof(input: IfcRoofAnalysisInput): IfcRoofAnalysis {
  const common = {
    sourceRoof: input.sourceRoof,
    evidence: [...input.sourceRoof.evidence, ...(input.semanticEvidence ?? [])],
    warnings: ['confirm-building-extents', 'construction-values-required'],
  };
  const reject = (
    reason:
      'missing-units' | 'insufficient-geometry' | 'unsupported-roof-shape',
  ): IfcRoofAnalysis => ({
    ...common,
    status: reason === 'unsupported-roof-shape' ? 'unsupported' : 'ambiguous',
    reason,
  });
  const scale = input.sourceToMillimetres;
  if (!scale || !Number.isFinite(scale) || scale <= 0)
    return reject('missing-units');
  const points: Point[] = [];
  const triangles: [number, number, number][] = [];
  let origin: Point | undefined;
  for (const mesh of input.geometry) {
    if (mesh.positions.length % 3 || mesh.indices.length % 3)
      return reject('insufficient-geometry');
    const offset = points.length;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const p: Point = [
        mesh.positions[i]!,
        mesh.positions[i + 1]!,
        mesh.positions[i + 2]!,
      ];
      if (!p.every(Number.isFinite)) return reject('insufficient-geometry');
      origin ??= p;
      points.push(p.map((v, axis) => (v - origin![axis]!) * scale) as Point);
    }
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const ids = [
        mesh.indices[i]!,
        mesh.indices[i + 1]!,
        mesh.indices[i + 2]!,
      ];
      if (
        ids.some(
          (id) =>
            !Number.isInteger(id) || id < 0 || id >= mesh.positions.length / 3,
        )
      )
        return reject('insufficient-geometry');
      triangles.push(ids.map((id) => id + offset) as [number, number, number]);
    }
  }
  if (points.length < 3 || triangles.length < 4)
    return reject('insufficient-geometry');
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of points)
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis]!, p[axis]!);
      max[axis] = Math.max(max[axis]!, p[axis]!);
    }
  const tolerance = Math.max(0.5, ...max.map((v, i) => (v - min[i]!) * 1e-6));
  if (!Number.isFinite(tolerance)) return reject('insufficient-geometry');
  const near = (a: number, b: number) => Math.abs(a - b) <= tolerance;
  // A surface that is not a regular gable may still be a regular hip.
  const hipOrReject = (): IfcRoofAnalysis => {
    const hip = recognizeRegularHip(points, triangles, min, max, tolerance);
    return hip
      ? {
          ...common,
          status: 'supported',
          roofType: 'hip',
          evidence: [...common.evidence, ...hip.evidence],
          proposed: hip.proposed,
          geometry: hip.geometry,
        }
      : reject('unsupported-roof-shape');
  };
  const top = points.filter((p) => near(p[2], max[2]!));
  const first = top[0]!;
  // Farthest from any ridge point gives one endpoint; no quadratic search.
  const farthest = (from: Point) =>
    top.reduce(
      (best, p) =>
        Math.hypot(p[0] - from[0], p[1] - from[1]) >
        Math.hypot(best[0] - from[0], best[1] - from[1])
          ? p
          : best,
      first,
    );
  const a = farthest(first);
  const b = farthest(a);
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const rise = max[2]! - min[2]!;
  if (length <= tolerance * 10 || rise <= tolerance * 10) return hipOrReject();
  const dx = (b[0] - a[0]) / length;
  const dy = (b[1] - a[1]) / length;
  const projected: Point[] = points.map((p) => [
    (p[0] - a[0]) * dx + (p[1] - a[1]) * dy,
    -(p[0] - a[0]) * dy + (p[1] - a[1]) * dx,
    p[2] - min[2]!,
  ]);
  let low = Infinity;
  let high = -Infinity;
  for (const p of projected) {
    low = Math.min(low, p[1]);
    high = Math.max(high, p[1]);
  }
  const halfRun = (high - low) / 2;
  if (halfRun <= tolerance * 10 || !near(low, -high)) return hipOrReject();
  if (
    projected.some(
      ([u, v, z]) =>
        u < -tolerance ||
        u > length + tolerance ||
        !near(z, rise * (1 - Math.abs(v) / halfRun)),
    )
  )
    return hipOrReject();

  // Weld parser's per-face duplicate vertices. Surface topology plus area is
  // required: a few extreme points must not make a partial roof convertible.
  const welded = new Map<string, number>();
  const vertexIds = projected.map((p) => {
    const key = p.map((v) => Math.round(v / tolerance)).join(',');
    if (!welded.has(key)) welded.set(key, welded.size);
    return welded.get(key)!;
  });
  const edges = [
    new Map<string, { count: number; a: Point; b: Point }>(),
    new Map<string, { count: number; a: Point; b: Point }>(),
  ];
  const areas = [0, 0];
  const faces = new Set<string>();
  for (const ids of triangles) {
    const faceKey = ids
      .map((id) => vertexIds[id]!)
      .sort((x, y) => x - y)
      .join(':');
    if (faces.has(faceKey)) return hipOrReject();
    faces.add(faceKey);
    const [p, q, r] = ids.map((id) => projected[id]!) as [Point, Point, Point];
    const positive = [p, q, r].some((v) => v[1] > tolerance);
    const negative = [p, q, r].some((v) => v[1] < -tolerance);
    if (positive === negative) return hipOrReject();
    const side = positive ? 1 : 0;
    const area =
      Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1])) /
      2;
    if (area <= tolerance * tolerance) return hipOrReject();
    areas[side]! += area;
    for (let i = 0; i < 3; i++) {
      const start = ids[i]!;
      const end = ids[(i + 1) % 3]!;
      const key = [vertexIds[start]!, vertexIds[end]!]
        .sort((x, y) => x - y)
        .join(':');
      const edge = edges[side]!.get(key);
      if (edge) edge.count++;
      else
        edges[side]!.set(key, {
          count: 1,
          a: projected[start]!,
          b: projected[end]!,
        });
    }
  }
  for (let side = 0; side < 2; side++) {
    if (
      Math.abs(areas[side]! - length * halfRun) >
      tolerance * (length + halfRun) * 2
    )
      return hipOrReject();
    const eave = side === 0 ? -halfRun : halfRun;
    for (const edge of edges[side]!.values()) {
      if (edge.count === 2) continue;
      if (
        edge.count !== 1 ||
        !(
          (near(edge.a[0], 0) && near(edge.b[0], 0)) ||
          (near(edge.a[0], length) && near(edge.b[0], length)) ||
          (near(edge.a[1], 0) && near(edge.b[1], 0)) ||
          (near(edge.a[1], eave) && near(edge.b[1], eave))
        )
      )
        return hipOrReject();
    }
  }
  return {
    ...common,
    status: 'supported',
    roofType: 'gable',
    evidence: [
      ...common.evidence,
      'horizontal-ridge',
      'symmetric-slopes',
      'complete-rectangular-surfaces',
    ],
    proposed: {
      buildingLengthMm: length,
      buildingWidthMm: halfRun * 2,
      pitchDeg: (Math.atan(rise / halfRun) * 180) / Math.PI,
    },
    geometry: {
      ridgeDirection: [dx, dy],
      planCentreMm: [
        a[0] + dx * (length / 2) - dy * ((low + high) / 2),
        a[1] + dy * (length / 2) + dx * ((low + high) / 2),
      ],
      eaveLevelMm: min[2]!,
      ridgeLevelMm: max[2]!,
      halfRunMm: halfRun,
    },
  };
}
