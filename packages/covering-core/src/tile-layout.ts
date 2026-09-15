import { resolveInstallationMode } from './roof-tile-installation';
import { roofTileTechnicalSpecSchema } from './index';
import type {
  CoveringBattenRow,
  CoveringOpeningGeometry,
  CoveringQuantitySource,
  CoveringRoofSurfaceGeometry,
  RoofTileLayoutIntent,
  RoofTileTechnicalSpec,
} from './index';

const EPSILON = 1e-7;

export type RoofTileLayoutIssueCode =
  | 'installation-mode-required'
  | 'installation-mode-not-found'
  | 'tile-placement-pattern-required'
  | 'batten-layout-required'
  | 'batten-course-spacing-required'
  | 'batten-gauge-below-minimum'
  | 'batten-gauge-above-maximum'
  | 'below-minimum-pitch'
  | 'roof-plane-not-found'
  | 'invalid-layout-geometry'
  | 'invalid-product-data';

export interface RoofTileLayoutIssue {
  code: RoofTileLayoutIssueCode;
  severity: 'incomplete' | 'error';
  roofPlaneId?: string;
  actual?: number;
  required?: number;
  minimum?: number;
  maximum?: number;
}

export interface TileCoveragePoint {
  uMm: number;
  vMm: number;
}

export interface TileVisibleFragment {
  polygon: TileCoveragePoint[];
}

export type TilePositionClassification =
  'full' | 'cut-roof-edge' | 'cut-opening' | 'split-by-opening';

export interface TilePosition {
  id: string;
  columnIndex: number;
  nominalFromUMm: number;
  nominalToUMm: number;
  nominalFromVMm: number;
  nominalToVMm: number;
  visibleFragments: TileVisibleFragment[];
  classification: TilePositionClassification;
  openingIds: string[];
}

export interface TileCourse {
  id: string;
  rowId: string;
  battenId: string;
  stationVMm: number;
  layerIndex: number;
  layerId: string;
  horizontalOffsetFraction: number;
  positions: TilePosition[];
}

export interface TilePlaneLayout {
  roofPlaneId: string;
  horizontalOriginUMm: number;
  actualGaugeRangeMm?: { min: number; max: number };
  courses: TileCourse[];
  totalPositions: number;
  fullPositions: number;
  cutPositions: number;
  splitPositions: number;
  issues: RoofTileLayoutIssue[];
}

export interface DeclaredTileConsumptionReference {
  netAssignedAreaMm2: number;
  minimumPieces: number;
  maximumPieces: number;
}

export interface RoofTileLayoutResult {
  kind: 'roof-tile';
  status: 'resolved' | 'incomplete' | 'incompatible' | 'invalid';
  assignmentId: string;
  installationModeId?: string;
  roofPlaneIds: string[];
  planes: TilePlaneLayout[];
  totalPositions: number;
  fullPositions: number;
  cutPositions: number;
  splitPositions: number;
  issueCodes: RoofTileLayoutIssueCode[];
  issues: RoofTileLayoutIssue[];
  declaredConsumptionReference?: DeclaredTileConsumptionReference;
}

export interface RoofTileLayoutInput {
  assignmentId: string;
  roofPlaneIds: readonly string[];
  roofSurfaceGeometry: readonly CoveringRoofSurfaceGeometry[];
  openings: readonly CoveringOpeningGeometry[];
  battens: readonly CoveringBattenRow[];
  productSpec: RoofTileTechnicalSpec;
  selectedInstallationModeId?: string;
  layoutIntent: RoofTileLayoutIntent;
}

interface Rect {
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
}

interface FragmentPiece {
  rect: Rect;
  polygon: TileCoveragePoint[];
}

type Boundary = {
  inside: (point: TileCoveragePoint) => boolean;
  intersect: (
    from: TileCoveragePoint,
    to: TileCoveragePoint,
  ) => TileCoveragePoint;
};

function polygonArea(polygon: readonly TileCoveragePoint[]) {
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
  polygon: readonly TileCoveragePoint[],
  boundary: Boundary,
) {
  const result: TileCoveragePoint[] = [];
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

function clipPolygonToRect(polygon: readonly TileCoveragePoint[], rect: Rect) {
  const interpolateU = (
    uMm: number,
    from: TileCoveragePoint,
    to: TileCoveragePoint,
  ) => ({
    uMm,
    vMm:
      from.vMm + ((uMm - from.uMm) * (to.vMm - from.vMm)) / (to.uMm - from.uMm),
  });
  const interpolateV = (
    vMm: number,
    from: TileCoveragePoint,
    to: TileCoveragePoint,
  ) => ({
    uMm:
      from.uMm + ((vMm - from.vMm) * (to.uMm - from.uMm)) / (to.vMm - from.vMm),
    vMm,
  });
  const boundaries: Boundary[] = [
    {
      inside: (point) => point.uMm >= rect.minU - EPSILON,
      intersect: (from, to) => interpolateU(rect.minU, from, to),
    },
    {
      inside: (point) => point.uMm <= rect.maxU + EPSILON,
      intersect: (from, to) => interpolateU(rect.maxU, from, to),
    },
    {
      inside: (point) => point.vMm >= rect.minV - EPSILON,
      intersect: (from, to) => interpolateV(rect.minV, from, to),
    },
    {
      inside: (point) => point.vMm <= rect.maxV + EPSILON,
      intersect: (from, to) => interpolateV(rect.maxV, from, to),
    },
  ];
  return boundaries.reduce<TileCoveragePoint[]>(
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
    (rect) =>
      rect.maxU - rect.minU > EPSILON && rect.maxV - rect.minV > EPSILON,
  );
}

function piecesConnect(a: Rect, b: Rect) {
  const horizontalTouch =
    (Math.abs(a.maxU - b.minU) <= EPSILON ||
      Math.abs(b.maxU - a.minU) <= EPSILON) &&
    Math.min(a.maxV, b.maxV) - Math.max(a.minV, b.minV) > EPSILON;
  const verticalTouch =
    (Math.abs(a.maxV - b.minV) <= EPSILON ||
      Math.abs(b.maxV - a.minV) <= EPSILON) &&
    Math.min(a.maxU, b.maxU) - Math.max(a.minU, b.minU) > EPSILON;
  return horizontalTouch || verticalTouch || rectanglesOverlap(a, b);
}

function connectedComponentCount(pieces: readonly FragmentPiece[]) {
  if (!pieces.length) return 0;
  const seen = new Set<number>();
  let components = 0;
  for (let start = 0; start < pieces.length; start += 1) {
    if (seen.has(start)) continue;
    components += 1;
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const current = stack.pop()!;
      for (let candidate = 0; candidate < pieces.length; candidate += 1) {
        if (
          !seen.has(candidate) &&
          piecesConnect(pieces[current]!.rect, pieces[candidate]!.rect)
        ) {
          seen.add(candidate);
          stack.push(candidate);
        }
      }
    }
  }
  return components;
}

function intervalBounds(
  rows: readonly CoveringBattenRow[],
  plane: CoveringRoofSurfaceGeometry,
  index: number,
) {
  const minV = Math.min(...plane.localPolygon.map((point) => point.vMm));
  const maxV = Math.max(...plane.localPolygon.map((point) => point.vMm));
  const current = rows[index]!.stationVMm;
  const previous = rows[index - 1]?.stationVMm;
  const next = rows[index + 1]?.stationVMm;
  return {
    minV:
      previous === undefined ? minV : Math.max(minV, (previous + current) / 2),
    maxV: next === undefined ? maxV : Math.min(maxV, (current + next) / 2),
  };
}

function horizontalOrigin(
  plane: CoveringRoofSurfaceGeometry,
  coverWidthMm: number,
  intent: RoofTileLayoutIntent,
) {
  const minU = Math.min(...plane.localPolygon.map((point) => point.uMm));
  const maxU = Math.max(...plane.localPolygon.map((point) => point.uMm));
  if (intent.horizontalAlignment === 'from-u-min') return minU;
  if (intent.horizontalAlignment === 'manual')
    return minU + (intent.planeOffsetsMm?.[plane.roofPlaneId] ?? 0);
  const width = maxU - minU;
  const columns = Math.max(1, Math.ceil(width / coverWidthMm));
  return minU - (columns * coverWidthMm - width) / 2;
}

function createPosition(args: {
  id: string;
  columnIndex: number;
  rect: Rect;
  plane: CoveringRoofSurfaceGeometry;
  openings: readonly CoveringOpeningGeometry[];
}): TilePosition | undefined {
  const nominalArea =
    (args.rect.maxU - args.rect.minU) * (args.rect.maxV - args.rect.minV);
  const planeCell = clipPolygonToRect(args.plane.localPolygon, args.rect);
  const planeArea = polygonArea(planeCell);
  if (planeArea <= EPSILON) return undefined;
  const intersectingOpenings = args.openings
    .filter((opening) =>
      rectanglesOverlap(args.rect, {
        minU: opening.fromUMm,
        maxU: opening.toUMm,
        minV: opening.fromVMm,
        maxV: opening.toVMm,
      }),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const visibleRects = intersectingOpenings.reduce<Rect[]>(
    (rectangles, opening) =>
      rectangles.flatMap((rectangle) =>
        subtractRect(rectangle, {
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
  const openingAffected = intersectingOpenings.length > 0;
  const split = openingAffected && connectedComponentCount(pieces) > 1;
  const classification: TilePositionClassification = split
    ? 'split-by-opening'
    : openingAffected
      ? 'cut-opening'
      : Math.abs(planeArea - nominalArea) > EPSILON
        ? 'cut-roof-edge'
        : 'full';
  return {
    id: args.id,
    columnIndex: args.columnIndex,
    nominalFromUMm: args.rect.minU,
    nominalToUMm: args.rect.maxU,
    nominalFromVMm: args.rect.minV,
    nominalToVMm: args.rect.maxV,
    visibleFragments: pieces.map((piece) => ({ polygon: piece.polygon })),
    classification,
    openingIds: intersectingOpenings.map((opening) => opening.id),
  };
}

function finiteInput(input: RoofTileLayoutInput) {
  return (
    [
      ...input.roofSurfaceGeometry.flatMap((plane) => [
        plane.pitchDeg,
        plane.netAreaMm2,
        ...plane.localPolygon.flatMap((point) => [point.uMm, point.vMm]),
      ]),
      ...input.battens.flatMap((row) => [
        row.stationVMm,
        ...row.segments.flatMap((segment) => [segment.fromUMm, segment.toUMm]),
      ]),
      ...input.openings.flatMap((opening) => [
        opening.fromUMm,
        opening.toUMm,
        opening.fromVMm,
        opening.toVMm,
      ]),
    ].every(Number.isFinite) &&
    input.roofSurfaceGeometry.every(
      (plane) =>
        plane.pitchDeg > 0 && plane.pitchDeg < 90 && plane.netAreaMm2 > 0,
    )
  );
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort();
}

export const roofTileLayoutStrategy = {
  kind: 'roof-tile' as const,
  resolve(input: RoofTileLayoutInput): RoofTileLayoutResult {
    const planeIds = uniqueSorted(input.roofPlaneIds);
    const sharedIssues: RoofTileLayoutIssue[] = [];
    if (!finiteInput(input))
      sharedIssues.push({
        code: 'invalid-layout-geometry',
        severity: 'error',
      });
    if (
      !input.selectedInstallationModeId &&
      input.productSpec.installationModes.length !== 1
    )
      sharedIssues.push({
        code: 'installation-mode-required',
        severity: 'incomplete',
      });
    const validProduct = roofTileTechnicalSpecSchema.safeParse(
      input.productSpec,
    ).success;
    if (!validProduct)
      sharedIssues.push({ code: 'invalid-product-data', severity: 'error' });
    const mode = validProduct
      ? resolveInstallationMode(
          input.productSpec.installationModes,
          input.selectedInstallationModeId,
        )
      : undefined;
    if (input.selectedInstallationModeId && !mode)
      sharedIssues.push({
        code: 'installation-mode-not-found',
        severity: 'incomplete',
      });
    if (mode && !mode.coursePattern)
      sharedIssues.push({
        code: 'tile-placement-pattern-required',
        severity: 'incomplete',
      });

    const planes: TilePlaneLayout[] = [];
    if (mode?.coursePattern && finiteInput(input)) {
      for (const roofPlaneId of planeIds) {
        const plane = input.roofSurfaceGeometry.find(
          (candidate) => candidate.roofPlaneId === roofPlaneId,
        );
        if (!plane) {
          sharedIssues.push({
            code: 'roof-plane-not-found',
            severity: 'error',
            roofPlaneId,
          });
          continue;
        }
        const rows = input.battens
          .filter((row) => row.roofPlaneId === roofPlaneId)
          .sort(
            (a, b) => a.stationVMm - b.stationVMm || a.id.localeCompare(b.id),
          );
        const issues: RoofTileLayoutIssue[] = [];
        if (!rows.length)
          issues.push({
            code: 'batten-layout-required',
            severity: 'incomplete',
            roofPlaneId,
          });
        const spacings = rows
          .slice(1)
          .map((row, index) => row.stationVMm - rows[index]!.stationVMm);
        const actualGaugeRangeMm = spacings.length
          ? { min: Math.min(...spacings), max: Math.max(...spacings) }
          : undefined;
        if (rows.length === 1)
          issues.push({
            code: 'batten-course-spacing-required',
            severity: 'incomplete',
            roofPlaneId,
          });
        if (
          actualGaugeRangeMm &&
          actualGaugeRangeMm.min < mode.gaugeRangeMm.min - EPSILON
        )
          issues.push({
            code: 'batten-gauge-below-minimum',
            severity: 'error',
            roofPlaneId,
            actual: actualGaugeRangeMm.min,
            minimum: mode.gaugeRangeMm.min,
            maximum: mode.gaugeRangeMm.max,
          });
        if (
          actualGaugeRangeMm &&
          actualGaugeRangeMm.max > mode.gaugeRangeMm.max + EPSILON
        )
          issues.push({
            code: 'batten-gauge-above-maximum',
            severity: 'error',
            roofPlaneId,
            actual: actualGaugeRangeMm.max,
            minimum: mode.gaugeRangeMm.min,
            maximum: mode.gaugeRangeMm.max,
          });
        if (mode.minPitchDeg !== undefined && plane.pitchDeg < mode.minPitchDeg)
          issues.push({
            code: 'below-minimum-pitch',
            severity: 'error',
            roofPlaneId,
            actual: plane.pitchDeg,
            required: mode.minPitchDeg,
          });
        const baseOrigin = horizontalOrigin(
          plane,
          mode.coverWidthMm,
          input.layoutIntent,
        );
        const planeOpenings = input.openings.filter(
          (opening) => opening.roofPlaneId === roofPlaneId,
        );
        const courses = rows.flatMap<TileCourse>((row, rowIndex) => {
          const vertical = intervalBounds(rows, plane, rowIndex);
          if (vertical.maxV - vertical.minV <= EPSILON) return [];
          const rowOffset =
            mode.coursePattern!.battenRowOffsetCycle[
              rowIndex % mode.coursePattern!.battenRowOffsetCycle.length
            ]!;
          return mode.coursePattern!.layers.map((layer, layerIndex) => {
            const offsetFraction =
              (rowOffset + layer.horizontalOffsetFraction) % 1;
            const courseOrigin =
              baseOrigin + offsetFraction * mode.coverWidthMm;
            const minU = Math.min(
              ...plane.localPolygon.map((point) => point.uMm),
            );
            const maxU = Math.max(
              ...plane.localPolygon.map((point) => point.uMm),
            );
            const firstColumn = Math.floor(
              (minU - courseOrigin) / mode.coverWidthMm,
            );
            const lastColumn =
              Math.ceil((maxU - courseOrigin) / mode.coverWidthMm) - 1;
            const positions: TilePosition[] = [];
            for (
              let columnIndex = firstColumn;
              columnIndex <= lastColumn;
              columnIndex += 1
            ) {
              const fromU = courseOrigin + columnIndex * mode.coverWidthMm;
              const position = createPosition({
                id: `tile:${input.assignmentId}:${roofPlaneId}:${rowIndex + 1}:${layerIndex + 1}:${columnIndex}`,
                columnIndex,
                rect: {
                  minU: fromU,
                  maxU: fromU + mode.coverWidthMm,
                  minV: vertical.minV,
                  maxV: vertical.maxV,
                },
                plane,
                openings: planeOpenings,
              });
              if (position) positions.push(position);
            }
            return {
              id: `tile-course:${input.assignmentId}:${roofPlaneId}:${rowIndex + 1}:${layerIndex + 1}`,
              rowId: row.id,
              battenId: row.id,
              stationVMm: row.stationVMm,
              layerIndex,
              layerId: layer.id,
              horizontalOffsetFraction: offsetFraction,
              positions,
            };
          });
        });
        const positions = courses.flatMap((course) => course.positions);
        planes.push({
          roofPlaneId,
          horizontalOriginUMm: baseOrigin,
          actualGaugeRangeMm,
          courses,
          totalPositions: positions.length,
          fullPositions: positions.filter(
            (position) => position.classification === 'full',
          ).length,
          cutPositions: positions.filter(
            (position) => position.classification !== 'full',
          ).length,
          splitPositions: positions.filter(
            (position) => position.classification === 'split-by-opening',
          ).length,
          issues,
        });
      }
    }
    const issues = [
      ...sharedIssues,
      ...planes.flatMap((plane) => plane.issues),
    ];
    const status = issues.some(
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
    const totalPositions = planes.reduce(
      (total, plane) => total + plane.totalPositions,
      0,
    );
    const fullPositions = planes.reduce(
      (total, plane) => total + plane.fullPositions,
      0,
    );
    const cutPositions = planes.reduce(
      (total, plane) => total + plane.cutPositions,
      0,
    );
    const splitPositions = planes.reduce(
      (total, plane) => total + plane.splitPositions,
      0,
    );
    const netAssignedAreaMm2 = input.roofSurfaceGeometry
      .filter((plane) => planeIds.includes(plane.roofPlaneId))
      .reduce((total, plane) => total + plane.netAreaMm2, 0);
    return {
      kind: 'roof-tile',
      status,
      assignmentId: input.assignmentId,
      installationModeId: mode?.id,
      roofPlaneIds: planeIds,
      planes,
      totalPositions,
      fullPositions,
      cutPositions,
      splitPositions,
      issueCodes: uniqueSorted(issues.map((issue) => issue.code)),
      issues,
      declaredConsumptionReference: mode?.declaredUnitsPerM2
        ? {
            netAssignedAreaMm2,
            minimumPieces:
              (netAssignedAreaMm2 / 1_000_000) * mode.declaredUnitsPerM2.min,
            maximumPieces:
              (netAssignedAreaMm2 / 1_000_000) * mode.declaredUnitsPerM2.max,
          }
        : undefined,
    };
  },
};

export function resolveRoofTileLayout(
  input: RoofTileLayoutInput,
): RoofTileLayoutResult {
  return roofTileLayoutStrategy.resolve(input);
}

export function createRoofTileQuantitySource(args: {
  layout: RoofTileLayoutResult;
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
    layoutKind: 'roof-tile',
    semantic: 'effective-coverage-position',
    unit: 'coverage-position',
    quantity: args.layout.totalPositions,
    fullPositions: args.layout.fullPositions,
    cutPositions: args.layout.cutPositions,
    splitPositions: args.layout.splitPositions,
    requirementReadiness: 'geometric-only',
    productDisplay: args.productDisplay,
    netAreaMm2: args.layout.declaredConsumptionReference?.netAssignedAreaMm2,
    declaredConsumptionReferenceRange: args.layout.declaredConsumptionReference
      ? {
          minimum: args.layout.declaredConsumptionReference.minimumPieces,
          maximum: args.layout.declaredConsumptionReference.maximumPieces,
        }
      : undefined,
    warningKeys: [
      'no-waste-breakage-accessories-or-offcut-reuse',
      ...(args.layout.splitPositions > 0
        ? ['split-fragments-not-guaranteed-from-one-purchased-tile']
        : []),
    ],
  };
}
