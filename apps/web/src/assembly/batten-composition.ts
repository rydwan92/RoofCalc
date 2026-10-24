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
  | 'covering-source-conflict'
  | 'pitch-rule-unavailable'
  /** VNext-9C: the planes' pitches need gauges no single value meets. */
  | 'pitch-gauges-differ';

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
  /**
   * VNext-9C: each plane's own pitch (an asymmetric gable has two). The
   * gauge must suit every battened plane; absent → `roofPitchDeg`.
   */
  pitchOf?: (roofPlaneId: string) => number;
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
  // Every distinct pitch among the battened planes, flattest first: the
  // flattest one is shown, since a minimum pitch binds there.
  const pitches = [
    ...new Set(
      args.pitchOf
        ? targets.map((roofPlaneId) => args.pitchOf!(roofPlaneId))
        : [args.roofPitchDeg ?? Number.NaN],
    ),
  ].sort((a, b) => a - b);
  const evaluations = pitches.map((roofPitchDeg) =>
    evaluateRoofTileInstallation({
      productSpec: spec,
      selectedInstallationModeId: assignment.selectedInstallationModeId,
      roofPitchDeg,
      source: assignment.product.catalogRef
        ? 'manufacturer-product-data'
        : 'project-user-input',
    }),
  );
  const installation =
    evaluations.find((evaluation) => !evaluation.mode) ??
    evaluations.find((evaluation) => !evaluation.gaugeRangeMm) ??
    evaluations[0]!;
  const installationMode = installation.mode;
  if (!installationMode)
    return {
      source: { status: 'missing' },
      reason: 'installation-mode-missing',
      assignmentId: assignment.id,
      installation,
    };
  // V43B: the range that applies at this pitch, never a flattened mode range
  // when the snapshot declares pitch-dependent rules.
  if (!installation.gaugeRangeMm)
    return {
      source: { status: 'missing' },
      reason: 'pitch-rule-unavailable',
      assignmentId: assignment.id,
      installationMode,
      installation,
      productLabel:
        assignment.product.displaySnapshot?.familyName ??
        assignment.product.displaySnapshot?.manufacturer,
    };
  // A gauge valid at every pitch: the overlap of the ranges.
  const minimumGaugeMm = Math.max(
    ...evaluations.map((evaluation) => evaluation.gaugeRangeMm!.min),
  );
  const maximumGaugeMm = Math.min(
    ...evaluations.map((evaluation) => evaluation.gaugeRangeMm!.max),
  );
  if (minimumGaugeMm > maximumGaugeMm)
    return {
      source: { status: 'missing' },
      reason: 'pitch-gauges-differ',
      assignmentId: assignment.id,
      installationMode,
      installation,
      productLabel:
        assignment.product.displaySnapshot?.familyName ??
        assignment.product.displaySnapshot?.manufacturer,
    };
  return {
    source: {
      status: 'resolved',
      minimumGaugeMm,
      maximumGaugeMm,
    },
    assignmentId: assignment.id,
    installationMode,
    installation,
    productLabel:
      assignment.product.displaySnapshot?.familyName ??
      assignment.product.displaySnapshot?.manufacturer,
  };
}
