import type {
  CostLineCategory,
  CostQuantityBasis,
  CostSuitability,
  QuantityUnit,
} from '@cieslacalc/cost-core';
import type { ExportFacts } from './export-adapter';
import type { LinearMaterialKind } from './linear-material-plan';
import {
  tilePurchaseQuantity,
  tilePurchaseUnit,
  type TilePurchasePlan,
} from './tile-purchase';

/**
 * Truthful, safe-to-price suggestions derived from already-resolved project
 * facts. This is the ONLY place that decides which project quantities are
 * safe to turn into a cost-suggestion, and it never recomputes geometry,
 * procurement or covering layout (ADR-005/ADR-009): it only reads results
 * `apps/web` already trusts elsewhere (K1 cutting plan, schedule rows).
 *
 * Deliberately excluded from automatic suggestions: H1/J1/purlins/collar
 * ties (no fabrication/procurement resolution exists for them yet) and every
 * covering quantity (coverage positions and panel runs are geometric layout
 * facts, never a purchase count — §20/§46).
 */
interface CostSuggestionBase {
  key: string;
  category: CostLineCategory;
  quantityBasis: CostQuantityBasis;
  suitability: CostSuitability;
  noteKeys: string[];
}

export interface K1StockSuggestion extends CostSuggestionBase {
  kind: 'k1-stock';
  category: 'material';
  quantityBasis: 'procurement-stock';
  suitability: 'exact-purchase';
  quantity: { value: number; unit: 'piece' };
  stockLengthMm: number;
  sectionWidthMm: number;
  sectionDepthMm: number;
}

/**
 * V48: one commercial length of a linear build-up material, priced per piece.
 *
 * It replaces the geometric-length suggestion for that material as soon as a
 * purchase plan exists, so an estimate never multiplies a geometric metre by a
 * price that is quoted per length.
 */
export interface LinearStockSuggestion extends CostSuggestionBase {
  kind: 'linear-stock';
  category: 'material';
  quantityBasis: 'procurement-stock';
  suitability: 'exact-purchase';
  quantity: { value: number; unit: 'piece' };
  material: LinearMaterialKind;
  stockLengthMm: number;
  sectionWidthMm?: number;
  sectionDepthMm?: number;
  /** V49: the catalogue product this length is, or undefined when manual. */
  productName?: string;
  /**
   * Set only when the length is one catalogue variant with exactly one
   * per-piece price entry: a suggestion, never a silent update of an accepted
   * cost line.
   */
  unitPriceMinor?: number;
  currencyCode?: string;
  priceProvenance?: { ownerLabel?: string; validFrom: string };
}

export interface BattensSuggestion extends CostSuggestionBase {
  kind: 'battens';
  category: 'material';
  quantityBasis: 'geometric-length';
  suitability: 'geometric-estimate';
  quantity: { value: number; unit: 'm' };
}

export interface CounterBattensSuggestion extends CostSuggestionBase {
  kind: 'counter-battens';
  category: 'material';
  quantityBasis: 'geometric-length';
  suitability: 'geometric-estimate';
  quantity: { value: number; unit: 'm' };
  partial: boolean;
}

export interface MembraneSuggestion extends CostSuggestionBase {
  kind: 'membrane';
  category: 'material';
  /**
   * `'gross-area'` only once a roll product is set on the membrane layer
   * (`resolveMembraneLayout` course-fit succeeded for every assigned plane)
   * — still `geometric-estimate`, never `exact-purchase`: roll cutting,
   * reuse and waste across courses/openings are still not modelled.
   */
  quantityBasis: 'net-area' | 'gross-area';
  suitability: 'geometric-estimate';
  quantity: { value: number; unit: 'm2' };
}

export interface CoveringPositionsSuggestion extends CostSuggestionBase {
  kind: 'covering-positions';
  category: 'material';
  quantityBasis: 'effective-coverage';
  suitability: 'manual-required';
  totalPositions: number;
  manualUnit: 'piece';
}

/**
 * A manufacturer-declared consumption range (pieces/m² × net assigned area),
 * already computed by `resolveRoofTileLayout` when the product declares
 * `declaredUnitsPerM2`. Materially better than a bare position count, but
 * still not a resolved purchase count (waste, breakage and offcut reuse are
 * excluded) — `execution-based`, never `exact-purchase`.
 */
export interface CoveringConsumptionSuggestion extends CostSuggestionBase {
  kind: 'covering-consumption';
  category: 'material';
  quantityBasis: 'effective-coverage';
  suitability: 'execution-based';
  quantity: { value: number; unit: 'piece' };
  minimumPieces: number;
  maximumPieces: number;
  /** Set only when every contributing assignment shares one catalogue price. */
  unitPriceMinor?: number;
  currencyCode?: string;
}

export interface CoveringRunsSuggestion extends CostSuggestionBase {
  kind: 'covering-runs';
  category: 'material';
  quantityBasis: 'effective-coverage';
  suitability: 'manual-required';
  totalLengthMm: number;
  manualUnit: 'm';
}

/**
 * V50: the purchase quantity of one roof-tile assignment's prepared plan. It
 * replaces the declared-consumption and position suggestions for that
 * assignment, so the same tiles are never costed twice.
 */
export interface TilePurchaseSuggestion extends CostSuggestionBase {
  kind: 'tile-purchase';
  category: 'material';
  quantityBasis: 'procurement-stock';
  /** Exact only when every position is a full tile. */
  suitability: 'exact-purchase' | 'execution-based';
  quantity: { value: number; unit: QuantityUnit };
  assignmentId: string;
  productName: string;
  unitPriceMinor?: number;
  currencyCode?: string;
  priceProvenance?: { ownerLabel?: string; validFrom: string };
}

/**
 * V50: one resolved roof-tile system accessory (ridge, verge). Quantities
 * come from the plan's accessory requirements; a role that still requires a
 * decision is never suggested. Priced manually (no accessory prices yet).
 */
export interface TileAccessorySuggestion extends CostSuggestionBase {
  kind: 'tile-accessory';
  category: 'material';
  quantityBasis: 'procurement-stock';
  suitability: 'execution-based' | 'geometric-estimate';
  quantity: { value: number; unit: 'piece' };
  role: string;
  productName: string;
}

export type CostSuggestion =
  | TilePurchaseSuggestion
  | TileAccessorySuggestion
  | K1StockSuggestion
  | BattensSuggestion
  | CounterBattensSuggestion
  | MembraneSuggestion
  | CoveringPositionsSuggestion
  | CoveringRunsSuggestion
  | CoveringConsumptionSuggestion
  | LinearStockSuggestion;

const MM_PER_M = 1000;
const MM2_PER_M2 = 1_000_000;

/** Groups K1 stock usages by commercial length. Never recomputes the plan. */
function k1StockSuggestions(facts: ExportFacts): K1StockSuggestion[] {
  if (
    facts.k1.status !== 'resolved' ||
    facts.cutting?.value.status !== 'complete'
  )
    return [];
  const section = facts.k1.blank.section;
  const counts = new Map<number, number>();
  for (const usage of facts.cutting.value.stockUsages)
    counts.set(
      usage.originalLengthMm,
      (counts.get(usage.originalLengthMm) ?? 0) + 1,
    );
  return [...counts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([stockLengthMm, count]) => ({
      kind: 'k1-stock' as const,
      key: `k1-stock:${stockLengthMm}`,
      category: 'material' as const,
      quantityBasis: 'procurement-stock' as const,
      suitability: 'exact-purchase' as const,
      quantity: { value: count, unit: 'piece' as const },
      stockLengthMm,
      sectionWidthMm: section.widthMm,
      sectionDepthMm: section.depthMm,
      noteKeys: [],
    }));
}

function linearStockSuggestions(facts: ExportFacts): LinearStockSuggestion[] {
  const suggestions: LinearStockSuggestion[] = [];
  for (const material of ['batten', 'counter-batten'] as const) {
    const plan = facts.linearPlans?.[material];
    if (!plan || plan.stock.length === 0) continue;
    const section = plan.section;
    for (const item of [...plan.stock].sort(
      (a, b) =>
        a.lengthMm - b.lengthMm ||
        a.stockOptionId.localeCompare(b.stockOptionId),
    )) {
      const source = plan.stockSources[item.stockOptionId];
      const catalogue = source?.kind === 'catalogue' ? source : undefined;
      // One variant, one per-piece entry: anything else would be a guess.
      const entries = catalogue?.variantId
        ? (facts.variantPrices ?? []).filter(
            (row) => row.variantId === catalogue.variantId,
          )
        : [];
      const price =
        entries.length === 1 && entries[0]!.entry.saleUnit === 'piece'
          ? entries[0]!
          : undefined;
      suggestions.push({
        kind: 'linear-stock',
        key: `linear-stock:${material}:${item.stockOptionId}`,
        category: 'material',
        quantityBasis: 'procurement-stock',
        suitability: 'exact-purchase',
        quantity: { value: item.quantity, unit: 'piece' },
        material,
        stockLengthMm: item.lengthMm,
        ...(section
          ? {
              sectionWidthMm: section.widthMm,
              sectionDepthMm: section.depthMm,
            }
          : {}),
        ...(catalogue ? { productName: catalogue.productName } : {}),
        ...(price
          ? {
              unitPriceMinor: price.entry.netAmountMinor,
              currencyCode: price.currencyCode,
              priceProvenance: {
                ...(price.ownerLabel ? { ownerLabel: price.ownerLabel } : {}),
                validFrom: price.entry.validFrom,
              },
            }
          : {}),
        // The plan itself may still be partial; say so rather than implying
        // that buying these pieces completes the layer.
        noteKeys: [
          ...(plan.status === 'complete' ? [] : ['linear-plan-partial']),
          ...(price ? ['catalogue-price-verify-before-purchase'] : []),
        ],
      });
    }
  }
  return suggestions;
}

function battensSuggestion(facts: ExportFacts): BattensSuggestion[] {
  // V48: a resolved purchase plan supersedes the geometric-length estimate.
  if (facts.linearPlans?.batten) return [];
  if (!facts.battensEnabled) return [];
  const rows = facts.schedule.buildUpRows.filter(
    (row) => row.memberKind === 'batten',
  );
  if (!rows.length) return [];
  const totalLengthMm = rows.reduce((sum, row) => sum + row.totalLengthMm, 0);
  return [
    {
      kind: 'battens',
      key: 'battens',
      category: 'material',
      quantityBasis: 'geometric-length',
      suitability: 'geometric-estimate',
      quantity: { value: totalLengthMm / MM_PER_M, unit: 'm' },
      // V43B: the geometric length stays exact, but a gauge the covering never
      // confirmed must not read like a finished installation quantity.
      noteKeys: [
        'no-allowance-no-stock-length',
        ...(facts.battenWorkflow?.state === 'manual-unverified'
          ? ['batten-gauge-unverified']
          : facts.battenWorkflow?.state === 'manual-incompatible' ||
              facts.battenWorkflow?.state === 'auto-incompatible'
            ? ['batten-gauge-incompatible']
            : []),
      ],
    },
  ];
}

function counterBattensSuggestion(
  facts: ExportFacts,
): CounterBattensSuggestion[] {
  if (facts.linearPlans?.['counter-batten']) return [];
  if (!facts.counterBattensEnabled) return [];
  const rows = facts.schedule.buildUpRows.filter(
    (row) => row.memberKind === 'counter-batten',
  );
  if (!rows.length) return [];
  const totalLengthMm = rows.reduce((sum, row) => sum + row.totalLengthMm, 0);
  const partial = facts.counterBattens.status === 'partial';
  return [
    {
      kind: 'counter-battens',
      key: 'counter-battens',
      category: 'material',
      quantityBasis: 'geometric-length',
      suitability: 'geometric-estimate',
      quantity: { value: totalLengthMm / MM_PER_M, unit: 'm' },
      partial,
      noteKeys: partial
        ? ['no-allowance-no-stock-length', 'partial-counter-battens']
        : ['no-allowance-no-stock-length'],
    },
  ];
}

function membraneSuggestion(facts: ExportFacts): MembraneSuggestion[] {
  if (!facts.membraneEnabled) return [];
  const rows = facts.schedule.surfaceBuildUpRows;
  if (!rows.length) return [];
  // Gross (overlap-inclusive) data appears only once every contributing
  // plane resolved a roll product — a partial mix must never blend a gross
  // total from an incomplete subset (mirrors quantity-core's own rule).
  const allGross = rows.every((row) => row.semantic === 'gross-installed');
  if (allGross) {
    const grossAreaMm2 = rows.reduce(
      (sum, row) => sum + (row.grossAreaMm2 ?? 0),
      0,
    );
    const warningKeys = new Set(rows.flatMap((row) => row.warningKeys));
    return [
      {
        kind: 'membrane',
        key: 'membrane',
        category: 'material',
        quantityBasis: 'gross-area',
        suitability: 'geometric-estimate',
        quantity: { value: grossAreaMm2 / MM2_PER_M2, unit: 'm2' },
        noteKeys: [
          'gross-area-no-roll-reuse',
          ...(warningKeys.has('hip-course-width-approximated')
            ? ['hip-course-width-approximated']
            : []),
          ...(warningKeys.has('openings-not-subtracted')
            ? ['openings-not-subtracted']
            : []),
        ],
      },
    ];
  }
  const areaMm2 = rows.reduce((sum, row) => sum + row.areaMm2, 0);
  return [
    {
      kind: 'membrane',
      key: 'membrane',
      category: 'material',
      quantityBasis: 'net-area',
      suitability: 'geometric-estimate',
      quantity: { value: areaMm2 / MM2_PER_M2, unit: 'm2' },
      noteKeys: ['net-area-no-overlap-no-rolls'],
    },
  ];
}

/**
 * A catalogue price for the tile assignments feeding a consumption
 * suggestion, only when every one of them resolves to the exact same price
 * (same amount and currency) — mixing two different priced products into
 * one blended number would misstate the estimate, so a mismatch leaves the
 * price blank and lets the user price it themselves.
 */
function resolveConsumptionPrice(
  facts: ExportFacts,
  assignmentIds: ReadonlySet<string>,
): { unitPriceMinor: number; currencyCode: string } | undefined {
  if (!facts.variantPrices?.length) return undefined;
  const priceByVariantId = new Map(
    facts.variantPrices
      .filter(
        (row) =>
          row.entry.saleUnit === 'piece' &&
          facts.variantPrices!.filter(
            (candidate) => candidate.variantId === row.variantId,
          ).length === 1,
      )
      .map((row) => [row.variantId, row]),
  );
  const prices = [...assignmentIds].flatMap((assignmentId) => {
    const assignment = facts.coverings.find((row) => row.id === assignmentId);
    const variantId = assignment?.product.catalogRef?.variantId;
    const price = variantId ? priceByVariantId.get(variantId) : undefined;
    return price
      ? [
          {
            unitPriceMinor: price.entry.netAmountMinor,
            currencyCode: price.currencyCode,
          },
        ]
      : [];
  });
  if (!prices.length || prices.length !== assignmentIds.size) return undefined;
  const variants = new Set(
    [...assignmentIds].map(
      (id) =>
        facts.coverings.find((assignment) => assignment.id === id)?.product
          .catalogRef?.variantId,
    ),
  );
  if (variants.size !== 1 || variants.has(undefined)) return undefined;
  const first = prices[0]!;
  const allSame = prices.every(
    (price) =>
      price.unitPriceMinor === first.unitPriceMinor &&
      price.currencyCode === first.currencyCode,
  );
  return allSame ? first : undefined;
}

/**
 * Covering positions/runs are never auto-priced by themselves (§20/§46):
 * they are geometric layout facts, not a commercial purchase count. The one
 * exception is a manufacturer's own declared consumption (pieces/m²) already
 * resolved by `resolveRoofTileLayout` — that is the product's own stated
 * purchase guidance, not geometry we invented, so it may pre-fill a quantity
 * at `execution-based` suitability. Assignments with a declared consumption
 * are excluded from the bare-position-count fallback so the same tiles are
 * never suggested twice.
 */
function coveringSuggestions(
  facts: ExportFacts,
): (
  | CoveringPositionsSuggestion
  | CoveringRunsSuggestion
  | CoveringConsumptionSuggestion
)[] {
  const planned = plannedTileAssignmentIds(facts);
  const tileLayoutsWithConsumption = (facts.coveringLayouts ?? []).filter(
    (layout) =>
      layout.kind === 'roof-tile' &&
      layout.status === 'resolved' &&
      layout.declaredConsumptionReference &&
      !planned.has(layout.assignmentId),
  );
  const consumptionAssignmentIds = new Set(
    tileLayoutsWithConsumption.map((layout) => layout.assignmentId),
  );
  const positionRows = facts.schedule.coveringRows.filter(
    (row) =>
      row.semantic === 'effective-coverage-position' &&
      !consumptionAssignmentIds.has(row.assignmentId) &&
      !planned.has(row.assignmentId),
  );
  const runRows = facts.schedule.coveringRows.filter(
    (row) => row.semantic === 'geometric-panel-run',
  );
  const suggestions: (
    | CoveringPositionsSuggestion
    | CoveringRunsSuggestion
    | CoveringConsumptionSuggestion
  )[] = [];
  if (tileLayoutsWithConsumption.length) {
    const minimumPieces = tileLayoutsWithConsumption.reduce(
      (sum, layout) =>
        sum +
        (layout.kind === 'roof-tile'
          ? (layout.declaredConsumptionReference?.minimumPieces ?? 0)
          : 0),
      0,
    );
    const maximumPieces = tileLayoutsWithConsumption.reduce(
      (sum, layout) =>
        sum +
        (layout.kind === 'roof-tile'
          ? (layout.declaredConsumptionReference?.maximumPieces ?? 0)
          : 0),
      0,
    );
    const catalogPrice = resolveConsumptionPrice(
      facts,
      consumptionAssignmentIds,
    );
    suggestions.push({
      kind: 'covering-consumption',
      key: 'covering-consumption',
      category: 'material',
      quantityBasis: 'effective-coverage',
      suitability: 'execution-based',
      quantity: { value: maximumPieces, unit: 'piece' },
      minimumPieces,
      maximumPieces,
      unitPriceMinor: catalogPrice?.unitPriceMinor,
      currencyCode: catalogPrice?.currencyCode,
      noteKeys: [
        'declared-consumption-not-a-resolved-purchase-count',
        ...(catalogPrice ? ['price-from-catalogue'] : []),
      ],
    });
  }
  if (positionRows.length)
    suggestions.push({
      kind: 'covering-positions',
      key: 'covering-positions',
      category: 'material',
      quantityBasis: 'effective-coverage',
      suitability: 'manual-required',
      totalPositions: positionRows.reduce((sum, row) => sum + row.quantity, 0),
      manualUnit: 'piece',
      noteKeys: ['covering-not-a-purchase-count'],
    });
  if (runRows.length)
    suggestions.push({
      kind: 'covering-runs',
      key: 'covering-runs',
      category: 'material',
      quantityBasis: 'effective-coverage',
      suitability: 'manual-required',
      totalLengthMm: runRows.reduce((sum, row) => sum + row.totalLengthMm, 0),
      manualUnit: 'm',
      noteKeys: ['covering-not-a-purchase-count'],
    });
  return suggestions;
}

/** Assignments whose tiles are costed by a prepared purchase plan. */
function plannedTileAssignmentIds(facts: ExportFacts): Set<string> {
  return new Set(
    (facts.tilePurchasePlans ?? [])
      .filter((plan) => tilePurchaseQuantity(plan, 'piece') !== undefined)
      .map((plan) => plan.assignmentId),
  );
}

/**
 * A catalogue price joins only the plan's own variant and a sale unit the
 * plan can express: a per-pack price never meets a piece count.
 */
function tilePlanPrice(facts: ExportFacts, plan: TilePurchasePlan) {
  if (!plan.variantId) return undefined;
  const entries = (facts.variantPrices ?? []).filter(
    (row) =>
      row.variantId === plan.variantId &&
      tilePurchaseQuantity(plan, row.entry.saleUnit) !== undefined,
  );
  const preferred = entries.filter(
    (row) => row.entry.saleUnit === tilePurchaseUnit(plan),
  );
  const candidates = preferred.length ? preferred : entries;
  return candidates.length === 1 ? candidates[0] : undefined;
}

function tilePurchaseSuggestions(facts: ExportFacts): TilePurchaseSuggestion[] {
  return (facts.tilePurchasePlans ?? []).flatMap((plan) => {
    const price = tilePlanPrice(facts, plan);
    const unit = price?.entry.saleUnit ?? tilePurchaseUnit(plan);
    const value = tilePurchaseQuantity(plan, unit);
    if (value === undefined) return [];
    return [
      {
        kind: 'tile-purchase' as const,
        key: `tile-purchase:${plan.assignmentId}`,
        category: 'material' as const,
        quantityBasis: 'procurement-stock' as const,
        suitability:
          plan.requirement.status === 'exact'
            ? ('exact-purchase' as const)
            : ('execution-based' as const),
        quantity: { value, unit },
        assignmentId: plan.assignmentId,
        productName: plan.productName,
        ...(price
          ? {
              unitPriceMinor: price.entry.netAmountMinor,
              currencyCode: price.currencyCode,
              priceProvenance: {
                ...(price.ownerLabel ? { ownerLabel: price.ownerLabel } : {}),
                validFrom: price.entry.validFrom,
              },
            }
          : {}),
        noteKeys: [
          ...(plan.requirement.status === 'conservative'
            ? ['tile-plan-conservative-no-offcut-reuse']
            : []),
          ...(price ? ['catalogue-price-verify-before-purchase'] : []),
        ],
      },
    ];
  });
}

function tileAccessorySuggestions(
  facts: ExportFacts,
): TileAccessorySuggestion[] {
  return (facts.tilePurchasePlans ?? []).flatMap((plan) =>
    plan.accessories.flatMap((item) =>
      item.quantity !== undefined && item.status !== 'requires-decision'
        ? [
            {
              kind: 'tile-accessory' as const,
              key: `tile-accessory:${plan.assignmentId}:${item.role}`,
              category: 'material' as const,
              quantityBasis: 'procurement-stock' as const,
              suitability:
                item.status === 'resolved'
                  ? ('execution-based' as const)
                  : ('geometric-estimate' as const),
              quantity: { value: item.quantity, unit: 'piece' as const },
              role: item.role,
              productName:
                item.selection?.displaySnapshot?.familyName ??
                item.selection?.catalogRef.productId ??
                item.role,
              noteKeys:
                item.status === 'declared-approximate'
                  ? ['accessory-declared-approximate']
                  : [],
            },
          ]
        : [],
    ),
  );
}

/**
 * V50: the declared-consumption line is superseded once every tile
 * assignment it stood for has a purchase plan. The accepted line is kept
 * until the user removes it — never silently deleted or double counted.
 */
export function supersededByTilePlan(
  facts: ExportFacts,
  lineId: string,
): boolean {
  if (lineId !== 'covering-consumption' && lineId !== 'covering-positions')
    return false;
  return (
    plannedTileAssignmentIds(facts).size > 0 &&
    !createCostSuggestions(facts).some(
      (suggestion) => suggestion.key === lineId,
    )
  );
}

/** Pure projection from trusted facts to cost suggestions. No pricing happens here. */
export function createCostSuggestions(facts: ExportFacts): CostSuggestion[] {
  return [
    ...tilePurchaseSuggestions(facts),
    ...tileAccessorySuggestions(facts),
    ...k1StockSuggestions(facts),
    ...linearStockSuggestions(facts),
    ...battensSuggestion(facts),
    ...counterBattensSuggestion(facts),
    ...membraneSuggestion(facts),
    ...coveringSuggestions(facts),
  ];
}

/**
 * Live quantity (in the suggestion's own unit) for a suggestion key, used to
 * detect drift for an already-accepted project-derived cost line (§26). A
 * manual-required suggestion never resolves to a trusted number.
 */
export function currentSuggestionQuantityValue(
  facts: ExportFacts,
  key: string,
): number | undefined {
  const suggestion = createCostSuggestions(facts).find((s) => s.key === key);
  if (!suggestion) return undefined;
  return 'quantity' in suggestion ? suggestion.quantity.value : undefined;
}

export type {
  CostLineCategory,
  CostQuantityBasis,
  CostSuitability,
  QuantityUnit,
};
