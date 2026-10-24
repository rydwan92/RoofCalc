import type {
  ResolvedMemberPrototype,
  RoofFamily,
} from '@cieslacalc/timber-model';

/**
 * VNext-8 (ADR-016): the translation key of each roof family's name — one
 * lookup for every label, so a new family is named in one place.
 */
export const ROOF_FAMILY_LABEL: Record<RoofFamily, string> = {
  gable: 'assembly.gableRoof',
  hip: 'assembly.hipRoof',
  'mono-pitch': 'assembly.monoPitchRoof',
  'asymmetric-gable': 'assembly.asymmetricGableRoof',
};

/**
 * VNext-9: the translation key of each member family's name. K2 (the right
 * rafter of an asymmetric gable) is a common rafter like K1; a family
 * never falls through to another family's name.
 */
export const MEMBER_FAMILY_LABEL: Record<
  ResolvedMemberPrototype['code'],
  string
> = {
  K1: 'assembly.commonRafter',
  K2: 'assembly.commonRafter',
  H1: 'assembly.hipRafter',
  J1: 'assembly.jackRafter',
};
