import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  catalogImportBatchV1Schema,
  createCatalogProductSelection,
} from '@cieslacalc/catalog-core';
import { CatalogImporter } from './importer';
import { MemoryCatalogRepository } from './memory-repository';

/**
 * V50 tile commercial facts. Packaging lives on commercial variants (mutable
 * catalogue data), accessories are their own kind with declared roles and
 * compatibility, and nothing unsourced is stored.
 */
function load(name: string): unknown {
  return JSON.parse(
    readFileSync(
      new URL(`../data/import-batches/${name}`, import.meta.url),
      'utf8',
    ),
  );
}

const batches = [
  'tiles-2026-09.json',
  'tiles-2026-09-v35.json',
  'tiles-commercial-2026-09-v50.json',
].map((name) => catalogImportBatchV1Schema.parse(load(name)));
const v50 = batches[2]!;

describe('V50 tile commercial catalogue', () => {
  it('seeds after the earlier tile batches twice with no conflict and no drift', async () => {
    const repository = new MemoryCatalogRepository();
    const importer = new CatalogImporter(repository);
    for (const pass of [1, 2])
      for (const batch of batches) {
        const report = await importer.import(batch, { apply: true });
        expect(report.status).toBe('applied');
        expect(report.revisions.conflicts).toBe(0);
        if (pass === 2 && batch === v50) {
          expect(report.revisions.new).toBe(0);
          expect(report.products.updated).toBe(0);
          expect(report.variants.updated).toBe(0);
        }
      }
    const accessories = await repository.searchProducts({
      kind: 'roof-tile-accessory',
      limit: 50,
      offset: 0,
    });
    expect(accessories.items).toHaveLength(10);
    expect(
      accessories.items.every(
        (item) => item.product.coveringKind === 'roof-tile-accessory',
      ),
    ).toBe(true);
    // A tile search never leaks an accessory.
    const tiles = await repository.searchProducts({
      kind: 'roof-tile',
      limit: 50,
      offset: 0,
    });
    expect(tiles.items.some((item) => item.product.id.includes('gasior'))).toBe(
      false,
    );
  });

  it('stores packaging only where the source states it', () => {
    const byProduct = (id: string) =>
      v50.variants.filter((variant) => variant.productId === id);
    expect(
      byProduct('product:swissporton:koda').map(
        (variant) => variant.metadata?.packaging,
      ),
    ).toEqual(
      Array(4).fill(
        expect.objectContaining({ piecesPerPack: 4, piecesPerPallet: 168 }),
      ),
    );
    for (const name of ['simpla', 'titania', 'balance'])
      for (const variant of byProduct(`product:swissporton:${name}`))
        expect(variant.metadata?.packaging?.piecesPerPallet).toBe(192);
    // Turmalin states no packaging: no variant is invented for it.
    expect(byProduct('product:bmi-braas:turmalin')).toEqual([]);
  });

  it('declares accessory roles and compatibility explicitly, never by name', () => {
    const accessories = v50.revisions.map((revision) => revision.technicalSpec);
    for (const spec of accessories) {
      if (spec.kind !== 'roof-tile-accessory') throw new Error(spec.kind);
      expect(spec.compatibleProductIds.length).toBeGreaterThan(0);
      // Verge tiles carry no invented per-course rule; ridge tiles only the
      // source's approximate per-metre demand.
      expect(spec.quantityRule).toBeUndefined();
      if (spec.roles.includes('ridge'))
        expect(spec.declaredUnitsPerMetre).toEqual({
          value: 2.5,
          approximate: true,
        });
      // Hip use is not stated by the source.
      expect(spec.roles).not.toContain('hip-ridge');
    }
  });

  it('a catalogue pick snapshots the variant packaging into the project', () => {
    const [, v35] = batches;
    const product = v35!.products.find(
      (item) => item.id === 'product:swissporton:simpla',
    )!;
    const selection = createCatalogProductSelection({
      manufacturer: v35!.manufacturers.find(
        (item) => item.id === product.manufacturerId,
      )!,
      product,
      revision: v35!.revisions.find((item) => item.productId === product.id)!,
      variant: v50.variants.find((item) => item.productId === product.id)!,
    });
    expect(selection.commercialSnapshot?.packaging).toMatchObject({
      piecesPerPack: 4,
      piecesPerPallet: 192,
    });
  });
});
