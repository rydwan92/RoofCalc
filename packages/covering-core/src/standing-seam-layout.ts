import type {
  CoveringOpeningGeometry,
  CoveringQuantitySource,
  CoveringRoofSurfaceGeometry,
  StandingSeamLayoutIntent,
  StandingSeamTechnicalSpec,
} from './index';
import {
  resolveVariablePanelPlane,
  type VariablePanelPlaneResult,
  type VariablePanelRun,
} from './variable-panel-layout';

export type StandingSeamIssueCode =
  | 'installation-mode-required'
  | 'installation-mode-not-found'
  | 'below-minimum-pitch'
  | 'roof-plane-not-found'
  | 'invalid-layout-geometry'
  | 'below-min-panel-length'
  | 'transverse-joint-required';

export interface StandingSeamIssue {
  code: StandingSeamIssueCode;
  roofPlaneId?: string;
  runId?: string;
  actual?: number;
  required?: number;
  minimum?: number;
  maximum?: number;
}

export interface StandingSeamPlaneLayout extends VariablePanelPlaneResult {
  columnCount: number;
  panelRunCount: number;
  fullWidthColumns: number;
  edgeCutColumns: number;
  openingInterruptedRuns: number;
  totalPanelLengthMm: number;
  minimumRunLengthMm?: number;
  maximumRunLengthMm?: number;
}

export interface StandingSeamLayoutResult {
  kind: 'standing-seam';
  status: 'resolved' | 'limited' | 'incomplete' | 'incompatible' | 'invalid';
  assignmentId: string;
  selectedInstallationModeId?: string;
  effectiveWidthMm?: number;
  roofPlaneIds: string[];
  planes: StandingSeamPlaneLayout[];
  columnCount: number;
  panelRunCount: number;
  fullWidthColumns: number;
  edgeCutColumns: number;
  openingInterruptedRuns: number;
  totalPanelLengthMm: number;
  minimumRunLengthMm?: number;
  maximumRunLengthMm?: number;
  lengthGroups: { lengthMm: number; quantity: number }[];
  issueCodes: StandingSeamIssueCode[];
  issues: StandingSeamIssue[];
}

export interface StandingSeamLayoutInput {
  assignmentId: string;
  roofPlaneIds: readonly string[];
  roofSurfaceGeometry: readonly CoveringRoofSurfaceGeometry[];
  openings: readonly CoveringOpeningGeometry[];
  productSpec: StandingSeamTechnicalSpec;
  selectedInstallationModeId?: string;
  layoutIntent: StandingSeamLayoutIntent;
}

const LENGTH_TOLERANCE_MM = 1e-7;

function groupLengths(runs: readonly VariablePanelRun[]) {
  const groups: { lengthMm: number; quantity: number }[] = [];
  for (const run of [...runs].sort(
    (a, b) => a.lengthMm - b.lengthMm || a.id.localeCompare(b.id),
  )) {
    const match = groups.find(
      (group) => Math.abs(group.lengthMm - run.lengthMm) <= LENGTH_TOLERANCE_MM,
    );
    if (match) match.quantity += 1;
    else groups.push({ lengthMm: run.lengthMm, quantity: 1 });
  }
  return groups;
}

export function resolveStandingSeamLayout(
  input: StandingSeamLayoutInput,
): StandingSeamLayoutResult {
  const roofPlaneIds = [...new Set(input.roofPlaneIds)].sort();
  const issues: StandingSeamIssue[] = [];
  const mode = input.selectedInstallationModeId
    ? input.productSpec.installationModes.find(
        (candidate) => candidate.id === input.selectedInstallationModeId,
      )
    : undefined;
  if (!input.selectedInstallationModeId)
    issues.push({ code: 'installation-mode-required' });
  else if (!mode) issues.push({ code: 'installation-mode-not-found' });
  const planes: StandingSeamPlaneLayout[] = [];
  if (mode) {
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
      const minPitch = mode.minPitchDeg ?? input.productSpec.minPitchDeg;
      if (minPitch !== undefined && surface.pitchDeg < minPitch)
        issues.push({
          code: 'below-minimum-pitch',
          roofPlaneId,
          actual: surface.pitchDeg,
          required: minPitch,
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
          effectiveWidthMm: mode.effectiveWidthMm,
          horizontalAlignment: input.layoutIntent.horizontalAlignment,
          manualOffsetMm: input.layoutIntent.planeOffsetsMm?.[roofPlaneId] ?? 0,
          minPanelLengthMm: input.productSpec.minPanelLengthMm,
          maxPanelLengthMm: input.productSpec.maxPanelLengthMm,
        });
        const runs = plane.columns.flatMap((column) => column.runs);
        for (const run of runs)
          for (const code of run.issues)
            issues.push({
              code:
                code === 'exceeds-max-panel-length'
                  ? 'transverse-joint-required'
                  : code,
              roofPlaneId,
              runId: run.id,
              actual: run.lengthMm,
              required:
                code === 'exceeds-max-panel-length'
                  ? input.productSpec.maxPanelLengthMm
                  : input.productSpec.minPanelLengthMm,
            });
        planes.push({
          ...plane,
          columnCount: plane.columns.length,
          panelRunCount: runs.length,
          fullWidthColumns: plane.columns.filter(
            (column) => column.edgeClassification === 'full-width',
          ).length,
          edgeCutColumns: plane.columns.filter(
            (column) => column.edgeClassification === 'edge-cut-width',
          ).length,
          openingInterruptedRuns: runs.filter(
            (run) => run.openingIds.length > 0,
          ).length,
          totalPanelLengthMm: runs.reduce((sum, run) => sum + run.lengthMm, 0),
          minimumRunLengthMm: runs.length
            ? Math.min(...runs.map((run) => run.lengthMm))
            : undefined,
          maximumRunLengthMm: runs.length
            ? Math.max(...runs.map((run) => run.lengthMm))
            : undefined,
        });
      } catch {
        issues.push({ code: 'invalid-layout-geometry', roofPlaneId });
      }
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
      : issueCodes.some(
            (code) =>
              code === 'installation-mode-required' ||
              code === 'installation-mode-not-found',
          )
        ? 'incomplete'
        : issues.length
          ? 'limited'
          : 'resolved';
  return {
    kind: 'standing-seam',
    status,
    assignmentId: input.assignmentId,
    selectedInstallationModeId: mode?.id,
    effectiveWidthMm: mode?.effectiveWidthMm,
    roofPlaneIds,
    planes,
    columnCount: planes.reduce((sum, plane) => sum + plane.columnCount, 0),
    panelRunCount: runs.length,
    fullWidthColumns: planes.reduce(
      (sum, plane) => sum + plane.fullWidthColumns,
      0,
    ),
    edgeCutColumns: planes.reduce(
      (sum, plane) => sum + plane.edgeCutColumns,
      0,
    ),
    openingInterruptedRuns: planes.reduce(
      (sum, plane) => sum + plane.openingInterruptedRuns,
      0,
    ),
    totalPanelLengthMm: runs.reduce((sum, run) => sum + run.lengthMm, 0),
    minimumRunLengthMm: runs.length
      ? Math.min(...runs.map((run) => run.lengthMm))
      : undefined,
    maximumRunLengthMm: runs.length
      ? Math.max(...runs.map((run) => run.lengthMm))
      : undefined,
    lengthGroups: groupLengths(runs),
    issueCodes,
    issues,
  };
}

export function createStandingSeamQuantitySource(args: {
  layout: StandingSeamLayoutResult;
  productDisplay?: CoveringQuantitySource['productDisplay'];
}): (CoveringQuantitySource & { unit: 'piece' }) | undefined {
  const { layout } = args;
  if (
    (layout.status !== 'resolved' && layout.status !== 'limited') ||
    !layout.roofPlaneIds.length ||
    !layout.panelRunCount
  )
    return undefined;
  return {
    id: `covering-quantity:${layout.assignmentId}`,
    coveringAssignmentId: layout.assignmentId,
    sourceRoofPlaneIds: [...layout.roofPlaneIds],
    unit: 'piece',
    quantity: layout.panelRunCount,
    totalLengthMm: layout.totalPanelLengthMm,
    lengthGroups: layout.lengthGroups,
    basis: 'standing-seam-geometric-panel-run-v1',
    productDisplay: args.productDisplay,
    warningKeys: [
      'geometric-panel-runs-not-purchase-quantity',
      ...layout.issueCodes,
    ],
  };
}
