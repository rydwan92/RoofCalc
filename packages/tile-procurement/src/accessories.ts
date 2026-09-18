import type {
  CoveringRoofSurfaceGeometry,
  RoofTileAccessoryRole,
  RoofTileAccessorySelection,
  RoofTileLayoutResult,
} from '@cieslacalc/covering-core';

const EDGE_TOLERANCE_MM = 1;

/**
 * Roof line lengths already resolved by `roof-math` (true lengths of the
 * ridge and hip lines). `complete: false` means a line is shared with a plane
 * outside this covering assignment, so its accessory count cannot be owned
 * by this assignment alone.
 */
export interface RoofLineLengths {
  ridgeMm: number;
  hipMm: number;
  complete: boolean;
}

export type AccessoryQuantityStatus =
  'resolved' | 'declared-approximate' | 'requires-decision';

export type AccessoryQuantityBasis =
  | 'effective-cover-length'
  | 'declared-per-metre'
  | 'one-per-course'
  | 'one-per-course-user-confirmed';

export type AccessoryDecisionReason =
  | 'no-accessory-selected'
  | 'accessory-not-compatible'
  | 'no-quantity-semantics'
  | 'verge-rule-not-declared'
  | 'verge-sides-unresolved'
  | 'line-shared-with-another-covering';

export interface AccessoryRequirement {
  role: RoofTileAccessoryRole;
  status: AccessoryQuantityStatus;
  quantity?: number;
  basis?: AccessoryQuantityBasis;
  /** Evidence: the roof line this role finishes. */
  lineLengthMm?: number;
  /** Evidence: tile courses ending at this verge. */
  courseCount?: number;
  reason?: AccessoryDecisionReason;
  selection?: RoofTileAccessorySelection;
}

export interface VergeCourseCounts {
  /** Courses finishing at a verge on each side, when the sides agree. */
  perSide?: number;
  /** Sum over both sides — always known. */
  total: number;
}

function ceilPieces(value: number) {
  return Math.ceil(value - 1e-9);
}

/**
 * Tile courses that end at a verge, read from the layout's own courses and
 * the plane's own polygon (a verge is a vertical edge in plane-local
 * coordinates). A course counts when its band overlaps the verge and one of
 * its positions reaches that edge.
 *
 * Plane-local `u` does not tell which side a viewer calls "left", so a
 * left/right split is reported only when both verges of every plane end the
 * same number of courses — then the split is the same either way.
 */
export function countVergeCourses(
  layout: RoofTileLayoutResult,
  surfaces: readonly CoveringRoofSurfaceGeometry[],
): VergeCourseCounts {
  let total = 0;
  let perSide: number | undefined = 0;
  for (const plane of layout.planes) {
    const polygon = surfaces.find(
      (surface) => surface.roofPlaneId === plane.roofPlaneId,
    )?.localPolygon;
    if (!polygon || polygon.length < 3) continue;
    const minU = Math.min(...polygon.map((point) => point.uMm));
    const maxU = Math.max(...polygon.map((point) => point.uMm));
    const counts = { min: 0, max: 0 };
    polygon.forEach((from, index) => {
      const to = polygon[(index + 1) % polygon.length]!;
      if (Math.abs(to.uMm - from.uMm) > EDGE_TOLERANCE_MM) return;
      const low = Math.min(from.vMm, to.vMm);
      const high = Math.max(from.vMm, to.vMm);
      if (high - low <= EDGE_TOLERANCE_MM) return;
      const side =
        Math.abs(from.uMm - minU) <= EDGE_TOLERANCE_MM
          ? 'min'
          : Math.abs(from.uMm - maxU) <= EDGE_TOLERANCE_MM
            ? 'max'
            : undefined;
      if (!side) return;
      const u = from.uMm;
      for (const course of plane.courses) {
        const reaches = course.positions.some(
          (position) =>
            position.nominalFromUMm <= u + EDGE_TOLERANCE_MM &&
            position.nominalToUMm >= u - EDGE_TOLERANCE_MM &&
            Math.min(position.nominalToVMm, high) -
              Math.max(position.nominalFromVMm, low) >
              EDGE_TOLERANCE_MM,
        );
        if (reaches) counts[side] += 1;
      }
    });
    total += counts.min + counts.max;
    if (perSide !== undefined)
      perSide = counts.min === counts.max ? perSide + counts.min : undefined;
  }
  return { total, ...(perSide !== undefined ? { perSide } : {}) };
}

function compatible(
  selection: RoofTileAccessorySelection,
  tileProductId: string | undefined,
) {
  return (
    tileProductId !== undefined &&
    selection.technicalSpecSnapshot.compatibleProductIds.includes(tileProductId)
  );
}

function lineRequirement(
  role: 'ridge' | 'hip-ridge',
  lengthMm: number,
  lines: RoofLineLengths,
  selection: RoofTileAccessorySelection | undefined,
  tileProductId: string | undefined,
): AccessoryRequirement {
  const base = { role, lineLengthMm: lengthMm };
  if (!selection)
    return {
      ...base,
      status: 'requires-decision',
      reason: 'no-accessory-selected',
    };
  if (!compatible(selection, tileProductId))
    return {
      ...base,
      selection,
      status: 'requires-decision',
      reason: 'accessory-not-compatible',
    };
  if (!lines.complete)
    return {
      ...base,
      selection,
      status: 'requires-decision',
      reason: 'line-shared-with-another-covering',
    };
  const spec = selection.technicalSpecSnapshot;
  if (spec.effectiveCoverLengthMm !== undefined)
    return {
      ...base,
      selection,
      status: 'resolved',
      basis: 'effective-cover-length',
      quantity: ceilPieces(lengthMm / spec.effectiveCoverLengthMm),
    };
  if (spec.declaredUnitsPerMetre)
    return {
      ...base,
      selection,
      status: spec.declaredUnitsPerMetre.approximate
        ? 'declared-approximate'
        : 'resolved',
      basis: 'declared-per-metre',
      quantity: ceilPieces(
        (lengthMm / 1000) * spec.declaredUnitsPerMetre.value,
      ),
    };
  return {
    ...base,
    selection,
    status: 'requires-decision',
    reason: 'no-quantity-semantics',
  };
}

function vergeRequirement(
  role: 'verge-left' | 'verge-right',
  courses: VergeCourseCounts,
  selection: RoofTileAccessorySelection | undefined,
  tileProductId: string | undefined,
): AccessoryRequirement {
  const courseCount = courses.perSide;
  const base = {
    role,
    ...(courseCount !== undefined ? { courseCount } : {}),
  };
  if (!selection)
    return {
      ...base,
      status: 'requires-decision',
      reason: 'no-accessory-selected',
    };
  if (!compatible(selection, tileProductId))
    return {
      ...base,
      selection,
      status: 'requires-decision',
      reason: 'accessory-not-compatible',
    };
  const declared =
    selection.technicalSpecSnapshot.quantityRule === 'one-per-course';
  if (!declared && selection.userConfirmedRule !== 'one-per-course')
    return {
      ...base,
      selection,
      status: 'requires-decision',
      reason: 'verge-rule-not-declared',
    };
  if (courseCount === undefined)
    return {
      ...base,
      selection,
      status: 'requires-decision',
      reason: 'verge-sides-unresolved',
    };
  return {
    ...base,
    selection,
    status: 'resolved',
    basis: declared ? 'one-per-course' : 'one-per-course-user-confirmed',
    quantity: courseCount,
  };
}

/**
 * Accessory quantities for the roles this roof actually has: ridge and hip
 * lines from `lines`, verges from the layout's courses. Half and ventilation
 * tiles are never implied by geometry, so they are not listed.
 */
export function resolveAccessoryRequirements(args: {
  layout: RoofTileLayoutResult;
  surfaces: readonly CoveringRoofSurfaceGeometry[];
  lines: RoofLineLengths;
  accessories: readonly RoofTileAccessorySelection[];
  /** The tile's catalogue product-family ID; manual tiles have none. */
  tileProductId?: string;
}): AccessoryRequirement[] {
  if (args.layout.status !== 'resolved') return [];
  const pick = (role: RoofTileAccessoryRole) =>
    args.accessories.find((item) => item.role === role);
  const requirements: AccessoryRequirement[] = [];
  if (args.lines.ridgeMm > EDGE_TOLERANCE_MM)
    requirements.push(
      lineRequirement(
        'ridge',
        args.lines.ridgeMm,
        args.lines,
        pick('ridge'),
        args.tileProductId,
      ),
    );
  if (args.lines.hipMm > EDGE_TOLERANCE_MM)
    requirements.push(
      lineRequirement(
        'hip-ridge',
        args.lines.hipMm,
        args.lines,
        pick('hip-ridge'),
        args.tileProductId,
      ),
    );
  const courses = countVergeCourses(args.layout, args.surfaces);
  if (courses.total > 0)
    for (const role of ['verge-left', 'verge-right'] as const)
      requirements.push(
        vergeRequirement(role, courses, pick(role), args.tileProductId),
      );
  return requirements;
}
