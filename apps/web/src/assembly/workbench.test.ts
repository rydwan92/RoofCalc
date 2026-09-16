import { describe, expect, it } from 'vitest';
import {
  addPurlin,
  assemblyDefaults,
  convertRoofTemplate,
  createRoofSkeleton,
  gableTemplateFromAssembly,
} from '@cieslacalc/roof-math';
import type { DrawingDimension } from '@cieslacalc/drawing-engine';
import { createRoofProjectDocument } from '@cieslacalc/calculator-core';
import {
  createWorkbenchLegend,
  createWorkbenchToolRegistry,
  deriveWorkbenchProjectionPolicy,
  dimensionAllowed,
  initialWorkbenchViewState,
  layoutOperationMarkers,
  perspectiveForTask,
  tasksForPerspective,
  WORKBENCH_PERSPECTIVES,
} from './workbench';

describe('workbench view projection', () => {
  it('derives distinct Construction and Cuts policies', () => {
    const construction = deriveWorkbenchProjectionPolicy(
      initialWorkbenchViewState,
    );
    const cuts = deriveWorkbenchProjectionPolicy({
      ...initialWorkbenchViewState,
      viewPreset: 'cuts',
    });
    expect(construction).toMatchObject({
      showCutMarkers: false,
      showDirectManipulation: true,
      muteUnrelated: false,
    });
    expect(cuts).toMatchObject({
      showCutMarkers: true,
      showDatums: true,
      showDirectManipulation: false,
      muteUnrelated: true,
    });
  });

  it('keeps the Materials preset read-only and emphasizes only an active schedule selection', () => {
    const passive = deriveWorkbenchProjectionPolicy({
      ...initialWorkbenchViewState,
      viewPreset: 'materials',
    });
    const selected = deriveWorkbenchProjectionPolicy({
      ...initialWorkbenchViewState,
      viewPreset: 'materials',
      selectedScheduleRowId: 'quantity:structural-timber:K1:rafter:1',
    });
    expect(passive).toMatchObject({
      showDirectManipulation: false,
      showBattens: true,
      muteUnrelated: false,
    });
    expect(selected.muteUnrelated).toBe(true);
  });

  it('reduces Full dimensions to Working on narrow canvases', () => {
    const policy = deriveWorkbenchProjectionPolicy(
      { ...initialWorkbenchViewState, dimensionLevel: 'full' },
      true,
    );
    expect(policy.effectiveDimensionLevel).toBe('working');
  });

  it('applies Minimal, Working and Full dimension policies centrally', () => {
    const dimension = (group: DrawingDimension['group']): DrawingDimension => ({
      id: `dimension:${group}`,
      from: { x: 0, y: 0 },
      to: { x: 100, y: 0 },
      valueMm: 100,
      kind: 'aligned',
      group,
    });
    const policy = (dimensionLevel: 'minimal' | 'working' | 'full') =>
      deriveWorkbenchProjectionPolicy({
        ...initialWorkbenchViewState,
        dimensionLevel,
      });
    expect(
      dimensionAllowed(dimension('primary'), policy('minimal'), false),
    ).toBe(true);
    expect(
      dimensionAllowed(dimension('support'), policy('minimal'), true),
    ).toBe(false);
    expect(
      dimensionAllowed(dimension('support'), policy('working'), false),
    ).toBe(false);
    expect(
      dimensionAllowed(dimension('support'), policy('working'), true),
    ).toBe(true);
    expect(dimensionAllowed(dimension('joint'), policy('full'), false)).toBe(
      true,
    );
  });

  it('builds only contextual legend families and real tool descriptors', () => {
    const template = gableTemplateFromAssembly(assemblyDefaults);
    const skeleton = createRoofSkeleton(template);
    const policy = deriveWorkbenchProjectionPolicy(initialWorkbenchViewState);
    expect(
      createWorkbenchLegend({ skeleton, policy, hasSelection: false }).map(
        (entry) => entry.id,
      ),
    ).toEqual(['family:K1', 'semantic:guide']);
    expect(
      createWorkbenchToolRegistry({
        template,
        spec: assemblyDefaults,
        canAddPurlin: true,
      }).map((tool) => tool.id),
    ).toEqual([
      'tool:roof',
      'tool:K1',
      'tool:support:wall-plate-1',
      'tool:add-purlin',
      'tool:ridge',
    ]);
  });

  it('adds H1 and J1 legend entries only for a hip roof', () => {
    const hip = convertRoofTemplate(
      gableTemplateFromAssembly(assemblyDefaults),
      'hip',
    );
    const legend = createWorkbenchLegend({
      skeleton: createRoofSkeleton(hip),
      policy: deriveWorkbenchProjectionPolicy(initialWorkbenchViewState),
      hasSelection: true,
    });
    expect(legend.map((entry) => entry.id)).toEqual([
      'family:K1',
      'family:H1',
      'family:J1',
      'semantic:selected',
      'semantic:guide',
    ]);
  });

  it('labels each visible purlin family with its stable P number', () => {
    const template = gableTemplateFromAssembly(addPurlin(assemblyDefaults));
    const legend = createWorkbenchLegend({
      skeleton: createRoofSkeleton(template),
      policy: deriveWorkbenchProjectionPolicy(initialWorkbenchViewState),
      hasSelection: false,
    });
    expect(legend).toContainEqual({
      id: 'family:support:purlin-1',
      code: 'P1',
      labelKey: 'purlin',
      role: 'family',
    });
  });

  it('keeps isolation outside the canonical project document', () => {
    const document = createRoofProjectDocument(
      gableTemplateFromAssembly(assemblyDefaults),
    );
    const isolated = {
      ...initialWorkbenchViewState,
      isolateSelection: true,
    };
    expect(document.project.roof).toEqual(
      gableTemplateFromAssembly(assemblyDefaults),
    );
    expect(JSON.stringify(document)).not.toContain('isolateSelection');
    expect(isolated.isolateSelection).toBe(true);
  });

  it('lays out active and compact operation markers deterministically', () => {
    const input = [
      { id: 'Z1', at: { x: 100, y: 100 }, active: false },
      { id: 'Z2', at: { x: 102, y: 101 }, active: true },
      { id: 'K1', at: { x: 104, y: 102 }, active: false },
    ];
    const first = layoutOperationMarkers(input, false);
    expect(layoutOperationMarkers(input, false)).toEqual(first);
    expect(first.find((marker) => marker.id === 'Z2')?.compact).toBe(false);
    expect(first.filter((marker) => marker.compact)).toHaveLength(2);
    expect(
      new Set(first.map((marker) => `${marker.marker.x}:${marker.marker.y}`))
        .size,
    ).toBe(3);
    expect(
      layoutOperationMarkers(input, true).every((marker) => marker.compact),
    ).toBe(true);
  });
});

describe('workbench perspective grouping', () => {
  it('groups every task under exactly one perspective', () => {
    const tasks = [
      'construction',
      'openings',
      'layers',
      'covering',
      'cuts',
      'materials',
      'costing',
    ] as const;
    for (const task of tasks) {
      const perspective = perspectiveForTask(task);
      expect(tasksForPerspective(perspective)).toContain(task);
    }
  });

  it('documents is a real destination (V37 Document Hub), not an export shortcut', () => {
    expect(tasksForPerspective('documents')).toEqual(['documents']);
  });

  it('lists every perspective exactly once', () => {
    expect(new Set(WORKBENCH_PERSPECTIVES).size).toBe(
      WORKBENCH_PERSPECTIVES.length,
    );
    expect(WORKBENCH_PERSPECTIVES).toContain('costing');
  });
});
