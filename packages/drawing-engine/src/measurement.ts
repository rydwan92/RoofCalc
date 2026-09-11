export interface MeasurementPoint3D {
  x: number;
  y: number;
  z: number;
}

export interface MeasurementSnapPoint {
  id: string;
  label: string;
  point: MeasurementPoint3D;
  roofPlaneId?: string;
}

export interface MeasurementResult {
  from: MeasurementSnapPoint;
  to: MeasurementSnapPoint;
  distanceMm: number;
}

function validPoint(point: MeasurementPoint3D) {
  return [point.x, point.y, point.z].every(Number.isFinite);
}

/** Exact canonical world-space distance; screen coordinates are never accepted. */
export function measureDistance3d(
  from: MeasurementSnapPoint,
  to: MeasurementSnapPoint,
): MeasurementResult {
  if (!validPoint(from.point) || !validPoint(to.point))
    throw new RangeError('invalid_measurement_point');
  const distanceMm = Math.hypot(
    to.point.x - from.point.x,
    to.point.y - from.point.y,
    to.point.z - from.point.z,
  );
  if (!Number.isFinite(distanceMm))
    throw new RangeError('invalid_measurement_distance');
  return { from, to, distanceMm };
}
