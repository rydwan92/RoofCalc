import { describe, expect, it } from 'vitest';
import {
  assemblyDefaults,
  convertRoofTemplate,
  createRoofSkeleton,
  gableTemplateFromAssembly,
  resolveRoofTemplate,
} from '@cieslacalc/roof-math';
import { createRoofFabricationPackage } from './fabrication-package';
import {
  adjacentMemberInstance,
  createMemberInstanceContexts,
  memberInstanceFabrication,
  memberInstancesForFamily,
  operationForMemberInstance,
} from './member-instance';

function contextsFor(type: 'gable' | 'hip') {
  const gable = gableTemplateFromAssembly(assemblyDefaults);
  const template = type === 'hip' ? convertRoofTemplate(gable, 'hip') : gable;
  const resolved = resolveRoofTemplate(template);
  const roofPackage = createRoofFabricationPackage(resolved);
  return {
    contexts: createMemberInstanceContexts({
      resolved,
      skeleton: createRoofSkeleton(template),
      roofPackage,
    }),
    roofPackage,
  };
}

describe('member instance projection', () => {
  it('maps every gable K1 placement to one shared fabrication package', () => {
    const { contexts, roofPackage } = contextsFor('gable');
    const k1 = memberInstancesForFamily(contexts, 'K1');
    expect(k1).toHaveLength(22);
    expect(new Set(k1.map((item) => item.prototypeId))).toEqual(
      new Set(['member:rafter-1']),
    );
    expect(new Set(k1.map((item) => item.lengthGroupId))).toEqual(
      new Set(['length-group:K1:1']),
    );
    expect(k1.slice(0, 2).map((item) => item.side)).toEqual(['left', 'right']);
    expect(k1[0]?.buildingStationMm).toBe(k1[1]?.buildingStationMm);
    expect(k1[0]?.instanceId).not.toBe(k1[1]?.instanceId);
    expect(k1[0]?.operations.map((operation) => operation.code)).toEqual([
      'Z1',
      'K1',
    ]);
    expect(memberInstanceFabrication(k1[0]!, roofPackage)?.family.code).toBe(
      'K1',
    );
  });

  it('keeps all four H1 physical identities in spatial order', () => {
    const { contexts } = contextsFor('hip');
    const h1 = memberInstancesForFamily(contexts, 'H1');
    expect(h1.map((item) => item.instanceId)).toEqual([
      'instance:hip:front-left',
      'instance:hip:front-right',
      'instance:hip:rear-left',
      'instance:hip:rear-right',
    ]);
    expect(h1.map((item) => item.instanceIndex)).toEqual([1, 2, 3, 4]);
    expect(h1.every((item) => item.instanceCount === 4)).toBe(true);
    expect(h1.every((item) => item.relatedInstanceIds.length === 3)).toBe(true);
  });

  it('assigns each J1 to its exact deterministic length group', () => {
    const { contexts, roofPackage } = contextsFor('hip');
    const j1 = memberInstancesForFamily(contexts, 'J1');
    const j1Package = roofPackage.families.find(
      (family) => family.code === 'J1',
    )!;
    expect(j1).toHaveLength(32);
    for (const instance of j1) {
      const group = j1Package.lengthGroups.find((candidate) =>
        candidate.instanceIds.includes(instance.instanceId),
      );
      expect(group?.lengthMm).toBe(instance.lengthMm);
      expect(instance.relatedInstanceIds).toHaveLength(7);
    }
    expect(j1[0]?.instanceId).toBe('instance:jack:front-left:left:1');
    expect(j1.at(-1)?.instanceId).toBe('instance:jack:rear-right:rear:4');
  });

  it('navigates deterministically and wraps inside one family', () => {
    const { contexts } = contextsFor('hip');
    const h1 = memberInstancesForFamily(contexts, 'H1');
    expect(
      adjacentMemberInstance(contexts, h1[1]!.instanceId, -1)?.instanceId,
    ).toBe(h1[0]!.instanceId);
    expect(
      adjacentMemberInstance(contexts, h1[1]!.instanceId, 1)?.instanceId,
    ).toBe(h1[2]!.instanceId);
    expect(
      adjacentMemberInstance(contexts, h1[0]!.instanceId, -1)?.instanceId,
    ).toBe(h1.at(-1)!.instanceId);
  });

  it('anchors operations on the canonical member axis without cut math', () => {
    const { contexts } = contextsFor('gable');
    const instance = memberInstancesForFamily(contexts, 'K1')[0]!;
    const seat = operationForMemberInstance(
      instance,
      instance.relatedOperationIds[0]!,
    )!;
    const ridge = instance.operations.at(-1)!;
    expect(seat.stationMm).toBeGreaterThan(0);
    expect(seat.stationRatio).toBeGreaterThan(0);
    expect(seat.stationRatio).toBeLessThan(ridge.stationRatio);
    expect(ridge.detailPreviewId).toContain('preview:');
    expect(Number.isFinite(seat.worldPoint.x)).toBe(true);
  });

  it('keeps the limited J1 meeting operation honest when no preview exists', () => {
    const { contexts } = contextsFor('hip');
    const instance = memberInstancesForFamily(contexts, 'J1')[0]!;
    const meeting = instance.operations.find(
      (operation) => operation.status === 'limited',
    )!;
    expect(meeting.detailPreviewId).toBeUndefined();
    expect(meeting.stationMm).toBe(instance.lengthMm);
    expect(instance.warningKeys).toContain('hipFaceDeductionNote');
  });
});
