// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import {
  createRoofMemberSchedule,
  type SurfaceBuildUpSource,
} from '@cieslacalc/quantity-core';
import {
  assemblyDefaults,
  gableTemplateFromAssembly,
  resolveMembraneLayout,
  resolveRoofSurfaceGeometry,
} from '@cieslacalc/roof-math';
import type { MembraneProductSelection } from '@cieslacalc/covering-core';
import {
  compatibleMaterialPrices,
  createMaterialPlanRows,
  materialValue,
} from './material-plan';
import { createExportCandidates } from './export-adapter';
import { materialCsv } from './material-csv';
import { MembraneMaterialCard } from './MembraneMaterialCard';
import { materialTestFacts } from './material-test-facts';
import type { VariantPrice } from '../pricing/client';

afterEach(cleanup);

const catalogueMembrane: MembraneProductSelection = {
  catalogRef: {
    productId: 'p',
    technicalRevisionId: 'r',
    variantId: 'membrane-variant',
  },
  displaySnapshot: {
    manufacturer: 'DÖRKEN',
    familyName: 'DELTA-MAXX PLUS',
    revisionCode: 'V36',
  },
  technicalSpecSnapshot: {
    schemaVersion: 1,
    kind: 'membrane',
    rollWidthMm: 1500,
    rollLengthMm: 50_000,
    minimumOverlapMm: 100,
    salesUnit: 'roll',
  },
};

/** Facts built exactly as Page.tsx builds them: solver → schedule sources. */
function membraneFacts(product = catalogueMembrane) {
  const facts = materialTestFacts();
  const spec = product.technicalSpecSnapshot;
  const layout = resolveMembraneLayout({
    template: facts.template,
    layout: { enabled: true },
    product: spec,
  });
  const sources: SurfaceBuildUpSource[] = facts.surface.planes.map((plane) => {
    const course = layout.planes.find(
      (row) => row.roofPlaneId === plane.roofPlaneId,
    )!;
    return {
      id: `surface:${plane.roofPlaneId}`,
      familyKey: 'MEM',
      memberKind: 'membrane',
      semantic: 'gross-installed',
      roofPlaneId: plane.roofPlaneId,
      areaMm2: plane.netAreaMm2,
      grossAreaMm2: course.grossAreaMm2,
      overlapAreaMm2: course.overlapAreaMm2,
      ridgeOverrunAreaMm2: course.ridgeOverrunAreaMm2,
      courseCount: course.courseCount,
      rollCount: course.rollCount,
      warningKeys: [],
    };
  });
  facts.membraneEnabled = true;
  facts.membraneProduct = product;
  facts.schedule = createRoofMemberSchedule({
    skeleton: facts.skeleton,
    surfaceBuildUp: sources,
  });
  return { facts, layout };
}

const metric = (
  row: ReturnType<typeof createMaterialPlanRows>[number],
  key: string,
) => row.metrics.find((item) => item.labelKey === key)?.value;

it('solver splits gross membrane into net + overlaps + ridge overrun on a gable', () => {
  const template = gableTemplateFromAssembly(assemblyDefaults);
  const surface = resolveRoofSurfaceGeometry({ template, features: [] });
  const layout = resolveMembraneLayout({
    template,
    layout: { enabled: true },
    product: { rollWidthMm: 1500, rollLengthMm: 50_000, minimumOverlapMm: 100 },
  });
  expect(layout.status).toBe('resolved');
  expect(layout.overlapAreaMm2).toBeGreaterThan(0);
  for (const plane of layout.planes) {
    expect(plane.overlapAreaMm2).toBeCloseTo(
      (plane.courseCount - 1) * 100 * plane.courseWidthMm,
      3,
    );
  }
  // A rectangular gable plane has no taper: nothing else explains gross.
  expect(
    layout.grossAreaMm2 - layout.overlapAreaMm2 - layout.ridgeOverrunAreaMm2,
  ).toBeCloseTo(surface.netAreaMm2, 0);
});

it('projects net, overlap effect, courses, rolls and catalogue roll facts', () => {
  const { facts, layout } = membraneFacts();
  const row = createMaterialPlanRows(facts, catalogueMembrane).find(
    (item) => item.id === 'membrane',
  )!;
  expect(row.membranePlan).toBe('roll-plan');
  expect(row.unit).toBe('m2');
  expect(row.basis).toBe('gross-area');
  expect(metric(row, 'netArea')).toBeCloseTo(facts.surface.netAreaMm2 / 1e6);
  expect(metric(row, 'grossArea')).toBeCloseTo(layout.grossAreaMm2 / 1e6);
  expect(metric(row, 'overlapArea')).toBeCloseTo(layout.overlapAreaMm2 / 1e6);
  expect(metric(row, 'simplificationArea')).toBeUndefined();
  expect(metric(row, 'courseCount')).toBe(layout.courseCount);
  expect(metric(row, 'rollCount')).toBe(layout.rollCount);
  expect(metric(row, 'rollWidth')).toBe(1.5);
  expect(metric(row, 'overlapUsed')).toBe(10);
  expect(row.productSource).toBe('catalog');
  expect(row.membraneRoll?.revisionCode).toBe('V36');
  // Limitations are specific: a plain gable has no hip/opening warnings.
  expect(row.warnings).toContain('gross-area-no-roll-reuse');
  expect(row.warnings).toContain('membrane-sold-per-roll');
  expect(row.warnings).not.toContain('hip-course-width-approximated');
  expect(row.warnings).not.toContain('openings-not-subtracted');
});

it('never joins a per-roll price to the m² membrane quantity', () => {
  const { facts } = membraneFacts();
  const row = createMaterialPlanRows(facts, catalogueMembrane).find(
    (item) => item.id === 'membrane',
  )!;
  const rollPrice = {
    variantId: 'membrane-variant',
    currencyCode: 'PLN',
    entry: {
      id: 'roll-price',
      commercialVariantId: 'membrane-variant',
      saleUnit: 'roll',
      netAmountMinor: 45_000,
      sourceAmountBasis: 'net',
      validFrom: '2026-09-01',
    },
  } as unknown as VariantPrice;
  expect(compatibleMaterialPrices(row, [rollPrice], 'PLN')).toEqual([]);
  expect(
    materialValue(row, {
      source: 'price-list',
      amountMinor: 45_000,
      currencyCode: 'PLN',
      provenance: 'list',
      variantId: 'membrane-variant',
      saleUnit: 'piece',
    }),
  ).toBeUndefined();
});

it('marks manual technical data as user-owned, not a catalogue revision', () => {
  const manualProduct: MembraneProductSelection = {
    technicalSpecSnapshot: {
      ...catalogueMembrane.technicalSpecSnapshot,
      salesUnit: undefined,
    },
  };
  const { facts } = membraneFacts(manualProduct);
  const row = createMaterialPlanRows(facts, manualProduct).find(
    (item) => item.id === 'membrane',
  )!;
  expect(row.productSource).toBe('manual');
  expect(row.product?.variantId).toBeUndefined();
  render(createElement(MembraneMaterialCard, { row, locale: 'pl' }));
  const card = screen.getByTestId('membrane-material-card');
  expect(within(card).getByTestId('membrane-product-source')).toHaveProperty(
    'textContent',
    'RĘCZNIE',
  );
  expect(within(card).getByTestId('membrane-plan-kind').textContent).toBe(
    'PLAN KONSERWATYWNY',
  );
  expect(card.textContent).toContain('Wpływ zakładów');
  expect(card.textContent).toContain('10 cm');
  expect(card.textContent).toContain(
    'Pozostałe odcinki rolki nie są ponownie układane między pasami.',
  );
  expect(card.textContent).not.toContain('Połać kopertowa');
});

it('shows a net-only card without inventing overlaps or rolls', () => {
  const { facts } = membraneFacts();
  facts.schedule.surfaceBuildUpRows[0]!.semantic = 'net-geometric';
  const row = createMaterialPlanRows(facts).find(
    (item) => item.id === 'membrane',
  )!;
  expect(row.membranePlan).toBe('net-only');
  render(createElement(MembraneMaterialCard, { row, locale: 'pl' }));
  expect(screen.getByTestId('membrane-plan-kind').textContent).toBe(
    'TYLKO NETTO',
  );
  expect(screen.queryByTestId('membrane-overlap-effect')).toBeNull();
});

it('material document and CSV carry the same membrane facts without recalculation', () => {
  const { facts } = membraneFacts();
  const rows = createMaterialPlanRows(facts, catalogueMembrane);
  const row = rows.find((item) => item.id === 'membrane')!;
  const section = createExportCandidates({
    ...facts,
    materialRows: rows,
  }).find((candidate) => candidate.kind === 'material-list')!.section;
  if (section?.kind !== 'material-list') throw new Error('no material list');
  const exported = section.rows.find((item) => item.labelKey === 'membrane')!;
  expect(exported.metrics).toEqual(row.metrics);
  expect(exported.warnings).toEqual(row.warnings);
  const csv = materialCsv(rows, {});
  expect(csv).toContain('Wpływ zakładów');
  expect(csv).toContain('Plan rolek (wg obecnego układu)');
});
