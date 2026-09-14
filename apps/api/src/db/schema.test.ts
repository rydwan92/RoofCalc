import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/mysql-core';
import { escapeLikePattern } from './catalog-repository';
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

describe('catalogue search terms are literal', () => {
  it('escapes LIKE metacharacters so a term cannot act as a wildcard', () => {
    // The value is parameterized by Drizzle, so this is not SQL injection — but
    // an unescaped `%` would silently match everything, while the in-memory
    // repository does a plain substring match. The two must agree.
    expect(escapeLikePattern('tile')).toBe('tile');
    expect(escapeLikePattern('50%')).toBe('50\\%');
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
    expect(escapeLikePattern('back\\slash')).toBe('back\\\\slash');
  });
});
