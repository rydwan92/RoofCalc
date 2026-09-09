import { z } from 'zod';
import { calculateTriangle, triangleInputSchema } from '../geometry/triangle';

export const commonRafterInputSchema = triangleInputSchema.extend({
  overhangMm: z.number().finite().min(0).max(10_000),
});
export type CommonRafterInput = z.infer<typeof commonRafterInputSchema>;
export interface CommonRafterResult {
  runMm: number;
  riseMm: number;
  bodyLengthMm: number;
  tailLengthMm: number;
  totalLengthMm: number;
  pitchDeg: number;
  plumbAngleDeg: number;
  tailDropMm: number;
}

/** Ideal reference line, support to ridge axis. No ridge deduction, notch or stock allowance. */
export function calculateCommonRafter(
  input: CommonRafterInput,
): CommonRafterResult {
  const valid = commonRafterInputSchema.parse(input);
  const triangle = calculateTriangle(valid);
  const tail =
    valid.overhangMm > 0
      ? calculateTriangle({ runMm: valid.overhangMm, pitchDeg: valid.pitchDeg })
      : { lengthMm: 0, riseMm: 0 };
  const tailLengthMm = tail.lengthMm;
  return {
    runMm: valid.runMm,
    riseMm: triangle.riseMm,
    bodyLengthMm: triangle.lengthMm,
    tailLengthMm,
    totalLengthMm: triangle.lengthMm + tailLengthMm,
    pitchDeg: valid.pitchDeg,
    plumbAngleDeg: triangle.plumbAngleDeg,
    tailDropMm: tail.riseMm,
  };
}
