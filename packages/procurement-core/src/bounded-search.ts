import {
  completedScore,
  lowerBoundIrreversibleLoss,
} from './accounting';
import {
  appendRequiredBlank,
  canonicalMutableUsageOrder,
  cloneMutableUsage,
  compareNumber,
  createMutableStockUsage,
  fits,
  requiredSpaceFor,
  usableLength,
  type MutableStockUsage,
} from './fit';
import { stockOptionComparator } from './heuristic';
import type {
  CuttingSettings,
  OptimizationObjective,
  PlanScore,
  RequiredPiece,
  StockOption,
} from './model';
import { comparePlanScores } from './scoring';

export const MAX_EXACT_STOCK_OPTIONS = 8;

export interface SearchResult {
  usages: MutableStockUsage[];
  statesVisited: number;
  budgetReached: boolean;
  foundCompletePlan: boolean;
}

function shouldPruneSearchState(
  usages: readonly MutableStockUsage[],
  settings: CuttingSettings,
  objective: OptimizationObjective,
  bestScore: PlanScore,
) {
  const stockItemCount = usages.length;
  const purchasedStockLengthMm = usages.reduce(
    (total, usage) => total + usage.originalLengthMm,
    0,
  );
  const irreversibleLowerBound = lowerBoundIrreversibleLoss(usages, settings);

  if (objective === 'minimum-stock-count') {
    if (stockItemCount > bestScore.stockItemCount) return true;
    if (
      stockItemCount === bestScore.stockItemCount &&
      compareNumber(purchasedStockLengthMm, bestScore.purchasedStockLengthMm) >
        0
    ) {
      return true;
    }
    return (
      stockItemCount === bestScore.stockItemCount &&
      compareNumber(
        purchasedStockLengthMm,
        bestScore.purchasedStockLengthMm,
      ) === 0 &&
      compareNumber(irreversibleLowerBound, bestScore.irreversibleLossMm) > 0
    );
  }

  if (
    compareNumber(purchasedStockLengthMm, bestScore.purchasedStockLengthMm) > 0
  ) {
    return true;
  }
  return (
    compareNumber(purchasedStockLengthMm, bestScore.purchasedStockLengthMm) ===
      0 &&
    compareNumber(irreversibleLowerBound, bestScore.irreversibleLossMm) > 0
  );
}

function searchStateKey(
  pieceIndex: number,
  usages: readonly MutableStockUsage[],
) {
  return `${pieceIndex}|${usages
    .map(
      (usage) =>
        `${usage.stockOptionId}:${usage.remainingLengthMm}:${usage.cuts
          .map((cut) => cut.requiredPieceId)
          .join(',')}`,
    )
    .sort()
    .join(';')}`;
}

function countOpenedOption(
  usages: readonly MutableStockUsage[],
  stockOptionId: string,
) {
  return usages.filter((usage) => usage.stockOptionId === stockOptionId).length;
}

/**
 * Bounded branch-and-bound. It uses the same `fits`, `requiredSpaceFor`,
 * `createMutableStockUsage`, and `appendRequiredBlank` primitives as the
 * heuristic path.
 */
export function boundedSearchClassPlan(
  pieces: readonly RequiredPiece[],
  options: readonly StockOption[],
  settings: CuttingSettings,
  objective: OptimizationObjective,
  initialCompleteUsages: readonly MutableStockUsage[] | undefined,
  stateBudget: number,
): SearchResult {
  let bestUsages = initialCompleteUsages?.map(cloneMutableUsage);
  let bestScore = bestUsages
    ? completedScore(pieces, bestUsages, settings)
    : undefined;
  let statesVisited = 0;
  let budgetReached = false;
  const seenStates = new Set<string>();

  const visit = (pieceIndex: number, usages: MutableStockUsage[]) => {
    const stateKey = searchStateKey(pieceIndex, usages);
    if (seenStates.has(stateKey)) return;
    if (statesVisited >= stateBudget) {
      budgetReached = true;
      return;
    }
    seenStates.add(stateKey);
    statesVisited += 1;

    if (
      bestScore &&
      shouldPruneSearchState(usages, settings, objective, bestScore)
    ) {
      return;
    }
    if (pieceIndex === pieces.length) {
      const score = completedScore(pieces, usages, settings);
      if (!bestScore || comparePlanScores(score, bestScore, objective) < 0) {
        bestScore = score;
        bestUsages = usages.map(cloneMutableUsage);
      }
      return;
    }

    const piece = pieces[pieceIndex]!;
    const existingCandidates = usages
      .map((usage, index) => ({ usage, index }))
      .filter(({ usage }) =>
        fits(requiredSpaceFor(usage, piece, settings), usage.remainingLengthMm),
      )
      .sort(
        (a, b) =>
          a.usage.remainingLengthMm -
            requiredSpaceFor(a.usage, piece, settings) -
            (b.usage.remainingLengthMm -
              requiredSpaceFor(b.usage, piece, settings)) ||
          canonicalMutableUsageOrder(a.usage, b.usage),
      );
    const equivalentOpenUsages = new Set<string>();
    for (const { usage, index } of existingCandidates) {
      const equivalenceKey = `${usage.stockOptionId}|${usage.remainingLengthMm}`;
      if (equivalentOpenUsages.has(equivalenceKey)) continue;
      equivalentOpenUsages.add(equivalenceKey);
      const nextUsages = usages.map(cloneMutableUsage);
      appendRequiredBlank(nextUsages[index]!, piece, settings);
      visit(pieceIndex + 1, nextUsages);
      if (budgetReached) return;
    }

    const newOptions = options
      .filter(
        (option) =>
          (option.availability === undefined ||
            countOpenedOption(usages, option.id) < option.availability) &&
          fits(
            piece.requiredBlankLengthMm,
            usableLength(option, settings),
          ),
      )
      .sort(
        stockOptionComparator(
          piece,
          pieces.slice(pieceIndex + 1),
          settings,
          objective,
        ),
      );
    for (const option of newOptions) {
      const newUsage = createMutableStockUsage(option, settings);
      appendRequiredBlank(newUsage, piece, settings);
      visit(pieceIndex + 1, [...usages.map(cloneMutableUsage), newUsage]);
      if (budgetReached) return;
    }
  };

  visit(0, []);
  return {
    usages: bestUsages ?? [],
    statesVisited,
    budgetReached,
    foundCompletePlan: bestUsages !== undefined,
  };
}
