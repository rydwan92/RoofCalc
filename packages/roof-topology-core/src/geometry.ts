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
