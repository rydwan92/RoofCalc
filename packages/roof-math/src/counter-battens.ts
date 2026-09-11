import type {
  CounterBattenLayoutSpec,
  Point3D,
  RoofFeature,
  RoofPlanePosition,
  RoofSkeleton,
  RoofTemplateSpec,
  RoofWindowFeature,
  SkeletonMember3D,
} from '@cieslacalc/timber-model';
import {
  projectPlaneLocalToWorld,
  projectPlaneWorldToLocal,
  resolveRoofPlaneBasis,
} from './roof-features';
import { roofPlaneIds } from './roof-surface';

const EPSILON = 1e-7;

export type CounterBattenWarning =
  | 'unsupported-hip-counter-battens'
  | 'unknown-roof-plane'
  | 'invalid-source-axis';

export interface CounterBattenSegment {
  from: Point3D;
  to: Point3D;
  fromLocal: RoofPlanePosition;
  toLocal: RoofPlanePosition;
  lengthMm: number;
}

export interface ResolvedCounterBatten {
  id: string;
  roofPlaneId: string;
  sourceMemberId: string;
  segments: CounterBattenSegment[];
  visibleLengthMm: number;
  section: { widthMm: number; depthMm: number };
  status: 'resolved' | 'limited';
  warnings: CounterBattenWarning[];
}

export interface CounterBattenLayoutResult {
  status: 'disabled' | 'resolved' | 'limited';
  rows: ResolvedCounterBatten[];
  totalVisibleLengthMm: number;
  warnings: CounterBattenWarning[];
}

function originalRafterId(member: SkeletonMember3D) {
  if (member.kind === 'rafter') return member.id;
  return (
    /instance:(?:rafter-pair|hip-common-pair)-\d+:(?:left|right)/.exec(
      member.id,
    )?.[0] ?? member.id
  );
}

function verticalIntervalAtU(
  polygon: readonly RoofPlanePosition[],
  uMm: number,
) {
  const hits: number[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]!;
    const b = polygon[(index + 1) % polygon.length]!;
    if (Math.abs(a.uMm - b.uMm) <= EPSILON) {
      if (Math.abs(uMm - a.uMm) <= EPSILON) hits.push(a.vMm, b.vMm);
      continue;
    }
    if ((a.uMm <= uMm && b.uMm > uMm) || (b.uMm <= uMm && a.uMm > uMm))
      hits.push(a.vMm + ((uMm - a.uMm) * (b.vMm - a.vMm)) / (b.uMm - a.uMm));
  }
  const ordered = hits.sort((a, b) => a - b);
  return ordered.length >= 2
    ? { fromVMm: ordered[0]!, toVMm: ordered.at(-1)! }
    : undefined;
}

function subtractOpenings(
  interval: { fromVMm: number; toVMm: number },
  uMm: number,
  openings: readonly RoofWindowFeature[],
) {
  return openings
    .filter(
      (opening) =>
        uMm >= opening.position.uMm - EPSILON &&
        uMm <= opening.position.uMm + opening.widthMm + EPSILON,
    )
    .sort((a, b) => a.position.vMm - b.position.vMm || a.id.localeCompare(b.id))
    .reduce<{ fromVMm: number; toVMm: number }[]>(
      (segments, opening) =>
        segments.flatMap((segment) => {
          const holeFrom = opening.position.vMm;
          const holeTo = opening.position.vMm + opening.heightMm;
          if (holeTo <= segment.fromVMm || holeFrom >= segment.toVMm)
            return [segment];
          return [
            ...(holeFrom > segment.fromVMm
              ? [{ fromVMm: segment.fromVMm, toVMm: holeFrom }]
              : []),
            ...(holeTo < segment.toVMm
              ? [{ fromVMm: holeTo, toVMm: segment.toVMm }]
              : []),
          ];
        }),
      [interval],
    )
    .filter((segment) => segment.toVMm - segment.fromVMm > EPSILON);
}

/**
 * Derives visible counter-batten axes from physical common-rafter placements.
 * Hip/J1 axes stay explicitly limited until their face/reference convention is fixed.
 */
export function resolveCounterBattenLayout(args: {
  template: RoofTemplateSpec;
  skeleton: RoofSkeleton;
  layout: CounterBattenLayoutSpec;
  features?: readonly RoofFeature[];
}): CounterBattenLayoutResult {
  if (!args.layout.enabled)
    return {
      status: 'disabled',
      rows: [],
      totalVisibleLengthMm: 0,
      warnings: [],
    };
  if (
    !Number.isFinite(args.layout.widthMm) ||
    !Number.isFinite(args.layout.heightMm) ||
    args.layout.widthMm <= 0 ||
    args.layout.heightMm <= 0
  )
    throw new RangeError('invalid_counter_batten_section');
  if (args.template.type === 'hip')
    return {
      status: 'limited',
      rows: [],
      totalVisibleLengthMm: 0,
      warnings: ['unsupported-hip-counter-battens'],
    };

  const knownPlanes = roofPlaneIds(args.template);
  const requestedPlanes = args.layout.roofPlaneIds ?? knownPlanes;
  const unknown = requestedPlanes.filter((id) => !knownPlanes.includes(id));
  const warnings: CounterBattenWarning[] = unknown.length
    ? ['unknown-roof-plane']
    : [];
  const rows: ResolvedCounterBatten[] = [];

  for (const roofPlaneId of requestedPlanes.filter((id) =>
    knownPlanes.includes(id),
  )) {
    const side = roofPlaneId.endsWith(':left') ? 'left' : 'right';
    const basis = resolveRoofPlaneBasis(args.template, roofPlaneId);
    const openings = (args.features ?? []).filter(
      (feature): feature is RoofWindowFeature =>
        feature.kind === 'roof-window' && feature.roofPlaneId === roofPlaneId,
    );
    const candidates = args.skeleton.members.filter(
      (member) =>
        (member.kind === 'rafter' || member.kind === 'rafter-segment') &&
        member.side === side,
    );
    const axes = new Map<string, SkeletonMember3D[]>();
    for (const member of candidates) {
      const sourceId = originalRafterId(member);
      axes.set(sourceId, [...(axes.get(sourceId) ?? []), member]);
    }
    for (const [sourceMemberId, members] of [...axes.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { numeric: true }),
    )) {
      const localPoints = members.flatMap((member) => [
        projectPlaneWorldToLocal(basis, member.from),
        projectPlaneWorldToLocal(basis, member.to),
      ]);
      const uMm =
        localPoints.reduce((sum, point) => sum + point.uMm, 0) /
        localPoints.length;
      const interval = verticalIntervalAtU(basis.polygon, uMm);
      if (!interval || !Number.isFinite(uMm)) {
        warnings.push('invalid-source-axis');
        continue;
      }
      const segments = subtractOpenings(interval, uMm, openings).map(
        ({ fromVMm, toVMm }) => {
          const fromLocal = { uMm, vMm: fromVMm };
          const toLocal = { uMm, vMm: toVMm };
          return {
            from: projectPlaneLocalToWorld(basis, fromLocal),
            to: projectPlaneLocalToWorld(basis, toLocal),
            fromLocal,
            toLocal,
            lengthMm: toVMm - fromVMm,
          };
        },
      );
      rows.push({
        id: `counter-batten:${roofPlaneId}:${sourceMemberId}`,
        roofPlaneId,
        sourceMemberId,
        segments,
        visibleLengthMm: segments.reduce(
          (sum, segment) => sum + segment.lengthMm,
          0,
        ),
        section: {
          widthMm: args.layout.widthMm,
          depthMm: args.layout.heightMm,
        },
        status: warnings.includes('invalid-source-axis')
          ? 'limited'
          : 'resolved',
        warnings: [],
      });
    }
  }
  const uniqueWarnings = [...new Set(warnings)].sort();
  return {
    status: uniqueWarnings.length ? 'limited' : 'resolved',
    rows,
    totalVisibleLengthMm: rows.reduce(
      (sum, row) => sum + row.visibleLengthMm,
      0,
    ),
    warnings: uniqueWarnings,
  };
}
