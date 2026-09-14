import type {
  ProjectWorkflowAction,
  ProjectWorkflowFacts,
} from './project-workflow';

export type ProjectGuidanceSeverity =
  'blocker' | 'warning' | 'info' | 'success';
export type ProjectGuidanceKind =
  | 'geometry-incomplete'
  | 'opening-warning'
  | 'layer-warning'
  | 'covering-missing'
  | 'covering-warning'
  | 'k1-ready'
  | 'export-ready';

export interface ProjectGuidanceItem {
  kind: ProjectGuidanceKind;
  severity: ProjectGuidanceSeverity;
  action?: ProjectWorkflowAction | 'openExport';
  targetTask?:
    'construction' | 'openings' | 'layers' | 'covering' | 'cuts' | 'materials';
  source:
    'geometry' | 'opening' | 'layer' | 'covering' | 'fabrication' | 'document';
}

const priority: Record<ProjectGuidanceSeverity, number> = {
  blocker: 0,
  warning: 1,
  info: 2,
  success: 3,
};

export function deriveProjectGuidance(
  facts: ProjectWorkflowFacts,
  exportReady: boolean,
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
  if (facts.layerWarnings > 0)
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
