import { describe, expect, it } from 'vitest';
import type { GableRoofTemplateSpec } from '@cieslacalc/timber-model';
import { assemblyDefaults, calculateAssembly } from './assembly';
import {
  assemblyFromGableTemplate,
  createGableRoofSkeleton,
  resolveGableRoofTemplate,
  resolveRafterSpacing,
} from './gable-roof';

function template(): GableRoofTemplateSpec {
  return {
    id: 'template:gable-1',
    type: 'gable',
    buildingLengthMm: 8100,
    halfRunMm: 4000,
    pitchDeg: 35,
    eaveOverhangMm: 500,
    rafterSpacing: { mode: 'fit-evenly', spacingMm: 800 },
    rafterSection: { ...assemblyDefaults.member.section },
    wallPlate: structuredClone(assemblyDefaults.supports[0]!),
    ridge: { ...assemblyDefaults.ridge },
    intermediateSupports: [],
  };
}

describe('gable roof template', () => {
  it('equalizes stations between both building ends in fit-evenly mode', () => {
    const spacing = resolveRafterSpacing(8100, {
      mode: 'fit-evenly',
      spacingMm: 800,
    });
    expect(spacing.bayCount).toBe(11);
    expect(spacing.actualSpacingMm).toBeCloseTo(8100 / 11, 10);
    expect(spacing.stations.map((station) => station.alongBuildingMm)).toEqual([
      0,
      ...Array.from({ length: 10 }, (_, index) => ((index + 1) * 8100) / 11),
      8100,
    ]);
  });

  it('preserves fixed modules and reports a final partial bay', () => {
    const spacing = resolveRafterSpacing(2500, {
      mode: 'fixed-spacing',
      spacingMm: 800,
    });
    expect(spacing.stations.map((station) => station.alongBuildingMm)).toEqual([
      0, 800, 1600, 2400, 2500,
    ]);
    expect(spacing.actualSpacingMm).toBe(800);
    expect(spacing.endBaySpacingMm).toBe(100);
  });

  it('uses one cross-section assembly while pitch updates rise and fabrication', () => {
    const before = template();
    const first = resolveGableRoofTemplate(before);
    const direct = calculateAssembly(assemblyFromGableTemplate(before));
    expect(first.calculation).toEqual(direct);
    expect(first.ridgeHeightMm).toBeCloseTo(4000 * Math.tan((35 * Math.PI) / 180), 10);

    const changed = { ...before, pitchDeg: 42 };
    const next = resolveGableRoofTemplate(changed);
    expect(next.ridgeHeightMm).toBeGreaterThan(first.ridgeHeightMm);
    expect(next.calculation.plan.minimumStockLengthMm).toBeGreaterThan(
      first.calculation.plan.minimumStockLengthMm,
    );
    expect(next.rafterSpacing).toEqual(first.rafterSpacing);
  });

  it('derives repeated rafters and purlin lines from the same template', () => {
    const spec = template();
    spec.intermediateSupports = [
      {
        ...structuredClone(spec.wallPlate),
        id: 'support:purlin-1',
        kind: 'purlin',
        placement: { mode: 'horizontal-from-wall', xMm: 1800 },
      },
    ];
    const skeleton = createGableRoofSkeleton(spec);
    expect(skeleton.members.filter((member) => member.kind === 'rafter')).toHaveLength(
      24,
    );
    expect(skeleton.members.filter((member) => member.kind === 'purlin')).toHaveLength(
      2,
    );
    expect(skeleton.members.find((member) => member.kind === 'ridge')?.from.z).toBeCloseTo(
      skeleton.ridgeHeightMm,
      10,
    );
    expect(
      skeleton.members.find((member) => member.id === 'skeleton:support:purlin-1:left')
        ?.from.z,
    ).toBeCloseTo(1800 * Math.tan((35 * Math.PI) / 180), 10);
  });
});