import type { Frame2D, Point2D } from '@cieslacalc/timber-model';

/** Rigid member-local/world transform; local y points from bottom to top edge. */
export function memberToWorld(point: Point2D, frame: Frame2D): Point2D {
  const theta = (frame.angleDeg * Math.PI) / 180;
  return {
    x: frame.origin.x + point.x * Math.cos(theta) - point.y * Math.sin(theta),
    y: frame.origin.y + point.x * Math.sin(theta) + point.y * Math.cos(theta),
  };
}
export function worldToMember(point: Point2D, frame: Frame2D): Point2D {
  const theta = (frame.angleDeg * Math.PI) / 180;
  const dx = point.x - frame.origin.x,
    dy = point.y - frame.origin.y;
  return {
    x: dx * Math.cos(theta) + dy * Math.sin(theta),
    y: -dx * Math.sin(theta) + dy * Math.cos(theta),
  };
}
