import { z } from 'zod';
import type {
  AssemblySpec,
  GableRoofSkeleton,
  GableRoofTemplateSpec,
  RafterSpacingSpec,
  ResolvedRafterSpacing,
  SkeletonMember3D,
} from '@cieslacalc/timber-model';
import {
  assemblySpecSchema,
  calculateAssembly,
  supportSpecSchema,
} from './assembly';

const positiveMm = z.number().finite().min(1).max(100000);
const support = supportSpecSchema;
export const rafterSpacingSchema: z.ZodType<RafterSpacingSpec> = z.object({
  mode: z.enum(['fixed-spacing', 'fit-evenly']),
  spacingMm: positiveMm,
});
export const gableRoofTemplateSchema: z.ZodType<GableRoofTemplateSpec> = z
  .object({
    id: z.string().regex(/^template:[a-z][a-z0-9:-]*$/),
    type: z.literal('gable'),
    buildingLengthMm: positiveMm,
    halfRunMm: positiveMm,
    pitchDeg: z.number().finite().min(1).max(80),
    eaveOverhangMm: z.number().finite().min(0).max(10000),
    rafterSpacing: rafterSpacingSchema,
    rafterSection: z.object({
      widthMm: z.number().finite().min(1).max(1000),
      depthMm: z.number().finite().min(1).max(2000),
    }),
    wallPlate: support,
    ridge: z.object({
      id: z.string().regex(/^[a-z][a-z0-9:-]*$/),
      thicknessMm: z.number().finite().min(0).max(1000),
    }),
    intermediateSupports: z.array(support),
  })
  .superRefine((template, ctx) => {
    if (template.wallPlate.kind !== 'wall-plate')
      ctx.addIssue({
        code: 'custom',
        path: ['wallPlate', 'kind'],
        message: 'wall_plate_required',
      });
    if (template.wallPlate.placement.xMm !== 0)
      ctx.addIssue({
        code: 'custom',
        path: ['wallPlate', 'placement', 'xMm'],
        message: 'wall_origin',
      });
    if (template.intermediateSupports.some((support) => support.kind !== 'purlin'))
      ctx.addIssue({
        code: 'custom',
        path: ['intermediateSupports'],
        message: 'intermediate_support_kind',
      });
  });

export function resolveRafterSpacing(
  buildingLengthMm: number,
  spacing: RafterSpacingSpec,
): ResolvedRafterSpacing {
  const length = positiveMm.parse(buildingLengthMm);
  const spec = rafterSpacingSchema.parse(spacing);
  const exactBayCount = length / spec.spacingMm;
  const fullBayCount = Math.floor(exactBayCount);
  const hasRemainder = length - fullBayCount * spec.spacingMm > 1e-8;
  const bayCount =
    spec.mode === 'fit-evenly'
      ? Math.max(1, Math.ceil(exactBayCount))
      : Math.max(1, fullBayCount + (hasRemainder ? 1 : 0));
  const actualSpacingMm =
    spec.mode === 'fit-evenly' ? length / bayCount : spec.spacingMm;
  const stations =
    spec.mode === 'fit-evenly'
      ? Array.from({ length: bayCount + 1 }, (_, index) =>
          index === bayCount ? length : index * actualSpacingMm,
        )
      : [
          ...Array.from({ length: fullBayCount + 1 }, (_, index) =>
            index * spec.spacingMm,
          ),
          ...(hasRemainder ? [length] : []),
        ];
  return {
    mode: spec.mode,
    requestedSpacingMm: spec.spacingMm,
    actualSpacingMm,
    endBaySpacingMm: stations.at(-1)! - stations.at(-2)!,
    bayCount,
    stations: stations.map((alongBuildingMm, index) => ({
      id: `instance:rafter-pair-${index + 1}`,
      alongBuildingMm,
    })),
  };
}

function assemblyForTemplate(template: GableRoofTemplateSpec): AssemblySpec {
  return {
    roof: {
      runMm: template.halfRunMm,
      pitchDeg: template.pitchDeg,
      overhangMm: template.eaveOverhangMm,
    },
    member: { id: 'member:rafter-1', section: template.rafterSection },
    supports: [template.wallPlate, ...template.intermediateSupports],
    ridge: template.ridge,
  };
}

export function gableTemplateFromAssembly(
  raw: AssemblySpec,
  layout: Pick<
    GableRoofTemplateSpec,
    'id' | 'buildingLengthMm' | 'rafterSpacing'
  > = {
    id: 'template:gable-1',
    buildingLengthMm: 8000,
    rafterSpacing: { mode: 'fit-evenly', spacingMm: 800 },
  },
): GableRoofTemplateSpec {
  const assembly = assemblySpecSchema.parse(raw);
  const wallPlate = assembly.supports.find(
    (support) => support.kind === 'wall-plate',
  )!;
  return gableRoofTemplateSchema.parse({
    id: layout.id,
    type: 'gable',
    buildingLengthMm: layout.buildingLengthMm,
    halfRunMm: assembly.roof.runMm,
    pitchDeg: assembly.roof.pitchDeg,
    eaveOverhangMm: assembly.roof.overhangMm,
    rafterSpacing: layout.rafterSpacing,
    rafterSection: assembly.member.section,
    wallPlate,
    ridge: assembly.ridge,
    intermediateSupports: assembly.supports.filter(
      (support) => support.kind === 'purlin',
    ),
  });
}

/** Converts gable-template intent into the existing canonical fabrication assembly. */
export function assemblyFromGableTemplate(
  raw: GableRoofTemplateSpec,
): AssemblySpec {
  const template = gableRoofTemplateSchema.parse(raw);
  return assemblySpecSchema.parse(assemblyForTemplate(template));
}

export function resolveGableRoofTemplate(raw: GableRoofTemplateSpec) {
  const template = gableRoofTemplateSchema.parse(raw);
  const assemblySpec = assemblySpecSchema.parse(assemblyForTemplate(template));
  return {
    template,
    ridgeHeightMm:
      template.halfRunMm * Math.tan((template.pitchDeg * Math.PI) / 180),
    rafterSpacing: resolveRafterSpacing(
      template.buildingLengthMm,
      template.rafterSpacing,
    ),
    calculation: calculateAssembly(assemblySpec),
  };
}

/** Derives explanatory roof members in world XYZ; fabrication stays in the 2D assembly. */
export function createGableRoofSkeleton(
  raw: GableRoofTemplateSpec,
): GableRoofSkeleton {
  const resolved = resolveGableRoofTemplate(raw);
  const { template, ridgeHeightMm, rafterSpacing } = resolved;
  const slope = Math.tan((template.pitchDeg * Math.PI) / 180);
  const eaveX = template.halfRunMm + template.eaveOverhangMm;
  const eaveZ = -template.eaveOverhangMm * slope;
  const alongLength = template.buildingLengthMm;
  const members: SkeletonMember3D[] = [
    {
      id: 'skeleton:wall-plate-left',
      selectionId: template.wallPlate.id,
      kind: 'wall-plate',
      from: { x: -template.halfRunMm, y: 0, z: 0 },
      to: { x: -template.halfRunMm, y: alongLength, z: 0 },
    },
    {
      id: 'skeleton:wall-plate-right',
      selectionId: template.wallPlate.id,
      kind: 'wall-plate',
      from: { x: template.halfRunMm, y: 0, z: 0 },
      to: { x: template.halfRunMm, y: alongLength, z: 0 },
    },
    {
      id: 'skeleton:ridge',
      selectionId: template.ridge.id,
      kind: 'ridge',
      from: { x: 0, y: 0, z: ridgeHeightMm },
      to: { x: 0, y: alongLength, z: ridgeHeightMm },
    },
    ...rafterSpacing.stations.flatMap((station) => [
      {
        id: `${station.id}:left`,
        selectionId: resolved.calculation.assembly.member.id,
        kind: 'rafter' as const,
        from: { x: -eaveX, y: station.alongBuildingMm, z: eaveZ },
        to: { x: 0, y: station.alongBuildingMm, z: ridgeHeightMm },
      },
      {
        id: `${station.id}:right`,
        selectionId: resolved.calculation.assembly.member.id,
        kind: 'rafter' as const,
        from: { x: eaveX, y: station.alongBuildingMm, z: eaveZ },
        to: { x: 0, y: station.alongBuildingMm, z: ridgeHeightMm },
      },
    ]),
    ...template.intermediateSupports.flatMap((support) => {
      const xFromWall = support.placement.xMm;
      const height = xFromWall * slope;
      return [
        {
          id: `skeleton:${support.id}:left`,
          selectionId: support.id,
          kind: 'purlin' as const,
          from: { x: -template.halfRunMm + xFromWall, y: 0, z: height },
          to: {
            x: -template.halfRunMm + xFromWall,
            y: alongLength,
            z: height,
          },
        },
        {
          id: `skeleton:${support.id}:right`,
          selectionId: support.id,
          kind: 'purlin' as const,
          from: { x: template.halfRunMm - xFromWall, y: 0, z: height },
          to: {
            x: template.halfRunMm - xFromWall,
            y: alongLength,
            z: height,
          },
        },
      ];
    }),
  ];
  return { ridgeHeightMm, members };
}