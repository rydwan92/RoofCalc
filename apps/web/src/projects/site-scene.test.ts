import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  moveRoofStructure,
  roofStructureFootprint,
} from '@cieslacalc/calculator-core';
import { projectRecordSchema } from '@cieslacalc/project-core';
import { deriveSiteScene, deriveSiteTechnicalScene } from './site-scene';

/**
 * VNext-10D: the site of reference project 13 — a house and a carport.
 * Placing is the topology core's transform; overlap is its assessment.
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

describe('the site of a project of structures (VNext-10D)', () => {
  it('places every roof where its structure stands, apart without overlap', () => {
    const site = deriveSiteScene(document);
    expect(site.structures.map((structure) => structure.id)).toEqual([
      'structure:roof',
      'structure:2',
    ]);
    expect(site.overlaps).toEqual([]);
    // The placed carport roof covers its building outline on the site.
    const carport = site.structures[1]!.scene;
    const xs = carport.planes.flatMap((plane) =>
      plane.polygon.map((point) => point.x),
    );
    const outline = roofStructureFootprint(document.structures[1]!).map(
      (point) => point.x,
    );
    expect(Math.min(...xs)).toBeLessThanOrEqual(Math.min(...outline) + 1e-6);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(Math.max(...outline) - 1e-6);
  });

  it('reports two roofs that share plan area, by structure', () => {
    const stacked = moveRoofStructure(document, 'structure:2', {
      translationMm: { x: 0, y: 1000, z: 0 },
      rotationAboutVerticalDeg: 0,
    });
    expect(deriveSiteScene(stacked).overlaps).toEqual([
      ['structure:roof', 'structure:2'],
    ]);
  });
});

describe('the site in 3D (VNext-14)', () => {
  it('draws every structure’s timber where its roof stands on the site', () => {
    const plan = deriveSiteScene(document);
    const { scene, partOf } = deriveSiteTechnicalScene(document);
    const of = (id: string) =>
      scene.entities.filter((entity) => partOf[entity.id] === id);
    expect(of('structure:roof').length).toBeGreaterThan(0);
    expect(of('structure:2').length).toBeGreaterThan(0);
    // The carport's timber sits within its placed roof outline (plan).
    const roofXs = plan.structures[1]!.scene.planes.flatMap((plane) =>
      plane.polygon.map((point) => point.x),
    );
    const members = of('structure:2').filter(
      (entity) => entity.geometry.kind === 'oriented-box',
    );
    for (const member of members) {
      if (member.geometry.kind !== 'oriented-box') continue;
      expect(member.geometry.center.x).toBeGreaterThanOrEqual(
        Math.min(...roofXs) - 500,
      );
      expect(member.geometry.center.x).toBeLessThanOrEqual(
        Math.max(...roofXs) + 500,
      );
    }
  });
});
