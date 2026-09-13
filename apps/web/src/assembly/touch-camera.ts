import { clampViewport, type ViewportState } from '@cieslacalc/drawing-engine';

export interface TouchPoint {
  x: number;
  y: number;
}
export function touchDragActivated(
  start: TouchPoint,
  current: TouchPoint,
  thresholdPx = 6,
) {
  return Math.hypot(current.x - start.x, current.y - start.y) > thresholdPx;
}
export interface PinchStart {
  first: TouchPoint;
  second: TouchPoint;
  viewport: ViewportState;
}

/** Keeps the world point beneath the starting midpoint beneath the moving midpoint. */
export function pinchViewport(
  start: PinchStart,
  first: TouchPoint,
  second: TouchPoint,
  size: { width: number; height: number },
): ViewportState {
  const initialMid = {
    x: (start.first.x + start.second.x) / 2,
    y: (start.first.y + start.second.y) / 2,
  };
  const nextMid = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
  const initialDistance = Math.hypot(
    start.first.x - start.second.x,
    start.first.y - start.second.y,
  );
  const distance = Math.hypot(first.x - second.x, first.y - second.y);
  const zoom = clampViewport({
    ...start.viewport,
    zoom:
      start.viewport.zoom *
      (initialDistance > 1 ? distance / initialDistance : 1),
  }).zoom;
  const ratio = zoom / start.viewport.zoom;
  return clampViewport({
    zoom,
    panX:
      nextMid.x -
      size.width / 2 -
      (initialMid.x - size.width / 2 - start.viewport.panX) * ratio,
    panY:
      nextMid.y -
      size.height / 2 -
      (initialMid.y - size.height / 2 - start.viewport.panY) * ratio,
  });
}
