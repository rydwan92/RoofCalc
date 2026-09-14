export type ProjectWorkflowStageId =
  'construction' | 'openings' | 'layers' | 'covering' | 'cutting' | 'summary';

export type ProjectWorkflowStatus =
  'complete' | 'available' | 'incomplete' | 'warning' | 'unavailable';

export type ProjectWorkflowAction =
  | 'completeGeometry'
  | 'reviewOpenings'
  | 'reviewLayers'
  | 'addCovering'
  | 'reviewCovering'
  | 'planK1'
  | 'openSummary';

export interface ProjectWorkflowStage {
  id: ProjectWorkflowStageId;
  status: ProjectWorkflowStatus;
  count?: number;
}

export interface ProjectWorkflowFacts {
  constructionReady: boolean;
  openingCount: number;
  openingWarnings: number;
  enabledLayerCount: number;
  layerWarnings: number;
  coveringCount: number;
  resolvedCoveringCount: number;
  coveringWarnings: number;
  k1Ready: boolean;
  hasResults: boolean;
}

export interface ProjectWorkflow {
  stages: ProjectWorkflowStage[];
  completeCount: number;
  nextAction: ProjectWorkflowAction;
}

/** Presentation-only projection. Optional openings/layers stay available until used. */
export function deriveProjectWorkflow(
  facts: ProjectWorkflowFacts,
): ProjectWorkflow {
  const stages: ProjectWorkflowStage[] = [
    {
      id: 'construction',
      status: facts.constructionReady ? 'complete' : 'incomplete',
    },
    {
      id: 'openings',
      count: facts.openingCount || undefined,
      status: !facts.constructionReady
        ? 'unavailable'
        : facts.openingWarnings > 0
          ? 'warning'
          : facts.openingCount > 0
            ? 'complete'
            : 'available',
    },
    {
      id: 'layers',
      count: facts.enabledLayerCount || undefined,
      status: !facts.constructionReady
        ? 'unavailable'
        : facts.layerWarnings > 0
          ? 'warning'
          : facts.enabledLayerCount > 0
            ? 'complete'
            : 'available',
    },
    {
      id: 'covering',
      count: facts.coveringCount || undefined,
      status: !facts.constructionReady
        ? 'unavailable'
        : facts.coveringWarnings > 0 ||
            (facts.coveringCount > 0 &&
              facts.resolvedCoveringCount !== facts.coveringCount)
          ? 'warning'
          : facts.coveringCount === 0
            ? 'incomplete'
            : 'complete',
    },
    {
      id: 'cutting',
      status: !facts.constructionReady
        ? 'unavailable'
        : facts.k1Ready
          ? 'available'
          : 'incomplete',
    },
    {
      id: 'summary',
      status: facts.hasResults ? 'available' : 'unavailable',
    },
  ];
  const nextAction: ProjectWorkflowAction = !facts.constructionReady
    ? 'completeGeometry'
    : facts.openingWarnings > 0
      ? 'reviewOpenings'
      : facts.layerWarnings > 0
        ? 'reviewLayers'
        : facts.coveringCount === 0
          ? 'addCovering'
          : stages[3]!.status === 'warning'
            ? 'reviewCovering'
            : facts.k1Ready
              ? 'planK1'
              : 'openSummary';
  return {
    stages,
    completeCount: stages.filter((stage) => stage.status === 'complete').length,
    nextAction,
  };
}
