import { z } from 'zod';
import type {
  AssemblySpec,
  AsymmetricGableRoofTemplateSpec,
  GableRoofTemplateSpec,
  HipRoofTemplateSpec,
  MonoPitchRoofTemplateSpec,
  RidgedRoofTemplateSpec,
  RoofTemplateSpec,
} from '@cieslacalc/timber-model';
import { assemblyDefaults, seatLength } from './assembly';
import {
  ASYMMETRIC_GABLE_TEMPLATE_ID,
  assemblyFromAsymmetricGableTemplate,
  asymmetricGableGeometry,
  asymmetricGableRoofTemplateSchema,
  asymmetricGableTemplateFromAssembly,
  createAsymmetricGableRoofSkeletonFromResolved,
  resolveAsymmetricGableTemplate,
} from './asymmetric-gable';
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
import {
  assemblyFromMonoPitchTemplate,
  createMonoPitchRoofSkeletonFromResolved,
  MONO_PITCH_TEMPLATE_ID,
  monoPitchRoofTemplateSchema,
  monoPitchTemplateFromAssembly,
  resolveMonoPitchRoofTemplate,
} from './mono-pitch-template';

export const roofTemplateSchema: z.ZodType<RoofTemplateSpec> = z.union([
  gableRoofTemplateSchema,
  hipRoofTemplateSchema,
  monoPitchRoofTemplateSchema,
  asymmetricGableRoofTemplateSchema,
]);

/** Gable and hip: a ridge between two eaves (ADR-016 capability check). */
export function isRidgedRoofTemplate(
  template: RoofTemplateSpec,
): template is RidgedRoofTemplateSpec {
  return template.type === 'gable' || template.type === 'hip';
}

/**
 * The building's width across the slope, outer face to outer face: twice
 * the half run of a ridged roof, the run of a mono-pitch roof.
 */
export function roofTemplateSpanMm(template: RoofTemplateSpec): number {
  switch (template.type) {
    case 'mono-pitch':
      return template.runMm;
    case 'asymmetric-gable':
      return template.spanMm;
    default:
      return template.halfRunMm * 2;
  }
}

/**
 * The cross section's extent in the family's frame, outer face to outer
 * face along x: a ridged roof is centred on its ridge, a mono-pitch roof
 * starts at its low plate, an asymmetric gable's ridge sits off centre.
 */
export function roofTemplateFrameMm(template: RoofTemplateSpec): {
  leftMm: number;
  rightMm: number;
} {
  switch (template.type) {
    case 'mono-pitch':
      return { leftMm: 0, rightMm: template.runMm };
    case 'asymmetric-gable': {
      const geometry = asymmetricGableGeometry(template);
      return { leftMm: -geometry.leftRunMm, rightMm: geometry.rightRunMm };
    }
    default:
      return { leftMm: -template.halfRunMm, rightMm: template.halfRunMm };
  }
}

/** Families that end their rafters at a ridge (ridge board, connection). */
export function hasRidge(template: RoofTemplateSpec): boolean {
  return template.type !== 'mono-pitch';
}

function unknownFamily(template: never): never {
  throw new RangeError(
    `unknown_roof_family:${(template as { type?: string }).type}`,
  );
}

export function assemblyFromRoofTemplate(template: RoofTemplateSpec) {
  switch (template.type) {
    case 'gable':
      return assemblyFromGableTemplate(template);
    case 'hip':
      return assemblyFromHipTemplate(template);
    case 'mono-pitch':
      return assemblyFromMonoPitchTemplate(template);
    case 'asymmetric-gable':
      return assemblyFromAsymmetricGableTemplate(template);
    default:
      return unknownFamily(template);
  }
}

export function roofTemplateFromAssembly(
  assembly: AssemblySpec,
  current: RoofTemplateSpec,
): RoofTemplateSpec {
  switch (current.type) {
    case 'gable':
      return gableTemplateFromAssembly(assembly, {
        id: current.id,
        buildingLengthMm: current.buildingLengthMm,
        rafterSpacing: current.rafterSpacing,
        structure: current.structure,
      });
    case 'hip':
      return hipTemplateFromAssembly(assembly, {
        id: current.id,
        buildingLengthMm: current.buildingLengthMm,
        rafterSpacing: current.rafterSpacing,
        hipRafterSection: current.hipRafterSection,
      });
    case 'mono-pitch':
      return monoPitchTemplateFromAssembly(assembly, current);
    case 'asymmetric-gable':
      return asymmetricGableTemplateFromAssembly(assembly, current);
    default:
      return unknownFamily(current);
  }
}

export function resolveRoofTemplate(
  template: GableRoofTemplateSpec,
): ReturnType<typeof resolveGableRoofTemplate>;
export function resolveRoofTemplate(
  template: HipRoofTemplateSpec,
): ReturnType<typeof resolveHipRoofTemplate>;
export function resolveRoofTemplate(
  template: MonoPitchRoofTemplateSpec,
): ReturnType<typeof resolveMonoPitchRoofTemplate>;
export function resolveRoofTemplate(
  template: AsymmetricGableRoofTemplateSpec,
): ReturnType<typeof resolveAsymmetricGableTemplate>;
export function resolveRoofTemplate(
  template: RoofTemplateSpec,
):
  | ReturnType<typeof resolveGableRoofTemplate>
  | ReturnType<typeof resolveHipRoofTemplate>
  | ReturnType<typeof resolveMonoPitchRoofTemplate>
  | ReturnType<typeof resolveAsymmetricGableTemplate>;
export function resolveRoofTemplate(template: RoofTemplateSpec) {
  switch (template.type) {
    case 'gable':
      return resolveGableRoofTemplate(template);
    case 'hip':
      return resolveHipRoofTemplate(template);
    case 'mono-pitch':
      return resolveMonoPitchRoofTemplate(template);
    case 'asymmetric-gable':
      return resolveAsymmetricGableTemplate(template);
    default:
      return unknownFamily(template);
  }
}

export type ResolvedRoofTemplate = ReturnType<typeof resolveRoofTemplate>;

export function createRoofSkeleton(template: RoofTemplateSpec) {
  switch (template.type) {
    case 'gable':
      return createGableRoofSkeleton(template);
    case 'hip':
      return createHipRoofSkeleton(template);
    case 'mono-pitch':
      return createMonoPitchRoofSkeletonFromResolved(
        resolveMonoPitchRoofTemplate(template),
      );
    case 'asymmetric-gable':
      return createAsymmetricGableRoofSkeletonFromResolved(
        resolveAsymmetricGableTemplate(template),
      );
    default:
      return unknownFamily(template);
  }
}

export function createRoofSkeletonFromResolved(resolved: ResolvedRoofTemplate) {
  if ('monoPitch' in resolved)
    return createMonoPitchRoofSkeletonFromResolved(resolved);
  if ('asymmetric' in resolved)
    return createAsymmetricGableRoofSkeletonFromResolved(resolved);
  return 'hipRafter' in resolved
    ? createHipRoofSkeletonFromResolved(resolved)
    : createGableRoofSkeletonFromResolved(resolved);
}

/** A ridged template as the default gable's wall plate and ridge carry them. */
function gableFromMonoPitch(
  source: MonoPitchRoofTemplateSpec,
): GableRoofTemplateSpec {
  const base = gableTemplateFromAssembly(assemblyDefaults);
  return gableRoofTemplateSchema.parse({
    ...base,
    buildingLengthMm: source.buildingLengthMm,
    halfRunMm: source.runMm / 2,
    pitchDeg: source.pitchDeg,
    eaveOverhangMm: source.eaveOverhangMm,
    rafterSpacing: source.rafterSpacing,
    rafterSection: source.rafterSection,
    wallPlate: {
      ...base.wallPlate,
      section: {
        widthMm: source.lowSupport.widthMm,
        heightMm: source.lowSupport.heightMm,
      },
      joint: {
        kind: 'seat-notch',
        control: 'seat',
        valueMm: source.lowSupport.seatMm,
      },
    },
    intermediateSupports: [],
  });
}

/** The same building as a symmetric gable: the left pitch on both sides. */
function gableFromAsymmetric(
  source: AsymmetricGableRoofTemplateSpec,
): GableRoofTemplateSpec {
  const base = gableTemplateFromAssembly(assemblyDefaults);
  return gableRoofTemplateSchema.parse({
    ...base,
    buildingLengthMm: source.buildingLengthMm,
    halfRunMm: source.spanMm / 2,
    pitchDeg: source.pitchDeg,
    eaveOverhangMm: source.eaveOverhangMm,
    rafterSpacing: source.rafterSpacing,
    rafterSection: source.rafterSection,
    wallPlate: source.wallPlate,
    ridge: source.ridge,
    intermediateSupports: [],
  });
}

/**
 * A ridged roof as an asymmetric gable starts symmetric (both pitches
 * equal: exactly the gable, docs/domain/ASYMMETRIC_GABLE.md A2); the user
 * then changes one side.
 */
function asymmetricFromRidged(
  source: RidgedRoofTemplateSpec,
): AsymmetricGableRoofTemplateSpec {
  return asymmetricGableRoofTemplateSchema.parse({
    id: ASYMMETRIC_GABLE_TEMPLATE_ID,
    type: 'asymmetric-gable',
    buildingLengthMm: source.buildingLengthMm,
    spanMm: source.halfRunMm * 2,
    pitchDeg: source.pitchDeg,
    rightPitchDeg: source.pitchDeg,
    eaveOverhangMm: source.eaveOverhangMm,
    rafterSpacing: source.rafterSpacing,
    rafterSection: source.rafterSection,
    wallPlate: source.wallPlate,
    ridge: source.ridge,
  });
}

/**
 * The same building as a mono-pitch roof: the full width becomes the run,
 * both bearings take the wall plate, the pitch is kept (as gable ↔ hip).
 */
function monoPitchFromRidged(
  source: RidgedRoofTemplateSpec,
): MonoPitchRoofTemplateSpec {
  const plate = {
    widthMm: source.wallPlate.section.widthMm,
    heightMm: source.wallPlate.section.heightMm,
    seatMm: seatLength(source.wallPlate, source.pitchDeg),
  };
  return monoPitchRoofTemplateSchema.parse({
    id: MONO_PITCH_TEMPLATE_ID,
    type: 'mono-pitch',
    buildingLengthMm: source.buildingLengthMm,
    runMm: source.halfRunMm * 2,
    pitchDeg: source.pitchDeg,
    eaveOverhangMm: source.eaveOverhangMm,
    topEdge: 'free',
    highOverhangMm: source.eaveOverhangMm,
    vergeOverhangMm: 0,
    rafterSpacing: source.rafterSpacing,
    rafterSection: source.rafterSection,
    lowSupport: { kind: 'wall-plate', ...plate },
    highSupport: { kind: 'wall-plate', ...plate },
    intermediateSupports: [],
  });
}

export function convertRoofTemplate(
  template: RoofTemplateSpec,
  type: 'gable',
): GableRoofTemplateSpec;
export function convertRoofTemplate(
  template: RoofTemplateSpec,
  type: 'hip',
): HipRoofTemplateSpec;
export function convertRoofTemplate(
  template: RoofTemplateSpec,
  type: 'mono-pitch',
): MonoPitchRoofTemplateSpec;
export function convertRoofTemplate(
  template: RoofTemplateSpec,
  type: 'asymmetric-gable',
): AsymmetricGableRoofTemplateSpec;
export function convertRoofTemplate(
  template: RoofTemplateSpec,
  type: RoofTemplateSpec['type'],
): RoofTemplateSpec;
export function convertRoofTemplate(
  template: RoofTemplateSpec,
  type: RoofTemplateSpec['type'],
): RoofTemplateSpec {
  if (template.type === type) return roofTemplateSchema.parse(template);
  // Every family converts through the gable: one place per family pair.
  const ridged: RidgedRoofTemplateSpec =
    template.type === 'mono-pitch'
      ? gableFromMonoPitch(template)
      : template.type === 'asymmetric-gable'
        ? gableFromAsymmetric(template)
        : template;
  if (type === 'mono-pitch') return monoPitchFromRidged(ridged);
  if (type === 'asymmetric-gable') return asymmetricFromRidged(ridged);
  if (ridged.type === type) return ridged;
  if (type === 'hip') {
    const source = ridged as GableRoofTemplateSpec;
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
  const source = ridged as HipRoofTemplateSpec;
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

export function minimumRoofHalfRunMm(template: RidgedRoofTemplateSpec) {
  return minimumGableHalfRunMm({
    ...template,
    type: 'gable',
  });
}

export function clampRoofHalfRunMm(
  template: RidgedRoofTemplateSpec,
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
