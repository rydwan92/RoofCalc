import { z } from 'zod';
import { triangleInputSchema } from '../geometry/triangle';

const ridgeCutInputSchema = triangleInputSchema
  .extend({
    thicknessMm: z.number().finite().min(0).max(1000),
    depthMm: z.number().finite().positive().max(2000),
  })
  .refine((input) => input.thicknessMm / 2 < input.runMm, {
    path: ['thicknessMm'],
    message: 'ridge_outside_run',
  });
export type RidgeCutInput = z.infer<typeof ridgeCutInputSchema>;
export function calculateRidgeCut(input: RidgeCutInput) {
  const valid = ridgeCutInputSchema.parse(input);
  const theta = (valid.pitchDeg * Math.PI) / 180;
  return {
    axisXmm: valid.runMm,
    nearFaceXmm: valid.runMm - valid.thicknessMm / 2,
    horizontalDeductionMm: valid.thicknessMm / 2,
    alongMemberDeductionMm: valid.thicknessMm / (2 * Math.cos(theta)),
    angleToMemberDeg: 90 - valid.pitchDeg,
    topBottomStationOffsetMm: valid.depthMm * Math.tan(theta),
    cutLengthMm: valid.depthMm / Math.cos(theta),
  };
}
export type RidgeCutResult = ReturnType<typeof calculateRidgeCut>;
