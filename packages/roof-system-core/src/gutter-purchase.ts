import { createCuttingPlan } from '@cieslacalc/procurement-core';
import type { GutterPurchasePolicy, SectionAssembly } from './sections';

/**
 * V52 gutter purchase across runs.
 *
 * The installed pieces of every eave segment are fixed by its own section
 * assembly. With `no-reuse-between-runs` each segment is bought as its own
 * whole sections. With `reuse-straight-remainders` every installed piece
 * becomes one indivisible blank for the existing stock-length engine
 * (`procurement-core`), so a straight remainder cut for one run can be the
 * piece of another. No second cutting engine exists here.
 */
export interface GutterPurchase {
  policy: GutterPurchasePolicy;
  /** Commercial sections to buy, by stock length. */
  sections: { lengthMm: number; quantity: number }[];
  requiredLengthMm: number;
  purchasedLengthMm: number;
  /** Bought beyond the installed requirement. Not "waste". */
  commercialSurplusMm: number;
  /** Installed pieces cut from stock opened for another piece. */
  sharedStockPieces: number;
}

const byLength = (lengths: readonly number[]) => {
  const map = new Map<number, number>();
  for (const length of lengths) map.set(length, (map.get(length) ?? 0) + 1);
  return [...map]
    .sort(([a], [b]) => b - a)
    .map(([lengthMm, quantity]) => ({ lengthMm, quantity }));
};

export function planGutterPurchase(args: {
  assemblies: readonly SectionAssembly[];
  stockLengthsMm: readonly number[];
  policy: GutterPurchasePolicy;
}): GutterPurchase {
  const requiredLengthMm = args.assemblies.reduce(
    (sum, item) => sum + item.requiredLengthMm,
    0,
  );
  const conservative = (): GutterPurchase => {
    const sections = args.assemblies.flatMap((item) => item.sectionsMm);
    const purchasedLengthMm = sections.reduce((sum, item) => sum + item, 0);
    return {
      policy: 'no-reuse-between-runs',
      sections: byLength(sections),
      requiredLengthMm,
      purchasedLengthMm,
      commercialSurplusMm: Math.max(0, purchasedLengthMm - requiredLengthMm),
      sharedStockPieces: 0,
    };
  };
  if (args.policy === 'no-reuse-between-runs' || !args.assemblies.length)
    return conservative();
  const stock = [...new Set(args.stockLengthsMm.filter((v) => v > 0))];
  const pieces = args.assemblies.flatMap((assembly, runIndex) =>
    assembly.piecesMm.map((lengthMm, index) => ({
      id: `piece-${runIndex + 1}-${index + 1}`,
      stockClassId: 'gutter',
      requiredBlankLengthMm: lengthMm,
    })),
  );
  const plan = createCuttingPlan({
    requiredPieces: pieces,
    stockOptions: stock.map((lengthMm) => ({
      id: `stock-${lengthMm}`,
      stockClassId: 'gutter',
      lengthMm,
    })),
    // A gutter is cut square with shears: no kerf, no end trim is sourced.
    settings: { kerfMm: 0, endTrimMm: 0, minimumReusableRemnantMm: 0 },
    objective: 'minimum-purchased-length',
  });
  // Never worse than the conservative plan, never partial.
  const fallback = conservative();
  if (
    plan.status !== 'complete' ||
    plan.summary.purchasedStockLengthMm > fallback.purchasedLengthMm + 1e-6
  )
    return { ...fallback, policy: 'reuse-straight-remainders' };
  const purchasedLengthMm = plan.summary.purchasedStockLengthMm;
  return {
    policy: 'reuse-straight-remainders',
    sections: byLength(plan.stockUsages.map((usage) => usage.originalLengthMm)),
    requiredLengthMm,
    purchasedLengthMm,
    commercialSurplusMm: Math.max(0, purchasedLengthMm - requiredLengthMm),
    sharedStockPieces: plan.stockUsages.reduce(
      (sum, usage) => sum + Math.max(0, usage.cuts.length - 1),
      0,
    ),
  };
}
