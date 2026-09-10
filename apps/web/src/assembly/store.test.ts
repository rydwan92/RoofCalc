import { beforeEach, expect, it } from 'vitest';
import {
  calculateAssembly,
  assemblySpecSchema,
  resolveGableRoofTemplate,
} from '@cieslacalc/roof-math';
import { supportField, useAssembly } from './store';
beforeEach(() => {
  useAssembly.getState().reset();
  useAssembly.setState({ unit: 'mm', mode: 'quick' });
});
it('Quick and Builder retain one canonical template and fabrication plan', () => {
  useAssembly.getState().setField('roof.runMm', '4231,123456');
  const { spec, template } = useAssembly.getState(),
    plan = calculateAssembly(spec);
  useAssembly.getState().setMode('builder');
  expect(useAssembly.getState().spec).toBe(spec);
  expect(useAssembly.getState().template).toBe(template);
  expect(calculateAssembly(useAssembly.getState().spec)).toEqual(plan);
  useAssembly.getState().add();
  const withPurlin = useAssembly.getState().spec;
  useAssembly.getState().setMode('quick');
  expect(useAssembly.getState().spec).toBe(withPurlin);
});
it('unit changes preserve precision and numeric positions, and raw editing uses the display unit', () => {
  useAssembly.getState().add();
  const field = supportField('support:purlin-1', 'xMm');
  useAssembly.getState().setField(field, '2100,123456789');
  const spec = useAssembly.getState().spec;
  for (const unit of ['m', 'cm', 'mm'] as const) {
    useAssembly.getState().setUnit(unit);
    expect(useAssembly.getState().spec).toBe(spec);
  }
  useAssembly.getState().setUnit('m');
  useAssembly.getState().setField(field, '2,5');
  expect(useAssembly.getState().spec.supports[1]!.placement.xMm).toBe(2500);
  useAssembly.getState().movePurlin('support:purlin-1', 2300);
  expect(useAssembly.getState().drafts[field]).toBe('2.3');
});
it('invalid drafts preserve the last valid template and disappear with a removed purlin', () => {
  useAssembly.getState().add();
  const before = useAssembly.getState().spec;
  useAssembly
    .getState()
    .setField(supportField('support:purlin-1', 'xMm'), 'wrong');
  expect(
    assemblySpecSchema.safeParse(useAssembly.getState().spec).success,
  ).toBe(true);
  expect(useAssembly.getState().spec).toBe(before);
  expect(
    useAssembly.getState().invalidFields[
      supportField('support:purlin-1', 'xMm')
    ],
  ).toBe(true);
  useAssembly.getState().remove('support:purlin-1');
  expect(
    assemblySpecSchema.safeParse(useAssembly.getState().spec).success,
  ).toBe(true);
  expect(useAssembly.getState().drafts).toEqual({});
  useAssembly.getState().add();
  expect(
    Number.isFinite(useAssembly.getState().spec.supports[1]!.placement.xMm),
  ).toBe(true);
});
it('template layout changes only repeated skeleton positions, not fabrication geometry', () => {
  const before = resolveGableRoofTemplate(useAssembly.getState().template);
  useAssembly.getState().setField('template.buildingLengthMm', '12000');
  useAssembly.getState().setField('template.rafterSpacingMm', '600');
  const after = resolveGableRoofTemplate(useAssembly.getState().template);
  expect(after.rafterSpacing.stations).toHaveLength(21);
  expect(after.calculation).toEqual(before.calculation);
});
it('converts the controlling joint parameter without changing the notch', () => {
  const id = useAssembly.getState().spec.supports[0]!.id;
  const before = calculateAssembly(useAssembly.getState().spec);
  useAssembly.getState().setJointControl(id, 'depth');
  const after = calculateAssembly(useAssembly.getState().spec);
  expect(after.assembly.joints[0]!.seatLengthMm).toBeCloseTo(
    before.assembly.joints[0]!.seatLengthMm,
    10,
  );
});
it('undoes and redoes a committed numeric template edit without recording display state', () => {
  const before = useAssembly.getState().template;
  useAssembly.getState().setField('roof.pitchDeg', '42');
  expect(useAssembly.getState().historyPast).toHaveLength(1);
  useAssembly.getState().setUnit('m');
  expect(useAssembly.getState().historyPast).toHaveLength(1);
  useAssembly.getState().undo();
  expect(useAssembly.getState().template).toEqual(before);
  expect(useAssembly.getState().historyFuture).toHaveLength(1);
  useAssembly.getState().redo();
  expect(useAssembly.getState().template.pitchDeg).toBe(42);
});
it('updates canonical millimetres directly for drawing handles without display-unit conversion', () => {
  useAssembly.getState().setUnit('m');
  useAssembly.getState().setCanonicalField('roof.runMm', 4210.5);
  expect(useAssembly.getState().template.halfRunMm).toBe(4210.5);
  expect(useAssembly.getState().spec.roof.runMm).toBe(4210.5);
});
it('coalesces a purlin gesture and restores its start state when cancelled', () => {
  useAssembly.getState().add();
  useAssembly.setState({ historyPast: [], historyFuture: [] });
  const start = useAssembly.getState().template.intermediateSupports[0]!.placement.xMm;
  useAssembly.getState().beginTransaction();
  useAssembly.getState().movePurlin('support:purlin-1', start + 100);
  useAssembly.getState().movePurlin('support:purlin-1', start + 250);
  expect(useAssembly.getState().historyPast).toHaveLength(0);
  useAssembly.getState().commitTransaction();
  expect(useAssembly.getState().historyPast).toHaveLength(1);
  useAssembly.getState().undo();
  expect(
    useAssembly.getState().template.intermediateSupports[0]!.placement.xMm,
  ).toBe(start);
  useAssembly.getState().redo();
  expect(
    useAssembly.getState().template.intermediateSupports[0]!.placement.xMm,
  ).toBe(start + 250);
  useAssembly.getState().beginTransaction();
  useAssembly.getState().movePurlin('support:purlin-1', start + 300);
  useAssembly.getState().cancelTransaction();
  expect(
    useAssembly.getState().template.intermediateSupports[0]!.placement.xMm,
  ).toBe(start + 250);
});
it('undoes and redoes adding and removing independently allocated purlins', () => {
  useAssembly.getState().add();
  useAssembly.getState().add();
  expect(useAssembly.getState().template.intermediateSupports).toHaveLength(2);
  useAssembly.getState().undo();
  expect(useAssembly.getState().template.intermediateSupports).toHaveLength(1);
  useAssembly.getState().redo();
  useAssembly.getState().remove('support:purlin-2');
  expect(useAssembly.getState().template.intermediateSupports).toHaveLength(1);
  useAssembly.getState().undo();
  expect(useAssembly.getState().template.intermediateSupports).toHaveLength(2);
});
