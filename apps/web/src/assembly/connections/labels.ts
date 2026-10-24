import type {
  ResolvedMemberPrototype,
  SkeletonMember3D,
  SkeletonMemberKind,
  SkeletonMemberSide,
} from '@cieslacalc/timber-model';

/**
 * Which physical member this is, in carpenter's terms, numbered the way the
 * rest of the workbench numbers it (schedule, drawing HUD): K1-04 along the
 * building, J1-02 from its hip corner, H1 by corner. Built from structured
 * data and geometry only — never parsed from member IDs (ADR-007).
 */
export interface MemberLabel {
  kind: SkeletonMemberKind;
  code?: string;
  ordinal?: number;
  part: SkeletonMemberSide;
  /** A jack rafter's hip corner, found from the hip its top end meets. */
  corner?: SkeletonMemberSide;
  piece?: 'lower' | 'upper';
}

const KIND_CODES: Partial<Record<SkeletonMemberKind, string>> = {
  rafter: 'K1',
  'rafter-segment': 'K1',
  'hip-rafter': 'H1',
  'jack-rafter': 'J1',
  'collar-tie': 'C1',
};

const LONG_SIDES: ReadonlySet<SkeletonMemberSide> = new Set([
  'left',
  'right',
  'center',
]);

const distanceToAxis = (
  point: SkeletonMember3D['from'],
  member: SkeletonMember3D,
) => {
  const d = {
    x: member.to.x - member.from.x,
    y: member.to.y - member.from.y,
    z: member.to.z - member.from.z,
  };
  const lengthSquared = d.x * d.x + d.y * d.y + d.z * d.z;
  const t = lengthSquared
    ? Math.min(
        1,
        Math.max(
          0,
          ((point.x - member.from.x) * d.x +
            (point.y - member.from.y) * d.y +
            (point.z - member.from.z) * d.z) /
            lengthSquared,
        ),
      )
    : 0;
  return Math.hypot(
    point.x - (member.from.x + d.x * t),
    point.y - (member.from.y + d.y * t),
    point.z - (member.from.z + d.z * t),
  );
};

/**
 * The short schedule code of a member — "K1-04", "J1-02", "H1" — or
 * undefined when it has none (wall plates, ridge, purlins…).
 */
export function memberCode(label: MemberLabel | undefined): string | undefined {
  if (!label?.code) return undefined;
  if (label.kind === 'hip-rafter') return label.code;
  if (
    (label.kind === 'rafter' ||
      label.kind === 'rafter-segment' ||
      label.kind === 'jack-rafter') &&
    label.ordinal !== undefined
  )
    return `${label.code}-${String(label.ordinal).padStart(2, '0')}`;
  return undefined;
}

export function memberLabelIndex(
  members: readonly SkeletonMember3D[],
  prototypes: readonly ResolvedMemberPrototype[] = [],
): Map<string, MemberLabel> {
  const codes = new Map(
    prototypes.map((prototype) => [prototype.id, prototype.code]),
  );
  const hips = members.filter((member) => member.kind === 'hip-rafter');
  /** The hip a jack's top end lands on gives its corner. */
  const cornerOf = (jack: SkeletonMember3D) =>
    hips
      .map((hip) => ({ hip, gap: distanceToAxis(jack.to, hip) }))
      .sort((a, b) => a.gap - b.gap)[0]?.hip.side;

  // Ordinals: K1 and collars along the building per long side (one axis per
  // interrupted rafter), J1 from their corner, purlins from the wall up.
  const groups = new Map<string, Map<string, number>>();
  const place = (key: string, axis: string, position: number) => {
    const group = groups.get(key) ?? new Map<string, number>();
    group.set(axis, Math.min(group.get(axis) ?? Infinity, position));
    groups.set(key, group);
  };
  const corners = new Map<string, SkeletonMemberSide | undefined>();
  const keyOf = (member: SkeletonMember3D): string | undefined => {
    if (
      (member.kind === 'rafter' ||
        member.kind === 'rafter-segment' ||
        member.kind === 'collar-tie') &&
      LONG_SIDES.has(member.side)
    )
      return `${member.kind === 'collar-tie' ? 'collar' : 'rafter'}|${member.side}`;
    if (member.kind === 'jack-rafter')
      return `jack|${member.side}|${corners.get(member.id) ?? ''}`;
    if (member.kind === 'purlin') return `purlin|${member.side}`;
    return undefined;
  };
  for (const member of members) {
    if (member.kind === 'jack-rafter') corners.set(member.id, cornerOf(member));
    const key = keyOf(member);
    if (!key) continue;
    const position =
      member.kind === 'jack-rafter'
        ? (member.stationMm ?? 0)
        : member.kind === 'purlin'
          ? -Math.abs((member.from.x + member.to.x) / 2)
          : member.from.y;
    place(key, member.sourceMemberId ?? member.id, position);
  }
  const ordinals = new Map<string, number>();
  for (const [key, group] of groups)
    [...group.entries()]
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .forEach(([axis], index) => ordinals.set(`${key}|${axis}`, index + 1));

  const index = new Map<string, MemberLabel>();
  for (const member of members) {
    const key = keyOf(member);
    const ordinal = key
      ? ordinals.get(`${key}|${member.sourceMemberId ?? member.id}`)
      : undefined;
    // VNext-9: a member that names its family (K2) keeps it.
    const code =
      member.familyCode ??
      codes.get(member.prototypeId) ??
      KIND_CODES[member.kind];
    const corner = corners.get(member.id);
    const piece =
      (member.kind === 'rafter-segment' || member.kind === 'opening-header') &&
      member.openingRole
        ? member.openingRole
        : undefined;
    index.set(member.id, {
      kind: member.kind,
      ...(code ? { code } : {}),
      ...(ordinal !== undefined ? { ordinal } : {}),
      part: member.side,
      ...(corner ? { corner } : {}),
      ...(piece ? { piece } : {}),
    });
  }
  return index;
}
