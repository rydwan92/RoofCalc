import type {
  CoveringBattenRow,
  CoveringOpeningGeometry,
  CoveringQuantitySource,
  CoveringRoofSurfaceGeometry,
  ModularSheetLayoutIntent,
  ModularSheetTechnicalSpec,
} from './index';

const EPSILON = 1e-7;

export type ModularSheetLayoutIssueCode =
  | 'cut-to-length-not-supported'
  | 'batten-layout-required'
  | 'batten-course-spacing-required'
  | 'module-batten-spacing-mismatch'
  | 'below-minimum-pitch'
  | 'roof-plane-not-found'
  | 'invalid-layout-geometry';

export interface ModularSheetLayoutIssue {
  code: ModularSheetLayoutIssueCode;
  severity: 'incomplete' | 'error';
  roofPlaneId?: string;
  actual?: number;
  required?: number;
  minimum?: number;
  maximum?: number;
}

export interface SheetCoveragePoint {
  uMm: number;
  vMm: number;
}

export interface SheetVisibleFragment {
  polygon: SheetCoveragePoint[];
}

export type SheetPositionClassification =
  'full' | 'cut-roof-edge' | 'cut-opening' | 'split-by-opening';

export interface SheetPosition {
  id: string;
  rowIndex: number;
  columnIndex: number;
  nominalFromUMm: number;
  nominalToUMm: number;
  nominalFromVMm: number;
  nominalToVMm: number;
  visibleFragments: SheetVisibleFragment[];
  classification: SheetPositionClassification;
  openingIds: string[];
}

export interface SheetRow {
  id: string;
  rowIndex: number;
  nominalFromVMm: number;
  nominalToVMm: number;
  positions: SheetPosition[];
}

export interface ModularSheetPlaneLayout {
  roofPlaneId: string;
  horizontalOriginUMm: number;
  verticalOriginVMm: number;
  rows: SheetRow[];
  totalPositions: number;
  fullPositions: number;
  cutPositions: number;
  openingAffectedPositions: number;
  splitPositions: number;
  issues: ModularSheetLayoutIssue[];
}

export interface ModularSheetLayoutResult {
  kind: 'modular-sheet';
  status: 'resolved' | 'limited' | 'incomplete' | 'incompatible' | 'invalid';
  assignmentId: string;
  lengthModelKind: ModularSheetTechnicalSpec['lengthModel']['kind'];
  roofPlaneIds: string[];
  planes: ModularSheetPlaneLayout[];
  totalPositions: number;
  fullPositions: number;
  cutPositions: number;
  openingAffectedPositions: number;
  splitPositions: number;
  issueCodes: ModularSheetLayoutIssueCode[];
  issues: ModularSheetLayoutIssue[];
}

export interface ModularSheetLayoutInput {
  assignmentId: string;
  roofPlaneIds: readonly string[];
  roofSurfaceGeometry: readonly CoveringRoofSurfaceGeometry[];
  openings: readonly CoveringOpeningGeometry[];
  battens: readonly CoveringBattenRow[];
  productSpec: ModularSheetTechnicalSpec;
  layoutIntent: ModularSheetLayoutIntent;
}

interface Rect {
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
}

interface FragmentPiece {
  rect: Rect;
  polygon: SheetCoveragePoint[];
}

type Boundary = {
  inside: (point: SheetCoveragePoint) => boolean;
  intersect: (
    from: SheetCoveragePoint,
    to: SheetCoveragePoint,
  ) => SheetCoveragePoint;
};

function polygonArea(polygon: readonly SheetCoveragePoint[]) {
  if (polygon.length < 3) return 0;
  return (
    Math.abs(
      polygon.reduce((sum, point, index) => {
        const next = polygon[(index + 1) % polygon.length]!;
        return sum + point.uMm * next.vMm - next.uMm * point.vMm;
      }, 0),
    ) / 2
  );
}

function clipBoundary(
  polygon: readonly SheetCoveragePoint[],
  boundary: Boundary,
) {
  const result: SheetCoveragePoint[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const from = polygon[index]!;
    const to = polygon[(index + 1) % polygon.length]!;
    const fromInside = boundary.inside(from);
    const toInside = boundary.inside(to);
    if (fromInside && toInside) result.push(to);
    else if (fromInside) result.push(boundary.intersect(from, to));
    else if (toInside) {
      result.push(boundary.intersect(from, to));
      result.push(to);
    }
  }
  return result;
}

function clipPolygonToRect(polygon: readonly SheetCoveragePoint[], rect: Rect) {
  const atU = (
    uMm: number,
    from: SheetCoveragePoint,
    to: SheetCoveragePoint,
  ) => ({
    uMm,
    vMm:
      from.vMm + ((uMm - from.uMm) * (to.vMm - from.vMm)) / (to.uMm - from.uMm),
  });
  const atV = (
    vMm: number,
    from: SheetCoveragePoint,
    to: SheetCoveragePoint,
  ) => ({
    uMm:
      from.uMm + ((vMm - from.vMm) * (to.uMm - from.uMm)) / (to.vMm - from.vMm),
    vMm,
  });
  const boundaries: Boundary[] = [
    {
      inside: (point) => point.uMm >= rect.minU - EPSILON,
      intersect: (a, b) => atU(rect.minU, a, b),
    },
    {
      inside: (point) => point.uMm <= rect.maxU + EPSILON,
      intersect: (a, b) => atU(rect.maxU, a, b),
    },
    {
      inside: (point) => point.vMm >= rect.minV - EPSILON,
      intersect: (a, b) => atV(rect.minV, a, b),
    },
    {
      inside: (point) => point.vMm <= rect.maxV + EPSILON,
      intersect: (a, b) => atV(rect.maxV, a, b),
    },
  ];
  return boundaries.reduce<SheetCoveragePoint[]>(
    (current, boundary) =>
      current.length ? clipBoundary(current, boundary) : [],
    [...polygon],
  );
}

function rectanglesOverlap(a: Rect, b: Rect) {
  return (
    a.minU < b.maxU - EPSILON &&
    a.maxU > b.minU + EPSILON &&
    a.minV < b.maxV - EPSILON &&
    a.maxV > b.minV + EPSILON
  );
}

function subtractRect(source: Rect, hole: Rect): Rect[] {
  if (!rectanglesOverlap(source, hole)) return [source];
  const overlap = {
    minU: Math.max(source.minU, hole.minU),
    maxU: Math.min(source.maxU, hole.maxU),
    minV: Math.max(source.minV, hole.minV),
    maxV: Math.min(source.maxV, hole.maxV),
  };
  return [
    { ...source, maxU: overlap.minU },
    { ...source, minU: overlap.maxU },
    {
      minU: overlap.minU,
      maxU: overlap.maxU,
      minV: source.minV,
      maxV: overlap.minV,
    },
    {
      minU: overlap.minU,
      maxU: overlap.maxU,
      minV: overlap.maxV,
      maxV: source.maxV,
    },
  ].filter(
    (item) =>
      item.maxU - item.minU > EPSILON && item.maxV - item.minV > EPSILON,
  );
}

function piecesConnect(a: Rect, b: Rect) {
  const horizontal =
    (Math.abs(a.maxU - b.minU) <= EPSILON ||
      Math.abs(b.maxU - a.minU) <= EPSILON) &&
    Math.min(a.maxV, b.maxV) - Math.max(a.minV, b.minV) > EPSILON;
  const vertical =
    (Math.abs(a.maxV - b.minV) <= EPSILON ||
      Math.abs(b.maxV - a.minV) <= EPSILON) &&
    Math.min(a.maxU, b.maxU) - Math.max(a.minU, b.minU) > EPSILON;
  return horizontal || vertical || rectanglesOverlap(a, b);
}

function componentCount(pieces: readonly FragmentPiece[]) {
  const seen = new Set<number>();
  let total = 0;
  for (let start = 0; start < pieces.length; start += 1) {
    if (seen.has(start)) continue;
    total += 1;
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const current = stack.pop()!;
      for (let next = 0; next < pieces.length; next += 1)
        if (
          !seen.has(next) &&
          piecesConnect(pieces[current]!.rect, pieces[next]!.rect)
        ) {
          seen.add(next);
          stack.push(next);
        }
    }
  }
  return total;
}

function horizontalOrigin(
  plane: CoveringRoofSurfaceGeometry,
  effectiveWidthMm: number,
  intent: ModularSheetLayoutIntent,
) {
  const minU = Math.min(...plane.localPolygon.map((point) => point.uMm));
  const maxU = Math.max(...plane.localPolygon.map((point) => point.uMm));
  if (intent.horizontalAlignment === 'from-u-min') return minU;
  if (intent.horizontalAlignment === 'manual')
    return minU + (intent.planeOffsetsMm?.[plane.roofPlaneId] ?? 0);
  const columns = Math.max(1, Math.ceil((maxU - minU) / effectiveWidthMm));
  return minU - (columns * effectiveWidthMm - (maxU - minU)) / 2;
}

function createPosition(args: {
  id: string;
  rowIndex: number;
  columnIndex: number;
  rect: Rect;
  plane: CoveringRoofSurfaceGeometry;
  openings: readonly CoveringOpeningGeometry[];
}): SheetPosition | undefined {
  const nominalArea =
    (args.rect.maxU - args.rect.minU) * (args.rect.maxV - args.rect.minV);
  const planeCell = clipPolygonToRect(args.plane.localPolygon, args.rect);
  const planeArea = polygonArea(planeCell);
  if (planeArea <= EPSILON) return undefined;
  const openings = args.openings
    .filter((opening) =>
      rectanglesOverlap(args.rect, {
        minU: opening.fromUMm,
        maxU: opening.toUMm,
        minV: opening.fromVMm,
        maxV: opening.toVMm,
      }),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const visibleRects = openings.reduce<Rect[]>(
    (rects, opening) =>
      rects.flatMap((rect) =>
        subtractRect(rect, {
          minU: opening.fromUMm,
          maxU: opening.toUMm,
          minV: opening.fromVMm,
          maxV: opening.toVMm,
        }),
      ),
    [args.rect],
  );
  const pieces = visibleRects.flatMap<FragmentPiece>((rect) => {
    const polygon = clipPolygonToRect(args.plane.localPolygon, rect);
    return polygonArea(polygon) > EPSILON ? [{ rect, polygon }] : [];
  });
  if (!pieces.length) return undefined;
  const openingAffected = openings.length > 0;
  const classification: SheetPositionClassification =
    openingAffected && componentCount(pieces) > 1
      ? 'split-by-opening'
      : openingAffected
        ? 'cut-opening'
        : Math.abs(planeArea - nominalArea) > EPSILON
          ? 'cut-roof-edge'
          : 'full';
  return {
    id: args.id,
    rowIndex: args.rowIndex,
    columnIndex: args.columnIndex,
    nominalFromUMm: args.rect.minU,
    nominalToUMm: args.rect.maxU,
    nominalFromVMm: args.rect.minV,
    nominalToVMm: args.rect.maxV,
    visibleFragments: pieces.map((piece) => ({ polygon: piece.polygon })),
    classification,
    openingIds: openings.map((opening) => opening.id),
  };
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort();
}

function finiteInput(input: ModularSheetLayoutInput) {
  return [
    ...input.roofSurfaceGeometry.flatMap((plane) => [
      plane.pitchDeg,
      plane.netAreaMm2,
      ...plane.localPolygon.flatMap((point) => [point.uMm, point.vMm]),
    ]),
    ...input.openings.flatMap((opening) => [
      opening.fromUMm,
      opening.toUMm,
      opening.fromVMm,
      opening.toVMm,
    ]),
    ...input.battens.flatMap((row) => [
      row.stationVMm,
      ...row.segments.flatMap((segment) => [segment.fromUMm, segment.toUMm]),
    ]),
  ].every(Number.isFinite);
}

export function resolveModularSheetLayout(
  input: ModularSheetLayoutInput,
): ModularSheetLayoutResult {
  const roofPlaneIds = uniqueSorted(input.roofPlaneIds);
  const sharedIssues: ModularSheetLayoutIssue[] = [];
  if (!finiteInput(input))
    sharedIssues.push({ code: 'invalid-layout-geometry', severity: 'error' });
  if (input.productSpec.lengthModel.kind === 'cut-to-length')
    sharedIssues.push({
      code: 'cut-to-length-not-supported',
      severity: 'incomplete',
    });
  const planes: ModularSheetPlaneLayout[] = [];
  if (
    finiteInput(input) &&
    input.productSpec.lengthModel.kind === 'fixed-sheet'
  ) {
    for (const roofPlaneId of roofPlaneIds) {
      const plane = input.roofSurfaceGeometry.find(
        (item) => item.roofPlaneId === roofPlaneId,
      );
      if (!plane) {
        sharedIssues.push({
          code: 'roof-plane-not-found',
          severity: 'error',
          roofPlaneId,
        });
        continue;
      }
      const issues: ModularSheetLayoutIssue[] = [];
      if (
        input.productSpec.minPitchDeg !== undefined &&
        plane.pitchDeg < input.productSpec.minPitchDeg
      )
        issues.push({
          code: 'below-minimum-pitch',
          severity: 'error',
          roofPlaneId,
          actual: plane.pitchDeg,
          required: input.productSpec.minPitchDeg,
        });
      const battens = input.battens
        .filter((row) => row.roofPlaneId === roofPlaneId)
        .sort(
          (a, b) => a.stationVMm - b.stationVMm || a.id.localeCompare(b.id),
        );
      if (!battens.length)
        issues.push({
          code: 'batten-layout-required',
          severity: 'incomplete',
          roofPlaneId,
        });
      if (battens.length === 1)
        issues.push({
          code: 'batten-course-spacing-required',
          severity: 'incomplete',
          roofPlaneId,
        });
      for (let index = 1; index < battens.length; index += 1) {
        const actual =
          battens[index]!.stationVMm - battens[index - 1]!.stationVMm;
        const required =
          input.productSpec.battenGaugeMm ?? input.productSpec.moduleLengthMm;
        if (Math.abs(actual - required) > EPSILON) {
          issues.push({
            code: 'module-batten-spacing-mismatch',
            severity: 'error',
            roofPlaneId,
            actual,
            required,
          });
          break;
        }
      }
      const minU = Math.min(...plane.localPolygon.map((point) => point.uMm));
      const maxU = Math.max(...plane.localPolygon.map((point) => point.uMm));
      const minV = Math.min(...plane.localPolygon.map((point) => point.vMm));
      const maxV = Math.max(...plane.localPolygon.map((point) => point.vMm));
      const horizontal = horizontalOrigin(
        plane,
        input.productSpec.effectiveWidthMm,
        input.layoutIntent,
      );
      const firstColumn = Math.floor(
        (minU - horizontal) / input.productSpec.effectiveWidthMm,
      );
      const lastColumn =
        Math.ceil((maxU - horizontal) / input.productSpec.effectiveWidthMm) - 1;
      const rowCount = Math.max(
        1,
        Math.ceil(
          (maxV - minV) / input.productSpec.lengthModel.effectiveLengthMm,
        ),
      );
      const planeOpenings = input.openings.filter(
        (opening) => opening.roofPlaneId === roofPlaneId,
      );
      const rows: SheetRow[] = [];
      for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        const fromV =
          minV + rowIndex * input.productSpec.lengthModel.effectiveLengthMm;
        const positions: SheetPosition[] = [];
        for (
          let columnIndex = firstColumn;
          columnIndex <= lastColumn;
          columnIndex += 1
        ) {
          const fromU =
            horizontal + columnIndex * input.productSpec.effectiveWidthMm;
          const position = createPosition({
            id: `sheet:${input.assignmentId}:${roofPlaneId}:${rowIndex + 1}:${columnIndex}`,
            rowIndex,
            columnIndex,
            rect: {
              minU: fromU,
              maxU: fromU + input.productSpec.effectiveWidthMm,
              minV: fromV,
              maxV: fromV + input.productSpec.lengthModel.effectiveLengthMm,
            },
            plane,
            openings: planeOpenings,
          });
          if (position) positions.push(position);
        }
        if (positions.length)
          rows.push({
            id: `sheet-row:${input.assignmentId}:${roofPlaneId}:${rowIndex + 1}`,
            rowIndex,
            nominalFromVMm: fromV,
            nominalToVMm:
              fromV + input.productSpec.lengthModel.effectiveLengthMm,
            positions,
          });
      }
      const positions = rows.flatMap((row) => row.positions);
      planes.push({
        roofPlaneId,
        horizontalOriginUMm: horizontal,
        verticalOriginVMm: minV,
        rows,
        totalPositions: positions.length,
        fullPositions: positions.filter(
          (item) => item.classification === 'full',
        ).length,
        cutPositions: positions.filter((item) => item.classification !== 'full')
          .length,
        openingAffectedPositions: positions.filter(
          (item) => item.openingIds.length > 0,
        ).length,
        splitPositions: positions.filter(
          (item) => item.classification === 'split-by-opening',
        ).length,
        issues,
      });
    }
  }
  const issues = [...sharedIssues, ...planes.flatMap((plane) => plane.issues)];
  const status = sharedIssues.some(
    (issue) => issue.code === 'cut-to-length-not-supported',
  )
    ? 'limited'
    : issues.some(
          (issue) =>
            issue.code === 'invalid-layout-geometry' ||
            issue.code === 'roof-plane-not-found',
        )
      ? 'invalid'
      : issues.some((issue) => issue.severity === 'error')
        ? 'incompatible'
        : issues.length
          ? 'incomplete'
          : 'resolved';
  const positions = planes.flatMap((plane) =>
    plane.rows.flatMap((row) => row.positions),
  );
  return {
    kind: 'modular-sheet',
    status,
    assignmentId: input.assignmentId,
    lengthModelKind: input.productSpec.lengthModel.kind,
    roofPlaneIds,
    planes,
    totalPositions: positions.length,
    fullPositions: positions.filter((item) => item.classification === 'full')
      .length,
    cutPositions: positions.filter((item) => item.classification !== 'full')
      .length,
    openingAffectedPositions: positions.filter(
      (item) => item.openingIds.length > 0,
    ).length,
    splitPositions: positions.filter(
      (item) => item.classification === 'split-by-opening',
    ).length,
    issueCodes: uniqueSorted(issues.map((issue) => issue.code)),
    issues,
  };
}

export function createModularSheetQuantitySource(args: {
  layout: ModularSheetLayoutResult;
  productDisplay?: CoveringQuantitySource['productDisplay'];
}): CoveringQuantitySource | undefined {
  if (
    args.layout.status !== 'resolved' ||
    !args.layout.roofPlaneIds.length ||
    !args.layout.totalPositions
  )
    return undefined;
  return {
    id: `covering-quantity:${args.layout.assignmentId}`,
    coveringAssignmentId: args.layout.assignmentId,
    sourceRoofPlaneIds: [...args.layout.roofPlaneIds],
    layoutKind: 'modular-sheet',
    semantic: 'effective-coverage-position',
    unit: 'coverage-position',
    quantity: args.layout.totalPositions,
    fullPositions: args.layout.fullPositions,
    cutPositions: args.layout.cutPositions,
    splitPositions: args.layout.splitPositions,
    requirementReadiness: 'geometric-only',
    productDisplay: args.productDisplay,
    warningKeys: [
      'no-waste-accessories-or-offcut-reuse',
      'geometric-sheet-positions-not-purchase-quantity',
      ...(args.layout.splitPositions > 0
        ? ['split-fragments-not-guaranteed-from-one-purchased-sheet']
        : []),
    ],
  };
}
