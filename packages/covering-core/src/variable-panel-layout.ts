/** Pure roof-plane-local geometry for variable-length, eave-to-ridge panels. */
export interface PanelPoint {
  uMm: number;
  vMm: number;
}

export type VariablePanelOpening =
  | { id: string; polygon: readonly PanelPoint[] }
  | {
      id: string;
      fromUMm: number;
      toUMm: number;
      fromVMm: number;
      toVMm: number;
    };

export interface VariablePanelInput {
  roofPlaneId: string;
  polygon: readonly PanelPoint[];
  openings: readonly VariablePanelOpening[];
  effectiveWidthMm: number;
  horizontalAlignment: 'centered' | 'from-u-min' | 'manual';
  manualOffsetMm?: number;
  minPanelLengthMm: number;
  maxPanelLengthMm: number;
}

export type VariablePanelIssue =
  'below-min-panel-length' | 'exceeds-max-panel-length';

export interface VariablePanelRun {
  id: string;
  fromVMm: number;
  toVMm: number;
  lengthMm: number;
  polygons: PanelPoint[][];
  openingIds: string[];
  cause: 'full-slope' | 'opening-interrupted' | 'edge';
  issues: VariablePanelIssue[];
}

export interface VariablePanelColumn {
  id: string;
  columnIndex: number;
  nominalFromUMm: number;
  nominalToUMm: number;
  effectiveVisibleWidthMm: number;
  edgeClassification: 'full-width' | 'edge-cut-width';
  runs: VariablePanelRun[];
}

export interface VariablePanelPlaneResult {
  roofPlaneId: string;
  horizontalOriginUMm: number;
  columns: VariablePanelColumn[];
}

const EPS = 1e-7;
type Axis = 'uMm' | 'vMm';
type Rect = { minU: number; maxU: number; minV: number; maxV: number };

function area(polygon: readonly PanelPoint[]) {
  return Math.abs(
    polygon.reduce((sum, point, index) => {
      const next = polygon[(index + 1) % polygon.length]!;
      return sum + point.uMm * next.vMm - next.uMm * point.vMm;
    }, 0) / 2,
  );
}

function signedArea(polygon: readonly PanelPoint[]) {
  return (
    polygon.reduce((sum, point, index) => {
      const next = polygon[(index + 1) % polygon.length]!;
      return sum + point.uMm * next.vMm - next.uMm * point.vMm;
    }, 0) / 2
  );
}

function openingPolygon(opening: VariablePanelOpening): readonly PanelPoint[] {
  if ('polygon' in opening) return opening.polygon;
  return [
    { uMm: opening.fromUMm, vMm: opening.fromVMm },
    { uMm: opening.toUMm, vMm: opening.fromVMm },
    { uMm: opening.toUMm, vMm: opening.toVMm },
    { uMm: opening.fromUMm, vMm: opening.toVMm },
  ];
}

function convex(polygon: readonly PanelPoint[]) {
  if (polygon.length < 3 || area(polygon) <= EPS) return false;
  const orientation = Math.sign(signedArea(polygon));
  return polygon.every((point, index) => {
    const next = polygon[(index + 1) % polygon.length]!;
    const after = polygon[(index + 2) % polygon.length]!;
    const cross =
      (next.uMm - point.uMm) * (after.vMm - next.vMm) -
      (next.vMm - point.vMm) * (after.uMm - next.uMm);
    return orientation * cross >= -EPS;
  });
}

function clipEdge(
  polygon: readonly PanelPoint[],
  axis: Axis,
  boundary: number,
  keepGreater: boolean,
): PanelPoint[] {
  const output: PanelPoint[] = [];
  if (!polygon.length) return output;
  const inside = (point: PanelPoint) =>
    keepGreater ? point[axis] >= boundary - EPS : point[axis] <= boundary + EPS;
  for (let index = 0; index < polygon.length; index++) {
    const previous = polygon[(index + polygon.length - 1) % polygon.length]!;
    const current = polygon[index]!;
    const prevInside = inside(previous);
    const currInside = inside(current);
    if (prevInside !== currInside) {
      const denominator = current[axis] - previous[axis];
      if (Math.abs(denominator) > EPS) {
        const ratio = (boundary - previous[axis]) / denominator;
        output.push({
          uMm: previous.uMm + ratio * (current.uMm - previous.uMm),
          vMm: previous.vMm + ratio * (current.vMm - previous.vMm),
        });
      }
    }
    if (currInside) output.push(current);
  }
  return output;
}

function clipRect(polygon: readonly PanelPoint[], rect: Rect): PanelPoint[] {
  const clipped = clipEdge(
    clipEdge(
      clipEdge(
        clipEdge(polygon, 'uMm', rect.minU, true),
        'uMm',
        rect.maxU,
        false,
      ),
      'vMm',
      rect.minV,
      true,
    ),
    'vMm',
    rect.maxV,
    false,
  );
  return clipped.length >= 3 && area(clipped) > EPS ? clipped : [];
}

function bounds(polygon: readonly PanelPoint[]): Rect {
  return {
    minU: Math.min(...polygon.map((point) => point.uMm)),
    maxU: Math.max(...polygon.map((point) => point.uMm)),
    minV: Math.min(...polygon.map((point) => point.vMm)),
    maxV: Math.max(...polygon.map((point) => point.vMm)),
  };
}

function clipHalfPlane(
  polygon: readonly PanelPoint[],
  start: PanelPoint,
  end: PanelPoint,
  interiorSign: number,
): PanelPoint[] {
  const side = (point: PanelPoint) =>
    interiorSign *
    ((end.uMm - start.uMm) * (point.vMm - start.vMm) -
      (end.vMm - start.vMm) * (point.uMm - start.uMm));
  const output: PanelPoint[] = [];
  if (!polygon.length) return output;
  for (let index = 0; index < polygon.length; index++) {
    const previous = polygon[(index + polygon.length - 1) % polygon.length]!;
    const current = polygon[index]!;
    const previousSide = side(previous);
    const currentSide = side(current);
    const previousInside = previousSide >= -EPS;
    const currentInside = currentSide >= -EPS;
    if (previousInside !== currentInside) {
      const denominator = previousSide - currentSide;
      if (Math.abs(denominator) > EPS) {
        const ratio = previousSide / denominator;
        output.push({
          uMm: previous.uMm + ratio * (current.uMm - previous.uMm),
          vMm: previous.vMm + ratio * (current.vMm - previous.vMm),
        });
      }
    }
    if (currentInside) output.push(current);
  }
  return output.length >= 3 && area(output) > EPS ? output : [];
}

function subtractOpening(
  polygon: readonly PanelPoint[],
  opening: readonly PanelPoint[],
): PanelPoint[][] {
  const one = bounds(polygon);
  const two = bounds(opening);
  if (
    two.maxU <= one.minU + EPS ||
    two.minU >= one.maxU - EPS ||
    two.maxV <= one.minV + EPS ||
    two.minV >= one.maxV - EPS
  )
    return [polygon.slice()];
  const orientation = Math.sign(signedArea(opening));
  const outside: PanelPoint[][] = [];
  let inside = polygon.slice();
  for (let index = 0; index < opening.length && inside.length; index++) {
    const start = opening[index]!;
    const end = opening[(index + 1) % opening.length]!;
    const piece = clipHalfPlane(inside, start, end, -orientation);
    if (piece.length) outside.push(piece);
    inside = clipHalfPlane(inside, start, end, orientation);
  }
  return outside;
}

function connected(a: readonly PanelPoint[], b: readonly PanelPoint[]) {
  const one = bounds(a);
  const two = bounds(b);
  const uOverlap = Math.min(one.maxU, two.maxU) - Math.max(one.minU, two.minU);
  const vOverlap = Math.min(one.maxV, two.maxV) - Math.max(one.minV, two.minV);
  if (uOverlap < -EPS || vOverlap < -EPS) return false;
  for (let indexA = 0; indexA < a.length; indexA++) {
    const startA = a[indexA]!;
    const endA = a[(indexA + 1) % a.length]!;
    const duA = endA.uMm - startA.uMm;
    const dvA = endA.vMm - startA.vMm;
    const lengthA = Math.hypot(duA, dvA);
    for (let indexB = 0; indexB < b.length; indexB++) {
      const startB = b[indexB]!;
      const endB = b[(indexB + 1) % b.length]!;
      const duB = endB.uMm - startB.uMm;
      const dvB = endB.vMm - startB.vMm;
      const lengthB = Math.hypot(duB, dvB);
      const parallel =
        Math.abs(duA * dvB - dvA * duB) <= EPS * Math.max(1, lengthA * lengthB);
      const collinear =
        Math.abs(
          duA * (startB.vMm - startA.vMm) - dvA * (startB.uMm - startA.uMm),
        ) <=
        EPS * Math.max(1, lengthA);
      if (!parallel || !collinear) continue;
      const axis: Axis = Math.abs(duA) >= Math.abs(dvA) ? 'uMm' : 'vMm';
      const overlap =
        Math.min(
          Math.max(startA[axis], endA[axis]),
          Math.max(startB[axis], endB[axis]),
        ) -
        Math.max(
          Math.min(startA[axis], endA[axis]),
          Math.min(startB[axis], endB[axis]),
        );
      if (overlap > EPS) return true;
    }
  }
  return false;
}

function components(polygons: PanelPoint[][]) {
  const parent = polygons.map((_, index) => index);
  const root = (index: number): number =>
    parent[index] === index ? index : root(parent[index]!);
  for (let a = 0; a < polygons.length; a++)
    for (let b = a + 1; b < polygons.length; b++)
      if (connected(polygons[a]!, polygons[b]!)) parent[root(b)] = root(a);
  const groups = new Map<number, PanelPoint[][]>();
  polygons.forEach((polygon, index) => {
    const key = root(index);
    groups.set(key, [...(groups.get(key) ?? []), polygon]);
  });
  return [...groups.values()].sort(
    (a, b) =>
      Math.min(...a.flatMap((polygon) => polygon.map((point) => point.vMm))) -
      Math.min(...b.flatMap((polygon) => polygon.map((point) => point.vMm))),
  );
}

/** One coherent U grid per plane; each connected visible component is one run candidate. */
export function resolveVariablePanelPlane(
  input: VariablePanelInput,
): VariablePanelPlaneResult {
  const openings = input.openings.map((opening) => ({
    id: opening.id,
    polygon: openingPolygon(opening),
  }));
  const numbers = [
    input.effectiveWidthMm,
    input.minPanelLengthMm,
    input.maxPanelLengthMm,
    ...input.polygon.flatMap((point) => [point.uMm, point.vMm]),
    ...openings.flatMap((opening) =>
      opening.polygon.flatMap((point) => [point.uMm, point.vMm]),
    ),
  ];
  if (
    !input.roofPlaneId ||
    !convex(input.polygon) ||
    numbers.some((number) => !Number.isFinite(number)) ||
    input.effectiveWidthMm <= 0 ||
    input.minPanelLengthMm <= 0 ||
    input.maxPanelLengthMm < input.minPanelLengthMm ||
    openings.some((opening) => !opening.id || !convex(opening.polygon)) ||
    (input.horizontalAlignment === 'manual' &&
      !Number.isFinite(input.manualOffsetMm))
  )
    throw new RangeError('invalid_variable_panel_geometry');
  const extent = bounds(input.polygon);
  if (area(input.polygon) <= EPS)
    throw new RangeError('invalid_variable_panel_geometry');
  const width = input.effectiveWidthMm;
  const span = extent.maxU - extent.minU;
  const origin =
    input.horizontalAlignment === 'centered'
      ? extent.minU - (Math.ceil(span / width) * width - span) / 2
      : extent.minU +
        (input.horizontalAlignment === 'manual' ? input.manualOffsetMm! : 0);
  const first = Math.floor((extent.minU - origin) / width);
  const last = Math.ceil((extent.maxU - origin) / width);
  if (last - first > 10000)
    throw new RangeError('variable_panel_grid_too_dense');
  const columns: VariablePanelColumn[] = [];
  for (let index = first; index < last; index++) {
    const fromU = origin + index * width;
    const toU = fromU + width;
    const roofSlice = clipRect(input.polygon, {
      minU: fromU,
      maxU: toU,
      minV: extent.minV,
      maxV: extent.maxV,
    });
    if (!roofSlice.length) continue;
    const visible = openings
      .filter((opening) => {
        const extent = bounds(opening.polygon);
        return extent.minU < toU - EPS && extent.maxU > fromU + EPS;
      })
      .sort((a, b) => a.id.localeCompare(b.id))
      .reduce<PanelPoint[][]>(
        (pieces, opening) =>
          pieces.flatMap((piece) => subtractOpening(piece, opening.polygon)),
        [roofSlice],
      );
    const sliceBounds = bounds(roofSlice);
    const edge = sliceBounds.maxU - sliceBounds.minU < width - EPS;
    const runs: VariablePanelRun[] = components(visible).map(
      (polygons, runIndex) => {
        const points = polygons.flat();
        const fromV = Math.min(...points.map((point) => point.vMm));
        const toV = Math.max(...points.map((point) => point.vMm));
        const length = toV - fromV;
        const openingIds = openings
          .filter((opening) => {
            const extent = bounds(opening.polygon);
            return (
              extent.maxU > sliceBounds.minU + EPS &&
              extent.minU < sliceBounds.maxU - EPS &&
              (Math.abs(fromV - extent.maxV) <= EPS ||
                Math.abs(toV - extent.minV) <= EPS ||
                (fromV < extent.maxV - EPS && toV > extent.minV + EPS))
            );
          })
          .map((opening) => opening.id)
          .sort();
        return {
          id: `${input.roofPlaneId}:panel:${index}:run:${runIndex}`,
          fromVMm: fromV,
          toVMm: toV,
          lengthMm: length,
          polygons,
          openingIds,
          cause: openingIds.length
            ? ('opening-interrupted' as const)
            : edge
              ? ('edge' as const)
              : ('full-slope' as const),
          issues: [
            ...(length < input.minPanelLengthMm - EPS
              ? ['below-min-panel-length' as const]
              : []),
            ...(length > input.maxPanelLengthMm + EPS
              ? ['exceeds-max-panel-length' as const]
              : []),
          ],
        };
      },
    );
    if (!runs.length) continue;
    columns.push({
      id: `${input.roofPlaneId}:panel:${index}`,
      columnIndex: index,
      nominalFromUMm: fromU,
      nominalToUMm: toU,
      effectiveVisibleWidthMm: sliceBounds.maxU - sliceBounds.minU,
      edgeClassification: edge ? 'edge-cut-width' : 'full-width',
      runs,
    });
  }
  return {
    roofPlaneId: input.roofPlaneId,
    horizontalOriginUMm: origin,
    columns,
  };
}
