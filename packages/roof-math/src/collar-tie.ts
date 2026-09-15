import { z } from 'zod';
import type { CollarTieSpec } from '@cieslacalc/timber-model';

/** Shared placement id: one theoretical collar-tie family per structure. */
export const COLLAR_TIE_PROTOTYPE_ID = 'member:collar-tie-1';

/** Minimum clearance kept below the ridge apex so a tie never touches it. */
const RIDGE_CLEARANCE_MM = 1;

export const collarTieSpecSchema: z.ZodType<CollarTieSpec> = z.object({
  heightAboveWallPlateMm: z.number().finite().min(1).max(100000),
  section: z.object({
    widthMm: z.number().finite().min(1).max(1000),
    depthMm: z.number().finite().min(1).max(2000),
  }),
});

/** Highest legal collar-tie height for the given roof geometry. */
export function maxCollarTieHeightMm(halfRunMm: number, pitchDeg: number) {
  const riseMm = halfRunMm * Math.tan((pitchDeg * Math.PI) / 180);
  return riseMm - RIDGE_CLEARANCE_MM;
}

export function clampCollarTieHeightMm(
  halfRunMm: number,
  pitchDeg: number,
  proposedMm: number,
) {
  if (!Number.isFinite(proposedMm))
    throw new RangeError('invalid_collar_tie_height');
  return Math.max(
    1,
    Math.min(maxCollarTieHeightMm(halfRunMm, pitchDeg), proposedMm),
  );
}

export interface CollarTieGeometry {
  lengthMm: number;
  positionAlongRafterMm: number;
  leftXmm: number;
  rightXmm: number;
}

/**
 * Theoretical collar-tie geometry: the horizontal segment between the two
 * rafter reference axes (eave top-of-wall-plate to ridge apex), at the given
 * height above the wall-plate/seat-plane reference. This mirrors the same
 * simplified centerline the 3D skeleton already draws for rafters — it does
 * not account for birdsmouth, ridge-board deduction or connection cuts, so it
 * is a reference length, not a finished/notch-aware fabrication result.
 */
export function calculateCollarTie(input: {
  halfRunMm: number;
  pitchDeg: number;
  heightAboveWallPlateMm: number;
}): CollarTieGeometry {
  const halfRunMm = z
    .number()
    .finite()
    .positive()
    .max(100000)
    .parse(input.halfRunMm);
  const pitchDeg = z.number().finite().min(1).max(80).parse(input.pitchDeg);
  const heightAboveWallPlateMm = z
    .number()
    .finite()
    .positive()
    .parse(input.heightAboveWallPlateMm);
  const maxHeightMm = maxCollarTieHeightMm(halfRunMm, pitchDeg);
  if (heightAboveWallPlateMm > maxHeightMm)
    throw new RangeError('collar_tie_above_ridge');
  const slope = Math.tan((pitchDeg * Math.PI) / 180);
  const halfLengthMm = halfRunMm - heightAboveWallPlateMm / slope;
  return {
    lengthMm: 2 * halfLengthMm,
    positionAlongRafterMm:
      heightAboveWallPlateMm / Math.sin((pitchDeg * Math.PI) / 180),
    leftXmm: -halfLengthMm,
    rightXmm: halfLengthMm,
  };
}
