import { describe, expect, it } from 'vitest';
import type { HipRoofTemplateSpec } from '@cieslacalc/timber-model';
import { assemblyDefaults } from './assembly';
import {
  createGableRoofSkeleton,
  gableTemplateFromAssembly,
  resolveGableRoofTemplate,
} from './gable-roof';
import {
  HIP_RAFTER_PROTOTYPE_ID,
  createHipRoofSkeleton,
  hipRoofTemplateSchema,
  resolveHipRoofTemplate,
} from './hip-roof';
import {
  convertRoofTemplate,
  createRoofSkeleton,
  resolveRoofTemplate,
  roofTemplateSchema,
} from './roof-template';

function template(
  overrides: Partial<HipRoofTemplateSpec> = {},
): HipRoofTemplateSpec {
  const common = gableTemplateFromAssembly(assemblyDefaults);
  return {
    ...common,
    id: 'template:hip-1',
    type: 'hip',
    buildingLengthMm: 10000,
    hipRafterSection: { widthMm: 100, depthMm: 240 },
    ...overrides,
  };
}

describe('regular hip roof template', () => {
  it('uses a discriminated roof-template union without changing the gable result', () => {
    const gable = gableTemplateFromAssembly(assemblyDefaults);
    expect(roofTemplateSchema.parse(gable).type).toBe('gable');
    expect(roofTemplateSchema.parse(template()).type).toBe('hip');
    const direct = resolveGableRoofTemplate(gable);
    const generic = resolveRoofTemplate(gable);
    expect(generic.calculation.plan.minimumStockLengthMm).toBe(
      direct.calculation.plan.minimumStockLengthMm,
    );
    expect(createRoofSkeleton(gable)).toEqual(createGableRoofSkeleton(gable));
  });

  it('resolves the ridge length and four exact hip axes for a rectangle', () => {
    const output = resolveHipRoofTemplate(template());
    expect(output.ridgeLengthMm).toBe(2000);
    expect(output.commonRafterRegion).toEqual({
      fromYmm: 4000,
      toYmm: 6000,
      lengthMm: 2000,
    });
    expect(output.hipAxes).toHaveLength(4);
    expect(new Set(output.hipAxes.map((axis) => axis.id)).size).toBe(4);
    expect(output.hipAxes[0]!.to).toEqual(output.ridgeStart);
    expect(output.hipAxes[1]!.to).toEqual(output.ridgeStart);
    expect(output.hipAxes[2]!.to).toEqual(output.ridgeEnd);
    expect(output.hipAxes[3]!.to).toEqual(output.ridgeEnd);
  });

  it('collapses a square footprint to one apex and no ridge solid', () => {
    const square = template({ buildingLengthMm: 8000 });
    const output = resolveHipRoofTemplate(square);
    const skeleton = createHipRoofSkeleton(square);
    expect(output.ridgeLengthMm).toBe(0);
    expect(output.ridgeStart).toEqual(output.ridgeEnd);
    expect(output.rafterSpacing).toBeUndefined();
    expect(skeleton.members.some((member) => member.kind === 'ridge')).toBe(
      false,
    );
    expect(
      skeleton.members.filter((member) => member.kind === 'hip-rafter'),
    ).toHaveLength(4);
  });

  it('links four unique physical hips to one shared H1 prototype', () => {
    const skeleton = createHipRoofSkeleton(template());
    const hips = skeleton.members.filter(
      (member) => member.kind === 'hip-rafter',
    );
    expect(hips.map((member) => member.id)).toEqual([
      'instance:hip:front-left',
      'instance:hip:front-right',
      'instance:hip:rear-left',
      'instance:hip:rear-right',
    ]);
    expect(new Set(hips.map((member) => member.prototypeId))).toEqual(
      new Set([HIP_RAFTER_PROTOTYPE_ID]),
    );
    const resolved = resolveHipRoofTemplate(template());
    for (const hip of hips) {
      expect(hip.to).toEqual(
        resolved.hipAxes.find((axis) => axis.id === hip.id)!.to,
      );
    }
  });

  it('trims compatible long-slope purlins at the real hip boundaries', () => {
    const withPurlin = template({
      intermediateSupports: [
        {
          id: 'support:purlin-1',
          kind: 'purlin',
          section: { widthMm: 140, heightMm: 200 },
          placement: { mode: 'horizontal-from-wall', xMm: 2000 },
          joint: { kind: 'seat-notch', control: 'seat', valueMm: 100 },
        },
      ],
    });
    const purlins = createHipRoofSkeleton(withPurlin).members.filter(
      (member) => member.kind === 'purlin',
    );
    expect(purlins).toHaveLength(2);
    expect(purlins[0]!.from.y).toBe(2000);
    expect(purlins[0]!.to.y).toBe(8000);
    expect(purlins[1]!.from.y).toBe(2000);
    expect(purlins[1]!.to.y).toBe(8000);
  });

  it('keeps H1 cross-section geometry independent of building length', () => {
    const short = resolveHipRoofTemplate(template({ buildingLengthMm: 9000 }));
    const long = resolveHipRoofTemplate(template({ buildingLengthMm: 14000 }));
    expect(long.ridgeLengthMm).toBeGreaterThan(short.ridgeLengthMm);
    expect(long.hipRafter.result).toEqual(short.hipRafter.result);
  });

  it('updates both K1 and H1 from the same pitch and span state', () => {
    const before = resolveHipRoofTemplate(template());
    const pitched = resolveHipRoofTemplate(template({ pitchDeg: 42 }));
    expect(pitched.calculation.plan.referenceLengthMm).not.toBe(
      before.calculation.plan.referenceLengthMm,
    );
    expect(pitched.hipRafter.result.theoreticalLineLengthMm).not.toBe(
      before.hipRafter.result.theoreticalLineLengthMm,
    );
    const wider = resolveHipRoofTemplate(
      template({ halfRunMm: 4500, buildingLengthMm: 10000 }),
    );
    expect(wider.ridgeLengthMm).toBe(1000);
    expect(wider.hipRafter.result.planRunMm).toBeCloseTo(4500 * Math.SQRT2, 10);
  });

  it('preserves compatible values and initializes H1 explicitly when switching', () => {
    const gable = gableTemplateFromAssembly(assemblyDefaults, {
      id: 'template:gable-1',
      buildingLengthMm: 6000,
      rafterSpacing: { mode: 'fit-evenly', spacingMm: 700 },
    });
    const hip = convertRoofTemplate(gable, 'hip');
    expect(hip.type).toBe('hip');
    if (hip.type !== 'hip') throw new Error('expected hip template');
    expect(hip.halfRunMm).toBe(gable.halfRunMm);
    expect(hip.pitchDeg).toBe(gable.pitchDeg);
    expect(hip.eaveOverhangMm).toBe(gable.eaveOverhangMm);
    expect(hip.buildingLengthMm).toBe(gable.halfRunMm * 2);
    expect(hip.hipRafterSection).toEqual({ widthMm: 80, depthMm: 240 });
    const back = convertRoofTemplate(hip, 'gable');
    expect(back.type).toBe('gable');
    expect(back.halfRunMm).toBe(gable.halfRunMm);
  });

  it('rejects a building shorter than its full span', () => {
    expect(() =>
      hipRoofTemplateSchema.parse(template({ buildingLengthMm: 7999 })),
    ).toThrow(/hip_length_below_span/);
  });
});
