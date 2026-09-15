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
  quantityBasis: 'net-area';
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
  | CoveringRunsSuggestion;

const MM_PER_M = 1000;
const MM2_PER_M2 = 1_000_000;

/** Groups K1 stock usages by commercial length. Never recomputes the plan. */
function k1StockSuggestions(facts: ExportFacts): K1StockSuggestion[] {
  if (facts.k1.status !== 'resolved' || !facts.cutting) return [];
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
      noteKeys: ['no-allowance-no-stock-length'],
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
 * Covering is never auto-priced (§20/§46): coverage positions and panel runs
 * are geometric layout facts, not a commercial purchase count. This produces
 * at most one nudge per unit family, carrying the raw geometric fact as
 * information only — never as a pre-filled priceable quantity.
 */
function coveringSuggestions(
  facts: ExportFacts,
): (CoveringPositionsSuggestion | CoveringRunsSuggestion)[] {
  const positionRows = facts.schedule.coveringRows.filter(
    (row) => row.semantic === 'effective-coverage-position',
  );
  const runRows = facts.schedule.coveringRows.filter(
    (row) => row.semantic === 'geometric-panel-run',
  );
  const suggestions: (CoveringPositionsSuggestion | CoveringRunsSuggestion)[] =
    [];
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
