import { describe, expect, it } from 'vitest';
import { calculateCommonRafter } from './common-rafter';

describe('common rafter reference geometry', () => {
  it('includes a horizontal overhang on the same slope', () => {
    const r = calculateCommonRafter({
      runMm: 4000,
      pitchDeg: 30,
      overhangMm: 500,
    });
    expect(r.riseMm).toBeCloseTo(2309.401076758503, 9);
    expect(r.bodyLengthMm).toBeCloseTo(4618.802153517006, 9);
    expect(r.tailLengthMm).toBeCloseTo(577.350269189626, 9);
    expect(r.totalLengthMm).toBeCloseTo(5196.152422706632, 9);
    expect(r.tailDropMm).toBeCloseTo(288.675134594813, 9);
  });
  it('allows no overhang', () => {
    const r = calculateCommonRafter({
      runMm: 1000,
      pitchDeg: 45,
      overhangMm: 0,
    });
    expect(r.totalLengthMm).toBe(r.bodyLengthMm);
    expect(r.tailLengthMm).toBe(0);
  });
  it.each([-1, 10001, NaN, Infinity])('rejects overhang %s', (overhangMm) => {
    expect(() =>
      calculateCommonRafter({ runMm: 1000, pitchDeg: 30, overhangMm }),
    ).toThrow();
  });
  it('scales linearly and never changes the angle', () => {
    const a = calculateCommonRafter({
      runMm: 2500,
      pitchDeg: 35,
      overhangMm: 250,
    });
    const b = calculateCommonRafter({
      runMm: 13000,
      pitchDeg: 35,
      overhangMm: 1300,
    });
    expect(b.totalLengthMm / a.totalLengthMm).toBeCloseTo(5.2, 12);
    expect(b.pitchDeg).toBe(a.pitchDeg);
  });
  it('does not overflow for a tiny run with a large overhang', () => {
    const r = calculateCommonRafter({
      runMm: Number.MIN_VALUE,
      pitchDeg: 30,
      overhangMm: 10000,
    });
    expect(Number.isFinite(r.totalLengthMm)).toBe(true);
    expect(Number.isFinite(r.tailDropMm)).toBe(true);
  });
});
