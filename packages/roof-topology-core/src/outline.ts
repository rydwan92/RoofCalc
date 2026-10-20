import { insidePlan, planArea } from './geometry';
import {
  ROOF_SCENE_CONTRACT_VERSION,
  type RoofSceneGraph,
  type SceneSource,
  type Vec2,
} from './model';

/**
 * Layer (a) of ADR-015: a building outline RECOGNISED on a drawing (a DXF
 * polyline, a vector PDF). It is only a shape in plan. This module says
 * which shape it is and whether today's solver can start a roof from it; it
 * never turns an outline into roof planes — drawing an L proves nothing
 * about its valleys or its framing.
 */
export type PlanOutlineShape =
  | 'rectangle'
  | 'l-shape'
  | 'compound-orthogonal'
  | 'non-orthogonal'
  | 'degenerate';

export interface PlanRectangle {
  /** Counter-clockwise, mm. */
  corners: [Vec2, Vec2, Vec2, Vec2];
  center: Vec2;
  longMm: number;
  shortMm: number;
}

export interface PlanOutlineClassification {
  shape: PlanOutlineShape;
  /** Corners after collinear points are dropped. */
  corners: number;
  /** Inward-pointing corners (an L has one, a T or U two). */
  reflexCorners: number;
  areaMm2: number;
  /** The cleaned outline, counter-clockwise. */
  outline: Vec2[];
  /**
   * An L split at its inner corner into the main body and the wing (the
   * cut that leaves the largest body). Candidate structures only.
   */
  wings: PlanRectangle[];
}

const ANGLE_TOLERANCE = Math.sin((1 * Math.PI) / 180);

function clean(points: readonly Vec2[], tolerance: number): Vec2[] {
  const out: Vec2[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(point.x - last.x, point.y - last.y) > tolerance)
      out.push({ x: point.x, y: point.y });
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
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let index = 0; index < out.length; index += 1) {
      const a = out[(index - 1 + out.length) % out.length]!;
      const b = out[index]!;
      const c = out[(index + 1) % out.length]!;
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      const scale =
        Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y);
      if (scale === 0 || Math.abs(cross) / scale < ANGLE_TOLERANCE) {
        out.splice(index, 1);
        changed = true;
        break;
      }
    }
  }
  return out;
}

const signedArea = (points: readonly Vec2[]) =>
  points.reduce((sum, a, index) => {
    const b = points[(index + 1) % points.length]!;
    return sum + a.x * b.y - b.x * a.y;
  }, 0) / 2;

export function classifyPlanOutline(
  points: readonly Vec2[],
  tolerance = 1,
): PlanOutlineClassification {
  let outline = clean(points, tolerance);
  if (signedArea(outline) < 0) outline = [...outline].reverse();
  const areaMm2 = planArea(outline);
  const base = { corners: outline.length, areaMm2, outline, wings: [] };
  if (outline.length < 4 || areaMm2 <= tolerance * tolerance)
    return { ...base, shape: 'degenerate', reflexCorners: 0 };

  // Orthogonal in its own axes: every side parallel or perpendicular to
  // the longest side (a rotated plan is still orthogonal).
  const sides = outline.map((a, index) => {
    const b = outline[(index + 1) % outline.length]!;
    return { x: b.x - a.x, y: b.y - a.y };
  });
  const longest = sides.reduce((best, side) =>
    Math.hypot(side.x, side.y) > Math.hypot(best.x, best.y) ? side : best,
  );
  const axisLength = Math.hypot(longest.x, longest.y);
  const axis = { x: longest.x / axisLength, y: longest.y / axisLength };
  const orthogonal = sides.every((side) => {
    const size = Math.hypot(side.x, side.y);
    const along = Math.abs(side.x * axis.x + side.y * axis.y) / size;
    const across = Math.abs(side.x * axis.y - side.y * axis.x) / size;
    return along < ANGLE_TOLERANCE || across < ANGLE_TOLERANCE;
  });
  const reflexCorners = outline.filter((b, index) => {
    const a = outline[(index - 1 + outline.length) % outline.length]!;
    const c = outline[(index + 1) % outline.length]!;
    return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) < 0;
  }).length;
  if (!orthogonal) return { ...base, shape: 'non-orthogonal', reflexCorners };
  if (outline.length === 4)
    return {
      ...base,
      shape: 'rectangle',
      reflexCorners,
      wings: [rectangleFrom(outline as [Vec2, Vec2, Vec2, Vec2])],
    };
  if (outline.length === 6 && reflexCorners === 1)
    return {
      ...base,
      shape: 'l-shape',
      reflexCorners,
      wings: splitL(outline, axis),
    };
  return { ...base, shape: 'compound-orthogonal', reflexCorners };
}

function rectangleFrom(corners: [Vec2, Vec2, Vec2, Vec2]): PlanRectangle {
  const [a, b, c] = corners;
  const first = Math.hypot(b.x - a.x, b.y - a.y);
  const second = Math.hypot(c.x - b.x, c.y - b.y);
  return {
    corners,
    center: {
      x: corners.reduce((sum, point) => sum + point.x, 0) / 4,
      y: corners.reduce((sum, point) => sum + point.y, 0) / 4,
    },
    longMm: Math.max(first, second),
    shortMm: Math.min(first, second),
  };
}

/**
 * Splits an L at its inner corner, in the outline's own axes. The L is its
 * bounding box minus one notch; cutting along either side of the notch
 * gives a full strip plus the remaining wing. The cut leaving the larger
 * main body wins.
 */
function splitL(outline: readonly Vec2[], axis: Vec2): PlanRectangle[] {
  const toLocal = (point: Vec2) => ({
    x: point.x * axis.x + point.y * axis.y,
    y: -point.x * axis.y + point.y * axis.x,
  });
  const toWorld = (point: Vec2) => ({
    x: point.x * axis.x - point.y * axis.y,
    y: point.x * axis.y + point.y * axis.x,
  });
  const local = outline.map(toLocal);
  const reflex = local.find((b, index) => {
    const a = local[(index - 1 + local.length) % local.length]!;
    const c = local[(index + 1) % local.length]!;
    return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) < 0;
  });
  if (!reflex) return [];
  const minX = Math.min(...local.map((point) => point.x));
  const maxX = Math.max(...local.map((point) => point.x));
  const minY = Math.min(...local.map((point) => point.y));
  const maxY = Math.max(...local.map((point) => point.y));
  // The bounding-box corner the L leaves out.
  const notch = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ].find(
    (corner) =>
      !insidePlan(
        { x: (corner.x + reflex.x) / 2, y: (corner.y + reflex.y) / 2 },
        local,
      ),
  );
  if (!notch) return [];
  const box = (x0: number, y0: number, x1: number, y1: number) =>
    rectangleFrom(
      [
        { x: Math.min(x0, x1), y: Math.min(y0, y1) },
        { x: Math.max(x0, x1), y: Math.min(y0, y1) },
        { x: Math.max(x0, x1), y: Math.max(y0, y1) },
        { x: Math.min(x0, x1), y: Math.max(y0, y1) },
      ].map(toWorld) as [Vec2, Vec2, Vec2, Vec2],
    );
  const farX = notch.x === maxX ? minX : maxX;
  const farY = notch.y === maxY ? minY : maxY;
  // Cut along x = reflex.x: full-height strip away from the notch + wing.
  const vertical = [
    box(farX, minY, reflex.x, maxY),
    box(reflex.x, farY, notch.x === maxX ? maxX : minX, reflex.y),
  ];
  // Cut along y = reflex.y: full-width strip away from the notch + wing.
  const horizontal = [
    box(minX, farY, maxX, reflex.y),
    box(farX, reflex.y, reflex.x, notch.y === maxY ? maxY : minY),
  ];
  const area = (rectangle: PlanRectangle) =>
    rectangle.longMm * rectangle.shortMm;
  return area(vertical[0]!) >= area(horizontal[0]!) ? vertical : horizontal;
}

export type OutlineCalculationSupport =
  | { status: 'template'; templates: readonly ('gable' | 'hip')[] }
  | {
      status: 'not-supported';
      reason:
        'compound-outline' | 'non-orthogonal-outline' | 'degenerate-outline';
    };

/** Whether today's single-roof start can describe a roof on this outline. */
export function outlineSupport(
  classification: PlanOutlineClassification,
): OutlineCalculationSupport {
  switch (classification.shape) {
    case 'rectangle':
      return { status: 'template', templates: ['gable', 'hip'] };
    case 'l-shape':
    case 'compound-orthogonal':
      return { status: 'not-supported', reason: 'compound-outline' };
    case 'non-orthogonal':
      return { status: 'not-supported', reason: 'non-orthogonal-outline' };
    default:
      return { status: 'not-supported', reason: 'degenerate-outline' };
  }
}

/**
 * Layer (b) of ADR-015 for a compound outline: candidate structures (one
 * per wing) and the connection between them, all `unresolved`, no planes.
 * Assessed, it is honestly `partial` and `not-supported`.
 */
export function outlineStructureCandidates(
  classification: PlanOutlineClassification,
  source: Omit<SceneSource, 'stage'>,
): RoofSceneGraph {
  const structures = classification.wings.map((_, index) => ({
    id: `outline/wing-${index + 1}`,
    transform: {
      translation: { x: 0, y: 0, z: 0 },
      rotationAboutVerticalDeg: 0,
    },
    template: 'unknown' as const,
    status: 'unresolved' as const,
    source: { ...source, stage: 'recognized' as const },
  }));
  const [first, second] = structures;
  return {
    contractVersion: ROOF_SCENE_CONTRACT_VERSION,
    structures,
    planes: [],
    edges: [],
    openings: [],
    connections:
      first && second
        ? [
            {
              id: 'outline/junction-1',
              structureIds: [first.id, second.id],
              kind: 'roof-to-roof',
              edgeIds: [],
              status: 'unresolved',
              source: { ...source, stage: 'proposed' },
            },
          ]
        : [],
  };
}
