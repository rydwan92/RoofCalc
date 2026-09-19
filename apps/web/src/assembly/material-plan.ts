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
import { purchasedPieces } from '@cieslacalc/tile-procurement';
import type { TilePurchasePlan } from './tile-purchase';
import type { RoofSystemFacts } from './roof-system';
import { ROOF_SYSTEM_ROLE_GROUP } from '@cieslacalc/roof-system-core';

/**
 * V51 whole-roof grouping. Covering first (what the roof is), then its layers,
 * eave details, drainage and finally structural timber.
 */
export type MaterialCategory =
  'covering' | 'layers' | 'eave' | 'drainage' | 'timber' | 'other';
export const MATERIAL_CATEGORY_ORDER: readonly MaterialCategory[] = [
  'covering',
  'layers',
  'eave',
  'drainage',
  'timber',
  'other',
];
/** V51 sub-groups inside POKRYCIE, for readable hierarchy only. */
export type MaterialSubgroup = 'tile' | 'ridge' | 'verge' | 'accessory';
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
  /**
   * V50: the roof-tile assignment this row represents, and its prepared
   * purchase plan when there is one. The row never recomputes the plan.
   */
  tileAssignmentId?: string;
  tilePlan?: TilePurchasePlan;
  subgroup?: MaterialSubgroup;
  /** V51: a roof-system row (drainage or line component) and its role. */
  roofSystemRole?: string;
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
      suggestion.kind.startsWith('covering-') ||
      // V50: the tile plan owns its own rows (base tile + accessories).
      suggestion.kind.startsWith('tile-') ||
      // V51: roof-system rows come from the resolved plan below.
      suggestion.kind === 'roof-system'
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
    const tilePlan = facts.tilePurchasePlans?.find(
      (plan) => plan.assignmentId === assignment.id,
    );
    if (tilePlan) {
      rows.push(...tilePlanRows(assignment.id, tilePlan));
      continue;
    }
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
      ...(assignment.product.technicalSpecSnapshot.kind === 'roof-tile'
        ? { tileAssignmentId: assignment.id }
        : {}),
      subgroup: 'tile',
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
  if (facts.roofSystem) rows.push(...roofSystemRows(facts.roofSystem));
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

/**
 * V50: a prepared tile plan becomes the covering's purchase row plus one row
 * per accessory role the roof needs. The declared consumption survives only
 * as a cross-check metric on the plan, never as the headline quantity.
 */
function tilePlanRows(
  assignmentId: string,
  plan: TilePurchasePlan,
): MaterialPlanRow[] {
  const requirement = plan.requirement;
  const pieces = purchasedPieces(requirement);
  const purchase = requirement.purchase;
  const trusted = pieces !== undefined;
  const base: MaterialPlanRow = {
    id: `tile-purchase:${assignmentId}`,
    costSuggestionKey: `tile-purchase:${assignmentId}`,
    category: 'covering',
    labelKey: 'tileBase',
    quantity: pieces,
    unit: 'piece',
    basis: 'procurement-stock',
    suitability: !trusted
      ? 'manual-required'
      : requirement.status === 'exact'
        ? 'exact-purchase'
        : 'execution-based',
    partial: !trusted,
    product: {
      name: plan.productName,
      variantId: plan.variantId,
      facts: [],
    },
    productSource: plan.productId ? 'catalog' : 'manual',
    metrics: [
      {
        labelKey: 'tileFull',
        value: requirement.fullPositionCount,
        unit: 'piece',
      },
      {
        labelKey: 'tileCut',
        value: requirement.cutPositionCount,
        unit: 'piece',
      },
      {
        labelKey: 'tilePhysical',
        value: requirement.physicalBaseTileCount,
        unit: 'piece',
      },
      ...(requirement.reservePieces > 0
        ? [
            {
              labelKey: 'tileReserve',
              value: requirement.reservePieces,
              unit: 'piece',
            },
          ]
        : []),
      {
        labelKey: 'tileRequired',
        value: requirement.requiredPieces,
        unit: 'piece',
      },
      ...(purchase && purchase.saleUnit !== 'piece'
        ? [
            {
              labelKey:
                purchase.saleUnit === 'pack' ? 'tilePacks' : 'tilePallets',
              value: purchase.units,
              unit: purchase.saleUnit,
            },
            {
              labelKey: 'tilePiecesPerUnit',
              value: purchase.piecesPerUnit,
              unit: 'piece',
            },
            {
              labelKey: 'tileCommercialOverage',
              value: purchase.commercialOveragePieces,
              unit: 'piece',
            },
          ]
        : []),
    ],
    warnings: [
      ...(requirement.status === 'exact' ? ['tile-plan-exact'] : []),
      ...(requirement.status === 'conservative'
        ? ['tile-plan-conservative-no-offcut-reuse']
        : []),
      ...(requirement.splitPositionCount > 0
        ? ['tile-plan-split-fragments']
        : []),
      ...(plan.packagingStale ? ['tile-plan-packaging-stale'] : []),
      ...(!trusted ? ['tile-plan-layout-unresolved'] : []),
    ],
    sourceReferences: [assignmentId],
    tileAssignmentId: assignmentId,
    tilePlan: plan,
    subgroup: 'tile',
  };
  const accessories = plan.accessories.map<MaterialPlanRow>((item) => ({
    id: `tile-accessory:${assignmentId}:${item.role}`,
    category: 'covering',
    labelKey: `tileAccessory.${item.role}`,
    description: item.selection
      ? [
          item.selection.displaySnapshot?.familyName,
          item.selection.displaySnapshot?.variantName,
        ]
          .filter(Boolean)
          .join(' · ') || undefined
      : undefined,
    quantity: item.quantity,
    unit: 'piece',
    basis: 'procurement-stock',
    suitability:
      item.status === 'resolved'
        ? 'execution-based'
        : item.status === 'declared-approximate'
          ? 'geometric-estimate'
          : 'manual-required',
    partial: item.quantity === undefined,
    metrics: [
      ...(item.lineLengthMm !== undefined
        ? [
            {
              labelKey: 'lineLength',
              value: item.lineLengthMm / 1000,
              unit: 'm',
            },
          ]
        : []),
      ...(item.courseCount !== undefined
        ? [
            {
              labelKey: 'courseCountTiles',
              value: item.courseCount,
              unit: 'row',
            },
          ]
        : []),
    ],
    warnings: [
      ...(item.reason ? [`accessory-${item.reason}`] : []),
      ...(item.status === 'declared-approximate'
        ? ['accessory-declared-approximate']
        : []),
    ],
    sourceReferences: [assignmentId],
    tileAssignmentId: assignmentId,
    subgroup:
      item.role === 'ridge' || item.role === 'hip-ridge'
        ? 'ridge'
        : item.role === 'verge-left' || item.role === 'verge-right'
          ? 'verge'
          : 'accessory',
  }));
  return [base, ...accessories];
}

/**
 * V51: the roof-system BOM as material rows — line components and drainage.
 * Quantities come from the resolved plan; a row needing a decision carries
 * no quantity, so it can never be priced or costed by accident.
 */
function roofSystemRows(facts: RoofSystemFacts): MaterialPlanRow[] {
  const rows: MaterialPlanRow[] = facts.lineComponents
    .filter((item) => item.status === 'resolved')
    .map((item) => ({
      id: `line-component:${item.componentId}`,
      costSuggestionKey: `line-component:${item.componentId}`,
      category:
        ROOF_SYSTEM_ROLE_GROUP[item.role] === 'eave' ? 'eave' : 'covering',
      ...(ROOF_SYSTEM_ROLE_GROUP[item.role] === 'eave'
        ? {}
        : { subgroup: 'accessory' as const }),
      labelKey: `roofSystem.${item.role}`,
      description: item.name,
      quantity: item.quantity,
      unit: 'piece',
      basis: item.rule === 'manual' ? 'manual' : 'procurement-stock',
      suitability: 'execution-based',
      partial: false,
      product: { name: item.name, facts: [] },
      productSource: 'manual',
      metrics: [
        { labelKey: 'lineLength', value: item.lineLengthMm / 1000, unit: 'm' },
      ],
      warnings: [
        item.rule === 'manual'
          ? 'line-component-manual'
          : 'line-component-per-feature',
      ],
      sourceReferences: item.featureIds,
      roofSystemRole: item.role,
    }));
  const plan = facts.drainage;
  if (plan.status === 'disabled' || !plan.bom.length) return rows;
  const system = facts.intent?.drainage?.system;
  for (const item of plan.bom) {
    const resolved = item.status === 'resolved' && item.quantity !== undefined;
    const lengthLabel =
      item.lengthMm !== undefined ? `${item.lengthMm / 1000} m` : undefined;
    const handLabel =
      item.hand && item.hand !== 'universal' ? item.hand : undefined;
    const metrics: MaterialPlanRow['metrics'] = [];
    if (
      item.role === 'gutter-section' &&
      item.key === plan.bom.find((r) => r.role === 'gutter-section')?.key
    ) {
      metrics.push({
        labelKey: 'drainageGutterLength',
        value: plan.totalGutterLengthMm / 1000,
        unit: 'm',
      });
      if (plan.purchasedGutterLengthMm !== undefined)
        metrics.push(
          {
            labelKey: 'purchasedLength',
            value: plan.purchasedGutterLengthMm / 1000,
            unit: 'm',
          },
          {
            labelKey: 'commercialOverageLength',
            value:
              (plan.purchasedGutterLengthMm - plan.totalGutterLengthMm) / 1000,
            unit: 'm',
          },
        );
    }
    if (item.role === 'gutter-hook' && plan.hooks.appliedSpacingMm) {
      if (plan.hooks.maxSpacingMm !== undefined)
        metrics.push({
          labelKey: 'hookMaxSpacing',
          value: plan.hooks.maxSpacingMm / 10,
          unit: 'cm',
        });
      if (plan.hooks.actualIntervalMm !== undefined)
        metrics.push({
          labelKey: 'hookActualSpacing',
          value: Math.round(plan.hooks.actualIntervalMm) / 10,
          unit: 'cm',
        });
    }
    rows.push({
      id: `drainage:${item.key}`,
      costSuggestionKey: `drainage:${item.key}`,
      category: 'drainage',
      labelKey: handLabel
        ? `drainage.${item.role}.${handLabel}`
        : `drainage.${item.role}`,
      ...(lengthLabel ? { description: lengthLabel } : {}),
      ...(resolved ? { quantity: item.quantity } : {}),
      unit: 'piece',
      basis: item.rule === 'manual' ? 'manual' : 'procurement-stock',
      suitability: resolved ? 'execution-based' : 'manual-required',
      partial: !resolved,
      // A catalogue component names its product; a manual system names
      // the system the user typed, never a role key.
      ...(item.component
        ? {
            product: {
              name: item.component.catalogRef
                ? item.component.name
                : (system?.name ?? item.component.name),
              variantId: item.component.catalogRef?.variantId,
              facts: [],
            },
            productSource: item.component.catalogRef ? 'catalog' : 'manual',
          }
        : {}),
      metrics,
      warnings: [
        ...(item.reason ? [`drainage-${item.reason}`] : []),
        ...(item.rule === 'commercial-assembly' && resolved
          ? ['drainage-sections-no-reuse']
          : []),
      ],
      sourceReferences: plan.gutteredEaveIds,
      roofSystemRole: item.role,
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
