import type { Point2D } from '@cieslacalc/timber-model';

export interface Line2D {
  origin: Point2D;
  direction: Point2D;
}
export const subtract = (a: Point2D, b: Point2D): Point2D => ({
  x: a.x - b.x,
  y: a.y - b.y,
});
export const dot = (a: Point2D, b: Point2D) => a.x * b.x + a.y * b.y;
export function unitVector(vector: Point2D): Point2D {
  const length = Math.hypot(vector.x, vector.y);
  if (!Number.isFinite(length) || length === 0)
    throw new RangeError('invalid_direction');
  return { x: vector.x / length, y: vector.y / length };
}
export function normalVector(vector: Point2D): Point2D {
  const unit = unitVector(vector);
  return { x: -unit.y, y: unit.x };
}
export function pointOnLine(line: Line2D, distance: number): Point2D {
  return {
    x: line.origin.x + line.direction.x * distance,
    y: line.origin.y + line.direction.y * distance,
  };
}
export function offsetLine(line: Line2D, distanceMm: number): Line2D {
  return {
    origin: pointOnLine(
      { origin: line.origin, direction: normalVector(line.direction) },
      distanceMm,
    ),
    direction: line.direction,
  };
}
export function projectToLine(point: Point2D, line: Line2D): Point2D {
  const direction = unitVector(line.direction);
  return pointOnLine(
    { ...line, direction },
    dot(subtract(point, line.origin), direction),
  );
}
export function intersectLines(a: Line2D, b: Line2D): Point2D {
  const u = unitVector(a.direction),
    v = unitVector(b.direction);
  const cross = u.x * v.y - u.y * v.x;
  if (Math.abs(cross) < 1e-12) throw new RangeError('parallel_lines');
  const delta = subtract(b.origin, a.origin);
  return pointOnLine(
    { origin: a.origin, direction: u },
    (delta.x * v.y - delta.y * v.x) / cross,
  );
}
