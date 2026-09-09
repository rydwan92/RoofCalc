import { beforeEach, expect, it } from 'vitest';
import { workbenchDefaults } from '@cieslacalc/roof-math';
import { fieldValue, fields, useWorkbench } from './store';

beforeEach(() => {
  useWorkbench.getState().reset();
  useWorkbench.getState().setUnit('mm');
  useWorkbench.setState({
    selected: 'geometry',
    view: 'assembly',
    detailTarget: 'birdsmouth',
    dimensions: true,
  });
});
it('changes every length unit without changing any canonical workbench parameter', () => {
  useWorkbench.getState().setField('geometry.runMm', '4300,123456789');
  const original = structuredClone(useWorkbench.getState().input);
  for (const unit of ['m', 'mm', 'cm', 'm', 'cm'] as const)
    useWorkbench.getState().setUnit(unit);
  expect(useWorkbench.getState().input).toEqual(original);
  for (const field of fields)
    expect(Number(useWorkbench.getState().draft[field])).toBeCloseTo(
      fieldValue(original, field) / (field === 'geometry.pitchDeg' ? 1 : 10),
      10,
    );
});
it('preserves an empty input during unit switches and recovers on editing', () => {
  useWorkbench.getState().setField('timber.depthMm', '');
  useWorkbench.getState().setUnit('m');
  expect(useWorkbench.getState().draft['timber.depthMm']).toBe('');
  expect(Number.isNaN(useWorkbench.getState().input.timber.depthMm)).toBe(true);
  useWorkbench.getState().setField('timber.depthMm', '0,22');
  expect(useWorkbench.getState().input.timber.depthMm).toBe(220);
});
it('does not discard invalid drafts or switch the data when selecting objects and views', () => {
  useWorkbench.getState().setField('wallPlate.seatLengthMm', '1,2,3');
  useWorkbench.getState().select('ridge-cut');
  useWorkbench.getState().setView('detail');
  expect(useWorkbench.getState().detailTarget).toBe('ridge-cut');
  expect(useWorkbench.getState().draft['wallPlate.seatLengthMm']).toBe('1,2,3');
  useWorkbench.getState().reset();
  expect(useWorkbench.getState().input).toEqual(workbenchDefaults);
});
