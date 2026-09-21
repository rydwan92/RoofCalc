import { and, asc, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import {
  catalogProductDetailSchema,
  catalogRevisionDetailSchema,
  commercialVariantSchema,
  manufacturerSchema,
  technicalProductFamilySchema,
  technicalProductRevisionSchema,
  type CommercialVariant,
  type Manufacturer,
  type TechnicalProductFamily,
  type TechnicalProductRevision,
} from '@cieslacalc/catalog-core';
import type {
  CatalogImportRepository,
  CatalogRepository,
  CatalogRepositorySearch,
} from '../catalog/repository';
import type { CatalogDatabase } from './client';
import {
  catalogImportBatches,
  commercialVariants,
  manufacturers,
  technicalProductFamilies,
  technicalProductRevisions,
} from './schema';

function jsonColumn(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

/**
 * Drizzle's MySQL `set` clause drops an `undefined`-valued key from the
 * generated `ON DUPLICATE KEY UPDATE` SQL instead of clearing the column, so
 * a mutable optional field (ADR-004) that goes from a value to omitted on
 * re-import would otherwise silently keep its stale value forever. Every
 * nullable optional field written through `applyImport`'s `set` clauses
 * must go through this so clearing a field is a real write, not a no-op.
 */
function orNull<T>(value: T | undefined): T | null {
  return value ?? null;
}

function manufacturerFromRow(row: typeof manufacturers.$inferSelect) {
  return manufacturerSchema.parse({
    id: row.id,
    slug: row.slug,
    name: row.name,
    countryCode: row.countryCode ?? undefined,
    websiteUrl: row.websiteUrl ?? undefined,
    active: row.active,
  });
}

function productFromRow(row: typeof technicalProductFamilies.$inferSelect) {
  return technicalProductFamilySchema.parse({
    id: row.id,
    manufacturerId: row.manufacturerId,
    slug: row.slug,
    name: row.name,
    coveringKind: row.coveringKind,
    active: row.active,
  });
}

function revisionFromRow(row: typeof technicalProductRevisions.$inferSelect) {
  const source = {
    url: row.sourceUrl ?? undefined,
    label: row.sourceLabel ?? undefined,
    revision: row.sourceRevision ?? undefined,
    hash: row.sourceHash ?? undefined,
  };
  return technicalProductRevisionSchema.parse({
    id: row.id,
    productId: row.productId,
    revisionCode: row.revisionCode,
    technicalSpec: jsonColumn(row.technicalSpec),
    validFrom: row.validFrom ?? undefined,
    source: Object.values(source).some(Boolean) ? source : undefined,
  });
}

function variantFromRow(row: typeof commercialVariants.$inferSelect) {
  return commercialVariantSchema.parse({
    id: row.id,
    productId: row.productId,
    sku: row.sku ?? undefined,
    name: row.name,
    color: row.color ?? undefined,
    finish: row.finish ?? undefined,
    metadata: row.metadata === null ? undefined : jsonColumn(row.metadata),
    active: row.active,
  });
}

function revisionValues(item: TechnicalProductRevision) {
  return {
    id: item.id,
    productId: item.productId,
    revisionCode: item.revisionCode,
    technicalSpec: item.technicalSpec,
    validFrom: item.validFrom,
    sourceUrl: item.source?.url,
    sourceLabel: item.source?.label,
    sourceRevision: item.source?.revision,
    sourceHash: item.source?.hash,
  };
}

/** A search term is literal text: LIKE metacharacters in it must not act as wildcards. */
export function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export class DrizzleCatalogRepository
  implements CatalogRepository, CatalogImportRepository
{
  constructor(private readonly db: CatalogDatabase) {}

  async listManufacturers() {
    const rows = await this.db
      .select()
      .from(manufacturers)
      .where(eq(manufacturers.active, true))
      .orderBy(asc(manufacturers.name), asc(manufacturers.id));
    return rows.map(manufacturerFromRow);
  }

  private async revisionsFor(productIds: string[]) {
    if (!productIds.length) return new Map<string, TechnicalProductRevision>();
    const rows = await this.db
      .select()
      .from(technicalProductRevisions)
      .where(inArray(technicalProductRevisions.productId, productIds))
      .orderBy(
        asc(technicalProductRevisions.productId),
        desc(technicalProductRevisions.validFrom),
        desc(technicalProductRevisions.revisionCode),
        desc(technicalProductRevisions.id),
      );
    const result = new Map<string, TechnicalProductRevision>();
    for (const row of rows)
      if (!result.has(row.productId))
        result.set(row.productId, revisionFromRow(row));
    return result;
  }

  async searchProducts(query: CatalogRepositorySearch) {
    const conditions = [
      eq(technicalProductFamilies.active, true),
      eq(manufacturers.active, true),
    ];
    if (query.kind)
      conditions.push(eq(technicalProductFamilies.coveringKind, query.kind));
    if (query.manufacturerId)
      conditions.push(
        eq(technicalProductFamilies.manufacturerId, query.manufacturerId),
      );
    if (query.q) {
      // Drizzle parameterizes the value, but LIKE metacharacters inside it
      // would still act as wildcards; a search term is literal text, and the
      // in-memory repository already matches it literally.
      const pattern = `%${escapeLikePattern(query.q)}%`;
      conditions.push(
        or(
          like(technicalProductFamilies.name, pattern),
          like(manufacturers.name, pattern),
        )!,
      );
    }
    const rows = await this.db
      .select({
        product: technicalProductFamilies,
        manufacturer: manufacturers,
      })
      .from(technicalProductFamilies)
      .innerJoin(
        manufacturers,
        eq(technicalProductFamilies.manufacturerId, manufacturers.id),
      )
      .where(and(...conditions))
      .orderBy(
        asc(technicalProductFamilies.name),
        asc(technicalProductFamilies.id),
      )
      .limit(query.limit + 1)
      .offset(query.offset);
    const page = rows.slice(0, query.limit);
    const ids = page.map((row) => row.product.id);
    const current = await this.revisionsFor(ids);
    const countRows = ids.length
      ? await this.db
          .select({
            productId: commercialVariants.productId,
            count: sql<number>`count(*)`,
          })
          .from(commercialVariants)
          .where(
            and(
              inArray(commercialVariants.productId, ids),
              eq(commercialVariants.active, true),
            ),
          )
          .groupBy(commercialVariants.productId)
      : [];
    const counts = new Map(
      countRows.map((row) => [row.productId, Number(row.count)]),
    );
    return {
      items: page.flatMap((row) => {
        const revision = current.get(row.product.id);
        return revision
          ? [
              {
                product: productFromRow(row.product),
                manufacturer: manufacturerFromRow(row.manufacturer),
                currentRevision: revision,
                variantCount: counts.get(row.product.id) ?? 0,
              },
            ]
          : [];
      }),
      hasMore: rows.length > query.limit,
    };
  }

  async getProduct(productId: string) {
    const rows = await this.db
      .select({
        product: technicalProductFamilies,
        manufacturer: manufacturers,
      })
      .from(technicalProductFamilies)
      .innerJoin(
        manufacturers,
        eq(technicalProductFamilies.manufacturerId, manufacturers.id),
      )
      .where(
        and(
          eq(technicalProductFamilies.id, productId),
          eq(technicalProductFamilies.active, true),
          eq(manufacturers.active, true),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return undefined;
    const revision = (await this.revisionsFor([productId])).get(productId);
    if (!revision) return undefined;
    const variants = await this.db
      .select()
      .from(commercialVariants)
      .where(
        and(
          eq(commercialVariants.productId, productId),
          eq(commercialVariants.active, true),
        ),
      )
      .orderBy(asc(commercialVariants.name), asc(commercialVariants.id));
    return catalogProductDetailSchema.parse({
      product: productFromRow(row.product),
      manufacturer: manufacturerFromRow(row.manufacturer),
      currentRevision: revision,
      variants: variants.map(variantFromRow),
    });
  }

  async getRevision(productId: string, revisionId: string) {
    const rows = await this.db
      .select({
        revision: technicalProductRevisions,
        product: technicalProductFamilies,
        manufacturer: manufacturers,
      })
      .from(technicalProductRevisions)
      .innerJoin(
        technicalProductFamilies,
        eq(technicalProductRevisions.productId, technicalProductFamilies.id),
      )
      .innerJoin(
        manufacturers,
        eq(technicalProductFamilies.manufacturerId, manufacturers.id),
      )
      .where(
        and(
          eq(technicalProductRevisions.id, revisionId),
          eq(technicalProductRevisions.productId, productId),
          eq(technicalProductFamilies.active, true),
          eq(manufacturers.active, true),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row
      ? catalogRevisionDetailSchema.parse({
          revision: revisionFromRow(row.revision),
          product: productFromRow(row.product),
          manufacturer: manufacturerFromRow(row.manufacturer),
        })
      : undefined;
  }

  async status() {
    const [products, revisions, variants, lastImport] = await Promise.all([
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(technicalProductFamilies)
        .where(eq(technicalProductFamilies.active, true)),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(technicalProductRevisions),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(commercialVariants)
        .where(eq(commercialVariants.active, true)),
      this.db
        .select({ completedAt: catalogImportBatches.completedAt })
        .from(catalogImportBatches)
        .where(eq(catalogImportBatches.status, 'completed'))
        .orderBy(desc(catalogImportBatches.completedAt))
        .limit(1),
    ]);
    return {
      technicalProducts: Number(products[0]?.count ?? 0),
      technicalRevisions: Number(revisions[0]?.count ?? 0),
      commercialVariants: Number(variants[0]?.count ?? 0),
      ...(lastImport[0]?.completedAt
        ? { lastImportAt: lastImport[0].completedAt }
        : {}),
    };
  }

  async readImportState(ids: {
    manufacturerIds: string[];
    productIds: string[];
    revisionIds: string[];
    variantIds: string[];
  }) {
    const manufacturerRows = ids.manufacturerIds.length
      ? await this.db
          .select()
          .from(manufacturers)
          .where(inArray(manufacturers.id, ids.manufacturerIds))
      : [];
    const productRows = ids.productIds.length
      ? await this.db
          .select()
          .from(technicalProductFamilies)
          .where(inArray(technicalProductFamilies.id, ids.productIds))
      : [];
    const revisionRows = ids.revisionIds.length
      ? await this.db
          .select()
          .from(technicalProductRevisions)
          .where(inArray(technicalProductRevisions.id, ids.revisionIds))
      : [];
    const variantRows = ids.variantIds.length
      ? await this.db
          .select()
          .from(commercialVariants)
          .where(inArray(commercialVariants.id, ids.variantIds))
      : [];
    return {
      manufacturers: manufacturerRows.map(manufacturerFromRow),
      products: productRows.map(productFromRow),
      revisions: revisionRows.map(revisionFromRow),
      variants: variantRows.map(variantFromRow),
    };
  }

  async applyImport(input: {
    manufacturers: Manufacturer[];
    products: TechnicalProductFamily[];
    revisions: TechnicalProductRevision[];
    variants: CommercialVariant[];
    audit: Parameters<CatalogImportRepository['applyImport']>[0]['audit'];
  }) {
    await this.db.transaction(async (tx) => {
      for (const item of input.manufacturers)
        await tx
          .insert(manufacturers)
          .values(item)
          .onDuplicateKeyUpdate({
            set: {
              slug: item.slug,
              name: item.name,
              countryCode: orNull(item.countryCode),
              websiteUrl: orNull(item.websiteUrl),
              active: item.active,
            },
          });
      for (const item of input.products)
        await tx
          .insert(technicalProductFamilies)
          .values(item)
          .onDuplicateKeyUpdate({
            set: { slug: item.slug, name: item.name, active: item.active },
          });
      if (input.revisions.length)
        await tx
          .insert(technicalProductRevisions)
          .values(input.revisions.map(revisionValues));
      for (const item of input.variants)
        await tx
          .insert(commercialVariants)
          .values(item)
          .onDuplicateKeyUpdate({
            set: {
              sku: orNull(item.sku),
              name: item.name,
              color: orNull(item.color),
              finish: orNull(item.finish),
              metadata: orNull(item.metadata),
              active: item.active,
            },
          });
      await tx.insert(catalogImportBatches).values({
        id: input.audit.id,
        sourceId: input.audit.sourceId,
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
}
