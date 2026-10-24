import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { roofTemplateFrameMm } from '@cieslacalc/roof-math';
import { roofProjectDocumentV1Schema } from './project-document';
import {
  addRoofStructure,
  IDENTITY_STRUCTURE_TRANSFORM,
  moveRoofStructure,
  nextStructureId,
  PROJECT_ROOF_STRUCTURE_ID,
  removeRoofStructure,
  renameRoofStructure,
  roofProjectDocumentV1FromV2,
  roofProjectDocumentV2FromV1,
  roofProjectDocumentV2Schema,
  roofStructure,
  roofStructureDocument,
  roofStructureFootprint,
  STRUCTURE_PLACEMENT_GAP_MM,
  withRoofStructureProject,
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

it('the corpus is the twelve reference projects (VNext-8/9: + mono-pitch, asymmetric)', () => {
  expect(fixtures).toHaveLength(12);
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

const read = (name: string) =>
  roofProjectDocumentV1Schema.parse(
    JSON.parse(readFileSync(`${directory}/${name}`, 'utf8')).document,
  );
const house = read(fixtures[0]!);
const garage = read(
  fixtures.find((name) => name.includes('mono-pitch')) ?? fixtures[1]!,
);

describe('documents only V2 can hold', () => {
  const gable = roofProjectDocumentV2FromV1(house);

  it('refuses V1 for two structures or a moved structure', () => {
    const { document: two } = addRoofStructure(gable, {
      project: garage.project,
    });
    expect(roofProjectDocumentV1FromV2(two)).toEqual({
      ok: false,
      reason: 'multiple-structures',
    });
    expect(
      roofProjectDocumentV1FromV2(
        moveRoofStructure(gable, PROJECT_ROOF_STRUCTURE_ID, {
          translationMm: { x: 0, y: 0, z: 0 },
          rotationAboutVerticalDeg: 90,
        }),
      ),
    ).toEqual({ ok: false, reason: 'transformed' });
  });

  it('rejects duplicate structure IDs, no structures and connections', () => {
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
  });

  it('no longer reads the VNext-7A mono-pitch geometry kind (ADR-017)', () => {
    expect(
      roofProjectDocumentV2Schema.safeParse({
        ...gable,
        structures: [
          {
            id: 'structure:lean-to',
            transform: IDENTITY_STRUCTURE_TRANSFORM,
            kind: 'mono-pitch',
            geometry: {},
          },
        ],
      }).success,
    ).toBe(false);
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

describe('editing a project of structures (VNext-10, ADR-017)', () => {
  const start = roofProjectDocumentV2FromV1(house, 'Dom');

  it('adds a structure beside the others, the gap clear between outlines', () => {
    const { document, structureId } = addRoofStructure(start, {
      project: garage.project,
      name: 'Garaż',
    });
    expect(structureId).toBe('structure:2');
    expect(document.structures.map((structure) => structure.name)).toEqual([
      'Dom',
      'Garaż',
    ]);
    const xs = (id: string) =>
      roofStructureFootprint(roofStructure(document, id)!).map(
        (point) => point.x,
      );
    const gap =
      Math.min(...xs(structureId)) - Math.max(...xs(PROJECT_ROOF_STRUCTURE_ID));
    expect(gap).toBeGreaterThanOrEqual(STRUCTURE_PLACEMENT_GAP_MM - 1e-9);
    expect(gap).toBeLessThan(STRUCTURE_PLACEMENT_GAP_MM + 100);
    // ...and the new building corner sits on a whole 10 cm.
    expect(Math.min(...xs(structureId)) % 100).toBeCloseTo(0, 9);
    expect(roofProjectDocumentV2Schema.parse(document)).toEqual(document);
    // The input is never mutated.
    expect(start.structures).toHaveLength(1);
  });

  it('numbers past an ID that is taken', () => {
    const { document } = addRoofStructure(start, { project: garage.project });
    const removed = removeRoofStructure(document, PROJECT_ROOF_STRUCTURE_ID);
    expect(nextStructureId(removed)).toBe('structure:3');
  });

  it('writes the workbench document back into its structure only', () => {
    const { document, structureId } = addRoofStructure(start, {
      project: garage.project,
    });
    const local = roofStructureDocument(document, structureId);
    const edited = {
      ...local,
      project: {
        ...local.project,
        roof: { ...local.project.roof, buildingLengthMm: 9000 },
      },
    };
    const next = withRoofStructureProject(document, structureId, edited);
    expect(
      roofStructure(next, structureId)!.project.roof.buildingLengthMm,
    ).toBe(9000);
    expect(roofStructure(next, PROJECT_ROOF_STRUCTURE_ID)).toEqual(
      roofStructure(document, PROJECT_ROOF_STRUCTURE_ID),
    );
  });

  it('renames, moves and removes; the last structure stays', () => {
    const { document, structureId } = addRoofStructure(start, {
      project: garage.project,
    });
    expect(
      roofStructure(
        renameRoofStructure(document, structureId, ' Wiata '),
        structureId,
      )!.name,
    ).toBe('Wiata');
    expect(
      roofStructure(
        renameRoofStructure(document, structureId, '  '),
        structureId,
      ),
    ).not.toHaveProperty('name');
    const moved = moveRoofStructure(document, structureId, {
      translationMm: { x: 1000, y: 2000, z: 300 },
      rotationAboutVerticalDeg: 90,
    });
    // Rotated 90°: the local x axis points along world y.
    const corner = roofStructureFootprint(
      roofStructure(moved, structureId)!,
    )[0]!;
    const { leftMm } = roofTemplateFrameMm(garage.project.roof);
    expect(corner.x).toBeCloseTo(1000, 9);
    expect(corner.y).toBeCloseTo(2000 + leftMm, 9);
    const one = removeRoofStructure(document, structureId);
    expect(roofProjectDocumentV1FromV2(one)).toEqual({
      ok: true,
      document: house,
    });
    expect(() => removeRoofStructure(one, PROJECT_ROOF_STRUCTURE_ID)).toThrow(
      'last_roof_structure',
    );
    expect(() => renameRoofStructure(one, 'structure:none', 'x')).toThrow(
      'unknown_roof_structure',
    );
  });
});
