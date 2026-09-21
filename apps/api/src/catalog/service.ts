import {
  catalogIdSchema,
  catalogSearchQuerySchema,
  technicalPreview,
  type CatalogProductDetail,
  type CatalogProductSummary,
  type CatalogRevisionDetail,
  type CatalogSearchQuery,
  type Manufacturer,
} from '@cieslacalc/catalog-core';
import type { CatalogRepository } from './repository';

export class CatalogServiceError extends Error {
  constructor(
    readonly code:
      | 'catalog-invalid-cursor'
      | 'catalog-product-not-found'
      | 'catalog-revision-not-found',
  ) {
    super(code);
  }
}

function encodeCursor(offset: number) {
  return Buffer.from(String(offset), 'utf8').toString('base64url');
}

function decodeCursor(cursor?: string) {
  if (!cursor) return 0;
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    if (!/^\d+$/.test(raw)) throw new Error('invalid');
    const offset = Number(raw);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('invalid');
    return offset;
  } catch {
    throw new CatalogServiceError('catalog-invalid-cursor');
  }
}

export class CatalogService {
  constructor(private readonly repository: CatalogRepository) {}

  listManufacturers(): Promise<Manufacturer[]> {
    return this.repository.listManufacturers();
  }

  status() {
    return this.repository.status();
  }

  async searchProducts(
    input: CatalogSearchQuery,
  ): Promise<{ items: CatalogProductSummary[]; nextCursor?: string }> {
    const query = catalogSearchQuerySchema.parse(input);
    const offset = decodeCursor(query.cursor);
    const page = await this.repository.searchProducts({ ...query, offset });
    return {
      items: page.items.map((item) => ({
        id: item.product.id,
        manufacturer: {
          id: item.manufacturer.id,
          name: item.manufacturer.name,
        },
        name: item.product.name,
        kind: item.product.coveringKind,
        currentRevisionId: item.currentRevision.id,
        variantCount: item.variantCount,
        technicalPreview: technicalPreview(item.currentRevision.technicalSpec),
      })),
      nextCursor: page.hasMore ? encodeCursor(offset + query.limit) : undefined,
    };
  }

  async getProduct(productId: string): Promise<CatalogProductDetail> {
    catalogIdSchema.parse(productId);
    const product = await this.repository.getProduct(productId);
    if (!product) throw new CatalogServiceError('catalog-product-not-found');
    return product;
  }

  async getRevision(
    productId: string,
    revisionId: string,
  ): Promise<CatalogRevisionDetail> {
    catalogIdSchema.parse(productId);
    catalogIdSchema.parse(revisionId);
    const revision = await this.repository.getRevision(productId, revisionId);
    if (!revision) throw new CatalogServiceError('catalog-revision-not-found');
    return revision;
  }
}
