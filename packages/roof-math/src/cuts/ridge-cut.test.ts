import { describe, expect, it } from 'vitest';
import { calculateRidgeCut } from './ridge-cut';

describe('vertical symmetric ridge board', () => {
  it('deducts half the horizontal thickness before projecting along the member', () => {
    const r = calculateRidgeCut({
      runMm: 4000,
      pitchDeg: 30,
      depthMm: 200,
      thicknessMm: 40,
    });
    expect(r.nearFaceXmm).toBe(3980);
    expect(r.horizontalDeductionMm).toBe(20);
    expect(r.alongMemberDeductionMm).toBeCloseTo(23.094010767585, 10);
    expect(r.topBottomStationOffsetMm).toBeCloseTo(115.470053837925, 10);
    expect(r.angleToMemberDeg).toBe(60);
    expect(r.cutLengthMm).toBeCloseTo(230.94010767585, 10);
  });
  it('allows a zero-thickness ridge at the axis', () => {
    const r = calculateRidgeCut({
      runMm: 4000,
      pitchDeg: 35,
      depthMm: 200,
      thicknessMm: 0,
    });
    expect(r.nearFaceXmm).toBe(4000);
    expect(r.alongMemberDeductionMm).toBe(0);
  });
  it('defaults the connection to ridge-board', () => {
    const r = calculateRidgeCut({
      runMm: 4000,
      pitchDeg: 30,
      depthMm: 200,
      thicknessMm: 40,
    });
    expect(r.connection).toBe('ridge-board');
  });
  it.each(['direct-meeting', 'half-lap'] as const)(
    'ignores the declared thickness for %s and reaches the axis',
    (connection) => {
      const r = calculateRidgeCut({
        runMm: 4000,
        pitchDeg: 30,
        depthMm: 200,
        thicknessMm: 40,
        connection,
      });
      expect(r.connection).toBe(connection);
      expect(r.nearFaceXmm).toBe(4000);
      expect(r.horizontalDeductionMm).toBe(0);
      expect(r.alongMemberDeductionMm).toBe(0);
    },
  );
  it.each([-1, Infinity, NaN, 1001])('rejects thickness %s', (thicknessMm) => {
    expect(() =>
      calculateRidgeCut({
        runMm: 4000,
        pitchDeg: 30,
        depthMm: 200,
        thicknessMm,
      }),
    ).toThrow();
  });
  it('rejects a near face at or behind the heel', () => {
    expect(() =>
      calculateRidgeCut({
        runMm: 100,
        pitchDeg: 30,
        depthMm: 200,
        thicknessMm: 200,
      }),
    ).toThrow();
  });
});
