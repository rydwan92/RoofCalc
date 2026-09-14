import type { CuttingPlan, StockRequirement } from './model';

/** Aggregates the physical commercial stock opened by a plan. */
export function aggregateStockRequirements(
  plan: Pick<CuttingPlan, 'stockUsages'>,
): StockRequirement[] {
  const groups = new Map<string, StockRequirement>();
  for (const usage of plan.stockUsages) {
    const key = `${usage.stockClassId}\u0000${usage.stockOptionId}\u0000${usage.originalLengthMm}`;
    const existing = groups.get(key);
    if (existing) existing.quantity += 1;
    else {
      groups.set(key, {
        stockClassId: usage.stockClassId,
        stockOptionId: usage.stockOptionId,
        lengthMm: usage.originalLengthMm,
        quantity: 1,
      });
    }
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.stockClassId.localeCompare(b.stockClassId) ||
      a.lengthMm - b.lengthMm ||
      a.stockOptionId.localeCompare(b.stockOptionId),
  );
}
