import { compareNumber } from './fit';
import type { OptimizationObjective, PlanScore } from './model';

/**
 * Lexicographic objective comparison. Negative means `a` is preferred.
 * No weighted or monetary approximation is used.
 */
export function comparePlanScores(
  a: PlanScore,
  b: PlanScore,
  objective: OptimizationObjective,
): number {
  const keys: (keyof Omit<PlanScore, 'deterministicSignature'>)[] =
    objective === 'minimum-stock-count'
      ? [
          'stockItemCount',
          'purchasedStockLengthMm',
          'irreversibleLossMm',
          'reusableRemnantLengthMm',
          'unusedPurchasedLengthMm',
        ]
      : objective === 'minimum-purchased-length'
        ? [
            'purchasedStockLengthMm',
            'irreversibleLossMm',
            'stockItemCount',
            'reusableRemnantLengthMm',
            'unusedPurchasedLengthMm',
          ]
        : [
            'unusedPurchasedLengthMm',
            'irreversibleLossMm',
            'reusableRemnantLengthMm',
            'stockItemCount',
            'purchasedStockLengthMm',
          ];
  for (const key of keys) {
    const result = compareNumber(a[key], b[key]);
    if (result !== 0) return result;
  }
  return a.deterministicSignature.localeCompare(b.deterministicSignature);
}
