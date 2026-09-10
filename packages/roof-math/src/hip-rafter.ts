import { z } from 'zod';
import type {
  HipRafterSpec,
  ResolvedHipRafter,
} from '@cieslacalc/timber-model';

const positiveMm = z.number().finite().min(1).max(100000);
const sectionSchema = z.object({
  widthMm: z.number().finite().min(1).max(1000),
  depthMm: z.number().finite().min(1).max(2000),
});

export const hipRafterSpecSchema: z.ZodType<HipRafterSpec> = z
  .object({
    id: z.string().regex(/^member:[A-Za-z][A-Za-z0-9:-]*$/),
    section: sectionSchema,
    commonRunMm: positiveMm,
    pitchDeg: z.number().finite().min(1).max(80),
    overhangMm: z.number().finite().min(0).max(10000),
    ridgeThicknessMm: z.number().finite().min(0).max(1000),
  })
  .superRefine((spec, ctx) => {
    // At 45 degrees in plan, t / sqrt(2) must remain shorter than r * sqrt(2).
    if (spec.ridgeThicknessMm >= 2 * spec.commonRunMm)
      ctx.addIssue({
        code: 'custom',
        path: ['ridgeThicknessMm'],
        message: 'ridge_consumes_hip_run',
      });
  });

const toDegrees = (radians: number) => (radians * 180) / Math.PI;

/** Exact regular equal-pitch hip geometry. All calculations retain full precision. */
export function calculateHipRafter(raw: HipRafterSpec): ResolvedHipRafter {
  const spec = hipRafterSpecSchema.parse(raw);
  const pitchRadians = (spec.pitchDeg * Math.PI) / 180;
  const pitchRatio = Math.tan(pitchRadians);
  const lineFactor = Math.sqrt(2 + pitchRatio * pitchRatio);
  const commonRiseMm = spec.commonRunMm * pitchRatio;
  const planRunMm = spec.commonRunMm * Math.SQRT2;
  const tailPlanRunMm = spec.overhangMm * Math.SQRT2;
  const theoreticalLineLengthMm = spec.commonRunMm * lineFactor;
  const tailLineLengthMm = spec.overhangMm * lineFactor;
  const totalTheoreticalLineLengthMm =
    theoreticalLineLengthMm + tailLineLengthMm;
  const hipSlopeRadians = Math.atan(pitchRatio / Math.SQRT2);
  const hipSlopeDeg = toDegrees(hipSlopeRadians);
  const ridgePlanDeductionMm = spec.ridgeThicknessMm / Math.SQRT2;
  const ridgeAxisDeductionMm = ridgePlanDeductionMm / Math.cos(hipSlopeRadians);
  const lineLengthToRidgeFaceMm =
    theoreticalLineLengthMm - ridgeAxisDeductionMm;
  const outerEaveToRidgeFaceMm =
    totalTheoreticalLineLengthMm - ridgeAxisDeductionMm;
  const cheekAngleDeg = toDegrees(Math.atan(Math.SQRT2 / lineFactor));
  const backingAngleDeg = toDegrees(Math.atan(pitchRatio / lineFactor));
  const result = {
    commonRiseMm,
    planRunMm,
    tailPlanRunMm,
    theoreticalLineLengthMm,
    tailLineLengthMm,
    totalTheoreticalLineLengthMm,
    ridgePlanDeductionMm,
    ridgeAxisDeductionMm,
    lineLengthToRidgeFaceMm,
    outerEaveToRidgeFaceMm,
    hipSlopeDeg,
    plumbToMemberDeg: 90 - hipSlopeDeg,
    seatToMemberDeg: hipSlopeDeg,
    cheekAngleDeg,
    backingAngleDeg,
  };
  return {
    spec,
    result,
    fabrication: {
      memberId: spec.id,
      section: spec.section,
      referenceDatum: 'outer-eave',
      theoreticalRidgeCenterStationMm: totalTheoreticalLineLengthMm,
      ridgeFaceStationMm: outerEaveToRidgeFaceMm,
      ridgeCut: {
        kind: 'compound-end-cut',
        id: 'cut:hip-ridge-H1',
        memberId: spec.id,
        end: 'ridge',
        plumbToMemberDeg: 90 - hipSlopeDeg,
        cheekAngleDeg,
        doubleCheek: true,
        referenceStationMm: outerEaveToRidgeFaceMm,
        reference: 'outer-eave-to-ridge-face',
        ridgePlanDeductionMm,
        ridgeAxisDeductionMm,
      },
      backing: {
        kind: 'hip-backing',
        id: 'detail:hip-backing-H1',
        memberId: spec.id,
        angleDeg: backingAngleDeg,
        reference: 'top-arris-to-roof-plane',
        fabricationChoice: 'back-or-drop-not-decided',
      },
    },
  };
}
