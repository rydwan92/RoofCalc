import {
  canonicalMutableUsageOrder,
  cloneMutableUsage,
  LENGTH_EPSILON_MM,
  type MutableStockUsage,
} from './fit';
import type {
  CuttingPlan,
  CuttingPlanSummary,
  CuttingSettings,
  PlanScore,
  RemnantClassification,
  RequiredPiece,
  StockUsage,
  UnassignedPiece,
} from './model';

function classifyRemnant(
  remainingLengthMm: number,
  minimumReusableRemnantMm: number,
): RemnantClassification {
  if (remainingLengthMm <= LENGTH_EPSILON_MM) return 'none';
  return remainingLengthMm + LENGTH_EPSILON_MM >= minimumReusableRemnantMm
    ? 'reusable-remnant'
    : 'waste';
}

function finalizeUsage(
  usage: MutableStockUsage,
  stockInstanceId: string,
  settings: CuttingSettings,
): StockUsage {
  const assignedBlankLengthMm = usage.cuts.reduce(
    (total, cut) => total + cut.requiredBlankLengthMm,
    0,
  );
  return {
    stockClassId: usage.stockClassId,
    stockOptionId: usage.stockOptionId,
    stockInstanceId,
    originalLengthMm: usage.originalLengthMm,
    usableLengthMm: usage.usableLengthMm,
    cuts: usage.cuts.map((cut) => ({ ...cut })),
    assignedBlankLengthMm,
    kerfTotalMm: Math.max(0, usage.cuts.length - 1) * settings.kerfMm,
    endTrimLossMm: 2 * settings.endTrimMm,
    remainingLengthMm: usage.remainingLengthMm,
    remnantClassification: classifyRemnant(
      usage.remainingLengthMm,
      settings.minimumReusableRemnantMm,
    ),
  };
}

export function canonicalizeAndFinalizeUsages(
  usages: readonly MutableStockUsage[],
  settings: CuttingSettings,
): StockUsage[] {
  const ordinals = new Map<string, number>();
  return usages
    .map(cloneMutableUsage)
    .sort(canonicalMutableUsageOrder)
    .map((usage) => {
      const ordinal = (ordinals.get(usage.stockOptionId) ?? 0) + 1;
      ordinals.set(usage.stockOptionId, ordinal);
      return finalizeUsage(
        usage,
        `stock:${usage.stockOptionId}:${ordinal}`,
        settings,
      );
    });
}

export function createSummary(
  requiredPieces: readonly RequiredPiece[],
  stockUsages: readonly StockUsage[],
  unassignedPieces: readonly UnassignedPiece[],
): CuttingPlanSummary {
  const requiredBlankLengthMm = requiredPieces.reduce(
    (total, piece) => total + piece.requiredBlankLengthMm,
    0,
  );
  const assignedBlankLengthMm = stockUsages.reduce(
    (total, usage) => total + usage.assignedBlankLengthMm,
    0,
  );
  const purchasedStockLengthMm = stockUsages.reduce(
    (total, usage) => total + usage.originalLengthMm,
    0,
  );
  const kerfLossMm = stockUsages.reduce(
    (total, usage) => total + usage.kerfTotalMm,
    0,
  );
  const endTrimLossMm = stockUsages.reduce(
    (total, usage) => total + usage.endTrimLossMm,
    0,
  );
  const nonReusableRemainderMm = stockUsages
    .filter((usage) => usage.remnantClassification === 'waste')
    .reduce((total, usage) => total + usage.remainingLengthMm, 0);
  const reusableRemnantLengthMm = stockUsages
    .filter((usage) => usage.remnantClassification === 'reusable-remnant')
    .reduce((total, usage) => total + usage.remainingLengthMm, 0);
  return {
    requiredPieceCount: requiredPieces.length,
    assignedPieceCount: requiredPieces.length - unassignedPieces.length,
    unassignedPieceCount: unassignedPieces.length,
    stockItemCount: stockUsages.length,
    requiredBlankLengthMm,
    assignedBlankLengthMm,
    purchasedStockLengthMm,
    kerfLossMm,
    endTrimLossMm,
    wasteLengthMm: endTrimLossMm + nonReusableRemainderMm,
    reusableRemnantLengthMm,
    utilizationRatio:
      purchasedStockLengthMm === 0
        ? 0
        : assignedBlankLengthMm / purchasedStockLengthMm,
  };
}

function planSignature(stockUsages: readonly StockUsage[]) {
  return stockUsages
    .map(
      (usage) =>
        `${usage.stockClassId}|${usage.stockOptionId}|${usage.originalLengthMm}` +
        `[${usage.cuts
          .map(
            (cut) =>
              `${cut.requiredPieceId}:${cut.requiredBlankLengthMm}`,
          )
          .join(',')}]`,
    )
    .join(';');
}

/** Evaluates a canonical physical plan without prices or weighted scores. */
export function evaluatePlanScore(
  plan: Pick<CuttingPlan, 'stockUsages' | 'summary'>,
): PlanScore {
  return {
    stockItemCount: plan.summary.stockItemCount,
    purchasedStockLengthMm: plan.summary.purchasedStockLengthMm,
    irreversibleLossMm: plan.summary.kerfLossMm + plan.summary.wasteLengthMm,
    reusableRemnantLengthMm: plan.summary.reusableRemnantLengthMm,
    unusedPurchasedLengthMm:
      plan.summary.purchasedStockLengthMm -
      plan.summary.assignedBlankLengthMm,
    deterministicSignature: planSignature(plan.stockUsages),
  };
}

export function completedScore(
  pieces: readonly RequiredPiece[],
  usages: readonly MutableStockUsage[],
  settings: CuttingSettings,
) {
  const stockUsages = canonicalizeAndFinalizeUsages(usages, settings);
  const summary = createSummary(pieces, stockUsages, []);
  return evaluatePlanScore({ stockUsages, summary });
}

export function lowerBoundIrreversibleLoss(
  usages: readonly MutableStockUsage[],
  settings: CuttingSettings,
) {
  return usages.reduce(
    (total, usage) =>
      total +
      2 * settings.endTrimMm +
      Math.max(0, usage.cuts.length - 1) * settings.kerfMm,
    0,
  );
}
