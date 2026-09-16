import { beforeEach, describe, expect, it } from 'vitest';
import { useAssembly } from './store';
import {
  NAVIGATION_TRAIL_LIMIT,
  pushNavigationTrail,
  tasksForPerspective,
  workbenchLocation,
  workbenchLocationLabelKey,
} from './workbench';

beforeEach(() => {
  useAssembly.getState().reset();
});

describe('V37 perspective navigation', () => {
  it('exposes only contextual tasks per perspective, with documents as a real destination', () => {
    expect(tasksForPerspective('project')).toEqual([
      'construction',
      'openings',
      'layers',
      'covering',
    ]);
    expect(tasksForPerspective('execution')).toEqual(['cuts']);
    expect(tasksForPerspective('documents')).toEqual(['documents']);
  });

  it('switches perspective without history and clears the return trail', () => {
    const store = useAssembly.getState();
    store.navigateTo(workbenchLocation('covering'));
    store.navigateTo(workbenchLocation('materials', 'plan'));
    expect(useAssembly.getState().workbench.navigationTrail).toHaveLength(2);
    useAssembly.getState().navigatePerspective('costing');
    const { workbench, historyPast } = useAssembly.getState();
    expect(workbench.viewPreset).toBe('costing');
    expect(workbench.navigationTrail).toEqual([]);
    expect(historyPast).toHaveLength(0);
  });
});

describe('V37 return model', () => {
  it('Covering → material plan → Back returns to Covering', () => {
    const before = structuredClone(useAssembly.getState().projectDocument);
    useAssembly.getState().setViewPreset('covering');
    useAssembly.getState().navigateTo(workbenchLocation('materials', 'plan'));
    expect(useAssembly.getState().workbench.viewPreset).toBe('materials');
    useAssembly.getState().navigateBack();
    const state = useAssembly.getState();
    expect(state.workbench.viewPreset).toBe('covering');
    expect(state.workbench.navigationTrail).toEqual([]);
    expect(state.projectDocument).toEqual(before);
    expect(state.historyPast).toHaveLength(0);
  });

  it('K1 cutting → Back returns to the material plan', () => {
    useAssembly.getState().navigatePerspective('materials');
    useAssembly
      .getState()
      .navigateTo(workbenchLocation('materials', 'cutting'));
    expect(useAssembly.getState().workbench.materialsView).toBe('cutting');
    useAssembly.getState().navigateBack();
    expect(useAssembly.getState().workbench).toMatchObject({
      viewPreset: 'materials',
      materialsView: 'plan',
    });
  });

  it('a repeated jump to the current location records nothing', () => {
    useAssembly.getState().setViewPreset('layers');
    useAssembly.getState().navigateTo(workbenchLocation('layers'));
    expect(useAssembly.getState().workbench.navigationTrail).toEqual([]);
  });

  it('navigation never interferes with Undo/Redo of canonical edits', () => {
    const store = useAssembly.getState();
    const run = store.template.halfRunMm;
    store.setCanonicalField('roof.runMm', run + 250);
    expect(useAssembly.getState().historyPast).toHaveLength(1);
    useAssembly.getState().navigateTo(workbenchLocation('documents'));
    useAssembly.getState().navigateBack();
    expect(useAssembly.getState().historyPast).toHaveLength(1);
    useAssembly.getState().undo();
    expect(useAssembly.getState().template.halfRunMm).toBe(run);
    expect(useAssembly.getState().workbench.viewPreset).toBe('construction');
  });

  it('keeps the trail bounded and deduplicated', () => {
    let trail = pushNavigationTrail([], workbenchLocation('covering'));
    trail = pushNavigationTrail(trail, workbenchLocation('materials', 'plan'));
    trail = pushNavigationTrail(trail, workbenchLocation('covering'));
    expect(trail).toEqual([workbenchLocation('covering')]);
    for (let i = 0; i < NAVIGATION_TRAIL_LIMIT + 3; i += 1)
      trail = pushNavigationTrail(
        trail,
        workbenchLocation(
          i % 2 ? 'layers' : 'materials',
          i % 2 ? undefined : 'schedule',
        ),
      );
    expect(trail.length).toBeLessThanOrEqual(NAVIGATION_TRAIL_LIMIT);
  });

  it('names locations for contextual Back labels without IDs', () => {
    expect(workbenchLocationLabelKey(workbenchLocation('covering'))).toBe(
      'assembly.coveringPreset',
    );
    expect(
      workbenchLocationLabelKey(workbenchLocation('materials', 'cutting')),
    ).toBe('assembly.nav.materials.cutting');
    expect(workbenchLocationLabelKey(workbenchLocation('documents'))).toBe(
      'assembly.nav.documentHub',
    );
  });
});
