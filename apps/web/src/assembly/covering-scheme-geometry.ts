/**
 * V46 covering scheme presentation geometry (view layer only).
 *
 * Classifies the edges of a plane's local polygon (u along the eave, v up the
 * slope, eave at the lowest v) so the drawing can show roof context — ridge
 * and hip caps, the eave line, verges — and technical annotations. Nothing
 * here is counted: quantities stay with the covering resolvers.
 */
export interface LocalPoint {
  uMm: number;
  vMm: number;
}

export type PlaneEdgeKind = 'eave' | 'ridge' | 'hip' | 'verge';

export interface PlaneEdge {
  kind: PlaneEdgeKind;
  from: LocalPoint;
  to: LocalPoint;
  lengthMm: number;
}

const EPSILON_MM = 1;

export function classifyPlaneEdges(
  polygon: readonly LocalPoint[],
): PlaneEdge[] {
  if (polygon.length < 3) return [];
  const minV = Math.min(...polygon.map((point) => point.vMm));
  const maxV = Math.max(...polygon.map((point) => point.vMm));
  return polygon.flatMap<PlaneEdge>((from, index) => {
    const to = polygon[(index + 1) % polygon.length]!;
    const lengthMm = Math.hypot(to.uMm - from.uMm, to.vMm - from.vMm);
    if (lengthMm <= EPSILON_MM) return [];
    const horizontal = Math.abs(to.vMm - from.vMm) <= EPSILON_MM;
    const kind: PlaneEdgeKind = horizontal
      ? Math.abs(from.vMm - minV) <= EPSILON_MM
        ? 'eave'
        : Math.abs(from.vMm - maxV) <= EPSILON_MM
          ? 'ridge'
          : 'verge'
      : Math.abs(to.uMm - from.uMm) <= EPSILON_MM
        ? 'verge'
        : 'hip';
    return [{ kind, from, to, lengthMm }];
  });
}

/**
 * Deterministic tone bucket for an illustrative tile (0..count-1). A stable
 * hash keeps the texture identical between renders, exports and screenshots.
 */
export function tileToneIndex(id: string, count = 3): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % count;
}

/** Regular gauge shared by the middle courses, or undefined when irregular. */
export function regularCourseGauge(
  stations: readonly number[],
): number | undefined {
  const sorted = [...stations].sort((a, b) => a - b);
  const gaps = sorted.slice(1).map((value, index) => value - sorted[index]!);
  if (!gaps.length) return undefined;
  const first = gaps[0]!;
  return gaps.every((gap) => Math.abs(gap - first) <= 0.5) ? first : undefined;
}
