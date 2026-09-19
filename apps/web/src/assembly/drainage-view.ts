import type {
  ResolvedRoofFeature,
  RoofSurfaceGeometryResult,
} from '@cieslacalc/roof-math';

/**
 * V51 drainage plan view — presentation geometry only.
 *
 * Projects the resolved roof to a top view (x right, y up on screen, so the
 * SVG uses −y) and places gutters slightly outside their canonical eaves.
 * Outlet positions are always a normalized station along the eave feature;
 * the view never stores a pixel position.
 */
export interface PlanPoint {
  x: number;
  y: number;
}

export interface PlanView {
  minX: number;
  minY: number;
  width: number;
  height: number;
  /** Gutter offset outside the eave line, in drawing millimetres. */
  gutterOffsetMm: number;
  planes: { roofPlaneId: string; points: PlanPoint[] }[];
}

const toSvg = (x: number, y: number): PlanPoint => ({ x, y: -y });

export function planView(surface: RoofSurfaceGeometryResult): PlanView {
  const planes = surface.planes.map((plane) => ({
    roofPlaneId: plane.roofPlaneId,
    points: plane.worldPolygon.map((point) => toSvg(point.x, point.y)),
  }));
  const all = planes.flatMap((plane) => plane.points);
  if (!all.length)
    return {
      minX: 0,
      minY: 0,
      width: 1,
      height: 1,
      gutterOffsetMm: 0,
      planes,
    };
  const minX = Math.min(...all.map((point) => point.x));
  const maxX = Math.max(...all.map((point) => point.x));
  const minY = Math.min(...all.map((point) => point.y));
  const maxY = Math.max(...all.map((point) => point.y));
  const size = Math.max(maxX - minX, maxY - minY, 1);
  // Side labels (eave, downpipe) need more room across than along.
  const padX = size * 0.4;
  const padY = size * 0.14;
  return {
    minX: minX - padX,
    minY: minY - padY,
    width: maxX - minX + padX * 2,
    height: maxY - minY + padY * 2,
    gutterOffsetMm: size * 0.025,
    planes,
  };
}

/** The gutter line of an eave in the SVG frame, offset outwards. */
export function gutterLine(
  eave: Pick<ResolvedRoofFeature, 'start' | 'end' | 'outwardPlan'>,
  offsetMm: number,
): { from: PlanPoint; to: PlanPoint } {
  const out = eave.outwardPlan ?? { x: 0, y: 0 };
  return {
    from: toSvg(
      eave.start.x + out.x * offsetMm,
      eave.start.y + out.y * offsetMm,
    ),
    to: toSvg(eave.end.x + out.x * offsetMm, eave.end.y + out.y * offsetMm),
  };
}

export function pointAtStation(
  line: { from: PlanPoint; to: PlanPoint },
  station: number,
): PlanPoint {
  return {
    x: line.from.x + (line.to.x - line.from.x) * station,
    y: line.from.y + (line.to.y - line.from.y) * station,
  };
}

/** Normalized station of the nearest point on a line, clamped to [0, 1]. */
export function stationAtPoint(
  line: { from: PlanPoint; to: PlanPoint },
  point: PlanPoint,
): number {
  const dx = line.to.x - line.from.x;
  const dy = line.to.y - line.from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0) return 0;
  const t =
    ((point.x - line.from.x) * dx + (point.y - line.from.y) * dy) /
    lengthSquared;
  return Math.min(1, Math.max(0, t));
}

/** A station rounded to the nearest millimetre along the eave. */
export function roundStation(station: number, lengthMm: number): number {
  if (!(lengthMm > 0)) return 0;
  return Math.min(1, Math.max(0, Math.round(station * lengthMm) / lengthMm));
}
