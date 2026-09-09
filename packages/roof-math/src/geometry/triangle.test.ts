import { describe, expect, it } from 'vitest';
import { calculateTriangle } from './triangle';

describe('right triangle', () => {
  it('matches the 1000 mm / 30° reference without intermediate rounding', () => {
    const result = calculateTriangle({ runMm: 1000, pitchDeg: 30 });
    expect(result.riseMm).toBeCloseTo(577.350269189626, 10);
    expect(result.lengthMm).toBeCloseTo(1154.700538379252, 10);
    expect(result.plumbAngleDeg).toBe(60);
  });
  it('matches an isosceles triangle', () => {
    const result = calculateTriangle({ runMm: 4000, pitchDeg: 45 });
    expect(result.riseMm).toBeCloseTo(4000, 10);
    expect(result.lengthMm).toBeCloseTo(4000 * Math.SQRT2, 10);
  });
  it.each([0, -1, 100001, NaN, Infinity])('rejects run %s', (runMm) => {
    expect(() => calculateTriangle({ runMm, pitchDeg: 30 })).toThrow();
  });
  it.each([0, -30, 0.99, 80.01, 90, NaN, Infinity])(
    'rejects pitch %s',
    (pitchDeg) => {
      expect(() => calculateTriangle({ runMm: 1000, pitchDeg })).toThrow();
    },
  );
  it.each([1, 80])('accepts supported pitch boundary %s', (pitchDeg) => {
    const r = calculateTriangle({ runMm: 100000, pitchDeg });
    expect(Number.isFinite(r.lengthMm)).toBe(true);
    expect(r.lengthMm ** 2).toBeCloseTo(r.runMm ** 2 + r.riseMm ** 2, 2);
  });
});
