import { describe, expect, it } from 'vitest';
import { calculateBirdsmouth } from './birdsmouth';

describe('birdsmouth', () => {
  it('matches the 30° / 100 mm seat / 200 mm depth reference', () => {
    const r = calculateBirdsmouth({
      pitchDeg: 30,
      seatLengthMm: 100,
      depthMm: 200,
    });
    expect(r.verticalRiseAcrossSeatMm).toBeCloseTo(57.735026918963, 10);
    expect(r.normalDepthMm).toBeCloseTo(50, 12);
    expect(r.remainingDepthMm).toBeCloseTo(150, 12);
    expect(r.removedDepthRatio).toBeCloseTo(0.25, 12);
  });
  it.each([1, 80])('supports the pitch boundary %s', (pitchDeg) => {
    const r = calculateBirdsmouth({
      pitchDeg,
      seatLengthMm: 100,
      depthMm: 200,
    });
    expect(r.remainingDepthMm).toBeGreaterThan(0);
    expect(r.normalDepthMm + r.remainingDepthMm).toBe(200);
  });
  it.each([
    { pitchDeg: 0 },
    { pitchDeg: 81 },
    { pitchDeg: NaN },
    { seatLengthMm: 0 },
    { seatLengthMm: -10 },
    { seatLengthMm: Infinity },
    { depthMm: 0 },
    { depthMm: -1 },
    { depthMm: NaN },
    { pitchDeg: 90 },
    { seatLengthMm: 400 },
  ])('rejects invalid geometry %j', (patch) => {
    expect(() =>
      calculateBirdsmouth({
        pitchDeg: 45,
        seatLengthMm: 100,
        depthMm: 200,
        ...patch,
      }),
    ).toThrow();
  });
  it('rejects exact full-depth removal but does not invent a percentage limit', () => {
    const normal = 100 * Math.sin(Math.PI / 4);
    expect(() =>
      calculateBirdsmouth({ pitchDeg: 45, seatLengthMm: 100, depthMm: normal }),
    ).toThrow();
    const r = calculateBirdsmouth({
      pitchDeg: 45,
      seatLengthMm: 100,
      depthMm: normal + 0.001,
    });
    expect(r.removedDepthRatio).toBeGreaterThan(0.99);
  });
});
