import type {
  DecisionSource,
  InstallationRuleCategory,
} from '@cieslacalc/covering-core';
import type {
  BattenLayoutResult,
  BattenLayoutIssueCode,
} from '@cieslacalc/roof-math';
import type { BattenLayoutSpec } from '@cieslacalc/timber-model';
import type {
  BattenAutoComposition,
  BattenAutoSourceReason,
} from './batten-composition';
import type { TileInstallationIssueCode } from '@cieslacalc/covering-core';

export type InstallationDecisionStatus =
  | 'ready'
  | 'partially-automatic'
  | 'decision-required'
  | 'incompatible'
  | 'no-data';
export interface BattenInstallationIssue {
  code:
    | TileInstallationIssueCode
    | BattenLayoutIssueCode
    | BattenAutoSourceReason
    | 'manual-gauge-outside-range';
  category: InstallationRuleCategory;
  source: DecisionSource;
  actual?: number;
  required?: number;
}
export interface BattenInstallationDecision {
  recommendation?: {
    category: 'recommendation';
    source: 'derived-geometry';
    rule: 'nearest-target-gauge';
  };
  status: InstallationDecisionStatus;
  gaugeSource: DecisionSource;
  eaveReference: { valueMm: number; source: 'project-user-input' };
  ridgeReference: { valueMm: number; source: 'project-user-input' };
  issues: BattenInstallationIssue[];
}

/** A shared scalar exists only when every addressed plane has the same gauge. */
export function uniformBattenGauge(
  result: BattenLayoutResult,
): number | undefined {
  const first = result.planes[0]?.actualGaugeMm;
  return first !== undefined &&
    result.planes.every((plane) => plane.actualGaugeMm === first)
    ? first
    : undefined;
}

/** Combines typed technical evaluations and solver facts without new formulas. */
export function evaluateBattenInstallation(args: {
  layout: BattenLayoutSpec;
  result: BattenLayoutResult;
  composition: BattenAutoComposition;
}): BattenInstallationDecision {
  const { layout, result, composition } = args;
  const auto = (layout.mode ?? 'manual') === 'auto-from-covering';
  const issues: BattenInstallationIssue[] = [
    ...(composition.installation?.issues ?? []),
  ];
  for (const code of result.issues)
    issues.push({
      code,
      category: 'hard-constraint',
      source: 'universal-domain-rule',
    });
  if (composition.source.status !== 'resolved' && !composition.installation)
    issues.push({
      code: composition.reason ?? 'tile-covering-missing',
      category: 'hard-constraint',
      source: 'unavailable',
    });
  const range = composition.source;
  if (
    !auto &&
    range.status === 'resolved' &&
    (!Number.isFinite(layout.gaugeMm) ||
      layout.gaugeMm < range.minimumGaugeMm ||
      layout.gaugeMm > range.maximumGaugeMm)
  )
    issues.push({
      code: 'manual-gauge-outside-range',
      category: 'hard-constraint',
      source: 'project-user-input',
      actual: layout.gaugeMm,
    });
  const missingCodes = new Set<string>([
    'tile-covering-missing',
    'installation-mode-required',
    'installation-mode-not-found',
    'installation-mode-missing',
    'gauge-data-missing',
    'target-planes-not-covered',
    'auto-source-missing',
    'pitch-rule-data-missing',
    'pitch-rule-ambiguous',
    'pitch-rule-unavailable',
  ]);
  const hard = issues.filter((issue) => issue.category === 'hard-constraint');
  const incompatible = hard.some((issue) => !missingCodes.has(issue.code));
  const selectionRequired = hard.some(
    (issue) =>
      issue.code === 'installation-mode-required' ||
      issue.code === 'installation-mode-missing' ||
      issue.code === 'installation-mode-not-found',
  );
  return {
    ...(result.planes.some((plane) => plane.autoPlan)
      ? {
          recommendation: {
            category: 'recommendation' as const,
            source: 'derived-geometry' as const,
            rule: 'nearest-target-gauge' as const,
          },
        }
      : {}),
    status: incompatible
      ? 'incompatible'
      : selectionRequired
        ? 'decision-required'
        : hard.length
          ? 'no-data'
          : result.status !== 'resolved' ||
              !result.planes.length ||
              issues.some(
                (issue) =>
                  issue.code === 'pitch-data-missing' ||
                  issue.code === 'installation-condition-unverified',
              )
            ? 'decision-required'
            : auto
              ? 'partially-automatic'
              : 'ready',
    gaugeSource: auto
      ? (composition.installation?.source ?? 'unavailable')
      : 'project-user-input',
    eaveReference: {
      valueMm: layout.eaveOffsetMm,
      source: 'project-user-input',
    },
    ridgeReference: {
      valueMm: layout.ridgeOffsetMm ?? 0,
      source: 'project-user-input',
    },
    issues,
  };
}
