import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  like,
  not,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import {
  organizationAssortmentItemSchema,
  organizationSchema,
  type AssortmentQuery,
  type AssortmentImportAudit,
  type AssortmentSummary,
  type Organization,
  type OrganizationAssortmentItem,
  type OrganizationPriceList,
} from '@cieslacalc/business-core';
import {
  priceListEntrySchema,
  type PriceListEntry,
} from '@cieslacalc/pricing-core';
import type {
  AssortmentCatalogFacts,
  BusinessAdminRepository,
  BusinessCatalogReader,
  BusinessRepository,
} from '../business/repository';
import type { CatalogDatabase } from './client';
import {
  organizationAssortmentItems,
  organizationImportBatches,
  organizations,
} from './business-schema';
import { priceListEntries, priceLists } from './pricing-schema';
import {
  commercialVariants,
  manufacturers,
  technicalProductFamilies,
  technicalProductRevisions,
} from './schema';

function organizationFromRow(
  row: typeof organizations.$inferSelect,
): Organization {
  return organizationSchema.parse({
    id: row.id,
    slug: row.slug,
    name: row.name,
    currencyCode: row.currencyCode,
    active: row.active,
    taxId: row.taxId ?? undefined,
    address: row.address ?? undefined,
    logoUrl: row.logoUrl ?? undefined,
  });
}

function itemFromRow(
  row: typeof organizationAssortmentItems.$inferSelect,
): OrganizationAssortmentItem {
  return organizationAssortmentItemSchema.parse({
    id: row.id,
    organizationId: row.organizationId,
    commercialVariantId: row.commercialVariantId ?? undefined,
    externalKey: row.externalKey,
    ean: row.ean ?? undefined,
    sourceName: row.sourceName,
    displayNameOverride: row.displayNameOverride ?? undefined,
    active: row.active,
    preferred: row.preferred,
    metadata: decodeJson(row.metadata) ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

/**
 * MariaDB's `mysql2` returns a JSON column as a string where native MySQL
 * returns an object — the same decode `DrizzleCatalogRepository` applies to
 * technical specs. Database JSON is never trusted; the Zod parse above is.
 */
function decodeJson(value: unknown): Record<string, unknown> | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : undefined;
    } catch {
      return undefined;
    }
  }
  return typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

function priceListFromRow(
  row: typeof priceLists.$inferSelect,
): OrganizationPriceList {
  return {
    id: row.id,
    ...(row.organizationId ? { organizationId: row.organizationId } : {}),
    ownerLabel: row.ownerLabel,
    currencyCode: row.currencyCode,
    ...(row.regionCode ? { regionCode: row.regionCode } : {}),
    ...(row.taxContext ? { taxContext: row.taxContext } : {}),
    validFrom: row.validFrom,
    ...(row.validTo ? { validTo: row.validTo } : {}),
  };
}

function entryFromRow(
  row: typeof priceListEntries.$inferSelect,
): PriceListEntry {
  return priceListEntrySchema.parse({
    id: row.id,
    priceListId: row.priceListId,
    commercialVariantId: row.commercialVariantId,
    saleUnit: row.saleUnit,
    netAmountMinor: row.netAmountMinor,
    sourceAmountBasis:
      (row.sourceAmountBasis as 'net' | 'gross' | null) ?? undefined,
    sourceVatRateBps: row.sourceVatRateBps ?? undefined,
    validFrom: row.validFrom,
    validTo: row.validTo ?? undefined,
  });
}

/**
 * SQL adapter for the business layer.
 *
 * Every assortment query carries `organization_id` in its `WHERE` clause, and
 * every price query is restricted to lists the organization may see. That is
 * the first of three independent isolation checks (repository → service →
 * pure resolver); none of them is allowed to be the only one (§58).
 */
export class DrizzleBusinessRepository
  implements BusinessRepository, BusinessAdminRepository, BusinessCatalogReader
{
  constructor(private readonly db: CatalogDatabase) {}

  async listOrganizations(): Promise<Organization[]> {
    const rows = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.active, true))
      .orderBy(organizations.name);
    return rows.map(organizationFromRow);
  }

  async getOrganization(
    organizationId: string,
  ): Promise<Organization | undefined> {
    const rows = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    return rows[0] ? organizationFromRow(rows[0]) : undefined;
  }

  async assortmentForOrganization(
    organizationId: string,
  ): Promise<OrganizationAssortmentItem[]> {
    const rows = await this.db
      .select()
      .from(organizationAssortmentItems)
      .where(eq(organizationAssortmentItems.organizationId, organizationId));
    return rows.map(itemFromRow);
  }

  async assortmentItemForOrganization(
    organizationId: string,
    itemId: string,
  ): Promise<OrganizationAssortmentItem | undefined> {
    const rows = await this.db
      .select()
      .from(organizationAssortmentItems)
      .where(
        and(
          eq(organizationAssortmentItems.organizationId, organizationId),
          eq(organizationAssortmentItems.id, itemId),
        ),
      )
      .limit(1);
    return rows[0] ? itemFromRow(rows[0]) : undefined;
  }

  async searchAssortment(
    organizationId: string,
    query: AssortmentQuery,
    offset: number,
    atDate: string,
  ): Promise<{
    items: OrganizationAssortmentItem[];
    nextCursor?: string;
  }> {
    const conditions: SQL[] = [
      eq(organizationAssortmentItems.organizationId, organizationId),
    ];
    const priceExists = currentOrganizationPriceExists(organizationId, atDate);
    const preferred = query.preferred ?? query.preferredOnly;

    if (query.state === 'matched')
      conditions.push(
        eq(organizationAssortmentItems.active, true),
        isNotNull(organizationAssortmentItems.commercialVariantId),
      );
    if (query.state === 'unmatched')
      conditions.push(
        eq(organizationAssortmentItems.active, true),
        isNull(organizationAssortmentItems.commercialVariantId),
      );
    if (query.state === 'inactive')
      conditions.push(eq(organizationAssortmentItems.active, false));
    if (query.active !== undefined)
      conditions.push(eq(organizationAssortmentItems.active, query.active));
    if (preferred !== undefined)
      conditions.push(eq(organizationAssortmentItems.preferred, preferred));
    if (query.hasPrice !== undefined)
      conditions.push(query.hasPrice ? priceExists : not(priceExists));
    if (query.kind)
      conditions.push(eq(technicalProductFamilies.coveringKind, query.kind));
    if (query.manufacturerId)
      conditions.push(eq(manufacturers.id, query.manufacturerId));
    if (query.manufacturer)
      conditions.push(
        like(manufacturers.name, `${escapeLike(query.manufacturer)}%`),
      );

    switch (query.filter) {
      case 'active':
        conditions.push(eq(organizationAssortmentItems.active, true));
        break;
      case 'unmatched':
        conditions.push(
          eq(organizationAssortmentItems.active, true),
          isNull(organizationAssortmentItems.commercialVariantId),
        );
        break;
      case 'without-price':
        conditions.push(
          eq(organizationAssortmentItems.active, true),
          not(priceExists),
        );
        break;
      case 'inactive':
        conditions.push(eq(organizationAssortmentItems.active, false));
        break;
      case 'preferred':
        conditions.push(eq(organizationAssortmentItems.preferred, true));
        break;
      case 'all':
        break;
    }

    const needle = query.q?.trim();
    if (needle) {
      const prefix = `${escapeLike(needle)}%`;
      const search = or(
        like(organizationAssortmentItems.externalKey, prefix),
        like(organizationAssortmentItems.ean, prefix),
        like(organizationAssortmentItems.sourceName, prefix),
        like(organizationAssortmentItems.displayNameOverride, prefix),
        like(commercialVariants.sku, prefix),
        like(commercialVariants.name, prefix),
        like(technicalProductFamilies.name, prefix),
        like(manufacturers.name, prefix),
      );
      if (search) conditions.push(search);
    }

    const page = await this.db
      .select({ id: organizationAssortmentItems.id })
      .from(organizationAssortmentItems)
      .leftJoin(
        commercialVariants,
        eq(
          organizationAssortmentItems.commercialVariantId,
          commercialVariants.id,
        ),
      )
      .leftJoin(
        technicalProductFamilies,
        eq(commercialVariants.productId, technicalProductFamilies.id),
      )
      .leftJoin(
        manufacturers,
        eq(technicalProductFamilies.manufacturerId, manufacturers.id),
      )
      .where(and(...conditions))
      .orderBy(
        desc(organizationAssortmentItems.preferred),
        asc(
          sql`coalesce(${organizationAssortmentItems.displayNameOverride}, ${organizationAssortmentItems.sourceName})`,
        ),
        asc(organizationAssortmentItems.externalKey),
        asc(organizationAssortmentItems.id),
      )
      .limit(query.limit + 1)
      .offset(offset);
    const hasNext = page.length > query.limit;
    const ids = page.slice(0, query.limit).map((row) => row.id);
    if (!ids.length) return { items: [] };
    const rows = await this.db
      .select()
      .from(organizationAssortmentItems)
      .where(
        and(
          eq(organizationAssortmentItems.organizationId, organizationId),
          inArray(organizationAssortmentItems.id, ids),
        ),
      );
    const byId = new Map(rows.map((row) => [row.id, itemFromRow(row)]));
    return {
      items: ids.flatMap((id) => {
        const item = byId.get(id);
        return item ? [item] : [];
      }),
      ...(hasNext ? { nextCursor: String(offset + query.limit) } : {}),
    };
  }

  async assortmentSummaryForOrganization(
    organizationId: string,
    atDate: string,
  ): Promise<AssortmentSummary> {
    const priceExists = currentOrganizationPriceExists(organizationId, atDate);
    const rows = await this.db
      .select({
        total: sql<number>`count(*)`,
        matched: sql<number>`sum(case when ${organizationAssortmentItems.active} = true and ${organizationAssortmentItems.commercialVariantId} is not null then 1 else 0 end)`,
        unmatched: sql<number>`sum(case when ${organizationAssortmentItems.active} = true and ${organizationAssortmentItems.commercialVariantId} is null then 1 else 0 end)`,
        inactive: sql<number>`sum(case when ${organizationAssortmentItems.active} = false then 1 else 0 end)`,
        withoutPrice: sql<number>`sum(case when ${organizationAssortmentItems.active} = true and not ${priceExists} then 1 else 0 end)`,
      })
      .from(organizationAssortmentItems)
      .where(eq(organizationAssortmentItems.organizationId, organizationId));
    const row = rows[0];
    return {
      total: Number(row?.total ?? 0),
      matched: Number(row?.matched ?? 0),
      unmatched: Number(row?.unmatched ?? 0),
      inactive: Number(row?.inactive ?? 0),
      withoutPrice: Number(row?.withoutPrice ?? 0),
    };
  }

  async visiblePriceLists(
    organizationId: string | undefined,
  ): Promise<OrganizationPriceList[]> {
    const visible = organizationId
      ? or(
          isNull(priceLists.organizationId),
          eq(priceLists.organizationId, organizationId),
        )
      : isNull(priceLists.organizationId);
    const rows = await this.db.select().from(priceLists).where(visible);
    return rows.map(priceListFromRow);
  }

  async entriesForPriceLists(
    priceListIds: string[],
    variantIds?: string[],
  ): Promise<PriceListEntry[]> {
    if (!priceListIds.length) return [];
    const conditions: SQL[] = [
      inArray(priceListEntries.priceListId, priceListIds),
    ];
    if (variantIds) {
      if (!variantIds.length) return [];
      conditions.push(
        inArray(priceListEntries.commercialVariantId, variantIds),
      );
    }
    const rows = await this.db
      .select()
      .from(priceListEntries)
      .where(and(...conditions));
    return rows.map(entryFromRow);
  }

  /** The catalogue join is read-only and display-only: no technical spec. */
  private factsSelect() {
    return this.db
      .select({
        productId: technicalProductFamilies.id,
        productName: technicalProductFamilies.name,
        manufacturerId: manufacturers.id,
        manufacturerName: manufacturers.name,
        kind: technicalProductFamilies.coveringKind,
        currentRevisionId: sql<string>`(
          SELECT r.id FROM ${technicalProductRevisions} r
          WHERE r.product_id = ${technicalProductFamilies.id}
          ORDER BY r.valid_from IS NULL, r.valid_from DESC, r.id DESC
          LIMIT 1
        )`,
        variantId: commercialVariants.id,
        variantName: commercialVariants.name,
        variantSku: commercialVariants.sku,
      })
      .from(commercialVariants)
      .innerJoin(
        technicalProductFamilies,
        eq(commercialVariants.productId, technicalProductFamilies.id),
      )
      .innerJoin(
        manufacturers,
        eq(technicalProductFamilies.manufacturerId, manufacturers.id),
      );
  }

  async factsForVariants(
    variantIds: string[],
  ): Promise<AssortmentCatalogFacts[]> {
    if (!variantIds.length) return [];
    const rows = await this.factsSelect().where(
      inArray(commercialVariants.id, variantIds),
    );
    return rows.flatMap(toFacts);
  }

  async matchCandidates(limit: number): Promise<AssortmentCatalogFacts[]> {
    const rows = await this.factsSelect()
      .where(eq(commercialVariants.active, true))
      .limit(limit);
    return rows.flatMap(toFacts);
  }

  async variantExists(variantId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: commercialVariants.id })
      .from(commercialVariants)
      .where(eq(commercialVariants.id, variantId))
      .limit(1);
    return rows.length > 0;
  }

  async upsertOrganization(organization: Organization): Promise<void> {
    await this.db
      .insert(organizations)
      .values({
        id: organization.id,
        slug: organization.slug,
        name: organization.name,
        currencyCode: organization.currencyCode,
        taxId: organization.taxId ?? null,
        address: organization.address ?? null,
        logoUrl: organization.logoUrl ?? null,
        active: organization.active,
      })
      .onDuplicateKeyUpdate({
        set: {
          slug: organization.slug,
          name: organization.name,
          currencyCode: organization.currencyCode,
          taxId: organization.taxId ?? null,
          address: organization.address ?? null,
          logoUrl: organization.logoUrl ?? null,
          active: organization.active,
        },
      });
  }

  async ensureStarterData(input: Parameters<BusinessAdminRepository['ensureStarterData']>[0]): Promise<void> {
    if (input.priceList.organizationId !== input.organization.id ||
      input.assortment.some((item) => item.organizationId !== input.organization.id) ||
      input.entries.some((entry) => entry.priceListId !== input.priceList.id))
      throw new Error('organization-mismatch');
    await this.db.transaction(async (tx) => {
      // Duplicate-key no-ops are atomic, preserve user edits and do not mask
      // foreign-key/validation errors as INSERT IGNORE would.
      await tx.insert(organizations).values(input.organization)
        .onDuplicateKeyUpdate({ set: { id: sql`${organizations.id}`, updatedAt: sql`${organizations.updatedAt}` } });
      for (const item of input.assortment)
        await tx.insert(organizationAssortmentItems).values(item)
          .onDuplicateKeyUpdate({ set: { id: sql`${organizationAssortmentItems.id}`, updatedAt: sql`${organizationAssortmentItems.updatedAt}` } });
      await tx.insert(priceLists).values(input.priceList)
        .onDuplicateKeyUpdate({ set: { id: sql`${priceLists.id}` } });
      for (const entry of input.entries)
        await tx.insert(priceListEntries).values(entry)
          .onDuplicateKeyUpdate({ set: { id: sql`${priceListEntries.id}` } });
    });
  }

  async upsertAssortmentItems(
    organizationId: string,
    items: OrganizationAssortmentItem[],
  ): Promise<void> {
    if (!items.length) return;
    if (items.some((item) => item.organizationId !== organizationId))
      throw new Error('organization-mismatch');
    await this.db.transaction(async (tx) => {
      for (const item of items)
        await tx
          .insert(organizationAssortmentItems)
          .values({
            id: item.id,
            organizationId: item.organizationId,
            commercialVariantId: item.commercialVariantId ?? null,
            externalKey: item.externalKey,
            ean: item.ean ?? null,
            sourceName: item.sourceName,
            displayNameOverride: item.displayNameOverride ?? null,
            active: item.active,
            preferred: item.preferred,
            metadata: item.metadata ?? null,
          })
          /**
           * Keyed by the `(organization_id, external_key)` unique index, so a
           * re-import of the same file updates in place instead of creating a
           * duplicate row (§29). `preferred` is deliberately updated too —
           * the service already carried the previous value forward, so an
           * import cannot silently clear an admin's own preference.
           */
          .onDuplicateKeyUpdate({
            set: {
              commercialVariantId: item.commercialVariantId ?? null,
              ean: item.ean ?? null,
              sourceName: item.sourceName,
              displayNameOverride: item.displayNameOverride ?? null,
              active: item.active,
              preferred: item.preferred,
              metadata: item.metadata ?? null,
            },
          });
    });
  }

  async createAssortmentItemWithPrice(input: {
    item: OrganizationAssortmentItem;
    priceList?: OrganizationPriceList;
    priceEntry?: PriceListEntry;
  }): Promise<void> {
    if (Boolean(input.priceList) !== Boolean(input.priceEntry))
      throw new Error('incomplete-price');
    await this.db.transaction(async (tx) => {
      await tx.insert(organizationAssortmentItems).values({
        id: input.item.id,
        organizationId: input.item.organizationId,
        commercialVariantId: input.item.commercialVariantId ?? null,
        externalKey: input.item.externalKey,
        ean: input.item.ean ?? null,
        sourceName: input.item.sourceName,
        displayNameOverride: input.item.displayNameOverride ?? null,
        active: input.item.active,
        preferred: input.item.preferred,
        metadata: input.item.metadata ?? null,
      });
      if (!input.priceList || !input.priceEntry) return;
      await tx
        .insert(priceLists)
        .values({
          id: input.priceList.id,
          organizationId: input.priceList.organizationId ?? null,
          ownerLabel: input.priceList.ownerLabel,
          currencyCode: input.priceList.currencyCode,
          regionCode: input.priceList.regionCode ?? null,
          taxContext: input.priceList.taxContext ?? null,
          validFrom: input.priceList.validFrom,
          validTo: input.priceList.validTo ?? null,
        })
        .onDuplicateKeyUpdate({
          set: {
            ownerLabel: input.priceList.ownerLabel,
            currencyCode: input.priceList.currencyCode,
            taxContext: input.priceList.taxContext ?? null,
          },
        });
      await tx.insert(priceListEntries).values({
        id: input.priceEntry.id,
        priceListId: input.priceEntry.priceListId,
        commercialVariantId: input.priceEntry.commercialVariantId,
        saleUnit: input.priceEntry.saleUnit,
        netAmountMinor: input.priceEntry.netAmountMinor,
        sourceAmountBasis: input.priceEntry.sourceAmountBasis ?? null,
        sourceVatRateBps: input.priceEntry.sourceVatRateBps ?? null,
        validFrom: input.priceEntry.validFrom,
        validTo: input.priceEntry.validTo ?? null,
      });
    });
  }

  async updateAssortmentItem(
    organizationId: string,
    itemId: string,
    patch: Parameters<BusinessAdminRepository['updateAssortmentItem']>[2],
  ): Promise<OrganizationAssortmentItem | undefined> {
    const set: Partial<typeof organizationAssortmentItems.$inferInsert> = {};
    if (patch.commercialVariantId !== undefined)
      set.commercialVariantId = patch.commercialVariantId;
    if (patch.active !== undefined) set.active = patch.active;
    if (patch.preferred !== undefined) set.preferred = patch.preferred;
    if (patch.displayNameOverride !== undefined)
      set.displayNameOverride = patch.displayNameOverride;
    if (!Object.keys(set).length) return undefined;
    const scope = and(
      eq(organizationAssortmentItems.id, itemId),
      eq(organizationAssortmentItems.organizationId, organizationId),
    );
    await this.db.update(organizationAssortmentItems).set(set).where(scope);
    const rows = await this.db
      .select()
      .from(organizationAssortmentItems)
      .where(scope)
      .limit(1);
    return rows[0] ? itemFromRow(rows[0]) : undefined;
  }

  async updateAssortmentItemsFlags(
    organizationId: string,
    itemIds: string[],
    flags: { active?: boolean; preferred?: boolean },
  ): Promise<OrganizationAssortmentItem[]> {
    if (!itemIds.length) return [];
    const set: Partial<typeof organizationAssortmentItems.$inferInsert> = {};
    if (flags.active !== undefined) set.active = flags.active;
    if (flags.preferred !== undefined) set.preferred = flags.preferred;
    if (!Object.keys(set).length) return [];
    const scope = and(
      eq(organizationAssortmentItems.organizationId, organizationId),
      inArray(organizationAssortmentItems.id, itemIds),
    );
    await this.db.update(organizationAssortmentItems).set(set).where(scope);
    const rows = await this.db
      .select()
      .from(organizationAssortmentItems)
      .where(scope);
    return rows.map(itemFromRow);
  }

  async recordImport(audit: AssortmentImportAudit): Promise<void> {
    await this.db.insert(organizationImportBatches).values({
      id: audit.id,
      organizationId: audit.organizationId,
      sourceLabel: audit.sourceLabel,
      checksum: audit.checksum,
      status: audit.status,
      counts: audit.counts,
      startedAt: audit.startedAt,
      completedAt: audit.completedAt,
      schemaVersion: 1,
    });
  }

  async applyAssortmentImport(input: {
    organizationId: string;
    items: OrganizationAssortmentItem[];
    priceList?: OrganizationPriceList;
    entries: PriceListEntry[];
    audit: AssortmentImportAudit;
  }): Promise<void> {
    if (
      input.items.some((item) => item.organizationId !== input.organizationId)
    )
      throw new Error('organization-mismatch');
    await this.db.transaction(async (tx) => {
      for (const item of input.items)
        await tx
          .insert(organizationAssortmentItems)
          .values({
            id: item.id,
            organizationId: item.organizationId,
            commercialVariantId: item.commercialVariantId ?? null,
            externalKey: item.externalKey,
            ean: item.ean ?? null,
            sourceName: item.sourceName,
            displayNameOverride: item.displayNameOverride ?? null,
            active: item.active,
            preferred: item.preferred,
            metadata: item.metadata ?? null,
          })
          .onDuplicateKeyUpdate({
            set: {
              commercialVariantId: item.commercialVariantId ?? null,
              ean: item.ean ?? null,
              sourceName: item.sourceName,
              displayNameOverride: item.displayNameOverride ?? null,
              active: item.active,
              preferred: item.preferred,
              metadata: item.metadata ?? null,
            },
          });
      if (input.priceList && input.entries.length) {
        await tx
          .insert(priceLists)
          .values({
            id: input.priceList.id,
            organizationId: input.priceList.organizationId ?? null,
            ownerLabel: input.priceList.ownerLabel,
            currencyCode: input.priceList.currencyCode,
            regionCode: input.priceList.regionCode ?? null,
            taxContext: input.priceList.taxContext ?? null,
            validFrom: input.priceList.validFrom,
            validTo: input.priceList.validTo ?? null,
          })
          .onDuplicateKeyUpdate({
            set: {
              ownerLabel: input.priceList.ownerLabel,
              currencyCode: input.priceList.currencyCode,
              validFrom: input.priceList.validFrom,
              validTo: input.priceList.validTo ?? null,
            },
          });
        for (const entry of input.entries)
          await tx
            .insert(priceListEntries)
            .values({
              id: entry.id,
              priceListId: entry.priceListId,
              commercialVariantId: entry.commercialVariantId,
              saleUnit: entry.saleUnit,
              netAmountMinor: entry.netAmountMinor,
              sourceAmountBasis: entry.sourceAmountBasis ?? null,
              sourceVatRateBps: entry.sourceVatRateBps ?? null,
              validFrom: entry.validFrom,
              validTo: entry.validTo ?? null,
            })
            .onDuplicateKeyUpdate({
              set: {
                netAmountMinor: entry.netAmountMinor,
                saleUnit: entry.saleUnit,
                sourceAmountBasis: entry.sourceAmountBasis ?? null,
                sourceVatRateBps: entry.sourceVatRateBps ?? null,
              },
            });
      }
      await tx.insert(organizationImportBatches).values({
        id: input.audit.id,
        organizationId: input.audit.organizationId,
        sourceLabel: input.audit.sourceLabel,
        checksum: input.audit.checksum,
        status: input.audit.status,
        counts: input.audit.counts,
        startedAt: input.audit.startedAt,
        completedAt: input.audit.completedAt,
        schemaVersion: 1,
      });
    });
  }

  async upsertOrganizationPrices(input: {
    priceList: OrganizationPriceList;
    entries: PriceListEntry[];
  }): Promise<void> {
    if (!input.priceList.organizationId)
      throw new Error('organization-price-list-required');
    await this.db.transaction(async (tx) => {
      await tx
        .insert(priceLists)
        .values({
          id: input.priceList.id,
          organizationId: input.priceList.organizationId ?? null,
          ownerLabel: input.priceList.ownerLabel,
          currencyCode: input.priceList.currencyCode,
          regionCode: input.priceList.regionCode ?? null,
          taxContext: input.priceList.taxContext ?? null,
          validFrom: input.priceList.validFrom,
          validTo: input.priceList.validTo ?? null,
        })
        .onDuplicateKeyUpdate({
          set: {
            ownerLabel: input.priceList.ownerLabel,
            currencyCode: input.priceList.currencyCode,
            validFrom: input.priceList.validFrom,
            validTo: input.priceList.validTo ?? null,
          },
        });
      for (const entry of input.entries)
        await tx
          .insert(priceListEntries)
          .values({
            id: entry.id,
            priceListId: entry.priceListId,
            commercialVariantId: entry.commercialVariantId,
            saleUnit: entry.saleUnit,
            netAmountMinor: entry.netAmountMinor,
            sourceAmountBasis: entry.sourceAmountBasis ?? null,
            sourceVatRateBps: entry.sourceVatRateBps ?? null,
            validFrom: entry.validFrom,
            validTo: entry.validTo ?? null,
          })
          .onDuplicateKeyUpdate({
            set: {
              netAmountMinor: entry.netAmountMinor,
              saleUnit: entry.saleUnit,
              sourceAmountBasis: entry.sourceAmountBasis ?? null,
              sourceVatRateBps: entry.sourceVatRateBps ?? null,
            },
          });
    });
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function currentOrganizationPriceExists(
  organizationId: string,
  atDate: string,
): SQL {
  return sql`exists (
    select 1
    from ${priceListEntries}
    inner join ${priceLists}
      on ${priceListEntries.priceListId} = ${priceLists.id}
    where ${priceLists.organizationId} = ${organizationId}
      and ${priceLists.currencyCode} = (
        select ${organizations.currencyCode}
        from ${organizations}
        where ${organizations.id} = ${organizationId}
        limit 1
      )
      and ${priceListEntries.commercialVariantId} = ${organizationAssortmentItems.commercialVariantId}
      and ${priceLists.validFrom} <= ${atDate}
      and (${priceLists.validTo} is null or ${priceLists.validTo} >= ${atDate})
      and ${priceListEntries.validFrom} <= ${atDate}
      and (${priceListEntries.validTo} is null or ${priceListEntries.validTo} >= ${atDate})
  )`;
}

function toFacts(row: {
  productId: string;
  productName: string;
  manufacturerId: string;
  manufacturerName: string;
  kind: string;
  currentRevisionId: string | null;
  variantId: string;
  variantName: string;
  variantSku: string | null;
}): AssortmentCatalogFacts[] {
  // A product family with no revision cannot be displayed as a real product.
  if (!row.currentRevisionId) return [];
  return [
    {
      productId: row.productId,
      productName: row.productName,
      manufacturerId: row.manufacturerId,
      manufacturerName: row.manufacturerName,
      kind: row.kind,
      currentRevisionId: row.currentRevisionId,
      variantId: row.variantId,
      variantName: row.variantName,
      ...(row.variantSku ? { variantSku: row.variantSku } : {}),
    },
  ];
}
