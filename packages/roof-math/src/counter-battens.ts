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
import { roofPlaneIds, roofPlaneSide } from './roof-surface';

const EPSILON = 1e-7;

export type CounterBattenWarning =
  | 'hip-boundary-detail-unresolved'
  | 'unknown-roof-plane'
  | 'invalid-source-axis'
  | 'unsupported-member-reference';

export interface CounterBattenIssue {
  code: CounterBattenWarning;
  roofPlaneId?: string;
  roofPlaneIds?: string[];
  sourceMemberId?: string;
}

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
  status: 'resolved' | 'partial';
  warnings: CounterBattenWarning[];
}

export interface CounterBattenLayoutResult {
  status: 'disabled' | 'resolved' | 'partial';
  rows: ResolvedCounterBatten[];
  totalVisibleLengthMm: number;
  warnings: CounterBattenWarning[];
  issues: CounterBattenIssue[];
  resolvedAxisCount: number;
  visibleSegmentCount: number;
  roofPlaneIds: string[];
}

/**
 * Groups derived parts back onto the physical member they came from.
 * Uses structured provenance only; member IDs stay opaque (ADR-007).
 */
function originalRafterId(member: SkeletonMember3D) {
  return member.sourceMemberId ?? member.id;
}

function hipBoundaryPlanes(member: SkeletonMember3D): string[] {
  const roles: Partial<Record<SkeletonMember3D['side'], string[]>> = {
    'front-left': ['roof-plane:front', 'roof-plane:left'],
    'front-right': ['roof-plane:front', 'roof-plane:right'],
    'rear-left': ['roof-plane:rear', 'roof-plane:left'],
    'rear-right': ['roof-plane:rear', 'roof-plane:right'],
  };
  return roles[member.side] ?? [];
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
 * Derives visible counter-batten axes from physical K1/J1 rafter placements.
 * H1 boundary detail remains an explicit partial result until its face reference is fixed.
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
      issues: [],
      resolvedAxisCount: 0,
      visibleSegmentCount: 0,
      roofPlaneIds: [],
    };
  if (
    !Number.isFinite(args.layout.widthMm) ||
    !Number.isFinite(args.layout.heightMm) ||
    args.layout.widthMm <= 0 ||
    args.layout.heightMm <= 0
  )
    throw new RangeError('invalid_counter_batten_section');
  const knownPlanes = roofPlaneIds(args.template);
  const requestedPlanes = args.layout.roofPlaneIds ?? knownPlanes;
  const unknown = requestedPlanes.filter((id) => !knownPlanes.includes(id));
  const issues: CounterBattenIssue[] = unknown.map((roofPlaneId) => ({
    code: 'unknown-roof-plane',
    roofPlaneId,
  }));
  const rows: ResolvedCounterBatten[] = [];

  for (const roofPlaneId of requestedPlanes.filter((id) =>
    knownPlanes.includes(id),
  )) {
    const side = roofPlaneSide(args.template, roofPlaneId);
    if (!side) {
      issues.push({ code: 'unknown-roof-plane', roofPlaneId });
      continue;
    }
    const basis = resolveRoofPlaneBasis(args.template, roofPlaneId);
    const openings = (args.features ?? []).filter(
      (feature): feature is RoofWindowFeature =>
        feature.kind === 'roof-window' && feature.roofPlaneId === roofPlaneId,
    );
    const candidates = args.skeleton.members.filter(
      (member) =>
        (member.kind === 'rafter' ||
          member.kind === 'rafter-segment' ||
          member.kind === 'jack-rafter') &&
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
      const uSpread =
        Math.max(...localPoints.map((point) => point.uMm)) -
        Math.min(...localPoints.map((point) => point.uMm));
      if (
        !interval ||
        !Number.isFinite(uMm) ||
        !Number.isFinite(uSpread) ||
        uSpread > EPSILON
      ) {
        issues.push({
          code: 'invalid-source-axis',
          roofPlaneId,
          sourceMemberId,
        });
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
        status: 'resolved',
        warnings: [],
      });
    }
  }
  if (args.template.type === 'hip') {
    for (const member of args.skeleton.members
      .filter((candidate) => candidate.kind === 'hip-rafter')
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))) {
      const affectedPlanes = hipBoundaryPlanes(member).filter((id) =>
        requestedPlanes.includes(id),
      );
      if (affectedPlanes.length)
        issues.push({
          code: 'hip-boundary-detail-unresolved',
          roofPlaneIds: affectedPlanes,
          sourceMemberId: member.id,
        });
    }
  }
  const orderedIssues = issues.sort(
    (a, b) =>
      a.code.localeCompare(b.code) ||
      (a.roofPlaneId ?? a.roofPlaneIds?.join(',') ?? '').localeCompare(
        b.roofPlaneId ?? b.roofPlaneIds?.join(',') ?? '',
      ) ||
      (a.sourceMemberId ?? '').localeCompare(b.sourceMemberId ?? ''),
  );
  const uniqueWarnings = [
    ...new Set(orderedIssues.map((issue) => issue.code)),
  ].sort();
  const coveredPlanes = [...new Set(rows.map((row) => row.roofPlaneId))];
  const visibleSegmentCount = rows.reduce(
    (sum, row) => sum + row.segments.length,
    0,
  );
  return {
    status: uniqueWarnings.length ? 'partial' : 'resolved',
    rows,
    totalVisibleLengthMm: rows.reduce(
      (sum, row) => sum + row.visibleLengthMm,
      0,
    ),
    warnings: uniqueWarnings,
    issues: orderedIssues,
    resolvedAxisCount: rows.length,
    visibleSegmentCount,
    roofPlaneIds: coveredPlanes,
  };
}
