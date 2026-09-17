import { beforeEach, describe, expect, it } from 'vitest';
import {
  resolvePrimaryCoveringAssignments,
  type CoveringAssignmentSpec,
  type RoofTileTechnicalSpec,
} from '@cieslacalc/covering-core';
import { resolveBattenLayout, roofPlaneIds } from '@cieslacalc/roof-math';
import type { RoofTemplateSpec } from '@cieslacalc/timber-model';
import { resolveBattenAutoComposition } from './batten-composition';
import { evaluateBattenInstallation } from './batten-installation';
import { deriveBattenWorkflow } from './batten-workflow';
import { disabledBattenLayer, newBattenLayer } from './build-up-defaults';
import { fitInstallationToRoof } from './installation-repair';
import { useAssembly } from './store';

/** Seeded-like tile (tiles-2026-09 "narrow" family): 338–366 mm gauge, 10°. */
const TILE: RoofTileTechnicalSpec = {
  schemaVersion: 1,
  kind: 'roof-tile',
  physicalWidthMm: 298,
  physicalLengthMm: 500,
  installationModes: [
    {
      id: 'standard',
      coverWidthMm: 263,
      gaugeRangeMm: { min: 338, max: 366 },
      minPitchDeg: 10,
      declaredUnitsPerM2: { min: 10.4, max: 11.3 },
    },
  ],
};

const tile = (planes: string[]): CoveringAssignmentSpec => ({
  id: 'covering:roof-tile-1',
  roofPlaneIds: planes,
  product: {
    catalogRef: { productId: 'p', technicalRevisionId: 'r' },
    displaySnapshot: { familyName: 'Tile' },
    technicalSpecSnapshot: TILE,
  },
});

function workflowFor(state = useAssembly.getState()) {
  const template: RoofTemplateSpec = state.template;
  const { coverings, buildUp } = state.projectDocument.project;
  const layout = buildUp.battenLayout ?? disabledBattenLayer();
  const composition = resolveBattenAutoComposition({
    layout,
    assignments: coverings,
    ownership: resolvePrimaryCoveringAssignments(coverings),
    roofPlaneIds: roofPlaneIds(template),
    roofPitchDeg: template.pitchDeg,
  });
  const result = resolveBattenLayout({
    template,
    layout,
    autoSource: composition.source,
  });
  return deriveBattenWorkflow({
    layout: buildUp.battenLayout,
    result,
    composition,
    decision: evaluateBattenInstallation({ layout, result, composition }),
    assignments: coverings,
    roofPitchDeg: template.pitchDeg,
  });
}

beforeEach(() => {
  useAssembly.getState().reset();
  useAssembly.getState().setUnit('mm');
});

describe('V46 roof type switch keeps covering and battens in sync', () => {
  it('gable → hip → gable keeps a whole-roof tile and Auto battens ready in one undo step each', () => {
    const store = useAssembly.getState();
    if (store.template.type !== 'gable') store.setRoofType('gable');
    store.setCoveringAssignments([
      tile(roofPlaneIds(useAssembly.getState().template)),
    ]);
    useAssembly.getState().setBattenLayout(newBattenLayer());
    expect(workflowFor().state).toBe('auto-ready');

    useAssembly.getState().setRoofType('hip');
    const hip = useAssembly.getState();
    expect(hip.projectDocument.project.coverings[0]!.roofPlaneIds).toEqual(
      roofPlaneIds(hip.template),
    );
    expect(workflowFor().state).toBe('auto-ready');
    expect(workflowFor().planeCount).toBe(4);

    useAssembly.getState().setRoofType('gable');
    expect(
      useAssembly.getState().projectDocument.project.coverings[0]!.roofPlaneIds,
    ).toEqual(['roof-plane:left', 'roof-plane:right']);
    expect(workflowFor().state).toBe('auto-ready');

    useAssembly.getState().undo();
    expect(useAssembly.getState().template.type).toBe('hip');
    expect(
      useAssembly.getState().projectDocument.project.coverings[0]!.roofPlaneIds,
    ).toHaveLength(4);
  });
});

describe('V46 fit covering and battens to the roof', () => {
  it('turns the reported dead end (stale planes, manual battens) into a ready layout', () => {
    const store = useAssembly.getState();
    if (store.template.type !== 'gable') store.setRoofType('gable');
    // A project saved before V46: hip plane IDs left behind on a gable roof.
    useAssembly
      .getState()
      .setCoveringAssignments([
        tile(['roof-plane:front', 'roof-plane:rear', 'roof-plane:left']),
      ]);
    useAssembly.getState().setBattenLayout({
      ...newBattenLayer(),
      mode: 'manual',
      gaugeMm: 350,
      roofPlaneIds: ['roof-plane:front'],
    });
    const before = workflowFor();
    expect(before.complete).toBe(false);
    expect(before.actions).toContain('fit-roof');

    const history = useAssembly.getState().historyPast.length;
    useAssembly.getState().fitInstallationToRoof();
    const after = useAssembly.getState();
    expect(after.historyPast.length).toBe(history + 1);
    expect(after.projectDocument.project.coverings[0]!.roofPlaneIds).toEqual(
      roofPlaneIds(after.template),
    );
    expect(after.projectDocument.project.buildUp.battenLayout).toMatchObject({
      enabled: true,
      mode: 'auto-from-covering',
    });
    expect(
      after.projectDocument.project.buildUp.battenLayout?.roofPlaneIds,
    ).toBeUndefined();
    expect(workflowFor()).toMatchObject({
      state: 'auto-ready',
      complete: true,
    });

    // Idempotent: nothing left to repair, no empty history entry.
    useAssembly.getState().fitInstallationToRoof();
    expect(useAssembly.getState().historyPast.length).toBe(history + 1);
  });

  it('never merges a deliberate split of several coverings; only removes stale planes', () => {
    const template = useAssembly.getState().template;
    const a = { ...tile(['roof-plane:left']), id: 'covering:a' };
    const b = {
      ...tile(['roof-plane:right', 'roof-plane:front']),
      id: 'covering:b',
    };
    const repair = fitInstallationToRoof({
      template: template.type === 'gable' ? template : template,
      coverings: [a, b],
      buildUp: {},
    });
    const known = roofPlaneIds(template);
    for (const item of repair.coverings)
      expect(item.roofPlaneIds.every((id) => known.includes(id))).toBe(true);
    expect(repair.coverings.map((item) => item.id)).toEqual([
      'covering:a',
      'covering:b',
    ]);
  });

  it('uses the fixed support gauge as a manual value for modular sheet', () => {
    const template = useAssembly.getState().template;
    const sheet = {
      id: 'covering:sheet',
      roofPlaneIds: ['roof-plane:left'],
      product: {
        technicalSpecSnapshot: {
          schemaVersion: 1,
          kind: 'modular-sheet',
          moduleLengthMm: 350,
          battenGaugeMm: 350,
        },
      },
    } as unknown as CoveringAssignmentSpec;
    const repair = fitInstallationToRoof({
      template,
      coverings: [sheet],
      buildUp: {},
    });
    expect(repair.buildUp.battenLayout).toMatchObject({
      enabled: true,
      mode: 'manual',
      gaugeMm: 350,
    });
  });
});
