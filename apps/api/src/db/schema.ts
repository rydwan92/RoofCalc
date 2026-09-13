import {
  boolean,
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
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

const timestamps = {
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' })
    .defaultNow()
    .onUpdateNow()
    .notNull(),
};

export const manufacturers = mysqlTable(
  'manufacturers',
  {
    id: varchar('id', { length: 128 }).primaryKey(),
    slug: varchar('slug', { length: 160 }).notNull(),
    name: varchar('name', { length: 240 }).notNull(),
    countryCode: char('country_code', { length: 2 }),
    websiteUrl: varchar('website_url', { length: 2048 }),
    active: boolean('active').default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('manufacturers_slug_uq').on(table.slug),
    index('manufacturers_active_name_idx').on(table.active, table.name),
  ],
);

export const technicalProductFamilies = mysqlTable(
  'technical_product_families',
  {
    id: varchar('id', { length: 128 }).primaryKey(),
    manufacturerId: varchar('manufacturer_id', { length: 128 }).notNull(),
    slug: varchar('slug', { length: 160 }).notNull(),
    name: varchar('name', { length: 240 }).notNull(),
    coveringKind: varchar('covering_kind', { length: 32 }).notNull(),
    active: boolean('active').default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('technical_product_families_manufacturer_slug_uq').on(
      table.manufacturerId,
      table.slug,
    ),
    index('technical_product_families_kind_active_idx').on(
      table.coveringKind,
      table.active,
    ),
    index('technical_product_families_manufacturer_idx').on(
      table.manufacturerId,
    ),
    index('technical_product_families_name_idx').on(table.name),
    foreignKey({
      name: 'product_family_manufacturer_fk',
      columns: [table.manufacturerId],
      foreignColumns: [manufacturers.id],
    }).onDelete('restrict'),
  ],
);

export const technicalProductRevisions = mysqlTable(
  'technical_product_revisions',
  {
    id: varchar('id', { length: 128 }).primaryKey(),
    productId: varchar('product_id', { length: 128 }).notNull(),
    revisionCode: varchar('revision_code', { length: 128 }).notNull(),
    technicalSpec: json('technical_spec').$type<unknown>().notNull(),
    validFrom: date('valid_from', { mode: 'string' }),
    sourceUrl: varchar('source_url', { length: 2048 }),
    sourceLabel: varchar('source_label', { length: 240 }),
    sourceRevision: varchar('source_revision', { length: 160 }),
    sourceHash: varchar('source_hash', { length: 256 }),
    createdAt: timestamp('created_at', { mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('technical_product_revisions_product_code_uq').on(
      table.productId,
      table.revisionCode,
    ),
    index('technical_product_revisions_product_valid_idx').on(
      table.productId,
      table.validFrom,
    ),
    foreignKey({
      name: 'product_revision_family_fk',
      columns: [table.productId],
      foreignColumns: [technicalProductFamilies.id],
    }).onDelete('restrict'),
  ],
);

export const commercialVariants = mysqlTable(
  'commercial_variants',
  {
    id: varchar('id', { length: 128 }).primaryKey(),
    productId: varchar('product_id', { length: 128 }).notNull(),
    sku: varchar('sku', { length: 160 }),
    name: varchar('name', { length: 240 }).notNull(),
    color: varchar('color', { length: 160 }),
    finish: varchar('finish', { length: 160 }),
    metadata: json('metadata').$type<Record<string, unknown>>(),
    active: boolean('active').default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    index('commercial_variants_product_active_idx').on(
      table.productId,
      table.active,
    ),
    index('commercial_variants_sku_idx').on(table.sku),
    foreignKey({
      name: 'commercial_variant_family_fk',
      columns: [table.productId],
      foreignColumns: [technicalProductFamilies.id],
    }).onDelete('restrict'),
  ],
);

export const catalogImportBatches = mysqlTable(
  'catalog_import_batches',
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
    index('catalog_import_batches_source_idx').on(table.sourceId),
    index('catalog_import_batches_checksum_idx').on(table.checksum),
    index('catalog_import_batches_status_started_idx').on(
      table.status,
      table.startedAt,
    ),
  ],
);
