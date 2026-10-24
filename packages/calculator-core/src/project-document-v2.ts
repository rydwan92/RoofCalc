import { z } from 'zod';
import { roofTemplateFrameMm } from '@cieslacalc/roof-math';
import {
  roofProjectDocumentV1Schema,
  type RoofProjectDocumentV1,
} from './project-document';

/**
 * `RoofProjectDocumentV2` — a project of several roof structures (ADR-008,
 * ADR-015; written since VNext-10, ADR-017). Each structure's content is
 * exactly a V1 project, placed on the site by a rigid transform; the
 * workbench edits one structure at a time through the V1 pipeline.
 *
 * A V1 document becomes exactly one structure with the identity transform,
 * its local content byte-identical; references that leave a structure are
 * `{ structureId, localId }` pairs, never concatenated strings (ADR-007).
 */

/** The roof a V1 project brings. Opaque (ADR-007). */
export const PROJECT_ROOF_STRUCTURE_ID = 'structure:roof';

export interface StructureTransformV2 {
  /** World position of the structure's local solver origin, mm. */
  translationMm: { x: number; y: number; z: number };
  rotationAboutVerticalDeg: number;
}

/**
 * One roof structure: any family (ADR-016) with everything a V1 project
 * holds for it. The VNext-7A `mono-pitch` geometry kind is gone — it was
 * never persisted, and mono-pitch is a template variant (ADR-017).
 */
export interface TemplateRoofStructureV2 {
  id: string;
  name?: string;
  transform: StructureTransformV2;
  kind: 'template-roof';
  project: RoofProjectDocumentV1['project'];
}

export type RoofStructureDocumentV2 = TemplateRoofStructureV2;

export interface RoofProjectDocumentV2 {
  schemaVersion: 2;
  structures: RoofStructureDocumentV2[];
  /** Junctions between structures: none are modelled yet (ADR-017 §6). */
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

const templateRoofStructureSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(200).optional(),
    transform: transformSchema,
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

export const roofProjectDocumentV2Schema: z.ZodType<
  RoofProjectDocumentV2,
  z.ZodTypeDef,
  unknown
> = z
  .object({
    schemaVersion: z.literal(2),
    structures: z.array(templateRoofStructureSchema).min(1),
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

/** Canonical text of a V2 document: what is saved and compared. */
export function serializeRoofProjectDocumentV2(
  document: RoofProjectDocumentV2,
): string {
  return JSON.stringify(roofProjectDocumentV2Schema.parse(document));
}

/** V1 → V2: one structure, identity transform, content unchanged. */
export function roofProjectDocumentV2FromV1(
  document: RoofProjectDocumentV1,
  name?: string,
): RoofProjectDocumentV2 {
  return {
    schemaVersion: 2,
    structures: [
      {
        id: PROJECT_ROOF_STRUCTURE_ID,
        ...(name ? { name } : {}),
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
      reason: 'multiple-structures' | 'transformed' | 'connections';
    };

/**
 * V2 → V1, only when nothing would be lost: one structure in its own frame
 * and no connections. Anything else stays V2. A structure name is a V2
 * label; a project of one roof is named by its record.
 */
export function roofProjectDocumentV1FromV2(
  document: RoofProjectDocumentV2,
): RoofProjectDocumentV1FromV2Result {
  if (document.connections.length) return { ok: false, reason: 'connections' };
  if (document.structures.length !== 1)
    return { ok: false, reason: 'multiple-structures' };
  const [structure] = document.structures;
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

/* ------------------------------------------------------------------------ */
/* VNext-10: pure edits of a project of structures (ADR-017). Each returns   */
/* a new document; none mutates its input, none parses an ID.               */
/* ------------------------------------------------------------------------ */

export function roofStructure(
  document: RoofProjectDocumentV2,
  id: string,
): RoofStructureDocumentV2 | undefined {
  return document.structures.find((structure) => structure.id === id);
}

function requireStructure(document: RoofProjectDocumentV2, id: string) {
  if (!roofStructure(document, id))
    throw new RangeError('unknown_roof_structure');
}

function editStructure(
  document: RoofProjectDocumentV2,
  id: string,
  edit: (structure: RoofStructureDocumentV2) => RoofStructureDocumentV2,
): RoofProjectDocumentV2 {
  requireStructure(document, id);
  return {
    ...document,
    structures: document.structures.map((structure) =>
      structure.id === id ? edit(structure) : structure,
    ),
  };
}

/** A fresh opaque ID: generated, never read back for meaning. */
export function nextStructureId(document: RoofProjectDocumentV2): string {
  const taken = new Set(document.structures.map((structure) => structure.id));
  let number = document.structures.length + 1;
  while (taken.has(`structure:${number}`)) number += 1;
  return `structure:${number}`;
}

/**
 * A structure's building outline on the site, as plan corners: the local
 * frame spans the roof family's wall-plate faces across x and the building
 * length along y, then the transform rotates and moves it.
 */
export function roofStructureFootprint(
  structure: Pick<RoofStructureDocumentV2, 'project' | 'transform'>,
): { x: number; y: number }[] {
  const roof = structure.project.roof;
  const { leftMm, rightMm } = roofTemplateFrameMm(roof);
  const angle = (structure.transform.rotationAboutVerticalDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const { x: tx, y: ty } = structure.transform.translationMm;
  return [
    { x: leftMm, y: 0 },
    { x: rightMm, y: 0 },
    { x: rightMm, y: roof.buildingLengthMm },
    { x: leftMm, y: roof.buildingLengthMm },
  ].map((point) => ({
    x: tx + point.x * cos - point.y * sin,
    y: ty + point.x * sin + point.y * cos,
  }));
}

/** Clear space between a new structure and the ones already placed. */
export const STRUCTURE_PLACEMENT_GAP_MM = 3000;

/**
 * Where a new structure goes by default: beside the others across x, the
 * gap clear between building outlines, aligned at y = 0. The user moves it
 * with exact inputs afterwards.
 */
export function defaultStructureTransform(
  document: RoofProjectDocumentV2,
  project: RoofProjectDocumentV1['project'],
): StructureTransformV2 {
  const right = Math.max(
    ...document.structures.flatMap((structure) =>
      roofStructureFootprint(structure).map((point) => point.x),
    ),
  );
  const { leftMm } = roofTemplateFrameMm(project.roof);
  // The new corner on a whole 10 cm, never closer than the gap.
  const corner = Math.ceil((right + STRUCTURE_PLACEMENT_GAP_MM) / 100) * 100;
  return {
    translationMm: { x: corner - leftMm, y: 0, z: 0 },
    rotationAboutVerticalDeg: 0,
  };
}

export function addRoofStructure(
  document: RoofProjectDocumentV2,
  input: {
    project: RoofProjectDocumentV1['project'];
    name?: string;
    transform?: StructureTransformV2;
  },
): { document: RoofProjectDocumentV2; structureId: string } {
  const structureId = nextStructureId(document);
  return {
    structureId,
    document: {
      ...document,
      structures: [
        ...document.structures,
        {
          id: structureId,
          ...(input.name ? { name: input.name } : {}),
          transform: structuredClone(
            input.transform ??
              defaultStructureTransform(document, input.project),
          ),
          kind: 'template-roof',
          project: structuredClone(input.project),
        },
      ],
    },
  };
}

/** The workbench's edited V1 document written back into its structure. */
export function withRoofStructureProject(
  document: RoofProjectDocumentV2,
  id: string,
  local: RoofProjectDocumentV1,
): RoofProjectDocumentV2 {
  return editStructure(document, id, (structure) => ({
    ...structure,
    project: structuredClone(local.project),
  }));
}

/** A structure's content as the V1 document the workbench edits. */
export function roofStructureDocument(
  document: RoofProjectDocumentV2,
  id: string,
): RoofProjectDocumentV1 {
  const structure = roofStructure(document, id);
  if (!structure) throw new RangeError('unknown_roof_structure');
  return { schemaVersion: 1, project: structuredClone(structure.project) };
}

export function renameRoofStructure(
  document: RoofProjectDocumentV2,
  id: string,
  name: string,
): RoofProjectDocumentV2 {
  const trimmed = name.trim();
  return editStructure(document, id, (structure) => {
    const next = { ...structure };
    delete next.name;
    return trimmed ? { ...next, name: trimmed.slice(0, 200) } : next;
  });
}

export function moveRoofStructure(
  document: RoofProjectDocumentV2,
  id: string,
  transform: StructureTransformV2,
): RoofProjectDocumentV2 {
  const parsed = transformSchema.parse(transform);
  return editStructure(document, id, (structure) => ({
    ...structure,
    transform: structuredClone(parsed),
  }));
}

/** Removes one structure; a project always keeps at least one. */
export function removeRoofStructure(
  document: RoofProjectDocumentV2,
  id: string,
): RoofProjectDocumentV2 {
  requireStructure(document, id);
  if (document.structures.length === 1)
    throw new RangeError('last_roof_structure');
  return {
    ...document,
    structures: document.structures.filter((structure) => structure.id !== id),
  };
}

/**
 * VNext-10: a structure placed by its building corner — the outline corner
 * at the local frame's left wall face and y = 0 — so a user never needs a
 * family's solver origin (ridge axis, low plate face…).
 */
export interface StructureCornerPlacement {
  cornerMm: { x: number; y: number };
  /** Plate level above the site datum, mm. */
  elevationMm: number;
  rotationAboutVerticalDeg: number;
}

export function structureCornerPlacement(
  structure: Pick<RoofStructureDocumentV2, 'project' | 'transform'>,
): StructureCornerPlacement {
  const [corner] = roofStructureFootprint(structure);
  return {
    cornerMm: { x: corner!.x, y: corner!.y },
    elevationMm: structure.transform.translationMm.z,
    rotationAboutVerticalDeg: structure.transform.rotationAboutVerticalDeg,
  };
}

/** The transform that puts the building corner where the user said. */
export function structureTransformAtCorner(
  project: RoofProjectDocumentV1['project'],
  placement: StructureCornerPlacement,
): StructureTransformV2 {
  const { leftMm } = roofTemplateFrameMm(project.roof);
  const angle = (placement.rotationAboutVerticalDeg * Math.PI) / 180;
  return transformSchema.parse({
    translationMm: {
      x: placement.cornerMm.x - leftMm * Math.cos(angle),
      y: placement.cornerMm.y - leftMm * Math.sin(angle),
      z: placement.elevationMm,
    },
    rotationAboutVerticalDeg: placement.rotationAboutVerticalDeg,
  });
}
