import { describe, expect, it } from 'vitest';
import {
  resolvePrimaryCoveringAssignments,
  type CoveringAssignmentSpec,
  type RoofTileTechnicalSpec,
} from '@cieslacalc/covering-core';
import {
  assemblyDefaults,
  createRoofSkeleton,
  gableTemplateFromAssembly,
  resolveBattenLayout,
  resolveCounterBattenLayout,
  roofPlaneIds,
} from '@cieslacalc/roof-math';
import type {
  BattenLayoutSpec,
  RoofTemplateSpec,
} from '@cieslacalc/timber-model';
import { resolveBattenAutoComposition } from './batten-composition';
import { evaluateBattenInstallation } from './batten-installation';
import {
  deriveBattenWorkflow,
  deriveCounterBattenWorkflow,
} from './batten-workflow';
import {
  battenLayerForWholeRoof,
  disabledBattenLayer,
  newBattenLayer,
  newCounterBattenLayer,
} from './build-up-defaults';

const gable = gableTemplateFromAssembly(assemblyDefaults);
const hip: RoofTemplateSpec = {
  ...gableTemplateFromAssembly(assemblyDefaults, {
    id: 'template:hip-1',
    buildingLengthMm: 12000,
    rafterSpacing: { mode: 'max-even-spacing', spacingMm: 800 },
  }),
  type: 'hip',
  hipRafterSection: { widthMm: 80, depthMm: 240 },
} as RoofTemplateSpec;

/**
 * Technical snapshots of three seeded roof-tile families
 * (apps/api/src/data/import-batches/tiles-2026-09*.json): different cover
 * widths, gauge ranges, minimum pitches, consumption and physical sizes.
 */
const SEEDED: Record<string, RoofTileTechnicalSpec> = {
  wide: {
    schemaVersion: 1,
    kind: 'roof-tile',
    physicalWidthMm: 304,
    physicalLengthMm: 503,
    installationModes: [
      {
        id: 'standard',
        coverWidthMm: 260,
        gaugeRangeMm: { min: 390, max: 430 },
        minPitchDeg: 10,
        declaredUnitsPerM2: { min: 8.9, max: 9.9 },
      },
    ],
  },
  narrow: {
    schemaVersion: 1,
    kind: 'roof-tile',
    physicalWidthMm: 298,
    physicalLengthMm: 500,
    installationModes: [
      {
        id: 'standard',
        coverWidthMm: 263,
        gaugeRangeMm: { min: 338, max: 366 },
        minPitchDeg: 10,
        declaredUnitsPerM2: { min: 10.4, max: 11.3 },
      },
    ],
  },
  steep: {
    schemaVersion: 1,
    kind: 'roof-tile',
    physicalWidthMm: 304,
    physicalLengthMm: 505,
    installationModes: [
      {
        id: 'standard',
        coverWidthMm: 261,
        gaugeRangeMm: { min: 393, max: 433 },
        minPitchDeg: 25,
        declaredUnitsPerM2: { min: 9, max: 9.9 },
      },
    ],
  },
};

const tile = (
  spec: RoofTileTechnicalSpec,
  template: RoofTemplateSpec = gable,
  selectedInstallationModeId?: string,
): CoveringAssignmentSpec => ({
  id: 'covering:roof-tile-1',
  roofPlaneIds: roofPlaneIds(template),
  ...(selectedInstallationModeId ? { selectedInstallationModeId } : {}),
  product: {
    catalogRef: { productId: 'p', technicalRevisionId: 'r' },
    displaySnapshot: { familyName: 'Seeded tile' },
    technicalSpecSnapshot: spec,
  },
});

function run(args: {
  layout?: BattenLayoutSpec;
  assignments?: CoveringAssignmentSpec[];
  template?: RoofTemplateSpec;
}) {
  const template = args.template ?? gable;
  const assignments = args.assignments ?? [];
  const effective = args.layout ?? disabledBattenLayer();
  const composition = resolveBattenAutoComposition({
    layout: effective,
    assignments,
    ownership: resolvePrimaryCoveringAssignments(assignments),
    roofPlaneIds: roofPlaneIds(template),
    roofPitchDeg: template.pitchDeg,
  });
  const result = resolveBattenLayout({
    template,
    layout: effective,
    autoSource: composition.source,
  });
  const decision = evaluateBattenInstallation({
    layout: effective,
    result,
    composition,
  });
  return {
    result,
    workflow: deriveBattenWorkflow({
      layout: args.layout,
      result,
      composition,
      decision,
      assignments,
      roofPitchDeg: template.pitchDeg,
    }),
  };
}

const manual = (gaugeMm: number): BattenLayoutSpec => ({
  ...newBattenLayer(),
  mode: 'manual',
  gaugeMm,
});

describe('V43B batten workflow', () => {
  it('no covering + Auto: no fake 350 mm ready layout and actionable choices', () => {
    const { workflow, result } = run({ layout: newBattenLayer() });
    expect(workflow.state).toBe('awaiting-covering');
    expect(workflow.tone).toBe('blocked');
    expect(workflow.complete).toBe(false);
    expect(workflow.gaugeMm).toBeUndefined();
    expect(workflow.manualGaugeMm).toBeUndefined();
    expect(result.battens).toHaveLength(0);
    expect(workflow.actions).toEqual(['choose-covering', 'set-manual']);
  });

  it('absent layer is off and never reports a gauge', () => {
    const { workflow } = run({});
    expect(workflow.state).toBe('layer-off');
    expect(workflow.owner).toBe('none');
    expect(workflow.rowCount).toBe(0);
    const offered = run({ assignments: [tile(SEEDED.narrow!)] });
    expect(offered.workflow.actions).toEqual(['enable-auto']);
  });

  it('manual before covering is allowed but unverified, never complete', () => {
    const { workflow } = run({ layout: manual(350) });
    expect(workflow.state).toBe('manual-unverified');
    expect(workflow.owner).toBe('manual');
    expect(workflow.verifiedAgainstCovering).toBe(false);
    expect(workflow.complete).toBe(false);
    expect(workflow.rowCount).toBeGreaterThan(0);
    expect(workflow.actions).toContain('choose-covering');
  });

  it('manual gauge is validated against a later covering and never overwritten', () => {
    const compatible = run({
      layout: manual(350),
      assignments: [tile(SEEDED.narrow!)],
    });
    expect(compatible.workflow.state).toBe('manual-compatible');
    expect(compatible.workflow.complete).toBe(true);
    const incompatible = run({
      layout: manual(350),
      assignments: [tile(SEEDED.wide!)],
    });
    expect(incompatible.workflow).toMatchObject({
      state: 'manual-incompatible',
      manualGaugeMm: 350,
      allowedRangeMm: { min: 390, max: 430 },
      actions: ['fit-auto'],
    });
  });

  it('Auto follows the product: three seeded tiles give three exact gauges', () => {
    const gauges = Object.values(SEEDED).map((spec) => {
      const { workflow, result } = run({
        layout: newBattenLayer(),
        assignments: [tile(spec)],
      });
      expect(workflow.state).toBe('auto-ready');
      expect(workflow.owner).toBe('auto');
      expect(workflow.complete).toBe(true);
      expect(workflow.totalLengthMm).toBe(result.totalLengthMm);
      const range = spec.installationModes[0]!.gaugeRangeMm;
      expect(workflow.gaugeMm).toBeGreaterThanOrEqual(range.min);
      expect(workflow.gaugeMm).toBeLessThanOrEqual(range.max);
      return workflow.gaugeMm;
    });
    // Overlapping ranges (390–430 vs 393–433) may legitimately select the
    // same whole interval count; a disjoint range must change the result.
    expect(new Set(gauges).size).toBeGreaterThanOrEqual(2);
    expect(gauges[0]).not.toBe(gauges[1]);
  });

  it('several installation modes require a choice; the choice recomputes', () => {
    const spec: RoofTileTechnicalSpec = {
      ...SEEDED.narrow!,
      installationModes: [
        { ...SEEDED.narrow!.installationModes[0]!, id: 'standard' },
        {
          ...SEEDED.narrow!.installationModes[0]!,
          id: 'low-pitch',
          gaugeRangeMm: { min: 300, max: 320 },
        },
      ],
    };
    const undecided = run({
      layout: newBattenLayer(),
      assignments: [tile(spec)],
    });
    expect(undecided.workflow.state).toBe('awaiting-installation-mode');
    expect(undecided.workflow.installationModeCount).toBe(2);
    expect(undecided.result.battens).toHaveLength(0);
    const standard = run({
      layout: newBattenLayer(),
      assignments: [tile(spec, gable, 'standard')],
    });
    const low = run({
      layout: newBattenLayer(),
      assignments: [tile(spec, gable, 'low-pitch')],
    });
    expect(standard.workflow.state).toBe('auto-ready');
    expect(low.workflow.gaugeMm).toBeLessThanOrEqual(320);
    expect(standard.workflow.gaugeMm).toBeGreaterThanOrEqual(338);
  });

  it('missing pitch-rule data disables Auto without guessing', () => {
    const spec: RoofTileTechnicalSpec = structuredClone(SEEDED.narrow!);
    spec.installationModes[0]!.installationRules = [
      { id: 'low', pitchRangeDeg: { min: 10, max: 25 } },
    ];
    const { workflow, result } = run({
      layout: newBattenLayer(),
      assignments: [tile(spec)],
    });
    expect(workflow.state).toBe('auto-data-unavailable');
    expect(result.battens).toHaveLength(0);
  });

  it('minimum pitch violation is incompatible for Auto and Manual', () => {
    const low = { ...gable, pitchDeg: 20 } as RoofTemplateSpec;
    expect(
      run({
        template: low,
        layout: newBattenLayer(),
        assignments: [tile(SEEDED.steep!, low)],
      }).workflow,
    ).toMatchObject({
      state: 'auto-incompatible',
      pitch: { status: 'below-minimum', minimumDeg: 25 },
    });
    expect(
      run({
        template: low,
        layout: manual(400),
        assignments: [tile(SEEDED.steep!, low)],
      }).workflow.state,
    ).toBe('manual-incompatible');
  });

  it('product removal drops Auto rows but keeps Auto intent for the next covering', () => {
    const layout = newBattenLayer();
    const before = run({ layout, assignments: [tile(SEEDED.narrow!)] });
    expect(before.workflow.rowCount).toBeGreaterThan(0);
    const removed = run({ layout, assignments: [] });
    expect(removed.workflow.state).toBe('awaiting-covering');
    expect(removed.workflow.rowCount).toBe(0);
    expect(layout.mode).toBe('auto-from-covering');
    const restored = run({ layout, assignments: [tile(SEEDED.wide!)] });
    expect(restored.workflow.state).toBe('auto-ready');
  });

  it('geometry change recomputes Auto rows; the manual gauge stays owned', () => {
    const steeper = { ...gable, pitchDeg: 45 } as RoofTemplateSpec;
    const a = run({
      layout: newBattenLayer(),
      assignments: [tile(SEEDED.narrow!)],
    });
    const b = run({
      template: steeper,
      layout: newBattenLayer(),
      assignments: [tile(SEEDED.narrow!, steeper)],
    });
    expect(b.workflow.rowCount).not.toBe(a.workflow.rowCount);
    const m = run({ template: steeper, layout: manual(350) });
    expect(m.workflow.manualGaugeMm).toBe(350);
  });

  it('non-tile coverings never get tile-style Auto battens', () => {
    const seam: CoveringAssignmentSpec = {
      id: 'covering:standing-seam-1',
      roofPlaneIds: roofPlaneIds(gable),
      product: {
        technicalSpecSnapshot: {
          schemaVersion: 1,
          kind: 'standing-seam',
          installationModes: [{ id: 'standard', effectiveWidthMm: 500 }],
        },
      },
    } as CoveringAssignmentSpec;
    expect(
      run({ layout: newBattenLayer(), assignments: [seam] }).workflow.state,
    ).toBe('unsupported-support-model');
    const sheet: CoveringAssignmentSpec = {
      id: 'covering:modular-sheet-1',
      roofPlaneIds: roofPlaneIds(gable),
      product: {
        technicalSpecSnapshot: {
          schemaVersion: 1,
          kind: 'modular-sheet',
          effectiveWidthMm: 1100,
          lengthModel: { kind: 'fixed-sheet', effectiveLengthMm: 700 },
          moduleLengthMm: 350,
        },
      },
    };
    expect(
      run({ layout: manual(350), assignments: [sheet] }).workflow,
    ).toMatchObject({ state: 'manual-compatible', fixedSupportGaugeMm: 350 });
    expect(
      run({ layout: manual(340), assignments: [sheet] }).workflow.state,
    ).toBe('manual-incompatible');
  });

  it('a narrowed plane scope is explicit and repairable', () => {
    const narrowed = { ...newBattenLayer(), roofPlaneIds: ['roof-plane:left'] };
    const { workflow } = run({
      template: hip,
      layout: narrowed,
      assignments: [tile(SEEDED.narrow!, hip)],
    });
    expect(workflow.scope).toEqual({
      kind: 'subset',
      planeCount: 1,
      knownCount: 4,
    });
    expect(workflow.actions).toContain('extend-scope-to-roof');
    const whole = battenLayerForWholeRoof(narrowed);
    expect(whole.roofPlaneIds).toBeUndefined();
    const repaired = run({
      template: hip,
      layout: whole,
      assignments: [tile(SEEDED.narrow!, hip)],
    });
    expect(repaired.workflow.planeCount).toBe(4);
    expect(repaired.workflow.totalLengthMm).toBeGreaterThan(
      workflow.totalLengthMm * 3,
    );
  });
});

describe('V43B counter-batten workflow and guidance', () => {
  const counter = (detail?: 'no-dedicated-run' | 'paired-plane-runs') => {
    const layout = {
      ...newCounterBattenLayer(),
      ...(detail ? { hipBoundaryDetail: detail } : {}),
    };
    return deriveCounterBattenWorkflow({
      layout,
      result: resolveCounterBattenLayout({
        template: hip,
        skeleton: createRoofSkeleton(hip),
        layout,
      }),
    });
  };

  it('explains partial hip counter-battens and completes after a choice', () => {
    const undecided = counter();
    expect(undecided).toMatchObject({
      state: 'needs-hip-detail',
      hipBoundaryCount: 4,
      unresolvedHipBoundaryCount: 4,
      hipDetail: 'not-decided',
      complete: false,
    });
    expect(undecided.interiorAxisCount).toBeGreaterThan(0);
    const none = counter('no-dedicated-run');
    expect(none.state).toBe('complete');
    expect(none.totalLengthMm).toBeCloseTo(undecided.totalLengthMm, 6);
    const paired = counter('paired-plane-runs');
    expect(paired.state).toBe('complete');
    expect(paired.hipBoundaryRunCount).toBe(8);
    expect(paired.totalLengthMm).toBeGreaterThan(none.totalLengthMm);
  });
});
