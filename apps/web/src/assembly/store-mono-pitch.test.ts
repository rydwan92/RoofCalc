import { beforeEach, describe, expect, it } from 'vitest';
import { resolveRoofTemplate } from '@cieslacalc/roof-math';
import type { MonoPitchRoofTemplateSpec } from '@cieslacalc/timber-model';
import { supportField, useAssembly } from './store';

/** The store's template as a mono-pitch roof, or a loud failure. */
function mono(): MonoPitchRoofTemplateSpec {
  const template = useAssembly.getState().template;
  if (template.type !== 'mono-pitch') throw new Error('expected mono-pitch');
  return template;
}

beforeEach(() => {
  useAssembly.getState().reset();
  useAssembly.getState().setUnit('mm');
  useAssembly.getState().setMode('builder');
  useAssembly.setState({ historyPast: [], historyFuture: [] });
});

describe('a mono-pitch project in the workbench store (VNext-8, ADR-016)', () => {
  it('switches the family as one undoable edit and keeps the building', () => {
    const gable = useAssembly.getState().template;
    if (gable.type === 'mono-pitch') throw new Error('default is ridged');
    useAssembly.getState().setRoofType('mono-pitch');
    expect(mono()).toMatchObject({
      buildingLengthMm: gable.buildingLengthMm,
      runMm: gable.halfRunMm * 2,
      pitchDeg: gable.pitchDeg,
    });
    expect(useAssembly.getState().projectDocument.project.roof.type).toBe(
      'mono-pitch',
    );
    // The rafter section the canvas edits: two plates, no ridge board.
    expect(
      useAssembly.getState().spec.supports.map((support) => support.kind),
    ).toEqual(['wall-plate', 'wall-plate']);
    expect(useAssembly.getState().spec.ridge.thicknessMm).toBe(0);
    expect(useAssembly.getState().historyPast).toHaveLength(1);
    useAssembly.getState().undo();
    expect(useAssembly.getState().template.type).toBe('gable');
  });

  it('edits the span, the overhangs and the top edge as exact values', () => {
    useAssembly.getState().setRoofType('mono-pitch');
    useAssembly.getState().setField('mono.runMm', '4000');
    useAssembly.getState().setField('mono.vergeOverhangMm', '250');
    expect(mono()).toMatchObject({ runMm: 4000, vergeOverhangMm: 250 });
    // The high support follows the span: its outer face is the span.
    const high = useAssembly.getState().spec.supports.at(-1)!;
    expect(high.placement.xMm + high.section.widthMm).toBe(4000);

    useAssembly.getState().setMonoPitchTopEdge('abutment');
    expect(mono()).toMatchObject({
      topEdge: 'abutment',
      highOverhangMm: 0,
      highSupport: { kind: 'ledger' },
    });
    useAssembly.getState().setMonoPitchTopEdge('free');
    expect(mono()).toMatchObject({
      topEdge: 'free',
      highOverhangMm: 300,
      highSupport: { kind: 'wall-plate' },
    });
    useAssembly.getState().undo();
    expect(mono().topEdge).toBe('abutment');
  });

  it('keeps a span the supports no longer fit out of the project', () => {
    useAssembly.getState().setRoofType('mono-pitch');
    const before = mono();
    useAssembly.getState().setField('mono.runMm', '200');
    expect(useAssembly.getState().invalidFields['mono.runMm']).toBe(true);
    expect(mono()).toEqual(before);
  });

  it('adds purlins between the plates, numbered along the slope', () => {
    useAssembly.getState().setRoofType('mono-pitch');
    useAssembly.getState().add();
    expect(mono().intermediateSupports).toHaveLength(1);
    const selected = useAssembly.getState().workbench.selectedId;
    const purlin = useAssembly
      .getState()
      .spec.supports.find((support) => support.id === selected);
    expect(purlin?.kind).toBe('purlin');
    const [low, , high] = useAssembly.getState().spec.supports;
    expect(purlin!.placement.xMm).toBeGreaterThan(
      low!.placement.xMm + low!.section.widthMm,
    );
    expect(purlin!.placement.xMm + purlin!.section.widthMm).toBeLessThan(
      high!.placement.xMm,
    );
    // A support edit goes through the rafter section back to the template.
    useAssembly.getState().setField(supportField(purlin!.id, 'xMm'), '2000');
    expect(mono().intermediateSupports[0]!.positionMm).toBe(2000);
    expect(() => resolveRoofTemplate(mono())).not.toThrow();
  });
});
