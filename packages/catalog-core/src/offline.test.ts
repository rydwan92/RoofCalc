import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  catalogImportBatchV1Schema,
  createOfflineCatalogue,
  normalizeSearchText,
} from './index';

/** The real starter batches, read from the shared data package. */
const MANIFEST = [
  'tiles-2026-09.json',
  'tiles-2026-09-v35.json',
  'membranes-2026-09.json',
  'timber-stock-2026-09.json',
  'metal-sheets-2026-09.json',
  'metal-roofing-additions-2026-09-v42.json',
  'timber-linear-stock-2026-09.json',
  'tiles-commercial-2026-09-v50.json',
  'drainage-galeco-stal2-2026-09-v51.json',
  'roof-system-2026-09-v52.json',
];
const batches = MANIFEST.map((file) =>
  catalogImportBatchV1Schema.parse(
    JSON.parse(
      readFileSync(
        new URL(`../../catalog-data/batches/${file}`, import.meta.url),
        'utf8',
      ),
    ),
  ),
);
const catalogue = createOfflineCatalogue(batches, '2026-09');

describe('offline catalogue read model', () => {
  it('normalizes Polish text for forgiving search', () => {
    expect(normalizeSearchText('  Dachówka  ŁATA Żółta ')).toBe(
      'dachowka lata zolta',
    );
  });

  it('answers the same contracts as the API for every kind', () => {
    const kinds = new Set(
      catalogue.searchProducts({ limit: 50 }).items.map((item) => item.kind),
    );
    expect(kinds.size).toBeGreaterThan(3);
    const first = catalogue.searchProducts({ kind: 'roof-tile', limit: 1 })
      .items[0]!;
    const detail = catalogue.getProduct(first.id)!;
    expect(detail.currentRevision.id).toBe(first.currentRevisionId);
    expect(
      catalogue.getRevision(first.id, first.currentRevisionId)?.revision.id,
    ).toBe(first.currentRevisionId);
    expect(catalogue.getRevision(first.id, 'revision:missing')).toBeUndefined();
  });

  it('finds products by any word, without diacritics', () => {
    const all = catalogue.searchProducts({ limit: 50 }).items;
    const sample =
      all.find((item) => /[ąćęłńóśźż]/i.test(item.name)) ?? all[0]!;
    const words = normalizeSearchText(sample.name).split(' ').slice(0, 2);
    const found = catalogue.searchProducts({ q: words.join(' '), limit: 50 });
    expect(found.items.map((item) => item.id)).toContain(sample.id);
    expect(
      catalogue.searchProducts({ q: 'zzz-no-such-product', limit: 5 }).items,
    ).toEqual([]);
  });

  it('pages with an opaque cursor', () => {
    const first = catalogue.searchProducts({ limit: 2 });
    expect(first.nextCursor).toBeDefined();
    const second = catalogue.searchProducts({
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
  });

  it('carries no commercial price data', () => {
    expect(JSON.stringify(batches)).not.toMatch(
      /\b(?:priceList|unitPrice|netAmount|vatRate)\b/,
    );
  });
});
