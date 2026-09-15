import { describe, expect, it } from 'vitest';
import { createRoofMemberSchedule } from '@cieslacalc/quantity-core';
import { createCuttingPlan } from '@cieslacalc/procurement-core';
import {
  assemblyDefaults,
  convertRoofTemplate,
  createRoofSkeletonFromResolved,
  gableTemplateFromAssembly,
  resolveRoofTemplate,
} from '@cieslacalc/roof-math';
import {
  createK1CuttingRequirement,
  k1RequirementSignature,
} from './k1-cutting-adapter';

function projection(hip = false) {
  const gable = gableTemplateFromAssembly(assemblyDefaults);
  const resolved = resolveRoofTemplate(
    hip ? convertRoofTemplate(gable, 'hip') : gable,
  );
  const schedule = createRoofMemberSchedule({
    skeleton: createRoofSkeletonFromResolved(resolved),
  });
  return { resolved, schedule };
}

describe('K1 application procurement boundary', () => {
  it.each([false, true])(
    'creates distinct physical K1 pieces on hip=%s without H1/J1',
    (hip) => {
      const { resolved, schedule } = projection(hip);
      const result = createK1CuttingRequirement(resolved, schedule);
      expect(result.status).toBe('resolved');
      if (result.status !== 'resolved') return;
      expect(result.requiredPieces).toHaveLength(
        schedule.timberRows
          .filter(
            (row) => row.familyKey === 'K1' && row.memberKind === 'rafter',
          )
          .reduce((sum, row) => sum + row.quantity, 0),
      );
      expect(new Set(result.requiredPieces.map((piece) => piece.id)).size).toBe(
        result.requiredPieces.length,
      );
      expect(
        result.requiredPieces.every(
          (piece) =>
            piece.requiredBlankLengthMm ===
              result.blank.requiredBlankLengthMm &&
            piece.source?.referenceId === piece.id &&
            piece.stockClassId === result.stockClassId,
        ),
      ).toBe(true);
      expect(result.stockClassId).toBe(
        JSON.stringify([
          'timber-section',
          result.blank.section.widthMm,
          result.blank.section.depthMm,
        ]),
      );
    },
  );

  it('does not promote a geometry row when the ridge board or whole instance is absent', () => {
    const { resolved, schedule } = projection();
    const zeroRidge = structuredClone(resolved);
    zeroRidge.template.ridge.thicknessMm = 0;
    expect(createK1CuttingRequirement(zeroRidge, schedule)).toEqual({
      status: 'unresolved',
      reason: 'ridge-board-not-modeled',
    });
    const interrupted = structuredClone(schedule);
    interrupted.timberRows = interrupted.timberRows.filter(
      (row) => row.familyKey !== 'K1',
    );
    expect(createK1CuttingRequirement(resolved, interrupted)).toEqual({
      status: 'unresolved',
      reason: 'no-whole-k1-members',
    });
  });

  it('keeps different sections in incompatible opaque stock classes', () => {
    const first = projection();
    const original = createK1CuttingRequirement(first.resolved, first.schedule);
    const changedAssembly = structuredClone(assemblyDefaults);
    changedAssembly.member.section.widthMm += 20;
    const changed = resolveRoofTemplate(
      gableTemplateFromAssembly(changedAssembly),
    );
    const changedSchedule = createRoofMemberSchedule({
      skeleton: createRoofSkeletonFromResolved(changed),
    });
    const second = createK1CuttingRequirement(changed, changedSchedule);
    expect(original.status).toBe('resolved');
    expect(second.status).toBe('resolved');
    if (original.status !== 'resolved' || second.status !== 'resolved') return;
    expect(original.stockClassId).not.toBe(second.stockClassId);
    const plan = createCuttingPlan({
      requiredPieces: [original.requiredPieces[0]!],
      stockOptions: [
        {
          id: 'other-section',
          stockClassId: second.stockClassId,
          lengthMm: original.blank.requiredBlankLengthMm + 1000,
        },
      ],
      settings: { kerfMm: 0, endTrimMm: 0, minimumReusableRemnantMm: 0 },
    });
    expect(plan.unassignedPieces[0]?.reason).toBe('no-compatible-stock');
  });
});

describe('K1 ridge connection selection', () => {
  it('resolves a direct rafter meeting and never confuses it with the board case', () => {
    const boardProjection = projection();
    const boardResult = createK1CuttingRequirement(
      boardProjection.resolved,
      boardProjection.schedule,
    );
    const directAssembly = structuredClone(assemblyDefaults);
    directAssembly.ridge.connection = 'direct-meeting';
    const directResolved = resolveRoofTemplate(
      gableTemplateFromAssembly(directAssembly),
    );
    const directSchedule = createRoofMemberSchedule({
      skeleton: createRoofSkeletonFromResolved(directResolved),
    });
    const directResult = createK1CuttingRequirement(
      directResolved,
      directSchedule,
    );
    expect(boardResult.status).toBe('resolved');
    expect(directResult.status).toBe('resolved');
    if (boardResult.status !== 'resolved' || directResult.status !== 'resolved')
      return;
    expect(directResult.blank.ridgeConnection).toBe(
      'direct-opposing-rafter-plumb-meeting',
    );
    expect(boardResult.blank.ridgeConnection).toBe(
      'centered-vertical-ridge-board-near-face-butt',
    );
    expect(k1RequirementSignature(directResult)).not.toBe(
      k1RequirementSignature(boardResult),
    );
  });

  it('reports a half-lap ridge connection as not yet modeled, never as a fake blank', () => {
    const halfLapAssembly = structuredClone(assemblyDefaults);
    halfLapAssembly.ridge.connection = 'half-lap';
    const resolved = resolveRoofTemplate(
      gableTemplateFromAssembly(halfLapAssembly),
    );
    const schedule = createRoofMemberSchedule({
      skeleton: createRoofSkeletonFromResolved(resolved),
    });
    expect(createK1CuttingRequirement(resolved, schedule)).toEqual({
      status: 'unresolved',
      reason: 'ridge-connection-not-modeled',
    });
  });
});
