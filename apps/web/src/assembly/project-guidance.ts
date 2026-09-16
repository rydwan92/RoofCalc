import type {
  ProjectWorkflowAction,
  ProjectWorkflowFacts,
} from './project-workflow';
import type {
  BattenInstallationDecision,
  BattenInstallationIssue,
} from './batten-installation';
import type { BattenWorkflow, CounterBattenWorkflow } from './batten-workflow';

export type ProjectGuidanceSeverity =
  'blocker' | 'warning' | 'info' | 'success';
export type ProjectGuidanceKind =
  | 'geometry-incomplete'
  | 'opening-warning'
  | 'layer-warning'
  | 'covering-missing'
  | 'covering-warning'
  | 'battens-check'
  | 'hip-detail-required'
  | 'layers-ready'
  | 'k1-ready'
  | 'export-ready';

export interface ProjectGuidanceItem {
  detailIssue?: BattenInstallationIssue['code'];
  kind: ProjectGuidanceKind;
  severity: ProjectGuidanceSeverity;
  action?: ProjectWorkflowAction | 'openExport';
  targetTask?:
    'construction' | 'openings' | 'layers' | 'covering' | 'cuts' | 'materials';
  source:
    | 'geometry'
    | 'opening'
    | 'layer'
    | 'covering'
    | 'battens'
    | 'counter-battens'
    | 'fabrication'
    | 'document';
}

const priority: Record<ProjectGuidanceSeverity, number> = {
  blocker: 0,
  warning: 1,
  info: 2,
  success: 3,
};

/**
 * V43B: after the covering, guidance walks the real build-up order —
 * battens (checked against the covering), then the counter-batten hip detail,
 * then "layers ready". A placeholder gauge can never produce a ready step,
 * because readiness comes from `BattenWorkflow.complete` alone.
 */
export function deriveProjectGuidance(
  facts: ProjectWorkflowFacts,
  exportReady: boolean,
  installation?: BattenInstallationDecision,
  workflow?: { battens: BattenWorkflow; counterBattens: CounterBattenWorkflow },
): ProjectGuidanceItem[] {
  const items: ProjectGuidanceItem[] = [];
  if (!facts.constructionReady)
    items.push({
      kind: 'geometry-incomplete',
      severity: 'blocker',
      action: 'completeGeometry',
      targetTask: 'construction',
      source: 'geometry',
    });
  if (facts.openingWarnings > 0)
    items.push({
      kind: 'opening-warning',
      severity: 'warning',
      action: 'reviewOpenings',
      targetTask: 'openings',
      source: 'opening',
    });
  // A blocked batten decision has its own, more specific step below.
  if (
    facts.layerWarnings > 0 &&
    !(workflow?.battens.tone === 'blocked' && facts.coveringCount > 0)
  )
    items.push({
      kind: 'layer-warning',
      severity: 'warning',
      action: 'reviewLayers',
      targetTask: 'layers',
      source: 'layer',
    });
  if (facts.constructionReady && facts.coveringCount === 0)
    items.push({
      kind: 'covering-missing',
      severity: 'info',
      action: 'addCovering',
      targetTask: 'covering',
      source: 'covering',
      detailIssue:
        installation?.issues.find(
          (issue) => issue.category === 'hard-constraint',
        )?.code ?? installation?.issues[0]?.code,
    });
  else if (
    facts.coveringWarnings > 0 ||
    facts.resolvedCoveringCount !== facts.coveringCount
  )
    items.push({
      kind: 'covering-warning',
      severity: 'warning',
      action: 'reviewCovering',
      targetTask: 'covering',
      source: 'covering',
      detailIssue:
        installation?.issues.find(
          (issue) => issue.category === 'hard-constraint',
        )?.code ?? installation?.issues[0]?.code,
    });
  const battens = workflow?.battens;
  const counter = workflow?.counterBattens;
  if (
    facts.constructionReady &&
    facts.coveringCount > 0 &&
    battens &&
    (battens.capability?.requiresBattens ?? true) &&
    !battens.complete
  )
    items.push({
      kind: 'battens-check',
      severity: battens.tone === 'blocked' ? 'warning' : 'info',
      action: 'reviewBattens',
      targetTask: 'layers',
      source: 'battens',
    });
  if (facts.constructionReady && counter?.state === 'needs-hip-detail')
    items.push({
      kind: 'hip-detail-required',
      severity: 'info',
      action: 'reviewHipDetail',
      targetTask: 'layers',
      source: 'counter-battens',
    });
  if (
    facts.constructionReady &&
    battens?.complete &&
    (counter?.complete ?? false)
  )
    items.push({
      kind: 'layers-ready',
      severity: 'success',
      action: 'reviewLayers',
      targetTask: 'layers',
      source: 'layer',
    });
  if (facts.k1Ready)
    items.push({
      kind: 'k1-ready',
      severity: 'success',
      action: 'planK1',
      targetTask: 'materials',
      source: 'fabrication',
    });
  if (exportReady)
    items.push({
      kind: 'export-ready',
      severity: 'success',
      action: 'openExport',
      targetTask: 'materials',
      source: 'document',
    });
  return items
    .filter(
      (item, index, all) =>
        all.findIndex((candidate) => candidate.source === item.source) ===
        index,
    )
    .sort((a, b) => priority[a.severity] - priority[b.severity]);
}
