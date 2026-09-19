import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catalogImportBatchV1Schema } from '@cieslacalc/catalog-core';
import { roofDrainageComponentTechnicalSpecSchema } from '@cieslacalc/roof-system-core';
import { CatalogImporter } from './importer';
import { MemoryCatalogRepository } from './memory-repository';

/**
 * V51 drainage catalogue: one real gutter system as `roof-drainage-component`
 * revisions. Compatibility is the explicit `systemKey`; spacing values exist
 * only where the manufacturer states them; no prices are seeded.
 */
const batch = catalogImportBatchV1Schema.parse(
  JSON.parse(
    readFileSync(
      new URL(
        '../data/import-batches/drainage-galeco-stal2-2026-09-v51.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ),
);

describe('V51 drainage catalogue (Galeco STAL²)', () => {
  it('seeds twice with no conflict and no drift', async () => {
    const repository = new MemoryCatalogRepository();
    const importer = new CatalogImporter(repository);
    for (const pass of [1, 2]) {
      const report = await importer.import(batch, { apply: true });
      expect(report.status).toBe('applied');
      expect(report.revisions.conflicts).toBe(0);
      if (pass === 2) {
        expect(report.revisions.new).toBe(0);
        expect(report.products.updated).toBe(0);
      }
    }
    const drainage = await repository.searchProducts({
      kind: 'roof-drainage-component',
      limit: 50,
      offset: 0,
    });
    expect(drainage.items).toHaveLength(batch.products.length);
    const tiles = await repository.searchProducts({
      kind: 'roof-tile',
      limit: 50,
      offset: 0,
    });
    expect(tiles.items).toHaveLength(0);
  });

  it('every component belongs explicitly to one system and cites its source', () => {
    for (const revision of batch.revisions) {
      const spec = roofDrainageComponentTechnicalSpecSchema.parse(
        revision.technicalSpec,
      );
      expect(spec.systemKey).toBe('galeco-stal2-125-80');
      expect(revision.source?.url).toMatch(/^https:\/\/galeco\.pl\//);
    }
  });

  it('stores only source-stated lengths and spacing', () => {
    const specs = batch.revisions.map((revision) =>
      roofDrainageComponentTechnicalSpecSchema.parse(revision.technicalSpec),
    );
    const lengths = (role: string) =>
      specs
        .filter((spec) => spec.role === role)
        .map((spec) => spec.lengthMm)
        .sort();
    expect(lengths('gutter-section')).toEqual([3000, 4000]);
    expect(lengths('downpipe')).toEqual([1000, 3000]);
    expect(
      specs.find((spec) => spec.role === 'gutter-hook')?.maxSpacingMm,
    ).toBe(600);
    expect(
      specs.find((spec) => spec.role === 'downpipe-clamp')?.maxSpacingMm,
    ).toBe(1800);
    // No end-distance rule is stated, so none is stored.
    expect(specs.every((spec) => spec.maxEndDistanceMm === undefined)).toBe(
      true,
    );
    expect(
      specs
        .filter((spec) => spec.role === 'gutter-end-cap')
        .map((spec) => spec.hand)
        .sort(),
    ).toEqual(['left', 'right']);
    expect(batch.variants).toEqual([]);
  });
});
