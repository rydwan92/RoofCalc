import { beforeEach, describe, expect, it } from 'vitest';
import { resolveCounterBattenLayout } from '@cieslacalc/roof-math';
import { useAssembly } from './store';
import { workbenchProjectResolver } from './workbench-project';

/**
 * V39 web-layer behaviour: the hip-boundary decision is canonical project
 * intent with normal Undo/Redo, and every downstream consumer picks up the
 * resolver's new facts without recomputing any geometry of its own.
 */

beforeEach(() => {
  useAssembly.getState().reset();
  useAssembly.getState().setRoofType('hip');
  useAssembly.getState().setCounterBattenLayout({
    enabled: true,
    widthMm: 40,
    heightMm: 60,
  });
});

function counterBattens() {
  const state = useAssembly.getState();
  return resolveCounterBattenLayout({
    template: state.template,
    skeleton: workbenchProjectResolver.resolve(state.template).skeleton,
    layout: state.projectDocument.project.buildUp.counterBattens!,
    features: state.projectDocument.project.features,
  });
}

describe('hip counter-batten detail is canonical project intent', () => {
  it('starts undecided on a hip roof and says so', () => {
    const result = counterBattens();
    expect(
      useAssembly.getState().projectDocument.project.buildUp.counterBattens
        ?.hipBoundaryDetail,
    ).toBeUndefined();
    expect(result.status).toBe('partial');
    expect(result.unresolvedHipBoundaryCount).toBe(4);
  });

  it('choosing a detail is one undoable edit that resolves the layout', () => {
    const before = counterBattens();
    const historyBefore = useAssembly.getState().historyPast.length;
    useAssembly.getState().setHipCounterBattenDetail('paired-plane-runs');
    expect(useAssembly.getState().historyPast).toHaveLength(historyBefore + 1);
    const after = counterBattens();
    expect(after.status).toBe('resolved');
    expect(after.unresolvedHipBoundaryCount).toBe(0);
    expect(after.hipBoundaryRunCount).toBe(8);
    expect(after.totalVisibleLengthMm).toBeGreaterThan(
      before.totalVisibleLengthMm,
    );
    useAssembly.getState().undo();
    expect(counterBattens().status).toBe('partial');
    useAssembly.getState().redo();
    expect(counterBattens().status).toBe('resolved');
  });

  it('the holder detail resolves the layout without adding length', () => {
    const before = counterBattens();
    useAssembly.getState().setHipCounterBattenDetail('no-dedicated-run');
    const after = counterBattens();
    expect(after.status).toBe('resolved');
    expect(after.totalVisibleLengthMm).toBe(before.totalVisibleLengthMm);
    expect(after.hipBoundaryRunCount).toBe(0);
  });

  it('survives a save/load round trip and keeps older projects undecided', () => {
    useAssembly.getState().setHipCounterBattenDetail('paired-plane-runs');
    const saved = JSON.parse(
      JSON.stringify(useAssembly.getState().projectDocument),
    );
    expect(saved.project.buildUp.counterBattens.hipBoundaryDetail).toBe(
      'paired-plane-runs',
    );
    useAssembly.getState().replaceProjectDocument(saved);
    expect(counterBattens().status).toBe('resolved');
    // A project saved before V39 simply has no field, and stays truthful.
    const legacy = JSON.parse(JSON.stringify(saved));
    delete legacy.project.buildUp.counterBattens.hipBoundaryDetail;
    useAssembly.getState().replaceProjectDocument(legacy);
    expect(counterBattens().status).toBe('partial');
  });

  it('leaves the interior K1/J1 axes untouched by the decision', () => {
    const before = counterBattens();
    useAssembly.getState().setHipCounterBattenDetail('paired-plane-runs');
    const after = counterBattens();
    expect(after.interiorAxisCount).toBe(before.interiorAxisCount);
    const interiorLength = (rows: typeof after.rows) =>
      rows
        .filter((row) => row.role === 'plane-rafter-axis')
        .reduce((sum, row) => sum + row.visibleLengthMm, 0);
    expect(interiorLength(after.rows)).toBeCloseTo(
      interiorLength(before.rows),
      6,
    );
  });
});

describe('hip execution intent drives J1 fabrication readiness', () => {
  it('is reference-only until the connection is chosen, then resolved', () => {
    const jacks = () => {
      const resolved = workbenchProjectResolver.resolve(
        useAssembly.getState().template,
      ).resolved;
      if (!('jackRafters' in resolved))
        throw new Error('hip template must resolve jacks');
      return resolved.jackRafters;
    };
    expect(jacks().length).toBeGreaterThan(0);
    for (const jack of jacks())
      expect(jack.fabrication.executionStatus).toBe('reference-only');
    const historyBefore = useAssembly.getState().historyPast.length;
    useAssembly.getState().setHipExecution({ jackConnection: 'hip-face-butt' });
    expect(useAssembly.getState().historyPast).toHaveLength(historyBefore + 1);
    for (const jack of jacks()) {
      expect(jack.fabrication.executionStatus).toBe('fabrication-resolved');
      expect(jack.fabrication.finishedLengthMm!).toBeLessThan(
        jack.fabrication.referenceLengthMm,
      );
    }
    useAssembly.getState().undo();
    for (const jack of jacks())
      expect(jack.fabrication.executionStatus).toBe('reference-only');
  });

  it('never drops the rest of the project when the intent changes', () => {
    const before = useAssembly.getState().projectDocument.project;
    useAssembly.getState().setHipExecution({ hipTop: 'backed' });
    const after = useAssembly.getState().projectDocument.project;
    expect(after.buildUp.counterBattens).toEqual(before.buildUp.counterBattens);
    expect(after.features).toEqual(before.features);
    expect(after.coverings).toEqual(before.coverings);
    if (after.roof.type !== 'hip') throw new Error('expected a hip roof');
    expect(after.roof.hipExecution?.hipTop).toBe('backed');
  });
});
