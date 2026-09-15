import { describe, expect, it } from 'vitest';
import {
  resolvePrimaryCoveringAssignments,
  type CoveringAssignmentSpec,
} from '@cieslacalc/covering-core';
import {
  assemblyDefaults,
  gableTemplateFromAssembly,
  resolveBattenLayout,
  roofPlaneIds,
} from '@cieslacalc/roof-math';
import type { BattenLayoutSpec } from '@cieslacalc/timber-model';
import { resolveBattenAutoComposition } from './batten-composition';
import {
  evaluateBattenInstallation,
  uniformBattenGauge,
} from './batten-installation';

const template = gableTemplateFromAssembly(assemblyDefaults);
const layout: BattenLayoutSpec = {
  enabled: true,
  mode: 'auto-from-covering',
  gaugeMm: 390,
  battenWidthMm: 60,
  battenHeightMm: 40,
  eaveOffsetMm: 250,
  ridgeOffsetMm: 40,
};
const tile = (): CoveringAssignmentSpec => ({
  id: 'tile',
  roofPlaneIds: roofPlaneIds(template),
  product: {
    technicalSpecSnapshot: {
      schemaVersion: 1,
      kind: 'roof-tile',
      installationModes: [
        {
          id: 'standard',
          coverWidthMm: 300,
          gaugeRangeMm: { min: 330, max: 360 },
          minPitchDeg: 19,
        },
      ],
    },
  },
});
function resolve(current = layout, assignment = tile(), roof = template) {
  const composition = resolveBattenAutoComposition({
    layout: current,
    assignments: [assignment],
    ownership: resolvePrimaryCoveringAssignments([assignment]),
    roofPlaneIds: roofPlaneIds(roof),
    roofPitchDeg: roof.pitchDeg,
  });
  const result = resolveBattenLayout({
    layout: current,
    template: roof,
    autoSource: composition.source,
  });
  return {
    composition,
    result,
    decision: evaluateBattenInstallation({
      layout: current,
      result,
      composition,
    }),
  };
}

describe('batten installation decisions', () => {
  it('does not expose one global gauge for unequal plane results', () => {
    const { result } = resolve();
    expect(uniformBattenGauge(result)).toBe(result.planes[0]!.actualGaugeMm);
    result.planes[1]!.actualGaugeMm = result.planes[0]!.actualGaugeMm! + 1;
    expect(uniformBattenGauge(result)).toBeUndefined();
  });
  it('exposes complete solver explanation and retains manual edge references', () => {
    const { result, decision } = resolve();
    expect(decision).toMatchObject({
      status: 'partially-automatic',
      gaugeSource: 'project-user-input',
      recommendation: {
        category: 'recommendation',
        source: 'derived-geometry',
        rule: 'nearest-target-gauge',
      },
      eaveReference: { valueMm: 250, source: 'project-user-input' },
      ridgeReference: { valueMm: 40, source: 'project-user-input' },
    });
    const plan = result.planes[0]?.autoPlan;
    expect(plan).toMatchObject({
      minimumGaugeMm: 330,
      maximumGaugeMm: 360,
      targetGaugeMm: 345,
    });
    expect(plan!.courseCount).toBe(plan!.intervalCount + 1);
    expect(plan!.actualGaugeMm).toBe(plan!.regularSpanMm / plan!.intervalCount);
    expect(plan!.stations.at(-1)).toBe(plan!.lastStationMm);
    expect(layout.gaugeMm).toBe(390);
  });

  it('recalculates Auto on product and geometry changes without mutating intent', () => {
    const first = resolve();
    const product = tile();
    if (product.product.technicalSpecSnapshot.kind !== 'roof-tile')
      throw new Error('tile');
    product.product.technicalSpecSnapshot.installationModes[0]!.gaugeRangeMm = {
      min: 300,
      max: 320,
    };
    const changedProduct = resolve(layout, product);
    expect(changedProduct.result.planes[0]!.actualGaugeMm).not.toBe(
      first.result.planes[0]!.actualGaugeMm,
    );
    const changedGeometry = resolve(layout, tile(), {
      ...template,
      halfRunMm: template.halfRunMm + 600,
    });
    expect(changedGeometry.result.planes[0]!.stations).not.toEqual(
      first.result.planes[0]!.stations,
    );
    expect(changedGeometry.decision.status).toBe('partially-automatic');
    expect(layout).toMatchObject({
      gaugeMm: 390,
      eaveOffsetMm: 250,
      ridgeOffsetMm: 40,
    });
  });

  it('preserves manual gauge and revalidates it after product changes', () => {
    const manual = { ...layout, mode: 'manual' as const, gaugeMm: 345 };
    expect(resolve(manual).decision.status).toBe('ready');
    const product = tile();
    if (product.product.technicalSpecSnapshot.kind !== 'roof-tile')
      throw new Error('tile');
    product.product.technicalSpecSnapshot.installationModes[0]!.gaugeRangeMm = {
      min: 300,
      max: 320,
    };
    const changed = resolve(manual, product);
    expect(changed.result.planes[0]!.actualGaugeMm).toBe(345);
    expect(changed.decision).toMatchObject({
      status: 'incompatible',
      issues: [
        { code: 'manual-gauge-outside-range', category: 'hard-constraint' },
      ],
    });
    expect(manual.gaugeMm).toBe(345);
  });

  it.each(['manual', 'auto-from-covering'] as const)(
    'never approves below-minimum pitch in %s',
    (mode) => {
      expect(
        resolve({ ...layout, gaugeMm: 345, mode }, tile(), {
          ...template,
          pitchDeg: 18,
        }).decision,
      ).toMatchObject({
        status: 'incompatible',
        issues: [{ code: 'below-minimum-pitch', category: 'hard-constraint' }],
      });
    },
  );

  it.each(['manual', 'auto-from-covering'] as const)(
    'reports missing pitch data in %s',
    (mode) => {
      const product = tile();
      if (product.product.technicalSpecSnapshot.kind !== 'roof-tile')
        throw new Error('tile');
      delete product.product.technicalSpecSnapshot.installationModes[0]!
        .minPitchDeg;
      expect(
        resolve({ ...layout, gaugeMm: 345, mode }, product).decision.status,
      ).toBe('decision-required');
    },
  );

  it.each([
    { gaugeMm: Number.NaN },
    { gaugeMm: Number.POSITIVE_INFINITY },
    { gaugeMm: 0 },
    { gaugeMm: -1 },
    { gaugeMm: 1e-20 },
    { battenHeightMm: -1 },
    { eaveOffsetMm: Number.NaN },
    { eaveOffsetMm: 1e9 },
    { ridgeOffsetMm: 1e9 },
    { eaveOffsetMm: 4000, ridgeOffsetMm: 4000 },
  ])(
    'returns an incompatible decision for nonsense manual values %o',
    (change) => {
      const { result, decision } = resolve({
        ...layout,
        mode: 'manual',
        ...change,
      });
      expect(result.status).not.toBe('resolved');
      expect(decision.status).toBe('incompatible');
    },
  );

  it('does not approve negative or non-finite roof geometry', () => {
    for (const halfRunMm of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { result, decision } = resolve(layout, tile(), {
        ...template,
        halfRunMm,
      });
      expect(result).toMatchObject({
        status: 'incomplete',
        battens: [],
        issues: ['invalid-layout-geometry'],
      });
      expect(decision.status).toBe('incompatible');
    }
  });
});
