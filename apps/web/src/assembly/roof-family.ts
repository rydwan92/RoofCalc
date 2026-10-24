import type { RoofFamily } from '@cieslacalc/timber-model';

/**
 * VNext-8 (ADR-016): the translation key of each roof family's name — one
 * lookup for every label, so a new family is named in one place.
 */
export const ROOF_FAMILY_LABEL: Record<RoofFamily, string> = {
  gable: 'assembly.gableRoof',
  hip: 'assembly.hipRoof',
  'mono-pitch': 'assembly.monoPitchRoof',
};
