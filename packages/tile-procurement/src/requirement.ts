import type {
  RoofTileLayoutResult,
  RoofTilePurchaseDecision,
  TilePosition,
} from '@cieslacalc/covering-core';
import { roundToPackaging, type PackagingPurchase } from './packaging';

/**
 * - `exact` — every position is a full tile: one position, one tile.
 * - `conservative` — cut positions exist and the policy reserves a whole tile
 *   for each; the count is safe but may be higher than a roofer reusing
 *   offcuts would buy. Never presented as exact.
 * - `partial` — the layout resolved only part of the assignment; the counts
 *   are evidence, not a purchase quantity.
 * - `unresolved` — no trustworthy layout.
 */
export type TilePurchaseStatus =
  'exact' | 'conservative' | 'partial' | 'unresolved';

export type TileContributionBasis =
  'full-tile' | 'one-tile-per-cut-position' | 'one-tile-per-visible-fragment';

export interface TilePositionContribution {
  /** Physical base tiles this position reserves under the policy. */
  baseTiles: number;
  basis: TileContributionBasis;
}

export type TilePurchaseLimitation =
  | 'layout-not-resolved'
  | 'cuts-without-offcut-reuse'
  | 'split-fragments-one-tile-each'
  | 'packaging-not-set';

export interface ManufacturerConsumptionCheck {
  /** The physical base-tile requirement per m² of net assigned area. */
  resolvedPerM2: number;
  declaredMinPerM2: number;
  declaredMaxPerM2: number;
  verdict: 'within' | 'below' | 'above';
}

export interface RoofTilePurchaseRequirement {
  assignmentId: string;
  status: TilePurchaseStatus;
  cutPolicy: RoofTilePurchaseDecision['cutPolicy'];
  totalPositionCount: number;
  fullPositionCount: number;
  /** Every non-full position (edge + opening + split) — the layout's own count. */
  cutPositionCount: number;
  edgeCutPositionCount: number;
  openingCutPositionCount: number;
  splitPositionCount: number;
  splitFragmentCount: number;
  /** Whole base tiles the geometry needs under the cut policy. */
  physicalBaseTileCount: number;
  reserveBps: number;
  /** User reserve, rounded up to whole tiles. Zero unless the user set one. */
  reservePieces: number;
  /** `physicalBaseTileCount + reservePieces`. */
  requiredPieces: number;
  /** Present once the user set a sale unit. */
  purchase?: PackagingPurchase;
  /** Evidence only: it never changes any count above. */
  manufacturerCheck?: ManufacturerConsumptionCheck;
  netAreaMm2?: number;
  limitations: TilePurchaseLimitation[];
}

/**
 * What one layout position reserves under the no-offcut-reuse policy.
 *
 * A split-by-opening position is covered visibly by several disconnected
 * fragments. One purchased tile is not guaranteed to yield all of them, but
 * each fragment lies inside the position's nominal cover area and so can
 * always be cut from its own whole tile: one tile per fragment is safe, and
 * the result is conservative, never exact. No nesting is attempted.
 */
export function tilePositionContribution(
  position: Pick<TilePosition, 'classification' | 'visibleFragments'>,
): TilePositionContribution {
  switch (position.classification) {
    case 'full':
      return { baseTiles: 1, basis: 'full-tile' };
    case 'cut-roof-edge':
    case 'cut-opening':
      return { baseTiles: 1, basis: 'one-tile-per-cut-position' };
    case 'split-by-opening':
      return {
        baseTiles: Math.max(1, position.visibleFragments.length),
        basis: 'one-tile-per-visible-fragment',
      };
  }
}

/** A user reserve, rounded up to whole tiles. */
export function reservePieces(physicalPieces: number, reserveBps: number) {
  if (!Number.isInteger(reserveBps) || reserveBps < 0)
    throw new RangeError('invalid_reserve');
  // Integer arithmetic: 2070 × 2 % is 41.4 → 42, with no float residue.
  return Math.ceil((physicalPieces * reserveBps) / 10_000);
}

/**
 * Compares the resolved physical requirement with the manufacturer's declared
 * consumption range. A cross-check, not a solver: values are never forced to
 * agree, and the requirement is never modified by the verdict.
 */
export function checkManufacturerConsumption(args: {
  physicalBaseTileCount: number;
  netAreaMm2: number;
  declaredMinimumPieces: number;
  declaredMaximumPieces: number;
}): ManufacturerConsumptionCheck | undefined {
  const areaM2 = args.netAreaMm2 / 1_000_000;
  if (!(areaM2 > 0)) return undefined;
  const resolvedPerM2 = args.physicalBaseTileCount / areaM2;
  const declaredMinPerM2 = args.declaredMinimumPieces / areaM2;
  const declaredMaxPerM2 = args.declaredMaximumPieces / areaM2;
  // Compare at the precision the manufacturer publishes (0.1 szt./m²).
  const round = (value: number) => Math.round(value * 10) / 10;
  const verdict =
    round(resolvedPerM2) < round(declaredMinPerM2)
      ? 'below'
      : round(resolvedPerM2) > round(declaredMaxPerM2)
        ? 'above'
        : 'within';
  return { resolvedPerM2, declaredMinPerM2, declaredMaxPerM2, verdict };
}

/**
 * The physical and commercial requirement for one roof-tile assignment.
 * Consumes the layout as given; creates no geometry.
 */
export function resolveRoofTilePurchaseRequirement(
  layout: RoofTileLayoutResult,
  decision: RoofTilePurchaseDecision,
): RoofTilePurchaseRequirement {
  let full = 0;
  let edge = 0;
  let opening = 0;
  let split = 0;
  let fragments = 0;
  let physical = 0;
  for (const plane of layout.planes)
    for (const course of plane.courses)
      for (const position of course.positions) {
        physical += tilePositionContribution(position).baseTiles;
        if (position.classification === 'full') full += 1;
        else if (position.classification === 'cut-roof-edge') edge += 1;
        else if (position.classification === 'cut-opening') opening += 1;
        else {
          split += 1;
          fragments += position.visibleFragments.length;
        }
      }
  const total = full + edge + opening + split;
  const resolved = layout.status === 'resolved' && total > 0;
  const status: TilePurchaseStatus = resolved
    ? total === full
      ? 'exact'
      : 'conservative'
    : total > 0 && layout.status === 'incomplete'
      ? 'partial'
      : 'unresolved';
  const reserve = reservePieces(physical, decision.reserveBps);
  const requiredPieces = physical + reserve;
  const declared = layout.declaredConsumptionReference;
  const limitations: TilePurchaseLimitation[] = [
    ...(resolved ? [] : ['layout-not-resolved' as const]),
    ...(edge + opening > 0 ? ['cuts-without-offcut-reuse' as const] : []),
    ...(split > 0 ? ['split-fragments-one-tile-each' as const] : []),
    ...(decision.packaging ? [] : ['packaging-not-set' as const]),
  ];
  return {
    assignmentId: layout.assignmentId,
    status,
    cutPolicy: decision.cutPolicy,
    totalPositionCount: total,
    fullPositionCount: full,
    cutPositionCount: edge + opening + split,
    edgeCutPositionCount: edge,
    openingCutPositionCount: opening,
    splitPositionCount: split,
    splitFragmentCount: fragments,
    physicalBaseTileCount: physical,
    reserveBps: decision.reserveBps,
    reservePieces: reserve,
    requiredPieces,
    // A purchase quantity only exists for a trustworthy requirement.
    ...(decision.packaging && resolved
      ? { purchase: roundToPackaging(requiredPieces, decision.packaging) }
      : {}),
    ...(declared && resolved
      ? {
          netAreaMm2: declared.netAssignedAreaMm2,
          manufacturerCheck: checkManufacturerConsumption({
            physicalBaseTileCount: physical,
            netAreaMm2: declared.netAssignedAreaMm2,
            declaredMinimumPieces: declared.minimumPieces,
            declaredMaximumPieces: declared.maximumPieces,
          }),
        }
      : {}),
    limitations,
  };
}

/** Pieces actually bought: the packaged count, else the required count. */
export function purchasedPieces(
  requirement: RoofTilePurchaseRequirement,
): number | undefined {
  if (requirement.status !== 'exact' && requirement.status !== 'conservative')
    return undefined;
  return requirement.purchase?.purchasedPieces ?? requirement.requiredPieces;
}
