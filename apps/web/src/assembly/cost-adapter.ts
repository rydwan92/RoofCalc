import type {
  CostLineCategory,
  CostQuantityBasis,
  CostSuitability,
  QuantityUnit,
} from '@cieslacalc/cost-core';
import type { ExportFacts } from './export-adapter';

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

export type CostSuggestion =
  | K1StockSuggestion
  | BattensSuggestion
  | CounterBattensSuggestion
  | MembraneSuggestion
  | CoveringPositionsSuggestion
  | CoveringRunsSuggestion
  | CoveringConsumptionSuggestion;

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

function battensSuggestion(facts: ExportFacts): BattensSuggestion[] {
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
  const tileLayoutsWithConsumption = (facts.coveringLayouts ?? []).filter(
    (layout) =>
      layout.kind === 'roof-tile' &&
      layout.status === 'resolved' &&
      layout.declaredConsumptionReference,
  );
  const consumptionAssignmentIds = new Set(
    tileLayoutsWithConsumption.map((layout) => layout.assignmentId),
  );
  const positionRows = facts.schedule.coveringRows.filter(
    (row) =>
      row.semantic === 'effective-coverage-position' &&
      !consumptionAssignmentIds.has(row.assignmentId),
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

/** Pure projection from trusted facts to cost suggestions. No pricing happens here. */
export function createCostSuggestions(facts: ExportFacts): CostSuggestion[] {
  return [
    ...k1StockSuggestions(facts),
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
