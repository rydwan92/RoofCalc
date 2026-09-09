import { z } from 'zod';

export const triangleInputSchema = z.object({
  runMm: z.number().finite().gt(0).max(100_000),
  pitchDeg: z.number().finite().min(1).max(80),
});
export type TriangleInput = z.infer<typeof triangleInputSchema>;
export interface TriangleResult {
  runMm: number;
  riseMm: number;
  lengthMm: number;
  pitchDeg: number;
  plumbAngleDeg: number;
}

/** Right triangle. Public units: mm and degrees. Validated working range: 1–80°. */
export function calculateTriangle(input: TriangleInput): TriangleResult {
  const { runMm, pitchDeg } = triangleInputSchema.parse(input);
  const radians = (pitchDeg * Math.PI) / 180;
  return {
    runMm,
    riseMm: runMm * Math.tan(radians),
    lengthMm: runMm / Math.cos(radians),
    pitchDeg,
    plumbAngleDeg: 90 - pitchDeg,
  };
}
