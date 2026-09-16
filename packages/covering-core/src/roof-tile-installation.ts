import { roofTileTechnicalSpecSchema } from './index';
import type { RoofTileInstallationMode, RoofTileTechnicalSpec } from './index';

export type DecisionSource =
  | 'manufacturer-product-data'
  | 'project-user-input'
  | 'universal-domain-rule'
  | 'derived-geometry'
  | 'unavailable';
export type InstallationRuleCategory =
  'hard-constraint' | 'recommendation' | 'information';
export type TileInstallationIssueCode =
  | 'installation-mode-required'
  | 'installation-mode-not-found'
  | 'gauge-data-missing'
  | 'pitch-rule-data-missing'
  | 'pitch-rule-ambiguous'
  | 'invalid-product-data'
  | 'invalid-roof-pitch'
  | 'below-minimum-pitch'
  | 'below-recommended-pitch'
  | 'pitch-data-missing'
  | 'installation-condition-unverified'
  | 'product-dimensions-review';

export interface TileInstallationIssue {
  code: TileInstallationIssueCode;
  category: InstallationRuleCategory;
  source: DecisionSource;
  actual?: number;
  required?: number;
}

/** A sole mode is unambiguous. An explicit invalid choice never falls back. */
export function resolveInstallationMode<T extends { id: string }>(
  modes: readonly T[],
  selectedId?: string,
): T | undefined {
  return selectedId
    ? modes.find((mode) => mode.id === selectedId)
    : modes.length === 1
      ? modes[0]
      : undefined;
}

/**
 * V43B: which pitch-dependent rule of a mode applies, if the snapshot has any.
 * Absent rules keep the mode's own values unconditional (V35 semantics).
 */
export function resolveTilePitchRule(
  mode: RoofTileInstallationMode,
  roofPitchDeg: number,
):
  | { status: 'unconditional' }
  | {
      status: 'resolved';
      rule: NonNullable<RoofTileInstallationMode['installationRules']>[number];
    }
  | { status: 'missing' | 'ambiguous' } {
  const rules = mode.installationRules ?? [];
  if (!rules.length) return { status: 'unconditional' };
  if (!Number.isFinite(roofPitchDeg)) return { status: 'missing' };
  // Inclusive on both ends: a pitch sitting on a shared published boundary
  // matches two rules and is reported as ambiguous instead of picking one.
  const matches = rules.filter(
    (rule) =>
      roofPitchDeg >= rule.pitchRangeDeg.min &&
      (rule.pitchRangeDeg.max === undefined ||
        roofPitchDeg <= rule.pitchRangeDeg.max),
  );
  if (matches.length === 1) return { status: 'resolved', rule: matches[0]! };
  return { status: matches.length ? 'ambiguous' : 'missing' };
}

export interface RoofTileInstallationEvaluation {
  source: DecisionSource;
  mode?: RoofTileInstallationMode;
  /**
   * V43B: the regular gauge range that actually applies at this pitch — the
   * matching pitch rule's range, else the mode's own. Absent when a pitch rule
   * exists but none applies unambiguously.
   */
  gaugeRangeMm?: { min: number; max: number };
  pitchRuleId?: string;
  modeSelection: 'explicit' | 'sole-mode' | 'required';
  dataQuality: 'complete' | 'partial' | 'manual-unverified';
  capability: {
    regularGauge: 'available' | 'unavailable';
    eaveReference: 'manual-required';
    ridgeReference: 'manual-required';
    pitchCompatibility: 'available' | 'unavailable';
  };
  issues: TileInstallationIssue[];
}

/** Cheap snapshot-only evaluation; no geometry, catalogue fetch or rule engine. */
export function evaluateRoofTileInstallation(args: {
  productSpec: RoofTileTechnicalSpec;
  selectedInstallationModeId?: string;
  roofPitchDeg: number;
  source?: 'manufacturer-product-data' | 'project-user-input';
}): RoofTileInstallationEvaluation {
  const source = args.source ?? 'project-user-input';
  const issues: TileInstallationIssue[] = [];
  const rawMode = resolveInstallationMode(
    args.productSpec.installationModes,
    args.selectedInstallationModeId,
  );
  if (!rawMode)
    issues.push({
      code: args.selectedInstallationModeId
        ? 'installation-mode-not-found'
        : 'installation-mode-required',
      category: 'hard-constraint',
      source: 'project-user-input',
    });
  if (rawMode && !rawMode.gaugeRangeMm)
    issues.push({
      code: 'gauge-data-missing',
      category: 'hard-constraint',
      source: 'unavailable',
    });
  const parsed = roofTileTechnicalSpecSchema.safeParse(args.productSpec);
  if (
    !parsed.success &&
    !issues.some((issue) => issue.code === 'gauge-data-missing')
  )
    issues.push({
      code: 'invalid-product-data',
      category: 'hard-constraint',
      source,
    });
  const mode = parsed.success
    ? resolveInstallationMode(
        parsed.data.installationModes,
        args.selectedInstallationModeId,
      )
    : undefined;
  if (
    !Number.isFinite(args.roofPitchDeg) ||
    args.roofPitchDeg <= 0 ||
    args.roofPitchDeg >= 90
  )
    issues.push({
      code: 'invalid-roof-pitch',
      category: 'hard-constraint',
      source: 'universal-domain-rule',
    });
  else if (
    mode?.minPitchDeg !== undefined &&
    args.roofPitchDeg < mode.minPitchDeg
  )
    issues.push({
      code: 'below-minimum-pitch',
      category: 'hard-constraint',
      source,
      actual: args.roofPitchDeg,
      required: mode.minPitchDeg,
    });
  else if (
    mode?.recommendedMinPitchDeg !== undefined &&
    args.roofPitchDeg < mode.recommendedMinPitchDeg
  )
    issues.push({
      code: 'below-recommended-pitch',
      category: 'recommendation',
      source,
      actual: args.roofPitchDeg,
      required: mode.recommendedMinPitchDeg,
    });
  if (mode && mode.minPitchDeg === undefined)
    issues.push({
      code: 'pitch-data-missing',
      category: 'information',
      source: 'unavailable',
    });
  const pitchRule = mode
    ? resolveTilePitchRule(mode, args.roofPitchDeg)
    : undefined;
  if (pitchRule?.status === 'missing' || pitchRule?.status === 'ambiguous')
    issues.push({
      code:
        pitchRule.status === 'missing'
          ? 'pitch-rule-data-missing'
          : 'pitch-rule-ambiguous',
      category: 'hard-constraint',
      source: 'unavailable',
      actual: Number.isFinite(args.roofPitchDeg)
        ? args.roofPitchDeg
        : undefined,
    });
  const gaugeRangeMm = !mode
    ? undefined
    : pitchRule?.status === 'resolved'
      ? (pitchRule.rule.gaugeRangeMm ?? mode.gaugeRangeMm)
      : pitchRule?.status === 'unconditional'
        ? mode.gaugeRangeMm
        : undefined;
  if (
    mode?.technicalConditionId ||
    (pitchRule?.status === 'resolved' && pitchRule.rule.technicalConditionId)
  )
    issues.push({
      code: 'installation-condition-unverified',
      category: 'information',
      source,
    });
  if (
    mode &&
    ((args.productSpec.physicalWidthMm !== undefined &&
      mode.coverWidthMm > args.productSpec.physicalWidthMm) ||
      (args.productSpec.physicalLengthMm !== undefined &&
        mode.gaugeRangeMm.max > args.productSpec.physicalLengthMm))
  )
    issues.push({
      code: 'product-dimensions-review',
      category: 'information',
      source,
    });
  return {
    source,
    mode,
    ...(gaugeRangeMm ? { gaugeRangeMm } : {}),
    ...(pitchRule?.status === 'resolved'
      ? { pitchRuleId: pitchRule.rule.id }
      : {}),
    modeSelection: rawMode
      ? args.selectedInstallationModeId
        ? 'explicit'
        : 'sole-mode'
      : 'required',
    // Current snapshots contain no verified edge-reference technical contract.
    dataQuality:
      source === 'project-user-input' ? 'manual-unverified' : 'partial',
    capability: {
      regularGauge: gaugeRangeMm ? 'available' : 'unavailable',
      eaveReference: 'manual-required',
      ridgeReference: 'manual-required',
      pitchCompatibility:
        mode?.minPitchDeg !== undefined ? 'available' : 'unavailable',
    },
    issues,
  };
}
