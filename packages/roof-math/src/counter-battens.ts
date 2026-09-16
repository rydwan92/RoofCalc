import type {
  CounterBattenLayoutSpec,
  HipCounterBattenDetail,
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
import { roofTemplateSchema } from './roof-template';

const EPSILON = 1e-7;

export type CounterBattenWarning =
  | 'hip-boundary-detail-unresolved'
  | 'unknown-roof-plane'
  | 'invalid-source-axis'
  | 'unsupported-member-reference'
  | 'invalid-counter-batten-section'
  | 'invalid-layout-geometry';

export interface CounterBattenIssue {
  code: CounterBattenWarning;
  roofPlaneId?: string;
  roofPlaneIds?: string[];
  sourceMemberId?: string;
}

/**
 * What a resolved row physically is (V39).
 *
 * `plane-rafter-axis` is the pre-V39 row: a fall-line run over a K1/J1 axis.
 * `hip-boundary-run` is a run parallel to a hip, added only by the explicitly
 * selected `paired-plane-runs` detail
 * (`docs/domain/HIP_BOUNDARY_EXECUTION_RESEARCH.md` §5).
 */
export type CounterBattenRole = 'plane-rafter-axis' | 'hip-boundary-run';

/**
 * A hip boundary the layout knows about, and what was decided for it.
 *
 * It is reported whether or not it produced a run, so the UI can always show
 * the user which boundaries exist and which still need a decision instead of
 * leaving an unexplained partial status.
 */
export interface CounterBattenHipBoundary {
  hipMemberId: string;
  roofPlaneIds: string[];
  detail: HipCounterBattenDetail;
  status: 'resolved' | 'unresolved';
  /** Run IDs this boundary contributed. Empty for `no-dedicated-run`. */
  runIds: string[];
  /** Added visible length, in millimetres. Zero for `no-dedicated-run`. */
  addedLengthMm: number;
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
  /** V39. Absent on nothing — every row states what it physically is. */
  role: CounterBattenRole;
  /**
   * The named line this run is referenced to. Interior runs sit on the
   * rafter axis; a hip-boundary run has its inner face on the plane's hip
   * boundary, so its axis is half a counter-batten width inside the plane.
   */
  reference: 'rafter-axis' | 'plane-hip-boundary';
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
  /** V39: resolved fall-line runs over a K1/J1 axis. */
  interiorAxisCount: number;
  /** V39: resolved runs parallel to a hip. Zero for `no-dedicated-run`. */
  hipBoundaryRunCount: number;
  /** V39: every hip boundary the layout knows about, decided or not. */
  hipBoundaries: CounterBattenHipBoundary[];
  /** V39: hip boundaries still waiting for an execution decision. */
  unresolvedHipBoundaryCount: number;
}

/**
 * Groups derived parts back onto the physical member they came from.
 * Uses structured provenance only; member IDs stay opaque (ADR-007).
 */
function originalRafterId(member: SkeletonMember3D) {
  return member.sourceMemberId ?? member.id;
}

function hipBoundaryPlanes(
  template: RoofTemplateSpec,
  member: SkeletonMember3D,
): string[] {
  const roles: Partial<
    Record<SkeletonMember3D['side'], SkeletonMember3D['side'][]>
  > = {
    'front-left': ['front', 'left'],
    'front-right': ['front', 'right'],
    'rear-left': ['rear', 'left'],
    'rear-right': ['rear', 'right'],
  };
  return roofPlaneIds(template).filter((id) =>
    roles[member.side]?.includes(roofPlaneSide(template, id)!),
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
 * One counter-batten run parallel to a hip, on one adjoining roof plane.
 *
 * The reference is the plane's own hip boundary — the exact line where the two
 * resolved roof planes meet, which the physical H1 member projects onto. The
 * run's inner face lies on that line, so its axis sits half a counter-batten
 * width inside the plane. That offset is the stated definition of the
 * `paired-plane-runs` detail, not an inferred manufacturer dimension
 * (`docs/domain/HIP_BOUNDARY_EXECUTION_RESEARCH.md` §5).
 *
 * Returns `undefined` rather than guessing when the hip does not project onto
 * the plane as a usable line.
 */
function hipBoundaryRun(args: {
  template: RoofTemplateSpec;
  roofPlaneId: string;
  member: SkeletonMember3D;
  widthMm: number;
  heightMm: number;
  openings: readonly RoofWindowFeature[];
}): ResolvedCounterBatten | undefined {
  const basis = resolveRoofPlaneBasis(args.template, args.roofPlaneId);
  const from = projectPlaneWorldToLocal(basis, args.member.from);
  const to = projectPlaneWorldToLocal(basis, args.member.to);
  if (
    ![from.uMm, from.vMm, to.uMm, to.vMm].every(Number.isFinite) ||
    Math.hypot(to.uMm - from.uMm, to.vMm - from.vMm) <= EPSILON
  )
    return undefined;
  // Which way is "into the plane" from this hip edge: toward the plane's
  // interior, which its own polygon centroid identifies exactly.
  const centroid = basis.polygon.reduce(
    (sum, point) => ({
      uMm: sum.uMm + point.uMm / basis.polygon.length,
      vMm: sum.vMm + point.vMm / basis.polygon.length,
    }),
    { uMm: 0, vMm: 0 },
  );
  const axis = { uMm: to.uMm - from.uMm, vMm: to.vMm - from.vMm };
  const axisLength = Math.hypot(axis.uMm, axis.vMm);
  const normal = { uMm: -axis.vMm / axisLength, vMm: axis.uMm / axisLength };
  const midpoint = {
    uMm: (from.uMm + to.uMm) / 2,
    vMm: (from.vMm + to.vMm) / 2,
  };
  const inward =
    (centroid.uMm - midpoint.uMm) * normal.uMm +
      (centroid.vMm - midpoint.vMm) * normal.vMm >=
    0
      ? 1
      : -1;
  const offset = (args.widthMm / 2) * inward;
  const shift = { uMm: normal.uMm * offset, vMm: normal.vMm * offset };
  const axisFrom = { uMm: from.uMm + shift.uMm, vMm: from.vMm + shift.vMm };
  const axisTo = { uMm: to.uMm + shift.uMm, vMm: to.vMm + shift.vMm };
  const segments = subtractOpeningsAlongLine(
    axisFrom,
    axisTo,
    args.openings,
  ).map(({ start, end }) => {
    const fromLocal = {
      uMm: axisFrom.uMm + (axisTo.uMm - axisFrom.uMm) * start,
      vMm: axisFrom.vMm + (axisTo.vMm - axisFrom.vMm) * start,
    };
    const toLocal = {
      uMm: axisFrom.uMm + (axisTo.uMm - axisFrom.uMm) * end,
      vMm: axisFrom.vMm + (axisTo.vMm - axisFrom.vMm) * end,
    };
    return {
      from: projectPlaneLocalToWorld(basis, fromLocal),
      to: projectPlaneLocalToWorld(basis, toLocal),
      fromLocal,
      toLocal,
      lengthMm:
        Math.hypot(axisTo.uMm - axisFrom.uMm, axisTo.vMm - axisFrom.vMm) *
        (end - start),
    };
  });
  if (!segments.length) return undefined;
  return {
    id: `counter-batten:${args.roofPlaneId}:hip:${args.member.id}`,
    roofPlaneId: args.roofPlaneId,
    sourceMemberId: args.member.id,
    segments,
    visibleLengthMm: segments.reduce(
      (sum, segment) => sum + segment.lengthMm,
      0,
    ),
    section: { widthMm: args.widthMm, depthMm: args.heightMm },
    status: 'resolved',
    warnings: [],
    role: 'hip-boundary-run',
    reference: 'plane-hip-boundary',
  };
}

/**
 * Splits a plane-local line by the roof openings it crosses, as normalized
 * parameters along the line. A hip-boundary run is diagonal, so it cannot
 * reuse the constant-u interval logic the fall-line axes use.
 */
function subtractOpeningsAlongLine(
  from: RoofPlanePosition,
  to: RoofPlanePosition,
  openings: readonly RoofWindowFeature[],
): { start: number; end: number }[] {
  const holes = openings
    .map((opening) => {
      const uRange = [
        opening.position.uMm,
        opening.position.uMm + opening.widthMm,
      ] as const;
      const vRange = [
        opening.position.vMm,
        opening.position.vMm + opening.heightMm,
      ] as const;
      let start = 0;
      let end = 1;
      for (const [a, b, lo, hi] of [
        [from.uMm, to.uMm, uRange[0], uRange[1]],
        [from.vMm, to.vMm, vRange[0], vRange[1]],
      ] as const) {
        const delta = b - a;
        if (Math.abs(delta) <= EPSILON) {
          if (a < lo - EPSILON || a > hi + EPSILON) return undefined;
          continue;
        }
        const t0 = (lo - a) / delta;
        const t1 = (hi - a) / delta;
        start = Math.max(start, Math.min(t0, t1));
        end = Math.min(end, Math.max(t0, t1));
      }
      return end - start > EPSILON ? { start, end } : undefined;
    })
    .filter((hole): hole is { start: number; end: number } => !!hole)
    .sort((a, b) => a.start - b.start);
  return holes
    .reduce<{ start: number; end: number }[]>(
      (segments, hole) =>
        segments.flatMap((segment) => {
          if (hole.end <= segment.start || hole.start >= segment.end)
            return [segment];
          return [
            ...(hole.start > segment.start
              ? [{ start: segment.start, end: hole.start }]
              : []),
            ...(hole.end < segment.end
              ? [{ start: hole.end, end: segment.end }]
              : []),
          ];
        }),
      [{ start: 0, end: 1 }],
    )
    .filter((segment) => segment.end - segment.start > EPSILON);
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
      interiorAxisCount: 0,
      hipBoundaryRunCount: 0,
      hipBoundaries: [],
      unresolvedHipBoundaryCount: 0,
    };
  if (
    !Number.isFinite(args.layout.widthMm) ||
    !Number.isFinite(args.layout.heightMm) ||
    args.layout.widthMm <= 0 ||
    args.layout.heightMm <= 0
  )
    return {
      status: 'partial',
      rows: [],
      totalVisibleLengthMm: 0,
      warnings: ['invalid-counter-batten-section'],
      issues: [{ code: 'invalid-counter-batten-section' }],
      resolvedAxisCount: 0,
      visibleSegmentCount: 0,
      roofPlaneIds: args.layout.roofPlaneIds ?? [],
      interiorAxisCount: 0,
      hipBoundaryRunCount: 0,
      hipBoundaries: [],
      unresolvedHipBoundaryCount: 0,
    };
  if (
    !roofTemplateSchema.safeParse(args.template).success ||
    (args.features ?? []).some(
      (feature) =>
        feature.kind === 'roof-window' &&
        (![
          feature.position.uMm,
          feature.position.vMm,
          feature.widthMm,
          feature.heightMm,
        ].every(Number.isFinite) ||
          feature.widthMm <= 0 ||
          feature.heightMm <= 0),
    )
  )
    return {
      status: 'partial',
      rows: [],
      totalVisibleLengthMm: 0,
      warnings: ['invalid-layout-geometry'],
      issues: [{ code: 'invalid-layout-geometry' }],
      resolvedAxisCount: 0,
      visibleSegmentCount: 0,
      roofPlaneIds: args.layout.roofPlaneIds ?? [],
      interiorAxisCount: 0,
      hipBoundaryRunCount: 0,
      hipBoundaries: [],
      unresolvedHipBoundaryCount: 0,
    };
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
        role: 'plane-rafter-axis',
        reference: 'rafter-axis',
      });
    }
  }
  // V39: the hip boundary is now an explicit execution decision rather than a
  // permanent dead end. `not-decided` still refuses to invent a run.
  const hipDetail: HipCounterBattenDetail =
    args.layout.hipBoundaryDetail ?? 'not-decided';
  const hipBoundaries: CounterBattenHipBoundary[] = [];
  if (args.template.type === 'hip') {
    for (const member of args.skeleton.members
      .filter((candidate) => candidate.kind === 'hip-rafter')
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))) {
      const affectedPlanes = hipBoundaryPlanes(args.template, member).filter(
        (id) => requestedPlanes.includes(id) && knownPlanes.includes(id),
      );
      if (!affectedPlanes.length) continue;
      if (hipDetail === 'not-decided') {
        issues.push({
          code: 'hip-boundary-detail-unresolved',
          roofPlaneIds: affectedPlanes,
          sourceMemberId: member.id,
        });
        hipBoundaries.push({
          hipMemberId: member.id,
          roofPlaneIds: affectedPlanes,
          detail: hipDetail,
          status: 'unresolved',
          runIds: [],
          addedLengthMm: 0,
        });
        continue;
      }
      if (hipDetail === 'no-dedicated-run') {
        // The hip batten rides on holders fixed into the hip rafter, so the
        // boundary is fully decided and contributes no counter-batten length.
        hipBoundaries.push({
          hipMemberId: member.id,
          roofPlaneIds: affectedPlanes,
          detail: hipDetail,
          status: 'resolved',
          runIds: [],
          addedLengthMm: 0,
        });
        continue;
      }
      const runIds: string[] = [];
      let addedLengthMm = 0;
      for (const roofPlaneId of [...affectedPlanes].sort()) {
        const run = hipBoundaryRun({
          template: args.template,
          roofPlaneId,
          member,
          widthMm: args.layout.widthMm,
          heightMm: args.layout.heightMm,
          openings: (args.features ?? []).filter(
            (feature): feature is RoofWindowFeature =>
              feature.kind === 'roof-window' &&
              feature.roofPlaneId === roofPlaneId,
          ),
        });
        if (!run) {
          issues.push({
            code: 'invalid-source-axis',
            roofPlaneId,
            sourceMemberId: member.id,
          });
          continue;
        }
        rows.push(run);
        runIds.push(run.id);
        addedLengthMm += run.visibleLengthMm;
      }
      hipBoundaries.push({
        hipMemberId: member.id,
        roofPlaneIds: affectedPlanes,
        detail: hipDetail,
        status:
          runIds.length === affectedPlanes.length ? 'resolved' : 'unresolved',
        runIds,
        addedLengthMm,
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
    interiorAxisCount: rows.filter((row) => row.role === 'plane-rafter-axis')
      .length,
    hipBoundaryRunCount: rows.filter((row) => row.role === 'hip-boundary-run')
      .length,
    hipBoundaries,
    unresolvedHipBoundaryCount: hipBoundaries.filter(
      (boundary) => boundary.status === 'unresolved',
    ).length,
  };
}
