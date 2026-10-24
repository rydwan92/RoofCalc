import { z } from 'zod';
import type {
  AssemblySpec,
  MonoPitchRoofTemplateSpec,
  RoofSkeleton,
  SupportSpec,
} from '@cieslacalc/timber-model';
import { seatLength } from './assembly';
import { rafterSpacingSchema } from './gable-roof';
import {
  createMonoPitchSkeleton,
  monoPitchFramingSpecSchema,
  monoPitchRafterAssembly,
  resolveMonoPitchFraming,
  type MonoPitchFraming,
  type MonoPitchFramingSpec,
} from './mono-pitch-framing';
import type { MonoPitchRoofSpec } from './mono-pitch-roof';

/**
 * VNext-8 (ADR-016): the mono-pitch roof as a project template. Nothing is
 * computed here: the template is translated to `MonoPitchFramingSpec` and
 * resolved by `resolveMonoPitchFraming`, the same solver the quick
 * mono-pitch workspace uses — so a saved project and the workspace can
 * never disagree.
 */
export const MONO_PITCH_TEMPLATE_ID = 'template:mono-pitch-1';

const mm = (min: number, max: number) => z.number().finite().min(min).max(max);
const supportSchema = z.object({
  kind: z.enum(['wall-plate', 'ledger']),
  widthMm: mm(1, 2000),
  heightMm: mm(1, 2000),
  seatMm: mm(0.001, 2000),
});

/** The framing input of a template (the inverse of `monoPitchTemplateFromFraming`). */
export function monoPitchFramingFromTemplate(
  template: MonoPitchRoofTemplateSpec,
): MonoPitchFramingSpec {
  return {
    roof: monoPitchSurfaceFromTemplate(template),
    rafter: {
      section: template.rafterSection,
      spacing: template.rafterSpacing,
    },
    lowSupport: template.lowSupport,
    highSupport: template.highSupport,
    ...(template.intermediateSupports.length
      ? { intermediateSupports: template.intermediateSupports }
      : {}),
  };
}

/** The surface input of a template. */
export function monoPitchSurfaceFromTemplate(
  template: MonoPitchRoofTemplateSpec,
): MonoPitchRoofSpec {
  return {
    type: 'mono-pitch',
    id: template.id,
    buildingLengthMm: template.buildingLengthMm,
    runMm: template.runMm,
    pitchDeg: template.pitchDeg,
    lowEaveOverhangMm: template.eaveOverhangMm,
    topEdge: template.topEdge,
    highOverhangMm: template.highOverhangMm,
    vergeOverhangMm: template.vergeOverhangMm,
  };
}

/** A framing input as a template — e.g. the quick workspace saved as a project. */
export function monoPitchTemplateFromFraming(
  spec: MonoPitchFramingSpec,
  id: string = MONO_PITCH_TEMPLATE_ID,
): MonoPitchRoofTemplateSpec {
  return {
    id,
    type: 'mono-pitch',
    buildingLengthMm: spec.roof.buildingLengthMm,
    runMm: spec.roof.runMm,
    pitchDeg: spec.roof.pitchDeg,
    eaveOverhangMm: spec.roof.lowEaveOverhangMm,
    topEdge: spec.roof.topEdge,
    highOverhangMm: spec.roof.highOverhangMm,
    vergeOverhangMm: spec.roof.vergeOverhangMm,
    rafterSpacing: spec.rafter.spacing,
    rafterSection: spec.rafter.section,
    lowSupport: spec.lowSupport,
    highSupport: spec.highSupport,
    intermediateSupports: spec.intermediateSupports ?? [],
  };
}

/** Where a framing rule's issue belongs on the template. */
function templatePath(
  path: readonly (string | number)[],
): (string | number)[] | undefined {
  const [head, ...rest] = path;
  if (head === 'roof')
    return rest[0] === 'lowEaveOverhangMm' ? ['eaveOverhangMm'] : rest;
  if (head === 'rafter')
    return rest[0] === 'section'
      ? ['rafterSection', ...rest.slice(1)]
      : ['rafterSpacing', ...rest.slice(1)];
  return head === undefined ? undefined : [head, ...rest];
}

export const monoPitchRoofTemplateSchema: z.ZodType<MonoPitchRoofTemplateSpec> =
  z
    .object({
      id: z.string().regex(/^template:[a-z][a-z0-9:-]*$/),
      type: z.literal('mono-pitch'),
      buildingLengthMm: mm(1, 100000),
      runMm: mm(1, 100000),
      pitchDeg: mm(1, 80),
      eaveOverhangMm: mm(0, 10000),
      topEdge: z.enum(['free', 'abutment']),
      highOverhangMm: mm(0, 10000),
      vergeOverhangMm: mm(0, 10000),
      rafterSpacing: rafterSpacingSchema,
      rafterSection: z.object({ widthMm: mm(1, 1000), depthMm: mm(1, 2000) }),
      lowSupport: supportSchema,
      highSupport: supportSchema,
      intermediateSupports: z
        .array(
          z.object({
            positionMm: mm(1, 100000),
            widthMm: mm(1, 2000),
            heightMm: mm(1, 2000),
            seatMm: mm(0.001, 2000),
          }),
        )
        .max(4),
    })
    .superRefine((template, ctx) => {
      // The framing rules (seats, overlaps, ledger ↔ abutment) are stated
      // once, on the framing spec; ranges are already checked above.
      const result = monoPitchFramingSpecSchema.safeParse(
        monoPitchFramingFromTemplate(template),
      );
      if (result.success) return;
      for (const issue of result.error.issues) {
        const path = templatePath(issue.path);
        if (issue.code === 'custom' && path)
          ctx.addIssue({ code: 'custom', path, message: issue.message });
      }
    }) as z.ZodType<MonoPitchRoofTemplateSpec>;

export interface ResolvedMonoPitchRoofTemplate {
  template: MonoPitchRoofTemplateSpec;
  rafterSpacing: MonoPitchFraming['rafterSpacing'];
  calculation: MonoPitchFraming['calculation'];
  memberPrototypes: MonoPitchFraming['memberPrototypes'];
  /** The whole framing result: plates, purlins, surface, scope. */
  monoPitch: MonoPitchFraming;
}

export function resolveMonoPitchRoofTemplate(
  raw: MonoPitchRoofTemplateSpec,
): ResolvedMonoPitchRoofTemplate {
  const template = monoPitchRoofTemplateSchema.parse(raw);
  const monoPitch = resolveMonoPitchFraming(
    monoPitchFramingFromTemplate(template),
  );
  return {
    template,
    rafterSpacing: monoPitch.rafterSpacing,
    calculation: monoPitch.calculation,
    memberPrototypes: monoPitch.memberPrototypes,
    monoPitch,
  };
}

export function createMonoPitchRoofSkeletonFromResolved(
  resolved: ResolvedMonoPitchRoofTemplate,
): RoofSkeleton {
  return createMonoPitchSkeleton(resolved.monoPitch);
}

/** The rafter cross section the workbench edits, as for the gable. */
export function assemblyFromMonoPitchTemplate(
  template: MonoPitchRoofTemplateSpec,
): AssemblySpec {
  return monoPitchRafterAssembly(monoPitchFramingFromTemplate(template))
    .assembly;
}

/**
 * An edited rafter cross section back into the template. Supports are read
 * by position: the lowest is the low plate (x = 0 in the frame), the
 * highest the high support, those between the purlins. A low plate moved
 * along the span moves the frame with it, so the eave and every position
 * stay measured from its outer face.
 */
export function monoPitchTemplateFromAssembly(
  assembly: AssemblySpec,
  current: MonoPitchRoofTemplateSpec,
): MonoPitchRoofTemplateSpec {
  const pitch = assembly.roof.pitchDeg;
  const supports = [...assembly.supports].sort(
    (a, b) => a.placement.xMm - b.placement.xMm,
  );
  const low = supports[0];
  const high = supports.at(-1);
  if (!low || !high || low === high)
    throw new RangeError('mono_pitch_needs_two_supports');
  const origin = low.placement.xMm;
  const runMm = high.placement.xMm + high.section.widthMm - origin;
  const bearing = (support: SupportSpec) => ({
    widthMm: support.section.widthMm,
    heightMm: support.section.heightMm,
    seatMm: seatLength(support, pitch),
  });
  return monoPitchRoofTemplateSchema.parse({
    ...current,
    runMm,
    pitchDeg: pitch,
    eaveOverhangMm: assembly.roof.overhangMm + origin,
    highOverhangMm:
      current.topEdge === 'abutment'
        ? 0
        : Math.max(0, assembly.roof.runMm - origin - runMm),
    rafterSection: assembly.member.section,
    lowSupport: { kind: 'wall-plate', ...bearing(low) },
    highSupport: { kind: current.highSupport.kind, ...bearing(high) },
    intermediateSupports: supports.slice(1, -1).map((purlin) => ({
      positionMm: purlin.placement.xMm - origin,
      ...bearing(purlin),
    })),
  });
}
