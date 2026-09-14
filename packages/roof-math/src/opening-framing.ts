import type {
  Point3D,
  RoofOpeningFramingSpec,
  RoofSkeleton,
  RoofTemplateSpec,
  RoofWindowFeature,
  SkeletonMember3D,
  TimberSection,
} from '@cieslacalc/timber-model';
import {
  projectPlaneLocalToWorld,
  projectPlaneWorldToLocal,
  resolveRoofFeatureCollisions,
  resolveRoofPlaneBasis,
} from './roof-features';

const EPSILON = 1e-6;

export type OpeningFramingStatus =
  | 'resolved'
  | 'not-needed'
  | 'unsupported-complex-boundary'
  | 'invalid-opening'
  | 'no-bounding-rafters'
  | 'conflict';

export type OpeningFramingReviewStatus =
  'valid' | 'needs-review' | 'unsupported' | 'invalid';

export interface OpeningEnvelope {
  fromUMm: number;
  toUMm: number;
  fromVMm: number;
  toVMm: number;
}

export interface ResolvedOpeningFramingMember {
  id: string;
  role: 'upper-header' | 'lower-header';
  member: SkeletonMember3D;
  lengthMm: number;
}

export interface ResolvedInterruptedRafter {
  sourceMemberInstanceId: string;
  lowerSegment: SkeletonMember3D;
  upperSegment: SkeletonMember3D;
}

export interface OpeningFramingResult {
  featureId: string;
  framingSpecId?: string;
  roofPlaneId: string;
  status: OpeningFramingStatus;
  reviewStatus: OpeningFramingReviewStatus;
  geometrySignature?: string;
  affectedMemberInstanceIds: string[];
  boundingMemberInstanceIds: string[];
  openingEnvelope: OpeningEnvelope;
  upperFramingMember?: ResolvedOpeningFramingMember;
  lowerFramingMember?: ResolvedOpeningFramingMember;
  interruptedRafters: ResolvedInterruptedRafter[];
  warningCodes: string[];
}

export interface OpeningFramingSetResult {
  results: OpeningFramingResult[];
  composedSkeleton: RoofSkeleton;
}

function emptyResult(
  feature: RoofWindowFeature,
  status: OpeningFramingStatus,
  reviewStatus: OpeningFramingReviewStatus,
  warningCodes: string[],
): OpeningFramingResult {
  return {
    featureId: feature.id,
    roofPlaneId: feature.roofPlaneId,
    status,
    reviewStatus,
    affectedMemberInstanceIds: [],
    boundingMemberInstanceIds: [],
    openingEnvelope: envelope(feature),
    interruptedRafters: [],
    warningCodes,
  };
}

function envelope(feature: RoofWindowFeature): OpeningEnvelope {
  return {
    fromUMm: feature.position.uMm,
    toUMm: feature.position.uMm + feature.widthMm,
    fromVMm: feature.position.vMm,
    toVMm: feature.position.vMm + feature.heightMm,
  };
}

function memberPlaneDistance(
  member: SkeletonMember3D,
  basis: ReturnType<typeof resolveRoofPlaneBasis>,
) {
  const distance = (point: Point3D) => {
    const x = point.x - basis.origin.x;
    const y = point.y - basis.origin.y;
    const z = point.z - basis.origin.z;
    return x * basis.normal.x + y * basis.normal.y + z * basis.normal.z;
  };
  return Math.max(
    Math.abs(distance(member.from)),
    Math.abs(distance(member.to)),
  );
}

function memberUMm(
  member: SkeletonMember3D,
  basis: ReturnType<typeof resolveRoofPlaneBasis>,
) {
  const from = projectPlaneWorldToLocal(basis, member.from);
  const to = projectPlaneWorldToLocal(basis, member.to);
  return (from.uMm + to.uMm) / 2;
}

function signature(args: {
  template: RoofTemplateSpec;
  feature: RoofWindowFeature;
  affectedIds: string[];
  boundingIds: string[];
}) {
  const { template, feature } = args;
  return JSON.stringify({
    roofType: template.type,
    halfRunMm: template.halfRunMm,
    buildingLengthMm: template.buildingLengthMm,
    pitchDeg: template.pitchDeg,
    eaveOverhangMm: template.eaveOverhangMm,
    rafterSpacing: template.rafterSpacing,
    roofPlaneId: feature.roofPlaneId,
    opening: envelope(feature),
    affectedIds: args.affectedIds,
    boundingIds: args.boundingIds,
  });
}

function segmentMember(
  source: SkeletonMember3D,
  featureId: string,
  role: 'lower' | 'upper',
  from: Point3D,
  to: Point3D,
): SkeletonMember3D {
  return {
    ...source,
    id: `instance:opening-rafter-segment:${featureId}:${source.id}:${role}`,
    // Structured provenance so consumers never parse the composite segment ID.
    sourceMemberId: source.sourceMemberId ?? source.id,
    sourceFeatureId: featureId,
    openingRole: role,
    selectionId: featureId,
    kind: 'rafter-segment',
    from,
    to,
  };
}

function createInterruptedRafter(args: {
  source: SkeletonMember3D;
  featureId: string;
  basis: ReturnType<typeof resolveRoofPlaneBasis>;
  lowerVMm: number;
  upperVMm: number;
}): ResolvedInterruptedRafter | undefined {
  const fromLocal = projectPlaneWorldToLocal(args.basis, args.source.from);
  const toLocal = projectPlaneWorldToLocal(args.basis, args.source.to);
  const fromIsLow = fromLocal.vMm <= toLocal.vMm;
  const low = fromIsLow ? fromLocal : toLocal;
  const high = fromIsLow ? toLocal : fromLocal;
  if (args.lowerVMm <= low.vMm + EPSILON || args.upperVMm >= high.vMm - EPSILON)
    return undefined;
  const lowerCut = projectPlaneLocalToWorld(args.basis, {
    uMm: low.uMm,
    vMm: args.lowerVMm,
  });
  const upperCut = projectPlaneLocalToWorld(args.basis, {
    uMm: high.uMm,
    vMm: args.upperVMm,
  });
  const lowerSegment = segmentMember(
    args.source,
    args.featureId,
    'lower',
    fromIsLow ? args.source.from : args.source.to,
    lowerCut,
  );
  const upperSegment = segmentMember(
    args.source,
    args.featureId,
    'upper',
    upperCut,
    fromIsLow ? args.source.to : args.source.from,
  );
  return {
    sourceMemberInstanceId: args.source.id,
    lowerSegment,
    upperSegment,
  };
}

export function openingFramingDefaultSection(
  template: RoofTemplateSpec,
): TimberSection {
  return { ...template.rafterSection };
}

export function createOpeningFramingDraft(
  template: RoofTemplateSpec,
  featureId: string,
): RoofOpeningFramingSpec {
  return {
    id: `opening-framing:${featureId}`,
    kind: 'roof-opening-framing',
    featureId,
    headerSection: openingFramingDefaultSection(template),
    edgeOffsetMm: template.rafterSection.widthMm,
    acceptedGeometrySignature: '',
  };
}

/** Pure geometric resolver. It intentionally makes no structural-sizing decision. */
export function resolveOpeningFraming(args: {
  template: RoofTemplateSpec;
  skeleton: RoofSkeleton;
  feature: RoofWindowFeature;
  framingSpec?: RoofOpeningFramingSpec;
}): OpeningFramingResult {
  const { template, skeleton, feature } = args;
  if (
    !Number.isFinite(feature.widthMm) ||
    !Number.isFinite(feature.heightMm) ||
    feature.widthMm <= 0 ||
    feature.heightMm <= 0
  )
    return emptyResult(feature, 'invalid-opening', 'invalid', [
      'invalid-opening',
    ]);
  let basis: ReturnType<typeof resolveRoofPlaneBasis>;
  try {
    basis = resolveRoofPlaneBasis(template, feature.roofPlaneId);
  } catch {
    return emptyResult(feature, 'invalid-opening', 'invalid', [
      'invalid-roof-plane',
    ]);
  }
  const collisions = resolveRoofFeatureCollisions({
    template,
    skeleton,
    feature,
  });
  const collisionMembers = collisions
    .map((collision) =>
      skeleton.members.find(
        (member) => member.id === collision.memberInstanceId,
      ),
    )
    .filter((member): member is SkeletonMember3D => !!member);
  if (
    collisionMembers.some(
      (member) => member.kind === 'hip-rafter' || member.kind === 'jack-rafter',
    )
  )
    return emptyResult(feature, 'unsupported-complex-boundary', 'unsupported', [
      'compound-member-intersection',
    ]);

  const rafters = skeleton.members
    .filter((member) => member.kind === 'rafter')
    .filter(
      (member) =>
        memberPlaneDistance(member, basis) <= member.section.widthMm / 2 + 1,
    )
    .map((member) => ({ member, uMm: memberUMm(member, basis) }))
    .sort((a, b) => a.uMm - b.uMm || a.member.id.localeCompare(b.member.id));
  const opening = envelope(feature);
  const affected = collisionMembers
    .filter((member) => member.kind === 'rafter')
    .sort((a, b) => memberUMm(a, basis) - memberUMm(b, basis));
  if (!affected.length) return emptyResult(feature, 'not-needed', 'valid', []);

  const left = [...rafters]
    .reverse()
    .find(
      ({ member, uMm }) =>
        uMm + member.section.widthMm / 2 <= opening.fromUMm + EPSILON,
    );
  const right = rafters.find(
    ({ member, uMm }) =>
      uMm - member.section.widthMm / 2 >= opening.toUMm - EPSILON,
  );
  if (!left || !right || left.member.id === right.member.id)
    return emptyResult(feature, 'no-bounding-rafters', 'invalid', [
      'no-bounding-rafters',
    ]);

  const spec =
    args.framingSpec ?? createOpeningFramingDraft(template, feature.id);
  if (
    !Number.isFinite(spec.edgeOffsetMm) ||
    spec.edgeOffsetMm < 0 ||
    !Number.isFinite(spec.headerSection.widthMm) ||
    spec.headerSection.widthMm <= 0 ||
    !Number.isFinite(spec.headerSection.depthMm) ||
    spec.headerSection.depthMm <= 0
  )
    return emptyResult(feature, 'invalid-opening', 'invalid', [
      'invalid-framing-spec',
    ]);

  const lowerVMm = opening.fromVMm - spec.edgeOffsetMm;
  const upperVMm = opening.toVMm + spec.edgeOffsetMm;
  const polygonVs = basis.polygon.map((point) => point.vMm);
  if (
    lowerVMm <= Math.min(...polygonVs) + EPSILON ||
    upperVMm >= Math.max(...polygonVs) - EPSILON
  )
    return emptyResult(feature, 'unsupported-complex-boundary', 'unsupported', [
      'opening-near-eave-or-ridge',
    ]);

  const fromUMm = left.uMm + left.member.section.widthMm / 2;
  const toUMm = right.uMm - right.member.section.widthMm / 2;
  if (toUMm <= fromUMm + EPSILON)
    return emptyResult(feature, 'no-bounding-rafters', 'invalid', [
      'no-clear-span',
    ]);
  const framingPrototypeId = `member:opening-framing:${feature.id}`;
  const header = (
    role: 'lower-header' | 'upper-header',
    vMm: number,
  ): ResolvedOpeningFramingMember => {
    const shortRole = role === 'lower-header' ? 'lower' : 'upper';
    return {
      id: `instance:opening-framing:${feature.id}:${shortRole}`,
      role,
      lengthMm: toUMm - fromUMm,
      member: {
        id: `instance:opening-framing:${feature.id}:${shortRole}`,
        sourceFeatureId: feature.id,
        openingRole: shortRole,
        prototypeId: framingPrototypeId,
        selectionId: feature.id,
        kind: 'opening-header',
        from: projectPlaneLocalToWorld(basis, { uMm: fromUMm, vMm }),
        to: projectPlaneLocalToWorld(basis, { uMm: toUMm, vMm }),
        section: spec.headerSection,
        side: left.member.side,
      },
    };
  };
  const interruptedRafters = affected
    .map((source) =>
      createInterruptedRafter({
        source,
        featureId: feature.id,
        basis,
        lowerVMm,
        upperVMm,
      }),
    )
    .filter((item): item is ResolvedInterruptedRafter => !!item);
  if (interruptedRafters.length !== affected.length)
    return emptyResult(feature, 'unsupported-complex-boundary', 'unsupported', [
      'opening-near-member-end',
    ]);
  const affectedIds = affected.map((member) => member.id);
  const boundingIds = [left.member.id, right.member.id];
  const geometrySignature = signature({
    template,
    feature,
    affectedIds,
    boundingIds,
  });
  const reviewStatus =
    spec.acceptedGeometrySignature &&
    spec.acceptedGeometrySignature !== geometrySignature
      ? 'needs-review'
      : 'valid';
  return {
    featureId: feature.id,
    framingSpecId: args.framingSpec?.id,
    roofPlaneId: feature.roofPlaneId,
    status: 'resolved',
    reviewStatus,
    geometrySignature,
    affectedMemberInstanceIds: affectedIds,
    boundingMemberInstanceIds: boundingIds,
    openingEnvelope: opening,
    lowerFramingMember: header('lower-header', lowerVMm),
    upperFramingMember: header('upper-header', upperVMm),
    interruptedRafters,
    warningCodes: reviewStatus === 'needs-review' ? ['geometry-changed'] : [],
  };
}

function envelopesOverlap(a: OpeningEnvelope, b: OpeningEnvelope) {
  return (
    a.fromUMm < b.toUMm - EPSILON &&
    a.toUMm > b.fromUMm + EPSILON &&
    a.fromVMm < b.toVMm - EPSILON &&
    a.toVMm > b.fromVMm + EPSILON
  );
}

/** Applies only accepted, current results; the base skeleton remains unchanged. */
export function composeRoofSkeleton(
  base: RoofSkeleton,
  results: OpeningFramingResult[],
): RoofSkeleton {
  const applicable = results.filter(
    (result) =>
      result.status === 'resolved' &&
      result.reviewStatus === 'valid' &&
      !!result.framingSpecId,
  );
  const removed = new Set(
    applicable.flatMap((result) => result.affectedMemberInstanceIds),
  );
  const derived = applicable.flatMap((result) => [
    ...result.interruptedRafters.flatMap((rafter) => [
      rafter.lowerSegment,
      rafter.upperSegment,
    ]),
    result.lowerFramingMember!.member,
    result.upperFramingMember!.member,
  ]);
  return {
    ...base,
    members: [
      ...base.members.filter((member) => !removed.has(member.id)),
      ...derived,
    ],
  };
}

export function resolveOpeningFramingSet(args: {
  template: RoofTemplateSpec;
  skeleton: RoofSkeleton;
  features: RoofWindowFeature[];
  framingSpecs: RoofOpeningFramingSpec[];
}): OpeningFramingSetResult {
  const results = args.framingSpecs.map((spec) => {
    const feature = args.features.find(
      (candidate) => candidate.id === spec.featureId,
    );
    if (!feature) {
      const orphan: RoofWindowFeature = {
        id: spec.featureId,
        kind: 'roof-window',
        roofPlaneId: '',
        widthMm: 0,
        heightMm: 0,
        position: { uMm: 0, vMm: 0 },
      };
      return {
        ...emptyResult(orphan, 'invalid-opening', 'invalid', [
          'missing-parent-feature',
        ]),
        framingSpecId: spec.id,
      };
    }
    return resolveOpeningFraming({ ...args, feature, framingSpec: spec });
  });
  for (let leftIndex = 0; leftIndex < results.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < results.length;
      rightIndex += 1
    ) {
      const left = results[leftIndex]!;
      const right = results[rightIndex]!;
      if (
        left.roofPlaneId === right.roofPlaneId &&
        left.status === 'resolved' &&
        right.status === 'resolved' &&
        (envelopesOverlap(left.openingEnvelope, right.openingEnvelope) ||
          left.affectedMemberInstanceIds.some((id) =>
            right.affectedMemberInstanceIds.includes(id),
          ))
      ) {
        results[leftIndex] = {
          ...left,
          status: 'conflict',
          reviewStatus: 'unsupported',
          warningCodes: [...left.warningCodes, 'overlapping-adaptation'],
        };
        results[rightIndex] = {
          ...right,
          status: 'conflict',
          reviewStatus: 'unsupported',
          warningCodes: [...right.warningCodes, 'overlapping-adaptation'],
        };
      }
    }
  }
  return {
    results,
    composedSkeleton: composeRoofSkeleton(args.skeleton, results),
  };
}
