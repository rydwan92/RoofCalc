import { describe, expect, it } from 'vitest';
import {
  resolvePrimaryCoveringAssignments,
  type CoveringAssignmentSpec,
  type RoofTileTechnicalSpec,
} from '@cieslacalc/covering-core';
import { createRoofMemberSchedule } from '@cieslacalc/quantity-core';
import {
  assemblyDefaults,
  createRoofSkeleton,
  gableTemplateFromAssembly,
  resolveBattenLayout,
  roofPlaneIds,
} from '@cieslacalc/roof-math';
import type { RoofTemplateSpec } from '@cieslacalc/timber-model';
import { resolveBattenAutoComposition } from './batten-composition';
import { evaluateBattenInstallation } from './batten-installation';
import { deriveBattenWorkflow } from './batten-workflow';
import { newBattenLayer } from './build-up-defaults';
import { createMaterialPlanRows } from './material-plan';
import { materialTestFacts } from './material-test-facts';

const KODA: RoofTileTechnicalSpec = {
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
};
const ALTERNATIVE: RoofTileTechnicalSpec = {
  ...KODA,
  installationModes: [
    {
      ...KODA.installationModes[0]!,
      id: 'standard',
      gaugeRangeMm: { min: 338, max: 366 },
    },
  ],
};

function assignment(
  template: RoofTemplateSpec,
  spec: RoofTileTechnicalSpec,
  label: string,
): CoveringAssignmentSpec {
  return {
    id: 'covering:tile',
    roofPlaneIds: roofPlaneIds(template),
    product: {
      catalogRef: {
        productId: `product:${label.toLowerCase()}`,
        technicalRevisionId: `revision:${label.toLowerCase()}:1`,
        variantId: `variant:${label.toLowerCase()}:standard`,
      },
      displaySnapshot: { manufacturer: 'Seed', familyName: label },
      technicalSpecSnapshot: spec,
    },
  };
}

function resolvePipeline(
  template: RoofTemplateSpec,
  covering: CoveringAssignmentSpec,
) {
  const layout = newBattenLayer();
  const composition = resolveBattenAutoComposition({
    layout,
    assignments: [covering],
    ownership: resolvePrimaryCoveringAssignments([covering]),
    roofPlaneIds: roofPlaneIds(template),
    roofPitchDeg: template.pitchDeg,
  });
  const battens = resolveBattenLayout({
    template,
    layout,
    autoSource: composition.source,
  });
  const workflow = deriveBattenWorkflow({
    layout,
    result: battens,
    composition,
    decision: evaluateBattenInstallation({
      layout,
      result: battens,
      composition,
    }),
    assignments: [covering],
    roofPitchDeg: template.pitchDeg,
  });
  const skeleton = createRoofSkeleton(template);
  const schedule = createRoofMemberSchedule({
    skeleton,
    buildUp: battens.battens.map((row) => ({
      id: row.id,
      familyKey: 'L',
      memberKind: 'batten' as const,
      lengthMm: row.usableLengthMm,
      section: {
        widthMm: layout.battenWidthMm,
        depthMm: layout.battenHeightMm,
      },
      segmentCount: row.segments.length,
    })),
  });
  const facts = materialTestFacts();
  facts.template = template;
  facts.skeleton = skeleton;
  facts.schedule = schedule;
  facts.battensEnabled = true;
  facts.battens = battens;
  facts.battenAutoSource = composition.source;
  facts.battenWorkflow = workflow;
  facts.coverings = [covering];
  const material = createMaterialPlanRows(facts).find(
    (row) => row.id === 'battens',
  );
  return { battens, workflow, schedule, material };
}

describe('V56 covering → battens → quantity → Material Plan contract', () => {
  it.each(['gable', 'hip'] as const)(
    'uses one seeded-style technical source on a %s roof',
    (type) => {
      const base = gableTemplateFromAssembly(assemblyDefaults);
      const template =
        type === 'gable'
          ? base
          : ({
              ...base,
              type: 'hip',
              hipRafterSection: { widthMm: 80, depthMm: 240 },
            } as RoofTemplateSpec);
      const result = resolvePipeline(
        template,
        assignment(template, KODA, 'KODA'),
      );
      expect(result.workflow).toMatchObject({
        state: 'auto-ready',
        owner: 'auto',
        productLabel: 'KODA',
        planeCount: type === 'gable' ? 2 : 4,
      });
      expect(result.schedule.buildUpSummary.totalLengthMm).toBe(
        result.battens.totalLengthMm,
      );
      expect(result.material).toMatchObject({
        basis: 'geometric-length',
        suitability: 'geometric-estimate',
        partial: false,
        battenSource: { owner: 'auto', productLabel: 'KODA' },
      });
      expect(result.material?.quantity).toBeCloseTo(
        result.battens.totalLengthMm / 1000,
        8,
      );
    },
  );

  it('replaces every downstream Auto fact when the technical product changes', () => {
    const template = gableTemplateFromAssembly(assemblyDefaults);
    const a = resolvePipeline(template, assignment(template, KODA, 'KODA'));
    const b = resolvePipeline(
      template,
      assignment(template, ALTERNATIVE, 'ALTERNATIVE'),
    );
    expect(b.workflow.productLabel).toBe('ALTERNATIVE');
    expect(b.workflow.allowedRangeMm).toEqual({ min: 338, max: 366 });
    expect(b.workflow.gaugeMm).not.toBe(a.workflow.gaugeMm);
    expect(b.battens.totalLengthMm).not.toBe(a.battens.totalLengthMm);
    expect(b.material?.quantity).not.toBe(a.material?.quantity);
  });

  it('ignores organization-only SKU/price context for technical geometry', () => {
    const template = gableTemplateFromAssembly(assemblyDefaults);
    const global = assignment(template, KODA, 'KODA');
    const organizationContext = {
      sku: 'DACH-00384',
      netAmountMinor: 482,
      assortmentStatus: 'preferred',
    };
    const business = structuredClone(global);
    expect(resolvePipeline(template, business).battens).toEqual(
      resolvePipeline(template, global).battens,
    );
    expect(organizationContext).toEqual({
      sku: 'DACH-00384',
      netAmountMinor: 482,
      assortmentStatus: 'preferred',
    });
  });
});
