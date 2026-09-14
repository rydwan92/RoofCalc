import { describe, expect, it } from 'vitest';
import { deriveProjectGuidance } from './project-guidance';

const ready = {
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

describe('project guidance', () => {
  it('prioritizes blockers and warnings before optional and success actions', () => {
    const items = deriveProjectGuidance(
      {
        ...ready,
        constructionReady: false,
        openingWarnings: 1,
        layerWarnings: 1,
      },
      true,
    );
    expect(items.map((item) => item.kind)).toEqual([
      'geometry-incomplete',
      'opening-warning',
      'layer-warning',
      'k1-ready',
      'export-ready',
    ]);
  });

  it('reports one covering source item and does not duplicate it', () => {
    expect(deriveProjectGuidance(ready, false)[0]?.kind).toBe(
      'covering-missing',
    );
    const items = deriveProjectGuidance(
      { ...ready, coveringCount: 1, coveringWarnings: 2 },
      false,
    );
    expect(items.filter((item) => item.source === 'covering')).toHaveLength(1);
    expect(items[0]?.kind).toBe('covering-warning');
  });
});
