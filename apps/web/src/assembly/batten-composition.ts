import type {
  CoveringAssignmentSpec,
  PrimaryCoveringAssignmentResolution,
  RoofTileInstallationMode,
  RoofTileInstallationEvaluation,
} from '@cieslacalc/covering-core';
import { evaluateRoofTileInstallation } from '@cieslacalc/covering-core';
import type { BattenAutoSource } from '@cieslacalc/roof-math';
import type { BattenLayoutSpec } from '@cieslacalc/timber-model';

export type BattenAutoSourceReason =
  | 'tile-covering-missing'
  | 'installation-mode-missing'
  | 'target-planes-not-covered'
  | 'covering-source-conflict';

export interface BattenAutoComposition {
  source: BattenAutoSource;
  reason?: BattenAutoSourceReason;
  assignmentId?: string;
  installationMode?: RoofTileInstallationMode;
  productLabel?: string;
  installation?: RoofTileInstallationEvaluation;
}

function isRoofTile(assignment: CoveringAssignmentSpec) {
  return assignment.product.technicalSpecSnapshot.kind === 'roof-tile';
}

/**
 * Application boundary between a stored covering snapshot and neutral roof-math
 * gauge constraints. Exactly one tile assignment must own every target plane.
 */
export function resolveBattenAutoComposition(args: {
  layout: BattenLayoutSpec;
  assignments: readonly CoveringAssignmentSpec[];
  ownership: PrimaryCoveringAssignmentResolution;
  roofPlaneIds: readonly string[];
  roofPitchDeg?: number;
}): BattenAutoComposition {
  const targets = args.layout.roofPlaneIds ?? [...args.roofPlaneIds];
  if (
    args.ownership.conflicts.some((conflict) =>
      targets.includes(conflict.roofPlaneId),
    )
  )
    return {
      source: { status: 'conflict' },
      reason: 'covering-source-conflict',
    };

  const tileAssignments = args.assignments.filter(isRoofTile);
  if (!tileAssignments.length)
    return {
      source: { status: 'missing' },
      reason: 'tile-covering-missing',
    };
  const owners = tileAssignments.filter((assignment) => {
    const trusted =
      args.ownership.trustedRoofPlaneIdsByAssignment[assignment.id] ?? [];
    return targets.every((roofPlaneId) => trusted.includes(roofPlaneId));
  });
  if (owners.length !== 1)
    return {
      source: { status: owners.length > 1 ? 'conflict' : 'missing' },
      reason:
        owners.length > 1
          ? 'covering-source-conflict'
          : 'target-planes-not-covered',
    };
  const assignment = owners[0]!;
  const spec = assignment.product.technicalSpecSnapshot;
  if (spec.kind !== 'roof-tile')
    return {
      source: { status: 'missing' },
      reason: 'tile-covering-missing',
    };
  const installation = evaluateRoofTileInstallation({
    productSpec: spec,
    selectedInstallationModeId: assignment.selectedInstallationModeId,
    roofPitchDeg: args.roofPitchDeg ?? Number.NaN,
    source: assignment.product.catalogRef
      ? 'manufacturer-product-data'
      : 'project-user-input',
  });
  const installationMode = installation.mode;
  if (!installationMode)
    return {
      source: { status: 'missing' },
      reason: 'installation-mode-missing',
      assignmentId: assignment.id,
      installation,
    };
  return {
    source: {
      status: 'resolved',
      minimumGaugeMm: installationMode.gaugeRangeMm.min,
      maximumGaugeMm: installationMode.gaugeRangeMm.max,
    },
    assignmentId: assignment.id,
    installationMode,
    installation,
    productLabel:
      assignment.product.displaySnapshot?.familyName ??
      assignment.product.displaySnapshot?.manufacturer,
  };
}
