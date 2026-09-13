import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/mysql-core';
import {
  catalogImportBatches,
  commercialVariants,
  manufacturers,
  technicalProductFamilies,
  technicalProductRevisions,
} from './schema';

describe('catalogue database contract', () => {
  it('defines the five migrated tables and technical JSON revision boundary', () => {
    const tables = [
      manufacturers,
      technicalProductFamilies,
      technicalProductRevisions,
      commercialVariants,
      catalogImportBatches,
    ].map(getTableConfig);
    expect(tables.map((table) => table.name)).toEqual([
      'manufacturers',
      'technical_product_families',
      'technical_product_revisions',
      'commercial_variants',
      'catalog_import_batches',
    ]);
    const revision = tables[2]!;
    expect(revision.columns.map((column) => column.name)).toContain(
      'technical_spec',
    );
    expect(revision.indexes.map((index) => index.config.name)).toContain(
      'technical_product_revisions_product_valid_idx',
    );
  });
});
