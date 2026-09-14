import {
  appendRequiredBlank,
  createMutableStockUsage,
  fits,
  mutableUsageSignature,
  requiredSpaceFor,
  usableLength,
  type MutableStockUsage,
} from './fit';
import type {
  CuttingSettings,
  OptimizationObjective,
  RequiredPiece,
  StockOption,
  UnassignedPiece,
  UnassignedPieceReason,
} from './model';

interface ProjectedFill {
  pieceCount: number;
  assignedBlankLengthMm: number;
  remainingLengthMm: number;
}

export interface HeuristicClassPlan {
  usages: MutableStockUsage[];
  unassignedPieces: UnassignedPiece[];
}

function projectCandidateFill(
  option: StockOption,
  currentPiece: RequiredPiece,
  futurePieces: readonly RequiredPiece[],
  settings: CuttingSettings,
): ProjectedFill {
  let remainingLengthMm =
    usableLength(option, settings) - currentPiece.requiredBlankLengthMm;
  let pieceCount = 1;
  let assignedBlankLengthMm = currentPiece.requiredBlankLengthMm;
  for (const piece of futurePieces) {
    if (piece.stockClassId !== option.stockClassId) continue;
    const requiredMm = settings.kerfMm + piece.requiredBlankLengthMm;
    if (!fits(requiredMm, remainingLengthMm)) continue;
    remainingLengthMm -= requiredMm;
    pieceCount += 1;
    assignedBlankLengthMm += piece.requiredBlankLengthMm;
  }
  return { pieceCount, assignedBlankLengthMm, remainingLengthMm };
}

function chooseOpenUsage(
  usages: MutableStockUsage[],
  piece: RequiredPiece,
  settings: CuttingSettings,
) {
  return usages
    .filter(
      (usage) =>
        usage.stockClassId === piece.stockClassId &&
        fits(requiredSpaceFor(usage, piece, settings), usage.remainingLengthMm),
    )
    .sort((a, b) => {
      const aRemaining =
        a.remainingLengthMm - requiredSpaceFor(a, piece, settings);
      const bRemaining =
        b.remainingLengthMm - requiredSpaceFor(b, piece, settings);
      return (
        aRemaining - bRemaining ||
        a.originalLengthMm - b.originalLengthMm ||
        a.stockOptionId.localeCompare(b.stockOptionId) ||
        mutableUsageSignature(a).localeCompare(mutableUsageSignature(b))
      );
    })[0];
}

export function stockOptionComparator(
  piece: RequiredPiece,
  futurePieces: readonly RequiredPiece[],
  settings: CuttingSettings,
  objective: OptimizationObjective,
) {
  return (a: StockOption, b: StockOption) => {
    if (objective === 'minimum-stock-count') {
      const aProjection = projectCandidateFill(
        a,
        piece,
        futurePieces,
        settings,
      );
      const bProjection = projectCandidateFill(
        b,
        piece,
        futurePieces,
        settings,
      );
      return (
        bProjection.pieceCount - aProjection.pieceCount ||
        bProjection.assignedBlankLengthMm - aProjection.assignedBlankLengthMm ||
        aProjection.remainingLengthMm - bProjection.remainingLengthMm ||
        a.lengthMm - b.lengthMm ||
        a.id.localeCompare(b.id)
      );
    }
    const aRemaining = usableLength(a, settings) - piece.requiredBlankLengthMm;
    const bRemaining = usableLength(b, settings) - piece.requiredBlankLengthMm;
    return (
      aRemaining - bRemaining ||
      a.lengthMm - b.lengthMm ||
      a.id.localeCompare(b.id)
    );
  };
}

function chooseStockOption(
  options: readonly StockOption[],
  openedByOption: ReadonlyMap<string, number>,
  piece: RequiredPiece,
  futurePieces: readonly RequiredPiece[],
  settings: CuttingSettings,
  objective: OptimizationObjective,
) {
  return options
    .filter((option) => {
      const available = option.availability;
      const opened = openedByOption.get(option.id) ?? 0;
      return (
        option.stockClassId === piece.stockClassId &&
        (available === undefined || opened < available) &&
        fits(piece.requiredBlankLengthMm, usableLength(option, settings))
      );
    })
    .sort(stockOptionComparator(piece, futurePieces, settings, objective))[0];
}

export function unassignedReason(
  piece: RequiredPiece,
  options: readonly StockOption[],
  settings: CuttingSettings,
): UnassignedPieceReason {
  const compatible = options.filter(
    (option) => option.stockClassId === piece.stockClassId,
  );
  if (compatible.length === 0) return 'no-compatible-stock';
  if (
    compatible.every(
      (option) =>
        !fits(piece.requiredBlankLengthMm, usableLength(option, settings)),
    )
  ) {
    return 'piece-longer-than-stock';
  }
  return 'availability-exhausted';
}

export function createHeuristicClassPlan(
  pieces: readonly RequiredPiece[],
  options: readonly StockOption[],
  settings: CuttingSettings,
  objective: OptimizationObjective,
): HeuristicClassPlan {
  const usages: MutableStockUsage[] = [];
  const openedByOption = new Map<string, number>();
  const unassignedPieces: UnassignedPiece[] = [];

  pieces.forEach((piece, index) => {
    let usage = chooseOpenUsage(usages, piece, settings);
    if (!usage) {
      const option = chooseStockOption(
        options,
        openedByOption,
        piece,
        pieces.slice(index + 1),
        settings,
        objective,
      );
      if (!option) {
        unassignedPieces.push({
          requiredPieceId: piece.id,
          stockClassId: piece.stockClassId,
          requiredBlankLengthMm: piece.requiredBlankLengthMm,
          reason: unassignedReason(piece, options, settings),
        });
        return;
      }
      openedByOption.set(option.id, (openedByOption.get(option.id) ?? 0) + 1);
      usage = createMutableStockUsage(option, settings);
      usages.push(usage);
    }
    appendRequiredBlank(usage, piece, settings);
  });

  return { usages, unassignedPieces };
}
