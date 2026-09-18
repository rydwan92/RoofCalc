import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  catalogImportBatchV1Schema,
  timberStockTechnicalSpecSchema,
} from '@cieslacalc/catalog-core';
import { priceImportBatchV1Schema } from '@cieslacalc/pricing-core';
import { CatalogImporter } from './importer';
import { MemoryCatalogRepository } from './memory-repository';
import { PricingImporter } from '../pricing/importer';
import { MemoryPricingRepository } from '../pricing/memory-repository';

/**
 * V49 batten catalogue. Locks the three promises of the batch: it seeds
 * idempotently next to the untouched V35 timber batch, its application
 * classification is source-backed (a 25×50 marketed for garden projects is
 * never a counter-batten), and a price is only present where the source stated
 * its tax basis.
 */

function load(name: string): unknown {
  return JSON.parse(
    readFileSync(
      new URL(`../data/import-batches/${name}`, import.meta.url),
      'utf8',
    ),
  );
}

const v35 = catalogImportBatchV1Schema.parse(load('timber-stock-2026-09.json'));
const v49 = catalogImportBatchV1Schema.parse(
  load('timber-linear-stock-2026-09.json'),
);
const v49Prices = priceImportBatchV1Schema.parse(
  load('timber-linear-prices-2026-09-18.json'),
);

describe('V49 linear timber catalogue', () => {
  it('seeds after V35 twice with no immutable conflict and no drift', async () => {
    const repository = new MemoryCatalogRepository();
    const importer = new CatalogImporter(repository);
    for (const pass of [1, 2])
      for (const batch of [v35, v49]) {
        const report = await importer.import(batch, { apply: true });
        expect(report.status).toBe('applied');
        expect(report.revisions.conflicts).toBe(0);
        if (pass === 2) {
          expect(report.revisions.new).toBe(0);
          expect(report.products.updated).toBe(0);
        }
      }
    const timber = await repository.searchProducts({
      kind: 'timber-stock',
      limit: 50,
      offset: 0,
    });
    expect(timber.items).toHaveLength(v35.products.length + 4);
  });

  it('keeps every V35 timber revision valid without the new field', () => {
    for (const revision of v35.revisions)
      expect(
        timberStockTechnicalSpecSchema.safeParse(revision.technicalSpec)
          .success,
      ).toBe(true);
    expect(
      v35.revisions.every(
        (revision) =>
          revision.technicalSpec.kind === 'timber-stock' &&
          revision.technicalSpec.declaredApplications === undefined,
      ),
    ).toBe(true);
  });

  it('classifies only what the source declares', () => {
    const byProduct = new Map(
      v49.revisions.map((revision) => [revision.productId, revision]),
    );
    const applications = (key: string) => {
      const spec = byProduct.get(`product:timber:${key}`)!.technicalSpec;
      return spec.kind === 'timber-stock' ? spec.declaredApplications : [];
    };
    expect(applications('complex-lata-40x60x3000')).toEqual(['batten']);
    expect(applications('complex-lata-40x60x4000')).toEqual(['batten']);
    expect(applications('bat-lata-40x60x4000')).toEqual([
      'batten',
      'structural-framing',
    ]);
    // Section 25×50 matches a common counter-batten, but the source markets it
    // for garden projects: it must never be offered as a counter-batten.
    expect(applications('bat-tarcica-25x50x4000')).toEqual(['general']);
    expect(
      v49.revisions.some(
        (revision) =>
          revision.technicalSpec.kind === 'timber-stock' &&
          revision.technicalSpec.declaredApplications?.includes(
            'counter-batten',
          ),
      ),
    ).toBe(false);
    for (const revision of v49.revisions) {
      expect(revision.source?.url).toMatch(/^https:\/\//);
      expect(revision.source?.label).toContain('retrieved 2026-09-18');
    }
  });

  it('prices only what the source stated a tax basis for', async () => {
    expect(v49Prices.entries.map((entry) => entry.commercialVariantId)).toEqual(
      [
        'variant:timber:bat-lata-40x60x4000:standard',
        'variant:timber:bat-tarcica-25x50x4000:standard',
      ],
    );
    // 20,48 zł and 11,06 zł gross, "Cena zawiera VAT 23%".
    expect(v49Prices.entries.map((entry) => entry.netAmountMinor)).toEqual([
      1665, 899,
    ]);
    for (const entry of v49Prices.entries) {
      expect(entry.sourceAmountBasis).toBe('gross');
      expect(entry.sourceVatRateBps).toBe(2300);
      expect(entry.saleUnit).toBe('piece');
    }
    const repository = new MemoryPricingRepository();
    const importer = new PricingImporter(repository);
    expect((await importer.import(v49Prices, { apply: true })).status).toBe(
      'applied',
    );
    const again = await importer.import(v49Prices, { apply: true });
    expect(again.status).toBe('applied');
  });
});
