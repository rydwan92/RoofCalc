import type { DocumentStatus } from '@cieslacalc/document-core';
import type { LengthUnit } from '@cieslacalc/roof-math';
import { formatLength } from '../format';
import type { InstallationRepairChange } from './installation-repair';
import type {
  ProjectReadiness,
  ReadinessDocumentKind,
  ReadinessIssue,
} from './project-readiness';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * V47 presentation of readiness facts. Canonical numbers stay in the issue;
 * lengths are formatted in the user's display unit only here, so the panel,
 * Document Hub and printed document read identically.
 */
export function readinessIssueValues(
  issue: Pick<ReadinessIssue, 'params'>,
  unit: LengthUnit,
  locale: string,
): Record<string, string | number> {
  const params = issue.params ?? {};
  const length = (mm: unknown) =>
    typeof mm === 'number' ? `${formatLength(mm, unit, locale)} ${unit}` : '—';
  return {
    ...params,
    ...(params.gaugeMm !== undefined ? { gauge: length(params.gaugeMm) } : {}),
    ...(params.minMm !== undefined ? { min: length(params.minMm) } : {}),
    ...(params.maxMm !== undefined ? { max: length(params.maxMm) } : {}),
    ...(params.projectionMm !== undefined
      ? {
          projection: length(Math.abs(Number(params.projectionMm))),
        }
      : {}),
  };
}

export function readinessIssueText(
  t: Translate,
  issue: { code: string; params?: ReadinessIssue['params'] },
  unit: LengthUnit,
  locale: string,
) {
  const base = readinessIssueValues(issue, unit, locale);
  const values =
    issue.params?.direction !== undefined
      ? {
          ...base,
          detail: t(
            issue.params.direction === 'short'
              ? 'assembly.readiness.eaveShort'
              : 'assembly.readiness.eaveLong',
            base,
          ),
        }
      : base;
  return {
    title: t(`assembly.readiness.issue.${issue.code}.title`, values),
    description: t(
      `assembly.readiness.issue.${issue.code}.description`,
      values,
    ),
  };
}

export function repairChangeText(
  t: Translate,
  change: InstallationRepairChange,
  unit: LengthUnit,
  locale: string,
) {
  return t(`assembly.readiness.safeRepair.change.${change.kind}`, {
    ...('planeCount' in change ? { planeCount: change.planeCount } : {}),
    ...('gaugeMm' in change
      ? { gauge: `${formatLength(change.gaugeMm, unit, locale)} ${unit}` }
      : {}),
  });
}

/** The printable status of one document, built from the same readiness. */
export function documentStatusFor(
  readiness: ProjectReadiness,
  kind: ReadinessDocumentKind,
): DocumentStatus {
  const document = readiness.documents[kind];
  const pick = (ids: readonly string[], severity: 'blocker' | 'warning') =>
    ids.flatMap((id) => {
      const issue = readiness.issues.find((item) => item.id === id);
      return issue
        ? [
            {
              severity,
              code: issue.code,
              ...(issue.params ? { params: issue.params } : {}),
            },
          ]
        : [];
    });
  return {
    state:
      document.state === 'blocked'
        ? 'blocked'
        : document.state === 'warning'
          ? 'warning'
          : 'ready',
    issues: [
      ...pick(document.blockerIds, 'blocker'),
      ...pick(document.warningIds, 'warning'),
    ],
  };
}
