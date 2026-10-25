import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  resolveRoofSurfaceGeometry,
  resolveRoofTemplate,
  roofTemplateSpanMm,
} from '@cieslacalc/roof-math';
import { projectRecordSchema } from '@cieslacalc/project-core';
import type { CoveringAssignmentSpec } from '@cieslacalc/covering-core';
import { deriveTrussEnquiryStructure } from './truss-enquiry';

/**
 * VNext-14: the data for a truss quote is the project as RoofCalc already
 * resolves it — the template resolver, the roof surface, the product
 * snapshots. Reference project 13: a house and a carport.
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
const [house] = record.document.structures;

describe('data for a truss quote (VNext-14)', () => {
  it('reads geometry and area from the resolvers, not a second formula', () => {
    const project = house!.project;
    const sheet = deriveTrussEnquiryStructure('house', 'Dom', project);
    const surface = resolveRoofSurfaceGeometry({
      template: project.roof,
      features: project.features,
    });
    if (surface.status !== 'resolved') throw new Error('expected a surface');
    expect(sheet.area).toEqual({
      grossMm2: surface.grossAreaMm2,
      netMm2: surface.netAreaMm2,
    });
    expect(sheet.spanMm).toBe(roofTemplateSpanMm(project.roof));
    expect(sheet.pitchesDeg).toEqual([project.roof.pitchDeg]);
    const resolved = resolveRoofTemplate(project.roof);
    if ('monoPitch' in resolved) throw new Error('expected a ridge');
    expect(sheet.height).toEqual({
      kind: 'ridge',
      valueMm: resolved.ridgeHeightMm,
    });
  });

  it('states a covering mass only when the product states weight and consumption', () => {
    const project = structuredClone(house!.project);
    const tile = (
      weightKgPerPiece: number | undefined,
    ): CoveringAssignmentSpec => ({
      id: 'covering:tile',
      roofPlaneIds: [],
      product: {
        catalogRef: { productId: 'p', technicalRevisionId: 'r' },
        displaySnapshot: {
          manufacturer: 'Wienerberger',
          familyName: 'Alegra 10',
        },
        technicalSpecSnapshot: {
          schemaVersion: 1,
          kind: 'roof-tile',
          material: 'ceramic',
          ...(weightKgPerPiece !== undefined ? { weightKgPerPiece } : {}),
          installationModes: [
            {
              id: 'standard',
              coverWidthMm: 254,
              gaugeRangeMm: { min: 333, max: 370 },
              declaredUnitsPerM2: { min: 10.6, max: 11.8 },
            },
          ],
        },
      },
    });
    project.coverings = [tile(4)];
    const [stated] = deriveTrussEnquiryStructure('h', 'Dom', project).coverings;
    // 4 kg × 10.6–11.8 pcs/m² (Koramic Alegra 10 card).
    expect(stated).toMatchObject({
      family: 'Alegra 10',
      material: 'ceramic',
      weightKgPerPiece: 4,
    });
    expect(stated!.massKgPerM2!.min).toBeCloseTo(42.4, 6);
    expect(stated!.massKgPerM2!.max).toBeCloseTo(47.2, 6);
    project.coverings = [tile(undefined)];
    const [unstated] = deriveTrussEnquiryStructure(
      'h',
      'Dom',
      project,
    ).coverings;
    expect(unstated!.massKgPerM2).toBeUndefined();
  });

  it('gives both pitches of an asymmetric gable', () => {
    const project = structuredClone(house!.project);
    const gable = project.roof;
    if (gable.type !== 'gable') throw new Error('expected a gable house');
    project.roof = {
      id: 'template:asym',
      type: 'asymmetric-gable',
      buildingLengthMm: 9000,
      spanMm: 8000,
      pitchDeg: 30,
      rightPitchDeg: 45,
      eaveOverhangMm: 500,
      rafterSpacing: { mode: 'max-even-spacing', spacingMm: 900 },
      rafterSection: { widthMm: 80, depthMm: 200 },
      wallPlate: gable.wallPlate,
      ridge: gable.ridge,
    };
    const sheet = deriveTrussEnquiryStructure('a', 'A', project);
    expect(sheet.pitchesDeg).toEqual([30, 45]);
    expect(sheet.spanMm).toBe(8000);
  });
});
