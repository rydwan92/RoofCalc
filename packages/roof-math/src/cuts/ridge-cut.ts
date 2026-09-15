import { z } from 'zod';
import type { RidgeConnectionType } from '@cieslacalc/timber-model';
import { triangleInputSchema } from '../geometry/triangle';

const ridgeCutInputSchema = triangleInputSchema
  .extend({
    thicknessMm: z.number().finite().min(0).max(1000),
    depthMm: z.number().finite().positive().max(2000),
    connection: z
      .enum(['ridge-board', 'direct-meeting', 'half-lap'])
      .optional(),
  })
  .refine(
    (input) =>
      (input.connection ?? 'ridge-board') !== 'ridge-board' ||
      input.thicknessMm / 2 < input.runMm,
    {
      path: ['thicknessMm'],
      message: 'ridge_outside_run',
    },
  );
export type RidgeCutInput = z.infer<typeof ridgeCutInputSchema>;
/**
 * `ridge-board` (the pre-V32 default) uses the supplied board thickness.
 * `direct-meeting` and `half-lap` reference the same near-face-to-axis plumb
 * geometry as an unmodified board of zero thickness: the declared
 * `thicknessMm` is ignored because neither variant models a physical board.
 * `half-lap` additionally has no modeled overlap/cut-reduction geometry; its
 * result remains a theoretical reference only (see `resolveK1FabricationBlank`,
 * which never resolves a fabrication blank for it).
 */
export function calculateRidgeCut(input: RidgeCutInput) {
  const valid = ridgeCutInputSchema.parse(input);
  const connection: RidgeConnectionType = valid.connection ?? 'ridge-board';
  const effectiveThicknessMm =
    connection === 'ridge-board' ? valid.thicknessMm : 0;
  const theta = (valid.pitchDeg * Math.PI) / 180;
  return {
    connection,
    axisXmm: valid.runMm,
    nearFaceXmm: valid.runMm - effectiveThicknessMm / 2,
    horizontalDeductionMm: effectiveThicknessMm / 2,
    alongMemberDeductionMm: effectiveThicknessMm / (2 * Math.cos(theta)),
    angleToMemberDeg: 90 - valid.pitchDeg,
    topBottomStationOffsetMm: valid.depthMm * Math.tan(theta),
    cutLengthMm: valid.depthMm / Math.cos(theta),
  };
}
export type RidgeCutResult = ReturnType<typeof calculateRidgeCut>;
