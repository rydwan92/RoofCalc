import type { RoofPlaneFrame, Vec2, Vec3 } from './model';

/** Measurement helpers on given points. Nothing here solves a roof. */

export const TOLERANCE_MM = 1;

export const sub = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
export const add = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
});
export const scale = (a: Vec3, k: number): Vec3 => ({
  x: a.x * k,
  y: a.y * k,
  z: a.z * k,
});
export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const length = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
export const distance = (a: Vec3, b: Vec3) => length(sub(a, b));
export const normalize = (a: Vec3): Vec3 => {
  const size = length(a);
  return size > 0 ? scale(a, 1 / size) : { x: 0, y: 0, z: 0 };
};
export const samePoint = (a: Vec3, b: Vec3, tolerance = TOLERANCE_MM) =>
  distance(a, b) <= tolerance;

/** Newell's vector: twice the area, perpendicular to the polygon. */
function newell(polygon: readonly Vec3[]): Vec3 {
  let normal = { x: 0, y: 0, z: 0 };
  polygon.forEach((a, index) => {
    const b = polygon[(index + 1) % polygon.length]!;
    normal = {
      x: normal.x + (a.y - b.y) * (a.z + b.z),
      y: normal.y + (a.z - b.z) * (a.x + b.x),
      z: normal.z + (a.x - b.x) * (a.y + b.y),
    };
  });
  return normal;
}

/** Upward unit normal (z ≥ 0). */
export function upwardNormal(polygon: readonly Vec3[]): Vec3 {
  const normal = normalize(newell(polygon));
  return normal.z < 0 ? scale(normal, -1) : normal;
}

/** True 3D area of a planar polygon, mm². */
export function polygonArea(polygon: readonly Vec3[]): number {
  return polygon.length < 3 ? 0 : length(newell(polygon)) / 2;
}

/** Area of the polygon's horizontal projection, mm². */
export function planArea(polygon: readonly (Vec2 | Vec3)[]): number {
  if (polygon.length < 3) return 0;
  return (
    Math.abs(
      polygon.reduce((sum, a, index) => {
        const b = polygon[(index + 1) % polygon.length]!;
        return sum + a.x * b.y - b.x * a.y;
      }, 0),
    ) / 2
  );
}

export function perimeter(polygon: readonly Vec3[]): number {
  return polygon.reduce(
    (sum, a, index) =>
      sum + distance(a, polygon[(index + 1) % polygon.length]!),
    0,
  );
}

export function pitchOf(normal: Vec3): number {
  return (Math.acos(Math.min(1, Math.max(-1, normal.z))) * 180) / Math.PI;
}

/** Lowest vertex; u along the horizontal, v up the slope. */
export function planeFrame(
  polygon: readonly Vec3[],
  normal: Vec3,
): RoofPlaneFrame {
  const origin = [...polygon].sort(
    (a, b) => a.z - b.z || a.x - b.x || a.y - b.y,
  )[0] ?? { x: 0, y: 0, z: 0 };
  const horizontal = Math.hypot(normal.x, normal.y) > 1e-9;
  const u = horizontal
    ? normalize(cross({ x: 0, y: 0, z: 1 }, normal))
    : { x: 1, y: 0, z: 0 };
  const v = cross(normal, u);
  return { origin, u, v };
}

/** Height of the (extended) plane at a plan point. */
export function heightAt(
  point: Vec3,
  normal: Vec3,
  plan: { x: number; y: number },
): number | undefined {
  if (Math.abs(normal.z) < 1e-9) return undefined;
  return (
    point.z -
    (normal.x * (plan.x - point.x) + normal.y * (plan.y - point.y)) / normal.z
  );
}

export function distanceToSegment(point: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub(b, a);
  const span = dot(ab, ab);
  const t =
    span > 0 ? Math.min(1, Math.max(0, dot(sub(point, a), ab) / span)) : 0;
  return distance(point, add(a, scale(ab, t)));
}

/** Ray casting in plan; works for non-convex polygons. */
export function insidePlan(
  point: { x: number; y: number },
  polygon: readonly (Vec2 | Vec3)[],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}

export function maxDeviationFromPlane(
  polygon: readonly Vec3[],
  normal: Vec3,
): number {
  const origin = polygon[0];
  if (!origin) return 0;
  return Math.max(
    ...polygon.map((point) => Math.abs(dot(sub(point, origin), normal))),
  );
}

/* ---------------------- VNext-6.1 plan-polygon checks ---------------------- */

type PlanPoint = { x: number; y: number };

/** Twice the signed area of triangle a, b, c in plan. */
export function orient(a: PlanPoint, b: PlanPoint, c: PlanPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function planDistanceToSegment(point: PlanPoint, a: PlanPoint, b: PlanPoint) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const span = dx * dx + dy * dy;
  const t =
    span > 0
      ? Math.min(
          1,
          Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / span),
        )
      : 0;
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

/**
 * Two segments cross at one point inside both (not at an end, not along a
 * shared line). Touching within the tolerance is not a crossing.
 */
export function segmentsCross(
  a: PlanPoint,
  b: PlanPoint,
  c: PlanPoint,
  d: PlanPoint,
  tolerance = TOLERANCE_MM,
): boolean {
  const lengthAB = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const lengthCD = Math.hypot(d.x - c.x, d.y - c.y) || 1;
  const o1 = orient(a, b, c) / lengthAB;
  const o2 = orient(a, b, d) / lengthAB;
  const o3 = orient(c, d, a) / lengthCD;
  const o4 = orient(c, d, b) / lengthCD;
  return (
    ((o1 > tolerance && o2 < -tolerance) ||
      (o1 < -tolerance && o2 > tolerance)) &&
    ((o3 > tolerance && o4 < -tolerance) || (o3 < -tolerance && o4 > tolerance))
  );
}

export function onPlanBoundary(
  point: PlanPoint,
  polygon: readonly PlanPoint[],
  tolerance = TOLERANCE_MM,
): boolean {
  return polygon.some(
    (a, index) =>
      planDistanceToSegment(point, a, polygon[(index + 1) % polygon.length]!) <=
      tolerance,
  );
}

/** Inside and farther than the tolerance from every side. */
export function strictlyInsidePlan(
  point: PlanPoint,
  polygon: readonly PlanPoint[],
  tolerance = TOLERANCE_MM,
): boolean {
  return (
    insidePlan(point, polygon) && !onPlanBoundary(point, polygon, tolerance)
  );
}

/** Consecutive repeated vertices (and an explicit closing vertex) removed. */
export function withoutRepeatedVertices<T extends PlanPoint>(
  polygon: readonly T[],
  tolerance = TOLERANCE_MM,
): T[] {
  const out: T[] = [];
  for (const point of polygon) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(point.x - last.x, point.y - last.y) > tolerance)
      out.push(point);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (
    first &&
    last &&
    out.length > 1 &&
    Math.hypot(first.x - last.x, first.y - last.y) <= tolerance
  )
    out.pop();
  return out;
}

/**
 * The outline crosses or touches itself: two non-adjacent sides cross, or a
 * vertex lies on a side it does not belong to (a bow-tie, a pinched ring).
 */
export function selfIntersects(
  polygon: readonly PlanPoint[],
  tolerance = TOLERANCE_MM,
): boolean {
  const n = polygon.length;
  for (let i = 0; i < n; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % n]!;
    for (let j = i + 1; j < n; j += 1) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (adjacent) continue;
      const c = polygon[j]!;
      const d = polygon[(j + 1) % n]!;
      if (segmentsCross(a, b, c, d, tolerance)) return true;
    }
    for (let k = 0; k < n; k += 1) {
      if (k === i || k === (i + 1) % n) continue;
      if (planDistanceToSegment(polygon[k]!, a, b) <= tolerance) return true;
    }
  }
  return false;
}

/**
 * Two plan polygons share area (not just a boundary): a side crosses a
 * side, or a vertex, a side midpoint or the centroid of one lies strictly
 * inside the other. Exact for the simple polygons roof planes are.
 */
export function polygonsOverlap(
  a: readonly PlanPoint[],
  b: readonly PlanPoint[],
  tolerance = TOLERANCE_MM,
): boolean {
  for (let i = 0; i < a.length; i += 1)
    for (let j = 0; j < b.length; j += 1)
      if (
        segmentsCross(
          a[i]!,
          a[(i + 1) % a.length]!,
          b[j]!,
          b[(j + 1) % b.length]!,
          tolerance,
        )
      )
        return true;
  const probes = (polygon: readonly PlanPoint[]) => [
    ...polygon,
    ...polygon.map((point, index) => {
      const next = polygon[(index + 1) % polygon.length]!;
      return { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 };
    }),
    {
      x: polygon.reduce((sum, point) => sum + point.x, 0) / polygon.length,
      y: polygon.reduce((sum, point) => sum + point.y, 0) / polygon.length,
    },
  ];
  return (
    probes(a).some(
      (point) =>
        strictlyInsidePlan(point, b, tolerance) &&
        (insidePlan(point, a) || onPlanBoundary(point, a, tolerance)),
    ) ||
    probes(b).some(
      (point) =>
        strictlyInsidePlan(point, a, tolerance) &&
        (insidePlan(point, b) || onPlanBoundary(point, b, tolerance)),
    )
  );
}

/** One plan polygon lies within another (sides may touch the boundary). */
export function polygonWithin(
  inner: readonly PlanPoint[],
  outer: readonly PlanPoint[],
  tolerance = TOLERANCE_MM,
): boolean {
  const inOrOn = (point: PlanPoint) =>
    insidePlan(point, outer) || onPlanBoundary(point, outer, tolerance);
  for (let i = 0; i < inner.length; i += 1) {
    const a = inner[i]!;
    const b = inner[(i + 1) % inner.length]!;
    if (!inOrOn(a) || !inOrOn({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }))
      return false;
    for (let j = 0; j < outer.length; j += 1)
      if (
        segmentsCross(
          a,
          b,
          outer[j]!,
          outer[(j + 1) % outer.length]!,
          tolerance,
        )
      )
        return false;
  }
  return true;
}
