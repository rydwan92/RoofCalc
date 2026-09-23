import {
  boolean,
  char,
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
import { utcDateTime } from './sql-datetime';
import { commercialVariants } from './schema';

/**
 * V54 — organization-owned commercial tables.
 *
 * A third file beside `schema.ts` (global technical catalogue) and
 * `pricing-schema.ts` (price lists), because these tables sit at a different
 * ownership boundary: everything here belongs to **one company**, while
 * everything in `schema.ts` is the shared technical truth about a product.
 *
 * Note what is *not* here: no per-organization copy of a manufacturer, product
 * family, technical revision or commercial variant. A wholesaler does not own
 * the physical facts of a swissporTON KODA tile; it owns which of them it
 * sells, under which code, at which price (§1).
 */

const timestamps = {
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' })
    .defaultNow()
    .onUpdateNow()
    .notNull(),
};

export const organizations = mysqlTable(
  'organizations',
  {
    id: varchar('id', { length: 128 }).primaryKey(),
    slug: varchar('slug', { length: 160 }).notNull(),
    name: varchar('name', { length: 240 }).notNull(),
    currencyCode: char('currency_code', { length: 3 }).notNull(),
    taxId: varchar('tax_id', { length: 64 }),
    address: varchar('address', { length: 400 }),
    logoUrl: varchar('logo_url', { length: 2048 }),
    phone: varchar('phone', { length: 64 }),
    email: varchar('email', { length: 254 }),
    website: varchar('website', { length: 2048 }),
    defaultValidityDays: int('default_validity_days'),
    offerFooter: text('offer_footer'),
    active: boolean('active').default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('organizations_slug_uq').on(table.slug),
    index('organizations_active_name_idx').on(table.active, table.name),
  ],
);

/**
 * One row of what an organization sells.
 *
 * `commercial_variant_id` is **nullable on purpose** (§6): a real wholesale
 * import maps most rows and leaves a tail unmapped, and discarding that tail
 * would lose the company's own data. An unmapped row is preserved and reported
 * as `unmatched`; it is never offered as a technical roof product (§43).
 *
 * Uniqueness: `(organization_id, external_key)` is enforced here, because the
 * external key is the identity a re-import matches on (§29). "One *active* row
 * per (organization, commercial variant)" (§8) is enforced in the service
 * instead of by a unique index, so retiring a product can leave its history
 * behind (§56) rather than colliding with the replacement row.
 */
export const organizationAssortmentItems = mysqlTable(
  'organization_assortment_items',
  {
    id: varchar('id', { length: 128 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 128 }).notNull(),
    commercialVariantId: varchar('commercial_variant_id', { length: 128 }),
    externalKey: varchar('external_key', { length: 160 }).notNull(),
    ean: varchar('ean', { length: 32 }),
    sourceName: varchar('source_name', { length: 240 }).notNull(),
    displayNameOverride: varchar('display_name_override', { length: 240 }),
    active: boolean('active').default(true).notNull(),
    preferred: boolean('preferred').default(false).notNull(),
    metadata: json('metadata').$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('organization_assortment_items_external_key_uq').on(
      table.organizationId,
      table.externalKey,
    ),
    /**
     * Serves both the "does this organization sell variant X" lookup and,
     * with `commercial_variant_id IS NULL`, the unmatched filter — the two
     * queries the Admin screen and the business picker actually run.
     */
    index('organization_assortment_items_variant_idx').on(
      table.organizationId,
      table.commercialVariantId,
    ),
    index('organization_assortment_items_active_idx').on(
      table.organizationId,
      table.active,
    ),
    index('organization_assortment_items_picker_idx').on(
      table.organizationId,
      table.active,
      table.preferred,
      table.sourceName,
    ),
    index('organization_assortment_items_ean_idx').on(
      table.organizationId,
      table.ean,
    ),
    index('organization_assortment_items_display_name_idx').on(
      table.organizationId,
      table.displayNameOverride,
    ),
    foreignKey({
      name: 'organization_assortment_item_organization_fk',
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
    }).onDelete('restrict'),
    /**
     * `restrict`, never `cascade`: retiring a catalogue variant must not
     * silently delete a wholesaler's commercial history (§56).
     */
    foreignKey({
      name: 'organization_assortment_item_variant_fk',
      columns: [table.commercialVariantId],
      foreignColumns: [commercialVariants.id],
    }).onDelete('restrict'),
  ],
);

/** Import audit (§32): what ran, over what, with what result. No raw files. */
export const organizationImportBatches = mysqlTable(
  'organization_import_batches',
  {
    id: varchar('id', { length: 128 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 128 }).notNull(),
    sourceLabel: varchar('source_label', { length: 240 }).notNull(),
    checksum: char('checksum', { length: 64 }).notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    counts: json('counts').$type<unknown>().notNull(),
    errorSummary: text('error_summary'),
    startedAt: utcDateTime('started_at').notNull(),
    completedAt: utcDateTime('completed_at'),
    schemaVersion: int('schema_version').default(1).notNull(),
  },
  (table) => [
    index('organization_import_batches_organization_idx').on(
      table.organizationId,
      table.startedAt,
    ),
    index('organization_import_batches_checksum_idx').on(table.checksum),
    foreignKey({
      name: 'organization_import_batch_organization_fk',
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
    }).onDelete('restrict'),
  ],
);
