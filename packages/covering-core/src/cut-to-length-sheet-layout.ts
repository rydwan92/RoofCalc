import type {
  CoveringOpeningGeometry,
  CoveringQuantitySource,
  CoveringRoofSurfaceGeometry,
  CutToLengthSheetLayoutIntent,
  ModularSheetTechnicalSpec,
} from './index';
import {
  resolveVariablePanelPlane,
  type VariablePanelColumn,
  type VariablePanelPlaneResult,
  type VariablePanelRun,
} from './variable-panel-layout';

export type CutToLengthSheetIssueCode =
  | 'below-minimum-pitch'
  | 'roof-plane-not-found'
  | 'invalid-layout-geometry'
  | 'below-min-panel-length'
  | 'segmentation-required';

export interface CutToLengthSheetIssue {
  code: CutToLengthSheetIssueCode;
  roofPlaneId?: string;
  runId?: string;
  actual?: number;
  required?: number;
  minimum?: number;
  maximum?: number;
}

export interface CutToLengthSheetRun extends VariablePanelRun {
  columnIndex: number;
  effectiveWidthMm: number;
  geometricLengthMm: number;
  /** Only set when a complete, verified manufacturing rule is available. */
  orderLengthMm?: number;
  classification: 'full-width' | 'edge-cut-width';
}

export interface CutToLengthSheetColumn extends Omit<
  VariablePanelColumn,
  'runs'
> {
  runs: CutToLengthSheetRun[];
}

export interface CutToLengthSheetPlaneLayout extends Omit<
  VariablePanelPlaneResult,
  'columns'
> {
  columns: CutToLengthSheetColumn[];
  stripCount: number;
  physicalRunCount: number;
  fullWidthStrips: number;
  edgeCutStrips: number;
  openingInterruptedRuns: number;
  totalGeometricLengthMm: number;
  minRunLengthMm?: number;
  maxRunLengthMm?: number;
}

export interface CutToLengthSheetLayoutResult {
  kind: 'modular-sheet-cut-to-length';
  status: 'resolved' | 'limited' | 'incompatible' | 'invalid';
  assignmentId: string;
  roofPlaneIds: string[];
  effectiveWidthMm: number;
  planes: CutToLengthSheetPlaneLayout[];
  stripCount: number;
  physicalRunCount: number;
  fullWidthStrips: number;
  edgeCutStrips: number;
  openingInterruptedRuns: number;
  totalGeometricLengthMm: number;
  minRunLengthMm?: number;
  maxRunLengthMm?: number;
  lengthGroups: { lengthMm: number; quantity: number }[];
  issueCodes: CutToLengthSheetIssueCode[];
  issues: CutToLengthSheetIssue[];
}

export interface CutToLengthSheetLayoutInput {
  assignmentId: string;
  roofPlaneIds: readonly string[];
  roofSurfaceGeometry: readonly CoveringRoofSurfaceGeometry[];
  openings: readonly CoveringOpeningGeometry[];
  productSpec: ModularSheetTechnicalSpec & {
    lengthModel: Extract<
      ModularSheetTechnicalSpec['lengthModel'],
      { kind: 'cut-to-length' }
    >;
  };
  layoutIntent: CutToLengthSheetLayoutIntent;
}

const LENGTH_TOLERANCE_MM = 1e-7;

function hasDiagonalRoofEdge(column: VariablePanelColumn) {
  return column.runs.some((run) =>
    run.polygons.some((polygon) =>
      polygon.some((point, index) => {
        const next = polygon[(index + 1) % polygon.length]!;
        return (
          Math.abs(next.uMm - point.uMm) > LENGTH_TOLERANCE_MM &&
          Math.abs(next.vMm - point.vMm) > LENGTH_TOLERANCE_MM
        );
      }),
    ),
  );
}

function groupLengths(runs: readonly CutToLengthSheetRun[]) {
  const groups: { lengthMm: number; quantity: number }[] = [];
  for (const run of [...runs].sort(
    (a, b) =>
      a.geometricLengthMm - b.geometricLengthMm || a.id.localeCompare(b.id),
  )) {
    const match = groups.find(
      (group) =>
        Math.abs(group.lengthMm - run.geometricLengthMm) <= LENGTH_TOLERANCE_MM,
    );
    if (match) match.quantity += 1;
    else groups.push({ lengthMm: run.geometricLengthMm, quantity: 1 });
  }
  return groups;
}

/** Geometric sheet candidates only. Transverse joints and manufacturing lengths are unresolved. */
export function resolveCutToLengthSheetLayout(
  input: CutToLengthSheetLayoutInput,
): CutToLengthSheetLayoutResult {
  const roofPlaneIds = [...new Set(input.roofPlaneIds)].sort();
  const issues: CutToLengthSheetIssue[] = [];
  const planes: CutToLengthSheetPlaneLayout[] = [];
  const spec = input.productSpec;
  for (const roofPlaneId of roofPlaneIds) {
    const surface = input.roofSurfaceGeometry.find(
      (candidate) => candidate.roofPlaneId === roofPlaneId,
    );
    if (!surface) {
      issues.push({ code: 'roof-plane-not-found', roofPlaneId });
      continue;
    }
    if (!Number.isFinite(surface.pitchDeg) || surface.pitchDeg <= 0) {
      issues.push({ code: 'invalid-layout-geometry', roofPlaneId });
      continue;
    }
    if (spec.minPitchDeg !== undefined && surface.pitchDeg < spec.minPitchDeg)
      issues.push({
        code: 'below-minimum-pitch',
        roofPlaneId,
        actual: surface.pitchDeg,
        required: spec.minPitchDeg,
      });
    try {
      const plane = resolveVariablePanelPlane({
        roofPlaneId,
        polygon: surface.localPolygon,
        openings: input.openings
          .filter((opening) => opening.roofPlaneId === roofPlaneId)
          .map((opening) => ({
            id: opening.id,
            fromUMm: opening.fromUMm,
            toUMm: opening.toUMm,
            fromVMm: opening.fromVMm,
            toVMm: opening.toVMm,
          })),
        effectiveWidthMm: spec.effectiveWidthMm,
        horizontalAlignment: input.layoutIntent.horizontalAlignment,
        manualOffsetMm: input.layoutIntent.planeOffsetsMm?.[roofPlaneId] ?? 0,
        minPanelLengthMm: spec.lengthModel.minPanelLengthMm,
        maxPanelLengthMm: spec.lengthModel.maxPanelLengthMm,
      });
      const columns: CutToLengthSheetColumn[] = plane.columns.map((column) => {
        // A hip edge can cut a sheet diagonally even when its eave width is full.
        const edgeClassification =
          column.edgeClassification === 'edge-cut-width' ||
          hasDiagonalRoofEdge(column)
            ? 'edge-cut-width'
            : 'full-width';
        return {
          ...column,
          edgeClassification,
          id: `${input.assignmentId}:${column.id}`,
          runs: column.runs.map((run) => {
            const id = `${input.assignmentId}:${run.id}`;
            for (const code of run.issues)
              issues.push({
                code:
                  code === 'exceeds-max-panel-length'
                    ? 'segmentation-required'
                    : code,
                roofPlaneId,
                runId: id,
                actual: run.lengthMm,
                required:
                  code === 'exceeds-max-panel-length'
                    ? spec.lengthModel.maxPanelLengthMm
                    : spec.lengthModel.minPanelLengthMm,
              });
            return {
              ...run,
              id,
              columnIndex: column.columnIndex,
              effectiveWidthMm: spec.effectiveWidthMm,
              geometricLengthMm: run.lengthMm,
              classification: edgeClassification,
            };
          }),
        };
      });
      const runs = columns.flatMap((column) => column.runs);
      planes.push({
        ...plane,
        columns,
        stripCount: columns.length,
        physicalRunCount: runs.length,
        fullWidthStrips: columns.filter(
          (column) => column.edgeClassification === 'full-width',
        ).length,
        edgeCutStrips: columns.filter(
          (column) => column.edgeClassification === 'edge-cut-width',
        ).length,
        openingInterruptedRuns: runs.filter((run) => run.openingIds.length > 0)
          .length,
        totalGeometricLengthMm: runs.reduce(
          (sum, run) => sum + run.geometricLengthMm,
          0,
        ),
        minRunLengthMm: runs.length
          ? Math.min(...runs.map((run) => run.geometricLengthMm))
          : undefined,
        maxRunLengthMm: runs.length
          ? Math.max(...runs.map((run) => run.geometricLengthMm))
          : undefined,
      });
    } catch {
      issues.push({ code: 'invalid-layout-geometry', roofPlaneId });
    }
  }
  const runs = planes.flatMap((plane) =>
    plane.columns.flatMap((column) => column.runs),
  );
  const issueCodes = [...new Set(issues.map((issue) => issue.code))].sort();
  const status = issueCodes.some(
    (code) =>
      code === 'roof-plane-not-found' || code === 'invalid-layout-geometry',
  )
    ? 'invalid'
    : issueCodes.includes('below-minimum-pitch')
      ? 'incompatible'
      : issueCodes.length
        ? 'limited'
        : 'resolved';
  return {
    kind: 'modular-sheet-cut-to-length',
    status,
    assignmentId: input.assignmentId,
    roofPlaneIds,
    effectiveWidthMm: spec.effectiveWidthMm,
    planes,
    stripCount: planes.reduce((sum, plane) => sum + plane.stripCount, 0),
    physicalRunCount: runs.length,
    fullWidthStrips: planes.reduce(
      (sum, plane) => sum + plane.fullWidthStrips,
      0,
    ),
    edgeCutStrips: planes.reduce((sum, plane) => sum + plane.edgeCutStrips, 0),
    openingInterruptedRuns: planes.reduce(
      (sum, plane) => sum + plane.openingInterruptedRuns,
      0,
    ),
    totalGeometricLengthMm: runs.reduce(
      (sum, run) => sum + run.geometricLengthMm,
      0,
    ),
    minRunLengthMm: runs.length
      ? Math.min(...runs.map((run) => run.geometricLengthMm))
      : undefined,
    maxRunLengthMm: runs.length
      ? Math.max(...runs.map((run) => run.geometricLengthMm))
      : undefined,
    lengthGroups: groupLengths(runs),
    issueCodes,
    issues,
  };
}

export function createCutToLengthSheetQuantitySource(args: {
  layout: CutToLengthSheetLayoutResult;
  productDisplay?: CoveringQuantitySource['productDisplay'];
}): (CoveringQuantitySource & { unit: 'piece' }) | undefined {
  const { layout } = args;
  if (
    (layout.status !== 'resolved' && layout.status !== 'limited') ||
    !layout.roofPlaneIds.length ||
    !layout.physicalRunCount
  )
    return undefined;
  return {
    id: `covering-quantity:${layout.assignmentId}`,
    coveringAssignmentId: layout.assignmentId,
    sourceRoofPlaneIds: [...layout.roofPlaneIds],
    unit: 'piece',
    quantity: layout.physicalRunCount,
    totalLengthMm: layout.totalGeometricLengthMm,
    lengthGroups: layout.lengthGroups,
    basis: 'cut-to-length-geometric-sheet-run-v1',
    productDisplay: args.productDisplay,
    warningKeys: [
      'geometric-sheet-runs-not-purchase-quantity',
      ...layout.issueCodes,
    ],
  };
}
