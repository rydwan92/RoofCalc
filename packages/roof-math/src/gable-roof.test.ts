import { describe, expect, it } from 'vitest';
import type { GableRoofTemplateSpec } from '@cieslacalc/timber-model';
import { assemblyDefaults, calculateAssembly } from './assembly';
import {
  assemblyFromGableTemplate,
  clampGableHalfRunMm,
  clampGablePitchDeg,
  createGableRoofSkeleton,
  gablePitchDegFromRidgeHeight,
  gableRidgeHeightMm,
  gableRoofTemplateSchema,
  gableTemplateFromAssembly,
  minimumGableHalfRunMm,
  resolveCollarTies,
  resolveGableRoofTemplate,
  resolveRafterSpacing,
  roofStructureSystem,
} from './gable-roof';

function template(): GableRoofTemplateSpec {
  return {
    id: 'template:gable-1',
    type: 'gable',
    buildingLengthMm: 8100,
    halfRunMm: 4000,
    pitchDeg: 35,
    eaveOverhangMm: 500,
    rafterSpacing: { mode: 'max-even-spacing', spacingMm: 800 },
    rafterSection: { ...assemblyDefaults.member.section },
    wallPlate: structuredClone(assemblyDefaults.supports[0]!),
    ridge: { ...assemblyDefaults.ridge },
    intermediateSupports: [],
  };
}

describe('gable roof template', () => {
  it('round-trips ridge height and pitch through pure constrained gable helpers', () => {
    const rise = gableRidgeHeightMm(4000, 35);
    expect(gablePitchDegFromRidgeHeight(4000, rise)).toBeCloseTo(35, 10);
    expect(clampGablePitchDeg(-10)).toBe(1);
    expect(clampGablePitchDeg(99)).toBe(80);
    expect(() => gablePitchDegFromRidgeHeight(4000, -1)).toThrow(
      'invalid_ridge_height',
    );
  });
  it('clamps half-run edits to the furthest support and ridge envelope', () => {
    const spec = template();
    spec.intermediateSupports = [
      {
        ...structuredClone(spec.wallPlate),
        id: 'support:purlin-1',
        kind: 'purlin',
        section: { widthMm: 160, heightMm: 180 },
        placement: { mode: 'horizontal-from-wall', xMm: 1800 },
      },
    ];
    expect(minimumGableHalfRunMm(spec)).toBe(1981);
    expect(clampGableHalfRunMm(spec, 100)).toBe(1981);
    expect(clampGableHalfRunMm(spec, 4200.5)).toBe(4200.5);
  });
  it('treats 940 / 800 as a maximum: two bays, three pairs and 470 mm actual spacing', () => {
    const spacing = resolveRafterSpacing(940, {
      mode: 'max-even-spacing',
      spacingMm: 800,
    });
    expect(spacing).toMatchObject({
      mode: 'max-even-spacing',
      requestedSpacingMm: 800,
      actualSpacingMm: 470,
      bayCount: 2,
      stationCount: 3,
    });
    expect(spacing.stations.map((station) => station.alongBuildingMm)).toEqual([
      0, 470, 940,
    ]);
  });

  it.each([
    [800, 1, 2, 800],
    [801, 2, 3, 400.5],
    [8100, 11, 12, 8100 / 11],
  ])(
    'keeps maximum-even spacing at or below 800 mm for L=%s',
    (buildingLengthMm, bayCount, stationCount, actualSpacingMm) => {
      const spacing = resolveRafterSpacing(buildingLengthMm, {
        mode: 'max-even-spacing',
        spacingMm: 800,
      });
      expect(spacing.bayCount).toBe(bayCount);
      expect(spacing.stationCount).toBe(stationCount);
      expect(spacing.actualSpacingMm).toBeCloseTo(actualSpacingMm, 10);
      expect(spacing.actualSpacingMm).toBeLessThanOrEqual(800);
    },
  );

  it('equalizes stations between both building ends in maximum-even mode', () => {
    const spacing = resolveRafterSpacing(8100, {
      mode: 'max-even-spacing',
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
      mode: 'fixed-module',
      spacingMm: 800,
      endPolicy: 'require-both-ends',
    });
    expect(spacing.stations.map((station) => station.alongBuildingMm)).toEqual([
      0, 800, 1600, 2400, 2500,
    ]);
    expect(spacing.actualSpacingMm).toBe(800);
    expect(spacing.endBaySpacingMm).toBe(100);
    expect(spacing.stationCount).toBe(5);
    expect(spacing.bayCount).toBe(4);
  });

  it('can keep a fixed-module end open and reports the remainder explicitly', () => {
    const spacing = resolveRafterSpacing(940, {
      mode: 'fixed-module',
      spacingMm: 800,
      endPolicy: 'allow-open-end',
    });
    expect(spacing.stations.map((station) => station.alongBuildingMm)).toEqual([
      0, 800,
    ]);
    expect(spacing).toMatchObject({
      stationCount: 2,
      bayCount: 1,
      actualSpacingMm: 800,
      remainderToEndMm: 140,
      endPolicy: 'allow-open-end',
    });
  });

  it('uses the closest evenly distributed target and exposes signed deviation', () => {
    const spacing = resolveRafterSpacing(940, {
      mode: 'target-even-spacing',
      spacingMm: 800,
    });
    expect(spacing.stations.map((station) => station.alongBuildingMm)).toEqual([
      0, 940,
    ]);
    expect(spacing).toMatchObject({
      stationCount: 2,
      bayCount: 1,
      requestedSpacingMm: 800,
      actualSpacingMm: 940,
      deviationMm: 140,
      deviationRatio: 0.175,
    });
  });

  it('handles a requested spacing greater than a short building in every explicit policy', () => {
    expect(
      resolveRafterSpacing(120, {
        mode: 'max-even-spacing',
        spacingMm: 800,
      }).stations.map((station) => station.alongBuildingMm),
    ).toEqual([0, 120]);
    expect(
      resolveRafterSpacing(120, {
        mode: 'target-even-spacing',
        spacingMm: 800,
      }).stations.map((station) => station.alongBuildingMm),
    ).toEqual([0, 120]);
    expect(
      resolveRafterSpacing(120, {
        mode: 'fixed-module',
        spacingMm: 800,
        endPolicy: 'allow-open-end',
      }),
    ).toMatchObject({ stationCount: 1, bayCount: 0, remainderToEndMm: 120 });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid spacing %s',
    (spacingMm) => {
      expect(() =>
        resolveRafterSpacing(940, {
          mode: 'max-even-spacing',
          spacingMm,
        }),
      ).toThrow();
    },
  );

  it('keeps canonical millimetre behavior after a display-unit conversion', () => {
    const fromCentimetres = 80 * 10;
    expect(
      resolveRafterSpacing(940, {
        mode: 'max-even-spacing',
        spacingMm: fromCentimetres,
      }).actualSpacingMm,
    ).toBe(470);
  });

  it('uses one cross-section assembly while pitch updates rise and fabrication', () => {
    const before = template();
    const first = resolveGableRoofTemplate(before);
    const direct = calculateAssembly(assemblyFromGableTemplate(before));
    expect(first.calculation).toEqual(direct);
    expect(first.ridgeHeightMm).toBeCloseTo(
      4000 * Math.tan((35 * Math.PI) / 180),
      10,
    );

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
    expect(
      skeleton.members.filter((member) => member.kind === 'rafter'),
    ).toHaveLength(24);
    expect(
      skeleton.members.filter((member) => member.kind === 'purlin'),
    ).toHaveLength(2);
    const rafters = skeleton.members.filter(
      (member) => member.kind === 'rafter',
    );
    expect(new Set(rafters.map((member) => member.id)).size).toBe(
      rafters.length,
    );
    expect(new Set(rafters.map((member) => member.selectionId)).size).toBe(
      rafters.length,
    );
    expect(new Set(rafters.map((member) => member.prototypeId))).toEqual(
      new Set(['member:rafter-1']),
    );
    expect(rafters[6]).toMatchObject({
      id: 'instance:rafter-pair-4:left',
      side: 'left',
      stationMm: 2209.090909090909,
      section: spec.rafterSection,
    });
    expect(
      skeleton.members.find((member) => member.kind === 'ridge')?.from.z,
    ).toBeCloseTo(skeleton.ridgeHeightMm, 10);
    expect(
      skeleton.members.find((member) => member.id === 'instance:purlin-1:left')
        ?.from.z,
    ).toBeCloseTo(1800 * Math.tan((35 * Math.PI) / 180), 10);
  });
});

describe('structural system and collar tie', () => {
  it('defaults to the rafter system when structure is absent', () => {
    expect(roofStructureSystem(template())).toBe('rafter');
    expect(resolveCollarTies(template())).toEqual([]);
  });

  it('rejects rafter-collar-tie without a collar-tie spec', () => {
    const spec = template();
    spec.structure = { system: 'rafter-collar-tie' };
    expect(() => gableRoofTemplateSchema.parse(spec)).toThrow();
  });

  it('rejects a collar tie at or above the ridge apex', () => {
    const spec = template();
    spec.structure = {
      system: 'rafter-collar-tie',
      collarTie: {
        heightAboveWallPlateMm: gableRidgeHeightMm(4000, 35),
        section: { widthMm: 100, depthMm: 38 },
      },
    };
    expect(() => gableRoofTemplateSchema.parse(spec)).toThrow();
  });

  it('resolves one collar tie per rafter station once enabled', () => {
    const spec = template();
    spec.structure = {
      system: 'rafter-collar-tie',
      collarTie: {
        heightAboveWallPlateMm: 1000,
        section: { widthMm: 100, depthMm: 38 },
      },
    };
    expect(roofStructureSystem(spec)).toBe('rafter-collar-tie');
    const ties = resolveCollarTies(spec);
    const spacing = resolveRafterSpacing(
      spec.buildingLengthMm,
      spec.rafterSpacing,
    );
    expect(ties).toHaveLength(spacing.stationCount);
    expect(ties.every((tie) => tie.lengthMm > 0)).toBe(true);
    expect(ties.every((tie) => tie.section.widthMm === 100)).toBe(true);

    const skeleton = createGableRoofSkeleton(spec);
    const collarTieMembers = skeleton.members.filter(
      (member) => member.kind === 'collar-tie',
    );
    expect(collarTieMembers).toHaveLength(spacing.stationCount);
    expect(
      collarTieMembers.every(
        (member) => member.from.z === 1000 && member.to.z === 1000,
      ),
    ).toBe(true);
  });

  it('clamps an existing collar-tie height when the roof geometry shrinks', () => {
    const spec = template();
    spec.structure = {
      system: 'rafter-collar-tie',
      collarTie: {
        heightAboveWallPlateMm: 2500,
        section: { widthMm: 100, depthMm: 38 },
      },
    };
    const resolved = resolveGableRoofTemplate(spec);
    // A direct parse does not auto-clamp; the store's edit path does via
    // gableTemplateFromAssembly, exercised below.
    expect(resolved.template.structure?.collarTie?.heightAboveWallPlateMm).toBe(
      2500,
    );
    expect(() =>
      gableRoofTemplateSchema.parse({ ...spec, halfRunMm: 1500 }),
    ).toThrow();

    const assembly = assemblyFromGableTemplate(spec);
    assembly.roof.runMm = 1500;
    const rebuilt = gableTemplateFromAssembly(assembly, {
      id: spec.id,
      buildingLengthMm: spec.buildingLengthMm,
      rafterSpacing: spec.rafterSpacing,
      structure: spec.structure,
    });
    const clampedHeight =
      rebuilt.structure?.collarTie?.heightAboveWallPlateMm ?? 0;
    expect(clampedHeight).toBeLessThan(2500);
    expect(clampedHeight).toBeGreaterThan(0);
  });
});
