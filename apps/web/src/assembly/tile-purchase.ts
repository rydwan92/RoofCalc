import type {
  CommercialPackagingFacts,
  CoveringAssignmentSpec,
  RoofTileLayoutResult,
  RoofTilePurchaseDecision,
} from '@cieslacalc/covering-core';
import type { RoofSurfaceGeometryResult } from '@cieslacalc/roof-math';
import {
  purchasedPieces,
  resolveAccessoryRequirements,
  resolveRoofTilePurchaseRequirement,
  type AccessoryRequirement,
  type RoofLineLengths,
  type RoofTilePurchaseRequirement,
} from '@cieslacalc/tile-procurement';
import type { QuantityUnit } from '@cieslacalc/cost-core';

/**
 * V50 application boundary for roof-tile purchase planning.
 *
 * It joins three things the web layer already holds — the canonical purchase
 * decision on a covering assignment, that assignment's resolved tile layout
 * and the resolved roof surface — and hands them to the pure
 * `@cieslacalc/tile-procurement`. Material Plan, cost, readiness and
 * documents all read the plan produced here; none of them re-solves it.
 */
export interface TilePurchasePlan {
  assignmentId: string;
  productName: string;
  productId?: string;
  variantId?: string;
  decision: RoofTilePurchaseDecision;
  requirement: RoofTilePurchaseRequirement;
  accessories: AccessoryRequirement[];
  /** Source-backed packaging the picked variant carries, if any. */
  packagingFacts?: CommercialPackagingFacts;
  /** A catalogue packaging choice that no longer matches the product. */
  packagingStale: boolean;
  lines: RoofLineLengths;
}

export function tileProductName(assignment: CoveringAssignmentSpec): string {
  const display = assignment.product.displaySnapshot;
  return (
    [display?.manufacturer, display?.familyName, display?.variantName]
      .filter(Boolean)
      .join(' · ') || assignment.id
  );
}

/** The one default: no reserve, no reuse of offcuts, sold per piece. */
export function defaultTilePurchaseDecision(): RoofTilePurchaseDecision {
  return {
    kind: 'roof-tile',
    cutPolicy: 'no-offcut-reuse',
    reserveBps: 0,
    packaging: { saleUnit: 'piece', piecesPerUnit: 1, source: 'manual' },
  };
}

/**
 * Ridge and hip lines from `roof-math`'s resolved per-plane boundaries. Each
 * line is shared by two planes, so a plane contributes half of it; the total
 * is owned by this assignment only when it covers every roof plane.
 */
export function roofLineLengths(
  surface: RoofSurfaceGeometryResult,
  roofPlaneIds: readonly string[],
): RoofLineLengths {
  const planes = surface.planes.filter((plane) =>
    roofPlaneIds.includes(plane.roofPlaneId),
  );
  return {
    ridgeMm: planes.reduce(
      (sum, plane) => sum + plane.ridgeBoundaryLengthMm / 2,
      0,
    ),
    hipMm: planes.reduce(
      (sum, plane) => sum + plane.hipBoundaryLengthMm / 2,
      0,
    ),
    complete:
      surface.planes.length > 0 &&
      surface.planes.every((plane) => roofPlaneIds.includes(plane.roofPlaneId)),
  };
}

/** Whether a catalogue packaging choice is still what the product declares. */
function packagingStillDeclared(
  decision: RoofTilePurchaseDecision,
  facts: CommercialPackagingFacts | undefined,
) {
  const packaging = decision.packaging;
  if (!packaging || packaging.source !== 'catalog') return true;
  if (packaging.saleUnit === 'pack')
    return facts?.piecesPerPack === packaging.piecesPerUnit;
  if (packaging.saleUnit === 'pallet')
    return facts?.piecesPerPallet === packaging.piecesPerUnit;
  return true;
}

export function createTilePurchasePlans(args: {
  coverings: readonly CoveringAssignmentSpec[];
  layouts: readonly { kind: string; assignmentId: string }[];
  surface: RoofSurfaceGeometryResult;
}): TilePurchasePlan[] {
  return args.coverings.flatMap((assignment) => {
    const decision = assignment.purchase;
    if (
      !decision ||
      assignment.product.technicalSpecSnapshot.kind !== 'roof-tile'
    )
      return [];
    const layout = args.layouts.find(
      (item): item is RoofTileLayoutResult =>
        item.kind === 'roof-tile' && item.assignmentId === assignment.id,
    );
    if (!layout) return [];
    const packagingFacts = assignment.product.commercialSnapshot?.packaging;
    const packagingStale = !packagingStillDeclared(decision, packagingFacts);
    // A stale catalogue packaging is never applied silently.
    const effective = packagingStale
      ? { ...decision, packaging: undefined }
      : decision;
    const lines = roofLineLengths(args.surface, assignment.roofPlaneIds);
    return [
      {
        assignmentId: assignment.id,
        productName: tileProductName(assignment),
        productId: assignment.product.catalogRef?.productId,
        variantId: assignment.product.catalogRef?.variantId,
        decision,
        requirement: resolveRoofTilePurchaseRequirement(layout, effective),
        accessories: resolveAccessoryRequirements({
          layout,
          surfaces: args.surface.planes.map((plane) => ({
            roofPlaneId: plane.roofPlaneId,
            pitchDeg: 0,
            localPolygon: plane.polygon,
            netAreaMm2: plane.netAreaMm2,
          })),
          lines,
          accessories: decision.accessories ?? [],
          tileProductId: assignment.product.catalogRef?.productId,
        }),
        ...(packagingFacts ? { packagingFacts } : {}),
        packagingStale,
        lines,
      },
    ];
  });
}

/**
 * The purchase quantity expressed in a price's own sale unit. A piece price
 * multiplies pieces; a pack price multiplies packs, and only when the plan is
 * actually bought in packs. Anything else has no safe quantity.
 */
export function tilePurchaseQuantity(
  plan: TilePurchasePlan,
  saleUnit: QuantityUnit,
): number | undefined {
  const pieces = purchasedPieces(plan.requirement);
  if (pieces === undefined) return undefined;
  if (saleUnit === 'piece') return pieces;
  const purchase = plan.requirement.purchase;
  if (
    purchase &&
    (saleUnit === 'pack' || saleUnit === 'pallet') &&
    purchase.saleUnit === saleUnit
  )
    return purchase.units;
  return undefined;
}

/** The sale unit the plan is bought in, as a cost quantity unit. */
export function tilePurchaseUnit(plan: TilePurchasePlan): QuantityUnit {
  return plan.requirement.purchase?.saleUnit ?? 'piece';
}
