import {
  catalogProductDetailSchema,
  catalogRevisionDetailSchema,
  catalogSearchQuerySchema,
  technicalPreview,
  type CatalogImportBatchV1,
  type CatalogProductDetail,
  type CatalogProductSummary,
  type CatalogRevisionDetail,
  type CatalogSearchQuery,
  type CommercialVariant,
  type Manufacturer,
  type TechnicalProductFamily,
  type TechnicalProductRevision,
} from './index';

/**
 * Offline read model of the technical catalogue (ADR-013): the same import
 * batches the API seeds into SQL, indexed in memory and answering the same
 * read contracts (`CatalogProductSummary`, `CatalogProductDetail`,
 * `CatalogRevisionDetail`). A product chosen here carries the same immutable
 * revision IDs and technical snapshot as one chosen through the API.
 *
 * Search is forgiving where a person types on a phone: case- and
 * diacritic-insensitive ("dachowka" finds "Dachówka", "lat" finds "Łata"),
 * and every word must match somewhere in the product or manufacturer name.
 */

/** Lower case, no diacritics (incl. Polish ł), single spaces. */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLocaleLowerCase('pl')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The revision a product currently resolves to (newest validity first). */
export function currentRevisionOf(
  revisions: Iterable<TechnicalProductRevision>,
  productId: string,
): TechnicalProductRevision | undefined {
  return [...revisions]
    .filter((item) => item.productId === productId)
    .sort(
      (a, b) =>
        (b.validFrom ?? '').localeCompare(a.validFrom ?? '') ||
        b.revisionCode.localeCompare(a.revisionCode) ||
        b.id.localeCompare(a.id),
    )[0];
}

export interface OfflineCatalogue {
  /** Month of the newest data, shown wherever this catalogue is used. */
  readonly dataAsOf: string;
  listManufacturers(): Manufacturer[];
  searchProducts(query: CatalogSearchQuery): {
    items: CatalogProductSummary[];
    nextCursor?: string;
  };
  getProduct(productId: string): CatalogProductDetail | undefined;
  getRevision(
    productId: string,
    revisionId: string,
  ): CatalogRevisionDetail | undefined;
  status(): {
    technicalProducts: number;
    technicalRevisions: number;
    commercialVariants: number;
  };
}

const CURSOR = /^offset:(\d{1,6})$/;

/**
 * Indexes batches in manifest order: a later batch replaces an entity with
 * the same ID, exactly as the importer upserts mutable rows. Batches are
 * trusted build-time data already validated by `catalogImportBatchV1Schema`.
 */
export function createOfflineCatalogue(
  batches: readonly CatalogImportBatchV1[],
  dataAsOf: string,
): OfflineCatalogue {
  const manufacturers = new Map<string, Manufacturer>();
  const products = new Map<string, TechnicalProductFamily>();
  const revisions = new Map<string, TechnicalProductRevision>();
  const variants = new Map<string, CommercialVariant>();
  for (const batch of batches) {
    for (const item of batch.manufacturers) manufacturers.set(item.id, item);
    for (const item of batch.products) products.set(item.id, item);
    for (const item of batch.revisions) revisions.set(item.id, item);
    for (const item of batch.variants) variants.set(item.id, item);
  }
  const activeVariants = (productId: string) =>
    [...variants.values()]
      .filter((item) => item.productId === productId && item.active)
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const visible = (product: TechnicalProductFamily | undefined) => {
    const manufacturer = product
      ? manufacturers.get(product.manufacturerId)
      : undefined;
    return product?.active && manufacturer?.active ? manufacturer : undefined;
  };
  const haystack = new Map(
    [...products.values()].map((product) => [
      product.id,
      normalizeSearchText(
        `${product.name} ${manufacturers.get(product.manufacturerId)?.name ?? ''} ${product.slug}`,
      ),
    ]),
  );

  return {
    dataAsOf,
    listManufacturers: () =>
      [...manufacturers.values()]
        .filter((item) => item.active)
        .sort(
          (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
        ),
    searchProducts(input) {
      const query = catalogSearchQuerySchema.parse(input);
      const offset = Number(CURSOR.exec(query.cursor ?? '')?.[1] ?? 0);
      const words = query.q ? normalizeSearchText(query.q).split(' ') : [];
      const matches = [...products.values()]
        .filter(
          (product) =>
            visible(product) &&
            (!query.kind || product.coveringKind === query.kind) &&
            (!query.manufacturerId ||
              product.manufacturerId === query.manufacturerId) &&
            words.every((word) => haystack.get(product.id)!.includes(word)),
        )
        .sort(
          (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
        );
      const page = matches.slice(offset, offset + query.limit);
      const items = page.flatMap((product): CatalogProductSummary[] => {
        const manufacturer = visible(product)!;
        const revision = currentRevisionOf(revisions.values(), product.id);
        if (!revision) return [];
        return [
          {
            id: product.id,
            manufacturer: { id: manufacturer.id, name: manufacturer.name },
            name: product.name,
            kind: product.coveringKind,
            currentRevisionId: revision.id,
            variantCount: activeVariants(product.id).length,
            technicalPreview: technicalPreview(revision.technicalSpec),
          },
        ];
      });
      return {
        items,
        ...(offset + query.limit < matches.length
          ? { nextCursor: `offset:${offset + query.limit}` }
          : {}),
      };
    },
    getProduct(productId) {
      const product = products.get(productId);
      const manufacturer = visible(product);
      const currentRevision = currentRevisionOf(revisions.values(), productId);
      if (!product || !manufacturer || !currentRevision) return undefined;
      return catalogProductDetailSchema.parse({
        manufacturer,
        product,
        currentRevision,
        variants: activeVariants(productId),
      });
    },
    getRevision(productId, revisionId) {
      const product = products.get(productId);
      const manufacturer = visible(product);
      const revision = revisions.get(revisionId);
      if (!product || !manufacturer || revision?.productId !== productId)
        return undefined;
      return catalogRevisionDetailSchema.parse({
        manufacturer,
        product,
        revision,
      });
    },
    status: () => ({
      technicalProducts: [...products.values()].filter((item) => item.active)
        .length,
      technicalRevisions: revisions.size,
      commercialVariants: [...variants.values()].filter((item) => item.active)
        .length,
    }),
  };
}
