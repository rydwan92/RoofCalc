import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catalogImportBatchV1Schema } from '@cieslacalc/catalog-core';
import { priceImportBatchV1Schema } from '@cieslacalc/pricing-core';
import { CatalogImporter } from './importer';
import { MemoryCatalogRepository } from './memory-repository';
import { PricingImporter } from '../pricing/importer';
import { MemoryPricingRepository } from '../pricing/memory-repository';
import { PricingService } from '../pricing/service';

function load<T>(name: string): T {
  return JSON.parse(
    readFileSync(
      new URL(`../data/import-batches/${name}`, import.meta.url),
      'utf8',
    ),
  ) as T;
}

describe('V39/V42 metal catalogue reconciliation', () => {
  it('keeps V39 revisions immutable, deactivates T18 and replays without seed ping-pong', async () => {
    const v39 = catalogImportBatchV1Schema.parse(
      load('metal-sheets-2026-09.json'),
    );
    const v42 = catalogImportBatchV1Schema.parse(
      load('metal-roofing-additions-2026-09-v42.json'),
    );
    const repository = new MemoryCatalogRepository();
    const importer = new CatalogImporter(repository);
    for (const batch of [v39, v42]) {
      const report = await importer.import(batch, { apply: true });
      expect(report.status).toBe('applied');
      expect(report.revisions.conflicts).toBe(0);
    }
    const originalT18 = v39.revisions.find((row) =>
      row.id.includes(':t18-dach:'),
    );
    expect(originalT18).toBeDefined();
    expect(
      await repository.getProduct('product:pruszynski:t18-dach'),
    ).toBeUndefined();
    const storedT18 = await repository.readImportState({
      manufacturerIds: [],
      productIds: [],
      revisionIds: [originalT18!.id],
      variantIds: [],
    });
    expect(storedT18.revisions[0]).toEqual(originalT18);
    for (const batch of [v39, v42]) {
      const report = await importer.import(batch, { apply: true });
      expect(report.status).toBe('applied');
      expect(report.products.updated).toBe(0);
      expect(report.revisions).toMatchObject({ new: 0, conflicts: 0 });
    }
    expect(v42.products).toHaveLength(36);
    expect(v42.revisions).toHaveLength(36);
    expect(v42.variants).toHaveLength(24);
    const modular = await repository.searchProducts({
      kind: 'modular-sheet',
      limit: 50,
      offset: 0,
    });
    expect(modular.items).toHaveLength(32); // FIORD + TIGRA + 30 V42
  });

  it('imports dated Ruukki entries after variant references and resolves one price', async () => {
    const catalog = catalogImportBatchV1Schema.parse(
      load('metal-roofing-additions-2026-09-v42.json'),
    );
    const prices = priceImportBatchV1Schema.parse(
      load('metal-prices-ruukki-2026-04-28.json'),
    );
    const variants = new Map(catalog.variants.map((item) => [item.id, item]));
    const specs = new Map(
      catalog.revisions.map((item) => [item.productId, item.technicalSpec]),
    );
    for (const entry of prices.entries) {
      const variant = variants.get(entry.commercialVariantId);
      expect(variant).toBeDefined();
      const salesUnit = specs.get(variant!.productId)?.salesUnit;
      expect(entry.saleUnit).toBe(
        salesUnit === 'square-metre' ? 'm2' : 'piece',
      );
    }
    const repository = new MemoryPricingRepository();
    const importer = new PricingImporter(repository);
    expect((await importer.import(prices, { apply: true })).status).toBe(
      'applied',
    );
    expect(
      (await importer.import(prices, { apply: true })).entries,
    ).toMatchObject({
      new: 0,
      unchanged: 24,
      conflicts: 0,
    });
    const service = new PricingService(repository);
    const variantId = 'variant:ruukki:finnera:qc50-pural-bt-mat';
    const result = await service.pricesForVariants([variantId], '2026-07-01');
    expect(result[0]).toMatchObject({
      currencyCode: 'PLN',
      entry: { netAmountMinor: 6979, saleUnit: 'piece' },
    });
    expect(await service.pricesForVariants([variantId], '2026-09-16')).toEqual(
      [],
    );
  });
});
