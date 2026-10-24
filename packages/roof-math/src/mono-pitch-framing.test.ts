import { describe, expect, it } from 'vitest';
import {
  createMonoPitchSkeleton,
  MONO_PITCH_FRAMING_SCOPE,
  monoPitchFramingSpecSchema,
  monoPitchFromPlateTops,
  resolveMonoPitchFraming,
  type MonoPitchFramingSpec,
} from './mono-pitch-framing';
import { assemblyDefaults, calculateAssembly } from './assembly';
import {
  resolveMonoPitchBattens,
  resolveMonoPitchCounterBattens,
  resolveMonoPitchMembrane,
} from './mono-pitch-layers';

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

describe('mono-pitch skeleton in world XYZ (VNext-7B-2)', () => {
  const framing = resolveMonoPitchFraming(F1);
  const skeleton = createMonoPitchSkeleton(framing);
  const tan15 = 2 - Math.sqrt(3);
  const length = (m: { from: Point; to: Point }) =>
    Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y, m.to.z - m.from.z);
  type Point = { x: number; y: number; z: number };

  it('holds two plates and one rafter per station, as the gable skeleton does', () => {
    expect(skeleton.members.map((member) => member.kind)).toEqual([
      'wall-plate',
      'wall-plate',
      ...Array.from({ length: 8 }, () => 'rafter'),
    ]);
    const rafters = skeleton.members.filter((m) => m.kind === 'rafter');
    expect(rafters.map((m) => m.id)).toEqual(
      framing.memberPrototypes[0]!.instanceIds,
    );
    expect(new Set(skeleton.members.map((m) => m.id)).size).toBe(
      skeleton.members.length,
    );
  });

  it('draws each rafter on the reference plane between its plumb ends', () => {
    for (const rafter of skeleton.members.filter((m) => m.kind === 'rafter')) {
      expect(length(rafter)).toBeCloseTo(
        framing.calculation.assembly.member.referenceLengthMm,
        6,
      );
      expect(rafter.from).toMatchObject({
        x: -500,
        z: expect.closeTo(-500 * tan15, 9),
      });
      expect(rafter.to).toMatchObject({
        x: 4300,
        z: expect.closeTo(4300 * tan15, 9),
      });
    }
    expect(skeleton.ridgeHeightMm).toBeCloseTo(4300 * tan15, 9);
  });

  it('runs the plates along the building at their outer faces and seat levels', () => {
    const [low, high] = skeleton.members;
    expect(low!.from).toEqual({ x: 0, y: 0, z: 0 });
    expect(length(low!)).toBe(6000);
    expect(high!.from.x).toBe(4000);
    expect(high!.from.z).toBeCloseTo(1034.283883, 5);
    expect(high!.section).toEqual({ widthMm: 140, depthMm: 140 });
  });

  it('guides the roof plane with the surface polygon itself', () => {
    expect(skeleton.guides![0]!.points).toEqual(
      framing.surface.planes[0].worldPolygon,
    );
  });
});

describe('counter-battens and membrane on the mono-pitch roof (VNext-7B-2)', () => {
  const framing = resolveMonoPitchFraming(F1);
  const skeleton = createMonoPitchSkeleton(framing);
  const slope = framing.surface.planes[0].slopeLengthMm;

  it('runs one counter-batten along every rafter over the whole slope', () => {
    const counter = resolveMonoPitchCounterBattens(framing, skeleton, {
      enabled: true,
      widthMm: 50,
      heightMm: 25,
    });
    expect(counter.status).toBe('resolved');
    expect(counter.rows).toHaveLength(8);
    for (const row of counter.rows)
      expect(row.visibleLengthMm).toBeCloseTo(slope, 6);
    expect(counter.totalVisibleLengthMm).toBeCloseTo(8 * slope, 6);
    expect(counter.rows.map((row) => row.sourceMemberId)).toEqual(
      framing.memberPrototypes[0]!.instanceIds,
    );
  });

  it('reports a bad section or a foreign plane instead of guessing', () => {
    expect(
      resolveMonoPitchCounterBattens(framing, skeleton, {
        enabled: true,
        widthMm: 0,
        heightMm: 25,
      }).issues,
    ).toEqual([{ code: 'invalid-counter-batten-section' }]);
    expect(
      resolveMonoPitchCounterBattens(framing, skeleton, {
        enabled: true,
        widthMm: 50,
        heightMm: 25,
        roofPlaneIds: ['roof-plane:left'],
      }).issues,
    ).toEqual([{ code: 'unknown-roof-plane', roofPlaneId: 'roof-plane:left' }]);
    expect(
      resolveMonoPitchCounterBattens(framing, skeleton, {
        enabled: false,
        widthMm: 50,
        heightMm: 25,
      }).status,
    ).toBe('disabled');
  });

  it('lays membrane courses by the same course fit as on a gable', () => {
    // 1500 mm roll, 100 mm lap: 4 courses cover 4·1500 − 3·100 = 5700 mm
    // ≥ 4969.33 mm; each course runs the 6600 mm plane width.
    const membrane = resolveMonoPitchMembrane(
      framing.surface,
      { enabled: true },
      { rollWidthMm: 1500, rollLengthMm: 50_000, minimumOverlapMm: 100 },
    );
    expect(membrane.status).toBe('resolved');
    expect(membrane.courseCount).toBe(4);
    expect(membrane.overlapAreaMm2).toBeCloseTo(3 * 100 * 6600, 6);
    expect(membrane.grossAreaMm2).toBeCloseTo(4 * 1500 * 6600, 6);
    expect(membrane.ridgeOverrunAreaMm2).toBeCloseTo((5700 - slope) * 6600, 3);
  });
});

describe('mono-pitch with an intermediate purlin (VNext-7B-5)', () => {
  // F3 = F1 + a 100 × 160 purlin at x = 2000 mm with a 60 mm seat:
  // heel (2000 + 500) / cos 15° = 2588.190 mm, notch 60 · sin 15° =
  // 15.529 mm, seat (2000 + 60 − 100) · tan 15° = 525.180 mm above the
  // low plate top.
  const F3: MonoPitchFramingSpec = {
    ...F1,
    intermediateSupports: [
      { positionMm: 2000, widthMm: 100, heightMm: 160, seatMm: 60 },
    ],
  };
  const framing = resolveMonoPitchFraming(F3);
  const { assembly, plan } = framing.calculation;

  it('notches the rafter on the purlin by the same rule as on the plates', () => {
    expect(assembly.joints).toHaveLength(3);
    const purlinJoint = assembly.joints[1]!;
    expect(purlinJoint.stationMm).toBeCloseTo(2588.190451, 5);
    expect(purlinJoint.normalDepthMm).toBeCloseTo(15.529143, 5);
    expect(purlinJoint.remainingDepthMm).toBeCloseTo(184.470857, 5);
    expect(assembly.supports.map((support) => support.kind)).toEqual([
      'wall-plate',
      'purlin',
      'wall-plate',
    ]);
    // Three birdsmouths, three marking groups, then the top plumb end.
    expect(
      plan.steps.filter((step) => step.action === 'mark-seat'),
    ).toHaveLength(3);
  });

  it('leaves the rafter length and the plates unchanged', () => {
    const plain = resolveMonoPitchFraming(F1);
    expect(plan.minimumStockLengthMm).toBeCloseTo(
      plain.calculation.plan.minimumStockLengthMm,
      9,
    );
    expect(framing.plates).toEqual(plain.plates);
  });

  it('reports the purlin seat level and draws it along the building', () => {
    expect(framing.purlins).toEqual([
      {
        id: 'support:purlin-1',
        positionMm: 2000,
        seatTopMm: expect.closeTo(525.180417, 5),
      },
    ]);
    const purlin = createMonoPitchSkeleton(framing).members.find(
      (member) => member.kind === 'purlin',
    )!;
    expect(purlin.from).toEqual({
      x: 2000,
      y: 0,
      z: expect.closeTo(525.180417, 5),
    });
    expect(purlin.to.y).toBe(6000);
    expect(purlin.section).toEqual({ widthMm: 100, depthMm: 160 });
  });

  it('numbers purlins along the slope whatever order they were entered in', () => {
    const two = resolveMonoPitchFraming({
      ...F1,
      intermediateSupports: [
        { positionMm: 3000, widthMm: 100, heightMm: 160, seatMm: 60 },
        { positionMm: 1500, widthMm: 100, heightMm: 160, seatMm: 60 },
      ],
    });
    expect(two.purlins.map((p) => [p.id, p.positionMm])).toEqual([
      ['support:purlin-1', 1500],
      ['support:purlin-2', 3000],
    ]);
  });

  it('refuses a purlin outside the span, on a plate or on another purlin', () => {
    const issues = (purlins: MonoPitchFramingSpec['intermediateSupports']) => {
      const result = monoPitchFramingSpecSchema.safeParse({
        ...F1,
        intermediateSupports: purlins,
      });
      return result.success ? [] : result.error.issues.map((i) => i.message);
    };
    const purlin = {
      positionMm: 2000,
      widthMm: 100,
      heightMm: 160,
      seatMm: 60,
    };
    expect(issues([{ ...purlin, positionMm: 100 }])).toEqual([
      'support_outside_span',
    ]);
    expect(issues([{ ...purlin, positionMm: 3800 }])).toEqual([
      'support_outside_span',
    ]);
    expect(issues([purlin, { ...purlin, positionMm: 2050 }])).toEqual([
      'supports_overlap',
    ]);
    expect(issues([{ ...purlin, seatMm: 120 }])).toEqual([
      'seat_exceeds_support',
    ]);
  });
});
