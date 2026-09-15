import { describe, expect, it } from 'vitest';
import {
  calculateCollarTie,
  clampCollarTieHeightMm,
  maxCollarTieHeightMm,
} from './collar-tie';

describe('collar-tie reference geometry', () => {
  it('computes the horizontal span between the two rafter axes at the given height', () => {
    const result = calculateCollarTie({
      halfRunMm: 4000,
      pitchDeg: 45,
      heightAboveWallPlateMm: 1000,
    });
    expect(result.lengthMm).toBeCloseTo(6000, 6);
    expect(result.leftXmm).toBeCloseTo(-3000, 6);
    expect(result.rightXmm).toBeCloseTo(3000, 6);
    expect(result.positionAlongRafterMm).toBeCloseTo(1414.213562373095, 6);
  });

  it('shrinks toward zero length as the height approaches the ridge', () => {
    const halfRunMm = 4000,
      pitchDeg = 35;
    const maxHeightMm = maxCollarTieHeightMm(halfRunMm, pitchDeg);
    const nearRidge = calculateCollarTie({
      halfRunMm,
      pitchDeg,
      heightAboveWallPlateMm: maxHeightMm,
    });
    const lower = calculateCollarTie({
      halfRunMm,
      pitchDeg,
      heightAboveWallPlateMm: maxHeightMm / 2,
    });
    expect(nearRidge.lengthMm).toBeGreaterThan(0);
    expect(nearRidge.lengthMm).toBeLessThan(lower.lengthMm);
  });

  it('rejects a height at or above the ridge apex', () => {
    const halfRunMm = 4000,
      pitchDeg = 35;
    const maxHeightMm = maxCollarTieHeightMm(halfRunMm, pitchDeg);
    expect(() =>
      calculateCollarTie({
        halfRunMm,
        pitchDeg,
        heightAboveWallPlateMm: maxHeightMm + 10,
      }),
    ).toThrow();
  });

  it('clamps a proposed height into the legal range', () => {
    const halfRunMm = 4000,
      pitchDeg = 35;
    const maxHeightMm = maxCollarTieHeightMm(halfRunMm, pitchDeg);
    expect(clampCollarTieHeightMm(halfRunMm, pitchDeg, -100)).toBe(1);
    expect(
      clampCollarTieHeightMm(halfRunMm, pitchDeg, maxHeightMm + 1000),
    ).toBe(maxHeightMm);
    expect(clampCollarTieHeightMm(halfRunMm, pitchDeg, 500)).toBe(500);
  });
});
