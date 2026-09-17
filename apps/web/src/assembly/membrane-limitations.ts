/**
 * V47: the membrane limitation vocabulary shared by the Material Plan card,
 * project readiness and documents. Codes come from the course/roll solver and
 * the cost projection; presentation layers only translate them.
 */
export const MEMBRANE_LIMITATION_CODES = [
  'gross-area-no-roll-reuse',
  'hip-course-width-approximated',
  'openings-not-subtracted',
  'membrane-sold-per-roll',
] as const;

export type MembraneLimitationCode = (typeof MEMBRANE_LIMITATION_CODES)[number];
