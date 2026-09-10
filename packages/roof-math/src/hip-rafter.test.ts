import { describe, expect, it } from 'vitest';
import type { HipRafterSpec } from '@cieslacalc/timber-model';
import { calculateHipRafter } from './hip-rafter';

const spec = (overrides: Partial<HipRafterSpec> = {}): HipRafterSpec => ({
  id: 'member:hip-rafter-H1',
  section: { widthMm: 80, depthMm: 240 },
  commonRunMm: 1000,
  pitchDeg: 30,
  overhangMm: 0,
  ridgeThicknessMm: 0,
  ...overrides,
});

describe('regular hip rafter H1', () => {
  it('matches the 1000 mm / 30 degree normative regression', () => {
    const { result, fabrication } = calculateHipRafter(spec());
    expect(result.commonRiseMm).toBeCloseTo(577.3502691896, 9);
    expect(result.planRunMm).toBeCloseTo(1414.2135623731, 9);
    expect(result.theoreticalLineLengthMm).toBeCloseTo(1527.5252316519, 9);
    expect(result.hipSlopeDeg).toBeCloseTo(22.2076542986, 9);
    expect(result.plumbToMemberDeg).toBeCloseTo(67.7923457014, 9);
    expect(result.seatToMemberDeg).toBeCloseTo(22.2076542986, 9);
    expect(result.cheekAngleDeg).toBeCloseTo(42.7941371071, 9);
    expect(result.backingAngleDeg).toBeCloseTo(20.7048110546, 9);
    expect(fabrication.ridgeCut.doubleCheek).toBe(true);
    expect(fabrication.backing.reference).toBe('top-arris-to-roof-plane');
  });

  it('matches the exact 6/12 cross-check without using rounded 17/12', () => {
    const pitchDeg = (Math.atan(6 / 12) * 180) / Math.PI;
    const { result } = calculateHipRafter(spec({ commonRunMm: 12, pitchDeg }));
    expect(result.planRunMm).toBeCloseTo(16.9705627485, 10);
    expect(result.theoreticalLineLengthMm).toBeCloseTo(18, 12);
    expect(result.hipSlopeDeg).toBeCloseTo(19.4712206345, 9);
    expect(result.cheekAngleDeg).toBeCloseTo(43.3138566583, 9);
    expect(result.backingAngleDeg).toBeCloseTo(18.4349488229, 9);
  });

  it('keeps zero overhang and ridge deductions explicit', () => {
    const { result } = calculateHipRafter(spec());
    expect(result.tailPlanRunMm).toBe(0);
    expect(result.tailLineLengthMm).toBe(0);
    expect(result.ridgePlanDeductionMm).toBe(0);
    expect(result.ridgeAxisDeductionMm).toBe(0);
    expect(result.lineLengthToRidgeFaceMm).toBe(result.theoreticalLineLengthMm);
  });

  it('adds a diagonal tail and deducts the physical ridge face along the hip axis', () => {
    const { result, fabrication } = calculateHipRafter(
      spec({ overhangMm: 500, ridgeThicknessMm: 40 }),
    );
    expect(result.tailPlanRunMm).toBeCloseTo(500 * Math.SQRT2, 12);
    expect(result.tailLineLengthMm).toBeCloseTo(
      500 * Math.sqrt(2 + Math.tan(Math.PI / 6) ** 2),
      12,
    );
    expect(result.ridgePlanDeductionMm).toBeCloseTo(40 / Math.SQRT2, 12);
    expect(result.ridgeAxisDeductionMm).toBeCloseTo(
      result.ridgePlanDeductionMm /
        Math.cos((result.hipSlopeDeg * Math.PI) / 180),
      12,
    );
    expect(result.outerEaveToRidgeFaceMm).toBeCloseTo(
      result.totalTheoreticalLineLengthMm - result.ridgeAxisDeductionMm,
      12,
    );
    expect(fabrication.ridgeFaceStationMm).toBe(result.outerEaveToRidgeFaceMm);
  });

  it.each([1, 80])('stays finite at supported pitch %s degrees', (pitchDeg) => {
    const output = calculateHipRafter(spec({ pitchDeg }));
    for (const value of Object.values(output.result)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it.each([
    { commonRunMm: 0 },
    { commonRunMm: Number.NaN },
    { pitchDeg: 0 },
    { pitchDeg: 81 },
    { overhangMm: -1 },
    { ridgeThicknessMm: -1 },
    { ridgeThicknessMm: 2000 },
    { section: { widthMm: 0, depthMm: 240 } },
    { section: { widthMm: 80, depthMm: 0 } },
  ])('rejects invalid input %#', (override) => {
    expect(() => calculateHipRafter(spec(override))).toThrow();
  });
});
