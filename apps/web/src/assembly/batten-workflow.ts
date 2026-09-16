import {
  deriveCoveringSupportCapability,
  type CoveringAssignmentSpec,
  type CoveringSupportCapability,
} from '@cieslacalc/covering-core';
import type {
  BattenLayoutResult,
  CounterBattenLayoutResult,
} from '@cieslacalc/roof-math';
import type {
  BattenLayoutSpec,
  CounterBattenLayoutSpec,
  HipCounterBattenDetail,
} from '@cieslacalc/timber-model';
import type { BattenAutoComposition } from './batten-composition';
import {
  uniformBattenGauge,
  type BattenInstallationDecision,
} from './batten-installation';

/**
 * V43B covering → battens → counter-battens workflow.
 *
 * A presentation projection of facts that are already resolved elsewhere:
 * the batten/counter-batten solvers (`roof-math`), the tile evaluation
 * (`covering-core`) and the V34A installation decision. It adds no geometry,
 * no quantity and no persisted state. Every surface that talks about battens
 * (summary bar, covering block, inspector, guidance, material plan, export)
 * reads this one projection so they cannot disagree.
 *
 * The central honesty rule: a batten gauge is either AUTO (RoofCalc derived it
 * from a trusted covering snapshot) or MANUAL (the user owns it). A manual
 * gauge with nothing to validate against is "unverified", never "ready", and
 * an Auto layer without covering data produces no rows at all.
 */

export type BattenWorkflowState =
  | 'layer-off'
  | 'awaiting-covering'
  | 'awaiting-covering-scope'
  | 'awaiting-installation-mode'
  | 'auto-data-unavailable'
  | 'unsupported-support-model'
  | 'auto-ready'
  | 'auto-incompatible'
  | 'manual-unverified'
  | 'manual-compatible'
  | 'manual-incompatible'
  | 'geometry-invalid';

export type BattenWorkflowTone = 'ready' | 'attention' | 'blocked' | 'off';

export type BattenWorkflowAction =
  | 'enable-auto'
  | 'choose-covering'
  | 'set-manual'
  | 'choose-installation-mode'
  | 'fit-auto'
  | 'assign-covering-to-roof'
  | 'extend-scope-to-roof';

export interface BattenWorkflow {
  state: BattenWorkflowState;
  tone: BattenWorkflowTone;
  owner: 'auto' | 'manual' | 'none';
  /** True only when a trusted covering fact confirmed the regular gauge. */
  verifiedAgainstCovering: boolean;
  /** Shared actual gauge, present only when every plane agrees. */
  gaugeMm?: number;
  /** The user's retained value, exposed only while the user owns the gauge. */
  manualGaugeMm?: number;
  allowedRangeMm?: { min: number; max: number };
  fixedSupportGaugeMm?: number;
  rowCount: number;
  /** Course count shared by every plane, when they agree. */
  rowsPerPlane?: number;
  totalLengthMm: number;
  planeCount: number;
  scope: {
    kind: 'whole-roof' | 'subset';
    planeCount: number;
    knownCount: number;
  };
  productLabel?: string;
  coveringKind?: CoveringSupportCapability['kind'];
  capability?: CoveringSupportCapability;
  installationModeCount: number;
  installationModeId?: string;
  pitch: {
    actualDeg: number;
    minimumDeg?: number;
    status: 'compatible' | 'below-minimum' | 'unknown';
  };
  eaveReferenceMm?: number;
  ridgeReferenceMm?: number;
  actions: BattenWorkflowAction[];
  /** Geometry exists and needs no batten decision before quantities. */
  complete: boolean;
}

function primaryCovering(
  assignments: readonly CoveringAssignmentSpec[],
  composition: BattenAutoComposition,
) {
  return (
    assignments.find(
      (assignment) => assignment.id === composition.assignmentId,
    ) ??
    assignments.find(
      (assignment) =>
        assignment.product.technicalSpecSnapshot.kind === 'roof-tile',
    ) ??
    assignments[0]
  );
}

export function deriveBattenWorkflow(args: {
  layout: BattenLayoutSpec | undefined;
  result: BattenLayoutResult;
  composition: BattenAutoComposition;
  decision: BattenInstallationDecision;
  assignments: readonly CoveringAssignmentSpec[];
  roofPitchDeg: number;
}): BattenWorkflow {
  const { layout, result, composition, decision } = args;
  const covering = primaryCovering(args.assignments, composition);
  const spec = covering?.product.technicalSpecSnapshot;
  const capability = spec ? deriveCoveringSupportCapability(spec) : undefined;
  const installation = composition.installation;
  const mode = layout?.mode ?? 'manual';
  const auto = mode === 'auto-from-covering';
  const range =
    composition.source.status === 'resolved'
      ? {
          min: composition.source.minimumGaugeMm,
          max: composition.source.maximumGaugeMm,
        }
      : installation?.gaugeRangeMm;
  const minimumPitch = installation?.mode?.minPitchDeg;
  const pitch: BattenWorkflow['pitch'] = {
    actualDeg: args.roofPitchDeg,
    ...(minimumPitch !== undefined ? { minimumDeg: minimumPitch } : {}),
    status:
      minimumPitch === undefined
        ? 'unknown'
        : args.roofPitchDeg < minimumPitch
          ? 'below-minimum'
          : 'compatible',
  };
  const gaugeMm = uniformBattenGauge(result);
  const base = {
    owner: (layout?.enabled ? (auto ? 'auto' : 'manual') : 'none') as
      'auto' | 'manual' | 'none',
    rowCount: result.battens.length,
    ...(result.planes.length > 0 &&
    result.planes.every(
      (plane) => plane.courseCount === result.planes[0]!.courseCount,
    )
      ? { rowsPerPlane: result.planes[0]!.courseCount }
      : {}),
    totalLengthMm: result.totalLengthMm,
    planeCount: result.planes.length,
    scope: {
      kind: result.scope.kind,
      planeCount: result.scope.roofPlaneIds.length,
      knownCount: result.scope.knownRoofPlaneIds.length,
    },
    ...(gaugeMm !== undefined ? { gaugeMm } : {}),
    ...(range ? { allowedRangeMm: range } : {}),
    ...(capability?.fixedSupportGaugeMm !== undefined
      ? { fixedSupportGaugeMm: capability.fixedSupportGaugeMm }
      : {}),
    ...(composition.productLabel || covering?.product.displaySnapshot
      ? {
          productLabel:
            composition.productLabel ??
            covering?.product.displaySnapshot?.familyName ??
            covering?.product.displaySnapshot?.manufacturer,
        }
      : {}),
    ...(capability ? { coveringKind: capability.kind, capability } : {}),
    installationModeCount:
      spec && 'installationModes' in spec ? spec.installationModes.length : 0,
    ...(installation?.mode ? { installationModeId: installation.mode.id } : {}),
    pitch,
    ...(layout?.enabled
      ? {
          eaveReferenceMm: layout.eaveOffsetMm,
          ridgeReferenceMm: layout.ridgeOffsetMm ?? 0,
        }
      : {}),
  };
  const scopeAction: BattenWorkflowAction[] =
    result.scope.kind === 'subset' ? ['extend-scope-to-roof'] : [];
  const build = (
    state: BattenWorkflowState,
    tone: BattenWorkflowTone,
    actions: BattenWorkflowAction[],
    extra: Partial<BattenWorkflow> = {},
  ): BattenWorkflow => ({
    ...base,
    state,
    tone,
    verifiedAgainstCovering:
      state === 'auto-ready' || state === 'manual-compatible',
    actions: [...actions, ...scopeAction].filter(
      (action, index, all) => all.indexOf(action) === index,
    ),
    // A preliminary manual gauge is allowed but never "complete".
    complete:
      (state === 'auto-ready' || state === 'manual-compatible') &&
      result.status === 'resolved' &&
      result.battens.length > 0,
    ...extra,
  });

  if (!layout?.enabled)
    return build(
      'layer-off',
      'off',
      capability?.supportsAutoBattenGauge ? ['enable-auto'] : [],
    );

  const geometryIssue = result.issues.find((code) =>
    [
      'invalid-batten-gauge',
      'invalid-batten-section',
      'invalid-batten-offset',
      'invalid-layout-geometry',
      'roof-plane-not-found',
      'invalid-regular-span',
      'layout-capacity-exceeded',
      'batten-course-spacing-required',
    ].includes(code),
  );
  const noTile = composition.reason === 'tile-covering-missing';
  const modeRequired =
    composition.reason === 'installation-mode-missing' ||
    installation?.issues.some(
      (issue) =>
        issue.code === 'installation-mode-required' ||
        issue.code === 'installation-mode-not-found',
    );
  const belowMinimum = pitch.status === 'below-minimum';

  if (auto) {
    if (noTile)
      return capability && !capability.supportsAutoBattenGauge
        ? build('unsupported-support-model', 'blocked', ['set-manual'])
        : build('awaiting-covering', 'blocked', [
            'choose-covering',
            'set-manual',
          ]);
    if (composition.reason === 'target-planes-not-covered')
      return build('awaiting-covering-scope', 'blocked', [
        'assign-covering-to-roof',
        'set-manual',
      ]);
    if (modeRequired)
      return build('awaiting-installation-mode', 'blocked', [
        'choose-installation-mode',
        'set-manual',
      ]);
    if (composition.source.status !== 'resolved')
      return build('auto-data-unavailable', 'blocked', ['set-manual']);
    if (geometryIssue) return build('geometry-invalid', 'blocked', []);
    if (belowMinimum || result.status !== 'resolved')
      return build('auto-incompatible', 'blocked', ['set-manual']);
    return build(
      'auto-ready',
      decision.status === 'partially-automatic' || decision.status === 'ready'
        ? 'ready'
        : 'attention',
      [],
    );
  }

  const manual = { manualGaugeMm: layout.gaugeMm };
  if (geometryIssue) return build('geometry-invalid', 'blocked', [], manual);
  if (range) {
    const inRange =
      Number.isFinite(layout.gaugeMm) &&
      layout.gaugeMm >= range.min - 1e-9 &&
      layout.gaugeMm <= range.max + 1e-9;
    return inRange && !belowMinimum
      ? build('manual-compatible', 'ready', [], manual)
      : build('manual-incompatible', 'blocked', ['fit-auto'], manual);
  }
  if (capability?.fixedSupportGaugeMm !== undefined)
    return Math.abs(layout.gaugeMm - capability.fixedSupportGaugeMm) <= 0.5
      ? build('manual-compatible', 'ready', [], manual)
      : build('manual-incompatible', 'blocked', [], manual);
  return build(
    'manual-unverified',
    'attention',
    noTile || !covering
      ? ['choose-covering']
      : modeRequired
        ? ['choose-installation-mode']
        : composition.reason === 'target-planes-not-covered'
          ? ['assign-covering-to-roof']
          : [],
    manual,
  );
}

export type CounterBattenWorkflowState =
  'layer-off' | 'complete' | 'needs-hip-detail' | 'invalid' | 'no-axes';

export interface CounterBattenWorkflow {
  state: CounterBattenWorkflowState;
  tone: BattenWorkflowTone;
  totalLengthMm: number;
  runCount: number;
  interiorAxisCount: number;
  hipBoundaryRunCount: number;
  hipBoundaryCount: number;
  unresolvedHipBoundaryCount: number;
  hipDetail: HipCounterBattenDetail;
  planeCount: number;
  complete: boolean;
}

export function deriveCounterBattenWorkflow(args: {
  layout: CounterBattenLayoutSpec | undefined;
  result: CounterBattenLayoutResult;
}): CounterBattenWorkflow {
  const { layout, result } = args;
  const invalid = result.warnings.some(
    (code) =>
      code === 'invalid-counter-batten-section' ||
      code === 'invalid-layout-geometry' ||
      code === 'invalid-source-axis' ||
      code === 'unknown-roof-plane' ||
      code === 'unsupported-member-reference',
  );
  const state: CounterBattenWorkflowState = !layout?.enabled
    ? 'layer-off'
    : invalid
      ? 'invalid'
      : result.unresolvedHipBoundaryCount > 0
        ? 'needs-hip-detail'
        : result.rows.length
          ? 'complete'
          : 'no-axes';
  return {
    state,
    tone:
      state === 'layer-off'
        ? 'off'
        : state === 'complete'
          ? 'ready'
          : state === 'needs-hip-detail'
            ? 'attention'
            : 'blocked',
    totalLengthMm: result.totalVisibleLengthMm,
    runCount: result.rows.length,
    interiorAxisCount: result.interiorAxisCount,
    hipBoundaryRunCount: result.hipBoundaryRunCount,
    hipBoundaryCount: result.hipBoundaries.length,
    unresolvedHipBoundaryCount: result.unresolvedHipBoundaryCount,
    hipDetail: layout?.hipBoundaryDetail ?? 'not-decided',
    planeCount: result.roofPlaneIds.length,
    complete: state === 'complete',
  };
}
