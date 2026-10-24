import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveRoofSurfaceGeometry } from '@cieslacalc/roof-math';
import { projectRecordSchema } from '@cieslacalc/project-core';
import { structuralTimberSchedule } from '../assembly/member-schedule';
import { deriveProjectQuantities } from './project-quantities';

/**
 * VNext-10E: the quantities of reference project 13 — a house and a
 * carport. Each structure is the workbench's own schedule and surface; the
 * project only adds them.
 */
const record = projectRecordSchema.parse(
  JSON.parse(
    readFileSync(
      new URL(
        '../../../../fixtures/projects/structures/13-house-and-carport.cieslacalc.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ),
);
if (record.schemaVersion !== 2) throw new Error('expected a V2 record');
const document = record.document;

describe('the quantities of a project of structures (VNext-10E)', () => {
  const quantities = deriveProjectQuantities(document);

  it('takes each structure from its own schedule and surface', () => {
    expect(quantities.structures.map((row) => row.id)).toEqual([
      'structure:roof',
      'structure:2',
    ]);
    document.structures.forEach((structure, index) => {
      const schedule = structuralTimberSchedule(structure.project);
      const surface = resolveRoofSurfaceGeometry({
        template: structure.project.roof,
        features: structure.project.features,
      });
      const row = quantities.structures[index]!;
      expect(row.timber.quantity).toBe(schedule.timberSummary.quantity);
      expect(row.timber.totalLengthMm).toBe(
        schedule.timberSummary.totalLengthMm,
      );
      expect(row.area).toEqual({
        grossMm2: surface.grossAreaMm2,
        netMm2: surface.netAreaMm2,
      });
      expect(row.timber.quantity).toBeGreaterThan(0);
    });
  });

  it('adds the structures: members, length and area', () => {
    const sum = (pick: (index: number) => number) =>
      quantities.structures.reduce((total, _, index) => total + pick(index), 0);
    expect(quantities.timber.quantity).toBe(
      sum((index) => quantities.structures[index]!.timber.quantity),
    );
    expect(quantities.timber.totalLengthMm).toBeCloseTo(
      sum((index) => quantities.structures[index]!.timber.totalLengthMm),
      6,
    );
    expect(quantities.area?.grossMm2).toBeCloseTo(
      sum((index) => quantities.structures[index]!.area!.grossMm2),
      6,
    );
  });

  it('keeps a ridge without its depth out of the sections, named by its structure', () => {
    // The house's ridge states a thickness only (fixture 13).
    expect(quantities.timber.unsectioned).toEqual([
      expect.objectContaining({ key: 'structure:roof', quantity: 1 }),
    ]);
    const sectioned = quantities.timber.sections.reduce(
      (total, row) => total + row.quantity,
      0,
    );
    expect(sectioned + 1).toBe(quantities.timber.quantity);
    expect(quantities.structures[0]!.timber.volumeExcludedQuantity).toBe(1);
    expect(quantities.structures[1]!.timber.volumeExcludedQuantity).toBe(0);
  });

  it('states the ridge depth and every member is in a section', () => {
    const house = document.structures[0]!;
    if (house.project.roof.type !== 'gable') throw new Error('gable expected');
    const withDepth = {
      ...document,
      structures: [
        {
          ...house,
          project: {
            ...house.project,
            roof: {
              ...house.project.roof,
              ridge: { ...house.project.roof.ridge, depthMm: 160 },
            },
          },
        },
        document.structures[1]!,
      ],
    };
    const complete = deriveProjectQuantities(withDepth);
    expect(complete.timber.unsectioned).toEqual([]);
    expect(
      complete.timber.sections.find(
        (row) => row.section.widthMm === 40 && row.section.depthMm === 160,
      )?.quantity,
    ).toBe(1);
    expect(complete.structures[0]!.timber.volumeExcludedQuantity).toBe(0);
  });
});
