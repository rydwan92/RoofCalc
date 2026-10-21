import { z } from 'zod';
import {
  monoPitchRoofSpecSchema,
  type MonoPitchRoofSpec,
} from '@cieslacalc/roof-math';
import {
  roofProjectDocumentV1Schema,
  type RoofProjectDocumentV1,
} from './project-document';

/**
 * ADR-015 `RoofProjectDocumentV2` — DESIGNED AND TESTED, NOT READ OR WRITTEN
 * BY THE APPLICATION (VNext-7A). Turning V2 on is a separate, explicit gate
 * once covering, quantities and documents consume the roof graph; until
 * then `tools/architecture/layering.test.ts` keeps it out of `apps/`.
 *
 * A V1 document becomes exactly one structure with the identity transform,
 * its local content byte-identical; references that leave a structure will
 * be `{ structureId, localId }` pairs, never concatenated strings (ADR-007).
 */

/** The single roof of a V1 project. Opaque (ADR-007). */
export const PROJECT_ROOF_STRUCTURE_ID = 'structure:roof';

export interface StructureTransformV2 {
  /** World position of the structure's local solver origin, mm. */
  translationMm: { x: number; y: number; z: number };
  rotationAboutVerticalDeg: number;
}

interface StructureBaseV2 {
  id: string;
  name?: string;
  transform: StructureTransformV2;
}

/** Today's gable/hip roof with everything a V1 project holds for it. */
export interface TemplateRoofStructureV2 extends StructureBaseV2 {
  kind: 'template-roof';
  project: RoofProjectDocumentV1['project'];
}

/** VNext-7A: surface geometry only (docs/domain/MONO_PITCH_ROOF.md). */
export interface MonoPitchStructureV2 extends StructureBaseV2 {
  kind: 'mono-pitch';
  geometry: MonoPitchRoofSpec;
}

export type RoofStructureDocumentV2 =
  TemplateRoofStructureV2 | MonoPitchStructureV2;

export interface RoofProjectDocumentV2 {
  schemaVersion: 2;
  structures: RoofStructureDocumentV2[];
  /** Junctions between structures: none are modelled yet (VNext-9). */
  connections: never[];
}

export const IDENTITY_STRUCTURE_TRANSFORM: StructureTransformV2 = {
  translationMm: { x: 0, y: 0, z: 0 },
  rotationAboutVerticalDeg: 0,
};

const finite = z.number().finite();
const transformSchema: z.ZodType<StructureTransformV2> = z.object({
  translationMm: z.object({ x: finite, y: finite, z: finite }),
  rotationAboutVerticalDeg: finite.min(-360).max(360),
});
const structureBase = {
  id: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  transform: transformSchema,
};

const templateRoofStructureSchema = z
  .object({
    ...structureBase,
    kind: z.literal('template-roof'),
    project: z.unknown(),
  })
  .transform((structure, ctx): TemplateRoofStructureV2 => {
    // The local content is exactly a V1 project, read by the V1 reader.
    const local = roofProjectDocumentV1Schema.safeParse({
      schemaVersion: 1,
      project: structure.project,
    });
    if (!local.success) {
      for (const issue of local.error.issues)
        ctx.addIssue({
          ...issue,
          path: ['project', ...issue.path.slice(1)],
        } as z.IssueData);
      return z.NEVER;
    }
    return { ...structure, project: local.data.project };
  });

const monoPitchStructureSchema = z.object({
  ...structureBase,
  kind: z.literal('mono-pitch'),
  geometry: monoPitchRoofSpecSchema,
});

export const roofProjectDocumentV2Schema: z.ZodType<
  RoofProjectDocumentV2,
  z.ZodTypeDef,
  unknown
> = z
  .object({
    schemaVersion: z.literal(2),
    structures: z
      .array(z.union([templateRoofStructureSchema, monoPitchStructureSchema]))
      .min(1),
    connections: z.array(z.never()).max(0),
  })
  .superRefine((document, ctx) => {
    const seen = new Set<string>();
    document.structures.forEach((structure, index) => {
      if (seen.has(structure.id))
        ctx.addIssue({
          code: 'custom',
          path: ['structures', index, 'id'],
          message: 'duplicate_structure_id',
        });
      seen.add(structure.id);
    });
  }) as z.ZodType<RoofProjectDocumentV2, z.ZodTypeDef, unknown>;

/** V1 → V2: one structure, identity transform, content unchanged. */
export function roofProjectDocumentV2FromV1(
  document: RoofProjectDocumentV1,
): RoofProjectDocumentV2 {
  return {
    schemaVersion: 2,
    structures: [
      {
        id: PROJECT_ROOF_STRUCTURE_ID,
        transform: structuredClone(IDENTITY_STRUCTURE_TRANSFORM),
        kind: 'template-roof',
        project: structuredClone(document.project),
      },
    ],
    connections: [],
  };
}

export type RoofProjectDocumentV1FromV2Result =
  | { ok: true; document: RoofProjectDocumentV1 }
  | {
      ok: false;
      reason:
        | 'multiple-structures'
        | 'not-a-template-roof'
        | 'transformed'
        | 'connections';
    };

/**
 * V2 → V1, only when nothing would be lost: one gable/hip structure in its
 * own frame and no connections. Anything else stays V2-only.
 */
export function roofProjectDocumentV1FromV2(
  document: RoofProjectDocumentV2,
): RoofProjectDocumentV1FromV2Result {
  if (document.connections.length) return { ok: false, reason: 'connections' };
  if (document.structures.length !== 1)
    return { ok: false, reason: 'multiple-structures' };
  const [structure] = document.structures;
  if (structure!.kind !== 'template-roof')
    return { ok: false, reason: 'not-a-template-roof' };
  const { translationMm, rotationAboutVerticalDeg } = structure!.transform;
  if (
    translationMm.x !== 0 ||
    translationMm.y !== 0 ||
    translationMm.z !== 0 ||
    rotationAboutVerticalDeg % 360 !== 0
  )
    return { ok: false, reason: 'transformed' };
  return {
    ok: true,
    document: {
      schemaVersion: 1,
      project: structuredClone(structure!.project),
    },
  };
}
