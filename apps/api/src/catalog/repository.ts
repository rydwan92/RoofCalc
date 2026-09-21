import type {
  CatalogProductDetail,
  CatalogProductKind,
  CatalogRevisionDetail,
  CommercialVariant,
  Manufacturer,
  TechnicalProductFamily,
  TechnicalProductRevision,
} from '@cieslacalc/catalog-core';

export interface CatalogRepositorySearch {
  q?: string;
  kind?: CatalogProductKind;
  manufacturerId?: string;
  limit: number;
  offset: number;
}

export interface CatalogSearchRecord {
  manufacturer: Manufacturer;
  product: TechnicalProductFamily;
  currentRevision: TechnicalProductRevision;
  variantCount: number;
}

export interface CatalogRepository {
  listManufacturers(): Promise<Manufacturer[]>;
  searchProducts(
    query: CatalogRepositorySearch,
  ): Promise<{ items: CatalogSearchRecord[]; hasMore: boolean }>;
  getProduct(productId: string): Promise<CatalogProductDetail | undefined>;
  getRevision(
    productId: string,
    revisionId: string,
  ): Promise<CatalogRevisionDetail | undefined>;
  status(): Promise<CatalogStatus>;
}

export interface CatalogStatus {
  technicalProducts: number;
  technicalRevisions: number;
  commercialVariants: number;
  lastImportAt?: string;
}

export interface CatalogImportState {
  manufacturers: Manufacturer[];
  products: TechnicalProductFamily[];
  revisions: TechnicalProductRevision[];
  variants: CommercialVariant[];
}

export interface CatalogImportAudit {
  id: string;
  sourceId: string;
  sourceLabel: string;
  checksum: string;
  startedAt: string;
  completedAt: string;
  status: 'completed';
  counts: unknown;
}

export interface CatalogImportRepository {
  readImportState(ids: {
    manufacturerIds: string[];
    productIds: string[];
    revisionIds: string[];
    variantIds: string[];
  }): Promise<CatalogImportState>;
  applyImport(input: {
    manufacturers: Manufacturer[];
    products: TechnicalProductFamily[];
    revisions: TechnicalProductRevision[];
    variants: CommercialVariant[];
    audit: CatalogImportAudit;
  }): Promise<void>;
}
