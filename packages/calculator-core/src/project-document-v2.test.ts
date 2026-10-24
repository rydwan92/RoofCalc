import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { MonoPitchRoofSpec } from '@cieslacalc/roof-math';
import { roofProjectDocumentV1Schema } from './project-document';
import {
  IDENTITY_STRUCTURE_TRANSFORM,
  PROJECT_ROOF_STRUCTURE_ID,
  roofProjectDocumentV1FromV2,
  roofProjectDocumentV2FromV1,
  roofProjectDocumentV2Schema,
  type RoofProjectDocumentV2,
} from './project-document-v2';

/**
 * VNext-7A: the ADR-015 V1 → V2 adapter over the whole reference corpus.
 * V2 is designed and tested here only — the app neither reads nor writes it.
 */
const directory = fileURLToPath(
  new URL('../../../fixtures/projects/', import.meta.url),
);
const fixtures = readdirSync(directory)
  .filter((name) => name.endsWith('.cieslacalc.json'))
  .sort();

it('the corpus is the eleven reference projects (VNext-8: + mono-pitch)', () => {
  expect(fixtures).toHaveLength(11);
});

describe.each(fixtures)('reference project %s', (name) => {
  const v1 = roofProjectDocumentV1Schema.parse(
    JSON.parse(readFileSync(`${directory}/${name}`, 'utf8')).document,
  );
  const v2 = roofProjectDocumentV2FromV1(v1);

  it('becomes exactly one structure in its own frame, content byte-identical', () => {
    expect(v2.schemaVersion).toBe(2);
    expect(v2.connections).toEqual([]);
    expect(v2.structures).toHaveLength(1);
    const [structure] = v2.structures;
    expect(structure!.id).toBe(PROJECT_ROOF_STRUCTURE_ID);
    expect(structure!.transform).toEqual(IDENTITY_STRUCTURE_TRANSFORM);
    expect(structure!.kind).toBe('template-roof');
    expect(
      JSON.stringify(structure!.kind === 'template-roof' && structure!.project),
    ).toBe(JSON.stringify(v1.project));
  });

  it('shares no object with the V1 document', () => {
    const [structure] = v2.structures;
    expect(structure!.kind === 'template-roof' && structure!.project).not.toBe(
      v1.project,
    );
  });

  it('survives a JSON round trip through the V2 reader', () => {
    const read = roofProjectDocumentV2Schema.parse(
      JSON.parse(JSON.stringify(v2)),
    );
    expect(read).toEqual(v2);
  });

  it('goes back to the identical V1 document', () => {
    const back = roofProjectDocumentV1FromV2(v2);
    expect(back.ok).toBe(true);
    if (back.ok) expect(JSON.stringify(back.document)).toBe(JSON.stringify(v1));
  });
});

const MONO: MonoPitchRoofSpec = {
  type: 'mono-pitch',
  id: 'template:lean-to',
  buildingLengthMm: 6000,
  runMm: 4000,
  pitchDeg: 15,
  lowEaveOverhangMm: 0,
  topEdge: 'abutment',
  highOverhangMm: 0,
  vergeOverhangMm: 0,
};

describe('documents only V2 can hold', () => {
  const gable = roofProjectDocumentV2FromV1(
    roofProjectDocumentV1Schema.parse(
      JSON.parse(readFileSync(`${directory}/${fixtures[0]}`, 'utf8')).document,
    ),
  );
  const lean: RoofProjectDocumentV2 = {
    schemaVersion: 2,
    structures: [
      {
        id: 'structure:lean-to',
        name: 'Przybudówka',
        transform: IDENTITY_STRUCTURE_TRANSFORM,
        kind: 'mono-pitch',
        geometry: MONO,
      },
    ],
    connections: [],
  };

  it('reads a mono-pitch structure and refuses to squeeze it into V1', () => {
    expect(roofProjectDocumentV2Schema.parse(lean)).toEqual(lean);
    expect(roofProjectDocumentV1FromV2(lean)).toEqual({
      ok: false,
      reason: 'not-a-template-roof',
    });
  });

  it('refuses V1 for two structures or a moved structure', () => {
    expect(
      roofProjectDocumentV1FromV2({
        ...gable,
        structures: [...gable.structures, ...lean.structures],
      }),
    ).toEqual({ ok: false, reason: 'multiple-structures' });
    expect(
      roofProjectDocumentV1FromV2({
        ...gable,
        structures: gable.structures.map((structure) => ({
          ...structure,
          transform: {
            translationMm: { x: 0, y: 0, z: 0 },
            rotationAboutVerticalDeg: 90,
          },
        })),
      }),
    ).toEqual({ ok: false, reason: 'transformed' });
  });

  it('rejects duplicate structure IDs, no structures, connections and an invalid mono-pitch', () => {
    const issues = (input: unknown) => {
      const result = roofProjectDocumentV2Schema.safeParse(input);
      return result.success
        ? []
        : result.error.issues.map((issue) => issue.message);
    };
    expect(
      issues({
        ...gable,
        structures: [...gable.structures, ...gable.structures],
      }),
    ).toEqual(['duplicate_structure_id']);
    expect(issues({ ...gable, structures: [] }).length).toBeGreaterThan(0);
    expect(issues({ ...gable, connections: [{}] }).length).toBeGreaterThan(0);
    expect(
      issues({
        ...lean,
        structures: [
          {
            ...lean.structures[0],
            geometry: { ...MONO, highOverhangMm: 100 },
          },
        ],
      }),
    ).toContain('abutment_overhang');
  });

  it('reports a broken local V1 project at its V2 path', () => {
    const result = roofProjectDocumentV2Schema.safeParse({
      ...gable,
      structures: gable.structures.map((structure) => ({
        ...structure,
        project: { roof: { type: 'gable' } },
      })),
    });
    expect(result.success).toBe(false);
    expect(
      result.error?.issues.some(
        (issue) =>
          issue.path[0] === 'structures' &&
          issue.path[2] === 'project' &&
          issue.path[3] === 'roof',
      ),
    ).toBe(true);
  });
});
