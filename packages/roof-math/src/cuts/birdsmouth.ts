import { z } from 'zod';
import { triangleInputSchema } from '../geometry/triangle';

export const birdsmouthInputSchema = z
  .object({
    pitchDeg: triangleInputSchema.shape.pitchDeg,
    seatLengthMm: z.number().finite().positive().max(10000),
    depthMm: z.number().finite().positive().max(2000),
  })
  .superRefine((input, ctx) => {
    if (
      input.seatLengthMm * Math.sin((input.pitchDeg * Math.PI) / 180) >=
      input.depthMm
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['seatLengthMm'],
        message: 'notch_consumes_depth',
      });
    }
  });
export type BirdsmouthInput = z.infer<typeof birdsmouthInputSchema>;
export interface BirdsmouthResult {
  seatLengthMm: number;
  verticalRiseAcrossSeatMm: number;
  normalDepthMm: number;
  remainingDepthMm: number;
  removedDepthRatio: number;
}
export function calculateBirdsmouth(input: BirdsmouthInput): BirdsmouthResult {
  const valid = birdsmouthInputSchema.parse(input);
  const radians = (valid.pitchDeg * Math.PI) / 180;
  const normalDepthMm = valid.seatLengthMm * Math.sin(radians);
  return {
    seatLengthMm: valid.seatLengthMm,
    verticalRiseAcrossSeatMm: valid.seatLengthMm * Math.tan(radians),
    normalDepthMm,
    remainingDepthMm: valid.depthMm - normalDepthMm,
    removedDepthRatio: normalDepthMm / valid.depthMm,
  };
}
