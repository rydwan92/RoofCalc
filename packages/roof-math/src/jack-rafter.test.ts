import { describe, expect, it } from 'vitest';
import type { JackRafterSpec } from '@cieslacalc/timber-model';
import { calculateJackRafter, jackRafterSchema } from './jack-rafter';

function spec(overrides: Partial<JackRafterSpec> = {}): JackRafterSpec {
  return {
    id: 'instance:jack:front-left:left:1',
    prototypeId: 'member:jack-rafter-J1',
    section: { widthMm: 80, depthMm: 200 },
    roofPlane: 'left',
    hipCorner: 'front-left',
    hipRafterInstanceId: 'instance:hip:front-left',
    ordinalFromCorner: 1,
    stationFromHipCornerMm: 800,
    commonRunMm: 4000,
    pitchDeg: 30,
    overhangMm: 500,
    wallJoint: {
      supportId: 'support:wall-plate-1',
      stationFromOuterEaveMm: 600,
      seatLengthMm: 100,
      normalDepthMm: 50,
      remainingDepthMm: 150,
    },
    hasIntermediateSupports: false,
    ...overrides,
  };
}

describe('regular hip jack-rafter geometry', () => {
  it('resolves exact slope length from the outer eave to the theoretical H1 center plane', () => {
    const output = calculateJackRafter(spec());
    expect(output.result.wallToHipCenterHorizontalRunMm).toBe(800);
    expect(output.result.outerEaveToHipCenterHorizontalRunMm).toBe(1300);
    expect(output.result.outerEaveToHipCenterLineLengthMm).toBeCloseTo(
      1300 / Math.cos(Math.PI / 6),
      10,
    );
    expect(output.result.riseFromOuterEaveMm).toBeCloseTo(
      1300 * Math.tan(Math.PI / 6),
      10,
    );
  });

  it('states every compound meeting reference without inventing an H1 face deduction', () => {
    const output = calculateJackRafter(spec());
    expect(output.result.plumbLineToMemberAxisDeg).toBe(60);
    expect(output.result.planCutLineToMemberAxisDeg).toBe(45);
    expect(output.result.topFaceCutLineToMemberAxisDeg).toBeCloseTo(
      (Math.atan(Math.cos(Math.PI / 6)) * 180) / Math.PI,
      10,
    );
    expect(output.fabrication.meetingCut.referencePlane).toBe(
      'vertical-hip-center-plane',
    );
    expect(output.fabrication.meetingCut.hipFaceDeduction).toBe('not-applied');
    expect(output.fabrication.wallJoint?.seatLengthMm).toBe(100);
  });

  it('gets strictly longer at successive valid stations approaching the common rafter', () => {
    const lengths = [600, 1200, 2400, 3600].map(
      (stationFromHipCornerMm) =>
        calculateJackRafter(spec({ stationFromHipCornerMm })).result
          .outerEaveToHipCenterLineLengthMm,
    );
    expect(lengths).toEqual([...lengths].sort((a, b) => a - b));
    expect(new Set(lengths).size).toBe(lengths.length);
  });

  it('makes pitch and overhang effects explicit and finite', () => {
    const low = calculateJackRafter(spec({ pitchDeg: 1, overhangMm: 0 }));
    const high = calculateJackRafter(spec({ pitchDeg: 80, overhangMm: 1000 }));
    for (const value of [
      ...Object.values(low.result),
      ...Object.values(high.result),
    ])
      expect(Number.isFinite(value)).toBe(true);
    expect(high.result.outerEaveToHipCenterLineLengthMm).toBeGreaterThan(
      low.result.outerEaveToHipCenterLineLengthMm,
    );
  });

  it('rejects endpoints and non-finite or out-of-run stations', () => {
    expect(() =>
      jackRafterSchema.parse(spec({ stationFromHipCornerMm: 0 })),
    ).toThrow();
    expect(() =>
      jackRafterSchema.parse(spec({ stationFromHipCornerMm: 4000 })),
    ).toThrow(/jack_station_must_be_between_hip_and_common/);
    expect(() =>
      jackRafterSchema.parse(spec({ stationFromHipCornerMm: Number.NaN })),
    ).toThrow();
  });

  it('flags unresolved intermediate-support joinery honestly', () => {
    const output = calculateJackRafter(spec({ hasIntermediateSupports: true }));
    expect(output.fabrication.intermediateSupportJoinery).toBe('not-resolved');
    expect(output.fabrication.allowanceAndKerf).toBe('not-included');
  });
});
