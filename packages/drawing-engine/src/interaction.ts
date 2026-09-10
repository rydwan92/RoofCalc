import type { Point } from './index';

export interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}
export const fittedViewport: ViewportState = { zoom: 1, panX: 0, panY: 0 };
export function clampViewport(
  viewport: ViewportState,
  minZoom = 0.65,
  maxZoom = 3,
): ViewportState {
  if (
    ![viewport.zoom, viewport.panX, viewport.panY, minZoom, maxZoom].every(
      Number.isFinite,
    ) ||
    minZoom <= 0 ||
    maxZoom < minZoom
  )
    throw new RangeError('invalid_viewport');
  return {
    ...viewport,
    zoom: Math.max(minZoom, Math.min(maxZoom, viewport.zoom)),
  };
}
/** Applies UI-only pan/zoom around the canvas center without changing domain geometry. */
export function viewportPoint(
  point: Point,
  viewport: ViewportState,
  size: { width: number; height: number },
): Point {
  const state = clampViewport(viewport);
  if (![point.x, point.y, size.width, size.height].every(Number.isFinite))
    throw new RangeError('invalid_viewport_point');
  return {
    x: size.width / 2 + (point.x - size.width / 2) * state.zoom + state.panX,
    y: size.height / 2 + (point.y - size.height / 2) * state.zoom + state.panY,
  };
}
/** Converts a screen-space pointer delta along a projected axis to canonical millimetres. */
export function valueFromAxisDrag({
  startValueMm,
  pointerStart,
  pointerCurrent,
  axisStart,
  axisEnd,
  axisLengthMm,
}: {
  startValueMm: number;
  pointerStart: Point;
  pointerCurrent: Point;
  axisStart: Point;
  axisEnd: Point;
  axisLengthMm: number;
}): number {
  const dx = axisEnd.x - axisStart.x,
    dy = axisEnd.y - axisStart.y,
    lengthSquared = dx * dx + dy * dy;
  if (
    ![
      startValueMm,
      pointerStart.x,
      pointerStart.y,
      pointerCurrent.x,
      pointerCurrent.y,
      axisStart.x,
      axisStart.y,
      axisEnd.x,
      axisEnd.y,
      axisLengthMm,
    ].every(Number.isFinite) ||
    axisLengthMm <= 0 ||
    lengthSquared <= 1e-8
  )
    throw new RangeError('invalid_drag_axis');
  const pointerDx = pointerCurrent.x - pointerStart.x,
    pointerDy = pointerCurrent.y - pointerStart.y;
  return (
    startValueMm +
    ((pointerDx * dx + pointerDy * dy) / lengthSquared) * axisLengthMm
  );
}

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
