import {
  calculateLine,
  createCostLine,
  addCostLine,
  replaceCostLine,
  type CostQuantityBasis,
  type CostScenario,
  type CostSuitability,
  type QuantityUnit,
} from '@cieslacalc/cost-core';
import type { MembraneProductSelection } from '@cieslacalc/covering-core';
import type { VariantPrice } from '../pricing/client';
import type { ExportFacts } from './export-adapter';
import { createCostSuggestions } from './cost-adapter';

export type MaterialCategory = 'timber' | 'layers' | 'covering' | 'other';
export interface MaterialPlanRow {
  id: string;
  category: MaterialCategory;
  labelKey: string;
  description?: string;
  quantity?: number;
  range?: { min: number; max: number };
  unit: QuantityUnit;
  basis: CostQuantityBasis;
  suitability: CostSuitability;
  partial: boolean;
  product?: { name: string; variantId?: string; facts: string[] };
  productSource?: 'catalog' | 'manual';
  metrics: {
    labelKey: string;
    value: number;
    maxValue?: number;
    unit: string;
  }[];
  warnings: string[];
  sourceReferences: string[];
  costSuggestionKey?: string;
  /** Membrane only: a roll plan exists once every plane resolved courses. */
  membranePlan?: 'roll-plan' | 'net-only';
  membraneRoll?: {
    widthMm: number;
    lengthMm: number;
    overlapMm: number;
    revisionCode?: string;
  };
}

export interface MaterialPriceSelection {
  source: 'manual' | 'price-list';
  amountMinor: number;
  currencyCode: string;
  entryId?: string;
  provenance: string;
  variantId?: string;
  saleUnit?: QuantityUnit;
  valid?: boolean;
}

/** Projection only. Never invokes a geometry or procurement solver. */
export function createMaterialPlanRows(
  facts: ExportFacts,
  membrane?: MembraneProductSelection,
): MaterialPlanRow[] {
  const rows: MaterialPlanRow[] = [];
  if (facts.k1.status === 'resolved') {
    const section = facts.k1.blank.section;
    if (facts.cutting?.value.status === 'complete') {
      const groups = new Map<string, { length: number; count: number }>();
      for (const usage of facts.cutting.value.stockUsages) {
        const group = groups.get(usage.stockOptionId);
        groups.set(usage.stockOptionId, {
          length: usage.originalLengthMm,
          count: (group?.count ?? 0) + 1,
        });
      }
      for (const [stockId, group] of groups) {
        const stock = facts.cutting.scenario.stocks.find(
          (draft) => `k1-stock-${draft.id}` === stockId,
        );
        rows.push({
          id: `material:${stockId}`,
          costSuggestionKey:
            [...groups.values()].filter(
              (candidate) => candidate.length === group.length,
            ).length === 1
              ? `k1-stock:${group.length}`
              : undefined,
          category: 'timber',
          labelKey: 'k1',
          description: `${section.widthMm} × ${section.depthMm} mm · ${group.length / 1000} m`,
          quantity: group.count,
          unit: 'piece',
          basis: 'procurement-stock',
          suitability: 'exact-purchase',
          partial: false,
          product: stock?.sourceLabel
            ? {
                name: stock.sourceLabel,
                variantId: stock.commercialVariantId,
                facts: stock.commercialFacts ?? [],
              }
            : undefined,
          productSource: stock?.sourceLabel ? 'catalog' : undefined,
          metrics: [],
          warnings: [],
          sourceReferences: facts.k1.requiredPieces.map((piece) => piece.id),
        });
      }
    } else {
      rows.push({
        id: 'material:k1-requirement',
        category: 'timber',
        labelKey: 'k1',
        description: `${section.widthMm} × ${section.depthMm} mm`,
        quantity: facts.k1.requiredPieces.length,
        unit: 'piece',
        basis: 'fabrication-requirement',
        suitability: 'execution-based',
        partial: !!facts.cutting,
        metrics: [
          {
            labelKey: 'blankLength',
            value: facts.k1.blank.requiredBlankLengthMm / 1000,
            unit: 'm',
          },
        ],
        warnings: ['k1-needs-cutting'],
        sourceReferences: facts.k1.requiredPieces.map((piece) => piece.id),
      });
    }
  }
  for (const suggestion of createCostSuggestions(facts)) {
    if (
      suggestion.kind === 'k1-stock' ||
      // V48: commercial pieces are shown by the purchase panel on the
      // material's own row, never as extra rows in the plan.
      suggestion.kind === 'linear-stock' ||
      suggestion.kind.startsWith('covering-')
    )
      continue;
    if (!('quantity' in suggestion)) continue;
    const row: MaterialPlanRow = {
      id: suggestion.key,
      category: 'layers',
      labelKey:
        suggestion.kind === 'counter-battens'
          ? 'counterBattens'
          : suggestion.kind,
      quantity: suggestion.quantity.value,
      unit: suggestion.quantity.unit,
      basis: suggestion.quantityBasis,
      suitability: suggestion.suitability,
      partial: suggestion.kind === 'counter-battens' && suggestion.partial,
      metrics: [],
      warnings: suggestion.noteKeys,
      sourceReferences: facts.schedule.buildUpRows
        .filter(
          (item) =>
            item.memberKind ===
            (suggestion.kind === 'battens' ? 'batten' : 'counter-batten'),
        )
        .map((item) => item.id),
    };
    if (suggestion.kind === 'membrane') {
      const surfaces = facts.schedule.surfaceBuildUpRows;
      row.sourceReferences = surfaces.flatMap((item) => item.roofPlaneIds);
      row.metrics.push({
        labelKey: 'netArea',
        value:
          surfaces.reduce((sum, item) => sum + item.areaMm2, 0) / 1_000_000,
        unit: 'm2',
      });
      const rollPlan =
        surfaces.length > 0 &&
        surfaces.every(
          (item) =>
            item.semantic === 'gross-installed' && item.rollCount !== undefined,
        );
      row.membranePlan = rollPlan ? 'roll-plan' : 'net-only';
      if (rollPlan) {
        const sum = (pick: (item: (typeof surfaces)[number]) => number) =>
          surfaces.reduce((total, item) => total + pick(item), 0) / 1_000_000;
        row.metrics.push({
          labelKey: 'grossArea',
          value: suggestion.quantity.value,
          unit: 'm2',
        });
        // Breakdown of gross − net, straight from the course solver. Absent
        // on snapshots produced before V43A; never re-derived here.
        if (surfaces.every((item) => item.overlapAreaMm2 !== undefined)) {
          const overlap = sum((item) => item.overlapAreaMm2 ?? 0);
          const overrun = sum((item) => item.ridgeOverrunAreaMm2 ?? 0);
          // V47: end laps along the roll length (older snapshots: absent).
          const endOverlap = sum((item) => item.endOverlapAreaMm2 ?? 0);
          const simplification =
            suggestion.quantity.value -
            overlap -
            overrun -
            endOverlap -
            (row.metrics[0]?.value ?? 0);
          row.metrics.push(
            { labelKey: 'overlapArea', value: overlap, unit: 'm2' },
            ...(endOverlap > 1e-6
              ? [
                  {
                    labelKey: 'endOverlapArea',
                    value: endOverlap,
                    unit: 'm2',
                  },
                ]
              : []),
            ...(overrun > 1e-6
              ? [{ labelKey: 'ridgeOverrunArea', value: overrun, unit: 'm2' }]
              : []),
            ...(simplification > 1e-6
              ? [
                  {
                    labelKey: 'simplificationArea',
                    value: simplification,
                    unit: 'm2',
                  },
                ]
              : []),
          );
        }
        row.metrics.push(
          {
            labelKey: 'courseCount',
            value: surfaces.reduce(
              (total, item) => total + (item.courseCount ?? 0),
              0,
            ),
            unit: 'course',
          },
          {
            labelKey: 'rollCount',
            value: surfaces.reduce(
              (total, item) => total + (item.rollCount ?? 0),
              0,
            ),
            unit: 'roll',
          },
        );
      }
      if (membrane) {
        row.productSource = membrane.catalogRef ? 'catalog' : 'manual';
        const spec = membrane.technicalSpecSnapshot;
        row.membraneRoll = {
          widthMm: spec.rollWidthMm,
          lengthMm: spec.rollLengthMm,
          overlapMm: spec.minimumOverlapMm,
          revisionCode: membrane.displaySnapshot?.revisionCode,
        };
        // Labelled product facts so the CSV and material document read the
        // same roll data as the card.
        row.metrics.push(
          { labelKey: 'rollWidth', value: spec.rollWidthMm / 1000, unit: 'm' },
          {
            labelKey: 'rollLength',
            value: spec.rollLengthMm / 1000,
            unit: 'm',
          },
          {
            labelKey: 'overlapUsed',
            value: spec.minimumOverlapMm / 10,
            unit: 'cm',
          },
        );
        // cost-core has no roll unit: the line stays priced per m², and a
        // per-roll price list entry can never join this row (unit mismatch).
        if (spec.salesUnit === 'roll')
          row.warnings = [...row.warnings, 'membrane-sold-per-roll'];
        row.product = {
          name: [
            membrane.displaySnapshot?.manufacturer,
            membrane.displaySnapshot?.familyName,
            membrane.displaySnapshot?.variantName,
          ]
            .filter(Boolean)
            .join(' · '),
          variantId: membrane.catalogRef?.variantId,
          facts: [
            `${spec.rollWidthMm / 1000} × ${spec.rollLengthMm / 1000} m`,
            `${spec.minimumOverlapMm} mm`,
          ],
        };
      }
    }
    rows.push(row);
  }
  for (const assignment of facts.coverings) {
    const layouts = (facts.coveringLayouts ?? []).filter(
      (item) => item.assignmentId === assignment.id,
    );
    const declared = layouts.flatMap((item) =>
      item.kind === 'roof-tile' &&
      item.status === 'resolved' &&
      item.declaredConsumptionReference
        ? [item.declaredConsumptionReference]
        : [],
    );
    const complete = declared.length === layouts.length && declared.length > 0;
    const name = [
      assignment.product.displaySnapshot?.manufacturer,
      assignment.product.displaySnapshot?.familyName,
      assignment.product.displaySnapshot?.variantName,
    ]
      .filter(Boolean)
      .join(' · ');
    rows.push({
      id: `material:covering:${assignment.id}`,
      category: 'covering',
      labelKey:
        assignment.product.technicalSpecSnapshot.kind === 'roof-tile'
          ? 'tile'
          : 'covering',
      range: complete
        ? {
            min: declared.reduce((sum, item) => sum + item.minimumPieces, 0),
            max: declared.reduce((sum, item) => sum + item.maximumPieces, 0),
          }
        : undefined,
      unit: 'piece',
      basis: 'effective-coverage',
      suitability: complete ? 'execution-based' : 'manual-required',
      partial: !complete,
      product: {
        name,
        variantId: assignment.product.catalogRef?.variantId,
        facts: [],
      },
      productSource: assignment.product.catalogRef ? 'catalog' : 'manual',
      metrics: complete
        ? [
            {
              labelKey: 'netArea',
              value:
                declared.reduce(
                  (sum, item) => sum + item.netAssignedAreaMm2,
                  0,
                ) / 1_000_000,
              unit: 'm2',
            },
            ...(declared.reduce(
              (sum, item) => sum + item.netAssignedAreaMm2,
              0,
            ) > 0
              ? [
                  {
                    labelKey: 'consumption',
                    value:
                      declared.reduce(
                        (sum, item) => sum + item.minimumPieces,
                        0,
                      ) /
                      (declared.reduce(
                        (sum, item) => sum + item.netAssignedAreaMm2,
                        0,
                      ) /
                        1_000_000),
                    maxValue:
                      declared.reduce(
                        (sum, item) => sum + item.maximumPieces,
                        0,
                      ) /
                      (declared.reduce(
                        (sum, item) => sum + item.netAssignedAreaMm2,
                        0,
                      ) /
                        1_000_000),
                    unit: 'piece/m2',
                  },
                ]
              : []),
          ]
        : [],
      warnings: [
        complete
          ? 'declared-consumption-not-a-resolved-purchase-count'
          : 'covering-not-a-purchase-count',
      ],
      sourceReferences: assignment.roofPlaneIds,
    });
  }
  for (const [id, enabled, labelKey, unit, basis] of [
    ['battens', facts.battensEnabled, 'battens', 'm', 'geometric-length'],
    [
      'counter-battens',
      facts.counterBattensEnabled,
      'counterBattens',
      'm',
      'geometric-length',
    ],
    ['membrane', facts.membraneEnabled, 'membrane', 'm2', 'net-area'],
  ] as const) {
    if (enabled && !rows.some((row) => row.id === id))
      rows.push({
        id,
        category: 'layers',
        labelKey,
        unit,
        basis,
        suitability: 'manual-required',
        partial: true,
        metrics: [],
        warnings: ['layer-not-resolved'],
        sourceReferences: [],
      });
  }
  // Additional timber families remain visible as technical evidence, never procurement.
  for (const item of facts.schedule.timberRows.filter(
    (item) => item.familyKey !== 'K1' || facts.k1.status !== 'resolved',
  )) {
    rows.push({
      id: `material:technical:${item.id}`,
      category: 'other',
      labelKey: 'timberEvidence',
      description: item.familyKey,
      quantity: item.totalLengthMm / 1000,
      unit: 'm',
      basis: 'geometric-length',
      suitability: 'geometric-estimate',
      partial: false,
      metrics: [],
      warnings:
        item.familyKey === 'K1'
          ? ['k1-execution-unresolved']
          : ['no-allowance-no-stock-length'],
      sourceReferences: [item.id],
    });
  }
  return rows;
}

/** A safe price must join the deliberately selected variant and exact sale unit. */
export function compatibleMaterialPrices(
  row: MaterialPlanRow,
  options: readonly VariantPrice[],
  currencyCode: string,
): VariantPrice[] {
  if (
    !row.product?.variantId ||
    row.suitability === 'manual-required' ||
    row.basis === 'fabrication-requirement'
  )
    return [];
  return options.filter(
    (price) =>
      price.variantId === row.product?.variantId &&
      price.entry.commercialVariantId === row.product?.variantId &&
      price.entry.saleUnit === row.unit &&
      price.currencyCode === currencyCode &&
      (price.entry.sourceAmountBasis !== 'gross' ||
        price.entry.sourceVatRateBps !== undefined),
  );
}

export function materialValue(
  row: MaterialPlanRow,
  price: MaterialPriceSelection | undefined,
): { min: number; max: number } | undefined {
  if (
    !price ||
    price.valid === false ||
    row.suitability === 'manual-required' ||
    row.suitability === 'unavailable' ||
    row.basis === 'fabrication-requirement'
  )
    return undefined;
  if (
    price.source === 'price-list' &&
    (price.variantId !== row.product?.variantId || price.saleUnit !== row.unit)
  )
    return undefined;
  const range =
    row.range ??
    (row.quantity !== undefined
      ? { min: row.quantity, max: row.quantity }
      : undefined);
  if (!range) return undefined;
  const net = (value: number) =>
    calculateLine(
      createCostLine({
        id: row.id,
        category: 'material',
        label: row.labelKey,
        quantity: { value, unit: row.unit },
        quantityBasis: row.basis,
        suitability: row.suitability,
        currencyCode: price.currencyCode,
        unitPriceMinor: price.amountMinor,
        source: price.source,
        noteKeys: row.warnings,
      }),
    ).netMinor ?? 0;
  return { min: net(range.min), max: net(range.max) };
}

/** Explicit user acceptance only. A range needs a user-owned quantity first. */
export function acceptMaterialRow(
  scenario: CostScenario,
  row: MaterialPlanRow,
  price: MaterialPriceSelection,
  label: string,
): CostScenario {
  if (
    price.currencyCode !== scenario.currencyCode ||
    row.quantity === undefined ||
    row.range ||
    !materialValue(row, price)
  )
    return scenario;
  const existing = scenario.lines.find(
    (line) => line.id === row.id || line.id === row.costSuggestionKey,
  );
  const quantity =
    existing?.source === 'manual'
      ? existing.quantity
      : { value: row.quantity, unit: row.unit };
  const line = createCostLine({
    id: existing?.id ?? row.id,
    label,
    category: 'material',
    quantity,
    quantityBasis:
      existing?.source === 'manual' ? existing.quantityBasis : row.basis,
    suitability: row.suitability,
    currencyCode: scenario.currencyCode,
    unitPriceMinor: price.amountMinor,
    source:
      existing?.source === 'manual'
        ? 'manual'
        : price.source === 'manual'
          ? 'project-derived'
          : 'price-list',
    projectQuantityValue:
      existing?.source === 'manual' ? undefined : row.quantity,
    included: existing?.included ?? true,
    noteKeys: row.warnings,
    priceProvenance: {
      source: price.source,
      label: price.provenance,
      entryId: price.entryId,
      variantId: price.variantId,
      saleUnit: price.saleUnit,
    },
  });
  return existing
    ? replaceCostLine(scenario, line)
    : addCostLine(scenario, line);
}

export function materialScenarioPrices(
  scenario: CostScenario | undefined,
  rows: readonly MaterialPlanRow[],
): Record<string, MaterialPriceSelection> {
  if (!scenario) return {};
  const prices: Record<string, MaterialPriceSelection> = {};
  for (const row of rows) {
    const line = scenario.lines.find(
      (candidate) =>
        candidate.id === row.id || candidate.id === row.costSuggestionKey,
    );
    if (line?.unitPriceMinor === undefined || line.quantity.unit !== row.unit)
      continue;
    const provenance = line.priceProvenance;
    if (line.source === 'price-list' && !provenance) continue;
    prices[row.id] = {
      source: provenance?.source ?? 'manual',
      amountMinor: line.unitPriceMinor,
      currencyCode: line.currencyCode,
      provenance: provenance?.label ?? 'manual',
      entryId: provenance?.entryId,
      variantId: provenance?.variantId,
      saleUnit: provenance?.saleUnit,
    };
  }
  return prices;
}
