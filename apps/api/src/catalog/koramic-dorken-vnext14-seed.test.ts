import { readFileSync } from 'node:fs';
import { seedBatchPath } from '../data/batch-files';
import { describe, expect, it } from 'vitest';
import { catalogImportBatchV1Schema } from '@cieslacalc/catalog-core';
import {
  membraneTechnicalSpecSchema,
  roofTileTechnicalSpecSchema,
} from '@cieslacalc/covering-core';
import { CatalogImporter } from './importer';
import { MemoryCatalogRepository } from './memory-repository';

/**
 * VNext-14: Koramic ceramic tiles and three more DÖRKEN membranes. Every
 * value is the manufacturer's own; a figure the source does not state is
 * left out, never filled in.
 */
function load(name: string) {
  return catalogImportBatchV1Schema.parse(
    JSON.parse(readFileSync(seedBatchPath(name), 'utf8')),
  );
}

const membranes = load('membranes-2026-09.json');
const batch = load('tiles-membranes-koramic-dorken-2026-10-vnext14.json');
const tile = (productId: string) => {
  const revision = batch.revisions.find(
    (entry) => entry.productId === productId,
  );
  return roofTileTechnicalSpecSchema.parse(revision?.technicalSpec);
};

describe('VNext-14 Koramic and DÖRKEN catalogue', () => {
  it('seeds after the first membrane batch twice with no conflict and no drift', async () => {
    const repository = new MemoryCatalogRepository();
    const importer = new CatalogImporter(repository);
    await importer.import(membranes, { apply: true });
    for (const pass of [1, 2]) {
      const report = await importer.import(batch, { apply: true });
      expect(report.status).toBe('applied');
      expect(report.revisions.conflicts).toBe(0);
      if (pass === 2) {
        expect(report.revisions.new).toBe(0);
        expect(report.products.updated).toBe(0);
      }
    }
    const tiles = await repository.searchProducts({
      kind: 'roof-tile',
      limit: 50,
      offset: 0,
    });
    expect(tiles.items).toHaveLength(5);
    const rolls = await repository.searchProducts({
      kind: 'membrane',
      limit: 50,
      offset: 0,
    });
    expect(rolls.items).toHaveLength(4);
  });

  it('cites the manufacturer for every revision', () => {
    for (const revision of batch.revisions)
      expect(revision.source?.url).toMatch(
        /^https:\/\/www\.(wienerberger\.(pl|nl)|doerken\.com)\//,
      );
  });

  it('stores the catalogue figures as published (hand-checked)', () => {
    const v9 = tile('product:wienerberger:koramic-v9');
    expect(v9.installationModes[0]).toMatchObject({
      coverWidthMm: 269,
      gaugeRangeMm: { min: 402, max: 418 },
      minPitchDeg: 16,
    });
    const actua = tile('product:wienerberger:koramic-actua-10');
    // With a membrane 24°, otherwise 30°: two figures, not one.
    expect(actua.installationModes[0]).toMatchObject({
      coverWidthMm: 262,
      gaugeRangeMm: { min: 310, max: 380 },
      minPitchDeg: 24,
      recommendedMinPitchDeg: 30,
    });
    // Only a minimum consumption is published: no invented upper bound.
    expect(v9.installationModes[0]!.declaredUnitsPerM2).toBeUndefined();
    const alegra = tile('product:wienerberger:koramic-alegra-10');
    expect(alegra.installationModes[0]!.declaredUnitsPerM2).toEqual({
      min: 10.6,
      max: 11.8,
    });
    // The page states no tile dimensions.
    expect(alegra.physicalWidthMm).toBeUndefined();
  });

  it('gives every membrane the guide’s 10 cm minimum overlap', () => {
    const specs = batch.revisions
      .filter((revision) => revision.productId.startsWith('product:dorken:'))
      .map((revision) =>
        membraneTechnicalSpecSchema.parse(revision.technicalSpec),
      );
    expect(specs).toHaveLength(3);
    for (const spec of specs)
      expect(spec).toMatchObject({
        rollWidthMm: 1500,
        rollLengthMm: 50000,
        minimumOverlapMm: 100,
      });
  });
});
