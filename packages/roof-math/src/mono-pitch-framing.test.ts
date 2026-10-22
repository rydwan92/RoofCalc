import { describe, expect, it } from 'vitest';
import {
  MONO_PITCH_FRAMING_SCOPE,
  monoPitchFramingSpecSchema,
  monoPitchFromPlateTops,
  resolveMonoPitchFraming,
  type MonoPitchFramingSpec,
} from './mono-pitch-framing';
import { assemblyDefaults, calculateAssembly } from './assembly';
import { resolveMonoPitchBattens } from './mono-pitch-roof';

/**
 * Reference vectors from docs/domain/MONO_PITCH_ROOF.md §8, derived with
 * plain trigonometry independently of the solver: top edge between the two
 * plumb cuts = (x_end + e_low)/cos α, stock = that + d·tan α, heel station
 * = (x_heel + e_low)/cos α, notch depth = s·sin α, plate difference =
 * (R − w_high + s_high − s_low)·tan α.
 */
const F1: MonoPitchFramingSpec = {
  roof: {
    type: 'mono-pitch',
    id: 'template:lean-to',
    buildingLengthMm: 6000,
    runMm: 4000,
    pitchDeg: 15,
    lowEaveOverhangMm: 500,
    topEdge: 'free',
    highOverhangMm: 300,
    vergeOverhangMm: 300,
  },
  rafter: {
    section: { widthMm: 80, depthMm: 200 },
    spacing: { mode: 'max-even-spacing', spacingMm: 900 },
  },
  lowSupport: { kind: 'wall-plate', widthMm: 140, heightMm: 140, seatMm: 100 },
  highSupport: { kind: 'wall-plate', widthMm: 140, heightMm: 140, seatMm: 100 },
};

const F2: MonoPitchFramingSpec = {
  roof: {
    type: 'mono-pitch',
    id: 'template:lean-to-abutment',
    buildingLengthMm: 5000,
    runMm: 3000,
    pitchDeg: 10,
    lowEaveOverhangMm: 400,
    topEdge: 'abutment',
    highOverhangMm: 0,
    vergeOverhangMm: 0,
  },
  rafter: {
    section: { widthMm: 60, depthMm: 180 },
    spacing: { mode: 'max-even-spacing', spacingMm: 800 },
  },
  lowSupport: { kind: 'wall-plate', widthMm: 120, heightMm: 120, seatMm: 80 },
  highSupport: { kind: 'ledger', widthMm: 60, heightMm: 160, seatMm: 50 },
};

describe('mono-pitch framing F1 — free top edge, two wall plates', () => {
  const framing = resolveMonoPitchFraming(F1);
  const { assembly, plan } = framing.calculation;

  it('cuts one common rafter between two plumb ends', () => {
    expect(assembly.member.referenceLengthMm).toBeCloseTo(4969.325666, 5);
    expect(plan.minimumStockLengthMm).toBeCloseTo(5022.915504, 5);
    expect(assembly.endCuts.map((cut) => [cut.id, cut.end])).toEqual([
      ['cut:eave', 'eave'],
      ['cut:top', 'top'],
    ]);
    for (const cut of assembly.endCuts)
      expect(cut.angleToMemberDeg).toBeCloseTo(75, 12);
  });

  it('notches a birdsmouth on each plate at its downslope face', () => {
    const [low, high] = assembly.joints;
    expect(low!.stationMm).toBeCloseTo(517.63809, 5);
    expect(high!.stationMm).toBeCloseTo(4513.804147, 5);
    expect(low!.normalDepthMm).toBeCloseTo(25.881905, 5);
    expect(low!.remainingDepthMm).toBeCloseTo(174.118095, 5);
    expect(high!.normalDepthMm).toBeCloseTo(25.881905, 5);
  });

  it('says how much higher the high wall plate sits — and inverts it', () => {
    expect(framing.plates.lowTopMm).toBe(0);
    expect(framing.plates.differenceMm).toBeCloseTo(1034.283883, 5);
    expect(
      monoPitchFromPlateTops({
        lowTopMm: 0,
        highTopMm: framing.plates.highTopMm,
        runMm: 4000,
        lowSeatMm: 100,
        highSeatMm: 100,
        highSupportWidthMm: 140,
      }),
    ).toBeCloseTo(15, 9);
  });

  it('agrees with the surface: same slope length between the same plan lines', () => {
    expect(framing.surface.planes[0].slopeLengthMm).toBeCloseTo(
      assembly.member.referenceLengthMm,
      6,
    );
  });

  it('marks every operation from one datum, ending at the top plumb end', () => {
    const last = plan.steps.at(-1)!;
    expect(last).toMatchObject({
      action: 'mark-plumb',
      operationId: 'cut:top',
      target: 'datum:top-end',
    });
    expect(
      plan.steps.filter((step) => step.action === 'mark-seat'),
    ).toHaveLength(2);
    expect(assembly.supports.map((support) => support.kind)).toEqual([
      'wall-plate',
      'wall-plate',
    ]);
  });

  it('lays out one shared K1 prototype along the building', () => {
    expect(framing.rafterSpacing.stationCount).toBe(8);
    expect(framing.rafterSpacing.actualSpacingMm).toBeCloseTo(6000 / 7, 9);
    expect(framing.memberPrototypes).toEqual([
      expect.objectContaining({
        code: 'K1',
        kind: 'common-rafter',
        count: 8,
        fabricationMode: 'shared',
      }),
    ]);
  });

  it('claims framing and marking, never a structural check or covering', () => {
    expect(framing.scope).toBe(MONO_PITCH_FRAMING_SCOPE);
    expect(MONO_PITCH_FRAMING_SCOPE).toMatchObject({
      framing: 'supported',
      fabrication: 'supported',
      covering: 'not-supported',
      drainage: 'not-supported',
      structuralCheck: 'not-checked',
    });
  });
});

describe('mono-pitch framing F2 — against a higher wall on a ledger', () => {
  const framing = resolveMonoPitchFraming(F2);
  const { assembly, plan } = framing.calculation;

  it('ends the rafter plumb at the wall face', () => {
    expect(framing.topEndXmm).toBe(3000);
    expect(assembly.member.referenceLengthMm).toBeCloseTo(3452.45048, 5);
    expect(plan.minimumStockLengthMm).toBeCloseTo(3484.189337, 5);
  });

  it('seats the rafter on the ledger and reports the wall step', () => {
    const [low, high] = assembly.joints;
    expect(low!.normalDepthMm).toBeCloseTo(13.891854, 5);
    expect(low!.remainingDepthMm).toBeCloseTo(166.108146, 5);
    expect(high!.normalDepthMm).toBeCloseTo(8.682409, 5);
    expect(high!.stationMm).toBeCloseTo(3391.524884, 5);
    expect(framing.plates.differenceMm).toBeCloseTo(513.111514, 5);
  });
});

describe('mono-pitch framing validation', () => {
  const issues = (spec: unknown) => {
    const result = monoPitchFramingSpecSchema.safeParse(spec);
    return result.success ? [] : result.error.issues.map((i) => i.message);
  };

  it('requires a ledger for an abutment and a wall plate for a free top', () => {
    expect(
      issues({ ...F2, highSupport: { ...F2.highSupport, kind: 'wall-plate' } }),
    ).toContain('abutment_needs_ledger');
    expect(
      issues({ ...F1, highSupport: { ...F1.highSupport, kind: 'ledger' } }),
    ).toContain('ledger_needs_abutment');
  });

  it('rejects a seat wider than its plate, a notch through the rafter and overlapping supports', () => {
    expect(
      issues({ ...F1, lowSupport: { ...F1.lowSupport, seatMm: 150 } }),
    ).toContain('seat_exceeds_support');
    expect(
      issues({
        ...F1,
        rafter: { ...F1.rafter, section: { widthMm: 80, depthMm: 20 } },
      }),
    ).toContain('notch_consumes_depth');
    expect(
      issues({
        ...F1,
        roof: { ...F1.roof, runMm: 250 },
      }),
    ).toContain('supports_overlap');
  });

  it('refuses a pitch from plate tops that do not rise or cannot exist', () => {
    const base = {
      lowTopMm: 0,
      runMm: 4000,
      lowSeatMm: 100,
      highSeatMm: 100,
      highSupportWidthMm: 140,
    };
    expect(() => monoPitchFromPlateTops({ ...base, highTopMm: 0 })).toThrow(
      'not_rising',
    );
    expect(() => monoPitchFromPlateTops({ ...base, highTopMm: 10 })).toThrow(
      'pitch_out_of_range',
    );
  });
});

describe('the shared rafter solver is unchanged for a gable', () => {
  it('still ends at the ridge face with the same marking target', () => {
    const { assembly, plan } = calculateAssembly(assemblyDefaults);
    expect(assembly.endCuts.map((cut) => cut.end)).toEqual(['eave', 'ridge']);
    expect(plan.steps.at(-1)).toMatchObject({
      operationId: 'cut:ridge',
      target: 'datum:ridge-face',
    });
    expect(assembly.supports.at(-1)!.kind).toBe('ridge');
  });
});

describe('battens on the mono-pitch plane (VNext-7B)', () => {
  // Slope 4969.326 mm; first course 50 mm above the eave, last at most
  // 40 mm below the top edge, gauge 350 → floor(4879.326 / 350) + 1 = 14
  // courses, each across the full 6600 mm plane.
  const surface = resolveMonoPitchFraming(F1).surface;
  const layout = {
    enabled: true,
    mode: 'manual' as const,
    battenWidthMm: 50,
    battenHeightMm: 30,
    gaugeMm: 350,
    eaveOffsetMm: 50,
    ridgeOffsetMm: 40,
  };

  it('places courses by the same engine as on a gable', () => {
    const battens = resolveMonoPitchBattens(surface, layout);
    expect(battens.status).toBe('resolved');
    expect(battens.planes[0]!.courseCount).toBe(14);
    expect(battens.totalLengthMm).toBeCloseTo(14 * 6600, 6);
    expect(battens.planes[0]!.stations.at(-1)).toBeCloseTo(50 + 13 * 350, 9);
  });

  it('reports an impossible span instead of inventing courses', () => {
    const battens = resolveMonoPitchBattens(surface, {
      ...layout,
      eaveOffsetMm: 4000,
      ridgeOffsetMm: 1000,
    });
    expect(battens.status).toBe('incomplete');
    expect(battens.issues).toEqual(['invalid-regular-span']);
  });
});
