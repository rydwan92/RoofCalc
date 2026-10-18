import type {
  ResolvedMemberPrototype,
  SkeletonMember3D,
  SkeletonMemberKind,
  SkeletonMemberSide,
} from '@cieslacalc/timber-model';

/**
 * Which physical member this is, in carpenter's terms: the prototype code
 * (K1, H1, J1, C1), an ordinal counted along the building per kind and roof
 * part, the part, and which piece of an interrupted rafter. Built from
 * structured data only — never parsed from member IDs (ADR-007).
 */
export interface MemberLabel {
  kind: SkeletonMemberKind;
  code?: string;
  ordinal?: number;
  part: SkeletonMemberSide;
  piece?: 'lower' | 'upper';
}

const KIND_CODES: Partial<Record<SkeletonMemberKind, string>> = {
  rafter: 'K1',
  'rafter-segment': 'K1',
  'hip-rafter': 'H1',
  'jack-rafter': 'J1',
  'collar-tie': 'C1',
};

/** Kinds numbered along the building (members of one kind look alike). */
const NUMBERED: ReadonlySet<SkeletonMemberKind> = new Set([
  'rafter',
  'rafter-segment',
  'jack-rafter',
  'collar-tie',
  'purlin',
]);

/**
 * Position along the eave for ordering, from geometry: y on the long sides
 * (and for collars), x on the hip ends. `stationMm` is not used — for jacks
 * it is the distance from their hip corner, not a position on the building.
 */
const station = (member: SkeletonMember3D) =>
  member.side === 'front' || member.side === 'rear'
    ? member.from.x
    : member.from.y;
/** Purlins and plates sit across the span: order them by their x. */
const across = (member: SkeletonMember3D) =>
  Math.abs((member.from.x + member.to.x) / 2);

export function memberLabelIndex(
  members: readonly SkeletonMember3D[],
  prototypes: readonly ResolvedMemberPrototype[] = [],
): Map<string, MemberLabel> {
  const codes = new Map(
    prototypes.map((prototype) => [prototype.id, prototype.code]),
  );
  // One axis per interrupted rafter: its pieces share the source ordinal.
  const groups = new Map<string, Map<string, number>>();
  for (const member of members) {
    if (!NUMBERED.has(member.kind)) continue;
    const family = member.kind === 'rafter-segment' ? 'rafter' : member.kind;
    const key = `${family}|${member.side}`;
    const axis = member.sourceMemberId ?? member.id;
    const group = groups.get(key) ?? new Map<string, number>();
    const position =
      member.kind === 'purlin' ? -across(member) : station(member);
    group.set(axis, Math.min(group.get(axis) ?? Infinity, position));
    groups.set(key, group);
  }
  const ordinals = new Map<string, number>();
  for (const [key, group] of groups) {
    const ordered = [...group.entries()].sort(
      (a, b) => a[1] - b[1] || a[0].localeCompare(b[0]),
    );
    ordered.forEach(([axis], index) =>
      ordinals.set(`${key}|${axis}`, index + 1),
    );
  }
  const index = new Map<string, MemberLabel>();
  for (const member of members) {
    const family = member.kind === 'rafter-segment' ? 'rafter' : member.kind;
    const ordinal = ordinals.get(
      `${family}|${member.side}|${member.sourceMemberId ?? member.id}`,
    );
    const code = codes.get(member.prototypeId) ?? KIND_CODES[member.kind];
    index.set(member.id, {
      kind: member.kind,
      ...(code ? { code } : {}),
      ...(ordinal !== undefined ? { ordinal } : {}),
      part: member.side,
      ...(member.kind === 'rafter-segment' && member.openingRole
        ? { piece: member.openingRole }
        : member.kind === 'opening-header' && member.openingRole
          ? { piece: member.openingRole }
          : {}),
    });
  }
  return index;
}
