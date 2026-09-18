import type { CommercialPackaging } from '@cieslacalc/covering-core';

export interface PackagingPurchase {
  saleUnit: CommercialPackaging['saleUnit'];
  piecesPerUnit: number;
  /** Whole sale units to buy. */
  units: number;
  /** `units × piecesPerUnit`. */
  purchasedPieces: number;
  /**
   * Pieces bought only because the product is sold in whole units. It is a
   * commercial overage, not waste: nothing is cut or broken to produce it.
   */
  commercialOveragePieces: number;
}

export function isValidPiecesPerUnit(value: number): boolean {
  return Number.isInteger(value) && value >= 1;
}

/** Rounds a required piece count up to whole sale units. */
export function roundToPackaging(
  requiredPieces: number,
  packaging: Pick<CommercialPackaging, 'saleUnit' | 'piecesPerUnit'>,
): PackagingPurchase {
  if (!isValidPiecesPerUnit(packaging.piecesPerUnit))
    throw new RangeError('invalid_pieces_per_unit');
  if (!Number.isInteger(requiredPieces) || requiredPieces < 0)
    throw new RangeError('invalid_required_pieces');
  if (packaging.saleUnit === 'piece' && packaging.piecesPerUnit !== 1)
    throw new RangeError('piece_is_one_piece');
  const units = Math.ceil(requiredPieces / packaging.piecesPerUnit);
  const purchasedPieces = units * packaging.piecesPerUnit;
  return {
    saleUnit: packaging.saleUnit,
    piecesPerUnit: packaging.piecesPerUnit,
    units,
    purchasedPieces,
    commercialOveragePieces: purchasedPieces - requiredPieces,
  };
}
