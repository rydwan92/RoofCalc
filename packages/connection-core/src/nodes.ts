import type {
  Point3D,
  SkeletonMember3D,
  SkeletonMemberKind,
  SkeletonMemberSide,
} from '@cieslacalc/timber-model';
import {
  ROOF_NODE_ORDER,
  type RoofMemberRole,
  type RoofNodeKind,
} from './catalogue';

/**
 * Where roof members actually meet (węzły). Derived only from the solved
 * member axes (world XYZ, mm) and their structured kinds — never from IDs
 * (ADR-007) — so a node exists only where two axes touch within tolerance,
 * never because two members merely share a roof side. Pure and
 * deterministic: the same members give the same nodes, in the same order,
 * with the same IDs.
 *
 * Geometry only. Which joint, fastener or connector a node receives is the
 * connection plan's business; capacity is a future structural module's.
 */

export interface ConnectionNodeMember {
  id: string;
  /** What the drawing selects for this member (e.g. a purlin's support). */
  selectionId: string;
  role: RoofMemberRole;
}

/** How the axes touch: a crossing, an end on the other axis, two ends. */
export type NodeContact = 'crossing' | 'end-on-axis' | 'end-to-end';

export interface ResolvedRoofConnectionNode {
  /** Deterministic and opaque: never parse it. */
  id: string;
  kind: RoofNodeKind;
  /** The member that bears or ends first, then the member(s) it meets. */
  members: readonly ConnectionNodeMember[];
  /** World point of the contact (axis intersection or member end). */
  location: Point3D;
  /** Roof part of the first member. */
  part: SkeletonMemberSide;
  contact: NodeContact;
}

export type NodeProjectionLimitation =
  /** Rafters meet at an apex with no ridge member: the apex joint is not modelled. */
  'apex-without-ridge';

export interface RoofNodeProjection {
  nodes: readonly ResolvedRoofConnectionNode[];
  /**
   * Wall plates: their anchorage repeats at a spacing the roof model does
   * not define, so this is a member count and length — not anchor count.
   */
  wallPlates: { count: number; lengthMm: number };
  /** Distinct axes; an opening's two rafter segments belong to one axis. */
  axes: { commonRafters: number; jackRafters: number };
  limitations: readonly NodeProjectionLimitation[];
}

/**
 * `board`: every rafter bears on the ridge member (one node per rafter).
 * `paired`: opposite rafters meet each other (one node per pair).
 */
export type RidgeJointMode = 'board' | 'paired';

/** Axes are solved to well under a millimetre; 1 mm absorbs rounding only. */
export const NODE_TOLERANCE_MM = 1;

export function memberRole(kind: SkeletonMemberKind): RoofMemberRole {
  switch (kind) {
    case 'rafter':
    case 'rafter-segment':
      return 'common-rafter';
    case 'hip-rafter':
      return 'hip-rafter';
    case 'jack-rafter':
      return 'jack-rafter';
    case 'wall-plate':
      return 'wall-plate';
    case 'ridge':
      return 'ridge-board';
    case 'purlin':
      return 'purlin';
    case 'collar-tie':
      return 'collar-tie';
    case 'opening-header':
      return 'opening-header';
  }
}

/* ------------------------------------------------------------------------ */
/* Vector helpers                                                            */
/* ------------------------------------------------------------------------ */

const sub = (a: Point3D, b: Point3D): Point3D => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
const dot = (a: Point3D, b: Point3D) => a.x * b.x + a.y * b.y + a.z * b.z;
const along = (a: Point3D, d: Point3D, t: number): Point3D => ({
  x: a.x + d.x * t,
  y: a.y + d.y * t,
  z: a.z + d.z * t,
});
const distance = (a: Point3D, b: Point3D) =>
  Math.sqrt(dot(sub(a, b), sub(a, b)));
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const memberLength = (member: SkeletonMember3D) =>
  distance(member.from, member.to);

/** Closest point of a member axis to `point`, with its axis parameter. */
function closestOnAxis(member: SkeletonMember3D, point: Point3D) {
  const direction = sub(member.to, member.from);
  const lengthSquared = dot(direction, direction);
  const t = lengthSquared
    ? clamp01(dot(sub(point, member.from), direction) / lengthSquared)
    : 0;
  const closest = along(member.from, direction, t);
  return { t, point: closest, distance: distance(point, closest) };
}

/** Closest points between two member axes (segments). */
function closestBetween(a: SkeletonMember3D, b: SkeletonMember3D) {
  const d1 = sub(a.to, a.from);
  const d2 = sub(b.to, b.from);
  const r = sub(a.from, b.from);
  const aa = dot(d1, d1);
  const ee = dot(d2, d2);
  const f = dot(d2, r);
  let s = 0;
  let t = 0;
  if (aa <= 1e-9 && ee <= 1e-9) return undefined;
  if (aa <= 1e-9) t = clamp01(f / ee);
  else {
    const c = dot(d1, r);
    if (ee <= 1e-9) s = clamp01(-c / aa);
    else {
      const bb = dot(d1, d2);
      const denominator = aa * ee - bb * bb;
      s = denominator > 1e-9 ? clamp01((bb * f - c * ee) / denominator) : 0;
      t = (bb * s + f) / ee;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / aa);
      } else if (t > 1) {
        t = 1;
        s = clamp01((bb - c) / aa);
      }
    }
  }
  const pa = along(a.from, d1, s);
  const pb = along(b.from, d2, t);
  return { s, t, pa, pb, distance: distance(pa, pb) };
}

const atEnd = (parameter: number, lengthMm: number) =>
  Math.min(parameter, 1 - parameter) * lengthMm <= NODE_TOLERANCE_MM;

const midpoint = (a: Point3D, b: Point3D): Point3D => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  z: (a.z + b.z) / 2,
});

/** Rounded so floating noise never changes a reported location. */
const round = (point: Point3D): Point3D => ({
  x: Math.round(point.x * 10) / 10,
  y: Math.round(point.y * 10) / 10,
  z: Math.round(point.z * 10) / 10,
});

/* ------------------------------------------------------------------------ */
/* Contacts                                                                  */
/* ------------------------------------------------------------------------ */

/** Two axes that pass through each other (a rafter over a plate or purlin). */
function crossing(a: SkeletonMember3D, b: SkeletonMember3D) {
  const closest = closestBetween(a, b);
  if (!closest || closest.distance > NODE_TOLERANCE_MM) return undefined;
  const aEnd = atEnd(closest.s, memberLength(a));
  const bEnd = atEnd(closest.t, memberLength(b));
  const contact: NodeContact =
    aEnd && bEnd ? 'end-to-end' : aEnd || bEnd ? 'end-on-axis' : 'crossing';
  return { location: midpoint(closest.pa, closest.pb), contact };
}

/**
 * An end of `ending` on the axis of `target`. The end may stop at the
 * target's face (an opening header against its bounding rafter), so the
 * reach is half the target's width plus the tolerance.
 */
function endOnAxis(ending: SkeletonMember3D, target: SkeletonMember3D) {
  const reach = NODE_TOLERANCE_MM + target.section.widthMm / 2;
  const targetLength = memberLength(target);
  for (const end of [ending.to, ending.from]) {
    const closest = closestOnAxis(target, end);
    if (closest.distance > reach) continue;
    // Only within the target, allowing the same reach past its ends.
    const unclamped = targetLength
      ? dot(sub(end, target.from), sub(target.to, target.from)) /
        (targetLength * targetLength)
      : 0;
    const margin = targetLength ? reach / targetLength : 0;
    if (unclamped < -margin || unclamped > 1 + margin) continue;
    const contact: NodeContact = atEnd(closest.t, targetLength)
      ? 'end-to-end'
      : 'end-on-axis';
    return { location: end, contact };
  }
  return undefined;
}

const nodeMember = (member: SkeletonMember3D): ConnectionNodeMember => ({
  id: member.id,
  selectionId: member.selectionId,
  role: memberRole(member.kind),
});

function node(
  kind: RoofNodeKind,
  members: readonly SkeletonMember3D[],
  location: Point3D,
  contact: NodeContact,
): ResolvedRoofConnectionNode {
  return {
    id: `node:${kind}:${members.map((member) => member.id).join('+')}`,
    kind,
    members: members.map(nodeMember),
    location: round(location),
    part: members[0]!.side,
    contact,
  };
}

/* ------------------------------------------------------------------------ */
/* Projection                                                                */
/* ------------------------------------------------------------------------ */

export function resolveRoofConnectionNodes(input: {
  members: readonly SkeletonMember3D[];
  ridgeJoint: RidgeJointMode;
}): RoofNodeProjection {
  const of = (...kinds: SkeletonMemberKind[]) =>
    input.members.filter((member) => kinds.includes(member.kind));
  const commons = of('rafter', 'rafter-segment');
  const fullRafters = of('rafter');
  const segments = of('rafter-segment');
  const hips = of('hip-rafter');
  const jacks = of('jack-rafter');
  const plates = of('wall-plate');
  const ridges = of('ridge');
  const purlins = of('purlin');
  const collars = of('collar-tie');
  const headers = of('opening-header');
  const nodes: ResolvedRoofConnectionNode[] = [];

  const crossings = (
    kind: RoofNodeKind,
    bearing: readonly SkeletonMember3D[],
    supports: readonly SkeletonMember3D[],
  ) => {
    for (const member of bearing)
      for (const support of supports) {
        const contact = crossing(member, support);
        // Bearing means passing over the support; two members whose ends
        // merely coincide (a jack ending where a purlin meets the hip) do not
        // bear on each other.
        if (contact && contact.contact !== 'end-to-end')
          nodes.push(
            node(kind, [member, support], contact.location, contact.contact),
          );
      }
  };
  const ends = (
    kind: RoofNodeKind,
    ending: readonly SkeletonMember3D[],
    targets: readonly SkeletonMember3D[],
  ) => {
    for (const member of ending)
      for (const target of targets) {
        const contact = endOnAxis(member, target);
        if (contact)
          nodes.push(
            node(kind, [member, target], contact.location, contact.contact),
          );
      }
  };

  crossings('rafter-wall-plate', commons, plates);
  crossings('jack-rafter-wall-plate', jacks, plates);
  // A hip runs over the corner where two wall plates meet: one node.
  for (const hip of hips) {
    const touching = plates
      .map((plate) => ({ plate, contact: crossing(hip, plate) }))
      .filter((item) => item.contact)
      .sort((a, b) => a.plate.id.localeCompare(b.plate.id));
    if (touching.length)
      nodes.push(
        node(
          'hip-rafter-wall-plate',
          [hip, ...touching.map((item) => item.plate)],
          touching[0]!.contact!.location,
          touching[0]!.contact!.contact,
        ),
      );
  }
  crossings('rafter-purlin', commons, purlins);
  crossings('jack-rafter-purlin', jacks, purlins);
  ends('purlin-hip-rafter', purlins, hips);
  ends('collar-tie-rafter', collars, fullRafters);
  ends('opening-header-rafter', headers, fullRafters);
  ends('interrupted-rafter-header', segments, headers);
  ends('jack-rafter-hip-rafter', jacks, hips);
  ends('hip-rafter-ridge', hips, ridges);

  if (input.ridgeJoint === 'board') ends('rafter-ridge', commons, ridges);
  else {
    // Opposite rafters meeting at the ridge line form one joint per pair.
    const tops = commons.flatMap((member) =>
      ridges.flatMap((ridge) => {
        const contact = endOnAxis(member, ridge);
        return contact ? [{ member, ridge, location: contact.location }] : [];
      }),
    );
    const used = new Set<string>();
    for (const top of tops) {
      if (used.has(top.member.id)) continue;
      const group = tops.filter(
        (other) =>
          !used.has(other.member.id) &&
          distance(other.location, top.location) <= NODE_TOLERANCE_MM,
      );
      for (const item of group) used.add(item.member.id);
      const members = group
        .map((item) => item.member)
        .sort((a, b) => a.id.localeCompare(b.id));
      nodes.push(
        node(
          'rafter-ridge',
          [...members, top.ridge],
          top.location,
          members.length > 1 ? 'end-to-end' : 'end-on-axis',
        ),
      );
    }
  }

  const order = new Map(ROOF_NODE_ORDER.map((kind, index) => [kind, index]));
  nodes.sort(
    (a, b) =>
      (order.get(a.kind) ?? 0) - (order.get(b.kind) ?? 0) ||
      a.id.localeCompare(b.id),
  );
  return {
    nodes,
    wallPlates: {
      count: plates.length,
      lengthMm: Math.round(
        plates.reduce((sum, plate) => sum + memberLength(plate), 0),
      ),
    },
    axes: {
      commonRafters: new Set(
        commons.map((member) => member.sourceMemberId ?? member.id),
      ).size,
      jackRafters: jacks.length,
    },
    limitations:
      !ridges.length && (hips.length > 0 || commons.length > 0)
        ? ['apex-without-ridge']
        : [],
  };
}

/** Nodes of one kind, in projection order. */
export function nodesOfKind(
  projection: RoofNodeProjection,
  kind: RoofNodeKind,
): ResolvedRoofConnectionNode[] {
  return projection.nodes.filter((item) => item.kind === kind);
}
