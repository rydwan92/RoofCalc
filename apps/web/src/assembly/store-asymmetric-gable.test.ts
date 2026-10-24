import { beforeEach, describe, expect, it } from 'vitest';
import { createRoofFabricationPackage } from '@cieslacalc/calculator-core';
import { resolveRoofTemplate } from '@cieslacalc/roof-math';
import type { AsymmetricGableRoofTemplateSpec } from '@cieslacalc/timber-model';
import { useAssembly } from './store';
import { memberCode, memberLabelIndex } from './connections/labels';
import { MEMBER_FAMILY_LABEL } from './roof-family';
import {
  memberInstanceCodes,
  workbenchProjectResolver,
} from './workbench-project';

/** The store's template as an asymmetric gable, or a loud failure. */
function asymmetric(): AsymmetricGableRoofTemplateSpec {
  const template = useAssembly.getState().template;
  if (template.type !== 'asymmetric-gable')
    throw new Error('expected an asymmetric gable');
  return template;
}

beforeEach(() => {
  useAssembly.getState().reset();
  useAssembly.getState().setUnit('mm');
  useAssembly.getState().setMode('builder');
  useAssembly.setState({ historyPast: [], historyFuture: [] });
});

describe('an asymmetric gable in the workbench store (VNext-9)', () => {
  it('starts as the same gable, then takes its own right pitch and span', () => {
    const gable = useAssembly.getState().template;
    if (gable.type !== 'gable') throw new Error('default is a gable');
    useAssembly.getState().setRoofType('asymmetric-gable');
    expect(asymmetric()).toMatchObject({
      spanMm: gable.halfRunMm * 2,
      pitchDeg: gable.pitchDeg,
      rightPitchDeg: gable.pitchDeg,
    });
    useAssembly.getState().setField('asym.rightPitchDeg', '25');
    useAssembly.getState().setField('asym.spanMm', '9000');
    expect(asymmetric()).toMatchObject({ rightPitchDeg: 25, spanMm: 9000 });
    // The left rafter the canvas edits moved with the ridge.
    const leftRun = useAssembly.getState().spec.roof.runMm;
    const tanA = Math.tan((gable.pitchDeg * Math.PI) / 180);
    const tanB = Math.tan((25 * Math.PI) / 180);
    expect(leftRun).toBeCloseTo((9000 * tanB) / (tanA + tanB), 6);
    useAssembly.getState().undo();
    expect(asymmetric().spanMm).toBe(gable.halfRunMm * 2);
  });

  it('keeps the building when the left pitch changes; the ridge moves', () => {
    useAssembly.getState().setRoofType('asymmetric-gable');
    const span = asymmetric().spanMm;
    useAssembly.getState().setField('roof.pitchDeg', '40');
    expect(asymmetric()).toMatchObject({ spanMm: span, pitchDeg: 40 });
  });

  it('names why a pair of pitches has no right rafter, at the edited field', () => {
    useAssembly.getState().setRoofType('asymmetric-gable');
    useAssembly.getState().setField('asym.rightPitchDeg', '20');
    useAssembly.getState().setField('roof.pitchDeg', '60');
    expect(useAssembly.getState().invalidFields['roof.pitchDeg']).toBe(
      'right_seat_not_positive',
    );
    // The last valid roof stays; a valid value clears the reason.
    expect(asymmetric().pitchDeg).not.toBe(60);
    useAssembly.getState().setField('roof.pitchDeg', '30');
    expect(
      useAssembly.getState().invalidFields['roof.pitchDeg'],
    ).toBeUndefined();
  });

  it('gives K2 its own operations and keeps purlins out', () => {
    useAssembly.getState().setRoofType('asymmetric-gable');
    useAssembly.getState().setField('asym.rightPitchDeg', '25');
    const roofPackage = createRoofFabricationPackage(
      resolveRoofTemplate(asymmetric()),
    );
    const [k1, k2] = roofPackage.families;
    expect([k1!.code, k2!.code]).toEqual(['K1', 'K2']);
    const k1Ids = new Set(k1!.operations.map((operation) => operation.id));
    expect(k2!.operations.some((operation) => k1Ids.has(operation.id))).toBe(
      false,
    );
    const history = useAssembly.getState().historyPast.length;
    useAssembly.getState().add();
    expect(useAssembly.getState().historyPast).toHaveLength(history);
    expect(useAssembly.getState().spec.supports).toHaveLength(1);
  });

  it('names a right rafter K2 on the drawing, in codes and by family', () => {
    useAssembly.getState().setRoofType('asymmetric-gable');
    useAssembly.getState().setField('asym.rightPitchDeg', '25');
    const template = asymmetric();
    const { skeleton } = workbenchProjectResolver.resolve(template);
    const labels = memberLabelIndex(skeleton.members);
    const first = (side: 'left' | 'right') =>
      skeleton.members.find(
        (member) => member.kind === 'rafter' && member.side === side,
      )!;
    expect(memberCode(labels.get(first('left').id))).toBe('K1-01');
    expect(memberCode(labels.get(first('right').id))).toBe('K2-01');
    const codeOf = memberInstanceCodes(template);
    expect(codeOf(first('left').id)).toBe('K1-01');
    expect(codeOf(first('right').id)).toBe('K2-01');
    // K2 is a common rafter, never another family's name.
    expect(MEMBER_FAMILY_LABEL.K2).toBe(MEMBER_FAMILY_LABEL.K1);
  });
});
