import { z } from 'zod';
import type {
  AssemblySpec,
  GableRoofSkeleton,
  GableRoofTemplateSpec,
  RafterSpacingSpec,
  ResolvedCollarTie,
  ResolvedMemberPrototype,
  ResolvedRafterSpacing,
  RoofTemplateSpec,
  SkeletonMember3D,
} from '@cieslacalc/timber-model';
import {
  assemblySpecSchema,
  calculateAssembly,
  supportSpecSchema,
} from './assembly';
import {
  COLLAR_TIE_PROTOTYPE_ID,
  calculateCollarTie,
  clampCollarTieHeightMm,
  collarTieSpecSchema,
  maxCollarTieHeightMm,
} from './collar-tie';

const positiveMm = z.number().finite().min(1).max(100000);
const pitchDeg = z.number().finite().min(1).max(80);
const support = supportSpecSchema;
export const rafterSpacingSchema: z.ZodType<RafterSpacingSpec> = z
  .object({
    mode: z.enum(['max-even-spacing', 'target-even-spacing', 'fixed-module']),
    spacingMm: positiveMm,
    endPolicy: z.enum(['require-both-ends', 'allow-open-end']).optional(),
  })
  .superRefine((spacing, ctx) => {
    if (spacing.mode === 'fixed-module' && !spacing.endPolicy)
      ctx.addIssue({
        code: 'custom',
        path: ['endPolicy'],
        message: 'end_policy_required',
      });
  }) as z.ZodType<RafterSpacingSpec>;
export function gableRidgeHeightMm(halfRunMm: number, pitchDegValue: number) {
  return (
    positiveMm.parse(halfRunMm) *
    Math.tan((pitchDeg.parse(pitchDegValue) * Math.PI) / 180)
  );
}
export function gablePitchDegFromRidgeHeight(
  halfRunMm: number,
  ridgeHeightMm: number,
) {
  const run = positiveMm.parse(halfRunMm);
  if (!Number.isFinite(ridgeHeightMm) || ridgeHeightMm < 0)
    throw new RangeError('invalid_ridge_height');
  return (Math.atan(ridgeHeightMm / run) * 180) / Math.PI;
}
export function clampGablePitchDeg(pitchDegValue: number) {
  if (!Number.isFinite(pitchDegValue)) throw new RangeError('invalid_pitch');
  return Math.max(1, Math.min(80, pitchDegValue));
}
export const gableRoofTemplateSchema: z.ZodType<GableRoofTemplateSpec> = z
  .object({
    id: z.string().regex(/^template:[a-z][a-z0-9:-]*$/),
    type: z.literal('gable'),
    buildingLengthMm: positiveMm,
    halfRunMm: positiveMm,
    pitchDeg,
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
      depthMm: z.number().finite().min(1).max(2000).optional(),
      connection: z
        .enum(['ridge-board', 'direct-meeting', 'half-lap'])
        .optional(),
    }),
    intermediateSupports: z.array(support),
    structure: z
      .object({
        system: z.enum(['rafter', 'rafter-collar-tie']),
        collarTie: collarTieSpecSchema.optional(),
      })
      .optional(),
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
    if (
      template.intermediateSupports.some((support) => support.kind !== 'purlin')
    )
      ctx.addIssue({
        code: 'custom',
        path: ['intermediateSupports'],
        message: 'intermediate_support_kind',
      });
    if (template.structure?.system === 'rafter-collar-tie') {
      const collarTie = template.structure.collarTie;
      if (!collarTie)
        ctx.addIssue({
          code: 'custom',
          path: ['structure', 'collarTie'],
          message: 'collar_tie_required',
        });
      else if (
        collarTie.heightAboveWallPlateMm >
        maxCollarTieHeightMm(template.halfRunMm, template.pitchDeg)
      )
        ctx.addIssue({
          code: 'custom',
          path: ['structure', 'collarTie', 'heightAboveWallPlateMm'],
          message: 'collar_tie_above_ridge',
        });
    }
  });

/** Structural-system intent, distinct from roof shape. Hip roofs are always `rafter`. */
export function roofStructureSystem(
  template: RoofTemplateSpec,
): 'rafter' | 'rafter-collar-tie' {
  return template.type === 'gable' &&
    template.structure?.system === 'rafter-collar-tie'
    ? 'rafter-collar-tie'
    : 'rafter';
}

/** One resolved collar tie per rafter station. Empty unless the structural
 * system is `rafter-collar-tie`. */
export function resolveCollarTies(
  template: GableRoofTemplateSpec,
): ResolvedCollarTie[] {
  const collarTie = template.structure?.collarTie;
  if (roofStructureSystem(template) !== 'rafter-collar-tie' || !collarTie)
    return [];
  const geometry = calculateCollarTie({
    halfRunMm: template.halfRunMm,
    pitchDeg: template.pitchDeg,
    heightAboveWallPlateMm: collarTie.heightAboveWallPlateMm,
  });
  const spacing = resolveRafterSpacing(
    template.buildingLengthMm,
    template.rafterSpacing,
  );
  return spacing.stations.map((station) => ({
    id: `${station.id}:collar-tie`,
    stationId: station.id,
    alongBuildingMm: station.alongBuildingMm,
    heightAboveWallPlateMm: collarTie.heightAboveWallPlateMm,
    positionAlongRafterMm: geometry.positionAlongRafterMm,
    lengthMm: geometry.lengthMm,
    section: collarTie.section,
  }));
}

export function resolveRafterSpacing(
  buildingLengthMm: number,
  spacing: RafterSpacingSpec,
): ResolvedRafterSpacing {
  const length = positiveMm.parse(buildingLengthMm);
  const spec = rafterSpacingSchema.parse(spacing);
  const exactBayCount = length / spec.spacingMm;
  const fullBayCount = Math.floor(exactBayCount);
  const hasRemainder = length - fullBayCount * spec.spacingMm > 1e-8;
  const evenBayCount =
    spec.mode === 'max-even-spacing'
      ? Math.max(1, Math.ceil(exactBayCount))
      : spec.mode === 'target-even-spacing'
        ? Math.max(1, Math.round(exactBayCount))
        : undefined;
  const actualSpacingMm = evenBayCount ? length / evenBayCount : spec.spacingMm;
  const stations =
    spec.mode === 'fixed-module'
      ? [
          ...Array.from(
            { length: fullBayCount + 1 },
            (_, index) => index * spec.spacingMm,
          ),
          ...(spec.endPolicy === 'require-both-ends' && hasRemainder
            ? [length]
            : []),
        ]
      : Array.from({ length: evenBayCount! + 1 }, (_, index) =>
          index === evenBayCount ? length : index * actualSpacingMm,
        );
  const bayCount = stations.length - 1;
  const deviationMm =
    spec.mode === 'target-even-spacing'
      ? actualSpacingMm - spec.spacingMm
      : undefined;
  return {
    mode: spec.mode,
    requestedSpacingMm: spec.spacingMm,
    actualSpacingMm,
    ...(spec.mode === 'fixed-module'
      ? {
          endPolicy: spec.endPolicy,
          ...(spec.endPolicy === 'require-both-ends' && hasRemainder
            ? { endBaySpacingMm: length - fullBayCount * spec.spacingMm }
            : {}),
          ...(spec.endPolicy === 'allow-open-end' && hasRemainder
            ? { remainderToEndMm: length - fullBayCount * spec.spacingMm }
            : {}),
        }
      : { endBaySpacingMm: actualSpacingMm }),
    ...(deviationMm === undefined
      ? {}
      : {
          deviationMm,
          deviationRatio: deviationMm / spec.spacingMm,
        }),
    bayCount,
    stationCount: stations.length,
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
    'id' | 'buildingLengthMm' | 'rafterSpacing' | 'structure'
  > = {
    id: 'template:gable-1',
    buildingLengthMm: 8000,
    rafterSpacing: { mode: 'max-even-spacing', spacingMm: 800 },
  },
): GableRoofTemplateSpec {
  const assembly = assemblySpecSchema.parse(raw);
  const wallPlate = assembly.supports.find(
    (support) => support.kind === 'wall-plate',
  )!;
  const collarTie = layout.structure?.collarTie;
  const structure =
    layout.structure?.system === 'rafter-collar-tie' && collarTie
      ? {
          system: 'rafter-collar-tie' as const,
          collarTie: {
            ...collarTie,
            heightAboveWallPlateMm: clampCollarTieHeightMm(
              assembly.roof.runMm,
              assembly.roof.pitchDeg,
              collarTie.heightAboveWallPlateMm,
            ),
          },
        }
      : layout.structure;
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
    structure,
  });
}

/** Converts gable-template intent into the existing canonical fabrication assembly. */
export function assemblyFromGableTemplate(
  raw: GableRoofTemplateSpec,
): AssemblySpec {
  const template = gableRoofTemplateSchema.parse(raw);
  return assemblySpecSchema.parse(assemblyForTemplate(template));
}

/** Minimum half-run retaining every intermediate support before the ridge face. */
export function minimumGableHalfRunMm(raw: GableRoofTemplateSpec) {
  const template = gableRoofTemplateSchema.parse(raw);
  return Math.max(
    1,
    ...template.intermediateSupports.map(
      (support) =>
        support.placement.xMm +
        support.section.widthMm +
        template.ridge.thicknessMm / 2 +
        1,
    ),
  );
}
export function clampGableHalfRunMm(
  raw: GableRoofTemplateSpec,
  proposedMm: number,
) {
  if (!Number.isFinite(proposedMm)) throw new RangeError('invalid_half_run');
  return Math.max(minimumGableHalfRunMm(raw), Math.min(100000, proposedMm));
}

export function resolveGableRoofTemplate(raw: GableRoofTemplateSpec) {
  const template = gableRoofTemplateSchema.parse(raw);
  const assemblySpec = assemblySpecSchema.parse(assemblyForTemplate(template));
  const rafterSpacing = resolveRafterSpacing(
    template.buildingLengthMm,
    template.rafterSpacing,
  );
  const calculation = calculateAssembly(assemblySpec);
  const instanceIds = rafterSpacing.stations.flatMap((station) => [
    `${station.id}:left`,
    `${station.id}:right`,
  ]);
  const memberPrototypes: ResolvedMemberPrototype[] = [
    {
      id: calculation.assembly.member.id,
      code: 'K1',
      kind: 'common-rafter',
      section: template.rafterSection,
      instanceIds,
      count: instanceIds.length,
      lengthRangeMm: {
        min: calculation.plan.minimumStockLengthMm,
        max: calculation.plan.minimumStockLengthMm,
      },
      fabricationMode: 'shared',
    },
  ];
  return {
    template,
    ridgeHeightMm: gableRidgeHeightMm(template.halfRunMm, template.pitchDeg),
    rafterSpacing,
    calculation,
    memberPrototypes,
  };
}

/** Derives explanatory roof members in world XYZ; fabrication stays in the 2D assembly. */
export function createGableRoofSkeleton(
  raw: GableRoofTemplateSpec,
): GableRoofSkeleton {
  return createGableRoofSkeletonFromResolved(resolveGableRoofTemplate(raw));
}

export function createGableRoofSkeletonFromResolved(
  resolved: ReturnType<typeof resolveGableRoofTemplate>,
): GableRoofSkeleton {
  const { template, ridgeHeightMm, rafterSpacing } = resolved;
  const slope = Math.tan((template.pitchDeg * Math.PI) / 180);
  const eaveX = template.halfRunMm + template.eaveOverhangMm;
  const eaveZ = -template.eaveOverhangMm * slope;
  const alongLength = template.buildingLengthMm;
  const collarTieSpec = template.structure?.collarTie;
  const collarTieGeometry =
    roofStructureSystem(template) === 'rafter-collar-tie' && collarTieSpec
      ? calculateCollarTie({
          halfRunMm: template.halfRunMm,
          pitchDeg: template.pitchDeg,
          heightAboveWallPlateMm: collarTieSpec.heightAboveWallPlateMm,
        })
      : undefined;
  const members: SkeletonMember3D[] = [
    {
      id: 'skeleton:wall-plate-left',
      prototypeId: template.wallPlate.id,
      selectionId: template.wallPlate.id,
      kind: 'wall-plate',
      from: { x: -template.halfRunMm, y: 0, z: 0 },
      to: { x: -template.halfRunMm, y: alongLength, z: 0 },
      section: {
        widthMm: template.wallPlate.section.widthMm,
        depthMm: template.wallPlate.section.heightMm,
      },
      side: 'left',
    },
    {
      id: 'skeleton:wall-plate-right',
      prototypeId: template.wallPlate.id,
      selectionId: template.wallPlate.id,
      kind: 'wall-plate',
      from: { x: template.halfRunMm, y: 0, z: 0 },
      to: { x: template.halfRunMm, y: alongLength, z: 0 },
      section: {
        widthMm: template.wallPlate.section.widthMm,
        depthMm: template.wallPlate.section.heightMm,
      },
      side: 'right',
    },
    {
      id: 'skeleton:ridge',
      prototypeId: template.ridge.id,
      selectionId: template.ridge.id,
      kind: 'ridge',
      from: { x: 0, y: 0, z: ridgeHeightMm },
      to: { x: 0, y: alongLength, z: ridgeHeightMm },
      section: {
        widthMm: Math.max(template.ridge.thicknessMm, 1),
        depthMm: template.ridge.depthMm ?? template.rafterSection.depthMm,
      },
      side: 'center',
    },
    ...rafterSpacing.stations.flatMap((station) => [
      {
        id: `${station.id}:left`,
        prototypeId: resolved.calculation.assembly.member.id,
        selectionId: `${station.id}:left`,
        kind: 'rafter' as const,
        from: { x: -eaveX, y: station.alongBuildingMm, z: eaveZ },
        to: { x: 0, y: station.alongBuildingMm, z: ridgeHeightMm },
        section: template.rafterSection,
        side: 'left' as const,
        stationMm: station.alongBuildingMm,
      },
      {
        id: `${station.id}:right`,
        prototypeId: resolved.calculation.assembly.member.id,
        selectionId: `${station.id}:right`,
        kind: 'rafter' as const,
        from: { x: eaveX, y: station.alongBuildingMm, z: eaveZ },
        to: { x: 0, y: station.alongBuildingMm, z: ridgeHeightMm },
        section: template.rafterSection,
        side: 'right' as const,
        stationMm: station.alongBuildingMm,
      },
    ]),
    ...template.intermediateSupports.flatMap((support) => {
      const xFromWall = support.placement.xMm;
      const height = xFromWall * slope;
      return [
        {
          id: `instance:${support.id.replace('support:', '')}:left`,
          prototypeId: support.id,
          selectionId: support.id,
          kind: 'purlin' as const,
          from: { x: -template.halfRunMm + xFromWall, y: 0, z: height },
          to: {
            x: -template.halfRunMm + xFromWall,
            y: alongLength,
            z: height,
          },
          section: {
            widthMm: support.section.widthMm,
            depthMm: support.section.heightMm,
          },
          side: 'left' as const,
        },
        {
          id: `instance:${support.id.replace('support:', '')}:right`,
          prototypeId: support.id,
          selectionId: support.id,
          kind: 'purlin' as const,
          from: { x: template.halfRunMm - xFromWall, y: 0, z: height },
          to: {
            x: template.halfRunMm - xFromWall,
            y: alongLength,
            z: height,
          },
          section: {
            widthMm: support.section.widthMm,
            depthMm: support.section.heightMm,
          },
          side: 'right' as const,
        },
      ];
    }),
    ...(collarTieGeometry
      ? rafterSpacing.stations.map((station) => ({
          id: `${station.id}:collar-tie`,
          prototypeId: COLLAR_TIE_PROTOTYPE_ID,
          selectionId: `${station.id}:collar-tie`,
          kind: 'collar-tie' as const,
          from: {
            x: collarTieGeometry.leftXmm,
            y: station.alongBuildingMm,
            z: collarTieSpec!.heightAboveWallPlateMm,
          },
          to: {
            x: collarTieGeometry.rightXmm,
            y: station.alongBuildingMm,
            z: collarTieSpec!.heightAboveWallPlateMm,
          },
          section: collarTieSpec!.section,
          side: 'center' as const,
          stationMm: station.alongBuildingMm,
        }))
      : []),
  ];
  return { ridgeHeightMm, members };
}
