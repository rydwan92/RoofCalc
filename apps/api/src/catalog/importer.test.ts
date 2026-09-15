import { describe, expect, it } from 'vitest';
import { CatalogImporter } from './importer';
import { MemoryCatalogRepository } from './memory-repository';
import type { CatalogImportBatchV1 } from '@cieslacalc/catalog-core';

const batch: CatalogImportBatchV1 = {
  schemaVersion: 1,
  source: { id: 'source:test', label: 'TEST fixture' },
  manufacturers: [{ id: 'm:test', slug: 'test', name: 'Test', active: true }],
  products: [
    {
      id: 'p:tile',
      manufacturerId: 'm:test',
      slug: 'tile',
      name: 'Tile',
      coveringKind: 'roof-tile',
      active: true,
    },
  ],
  revisions: [
    {
      id: 'r:tile:1',
      productId: 'p:tile',
      revisionCode: '1',
      technicalSpec: {
        schemaVersion: 1,
        kind: 'roof-tile',
        installationModes: [
          {
            id: 'standard',
            coverWidthMm: 300,
            gaugeRangeMm: { min: 320, max: 360 },
            coursePattern: {
              layers: [{ id: 'base', horizontalOffsetFraction: 0 }],
              battenRowOffsetCycle: [0],
            },
          },
        ],
      },
    },
  ],
  variants: [
    {
      id: 'v:tile:red',
      productId: 'p:tile',
      sku: 'RED',
      name: 'Red',
      active: true,
    },
  ],
};

describe('canonical catalogue importer', () => {
  it('defaults to dry-run, applies atomically and is idempotent', async () => {
    const repository = new MemoryCatalogRepository();
    const importer = new CatalogImporter(repository);
    const dry = await importer.import(batch);
    expect(dry.status).toBe('valid');
    expect(dry.revisions.new).toBe(1);
    expect(await repository.getProduct('p:tile')).toBeUndefined();
    const applied = await importer.import(batch, { apply: true });
    expect(applied.status).toBe('applied');
    expect(await repository.getProduct('p:tile')).toBeTruthy();
    const again = await importer.import(batch, { apply: true });
    expect(again.revisions).toMatchObject({ new: 0, unchanged: 1 });
    expect(
      (await repository.searchProducts({ limit: 20, offset: 0 })).items,
    ).toHaveLength(1);
    expect(repository.audits).toHaveLength(2);
  });

  it('rejects an immutable revision ID conflict without changing data', async () => {
    const repository = new MemoryCatalogRepository();
    const importer = new CatalogImporter(repository);
    await importer.import(batch, { apply: true });
    const changed = structuredClone(batch);
    const spec = changed.revisions[0]!.technicalSpec;
    if (spec.kind !== 'roof-tile') throw new Error('test fixture');
    spec.installationModes[0]!.coverWidthMm = 333;
    const report = await importer.import(changed, { apply: true });
    expect(report.status).toBe('conflict');
    expect(report.conflicts).toEqual([
      {
        entity: 'revision',
        id: 'r:tile:1',
        code: 'immutable-technical-revision',
      },
    ]);
    const stored = await repository.getRevision('p:tile', 'r:tile:1');
    expect(
      stored?.revision.technicalSpec.kind === 'roof-tile' &&
        stored.revision.technicalSpec.installationModes[0]?.coverWidthMm,
    ).toBe(300);
  });

  it('flips a family active flag and clears a variant SKU as mutable updates, never conflicts', async () => {
    const repository = new MemoryCatalogRepository();
    const importer = new CatalogImporter(repository);
    await importer.import(batch, { apply: true });

    const revised = structuredClone(batch);
    revised.products[0]!.active = false;
    delete revised.variants[0]!.sku;
    const report = await importer.import(revised, { apply: true });

    expect(report.status).toBe('applied');
    expect(report.conflicts).toEqual([]);
    expect(report.products).toMatchObject({ updated: 1, conflicts: 0 });
    expect(report.variants).toMatchObject({ updated: 1, conflicts: 0 });

    // A re-import of the same (now historical/inactive) data is a no-op.
    const again = await importer.import(revised, { apply: true });
    expect(again.products).toMatchObject({ unchanged: 1, updated: 0 });
    expect(again.variants).toMatchObject({ unchanged: 1, updated: 0 });
  });

  it('rejects broken references before reads or writes', async () => {
    let touched = false;
    const repository = {
      readImportState: async () => {
        touched = true;
        return { manufacturers: [], products: [], revisions: [], variants: [] };
      },
      applyImport: async () => {
        touched = true;
      },
    };
    const invalid = structuredClone(batch);
    invalid.products[0]!.manufacturerId = 'm:missing';
    await expect(
      new CatalogImporter(repository).import(invalid),
    ).rejects.toThrow();
    expect(touched).toBe(false);
  });

  it('does not partially apply when the repository transaction fails', async () => {
    const stored = new MemoryCatalogRepository();
    const failing = {
      readImportState: stored.readImportState.bind(stored),
      applyImport: async () => {
        throw new Error('transaction-failed');
      },
    };
    await expect(
      new CatalogImporter(failing).import(batch, { apply: true }),
    ).rejects.toThrow('transaction-failed');
    expect(await stored.getProduct('p:tile')).toBeUndefined();
  });
});
