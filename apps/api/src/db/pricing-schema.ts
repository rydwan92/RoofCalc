import {
  char,
  date,
  datetime,
  foreignKey,
  index,
  int,
  json,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/mysql-core';
import { commercialVariants } from './schema';

/**
 * V34C — the `PriceList`/`PriceListEntry` boundary reserved since V21/V24.
 * Deliberately a separate file from `schema.ts`: `tools/architecture/
 * layering.test.ts`'s "commercial boundary" tests forbid pricing
 * identifiers in `schema.ts` (the catalogue-technical tables), while this
 * file is explicitly exempt — see `docs/adr/ADR-005-*.md`.
 */
const createdAt = () =>
  timestamp('created_at', { mode: 'string' }).defaultNow().notNull();

export const priceLists = mysqlTable(
  'price_lists',
  {
    id: varchar('id', { length: 128 }).primaryKey(),
    ownerLabel: varchar('owner_label', { length: 240 }).notNull(),
    currencyCode: varchar('currency_code', { length: 3 }).notNull(),
    regionCode: varchar('region_code', { length: 16 }),
    taxContext: varchar('tax_context', { length: 160 }),
    validFrom: date('valid_from', { mode: 'string' }).notNull(),
    validTo: date('valid_to', { mode: 'string' }),
    createdAt: createdAt(),
  },
  (table) => [
    index('price_lists_currency_idx').on(table.currencyCode),
    index('price_lists_valid_idx').on(table.validFrom, table.validTo),
  ],
);

export const priceListEntries = mysqlTable(
  'price_list_entries',
  {
    id: varchar('id', { length: 128 }).primaryKey(),
    priceListId: varchar('price_list_id', { length: 128 }).notNull(),
    commercialVariantId: varchar('commercial_variant_id', {
      length: 128,
    }).notNull(),
    saleUnit: varchar('sale_unit', { length: 16 }).notNull(),
    netAmountMinor: int('net_amount_minor').notNull(),
    sourceAmountBasis: varchar('source_amount_basis', { length: 8 }),
    sourceVatRateBps: int('source_vat_rate_bps'),
    validFrom: date('valid_from', { mode: 'string' }).notNull(),
    validTo: date('valid_to', { mode: 'string' }),
    createdAt: createdAt(),
  },
  (table) => [
    index('price_list_entries_variant_valid_idx').on(
      table.commercialVariantId,
      table.validFrom,
    ),
    index('price_list_entries_price_list_idx').on(table.priceListId),
    foreignKey({
      name: 'price_list_entry_list_fk',
      columns: [table.priceListId],
      foreignColumns: [priceLists.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'price_list_entry_variant_fk',
      columns: [table.commercialVariantId],
      foreignColumns: [commercialVariants.id],
    }).onDelete('restrict'),
  ],
);

export const pricingImportBatches = mysqlTable(
  'pricing_import_batches',
  {
    id: varchar('id', { length: 128 }).primaryKey(),
    sourceId: varchar('source_id', { length: 128 }).notNull(),
    sourceLabel: varchar('source_label', { length: 240 }).notNull(),
    checksum: char('checksum', { length: 64 }).notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    counts: json('counts').$type<unknown>().notNull(),
    errorSummary: text('error_summary'),
    startedAt: datetime('started_at', { mode: 'string' }).notNull(),
    completedAt: datetime('completed_at', { mode: 'string' }),
    schemaVersion: int('schema_version').default(1).notNull(),
  },
  (table) => [
    index('pricing_import_batches_source_idx').on(table.sourceId),
    index('pricing_import_batches_checksum_idx').on(table.checksum),
  ],
);
