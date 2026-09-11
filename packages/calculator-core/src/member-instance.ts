import type {
  HipCorner,
  JackRafterRoofPlane,
  Point3D,
  RoofSkeleton,
  SkeletonMember3D,
  SkeletonMemberSide,
  TimberSection,
} from '@cieslacalc/timber-model';
import type {
  FabricationLengthGroup,
  FabricationOperationSummary,
  MemberFabricationPackage,
  ResolvedRoofProject,
  RoofFabricationPackage,
} from './fabrication-package';

export type MemberFamilyCode = 'K1' | 'H1' | 'J1';

export interface MemberInstanceOperationContext {
  operationId: string;
  code: string;
  labelKey: string;
  status: FabricationOperationSummary['status'];
  relatedSupportId?: string;
  stationMm: number;
  stationRatio: number;
  worldPoint: Point3D;
  reference: 'member-axis-from-outer-eave';
  removesMaterial: true;
  detailPreviewId?: string;
  warningKeys: string[];
}

export interface MemberInstanceContext {
  instanceId: string;
  prototypeId: string;
  familyCode: MemberFamilyCode;
  memberKind: MemberFabricationPackage['memberType'];
  /** One-based position in the deterministic family order. */
  instanceIndex: number;
  instanceCount: number;
  side: SkeletonMemberSide;
  roofPlaneId?: JackRafterRoofPlane;
  hipCorner?: HipCorner;
  buildingStationMm?: number;
  lengthMm: number;
  lengthGroupId: string;
  section: TimberSection;
  relatedInstanceIds: string[];
  relatedOperationIds: string[];
  operations: MemberInstanceOperationContext[];
  warningKeys: string[];
}

export interface MemberInstanceFabricationContext {
  family: MemberFabricationPackage;
  lengthGroup: FabricationLengthGroup;
  operations: FabricationOperationSummary[];
}

const sideOrder: Record<SkeletonMemberSide, number> = {
  left: 0,
  right: 1,
  center: 2,
  front: 3,
  rear: 4,
  'front-left': 5,
  'front-right': 6,
  'rear-left': 7,
  'rear-right': 8,
};

const cornerOrder: Record<HipCorner, number> = {
  'front-left': 0,
  'front-right': 1,
  'rear-left': 2,
  'rear-right': 3,
};

const planeOrder: Record<JackRafterRoofPlane, number> = {
  left: 0,
  front: 1,
  right: 2,
  rear: 3,
};

function jackFor(resolved: ResolvedRoofProject, instanceId: string) {
  return 'jackRafters' in resolved
    ? resolved.jackRafters.find((jack) => jack.spec.id === instanceId)
    : undefined;
}

function orderedMembers(
  familyCode: MemberFamilyCode,
  members: SkeletonMember3D[],
  resolved: ResolvedRoofProject,
) {
  return [...members].sort((a, b) => {
    if (familyCode === 'H1')
      return (
        cornerOrder[a.side as HipCorner] - cornerOrder[b.side as HipCorner] ||
        a.id.localeCompare(b.id)
      );
    if (familyCode === 'J1') {
      const jackA = jackFor(resolved, a.id);
      const jackB = jackFor(resolved, b.id);
      if (jackA && jackB)
        return (
          cornerOrder[jackA.spec.hipCorner] -
            cornerOrder[jackB.spec.hipCorner] ||
          planeOrder[jackA.spec.roofPlane] - planeOrder[jackB.spec.roofPlane] ||
          jackA.spec.ordinalFromCorner - jackB.spec.ordinalFromCorner ||
          a.id.localeCompare(b.id)
        );
    }
    return (
      (a.stationMm ?? Math.min(a.from.y, a.to.y)) -
        (b.stationMm ?? Math.min(b.from.y, b.to.y)) ||
      sideOrder[a.side] - sideOrder[b.side] ||
      a.id.localeCompare(b.id)
    );
  });
}

function instanceLength(
  familyCode: MemberFamilyCode,
  member: SkeletonMember3D,
  resolved: ResolvedRoofProject,
) {
  if (familyCode === 'J1')
    return jackFor(resolved, member.id)!.result
      .outerEaveToHipCenterLineLengthMm;
  if (familyCode === 'H1' && 'hipRafter' in resolved)
    return resolved.hipRafter.result.outerEaveToRidgeFaceMm;
  return resolved.calculation.plan.minimumStockLengthMm;
}

function interpolateMember(member: SkeletonMember3D, ratio: number): Point3D {
  return {
    x: member.from.x + (member.to.x - member.from.x) * ratio,
    y: member.from.y + (member.to.y - member.from.y) * ratio,
    z: member.from.z + (member.to.z - member.from.z) * ratio,
  };
}

function operationStation(
  operation: FabricationOperationSummary,
  lengthMm: number,
) {
  if (operation.stationMm !== undefined && Number.isFinite(operation.stationMm))
    return operation.stationMm;
  return operation.type === 'ridge-cut' ||
    operation.type === 'hip-cut' ||
    operation.type === 'jack-cut'
    ? lengthMm
    : 0;
}

function operationContext(
  operation: FabricationOperationSummary,
  member: SkeletonMember3D,
  lengthMm: number,
): MemberInstanceOperationContext {
  const stationMm = Math.max(
    0,
    Math.min(lengthMm, operationStation(operation, lengthMm)),
  );
  const stationRatio = lengthMm > 0 ? stationMm / lengthMm : 0;
  return {
    operationId: operation.id,
    code: operation.code,
    labelKey: operation.labelKey,
    status: operation.status,
    relatedSupportId: operation.relatedSupportId,
    stationMm,
    stationRatio,
    worldPoint: interpolateMember(member, stationRatio),
    reference: 'member-axis-from-outer-eave',
    removesMaterial: true,
    detailPreviewId: operation.detailPreview?.id,
    warningKeys: [...operation.warningKeys],
  };
}

function groupForInstance(
  family: MemberFabricationPackage,
  instanceId: string,
) {
  const index = family.lengthGroups.findIndex((group) =>
    group.instanceIds.includes(instanceId),
  );
  if (index < 0) throw new Error(`missing_length_group:${instanceId}`);
  return {
    id: `length-group:${family.code}:${index + 1}`,
    group: family.lengthGroups[index]!,
  };
}

/**
 * Pure bridge from resolved roof/skeleton/package data to physical workshop
 * instances. It only locates already-resolved operations; it performs no cut
 * or joinery calculation.
 */
export function createMemberInstanceContexts(args: {
  resolved: ResolvedRoofProject;
  skeleton: RoofSkeleton;
  roofPackage: RoofFabricationPackage;
}): MemberInstanceContext[] {
  const contexts: MemberInstanceContext[] = [];
  for (const family of args.roofPackage.families) {
    const prototype = args.resolved.memberPrototypes.find(
      (candidate) => candidate.id === family.prototypeId,
    );
    if (!prototype) continue;
    const members = orderedMembers(
      family.code,
      args.skeleton.members.filter((member) =>
        prototype.instanceIds.includes(member.id),
      ),
      args.resolved,
    );
    members.forEach((member, index) => {
      const jack = jackFor(args.resolved, member.id);
      const lengthMm = instanceLength(family.code, member, args.resolved);
      const lengthGroup = groupForInstance(family, member.id);
      const operations = family.operations.map((operation) =>
        operationContext(operation, member, lengthMm),
      );
      contexts.push({
        instanceId: member.id,
        prototypeId: family.prototypeId,
        familyCode: family.code,
        memberKind: family.memberType,
        instanceIndex: index + 1,
        instanceCount: members.length,
        side: member.side,
        roofPlaneId: jack?.spec.roofPlane,
        hipCorner:
          jack?.spec.hipCorner ??
          (family.code === 'H1' ? (member.side as HipCorner) : undefined),
        buildingStationMm: member.stationMm,
        lengthMm,
        lengthGroupId: lengthGroup.id,
        section: { ...family.section },
        relatedInstanceIds: lengthGroup.group.instanceIds.filter(
          (instanceId) => instanceId !== member.id,
        ),
        relatedOperationIds: operations.map(
          (operation) => operation.operationId,
        ),
        operations,
        warningKeys: [
          ...new Set([
            ...family.warningKeys,
            ...operations.flatMap((operation) => operation.warningKeys),
          ]),
        ],
      });
    });
  }
  return contexts;
}

export function memberInstancesForFamily(
  contexts: readonly MemberInstanceContext[],
  family: MemberFamilyCode | string,
) {
  return contexts.filter(
    (context) =>
      context.familyCode === family || context.prototypeId === family,
  );
}

export function currentMemberInstance(
  contexts: readonly MemberInstanceContext[],
  instanceId?: string,
) {
  return instanceId
    ? contexts.find((context) => context.instanceId === instanceId)
    : undefined;
}

export function adjacentMemberInstance(
  contexts: readonly MemberInstanceContext[],
  instanceId: string,
  direction: -1 | 1,
) {
  const current = currentMemberInstance(contexts, instanceId);
  if (!current) return undefined;
  const family = memberInstancesForFamily(contexts, current.prototypeId);
  const index = family.findIndex(
    (context) => context.instanceId === instanceId,
  );
  return family[(index + direction + family.length) % family.length];
}

export function memberInstanceFabrication(
  context: MemberInstanceContext,
  roofPackage: RoofFabricationPackage,
): MemberInstanceFabricationContext | undefined {
  const family = roofPackage.families.find(
    (candidate) => candidate.prototypeId === context.prototypeId,
  );
  if (!family) return undefined;
  const lengthGroup = family.lengthGroups.find((group) =>
    group.instanceIds.includes(context.instanceId),
  );
  if (!lengthGroup) return undefined;
  return { family, lengthGroup, operations: family.operations };
}

export function operationForMemberInstance(
  context: MemberInstanceContext,
  operationId: string,
) {
  return context.operations.find(
    (operation) => operation.operationId === operationId,
  );
}
