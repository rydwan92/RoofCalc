import {
  catalogProductDetailSchema,
  catalogRevisionDetailSchema,
  commercialVariantSchema,
  manufacturerSchema,
  technicalProductFamilySchema,
  technicalProductRevisionSchema,
  type CatalogProductDetail,
  type CatalogRevisionDetail,
  type CatalogImportBatchV1,
  type CommercialVariant,
  type Manufacturer,
  type TechnicalProductFamily,
  type TechnicalProductRevision,
} from '@cieslacalc/catalog-core';
import type {
  CatalogImportRepository,
  CatalogRepository,
  CatalogRepositorySearch,
  CatalogSearchRecord,
} from './repository';

export class MemoryCatalogRepository
  implements CatalogRepository, CatalogImportRepository
{
  private manufacturers = new Map<string, Manufacturer>();
  private products = new Map<string, TechnicalProductFamily>();
  private revisions = new Map<string, TechnicalProductRevision>();
  private variants = new Map<string, CommercialVariant>();
  readonly audits: unknown[] = [];

  constructor(
    seed?: Partial<Omit<CatalogImportBatchV1, 'schemaVersion' | 'source'>>,
  ) {
    for (const item of seed?.manufacturers ?? [])
      this.manufacturers.set(item.id, manufacturerSchema.parse(item));
    for (const item of seed?.products ?? [])
      this.products.set(item.id, technicalProductFamilySchema.parse(item));
    for (const item of seed?.revisions ?? [])
      this.revisions.set(item.id, technicalProductRevisionSchema.parse(item));
    for (const item of seed?.variants ?? [])
      this.variants.set(item.id, commercialVariantSchema.parse(item));
  }

  async listManufacturers(): Promise<Manufacturer[]> {
    return [...this.manufacturers.values()]
      .filter((item) => item.active)
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }

  private currentRevision(productId: string) {
    return [...this.revisions.values()]
      .filter((item) => item.productId === productId)
      .sort(
        (a, b) =>
          (b.validFrom ?? '').localeCompare(a.validFrom ?? '') ||
          b.revisionCode.localeCompare(a.revisionCode) ||
          b.id.localeCompare(a.id),
      )[0];
  }

  async searchProducts(
    query: CatalogRepositorySearch,
  ): Promise<{ items: CatalogSearchRecord[]; hasMore: boolean }> {
    const needle = query.q?.trim().toLocaleLowerCase();
    const matches = [...this.products.values()]
      .filter((product) => {
        const manufacturer = this.manufacturers.get(product.manufacturerId);
        return Boolean(
          product.active &&
          manufacturer?.active &&
          (!query.kind || product.coveringKind === query.kind) &&
          (!query.manufacturerId ||
            product.manufacturerId === query.manufacturerId) &&
          (!needle ||
            product.name.toLocaleLowerCase().includes(needle) ||
            manufacturer?.name.toLocaleLowerCase().includes(needle)),
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const page = matches.slice(query.offset, query.offset + query.limit + 1);
    const items = page.slice(0, query.limit).flatMap((product) => {
      const manufacturer = this.manufacturers.get(product.manufacturerId);
      const currentRevision = this.currentRevision(product.id);
      if (!manufacturer || !currentRevision) return [];
      return [
        {
          manufacturer,
          product,
          currentRevision,
          variantCount: [...this.variants.values()].filter(
            (item) => item.productId === product.id && item.active,
          ).length,
        },
      ];
    });
    return { items, hasMore: page.length > query.limit };
  }

  async getProduct(
    productId: string,
  ): Promise<CatalogProductDetail | undefined> {
    const product = this.products.get(productId);
    const manufacturer = product
      ? this.manufacturers.get(product.manufacturerId)
      : undefined;
    const currentRevision = this.currentRevision(productId);
    if (!product?.active || !manufacturer?.active || !currentRevision)
      return undefined;
    return catalogProductDetailSchema.parse({
      manufacturer,
      product,
      currentRevision,
      variants: [...this.variants.values()]
        .filter((item) => item.productId === productId && item.active)
        .sort(
          (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
        ),
    });
  }

  async getRevision(
    productId: string,
    revisionId: string,
  ): Promise<CatalogRevisionDetail | undefined> {
    const product = this.products.get(productId);
    const manufacturer = product
      ? this.manufacturers.get(product.manufacturerId)
      : undefined;
    const revision = this.revisions.get(revisionId);
    if (
      !product?.active ||
      !manufacturer?.active ||
      !revision ||
      revision.productId !== productId
    )
      return undefined;
    return catalogRevisionDetailSchema.parse({
      manufacturer,
      product,
      revision,
    });
  }

  async status() {
    const last = this.audits.at(-1) as { completedAt?: string } | undefined;
    return {
      technicalProducts: [...this.products.values()].filter(
        (item) => item.active,
      ).length,
      technicalRevisions: this.revisions.size,
      commercialVariants: [...this.variants.values()].filter(
        (item) => item.active,
      ).length,
      ...(last?.completedAt ? { lastImportAt: last.completedAt } : {}),
    };
  }

  async readImportState(ids: {
    manufacturerIds: string[];
    productIds: string[];
    revisionIds: string[];
    variantIds: string[];
  }) {
    return {
      manufacturers: ids.manufacturerIds.flatMap((id) =>
        this.manufacturers.has(id) ? [this.manufacturers.get(id)!] : [],
      ),
      products: ids.productIds.flatMap((id) =>
        this.products.has(id) ? [this.products.get(id)!] : [],
      ),
      revisions: ids.revisionIds.flatMap((id) =>
        this.revisions.has(id) ? [this.revisions.get(id)!] : [],
      ),
      variants: ids.variantIds.flatMap((id) =>
        this.variants.has(id) ? [this.variants.get(id)!] : [],
      ),
    };
  }

  async applyImport(
    input: Parameters<CatalogImportRepository['applyImport']>[0],
  ) {
    // Validate a complete next state before swapping maps: tests get transaction semantics.
    const nextManufacturers = new Map(this.manufacturers);
    const nextProducts = new Map(this.products);
    const nextRevisions = new Map(this.revisions);
    const nextVariants = new Map(this.variants);
    for (const item of input.manufacturers)
      nextManufacturers.set(item.id, manufacturerSchema.parse(item));
    for (const item of input.products)
      nextProducts.set(item.id, technicalProductFamilySchema.parse(item));
    for (const item of input.revisions)
      nextRevisions.set(item.id, technicalProductRevisionSchema.parse(item));
    for (const item of input.variants)
      nextVariants.set(item.id, commercialVariantSchema.parse(item));
    this.manufacturers = nextManufacturers;
    this.products = nextProducts;
    this.revisions = nextRevisions;
    this.variants = nextVariants;
    this.audits.push(structuredClone(input.audit));
  }
}
