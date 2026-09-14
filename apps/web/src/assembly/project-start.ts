import { convertRoofTemplate, roofTemplateSchema } from '@cieslacalc/roof-math';
import type { RoofTemplateSpec } from '@cieslacalc/timber-model';

export interface ProjectStartValues {
  roofType: RoofTemplateSpec['type'];
  buildingLengthMm: number;
  buildingWidthMm: number;
  pitchDeg: number;
  eaveOverhangMm: number;
  rafterSpacingMm: number;
}

export function projectStartValuesFromTemplate(
  template: RoofTemplateSpec,
): ProjectStartValues {
  return {
    roofType: template.type,
    buildingLengthMm: template.buildingLengthMm,
    buildingWidthMm: template.halfRunMm * 2,
    pitchDeg: template.pitchDeg,
    eaveOverhangMm: template.eaveOverhangMm,
    rafterSpacingMm: template.rafterSpacing.spacingMm,
  };
}

/**
 * Maps friendly building dimensions onto the one existing canonical roof
 * template. Building width is never persisted separately from halfRunMm.
 */
export function createProjectStartTemplate(
  values: ProjectStartValues,
  base: RoofTemplateSpec,
): RoofTemplateSpec {
  const converted = convertRoofTemplate(base, values.roofType);
  return roofTemplateSchema.parse({
    ...converted,
    buildingLengthMm: values.buildingLengthMm,
    halfRunMm: values.buildingWidthMm / 2,
    pitchDeg: values.pitchDeg,
    eaveOverhangMm: values.eaveOverhangMm,
    rafterSpacing: {
      ...converted.rafterSpacing,
      spacingMm: values.rafterSpacingMm,
    },
  });
}
