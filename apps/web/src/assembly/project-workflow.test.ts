import { describe, expect, it } from 'vitest';
import {
  deriveProjectWorkflow,
  type ProjectWorkflowFacts,
} from './project-workflow';

const ready: ProjectWorkflowFacts = {
  constructionReady: true,
  openingCount: 0,
  openingWarnings: 0,
  enabledLayerCount: 0,
  layerWarnings: 0,
  coveringCount: 0,
  resolvedCoveringCount: 0,
  coveringWarnings: 0,
  k1Ready: true,
  hasResults: true,
};

describe('derived project workflow', () => {
  it('keeps optional tasks available and routes a new roof to covering', () => {
    const workflow = deriveProjectWorkflow(ready);
    expect(workflow.stages.map((stage) => [stage.id, stage.status])).toEqual([
      ['construction', 'complete'],
      ['openings', 'available'],
      ['layers', 'available'],
      ['covering', 'incomplete'],
      ['cutting', 'available'],
      ['summary', 'available'],
    ]);
    expect(workflow.nextAction).toBe('addCovering');
    expect(workflow.completeCount).toBe(1);
  });

  it('prioritizes incomplete geometry and does not pretend dependent stages are ready', () => {
    const workflow = deriveProjectWorkflow({
      ...ready,
      constructionReady: false,
      k1Ready: false,
      hasResults: false,
    });
    expect(workflow.nextAction).toBe('completeGeometry');
    expect(workflow.stages.slice(1).map((stage) => stage.status)).toEqual([
      'unavailable',
      'unavailable',
      'unavailable',
      'unavailable',
      'unavailable',
    ]);
  });

  it('routes unresolved openings before covering and reports layer warnings', () => {
    const workflow = deriveProjectWorkflow({
      ...ready,
      openingCount: 2,
      openingWarnings: 1,
      enabledLayerCount: 2,
      layerWarnings: 1,
    });
    expect(workflow.stages[1]).toEqual({
      id: 'openings',
      status: 'warning',
      count: 2,
    });
    expect(workflow.stages[2]?.status).toBe('warning');
    expect(workflow.nextAction).toBe('reviewOpenings');
    expect(
      deriveProjectWorkflow({
        ...ready,
        enabledLayerCount: 1,
        layerWarnings: 1,
      }).nextAction,
    ).toBe('reviewLayers');
  });

  it('distinguishes incomplete covering from a trusted resolved layout', () => {
    const unresolved = deriveProjectWorkflow({
      ...ready,
      coveringCount: 2,
      resolvedCoveringCount: 1,
    });
    expect(unresolved.stages[3]?.status).toBe('warning');
    expect(unresolved.nextAction).toBe('reviewCovering');
    const resolved = deriveProjectWorkflow({
      ...ready,
      coveringCount: 1,
      resolvedCoveringCount: 1,
    });
    expect(resolved.stages[3]?.status).toBe('complete');
    expect(resolved.nextAction).toBe('planK1');
    expect(
      deriveProjectWorkflow({
        ...ready,
        coveringCount: 1,
        resolvedCoveringCount: 1,
        k1Ready: false,
      }).nextAction,
    ).toBe('openSummary');
  });
});
