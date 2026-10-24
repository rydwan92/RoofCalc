import { z } from 'zod';
import type {
  AssemblySpec,
  AsymmetricGableRoofTemplateSpec,
  ResolvedMemberPrototype,
  RoofSkeleton,
  SkeletonMember3D,
  SupportSpec,
} from '@cieslacalc/timber-model';
import {
  assemblySpecSchema,
  calculateAssembly,
  seatLength,
  supportSpecSchema,
} from './assembly';
import { rafterSpacingSchema, resolveRafterSpacing } from './gable-roof';

/**
 * VNext-9 asymmetric gable (docs/domain/ASYMMETRIC_GABLE.md): two planes of
 * different pitch, one ridge, both plates at one height. Each side is the
 * gable rafter of its own run and pitch, resolved by `calculateAssembly` —
 * no second solver. The ridge sits where both reference lines reach the
 * same height; the right seat keeps the heel heights equal so the rafter
 * tops meet in that ridge too.
 */
export const ASYMMETRIC_GABLE_TEMPLATE_ID = 'template:asymmetric-gable-1';
/** Opaque (ADR-007): the right rafter prototype and plate. */
export const RIGHT_RAFTER_ID = 'member:rafter-2';
export const RIGHT_WALL_PLATE_ID = 'support:wall-plate-right';

const rad = (deg: number) => (deg * Math.PI) / 180;
const positiveMm = z.number().finite().min(1).max(100000);
const pitchDeg = z.number().finite().min(1).max(80);

export interface AsymmetricGableGeometry {
  /** Outer face of the left plate to the ridge axis. */
  leftRunMm: number;
  /** Ridge axis to the outer face of the right plate. */
  rightRunMm: number;
  /** Ridge height above the plates' heel–seat corners. */
  ridgeHeightMm: number;
  /** Plumb height of the rafter top over each plate's outer face. */
  heelHeightMm: number;
  /** The left plate's seat and the right seat that matches its heel height. */
  leftSeatMm: number;
  rightSeatMm: number;
}

/** The geometry of a template as entered — no validation (§2). */
export function asymmetricGableGeometry(
  template: AsymmetricGableRoofTemplateSpec,
): AsymmetricGableGeometry {
  const tanLeft = Math.tan(rad(template.pitchDeg));
  const tanRight = Math.tan(rad(template.rightPitchDeg));
  const leftRunMm = (template.spanMm * tanRight) / (tanLeft + tanRight);
  const depth = template.rafterSection.depthMm;
  const leftSeatMm = seatLength(template.wallPlate, template.pitchDeg);
  const heelHeightMm =
    depth / Math.cos(rad(template.pitchDeg)) - leftSeatMm * tanLeft;
  return {
    leftRunMm,
    rightRunMm: template.spanMm - leftRunMm,
    ridgeHeightMm: leftRunMm * tanLeft,
    heelHeightMm,
    leftSeatMm,
    rightSeatMm:
      (depth / Math.cos(rad(template.rightPitchDeg)) - heelHeightMm) / tanRight,
  };
}

/** §2 refusals: a right rafter that cannot sit on its plate. */
export type AsymmetricGableSeatRefusal =
  'right_seat_not_positive' | 'right_seat_exceeds_plate';

/**
 * Why the right rafter has no seat (§2), or undefined when it has one. The
 * schema refuses with the same code; the Creator and the workbench name it
 * at the field the user changed.
 */
export function asymmetricGableSeatRefusal(
  template: AsymmetricGableRoofTemplateSpec,
): AsymmetricGableSeatRefusal | undefined {
  const { rightSeatMm } = asymmetricGableGeometry(template);
  if (!(rightSeatMm > 0)) return 'right_seat_not_positive';
  if (rightSeatMm > template.wallPlate.section.widthMm + 1e-8)
    return 'right_seat_exceeds_plate';
  return undefined;
}

const SEAT_REFUSALS: ReadonlySet<string> = new Set<AsymmetricGableSeatRefusal>([
  'right_seat_not_positive',
  'right_seat_exceeds_plate',
]);

/**
 * The seat refusal a failed parse carries, or undefined: an edit that goes
 * through the left assembly fails inside the schema, before a template
 * exists to ask.
 */
export function asymmetricGableSeatRefusalOf(
  cause: unknown,
): AsymmetricGableSeatRefusal | undefined {
  // Structural: the error may come from another package's zod instance.
  const issues = (cause as { issues?: unknown } | null)?.issues;
  if (!Array.isArray(issues)) return undefined;
  return (issues as { message?: unknown }[])
    .map((issue) => issue.message)
    .find((message): message is AsymmetricGableSeatRefusal =>
      SEAT_REFUSALS.has(String(message)),
    );
}

/** The two rafter cross sections, each the gable solver's input. */
export function asymmetricGableAssemblies(
  template: AsymmetricGableRoofTemplateSpec,
): { left: AssemblySpec; right: AssemblySpec } {
  const geometry = asymmetricGableGeometry(template);
  const rightPlate: SupportSpec = {
    ...template.wallPlate,
    id: RIGHT_WALL_PLATE_ID,
    joint: {
      kind: 'seat-notch',
      control: 'seat',
      valueMm: geometry.rightSeatMm,
    },
  };
  return {
    left: {
      roof: {
        runMm: geometry.leftRunMm,
        pitchDeg: template.pitchDeg,
        overhangMm: template.eaveOverhangMm,
      },
      member: { id: 'member:rafter-1', section: template.rafterSection },
      supports: [template.wallPlate],
      ridge: template.ridge,
    },
    right: {
      roof: {
        runMm: geometry.rightRunMm,
        pitchDeg: template.rightPitchDeg,
        overhangMm: template.eaveOverhangMm,
      },
      member: { id: RIGHT_RAFTER_ID, section: template.rafterSection },
      supports: [rightPlate],
      ridge: template.ridge,
    },
  };
}

export const asymmetricGableRoofTemplateSchema: z.ZodType<AsymmetricGableRoofTemplateSpec> =
  z
    .object({
      id: z.string().regex(/^template:[a-z][a-z0-9:-]*$/),
      type: z.literal('asymmetric-gable'),
      buildingLengthMm: positiveMm,
      spanMm: positiveMm,
      pitchDeg,
      rightPitchDeg: pitchDeg,
      eaveOverhangMm: z.number().finite().min(0).max(10000),
      rafterSpacing: rafterSpacingSchema,
      rafterSection: z.object({
        widthMm: z.number().finite().min(1).max(1000),
        depthMm: z.number().finite().min(1).max(2000),
      }),
      wallPlate: supportSpecSchema,
      ridge: z.object({
        id: z.string().regex(/^[a-z][a-z0-9:-]*$/),
        thicknessMm: z.number().finite().min(0).max(1000),
        depthMm: z.number().finite().min(1).max(2000).optional(),
        connection: z
          .enum(['ridge-board', 'direct-meeting', 'half-lap'])
          .optional(),
      }),
    })
    .superRefine((template, ctx) => {
      const issue = (path: (string | number)[], message: string) =>
        ctx.addIssue({ code: 'custom', path, message });
      if (template.wallPlate.kind !== 'wall-plate')
        issue(['wallPlate', 'kind'], 'wall_plate_required');
      if (template.wallPlate.placement.xMm !== 0)
        issue(['wallPlate', 'placement', 'xMm'], 'wall_origin');
      const seatPath = ['wallPlate', 'joint', 'valueMm'];
      // §2: a heel height the shallow side cannot reach, or a seat wider
      // than the plate, has no right rafter.
      const refusal = asymmetricGableSeatRefusal(template);
      if (refusal) issue(seatPath, refusal);
      else {
        // Each side obeys every gable rafter rule (notch, span, ridge face).
        const { left, right } = asymmetricGableAssemblies(template);
        for (const [side, assembly] of [
          ['left', left],
          ['right', right],
        ] as const) {
          const result = assemblySpecSchema.safeParse(assembly);
          if (result.success) continue;
          for (const found of result.error.issues)
            issue(
              found.path[0] === 'roof' && found.path[1] === 'runMm'
                ? ['spanMm']
                : side === 'left'
                  ? ['wallPlate', ...found.path.slice(2)]
                  : seatPath,
              found.message,
            );
        }
      }
    }) as z.ZodType<AsymmetricGableRoofTemplateSpec>;

export function resolveAsymmetricGableTemplate(
  raw: AsymmetricGableRoofTemplateSpec,
) {
  const template = asymmetricGableRoofTemplateSchema.parse(raw);
  const geometry = asymmetricGableGeometry(template);
  const { left, right } = asymmetricGableAssemblies(template);
  const calculation = calculateAssembly(left);
  const rightCalculation = calculateAssembly(right);
  const rafterSpacing = resolveRafterSpacing(
    template.buildingLengthMm,
    template.rafterSpacing,
  );
  const prototype = (
    id: string,
    code: 'K1' | 'K2',
    side: 'left' | 'right',
    stockMm: number,
  ): ResolvedMemberPrototype => {
    const instanceIds = rafterSpacing.stations.map(
      (station) => `${station.id}:${side}`,
    );
    return {
      id,
      code,
      kind: 'common-rafter',
      section: template.rafterSection,
      instanceIds,
      count: instanceIds.length,
      lengthRangeMm: { min: stockMm, max: stockMm },
      fabricationMode: 'shared',
    };
  };
  return {
    template,
    ridgeHeightMm: geometry.ridgeHeightMm,
    rafterSpacing,
    calculation,
    rightCalculation,
    memberPrototypes: [
      prototype(
        calculation.assembly.member.id,
        'K1',
        'left',
        calculation.plan.minimumStockLengthMm,
      ),
      prototype(
        rightCalculation.assembly.member.id,
        'K2',
        'right',
        rightCalculation.plan.minimumStockLengthMm,
      ),
    ],
    asymmetric: geometry,
  };
}

export type ResolvedAsymmetricGableTemplate = ReturnType<
  typeof resolveAsymmetricGableTemplate
>;

/**
 * Explanatory members in world XYZ, as the gable skeleton: plates at their
 * outer faces, the ridge on its axis, rafters on each side's reference
 * line from the eave to the ridge.
 */
export function createAsymmetricGableRoofSkeletonFromResolved(
  resolved: ResolvedAsymmetricGableTemplate,
): RoofSkeleton {
  const { template, asymmetric, rafterSpacing } = resolved;
  const length = template.buildingLengthMm;
  const e = template.eaveOverhangMm;
  const plate = (
    id: string,
    prototypeId: string,
    x: number,
    side: 'left' | 'right',
  ): SkeletonMember3D => ({
    id,
    prototypeId,
    selectionId: prototypeId,
    kind: 'wall-plate',
    from: { x, y: 0, z: 0 },
    to: { x, y: length, z: 0 },
    section: {
      widthMm: template.wallPlate.section.widthMm,
      depthMm: template.wallPlate.section.heightMm,
    },
    side,
  });
  const ridge = asymmetric.ridgeHeightMm;
  const rafters = (side: 'left' | 'right'): SkeletonMember3D[] => {
    const left = side === 'left';
    const run = left ? asymmetric.leftRunMm : asymmetric.rightRunMm;
    const slope = Math.tan(
      rad(left ? template.pitchDeg : template.rightPitchDeg),
    );
    const prototypeId = (
      left ? resolved.calculation : resolved.rightCalculation
    ).assembly.member.id;
    return rafterSpacing.stations.map((station) => ({
      id: `${station.id}:${side}`,
      prototypeId,
      selectionId: `${station.id}:${side}`,
      kind: 'rafter' as const,
      from: {
        x: left ? -(run + e) : run + e,
        y: station.alongBuildingMm,
        z: -e * slope,
      },
      to: { x: 0, y: station.alongBuildingMm, z: ridge },
      section: template.rafterSection,
      side,
      stationMm: station.alongBuildingMm,
      ...(left ? {} : { familyCode: 'K2' }),
    }));
  };
  return {
    ridgeHeightMm: ridge,
    members: [
      plate(
        'skeleton:wall-plate-left',
        template.wallPlate.id,
        -asymmetric.leftRunMm,
        'left',
      ),
      plate(
        'skeleton:wall-plate-right',
        RIGHT_WALL_PLATE_ID,
        asymmetric.rightRunMm,
        'right',
      ),
      {
        id: 'skeleton:ridge',
        prototypeId: template.ridge.id,
        selectionId: template.ridge.id,
        kind: 'ridge',
        from: { x: 0, y: 0, z: ridge },
        to: { x: 0, y: length, z: ridge },
        section: {
          widthMm: Math.max(template.ridge.thicknessMm, 1),
          depthMm: template.ridge.depthMm ?? template.rafterSection.depthMm,
        },
        side: 'center',
      },
      ...rafters('left'),
      ...rafters('right'),
    ],
  };
}

/** The left rafter cross section the workbench edits. */
export function assemblyFromAsymmetricGableTemplate(
  template: AsymmetricGableRoofTemplateSpec,
): AssemblySpec {
  return asymmetricGableAssemblies(template).left;
}

/**
 * An edited left cross section back into the template. The right pitch is
 * kept, so a new left run moves the ridge: S = x_L · (1 + tan α / tan β).
 */
export function asymmetricGableTemplateFromAssembly(
  assembly: AssemblySpec,
  current: AsymmetricGableRoofTemplateSpec,
): AsymmetricGableRoofTemplateSpec {
  const wallPlate = assembly.supports.find(
    (support) => support.kind === 'wall-plate',
  );
  if (!wallPlate) throw new RangeError('wall_plate_required');
  const leftRun = assembly.roof.runMm;
  // The span is the building: a new left pitch moves the ridge and keeps
  // it. Only a new left run (a drag of K1's span) moves the right plate.
  const runChanged =
    Math.abs(leftRun - asymmetricGableGeometry(current).leftRunMm) > 1e-6;
  return asymmetricGableRoofTemplateSchema.parse({
    ...current,
    spanMm: runChanged
      ? leftRun *
        (1 +
          Math.tan(rad(assembly.roof.pitchDeg)) /
            Math.tan(rad(current.rightPitchDeg)))
      : current.spanMm,
    pitchDeg: assembly.roof.pitchDeg,
    eaveOverhangMm: assembly.roof.overhangMm,
    rafterSection: assembly.member.section,
    wallPlate,
    ridge: assembly.ridge,
  });
}
