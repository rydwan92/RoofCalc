import { z } from 'zod';
import type {
  AssemblySpec,
  HipCorner,
  HipRoofSkeleton,
  HipRoofTemplateSpec,
  JackRafterRoofPlane,
  Point3D,
  RafterSpacingSpec,
  ResolvedJackRafterInstance,
  ResolvedMemberPrototype,
  SkeletonMember3D,
  TimberSection,
} from '@cieslacalc/timber-model';
import {
  assemblySpecSchema,
  calculateAssembly,
  supportSpecSchema,
} from './assembly';
import { resolveRafterSpacing, rafterSpacingSchema } from './gable-roof';
import { calculateHipRafter } from './hip-rafter';
import { calculateJackRafter } from './jack-rafter';

export const HIP_RAFTER_PROTOTYPE_ID = 'member:hip-rafter-H1';
export const JACK_RAFTER_PROTOTYPE_ID = 'member:jack-rafter-J1';
export const COMMON_RAFTER_PROTOTYPE_ID = 'member:rafter-1';
const positiveMm = z.number().finite().min(1).max(100000);
const sectionSchema = z.object({
  widthMm: z.number().finite().min(1).max(1000),
  depthMm: z.number().finite().min(1).max(2000),
});

export const hipRoofTemplateSchema: z.ZodType<HipRoofTemplateSpec> = z
  .object({
    id: z.string().regex(/^template:[a-z][a-z0-9:-]*$/),
    type: z.literal('hip'),
    buildingLengthMm: positiveMm,
    halfRunMm: positiveMm,
    pitchDeg: z.number().finite().min(1).max(80),
    eaveOverhangMm: z.number().finite().min(0).max(10000),
    rafterSpacing: rafterSpacingSchema,
    rafterSection: sectionSchema,
    hipRafterSection: sectionSchema,
    wallPlate: supportSpecSchema,
    ridge: z.object({
      id: z.string().regex(/^[a-z][a-z0-9:-]*$/),
      thicknessMm: z.number().finite().min(0).max(1000),
      depthMm: z.number().finite().min(1).max(2000).optional(),
      connection: z
        .enum(['ridge-board', 'direct-meeting', 'half-lap'])
        .optional(),
    }),
    intermediateSupports: z.array(supportSpecSchema),
  })
  .superRefine((template, ctx) => {
    if (template.buildingLengthMm < template.halfRunMm * 2)
      ctx.addIssue({
        code: 'custom',
        path: ['buildingLengthMm'],
        message: 'hip_length_below_span',
      });
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
    if (template.intermediateSupports.some((item) => item.kind !== 'purlin'))
      ctx.addIssue({
        code: 'custom',
        path: ['intermediateSupports'],
        message: 'intermediate_support_kind',
      });
  });

function assemblyForTemplate(template: HipRoofTemplateSpec): AssemblySpec {
  return {
    roof: {
      runMm: template.halfRunMm,
      pitchDeg: template.pitchDeg,
      overhangMm: template.eaveOverhangMm,
    },
    member: { id: COMMON_RAFTER_PROTOTYPE_ID, section: template.rafterSection },
    supports: [template.wallPlate, ...template.intermediateSupports],
    ridge: template.ridge,
  };
}

export function assemblyFromHipTemplate(
  raw: HipRoofTemplateSpec,
): AssemblySpec {
  const template = hipRoofTemplateSchema.parse(raw);
  return assemblySpecSchema.parse(assemblyForTemplate(template));
}

export function hipTemplateFromAssembly(
  raw: AssemblySpec,
  layout: {
    id: string;
    buildingLengthMm: number;
    rafterSpacing: RafterSpacingSpec;
    hipRafterSection: TimberSection;
  },
): HipRoofTemplateSpec {
  const assembly = assemblySpecSchema.parse(raw);
  const wallPlate = assembly.supports.find(
    (item) => item.kind === 'wall-plate',
  )!;
  return hipRoofTemplateSchema.parse({
    id: layout.id,
    type: 'hip',
    buildingLengthMm: layout.buildingLengthMm,
    halfRunMm: assembly.roof.runMm,
    pitchDeg: assembly.roof.pitchDeg,
    eaveOverhangMm: assembly.roof.overhangMm,
    rafterSpacing: layout.rafterSpacing,
    rafterSection: assembly.member.section,
    hipRafterSection: layout.hipRafterSection,
    wallPlate,
    ridge: assembly.ridge,
    intermediateSupports: assembly.supports.filter(
      (item) => item.kind === 'purlin',
    ),
  });
}

export function resolveHipRoofTemplate(raw: HipRoofTemplateSpec) {
  const template = hipRoofTemplateSchema.parse(raw);
  const ridgeHeightMm =
    template.halfRunMm * Math.tan((template.pitchDeg * Math.PI) / 180);
  const ridgeLengthMm = template.buildingLengthMm - 2 * template.halfRunMm;
  const ridgeStart: Point3D = {
    x: 0,
    y: template.halfRunMm,
    z: ridgeHeightMm,
  };
  const ridgeEnd: Point3D = {
    x: 0,
    y: template.buildingLengthMm - template.halfRunMm,
    z: ridgeHeightMm,
  };
  const wallCorners = {
    'front-left': { x: -template.halfRunMm, y: 0, z: 0 },
    'front-right': { x: template.halfRunMm, y: 0, z: 0 },
    'rear-left': { x: -template.halfRunMm, y: template.buildingLengthMm, z: 0 },
    'rear-right': { x: template.halfRunMm, y: template.buildingLengthMm, z: 0 },
  } as const;
  const hipAxes = [
    {
      id: 'instance:hip:front-left',
      corner: 'front-left' as const,
      from: wallCorners['front-left'],
      to: ridgeStart,
    },
    {
      id: 'instance:hip:front-right',
      corner: 'front-right' as const,
      from: wallCorners['front-right'],
      to: ridgeStart,
    },
    {
      id: 'instance:hip:rear-left',
      corner: 'rear-left' as const,
      from: wallCorners['rear-left'],
      to: ridgeEnd,
    },
    {
      id: 'instance:hip:rear-right',
      corner: 'rear-right' as const,
      from: wallCorners['rear-right'],
      to: ridgeEnd,
    },
  ];
  const calculation = calculateAssembly(assemblyForTemplate(template));
  const rafterSpacing =
    ridgeLengthMm > 0
      ? resolveRafterSpacing(ridgeLengthMm, template.rafterSpacing)
      : undefined;
  const jackRafterSpacing = resolveRafterSpacing(
    template.halfRunMm,
    template.rafterSpacing,
  );
  const wallJoint = calculation.assembly.joints.find(
    (joint) => joint.supportId === template.wallPlate.id,
  );
  const jackRafters = createResolvedJackRafters(
    template,
    jackRafterSpacing.stations
      .slice(1, -1)
      .map((station) => station.alongBuildingMm),
    wallJoint
      ? {
          supportId: wallJoint.supportId,
          stationFromOuterEaveMm: wallJoint.stationMm,
          seatLengthMm: wallJoint.seatLengthMm,
          normalDepthMm: wallJoint.normalDepthMm,
          remainingDepthMm: wallJoint.remainingDepthMm,
        }
      : undefined,
  );
  const commonInstanceIds = [
    'instance:hip-common:front',
    'instance:hip-common:rear',
    ...(rafterSpacing?.stations.flatMap((_, index) => [
      `instance:hip-common-pair-${index + 1}:left`,
      `instance:hip-common-pair-${index + 1}:right`,
    ]) ?? ['instance:hip-common:left', 'instance:hip-common:right']),
  ];
  const hipRafter = calculateHipRafter({
    id: HIP_RAFTER_PROTOTYPE_ID,
    section: template.hipRafterSection,
    commonRunMm: template.halfRunMm,
    pitchDeg: template.pitchDeg,
    overhangMm: template.eaveOverhangMm,
    ridgeThicknessMm: template.ridge.thicknessMm,
  });
  const jackLengths = jackRafters.map(
    (jack) => jack.result.outerEaveToHipCenterLineLengthMm,
  );
  const memberPrototypes: ResolvedMemberPrototype[] = [
    {
      id: COMMON_RAFTER_PROTOTYPE_ID,
      code: 'K1',
      kind: 'common-rafter',
      section: template.rafterSection,
      instanceIds: commonInstanceIds,
      count: commonInstanceIds.length,
      lengthRangeMm: {
        min: calculation.plan.minimumStockLengthMm,
        max: calculation.plan.minimumStockLengthMm,
      },
      fabricationMode: 'shared',
    },
    {
      id: HIP_RAFTER_PROTOTYPE_ID,
      code: 'H1',
      kind: 'hip-rafter',
      section: template.hipRafterSection,
      instanceIds: hipAxes.map((axis) => axis.id),
      count: hipAxes.length,
      lengthRangeMm: {
        min: hipRafter.result.outerEaveToRidgeFaceMm,
        max: hipRafter.result.outerEaveToRidgeFaceMm,
      },
      fabricationMode: 'shared',
    },
    {
      id: JACK_RAFTER_PROTOTYPE_ID,
      code: 'J1',
      kind: 'jack-rafter',
      section: template.rafterSection,
      instanceIds: jackRafters.map((jack) => jack.spec.id),
      count: jackRafters.length,
      lengthRangeMm: {
        min: jackLengths.length ? Math.min(...jackLengths) : 0,
        max: jackLengths.length ? Math.max(...jackLengths) : 0,
      },
      fabricationMode: 'variable-by-instance',
    },
  ];
  return {
    template,
    ridgeHeightMm,
    ridgeLengthMm,
    ridgeStart,
    ridgeEnd,
    wallCorners,
    hipAxes,
    commonRafterRegion: {
      fromYmm: template.halfRunMm,
      toYmm: template.buildingLengthMm - template.halfRunMm,
      lengthMm: ridgeLengthMm,
    },
    rafterSpacing,
    jackRafterSpacing,
    calculation,
    hipRafter,
    jackRafters,
    memberPrototypes,
  };
}

function createResolvedJackRafters(
  template: HipRoofTemplateSpec,
  stationsFromCornerMm: number[],
  wallJoint: ResolvedJackRafterInstance['spec']['wallJoint'],
): ResolvedJackRafterInstance[] {
  const r = template.halfRunMm;
  const length = template.buildingLengthMm;
  const overhang = template.eaveOverhangMm;
  const slope = Math.tan((template.pitchDeg * Math.PI) / 180);
  const eaveZ = -overhang * slope;
  const create = (
    corner: HipCorner,
    roofPlane: JackRafterRoofPlane,
    ordinal: number,
    station: number,
    from: Point3D,
    to: Point3D,
  ): ResolvedJackRafterInstance => {
    const id = `instance:jack:${corner}:${roofPlane}:${ordinal}`;
    return {
      ...calculateJackRafter({
        id,
        prototypeId: JACK_RAFTER_PROTOTYPE_ID,
        section: template.rafterSection,
        roofPlane,
        hipCorner: corner,
        hipRafterInstanceId: `instance:hip:${corner}`,
        ordinalFromCorner: ordinal,
        stationFromHipCornerMm: station,
        commonRunMm: r,
        pitchDeg: template.pitchDeg,
        overhangMm: overhang,
        wallJoint,
        hasIntermediateSupports: template.intermediateSupports.length > 0,
      }),
      from,
      to,
    };
  };
  return stationsFromCornerMm.flatMap((station, index) => {
    const ordinal = index + 1;
    const z = station * slope;
    return [
      create(
        'front-left',
        'left',
        ordinal,
        station,
        { x: -r - overhang, y: station, z: eaveZ },
        { x: -r + station, y: station, z },
      ),
      create(
        'front-left',
        'front',
        ordinal,
        station,
        { x: -r + station, y: -overhang, z: eaveZ },
        { x: -r + station, y: station, z },
      ),
      create(
        'front-right',
        'right',
        ordinal,
        station,
        { x: r + overhang, y: station, z: eaveZ },
        { x: r - station, y: station, z },
      ),
      create(
        'front-right',
        'front',
        ordinal,
        station,
        { x: r - station, y: -overhang, z: eaveZ },
        { x: r - station, y: station, z },
      ),
      create(
        'rear-left',
        'left',
        ordinal,
        station,
        { x: -r - overhang, y: length - station, z: eaveZ },
        { x: -r + station, y: length - station, z },
      ),
      create(
        'rear-left',
        'rear',
        ordinal,
        station,
        { x: -r + station, y: length + overhang, z: eaveZ },
        { x: -r + station, y: length - station, z },
      ),
      create(
        'rear-right',
        'right',
        ordinal,
        station,
        { x: r + overhang, y: length - station, z: eaveZ },
        { x: r - station, y: length - station, z },
      ),
      create(
        'rear-right',
        'rear',
        ordinal,
        station,
        { x: r - station, y: length + overhang, z: eaveZ },
        { x: r - station, y: length - station, z },
      ),
    ];
  });
}

const wallSection = (template: HipRoofTemplateSpec) => ({
  widthMm: template.wallPlate.section.widthMm,
  depthMm: template.wallPlate.section.heightMm,
});

/** Derives one H1 prototype and its four physical hip placements in world XYZ. */
export function createHipRoofSkeleton(
  raw: HipRoofTemplateSpec,
): HipRoofSkeleton {
  return createHipRoofSkeletonFromResolved(resolveHipRoofTemplate(raw));
}

export function createHipRoofSkeletonFromResolved(
  resolved: ReturnType<typeof resolveHipRoofTemplate>,
): HipRoofSkeleton {
  const { template, ridgeHeightMm, ridgeLengthMm } = resolved;
  const r = template.halfRunMm;
  const length = template.buildingLengthMm;
  const overhang = template.eaveOverhangMm;
  const slope = Math.tan((template.pitchDeg * Math.PI) / 180);
  const eaveZ = -overhang * slope;
  const ridgeStart = resolved.ridgeStart;
  const ridgeEnd = resolved.ridgeEnd;
  const outerCorners = {
    'front-left': { x: -r - overhang, y: -overhang, z: eaveZ },
    'front-right': { x: r + overhang, y: -overhang, z: eaveZ },
    'rear-left': { x: -r - overhang, y: length + overhang, z: eaveZ },
    'rear-right': { x: r + overhang, y: length + overhang, z: eaveZ },
  } as const;
  const members: SkeletonMember3D[] = [
    {
      id: 'skeleton:wall-plate-left',
      prototypeId: template.wallPlate.id,
      selectionId: template.wallPlate.id,
      kind: 'wall-plate',
      from: { x: -r, y: 0, z: 0 },
      to: { x: -r, y: length, z: 0 },
      section: wallSection(template),
      side: 'left',
    },
    {
      id: 'skeleton:wall-plate-right',
      prototypeId: template.wallPlate.id,
      selectionId: template.wallPlate.id,
      kind: 'wall-plate',
      from: { x: r, y: 0, z: 0 },
      to: { x: r, y: length, z: 0 },
      section: wallSection(template),
      side: 'right',
    },
    {
      id: 'skeleton:wall-plate-front',
      prototypeId: template.wallPlate.id,
      selectionId: template.wallPlate.id,
      kind: 'wall-plate',
      from: { x: -r, y: 0, z: 0 },
      to: { x: r, y: 0, z: 0 },
      section: wallSection(template),
      side: 'front',
    },
    {
      id: 'skeleton:wall-plate-rear',
      prototypeId: template.wallPlate.id,
      selectionId: template.wallPlate.id,
      kind: 'wall-plate',
      from: { x: -r, y: length, z: 0 },
      to: { x: r, y: length, z: 0 },
      section: wallSection(template),
      side: 'rear',
    },
    ...(ridgeLengthMm > 0
      ? [
          {
            id: 'skeleton:ridge',
            prototypeId: template.ridge.id,
            selectionId: template.ridge.id,
            kind: 'ridge' as const,
            from: ridgeStart,
            to: ridgeEnd,
            section: {
              widthMm: Math.max(template.ridge.thicknessMm, 1),
              depthMm: template.ridge.depthMm ?? template.rafterSection.depthMm,
            },
            side: 'center' as const,
          },
        ]
      : []),
    ...resolved.hipAxes.map((axis) => ({
      id: axis.id,
      prototypeId: HIP_RAFTER_PROTOTYPE_ID,
      selectionId: axis.id,
      kind: 'hip-rafter' as const,
      from: outerCorners[axis.corner],
      to: axis.to,
      section: template.hipRafterSection,
      side: axis.corner,
    })),
    {
      id: 'instance:hip-common:front',
      prototypeId: COMMON_RAFTER_PROTOTYPE_ID,
      selectionId: 'instance:hip-common:front',
      kind: 'rafter',
      from: { x: 0, y: -overhang, z: eaveZ },
      to: ridgeStart,
      section: template.rafterSection,
      side: 'front',
      stationMm: 0,
    },
    {
      id: 'instance:hip-common:rear',
      prototypeId: COMMON_RAFTER_PROTOTYPE_ID,
      selectionId: 'instance:hip-common:rear',
      kind: 'rafter',
      from: { x: 0, y: length + overhang, z: eaveZ },
      to: ridgeEnd,
      section: template.rafterSection,
      side: 'rear',
      stationMm: length,
    },
    ...(ridgeLengthMm === 0
      ? [
          {
            id: 'instance:hip-common:left',
            prototypeId: COMMON_RAFTER_PROTOTYPE_ID,
            selectionId: 'instance:hip-common:left',
            kind: 'rafter' as const,
            from: { x: -r - overhang, y: r, z: eaveZ },
            to: ridgeStart,
            section: template.rafterSection,
            side: 'left' as const,
            stationMm: r,
          },
          {
            id: 'instance:hip-common:right',
            prototypeId: COMMON_RAFTER_PROTOTYPE_ID,
            selectionId: 'instance:hip-common:right',
            kind: 'rafter' as const,
            from: { x: r + overhang, y: r, z: eaveZ },
            to: ridgeStart,
            section: template.rafterSection,
            side: 'right' as const,
            stationMm: r,
          },
        ]
      : []),
    ...(resolved.rafterSpacing?.stations.flatMap((station, index) => {
      const y = r + station.alongBuildingMm;
      const baseId = `instance:hip-common-pair-${index + 1}`;
      return [
        {
          id: `${baseId}:left`,
          prototypeId: resolved.calculation.assembly.member.id,
          selectionId: `${baseId}:left`,
          kind: 'rafter' as const,
          from: { x: -r - overhang, y, z: eaveZ },
          to: { x: 0, y, z: ridgeHeightMm },
          section: template.rafterSection,
          side: 'left' as const,
          stationMm: y,
        },
        {
          id: `${baseId}:right`,
          prototypeId: resolved.calculation.assembly.member.id,
          selectionId: `${baseId}:right`,
          kind: 'rafter' as const,
          from: { x: r + overhang, y, z: eaveZ },
          to: { x: 0, y, z: ridgeHeightMm },
          section: template.rafterSection,
          side: 'right' as const,
          stationMm: y,
        },
      ];
    }) ?? []),
    ...resolved.jackRafters.map((jack) => ({
      id: jack.spec.id,
      prototypeId: jack.spec.prototypeId,
      selectionId: jack.spec.id,
      kind: 'jack-rafter' as const,
      from: jack.from,
      to: jack.to,
      section: jack.spec.section,
      side: jack.spec.roofPlane,
      stationMm: jack.spec.stationFromHipCornerMm,
    })),
    ...template.intermediateSupports.flatMap((support) => {
      const x = support.placement.xMm;
      const z = x * slope;
      const startY = x;
      const endY = length - x;
      const section = {
        widthMm: support.section.widthMm,
        depthMm: support.section.heightMm,
      };
      return [
        {
          id: `instance:${support.id.replace('support:', '')}:left`,
          prototypeId: support.id,
          selectionId: support.id,
          kind: 'purlin' as const,
          from: { x: -r + x, y: startY, z },
          to: { x: -r + x, y: endY, z },
          section,
          side: 'left' as const,
        },
        {
          id: `instance:${support.id.replace('support:', '')}:right`,
          prototypeId: support.id,
          selectionId: support.id,
          kind: 'purlin' as const,
          from: { x: r - x, y: startY, z },
          to: { x: r - x, y: endY, z },
          section,
          side: 'right' as const,
        },
      ];
    }),
  ];
  const frontApex = ridgeStart;
  const rearApex = ridgeEnd;
  return {
    ridgeHeightMm,
    ridgeLengthMm,
    members,
    guides: [
      {
        id: 'guide:roof-plane-left',
        kind: 'roof-plane',
        points:
          ridgeLengthMm > 0
            ? [
                outerCorners['front-left'],
                outerCorners['rear-left'],
                rearApex,
                frontApex,
              ]
            : [
                outerCorners['front-left'],
                outerCorners['rear-left'],
                frontApex,
              ],
      },
      {
        id: 'guide:roof-plane-right',
        kind: 'roof-plane',
        points:
          ridgeLengthMm > 0
            ? [
                outerCorners['front-right'],
                outerCorners['rear-right'],
                rearApex,
                frontApex,
              ]
            : [
                outerCorners['front-right'],
                outerCorners['rear-right'],
                frontApex,
              ],
      },
      {
        id: 'guide:roof-plane-front',
        kind: 'roof-plane',
        points: [
          outerCorners['front-left'],
          outerCorners['front-right'],
          frontApex,
        ],
      },
      {
        id: 'guide:roof-plane-rear',
        kind: 'roof-plane',
        points: [
          outerCorners['rear-left'],
          outerCorners['rear-right'],
          rearApex,
        ],
      },
    ],
  };
}
