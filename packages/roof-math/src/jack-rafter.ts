import { z } from 'zod';
import type {
  JackRafterFabricationStep,
  JackRafterSpec,
  ResolvedJackRafter,
} from '@cieslacalc/timber-model';

const sectionSchema = z.object({
  widthMm: z.number().finite().min(1).max(1000),
  depthMm: z.number().finite().min(1).max(2000),
});

export const jackRafterSchema: z.ZodType<JackRafterSpec> = z
  .object({
    id: z.string().regex(/^instance:jack:[a-z0-9:-]+$/),
    prototypeId: z.string().regex(/^member:jack-rafter-[A-Z][0-9]+$/),
    section: sectionSchema,
    roofPlane: z.enum(['left', 'right', 'front', 'rear']),
    hipCorner: z.enum(['front-left', 'front-right', 'rear-left', 'rear-right']),
    hipRafterInstanceId: z.string().regex(/^instance:hip:[a-z-]+$/),
    ordinalFromCorner: z.number().int().min(1),
    stationFromHipCornerMm: z.number().finite().gt(0).max(100000),
    commonRunMm: z.number().finite().gt(0).max(100000),
    pitchDeg: z.number().finite().min(1).max(80),
    overhangMm: z.number().finite().min(0).max(10000),
    wallJoint: z
      .object({
        supportId: z.string().min(1),
        stationFromOuterEaveMm: z.number().finite().min(0),
        seatLengthMm: z.number().finite().gt(0),
        normalDepthMm: z.number().finite().gt(0),
        remainingDepthMm: z.number().finite().gt(0),
      })
      .optional(),
    hasIntermediateSupports: z.boolean(),
    hipConnection: z
      .enum(['theoretical-centre-plane', 'hip-face-butt'])
      .optional(),
    hipSectionWidthMm: z.number().finite().min(1).max(1000).optional(),
  })
  .superRefine((spec, ctx) => {
    if (spec.stationFromHipCornerMm >= spec.commonRunMm)
      ctx.addIssue({
        code: 'custom',
        path: ['stationFromHipCornerMm'],
        message: 'jack_station_must_be_between_hip_and_common',
      });
    // A physical termination needs the physical face it terminates against.
    if (spec.hipConnection === 'hip-face-butt' && !spec.hipSectionWidthMm)
      ctx.addIssue({
        code: 'custom',
        path: ['hipSectionWidthMm'],
        message: 'hip_section_width_required_for_hip_face_butt',
      });
  });

/**
 * Resolves a regular equal-pitch jack parallel to K1.
 *
 * The reference length always ends at the theoretical vertical plane through
 * the H1 centre axis and is never overwritten. When the project explicitly
 * selects `hip-face-butt`, V39 additionally resolves the finished end against
 * the hip's near vertical side face; both results are returned side by side.
 */
export function calculateJackRafter(raw: JackRafterSpec): ResolvedJackRafter {
  const spec = jackRafterSchema.parse(raw);
  const pitchRad = (spec.pitchDeg * Math.PI) / 180;
  const wallRun = spec.stationFromHipCornerMm;
  const totalRun = wallRun + spec.overhangMm;
  const wallLine = wallRun / Math.cos(pitchRad);
  const tailLine = spec.overhangMm / Math.cos(pitchRad);
  const referenceLength = totalRun / Math.cos(pitchRad);
  const plumb = 90 - spec.pitchDeg;
  // Trace of the vertical 45° hip-center plane on the sloping jack top face.
  const topFace = (Math.atan(Math.cos(pitchRad)) * 180) / Math.PI;
  // V39 finished end. The jack approaches the hip at 45 degrees in plan, so
  // reaching the near side face from the centre plane costs
  // (w / 2) / cos 45 = w / sqrt(2) horizontally — the same form as the H1
  // ridge deduction, for the same reason. Backing and drop cut the hip's top
  // only and never move this face.
  const finished =
    spec.hipConnection === 'hip-face-butt' && spec.hipSectionWidthMm
      ? (() => {
          const hipFacePlanDeductionMm = spec.hipSectionWidthMm! / Math.SQRT2;
          const hipFaceAxisDeductionMm =
            hipFacePlanDeductionMm / Math.cos(pitchRad);
          return {
            connection: 'hip-face-butt' as const,
            cutPlane: 'hip-near-vertical-side-face' as const,
            hipFacePlanDeductionMm,
            hipFaceAxisDeductionMm,
            finishedLengthMm: referenceLength - hipFaceAxisDeductionMm,
            hipWidthMm: spec.hipSectionWidthMm!,
            allowance: 'not-included' as const,
          };
        })()
      : undefined;
  const steps: JackRafterFabricationStep[] = [
    {
      action: 'measure-to-hip-center-plane',
      distanceMm: referenceLength,
      reference: 'outer-eave-axis',
    },
    ...(spec.wallJoint
      ? [{ action: 'mark-wall-seat' as const, joint: spec.wallJoint }]
      : []),
    {
      action: 'mark-hip-plumb',
      angleDeg: plumb,
      reference: 'member-axis-on-side-face',
    },
    {
      action: 'mark-hip-top-face-line',
      angleDeg: topFace,
      reference: 'member-axis-on-top-face',
    },
    ...(finished
      ? [
          {
            action: 'deduct-hip-side-face' as const,
            deductionMm: finished.hipFaceAxisDeductionMm,
            finishedLengthMm: finished.finishedLengthMm,
            reference: 'hip-near-vertical-side-face' as const,
          },
        ]
      : []),
  ];
  return {
    spec,
    result: {
      wallToHipCenterHorizontalRunMm: wallRun,
      outerEaveToHipCenterHorizontalRunMm: totalRun,
      wallToHipCenterLineLengthMm: wallLine,
      tailLineLengthMm: tailLine,
      outerEaveToHipCenterLineLengthMm: referenceLength,
      riseFromOuterEaveMm: totalRun * Math.tan(pitchRad),
      roofSlopeDeg: spec.pitchDeg,
      plumbLineToMemberAxisDeg: plumb,
      planCutLineToMemberAxisDeg: 45,
      topFaceCutLineToMemberAxisDeg: topFace,
    },
    fabrication: {
      memberId: spec.id,
      prototypeId: spec.prototypeId,
      section: spec.section,
      lengthBasis: 'outer-eave-axis-to-theoretical-hip-center-plane',
      referenceLengthMm: referenceLength,
      meetingCut: {
        kind: 'jack-to-hip-center-plane',
        id: `cut:${spec.id}:hip`,
        memberId: spec.id,
        hipRafterInstanceId: spec.hipRafterInstanceId,
        referencePlane: 'vertical-hip-center-plane',
        plumbLineToMemberAxisDeg: plumb,
        planCutLineToMemberAxisDeg: 45,
        topFaceCutLineToMemberAxisDeg: topFace,
        hipFaceDeduction: finished ? 'applied-to-hip-side-face' : 'not-applied',
        ...(finished ? { finished } : {}),
      },
      wallJoint: spec.wallJoint,
      intermediateSupportJoinery: spec.hasIntermediateSupports
        ? 'not-resolved'
        : 'resolved-none',
      allowanceAndKerf: 'not-included',
      steps,
      executionStatus: finished ? 'fabrication-resolved' : 'reference-only',
      ...(finished
        ? { finishedLengthMm: finished.finishedLengthMm }
        : { unresolvedReason: 'hip-connection-not-selected' as const }),
    },
  };
}
