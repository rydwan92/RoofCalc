import { describe, expect, it } from 'vitest';
import {
  assemblyDefaults,
  calculateAssembly,
  calculateHipRafter,
} from '@cieslacalc/roof-math';
import {
  createAssemblyDetailPreviews,
  createHipRafterDetailPreview,
} from './detail-preview';

describe('detail preview projections', () => {
  it('derives birdsmouth geometry, dimensions and steps from one resolved K1 plan', () => {
    const calculation = calculateAssembly(assemblyDefaults);
    const joint = calculation.assembly.joints[0]!;
    const preview = createAssemblyDetailPreviews(calculation).find(
      (candidate) => candidate.sourceSelectionId === joint.id,
    )!;
    expect(preview).toMatchObject({
      type: 'birdsmouth-detail',
      subjectMemberId: calculation.assembly.member.id,
      relatedSupportId: joint.supportId,
      localFrame: 'member-elevation',
    });
    expect(
      preview.keyDimensions.find((dimension) => dimension.labelKey === 'seat')
        ?.value,
    ).toBe(joint.seatLengthMm);
    expect(
      preview.keyDimensions.find(
        (dimension) => dimension.labelKey === 'notchDepth',
      )?.value,
    ).toBe(joint.normalDepthMm);
    expect(
      preview.drawing.polygons?.find((polygon) => polygon.role === 'removed')
        ?.points,
    ).toHaveLength(joint.removedProfile.length);
    expect(preview.cutStates?.before).toBe(preview.drawing);
    expect(
      preview.cutStates?.after.polygons?.some(
        (polygon) => polygon.role === 'removed',
      ),
    ).toBe(false);
    expect(preview.cutStates?.after.lines).toEqual(
      preview.cutStates?.before.lines,
    );
    expect(preview.fabricationSteps.map((step) => step.action)).toEqual(
      calculation.plan.steps
        .filter((step) => step.operationId === joint.id)
        .map((step) => step.action),
    );
  });

  it('derives the K1 ridge preview from the resolved end cut', () => {
    const calculation = calculateAssembly(assemblyDefaults);
    const cut = calculation.assembly.endCuts.find(
      (candidate) => candidate.end === 'ridge',
    )!;
    const preview = createAssemblyDetailPreviews(calculation).find(
      (candidate) => candidate.sourceSelectionId === cut.id,
    )!;
    expect(preview.type).toBe('ridge-cut-detail');
    expect(
      preview.keyDimensions.find(
        (dimension) => dimension.labelKey === 'cutAngle',
      )?.value,
    ).toBe(cut.angleToMemberDeg);
    expect(
      preview.drawing.lines.every((line) => line.selectionId === cut.id),
    ).toBe(true);
  });

  it('projects the exact resolved H1 compound cut onto its top face', () => {
    const hip = calculateHipRafter({
      id: 'member:hip-rafter-H1',
      section: { widthMm: 100, depthMm: 240 },
      commonRunMm: 4000,
      pitchDeg: 35,
      overhangMm: 500,
      ridgeThicknessMm: 40,
    });
    const preview = createHipRafterDetailPreview(hip);
    expect(preview).toMatchObject({
      sourceSelectionId: hip.fabrication.ridgeCut.id,
      type: 'hip-cut-detail',
      localFrame: 'member-top-face',
      subjectCode: 'H1',
    });
    expect(
      preview.keyDimensions.find(
        (dimension) => dimension.labelKey === 'hipCheek',
      )?.value,
    ).toBe(hip.fabrication.ridgeCut.cheekAngleDeg);
    expect(
      preview.keyDimensions.find(
        (dimension) => dimension.labelKey === 'hipAxisDeduction',
      )?.value,
    ).toBe(hip.fabrication.ridgeCut.ridgeAxisDeductionMm);
    expect(
      preview.drawing.polygons?.some((polygon) => polygon.role === 'removed'),
    ).toBe(true);
    expect(
      preview.cutStates?.after.polygons?.some(
        (polygon) => polygon.role === 'removed',
      ),
    ).toBe(false);
    expect(preview.cutStates?.before.angles).toEqual(
      preview.cutStates?.after.angles,
    );
    expect(preview.fabricationSteps.map((step) => step.action)).toEqual([
      'measure-ridge-face',
      'mark-plumb',
      'mark-double-cheek',
      'check-backing',
    ]);
  });
});
