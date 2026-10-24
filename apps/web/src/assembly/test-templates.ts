import type {
  RidgedRoofTemplateSpec,
  RoofTemplateSpec,
} from '@cieslacalc/timber-model';

/**
 * Tests of gable/hip behaviour read ridge fields off the store's template:
 * the template itself, or a loud failure if it is another family (ADR-016).
 */
export function ridged(template: RoofTemplateSpec): RidgedRoofTemplateSpec {
  if (template.type === 'mono-pitch')
    throw new Error('expected a gable or hip roof');
  return template;
}
