import type { RequiredPiece, StockClassId } from '@cieslacalc/procurement-core';
import type { InstallablePiece } from './model';

/**
 * The single bridge into `procurement-core` (V48 §2, §18).
 *
 * Every `InstallablePiece` is already indivisible and already carries any
 * fabrication allowance, so this is a pure rename: procurement never learns
 * that a piece came from a jointed run, and never splits one again.
 */
export function installablePiecesToRequiredPieces(
  pieces: readonly InstallablePiece[],
  stockClassId: StockClassId,
): RequiredPiece[] {
  return pieces.map((piece) => ({
    id: piece.id,
    stockClassId,
    requiredBlankLengthMm: piece.requiredBlankLengthMm,
    source: { referenceId: piece.id },
  }));
}
