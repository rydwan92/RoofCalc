import type {
  AssortmentQuery,
  AssortmentImportAudit,
  AssortmentSummary,
  Organization,
  OrganizationAssortmentItem,
  OrganizationPriceList,
} from '@cieslacalc/business-core';
import type { PriceListEntry } from '@cieslacalc/pricing-core';

/**
 * The business layer's persistence boundary. Services depend on these
 * interfaces, never on Drizzle, so normal unit and API tests run without
 * MariaDB — the same split `CatalogRepository` and `PricingRepository` use.
 *
 * **Every method is organization-scoped by signature.** There is deliberately
 * no `listAllAssortmentItems()`: a caller cannot accidentally read across
 * tenants, because no method exists that would let it (§58).
 */

export interface BusinessRepository {
  listOrganizations(): Promise<Organization[]>;
  getOrganization(organizationId: string): Promise<Organization | undefined>;
  /** Every row this organization owns. Never another organization's rows. */
  assortmentForOrganization(
    organizationId: string,
  ): Promise<OrganizationAssortmentItem[]>;
  assortmentItemForOrganization(
    organizationId: string,
    itemId: string,
  ): Promise<OrganizationAssortmentItem | undefined>;
  /** Bounded, server-side assortment search. Never materializes the full list. */
  searchAssortment(
    organizationId: string,
    query: AssortmentQuery,
    offset: number,
    atDate: string,
  ): Promise<{
    items: OrganizationAssortmentItem[];
    nextCursor?: string;
  }>;
  assortmentSummaryForOrganization(
    organizationId: string,
    atDate: string,
  ): Promise<AssortmentSummary>;
  /**
   * The price lists this organization may see: its own plus the global,
   * source-backed lists. The filter lives in the query, not only in pure code.
   */
  visiblePriceLists(
    organizationId: string | undefined,
  ): Promise<OrganizationPriceList[]>;
  entriesForPriceLists(
    priceListIds: string[],
    variantIds?: string[],
  ): Promise<PriceListEntry[]>;
}

/** Catalogue display facts for a set of variants, joined by the API layer. */
export interface AssortmentCatalogFacts {
  productId: string;
  productName: string;
  manufacturerId: string;
  manufacturerName: string;
  kind: string;
  currentRevisionId: string;
  variantId: string;
  variantName: string;
  variantSku?: string;
}

/**
 * The narrow catalogue read the business layer needs. Deliberately its own
 * interface rather than `CatalogRepository`: the business service must be able
 * to *display* catalogue identity, not to browse or import the catalogue.
 */
export interface BusinessCatalogReader {
  factsForVariants(variantIds: string[]): Promise<AssortmentCatalogFacts[]>;
  /** Match candidates for an import run. Bounded by the caller's page size. */
  matchCandidates(limit: number): Promise<AssortmentCatalogFacts[]>;
  variantExists(variantId: string): Promise<boolean>;
}

export interface BusinessAdminRepository {
  /** Insert missing starter rows only; never reuse interactive import upserts. */
  ensureStarterData(input: {
    organization: Organization;
    assortment: OrganizationAssortmentItem[];
    priceList: OrganizationPriceList;
    entries: PriceListEntry[];
  }): Promise<void>;
  /** Used by the demo seeder; never reachable from an HTTP route. */
  upsertOrganization(organization: Organization): Promise<void>;
  upsertAssortmentItems(
    organizationId: string,
    items: OrganizationAssortmentItem[],
  ): Promise<void>;
  createAssortmentItemWithPrice(input: {
    item: OrganizationAssortmentItem;
    priceList?: OrganizationPriceList;
    priceEntry?: PriceListEntry;
  }): Promise<void>;
  updateAssortmentItem(
    organizationId: string,
    itemId: string,
    patch: {
      commercialVariantId?: string | null;
      active?: boolean;
      preferred?: boolean;
      displayNameOverride?: string | null;
    },
  ): Promise<OrganizationAssortmentItem | undefined>;
  updateAssortmentItemsFlags(
    organizationId: string,
    itemIds: string[],
    flags: { active?: boolean; preferred?: boolean },
  ): Promise<OrganizationAssortmentItem[]>;
  recordImport(audit: AssortmentImportAudit): Promise<void>;
  applyAssortmentImport(input: {
    organizationId: string;
    items: OrganizationAssortmentItem[];
    priceList?: OrganizationPriceList;
    entries: PriceListEntry[];
    audit: AssortmentImportAudit;
  }): Promise<void>;
  /**
   * Organization-scoped price upsert. An import may only write into a price
   * list this organization owns; the service checks it before calling.
   */
  upsertOrganizationPrices(input: {
    priceList: OrganizationPriceList;
    entries: PriceListEntry[];
  }): Promise<void>;
}
