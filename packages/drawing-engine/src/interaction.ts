import type { Point } from './index';

export interface AffineMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}
/** Includes CSS scaling, scrolling, SVG letterboxing and the current zoom/viewBox. */
export function screenToWorld(
  screen: Point,
  screenMatrix: AffineMatrix,
  unproject: (p: Point) => Point,
): Point {
  const { a, b, c, d, e, f } = screenMatrix;
  const det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12)
    throw new RangeError('invalid_transform');
  const x = screen.x - e,
    y = screen.y - f;
  return unproject({ x: (d * x - c * y) / det, y: (-b * x + a * y) / det });
}
export function snapPosition(
  valueMm: number,
  range: { min: number; max: number },
  mmPerPixel: number,
  targets: number[] = [],
) {
  if (
    ![valueMm, range.min, range.max, mmPerPixel, ...targets].every(
      Number.isFinite,
    ) ||
    range.max < range.min ||
    mmPerPixel <= 0
  )
    throw new RangeError('invalid_snap');
  const clamp = (v: number) => Math.max(range.min, Math.min(range.max, v));
  const stepMm = mmPerPixel > 8 ? 10 : mmPerPixel > 2 ? 5 : 1;
  const threshold = Math.min(mmPerPixel * 7, 40);
  const nearby = [range.min, range.max, ...targets]
    .filter(
      (t) =>
        t >= range.min && t <= range.max && Math.abs(t - valueMm) <= threshold,
    )
    .sort((a, b) => Math.abs(a - valueMm) - Math.abs(b - valueMm));
  const snapped = nearby[0];
  return {
    valueMm: clamp(snapped ?? Math.round(valueMm / stepMm) * stepMm),
    kind: snapped === undefined ? ('grid' as const) : ('target' as const),
    stepMm,
  };
}
