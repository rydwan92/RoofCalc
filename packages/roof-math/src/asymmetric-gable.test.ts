import { describe, expect, it } from 'vitest';
import type { AsymmetricGableRoofTemplateSpec } from '@cieslacalc/timber-model';
import { assemblyDefaults } from './assembly';
import {
  asymmetricGableGeometry,
  asymmetricGableRoofTemplateSchema,
  asymmetricGableSeatRefusal,
  asymmetricGableTemplateFromAssembly,
  assemblyFromAsymmetricGableTemplate,
} from './asymmetric-gable';
import {
  gableTemplateFromAssembly,
  resolveGableRoofTemplate,
} from './gable-roof';
import { resolveRoofSurfaceGeometry } from './roof-surface';
import {
  convertRoofTemplate,
  createRoofSkeleton,
  resolveRoofTemplate,
  roofTemplateFrameMm,
  roofTemplateSchema,
  roofTemplateSpanMm,
} from './roof-template';
import { resolveRoofFeatureTopology } from './roof-topology';

const deg = (rad: number) => (rad * 180) / Math.PI;
const base = gableTemplateFromAssembly(assemblyDefaults, {
  id: 'template:gable-1',
  buildingLengthMm: 10_000,
  rafterSpacing: { mode: 'max-even-spacing', spacingMm: 900 },
});
/** A1 of docs/domain/ASYMMETRIC_GABLE.md: 8 m span, 45° and atan(3/5). */
const a1 = (
  change: Partial<AsymmetricGableRoofTemplateSpec> = {},
): AsymmetricGableRoofTemplateSpec => ({
  id: 'template:asymmetric-gable-1',
  type: 'asymmetric-gable',
  buildingLengthMm: 10_000,
  spanMm: 8000,
  pitchDeg: 45,
  rightPitchDeg: deg(Math.atan(3 / 5)),
  eaveOverhangMm: 500,
  rafterSpacing: { mode: 'max-even-spacing', spacingMm: 900 },
  rafterSection: { widthMm: 80, depthMm: 200 },
  wallPlate: {
    ...base.wallPlate,
    section: { widthMm: 140, heightMm: 140 },
    joint: { kind: 'seat-notch', control: 'seat', valueMm: 100 },
  },
  ridge: { ...base.ridge, thicknessMm: 40 },
  ...change,
});

describe('asymmetric gable (VNext-9)', () => {
  it('A1: the ridge, the equal heel height and the right seat', () => {
    const geometry = asymmetricGableGeometry(a1());
    expect(geometry.leftRunMm).toBeCloseTo(3000, 9);
    expect(geometry.rightRunMm).toBeCloseTo(5000, 9);
    expect(geometry.ridgeHeightMm).toBeCloseTo(3000, 9);
    expect(geometry.heelHeightMm).toBeCloseTo(200 * Math.SQRT2 - 100, 9);
    expect(geometry.rightSeatMm).toBeCloseTo(83.99227, 4);
    const resolved = resolveRoofTemplate(a1());
    if (!('rightCalculation' in resolved)) throw new Error('two rafters');
    const [left] = resolved.calculation.assembly.joints;
    const [right] = resolved.rightCalculation.assembly.joints;
    expect(left!.normalDepthMm).toBeCloseTo(70.71068, 4);
    expect(right!.normalDepthMm).toBeCloseTo(43.21367, 4);
    // (10 000 − 80) / 900 = 11.02 → 12 gaps, 13 stations per side.
    expect(resolved.memberPrototypes.map((p) => [p.code, p.count])).toEqual([
      ['K1', 13],
      ['K2', 13],
    ]);
  });

  it('A1: the rafter tops meet at one height over the ridge axis', () => {
    // Top over the ridge = ridge height + heel height on both sides.
    const geometry = asymmetricGableGeometry(a1());
    const top = (pitchDeg: number, seat: number, run: number) => {
      const t = Math.tan((pitchDeg * Math.PI) / 180);
      return run * t + 200 / Math.cos((pitchDeg * Math.PI) / 180) - seat * t;
    };
    expect(top(45, 100, geometry.leftRunMm)).toBeCloseTo(
      top(a1().rightPitchDeg, geometry.rightSeatMm, geometry.rightRunMm),
      9,
    );
  });

  it('A1: two planes of their own pitch and area, one ridge line', () => {
    const surface = resolveRoofSurfaceGeometry({
      template: a1(),
      features: [],
    });
    expect(surface.planes.map((plane) => plane.grossAreaMm2 / 1e6)).toEqual([
      expect.closeTo(49.497475, 5),
      expect.closeTo(64.140471, 5),
    ]);
    const kinds = resolveRoofFeatureTopology(surface).features.map(
      (feature) => feature.kind,
    );
    expect(kinds.filter((kind) => kind === 'ridge')).toHaveLength(1);
    expect(kinds.filter((kind) => kind === 'eave')).toHaveLength(2);
    expect(roofTemplateFrameMm(a1())).toEqual({
      leftMm: expect.closeTo(-3000, 9),
      rightMm: expect.closeTo(5000, 9),
    });
    expect(roofTemplateSpanMm(a1())).toBe(8000);
  });

  it('A2: equal pitches are exactly the gable', () => {
    const gable = {
      ...base,
      halfRunMm: 4000,
      pitchDeg: 35,
      eaveOverhangMm: 500,
    };
    const asymmetric = convertRoofTemplate(gable, 'asymmetric-gable');
    expect(asymmetric.rightPitchDeg).toBe(35);
    const resolved = resolveRoofTemplate(asymmetric);
    const reference = resolveGableRoofTemplate(gable);
    if (!('rightCalculation' in resolved)) throw new Error('two rafters');
    expect(resolved.calculation.plan).toEqual(reference.calculation.plan);
    expect(resolved.rightCalculation.plan.minimumStockLengthMm).toBeCloseTo(
      reference.calculation.plan.minimumStockLengthMm,
      9,
    );
    expect(asymmetricGableGeometry(asymmetric).rightSeatMm).toBeCloseTo(
      asymmetricGableGeometry(asymmetric).leftSeatMm,
      9,
    );
    expect(convertRoofTemplate(asymmetric, 'gable')).toMatchObject({
      type: 'gable',
      halfRunMm: 4000,
      pitchDeg: 35,
    });
  });

  it('A3, A4: a right seat the plate cannot take is refused at the seat', () => {
    const issues = (value: AsymmetricGableRoofTemplateSpec) =>
      asymmetricGableRoofTemplateSchema
        .safeParse(value)
        .error?.issues.map((issue) => [issue.path.join('.'), issue.message]);
    expect(issues(a1())).toBeUndefined();
    expect(
      issues(
        a1({
          pitchDeg: 20,
          rightPitchDeg: 60,
          wallPlate: {
            ...a1().wallPlate,
            section: { widthMm: 120, heightMm: 140 },
          },
        }),
      ),
    ).toEqual([['wallPlate.joint.valueMm', 'right_seat_exceeds_plate']]);
    expect(issues(a1({ pitchDeg: 60, rightPitchDeg: 20 }))).toEqual([
      ['wallPlate.joint.valueMm', 'right_seat_not_positive'],
    ]);
    expect(roofTemplateSchema.safeParse(a1()).success).toBe(true);
    // The same code from the one helper the UI names it with.
    expect(asymmetricGableSeatRefusal(a1())).toBeUndefined();
    expect(
      asymmetricGableSeatRefusal(a1({ pitchDeg: 60, rightPitchDeg: 20 })),
    ).toBe('right_seat_not_positive');
  });

  it('draws K2 rafters as their own family and edits round-trip', () => {
    const skeleton = createRoofSkeleton(a1());
    const rafters = skeleton.members.filter(
      (member) => member.kind === 'rafter',
    );
    expect(rafters.filter((member) => member.familyCode === 'K2')).toHaveLength(
      13,
    );
    expect(
      skeleton.members.filter((member) => member.kind === 'wall-plate'),
    ).toHaveLength(2);
    const current = a1();
    expect(
      asymmetricGableTemplateFromAssembly(
        assemblyFromAsymmetricGableTemplate(current),
        current,
      ).spanMm,
    ).toBeCloseTo(8000, 9);
    // A longer left run moves the ridge and keeps the right pitch.
    const assembly = assemblyFromAsymmetricGableTemplate(current);
    assembly.roof.runMm = 3600;
    expect(
      asymmetricGableTemplateFromAssembly(assembly, current),
    ).toMatchObject({ spanMm: expect.closeTo(9600, 6), pitchDeg: 45 });
    // A new left pitch keeps the building and moves the ridge.
    const steeper = assemblyFromAsymmetricGableTemplate(current);
    steeper.roof.pitchDeg = 40;
    const edited = asymmetricGableTemplateFromAssembly(steeper, current);
    expect(edited).toMatchObject({ spanMm: 8000, pitchDeg: 40 });
    expect(asymmetricGableGeometry(edited).leftRunMm).toBeCloseTo(
      (8000 * 0.6) / (Math.tan((40 * Math.PI) / 180) + 0.6),
      6,
    );
  });
});
