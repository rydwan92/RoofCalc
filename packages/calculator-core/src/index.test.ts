import { expect, it } from 'vitest';
import { commonRafter, freeAccessPolicy } from './index';

it('creates a drawing in canonical coordinates that agrees with the result', () => {
  const input = { runMm: 4000, pitchDeg: 30, overhangMm: 500 };
  const output = commonRafter.calculate(input);
  const model = commonRafter.createDrawing(input, output);
  expect(model.bounds.maxX).toBe(input.runMm);
  expect(model.bounds.maxY).toBe(output.riseMm);
  expect(model.bounds.minX).toBe(-500);
  expect(model.dimensions.find((d) => d.id === 'total')?.valueMm).toBe(
    output.totalLengthMm,
  );
});
it('does not create a zero-length overhang dimension', () => {
  const input = { runMm: 1000, pitchDeg: 30, overhangMm: 0 };
  expect(
    commonRafter
      .createDrawing(input, commonRafter.calculate(input))
      .dimensions.some((d) => d.id === 'overhang'),
  ).toBe(false);
});
it('grants launched modules through an external access policy', () => {
  expect(freeAccessPolicy.canUse('calculator.common-rafter')).toBe(true);
  expect(freeAccessPolicy.canUse('calculator.hip-rafter')).toBe(false);
});
