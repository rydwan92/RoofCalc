import type {
  CutAssignment,
  CuttingSettings,
  RequiredPiece,
  StockOption,
} from './model';

/** Computational normalization only; this is not a fabrication tolerance. */
export const LENGTH_EPSILON_MM = 1e-9;

/** Package-internal mutable state. It is deliberately absent from index.ts. */
export interface MutableStockUsage {
  stockClassId: string;
  stockOptionId: string;
  originalLengthMm: number;
  usableLengthMm: number;
  cuts: CutAssignment[];
  remainingLengthMm: number;
}

export function usableLength(
  option: StockOption,
  settings: CuttingSettings,
) {
  return Math.max(0, option.lengthMm - 2 * settings.endTrimMm);
}

export function fits(requiredMm: number, availableMm: number) {
  return requiredMm <= availableMm + LENGTH_EPSILON_MM;
}

export function normalizedLength(value: number) {
  return Math.abs(value) <= LENGTH_EPSILON_MM ? 0 : value;
}

export function compareNumber(a: number, b: number) {
  if (Math.abs(a - b) <= LENGTH_EPSILON_MM) return 0;
  return a < b ? -1 : 1;
}

export function requiredPieceOrder(a: RequiredPiece, b: RequiredPiece) {
  return (
    b.requiredBlankLengthMm - a.requiredBlankLengthMm ||
    a.stockClassId.localeCompare(b.stockClassId) ||
    a.id.localeCompare(b.id)
  );
}

export function stockOptionOrder(a: StockOption, b: StockOption) {
  return (
    a.stockClassId.localeCompare(b.stockClassId) ||
    a.lengthMm - b.lengthMm ||
    a.id.localeCompare(b.id)
  );
}

export function requiredSpaceFor(
  usage: MutableStockUsage,
  piece: RequiredPiece,
  settings: CuttingSettings,
) {
  return (
    piece.requiredBlankLengthMm +
    (usage.cuts.length > 0 ? settings.kerfMm : 0)
  );
}

/** The sole physical append primitive used by heuristic and bounded search. */
export function appendRequiredBlank(
  usage: MutableStockUsage,
  piece: RequiredPiece,
  settings: CuttingSettings,
) {
  const previousCut = usage.cuts.at(-1);
  const fromMm = previousCut
    ? previousCut.toMm + settings.kerfMm
    : settings.endTrimMm;
  const toMm = fromMm + piece.requiredBlankLengthMm;
  usage.cuts.push({
    requiredPieceId: piece.id,
    fromMm,
    toMm,
    requiredBlankLengthMm: piece.requiredBlankLengthMm,
  });
  usage.remainingLengthMm = normalizedLength(
    usage.remainingLengthMm -
      piece.requiredBlankLengthMm -
      (previousCut ? settings.kerfMm : 0),
  );
}

export function createMutableStockUsage(
  option: StockOption,
  settings: CuttingSettings,
): MutableStockUsage {
  const capacityMm = usableLength(option, settings);
  return {
    stockClassId: option.stockClassId,
    stockOptionId: option.id,
    originalLengthMm: option.lengthMm,
    usableLengthMm: capacityMm,
    cuts: [],
    remainingLengthMm: capacityMm,
  };
}

export function mutableUsageSignature(usage: MutableStockUsage) {
  return `${usage.stockOptionId}[${usage.cuts
    .map((cut) => `${cut.requiredPieceId}:${cut.requiredBlankLengthMm}`)
    .join(',')}]`;
}

export function cloneMutableUsage(
  usage: MutableStockUsage,
): MutableStockUsage {
  return {
    ...usage,
    cuts: usage.cuts.map((cut) => ({ ...cut })),
  };
}

export function canonicalMutableUsageOrder(
  a: MutableStockUsage,
  b: MutableStockUsage,
) {
  return (
    a.stockClassId.localeCompare(b.stockClassId) ||
    a.originalLengthMm - b.originalLengthMm ||
    a.stockOptionId.localeCompare(b.stockOptionId) ||
    mutableUsageSignature(a).localeCompare(mutableUsageSignature(b))
  );
}
