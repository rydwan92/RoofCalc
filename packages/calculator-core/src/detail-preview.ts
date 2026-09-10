import type {
  DetailFabricationStep,
  DetailPreviewModel,
  DrawingModel,
} from '@cieslacalc/drawing-engine';
import { datumDisplayLabel } from '@cieslacalc/drawing-engine';
import type {
  FabricationPlan,
  FabricationStep,
  ResolvedAssembly,
  ResolvedHipRafter,
} from '@cieslacalc/timber-model';
import { createAssemblyDrawing } from './assembly';

function instruction(
  step: FabricationStep,
  index: number,
  labels: Map<string, string>,
): DetailFabricationStep {
  if (step.action === 'check-depth')
    return {
      id: `${step.operationId}:step-${index + 1}`,
      action: step.action,
      operationId: step.operationId,
      normalDepthMm: step.normalDepthMm,
      remainingDepthMm: step.remainingDepthMm,
    };
  return {
    id: `${step.operationId}:step-${index + 1}`,
    action: step.action,
    operationId: step.operationId,
    fromLabel: labels.get(step.from),
    targetLabel: labels.get(step.target),
    edge: step.edge,
    distanceMm: step.distanceMm,
    angleDeg: step.angleDeg,
    seatLengthMm: step.seatLengthMm,
  };
}

/** Builds K1 cut previews from the exact resolved assembly and fabrication plan. */
export function createAssemblyDetailPreviews(input: {
  assembly: ResolvedAssembly;
  plan: FabricationPlan;
}): DetailPreviewModel[] {
  const labels = new Map(
    input.plan.datums.map((datum, index) => [
      datum.id,
      datumDisplayLabel(index),
    ]),
  );
  const stepsFor = (operationId: string) =>
    input.plan.steps
      .filter((step) => step.operationId === operationId)
      .map((step, index) => instruction(step, index, labels));
  const joints: DetailPreviewModel[] = input.assembly.joints.map((joint) => ({
    id: `preview:${joint.id}`,
    sourceSelectionId: joint.id,
    type: 'birdsmouth-detail',
    titleKey: 'birdsmouthDetail',
    subjectMemberId: input.assembly.member.id,
    subjectCode: 'K1',
    relatedSupportId: joint.supportId,
    localFrame: 'member-elevation',
    drawing: createAssemblyDrawing(input.assembly, joint.id),
    keyDimensions: [
      {
        id: `${joint.id}:seat`,
        labelKey: 'seat',
        value: joint.seatLengthMm,
        unit: 'length',
        referenceKey: 'seatReference',
      },
      {
        id: `${joint.id}:depth`,
        labelKey: 'notchDepth',
        value: joint.normalDepthMm,
        unit: 'length',
        referenceKey: 'normalDepthReference',
      },
      {
        id: `${joint.id}:remaining`,
        labelKey: 'remaining',
        value: joint.remainingDepthMm,
        unit: 'length',
      },
      {
        id: `${joint.id}:station`,
        labelKey: 'position',
        value: joint.stationMm,
        unit: 'length',
        referenceKey: 'topEdgeReference',
      },
    ],
    fabricationSteps: stepsFor(joint.id),
    warningKeys: [],
  }));
  const ridgeCuts: DetailPreviewModel[] = input.assembly.endCuts
    .filter((cut) => cut.end === 'ridge')
    .map((cut) => ({
      id: `preview:${cut.id}`,
      sourceSelectionId: cut.id,
      type: 'ridge-cut-detail',
      titleKey: 'ridgeCutDetail',
      subjectMemberId: input.assembly.member.id,
      subjectCode: 'K1',
      relatedSupportId: cut.supportId,
      localFrame: 'member-elevation',
      drawing: createAssemblyDrawing(input.assembly, cut.id),
      keyDimensions: [
        {
          id: `${cut.id}:angle`,
          labelKey: 'cutAngle',
          value: cut.angleToMemberDeg,
          unit: 'angle',
          referenceKey: 'memberAxisReference',
        },
        {
          id: `${cut.id}:station`,
          labelKey: 'position',
          value: cut.stationMm,
          unit: 'length',
          referenceKey: 'topEdgeReference',
        },
      ],
      fabricationSteps: stepsFor(cut.id),
      warningKeys: [],
    }));
  return [...joints, ...ridgeCuts];
}

/** Builds the H1 top-face close-up from the resolved compound-cut object. */
export function createHipRafterDetailPreview(
  hip: ResolvedHipRafter,
): DetailPreviewModel {
  const cut = hip.fabrication.ridgeCut;
  const halfWidth = hip.spec.section.widthMm / 2;
  const previewLength = Math.max(
    hip.spec.section.widthMm * 3,
    hip.spec.section.depthMm * 1.8,
  );
  const pointX = previewLength * 0.62;
  const cheekRun = halfWidth / Math.tan((cut.cheekAngleDeg * Math.PI) / 180);
  const edgeX = pointX - cheekRun;
  const drawing: DrawingModel = {
    bounds: {
      minX: 0,
      minY: -halfWidth,
      maxX: previewLength,
      maxY: halfWidth,
    },
    polygons: [
      {
        id: hip.spec.id,
        role: 'member',
        selectionId: hip.spec.id,
        points: [
          { x: 0, y: -halfWidth },
          { x: previewLength, y: -halfWidth },
          { x: previewLength, y: halfWidth },
          { x: 0, y: halfWidth },
        ],
      },
      {
        id: `${cut.id}:removed`,
        role: 'removed',
        selectionId: cut.id,
        points: [
          { x: pointX, y: 0 },
          { x: edgeX, y: halfWidth },
          { x: previewLength, y: halfWidth },
          { x: previewLength, y: -halfWidth },
          { x: edgeX, y: -halfWidth },
        ],
      },
    ],
    lines: [
      {
        id: `${cut.id}:cheek-a`,
        from: { x: pointX, y: 0 },
        to: { x: edgeX, y: halfWidth },
        role: 'cut',
        selectionId: cut.id,
      },
      {
        id: `${cut.id}:cheek-b`,
        from: { x: pointX, y: 0 },
        to: { x: edgeX, y: -halfWidth },
        role: 'cut',
        selectionId: cut.id,
      },
      {
        id: `${cut.id}:axis`,
        from: { x: 0, y: 0 },
        to: { x: previewLength, y: 0 },
        role: 'axis',
      },
    ],
    dimensions: [
      {
        id: `${cut.id}:width`,
        from: { x: previewLength * 0.18, y: -halfWidth },
        to: { x: previewLength * 0.18, y: halfWidth },
        valueMm: hip.spec.section.widthMm,
        kind: 'vertical',
        group: 'primary',
        priority: 100,
      },
    ],
    angles: [
      {
        id: `${cut.id}:cheek-angle`,
        at: { x: pointX, y: 0 },
        degrees: cut.cheekAngleDeg,
      },
    ],
  };
  return {
    id: `preview:${cut.id}`,
    sourceSelectionId: cut.id,
    type: 'hip-cut-detail',
    titleKey: 'hipUpperCutDetail',
    subjectMemberId: hip.spec.id,
    subjectCode: 'H1',
    localFrame: 'member-top-face',
    drawing,
    keyDimensions: [
      {
        id: `${cut.id}:plumb`,
        labelKey: 'hipPlumb',
        value: cut.plumbToMemberDeg,
        unit: 'angle',
        referenceKey: 'memberSideFaceReference',
      },
      {
        id: `${cut.id}:cheek`,
        labelKey: 'hipCheek',
        value: cut.cheekAngleDeg,
        unit: 'angle',
        referenceKey: 'memberTopFaceReference',
      },
      {
        id: `${cut.id}:backing`,
        labelKey: 'hipBacking',
        value: hip.fabrication.backing.angleDeg,
        unit: 'angle',
        referenceKey: 'hipBackingReference',
      },
      {
        id: `${cut.id}:deduction`,
        labelKey: 'hipAxisDeduction',
        value: cut.ridgeAxisDeductionMm,
        unit: 'length',
        referenceKey: 'hipRidgeDeductionReference',
      },
    ],
    fabricationSteps: [
      {
        id: `${cut.id}:step-1`,
        action: 'measure-ridge-face',
        operationId: cut.id,
        distanceMm: hip.fabrication.ridgeFaceStationMm,
      },
      {
        id: `${cut.id}:step-2`,
        action: 'mark-plumb',
        operationId: cut.id,
        angleDeg: cut.plumbToMemberDeg,
      },
      {
        id: `${cut.id}:step-3`,
        action: 'mark-double-cheek',
        operationId: cut.id,
        angleDeg: cut.cheekAngleDeg,
      },
      {
        id: `${cut.id}:step-4`,
        action: 'check-backing',
        operationId: hip.fabrication.backing.id,
        angleDeg: hip.fabrication.backing.angleDeg,
      },
    ],
    warningKeys: ['hipBackOrDropWarning'],
  };
}
