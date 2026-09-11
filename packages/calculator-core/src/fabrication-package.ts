import type {
  DetailFabricationStep,
  DetailKeyDimension,
  DetailPreviewModel,
} from '@cieslacalc/drawing-engine';
import type {
  JackRafterFabricationStep,
  ResolvedMemberPrototype,
  TimberSection,
} from '@cieslacalc/timber-model';
import {
  resolveRoofTemplate,
  type OpeningFramingResult,
} from '@cieslacalc/roof-math';
import {
  createAssemblyDetailPreviews,
  createHipRafterDetailPreview,
} from './detail-preview';

export type ResolvedRoofProject = ReturnType<typeof resolveRoofTemplate>;
export type FabricationOperationType =
  'seat-notch' | 'ridge-cut' | 'hip-cut' | 'jack-cut';

export interface FabricationOperationSummary {
  id: string;
  code: string;
  labelKey: string;
  memberPrototypeId: string;
  memberInstanceId?: string;
  type: FabricationOperationType;
  relatedSupportId?: string;
  stationMm?: number;
  dimensions: DetailKeyDimension[];
  markingSteps: (DetailFabricationStep | JackRafterFabricationStep)[];
  detailPreview?: DetailPreviewModel;
  warningKeys: string[];
  status: 'resolved' | 'limited';
}

export interface FabricationLengthGroup {
  lengthMm: number;
  quantity: number;
  instanceIds: string[];
}

export interface MemberFabricationPackage {
  prototypeId: string;
  code: ResolvedMemberPrototype['code'];
  memberType: ResolvedMemberPrototype['kind'];
  section: TimberSection;
  quantity: number;
  lengthGroups: FabricationLengthGroup[];
  operations: FabricationOperationSummary[];
  warningKeys: string[];
}

export interface RoofFabricationPackage {
  roofType: 'gable' | 'hip';
  families: MemberFabricationPackage[];
  openingFraming: OpeningFramingFabricationItem[];
  warningKeys: string[];
}

export interface OpeningFramingFabricationItem {
  id: string;
  featureId: string;
  section: TimberSection;
  members: Array<{
    id: string;
    role: 'upper-header' | 'lower-header';
    lengthMm: number;
    quantity: 1;
  }>;
  operationStatus: 'limited';
  warningKeys: string[];
}

function groupLengths(
  entries: { instanceId: string; lengthMm: number }[],
): FabricationLengthGroup[] {
  const groups: FabricationLengthGroup[] = [];
  for (const entry of [...entries].sort(
    (a, b) =>
      a.lengthMm - b.lengthMm || a.instanceId.localeCompare(b.instanceId),
  )) {
    const group = groups.find(
      (candidate) => Math.abs(candidate.lengthMm - entry.lengthMm) < 1e-7,
    );
    if (group) {
      group.quantity += 1;
      group.instanceIds.push(entry.instanceId);
    } else {
      groups.push({
        lengthMm: entry.lengthMm,
        quantity: 1,
        instanceIds: [entry.instanceId],
      });
    }
  }
  return groups;
}

function sharedLengthGroups(
  prototype: ResolvedMemberPrototype,
): FabricationLengthGroup[] {
  return [
    {
      lengthMm: prototype.lengthRangeMm.max,
      quantity: prototype.count,
      instanceIds: [...prototype.instanceIds].sort(),
    },
  ];
}

function operationFromPreview(
  preview: DetailPreviewModel,
  prototypeId: string,
  code: string,
  labelKey: string,
): FabricationOperationSummary {
  const station = preview.keyDimensions.find(
    (dimension) => dimension.labelKey === 'position',
  )?.value;
  return {
    id: preview.sourceSelectionId,
    code,
    labelKey,
    memberPrototypeId: prototypeId,
    type:
      preview.type === 'birdsmouth-detail'
        ? 'seat-notch'
        : preview.type === 'ridge-cut-detail'
          ? 'ridge-cut'
          : 'hip-cut',
    relatedSupportId: preview.relatedSupportId,
    stationMm: station,
    dimensions: preview.keyDimensions,
    markingSteps: preview.fabricationSteps,
    detailPreview: preview,
    warningKeys: preview.warningKeys,
    status: preview.warningKeys.length ? 'limited' : 'resolved',
  };
}

/** Pure project-level fabrication projection. It does not recalculate cut geometry. */
export function createRoofFabricationPackage(
  resolved: ResolvedRoofProject,
): RoofFabricationPackage {
  const k1Prototype = resolved.memberPrototypes.find(
    (prototype) => prototype.code === 'K1',
  )!;
  const commonPreviews = createAssemblyDetailPreviews(resolved.calculation);
  let notchIndex = 0;
  const k1Operations = commonPreviews.map((preview) => {
    const notch = preview.type === 'birdsmouth-detail';
    if (notch) notchIndex += 1;
    return operationFromPreview(
      preview,
      k1Prototype.id,
      notch ? `Z${notchIndex}` : 'K1',
      notch
        ? preview.relatedSupportId === resolved.template.wallPlate.id
          ? 'wall-plate'
          : 'purlin'
        : 'ridgeCutDetail',
    );
  });
  const families: MemberFabricationPackage[] = [
    {
      prototypeId: k1Prototype.id,
      code: 'K1',
      memberType: 'common-rafter',
      section: k1Prototype.section,
      quantity: k1Prototype.count,
      lengthGroups: sharedLengthGroups(k1Prototype),
      operations: k1Operations,
      warningKeys: [],
    },
  ];

  if ('hipRafter' in resolved) {
    const h1Prototype = resolved.memberPrototypes.find(
      (prototype) => prototype.code === 'H1',
    )!;
    const h1Preview = createHipRafterDetailPreview(resolved.hipRafter);
    families.push({
      prototypeId: h1Prototype.id,
      code: 'H1',
      memberType: 'hip-rafter',
      section: h1Prototype.section,
      quantity: h1Prototype.count,
      lengthGroups: sharedLengthGroups(h1Prototype),
      operations: [
        operationFromPreview(
          h1Preview,
          h1Prototype.id,
          'H1',
          'hipUpperCutDetail',
        ),
      ],
      warningKeys: ['hipBackOrDropWarning'],
    });

    const j1Prototype = resolved.memberPrototypes.find(
      (prototype) => prototype.code === 'J1',
    )!;
    const representative = [...resolved.jackRafters].sort(
      (a, b) =>
        b.result.outerEaveToHipCenterLineLengthMm -
          a.result.outerEaveToHipCenterLineLengthMm ||
        a.spec.id.localeCompare(b.spec.id),
    )[0];
    const j1Warnings = [
      'hipFaceDeductionNote',
      ...(representative?.fabrication.intermediateSupportJoinery ===
      'not-resolved'
        ? ['jackPurlinLimit']
        : []),
    ];
    const j1Operations: FabricationOperationSummary[] = representative
      ? [
          ...(representative.spec.wallJoint
            ? [
                {
                  id: 'operation:J1:wall-seat',
                  code: 'Z1',
                  labelKey: 'wall-plate',
                  memberPrototypeId: j1Prototype.id,
                  type: 'seat-notch' as const,
                  relatedSupportId: representative.spec.wallJoint.supportId,
                  stationMm:
                    representative.spec.wallJoint.stationFromOuterEaveMm,
                  dimensions: [
                    {
                      id: 'operation:J1:wall-seat:seat',
                      labelKey: 'seat',
                      value: representative.spec.wallJoint.seatLengthMm,
                      unit: 'length' as const,
                    },
                    {
                      id: 'operation:J1:wall-seat:depth',
                      labelKey: 'notchDepth',
                      value: representative.spec.wallJoint.normalDepthMm,
                      unit: 'length' as const,
                    },
                  ],
                  markingSteps: representative.fabrication.steps.filter(
                    (step) => step.action === 'mark-wall-seat',
                  ),
                  warningKeys: [],
                  status: 'resolved' as const,
                },
              ]
            : []),
          {
            id: 'operation:J1:hip-meeting',
            code: 'J1',
            labelKey: 'jackHipMeeting',
            memberPrototypeId: j1Prototype.id,
            type: 'jack-cut',
            dimensions: [
              {
                id: 'operation:J1:plumb',
                labelKey: 'jackPlumb',
                value: representative.result.plumbLineToMemberAxisDeg,
                unit: 'angle',
              },
              {
                id: 'operation:J1:top-face',
                labelKey: 'jackTopFace',
                value: representative.result.topFaceCutLineToMemberAxisDeg,
                unit: 'angle',
              },
            ],
            markingSteps: representative.fabrication.steps.filter(
              (step) =>
                step.action === 'mark-hip-plumb' ||
                step.action === 'mark-hip-top-face-line',
            ),
            warningKeys: j1Warnings,
            status: 'limited',
          },
        ]
      : [];
    families.push({
      prototypeId: j1Prototype.id,
      code: 'J1',
      memberType: 'jack-rafter',
      section: j1Prototype.section,
      quantity: j1Prototype.count,
      lengthGroups: groupLengths(
        resolved.jackRafters.map((jack) => ({
          instanceId: jack.spec.id,
          lengthMm: jack.result.outerEaveToHipCenterLineLengthMm,
        })),
      ),
      operations: j1Operations,
      warningKeys: j1Warnings,
    });
  }

  const warningKeys = [
    ...new Set(families.flatMap((family) => family.warningKeys)),
  ];
  return {
    roofType: resolved.template.type,
    families,
    openingFraming: [],
    warningKeys,
  };
}

/** Adds only genuinely resolved header lengths; end joinery stays explicitly limited. */
export function withOpeningFramingFabrication(
  roofPackage: RoofFabricationPackage,
  results: OpeningFramingResult[],
): RoofFabricationPackage {
  const openingFraming = results
    .filter(
      (result) =>
        result.status === 'resolved' &&
        result.reviewStatus === 'valid' &&
        !!result.framingSpecId &&
        !!result.upperFramingMember &&
        !!result.lowerFramingMember,
    )
    .map((result) => ({
      id: result.framingSpecId!,
      featureId: result.featureId,
      section: result.upperFramingMember!.member.section,
      members: [result.lowerFramingMember!, result.upperFramingMember!].map(
        (member) => ({
          id: member.id,
          role: member.role,
          lengthMm: member.lengthMm,
          quantity: 1 as const,
        }),
      ),
      operationStatus: 'limited' as const,
      warningKeys: ['openingFramingJoineryUnresolved'],
    }));
  return {
    ...roofPackage,
    openingFraming,
    warningKeys: [
      ...new Set([
        ...roofPackage.warningKeys,
        ...openingFraming.flatMap((item) => item.warningKeys),
      ]),
    ],
  };
}

export function detailPreviewsFromFabricationPackage(
  roofPackage: RoofFabricationPackage,
): DetailPreviewModel[] {
  return roofPackage.families.flatMap((family) =>
    family.operations.flatMap((operation) =>
      operation.detailPreview ? [operation.detailPreview] : [],
    ),
  );
}
