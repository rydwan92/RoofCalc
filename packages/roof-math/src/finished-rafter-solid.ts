import type {
  Point2D,
  Point3D,
  ResolvedAssembly,
  SkeletonMember3D,
  TimberSection,
} from '@cieslacalc/timber-model';

/**
 * Finished K1 fabrication solid (V39).
 *
 * V38 drew every timber as a reference rectangular prism. This module turns
 * the *already resolved* K1 fabrication result into the finished physical
 * solid, using only facts the solver produced:
 *
 * - `member.profile` — the finished member-local outline, which already has
 *   the birdsmouth notch and both end cuts taken out of it;
 * - `member.stockProfile` — the same member before machining, for a truthful
 *   before/after comparison;
 * - the resolved seat notch, which fixes where the roof-plane reference line
 *   runs through the section.
 *
 * No cut is recalculated here, and no boolean/CSG operation is performed: the
 * profile is a closed polygon that the renderer simply extrudes by the section
 * width. A concave polygon is fine — triangulating one is not a CAD kernel.
 */

/** An orthonormal member frame, in the same convention `drawing-engine` uses. */
export interface RafterSolidFrame {
  /** Unit vector along the member axis, from `from` toward `to`. */
  along: Point3D;
  /** Unit vector across the section width, horizontal. */
  width: Point3D;
  /** Unit vector from the member's bottom edge toward its top edge. */
  up: Point3D;
}

export interface FinishedRafterSolid {
  memberId: string;
  section: TimberSection;
  /**
   * Closed finished outline in the member's own plane, millimetres.
   * `x` runs along the member from the eave end, `y` from the bottom edge.
   */
  profile: Point2D[];
  /** The same outline before machining, for a before/after comparison. */
  stockProfile: Point2D[];
  /** World position of member-local `(0, 0)`, centred across the width. */
  origin: Point3D;
  frame: RafterSolidFrame;
  /** Which resolved operations this solid already expresses. */
  operationIds: string[];
  /**
   * Physical regions a detail camera can frame, named by the operation that
   * produced them. Bounds are millimetres in member-local coordinates.
   */
  regions: FinishedRafterRegion[];
}

export interface FinishedRafterRegion {
  operationId: string;
  kind: 'seat-notch' | 'end-cut';
  /** Member-local bounds of the machined region. */
  min: Point2D;
  max: Point2D;
}

export type FinishedRafterSolidResult =
  | { status: 'resolved'; solid: FinishedRafterSolid }
  | { status: 'unresolved'; reason: FinishedRafterUnresolvedReason };

export type FinishedRafterUnresolvedReason =
  /** The member carries no resolved seat notch, so the reference line inside
   *  the section is unknown and the profile cannot be placed truthfully. */
  | 'no-seat-reference'
  /** The resolved profile is degenerate. */
  | 'invalid-profile'
  /** The physical placement has no usable axis. */
  | 'invalid-axis';

function unit(vector: Point3D): Point3D | undefined {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (!Number.isFinite(length) || length <= 1e-8) return undefined;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

const cross = (a: Point3D, b: Point3D): Point3D => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

/**
 * Places the resolved finished profile onto one physical rafter placement.
 *
 * The skeleton axis is the roof-plane reference line, not the section centre:
 * it runs through the seat notch at perpendicular distance `normalDepthMm`
 * above the member's bottom edge. Because the eave end is cut plumb rather
 * than square, that line enters the end face at member-local
 * `(normalDepthMm * tan(pitch), normalDepthMm)` — which is the one anchor this
 * module needs, and `finished-rafter-solid.test.ts` proves it by checking the
 * placed axis against the skeleton axis.
 */
export function resolveFinishedRafterSolid(args: {
  assembly: ResolvedAssembly;
  member: Pick<SkeletonMember3D, 'id' | 'from' | 'to' | 'section'>;
  pitchDeg: number;
}): FinishedRafterSolidResult {
  const { assembly, member } = args;
  const profile = assembly.member.profile;
  if (
    profile.length < 3 ||
    !profile.every(
      (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
    )
  )
    return { status: 'unresolved', reason: 'invalid-profile' };
  const seat = assembly.joints.find((joint) => joint.kind === 'seat-notch');
  if (!seat || !Number.isFinite(seat.normalDepthMm))
    return { status: 'unresolved', reason: 'no-seat-reference' };
  const along = unit({
    x: member.to.x - member.from.x,
    y: member.to.y - member.from.y,
    z: member.to.z - member.from.z,
  });
  if (!along) return { status: 'unresolved', reason: 'invalid-axis' };
  const planLength = Math.hypot(along.x, along.y);
  if (planLength <= 1e-8)
    return { status: 'unresolved', reason: 'invalid-axis' };
  // Same width/depth convention as `createTimberPrismBasis`, so the finished
  // solid occupies exactly the timber the reference prism occupied.
  const width = { x: -along.y / planLength, y: along.x / planLength, z: 0 };
  const down = unit(cross(width, along));
  if (!down) return { status: 'unresolved', reason: 'invalid-axis' };
  const up = { x: -down.x, y: -down.y, z: -down.z };
  const pitchRad = (args.pitchDeg * Math.PI) / 180;
  const axisLocal = {
    x: seat.normalDepthMm * Math.tan(pitchRad),
    y: seat.normalDepthMm,
  };
  const origin = {
    x: member.from.x - along.x * axisLocal.x - up.x * axisLocal.y,
    y: member.from.y - along.y * axisLocal.x - up.y * axisLocal.y,
    z: member.from.z - along.z * axisLocal.x - up.z * axisLocal.y,
  };
  const regions: FinishedRafterRegion[] = [
    ...assembly.joints
      .filter((joint) => joint.kind === 'seat-notch')
      .map((joint) => boundsOf(joint.id, 'seat-notch', joint.removedProfile)),
    ...assembly.endCuts.map((cut) =>
      boundsOf(cut.id, 'end-cut', [cut.line[0], cut.line[1]]),
    ),
  ];
  return {
    status: 'resolved',
    solid: {
      memberId: member.id,
      section: member.section,
      profile: profile.map((point) => ({ ...point })),
      stockProfile: assembly.member.stockProfile.map((point) => ({ ...point })),
      origin,
      frame: { along, width, up },
      operationIds: [
        ...assembly.joints.map((joint) => joint.id),
        ...assembly.endCuts.map((cut) => cut.id),
      ].sort(),
      regions,
    },
  };
}

function boundsOf(
  operationId: string,
  kind: FinishedRafterRegion['kind'],
  points: readonly Point2D[],
): FinishedRafterRegion {
  return {
    operationId,
    kind,
    min: {
      x: Math.min(...points.map((point) => point.x)),
      y: Math.min(...points.map((point) => point.y)),
    },
    max: {
      x: Math.max(...points.map((point) => point.x)),
      y: Math.max(...points.map((point) => point.y)),
    },
  };
}

/** Lifts one member-local profile point into world millimetres. */
export function finishedRafterPoint(
  solid: FinishedRafterSolid,
  local: Point2D,
  widthOffsetMm: number,
): Point3D {
  const { origin, frame } = solid;
  return {
    x:
      origin.x +
      frame.along.x * local.x +
      frame.up.x * local.y +
      frame.width.x * widthOffsetMm,
    y:
      origin.y +
      frame.along.y * local.x +
      frame.up.y * local.y +
      frame.width.y * widthOffsetMm,
    z:
      origin.z +
      frame.along.z * local.x +
      frame.up.z * local.y +
      frame.width.z * widthOffsetMm,
  };
}
