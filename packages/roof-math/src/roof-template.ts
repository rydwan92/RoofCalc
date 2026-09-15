import { z } from 'zod';
import type {
  AssemblySpec,
  GableRoofTemplateSpec,
  HipRoofTemplateSpec,
  RoofTemplateSpec,
} from '@cieslacalc/timber-model';
import {
  assemblyFromGableTemplate,
  createGableRoofSkeleton,
  createGableRoofSkeletonFromResolved,
  gableRoofTemplateSchema,
  gableTemplateFromAssembly,
  minimumGableHalfRunMm,
  resolveGableRoofTemplate,
} from './gable-roof';
import {
  assemblyFromHipTemplate,
  createHipRoofSkeleton,
  createHipRoofSkeletonFromResolved,
  hipRoofTemplateSchema,
  hipTemplateFromAssembly,
  resolveHipRoofTemplate,
} from './hip-roof';

export const roofTemplateSchema: z.ZodType<RoofTemplateSpec> = z.union([
  gableRoofTemplateSchema,
  hipRoofTemplateSchema,
]);

export function assemblyFromRoofTemplate(template: RoofTemplateSpec) {
  return template.type === 'gable'
    ? assemblyFromGableTemplate(template)
    : assemblyFromHipTemplate(template);
}

export function roofTemplateFromAssembly(
  assembly: AssemblySpec,
  current: RoofTemplateSpec,
): RoofTemplateSpec {
  if (current.type === 'gable')
    return gableTemplateFromAssembly(assembly, {
      id: current.id,
      buildingLengthMm: current.buildingLengthMm,
      rafterSpacing: current.rafterSpacing,
      structure: current.structure,
    });
  return hipTemplateFromAssembly(assembly, {
    id: current.id,
    buildingLengthMm: current.buildingLengthMm,
    rafterSpacing: current.rafterSpacing,
    hipRafterSection: current.hipRafterSection,
  });
}

export function resolveRoofTemplate(template: RoofTemplateSpec) {
  return template.type === 'gable'
    ? resolveGableRoofTemplate(template)
    : resolveHipRoofTemplate(template);
}

export function createRoofSkeleton(template: RoofTemplateSpec) {
  return template.type === 'gable'
    ? createGableRoofSkeleton(template)
    : createHipRoofSkeleton(template);
}

export function createRoofSkeletonFromResolved(
  resolved: ReturnType<typeof resolveRoofTemplate>,
) {
  return 'hipRafter' in resolved
    ? createHipRoofSkeletonFromResolved(resolved)
    : createGableRoofSkeletonFromResolved(resolved);
}

export function convertRoofTemplate(
  template: RoofTemplateSpec,
  type: RoofTemplateSpec['type'],
): RoofTemplateSpec {
  if (template.type === type) return roofTemplateSchema.parse(template);
  if (type === 'hip') {
    const source = template as GableRoofTemplateSpec;
    return hipRoofTemplateSchema.parse({
      ...source,
      id: 'template:hip-1',
      type: 'hip',
      buildingLengthMm: Math.max(source.buildingLengthMm, source.halfRunMm * 2),
      hipRafterSection: {
        widthMm: Math.max(80, source.rafterSection.widthMm),
        depthMm: Math.max(240, source.rafterSection.depthMm),
      },
    });
  }
  const source = template as HipRoofTemplateSpec;
  return gableRoofTemplateSchema.parse({
    id: 'template:gable-1',
    type: 'gable',
    buildingLengthMm: source.buildingLengthMm,
    halfRunMm: source.halfRunMm,
    pitchDeg: source.pitchDeg,
    eaveOverhangMm: source.eaveOverhangMm,
    rafterSpacing: source.rafterSpacing,
    rafterSection: source.rafterSection,
    wallPlate: source.wallPlate,
    ridge: source.ridge,
    intermediateSupports: source.intermediateSupports,
  });
}

export function minimumRoofHalfRunMm(template: RoofTemplateSpec) {
  return minimumGableHalfRunMm({
    ...template,
    type: 'gable',
  });
}

export function clampRoofHalfRunMm(
  template: RoofTemplateSpec,
  proposedMm: number,
) {
  if (!Number.isFinite(proposedMm)) throw new RangeError('invalid_half_run');
  const maximum =
    template.type === 'hip'
      ? Math.min(100000, template.buildingLengthMm / 2)
      : 100000;
  return Math.max(
    minimumRoofHalfRunMm(template),
    Math.min(maximum, proposedMm),
  );
}
