import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  removeRoofStructure,
  roofProjectDocumentV1FromV2,
  roofStructureDocument,
  roofStructureFootprint,
  structureCornerPlacement,
  structureTransformAtCorner,
} from '@cieslacalc/calculator-core';
import {
  canonicalProjectDocument,
  projectRecordSchema,
  projectRecordV1Schema,
} from '@cieslacalc/project-core';
import { resolveRoofTemplate } from '@cieslacalc/roof-math';

/**
 * VNext-10 (ADR-017): reference project 13 — a house (reference 01) and a
 * carport (reference 11) as two structures of one project. Each structure
 * holds its source project byte-identically and resolves to the same
 * numbers; nothing about placing it changes a calculation.
 */
const directory = fileURLToPath(new URL('..', import.meta.url));
const v1 = (name: string) =>
  projectRecordV1Schema.parse(
    JSON.parse(readFileSync(`${directory}/${name}`, 'utf8')),
  ).document;
const record = projectRecordSchema.parse(
  JSON.parse(
    readFileSync(
      `${directory}/structures/13-house-and-carport.cieslacalc.json`,
      'utf8',
    ),
  ),
);

describe('reference project 13: a house and a carport', () => {
  if (record.schemaVersion !== 2) throw new Error('expected a V2 record');
  const document = record.document;
  const sources = [
    v1('01-basic-gable.cieslacalc.json'),
    v1('11-mono-pitch-carport.cieslacalc.json'),
  ];

  it('is a V2 record that stays V2 when saved', () => {
    expect(document.structures.map((structure) => structure.name)).toEqual([
      'Dom',
      'Wiata',
    ]);
    expect(canonicalProjectDocument(document)).toBe(document);
  });

  it('holds each source project byte-identically and resolves it the same', () => {
    document.structures.forEach((structure, index) => {
      const local = roofStructureDocument(document, structure.id);
      expect(JSON.stringify(local)).toBe(JSON.stringify(sources[index]));
      const resolved = resolveRoofTemplate(local.project.roof);
      const source = resolveRoofTemplate(sources[index]!.project.roof);
      expect(
        resolved.memberPrototypes.map((prototype) => [
          prototype.code,
          prototype.count,
        ]),
      ).toEqual(
        source.memberPrototypes.map((prototype) => [
          prototype.code,
          prototype.count,
        ]),
      );
      expect(resolved.calculation.plan.minimumStockLengthMm).toBe(
        source.calculation.plan.minimumStockLengthMm,
      );
    });
  });

  it('places the carport clear of the house, by its corner, exactly', () => {
    const [house, carport] = document.structures;
    const xs = (structure: typeof house) =>
      roofStructureFootprint(structure!).map((point) => point.x);
    expect(Math.min(...xs(carport))).toBeGreaterThan(Math.max(...xs(house)));
    // Corner placement round-trips to the stored transform.
    const placement = structureCornerPlacement(carport!);
    const transform = structureTransformAtCorner(carport!.project, placement);
    expect(transform.rotationAboutVerticalDeg).toBe(90);
    expect(transform.translationMm.x).toBeCloseTo(15000, 9);
    expect(transform.translationMm.y).toBeCloseTo(2000, 9);
    expect(transform.translationMm.z).toBe(-300);
  });

  it('without the carport it is reference 01 again (V1)', () => {
    const house = removeRoofStructure(document, 'structure:2');
    expect(roofProjectDocumentV1FromV2(house)).toEqual({
      ok: true,
      document: sources[0],
    });
  });
});
