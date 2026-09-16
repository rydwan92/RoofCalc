// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createElement, useState } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../i18n';
import { MaterialPlan } from './MaterialPlan';
import type { CostScenario } from '@cieslacalc/cost-core';
import { createRoofMemberSchedule } from '@cieslacalc/quantity-core';
import { createCuttingPlan } from '@cieslacalc/procurement-core';
import {
  assemblyDefaults,
  gableTemplateFromAssembly,
  resolveRoofSurfaceGeometry,
} from '@cieslacalc/roof-math';
import {
  createEmptyCostScenario,
  withManualQuantity,
  replaceCostLine,
  parseCostScenario,
  serializeCostScenario,
  withUnitPrice,
} from '@cieslacalc/cost-core';
import type { RoofTileLayoutResult } from '@cieslacalc/covering-core';
import { createWorkbenchProjectResolver } from './workbench-project';
import {
  createK1CuttingRequirement,
  k1RequirementSignature,
} from './k1-cutting-adapter';
import {
  acceptMaterialRow,
  compatibleMaterialPrices,
  createMaterialPlanRows,
  materialValue,
  materialScenarioPrices,
  type MaterialPriceSelection,
  type MaterialPlanRow,
} from './material-plan';
import { materialCsv } from './material-csv';
import { createExportCandidates, type ExportFacts } from './export-adapter';
import type { VariantPrice } from '../pricing/client';

export function materialTestFacts(): ExportFacts {
  const template = gableTemplateFromAssembly(assemblyDefaults);
  const project = createWorkbenchProjectResolver().resolve(template);
  const schedule = createRoofMemberSchedule({ skeleton: project.skeleton });
  return {
    source: {
      projectId: 'test',
      projectName: 'Test',
      projectCreatedAt: '2026-01-01T00:00:00.000Z',
      projectUpdatedAt: '2026-01-01T00:00:00.000Z',
      projectSchemaVersion: 1,
    },
    template,
    resolved: project.resolved,
    skeleton: project.skeleton,
    surface: resolveRoofSurfaceGeometry({ template, features: [] }),
    windows: [],
    schedule,
    details: [],
    k1: createK1CuttingRequirement(project.resolved, schedule),
    membraneEnabled: false,
    counterBattensEnabled: false,
    battensEnabled: false,
    battens: {
      status: 'disabled',
      mode: 'manual',
      battens: [],
      totalLengthMm: 0,
      planes: [],
      issues: [],
    },
    battenAutoSource: { status: 'missing' },
    counterBattens: {
      status: 'disabled',
      rows: [],
      totalVisibleLengthMm: 0,
      warnings: [],
      issues: [],
      resolvedAxisCount: 0,
      interiorAxisCount: 0,
      hipBoundaryRunCount: 0,
      hipBoundaries: [],
      unresolvedHipBoundaryCount: 0,
      visibleSegmentCount: 0,
      roofPlaneIds: [],
    },
    coverings: [],
    coveringStatuses: [],
  };
}

const manual: MaterialPriceSelection = {
  source: 'manual',
  amountMinor: 1234,
  currencyCode: 'PLN',
  provenance: 'CENA RĘCZNA',
};
function geometricRow(): MaterialPlanRow {
  return {
    id: 'battens',
    category: 'layers',
    labelKey: 'battens',
    quantity: 12,
    unit: 'm',
    basis: 'geometric-length',
    suitability: 'geometric-estimate',
    partial: false,
    metrics: [],
    warnings: ['no-allowance-no-stock-length'],
    sourceReferences: [],
  };
}

it('retains accepted price provenance on reopen and recognizes a direct manual price edit', () => {
  const row = {
    ...geometricRow(),
    product: { name: 'Material', variantId: 'variant', facts: [] },
  };
  const selected: MaterialPriceSelection = {
    source: 'price-list',
    amountMinor: 1234,
    currencyCode: 'PLN',
    entryId: 'entry',
    variantId: 'variant',
    saleUnit: 'm',
    provenance: 'Supplier · 2026-09-15 · net',
  };
  const scenario = acceptMaterialRow(
    createEmptyCostScenario('PLN'),
    row,
    selected,
    'Battens',
  );
  const restored = parseCostScenario(serializeCostScenario(scenario));
  expect(materialScenarioPrices(restored, [row])[row.id]).toEqual(selected);
  const edited = replaceCostLine(
    restored,
    withUnitPrice(restored.lines[0]!, 250),
  );
  expect(materialScenarioPrices(edited, [row])[row.id]!.source).toBe('manual');
  expect(materialScenarioPrices(edited, [row])[row.id]!.amountMinor).toBe(250);
});

it('reads actual complete procurement usages and selected timber facts', () => {
  const facts = materialTestFacts();
  if (facts.k1.status !== 'resolved') throw Error('K1');
  const settings = { kerfMm: 3, endTrimMm: 5, minimumReusableRemnantMm: 200 };
  const value = createCuttingPlan({
    requiredPieces: facts.k1.requiredPieces,
    stockOptions: [
      { id: 'k1-stock-1', stockClassId: facts.k1.stockClassId, lengthMm: 7000 },
    ],
    settings,
    objective: 'minimum-purchased-length',
  });
  facts.cutting = {
    signature: k1RequirementSignature(facts.k1),
    value,
    settings,
    objective: 'minimum-purchased-length',
    scenario: {
      unit: 'mm',
      stocks: [
        {
          id: 1,
          length: '7000',
          availability: '',
          sourceLabel: 'Chosen timber',
          commercialVariantId: 'variant-1',
          commercialFacts: ['C24'],
        },
      ],
      kerf: '3',
      endTrim: '5',
      remnant: '200',
    },
  };
  const row = createMaterialPlanRows(facts).find(
    (row) => row.basis === 'procurement-stock',
  )!;
  expect(row.quantity).toBe(value.stockUsages.length);
  expect(row.suitability).toBe('exact-purchase');
  expect(row.product).toEqual({
    name: 'Chosen timber',
    variantId: 'variant-1',
    facts: ['C24'],
  });
  facts.cutting.value = { ...value, status: 'partial' };
  expect(
    createMaterialPlanRows(facts).some(
      (row) => row.basis === 'procurement-stock',
    ),
  ).toBe(false);
});

it('retains batten geometry and exact partial counter-batten limitation after pricing', () => {
  const facts = materialTestFacts();
  facts.battensEnabled = true;
  facts.counterBattensEnabled = true;
  facts.counterBattens = { ...facts.counterBattens, status: 'partial' };
  facts.schedule = createRoofMemberSchedule({
    skeleton: facts.skeleton,
    buildUp: [
      {
        id: 'batten',
        familyKey: 'L',
        memberKind: 'batten',
        lengthMm: 12000,
        section: { widthMm: 60, depthMm: 40 },
      },
      {
        id: 'counter',
        familyKey: 'KL',
        memberKind: 'counter-batten',
        lengthMm: 6000,
        section: { widthMm: 40, depthMm: 60 },
      },
    ],
  });
  const rows = createMaterialPlanRows(facts);
  const batten = rows.find((row) => row.id === 'battens')!;
  const counter = rows.find((row) => row.id === 'counter-battens')!;
  expect(batten.quantity).toBe(12);
  expect(batten.basis).toBe('geometric-length');
  expect(counter.partial).toBe(true);
  expect(counter.warnings).toContain('partial-counter-battens');
  expect(materialValue(counter, manual)).toEqual({ min: 7404, max: 7404 });
});

it('shows net, gross and rolls only for a fully resolved membrane snapshot', () => {
  const facts = materialTestFacts();
  facts.membraneEnabled = true;
  facts.schedule = createRoofMemberSchedule({
    skeleton: facts.skeleton,
    surfaceBuildUp: [
      {
        id: 'mem',
        familyKey: 'M',
        memberKind: 'membrane',
        semantic: 'gross-installed',
        areaMm2: 200_000_000,
        grossAreaMm2: 220_000_000,
        rollCount: 4,
        courseCount: 16,
        warningKeys: [
          'hip-course-width-approximated',
          'openings-not-subtracted',
        ],
      },
    ],
  });
  const membrane = createMaterialPlanRows(facts).find(
    (row) => row.id === 'membrane',
  )!;
  expect(membrane.metrics.map((metric) => metric.value)).toEqual([200, 220, 4]);
  expect(membrane.warnings).toContain('gross-area-no-roll-reuse');
  expect(membrane.warnings).toContain('openings-not-subtracted');
  facts.schedule.surfaceBuildUpRows[0]!.semantic = 'net-geometric';
  expect(
    createMaterialPlanRows(facts).find((row) => row.id === 'membrane')!.metrics,
  ).toHaveLength(1);
});

it('retains manufacturer quantity/cost range and never prices geometric positions', () => {
  const facts = materialTestFacts();
  facts.coverings = [
    {
      id: 'cover',
      role: 'primary',
      roofPlaneIds: ['plane'],
      product: {
        catalogRef: {
          productId: 'product',
          technicalRevisionId: 'revision',
          variantId: 'variant',
        },
        technicalSpecSnapshot: {
          schemaVersion: 1,
          kind: 'roof-tile',
          physical: { widthMm: 300, lengthMm: 400 },
          effectiveCoverWidthMm: 250,
          installationModes: [],
        },
      },
    } as ExportFacts['coverings'][number],
  ];
  facts.coveringLayouts = [
    {
      kind: 'roof-tile',
      status: 'resolved',
      assignmentId: 'cover',
      roofPlaneIds: ['plane'],
      planes: [],
      totalPositions: 99999,
      fullPositions: 99999,
      cutPositions: 0,
      splitPositions: 0,
      issueCodes: [],
      issues: [],
      declaredConsumptionReference: {
        netAssignedAreaMm2: 175_000_000,
        minimumPieces: 1558,
        maximumPieces: 1733,
      },
    } satisfies RoofTileLayoutResult,
  ];
  const row = createMaterialPlanRows(facts).find(
    (row) => row.category === 'covering',
  )!;
  expect(row.quantity).toBeUndefined();
  expect(row.range).toEqual({ min: 1558, max: 1733 });
  expect(materialValue(row, { ...manual, amountMinor: 300 })).toEqual({
    min: 467400,
    max: 519900,
  });
  expect(
    acceptMaterialRow(createEmptyCostScenario('PLN'), row, manual, 'Tile')
      .lines,
  ).toHaveLength(0);
  if (facts.coveringLayouts[0]!.kind === 'roof-tile')
    delete facts.coveringLayouts[0]!.declaredConsumptionReference;
  expect(
    materialValue(
      createMaterialPlanRows(facts).find((row) => row.category === 'covering')!,
      manual,
    ),
  ).toBeUndefined();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('works with an unavailable catalogue and reviews updates while keeping manual price ownership', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'catalog-unavailable' } }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
  );
  const facts = materialTestFacts();
  facts.battensEnabled = true;
  facts.schedule = createRoofMemberSchedule({
    skeleton: facts.skeleton,
    buildUp: [
      {
        id: 'batten',
        familyKey: 'L',
        memberKind: 'batten',
        lengthMm: 12000,
        section: { widthMm: 60, depthMm: 40 },
      },
    ],
  });
  const change = vi.fn();
  function Harness() {
    const [prices, setPrices] = useState<
      Record<string, MaterialPriceSelection>
    >({});
    const [scenario, setScenario] = useState<CostScenario>(
      createEmptyCostScenario('PLN'),
    );
    return createElement(MaterialPlan, {
      facts,
      scenario,
      prices,
      onPricesChange: setPrices,
      onScenarioChange: (next) => {
        change(next);
        setScenario(next);
      },
      onOpenCutting: vi.fn(),
      onOpenLayers: vi.fn(),
      onOpenCovering: vi.fn(),
      onOpenCosting: vi.fn(),
      onOpenExport: vi.fn(),
    });
  }
  render(
    createElement(
      QueryClientProvider,
      {
        client: new QueryClient({
          defaultOptions: { queries: { retry: false } },
        }),
      },
      createElement(Harness),
    ),
  );
  expect(
    await screen.findByText(
      'Katalog niedostępny — obliczenia lokalne działają',
    ),
  ).toBeTruthy();
  const row = within(screen.getByTestId('material-row-battens'));
  fireEvent.change(row.getByRole('combobox'), { target: { value: 'manual' } });
  const input = row.getByRole('textbox');
  fireEvent.change(input, { target: { value: '12,34' } });
  fireEvent.blur(input);
  fireEvent.click(row.getByRole('button', { name: 'Dodaj do kosztorysu' }));
  expect(change.mock.lastCall?.[0].lines[0].unitPriceMinor).toBe(1234);
  fireEvent.change(input, { target: { value: '15,00' } });
  fireEvent.blur(input);
  fireEvent.click(row.getByRole('button', { name: 'Aktualizuj kosztorys' }));
  expect(row.getByRole('status').textContent).toContain(
    'Proponowana aktualizacja',
  );
  expect(change).toHaveBeenCalledTimes(1);
  fireEvent.click(row.getByRole('button', { name: 'Zachowaj obecną' }));
  expect(change).toHaveBeenCalledTimes(1);
});

it('requires exact variant, sale unit, currency and auditable gross tax basis', () => {
  const row = {
    ...geometricRow(),
    product: { name: 'Product', variantId: 'variant', facts: [] },
  };
  const price: VariantPrice = {
    variantId: 'variant',
    currencyCode: 'PLN',
    ownerLabel: 'Supplier',
    entry: {
      id: 'price',
      priceListId: 'list',
      commercialVariantId: 'variant',
      saleUnit: 'm',
      netAmountMinor: 100,
      validFrom: '2026-09-01',
      sourceAmountBasis: 'gross',
      sourceVatRateBps: 2300,
    },
  };
  expect(compatibleMaterialPrices(row, [price], 'PLN')).toHaveLength(1);
  expect(
    compatibleMaterialPrices(
      row,
      [{ ...price, entry: { ...price.entry, saleUnit: 'piece' } }],
      'PLN',
    ),
  ).toHaveLength(0);
  expect(compatibleMaterialPrices(row, [price], 'EUR')).toHaveLength(0);
  expect(
    compatibleMaterialPrices(
      row,
      [{ ...price, entry: { ...price.entry, sourceVatRateBps: undefined } }],
      'PLN',
    ),
  ).toHaveLength(0);
  expect(
    materialValue(row, {
      ...manual,
      source: 'price-list',
      variantId: 'other',
      saleUnit: 'm',
    }),
  ).toBeUndefined();
});

it('updates only on acceptance and preserves manually edited quantity', () => {
  const row = geometricRow();
  const initial = acceptMaterialRow(
    createEmptyCostScenario('PLN'),
    row,
    manual,
    'Battens',
  );
  const changed = { ...row, quantity: 15 };
  expect(initial.lines[0]!.quantity.value).toBe(12);
  expect(
    acceptMaterialRow(initial, changed, manual, 'Battens').lines[0]!.quantity
      .value,
  ).toBe(15);
  const owned = replaceCostLine(
    initial,
    withManualQuantity(initial.lines[0]!, 9),
  );
  expect(
    acceptMaterialRow(
      owned,
      changed,
      { ...manual, amountMinor: 200 },
      'Battens',
    ).lines[0]!.quantity.value,
  ).toBe(9);
});

it('keeps enabled unresolved layers visible without inventing quantities', () => {
  const rows = createMaterialPlanRows({
    ...materialTestFacts(),
    battensEnabled: true,
    counterBattensEnabled: true,
    membraneEnabled: true,
  });
  for (const id of ['battens', 'counter-battens', 'membrane']) {
    const row = rows.find((item) => item.id === id)!;
    expect(row).toBeDefined();
    expect(row.quantity).toBeUndefined();
    expect(row.partial).toBe(true);
    expect(row.suitability).toBe('manual-required');
    expect(materialValue(row, manual)).toBeUndefined();
  }
});

it('exports basis, partial warnings, price provenance and safe CSV strings offline', () => {
  const row = {
    ...geometricRow(),
    partial: true,
    product: { name: '=DANGEROUS', facts: [] },
  };
  const csv = materialCsv([row], { [row.id]: manual });
  expect(csv).toContain('GEOMETRIA');
  expect(csv).toContain('CZĘŚCIOWE');
  expect(csv).toContain("'=DANGEROUS");
  expect(csv).toContain('CENA RĘCZNA');
  const section = createExportCandidates({
    ...materialTestFacts(),
    materialRows: [row],
    materialPrices: { [row.id]: manual },
  }).find((candidate) => candidate.kind === 'material-list')!.section;
  expect(section?.kind).toBe('material-list');
  if (section?.kind === 'material-list') {
    expect(section.rows[0]!.basis).toBe('geometric-length');
    expect(section.rows[0]!.warnings).toContain('no-allowance-no-stock-length');
  }
});
