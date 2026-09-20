import {
  visiblePriceLists as visibleLists,
  type AssortmentImportAudit,
  type Organization,
  type OrganizationAssortmentItem,
  type OrganizationPriceList,
} from '@cieslacalc/business-core';
import type { PriceListEntry } from '@cieslacalc/pricing-core';
import type {
  AssortmentCatalogFacts,
  BusinessAdminRepository,
  BusinessCatalogReader,
  BusinessRepository,
} from './repository';

export interface BusinessMemoryState {
  organizations: Organization[];
  assortment: OrganizationAssortmentItem[];
  priceLists: OrganizationPriceList[];
  entries: PriceListEntry[];
  catalog: AssortmentCatalogFacts[];
  audits: AssortmentImportAudit[];
}

/**
 * In-memory business store for unit/API tests, mirroring
 * `InMemoryCatalogRepository`'s role. It deliberately re-implements the same
 * organization filters the SQL repository applies: a tenant-isolation test that
 * only ever ran against a permissive fake would prove nothing.
 */
export class InMemoryBusinessRepository
  implements BusinessRepository, BusinessAdminRepository, BusinessCatalogReader
{
  readonly state: BusinessMemoryState;

  constructor(state: Partial<BusinessMemoryState> = {}) {
    this.state = {
      organizations: [],
      assortment: [],
      priceLists: [],
      entries: [],
      catalog: [],
      audits: [],
      ...state,
    };
  }

  listOrganizations(): Promise<Organization[]> {
    return Promise.resolve(
      [...this.state.organizations].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );
  }

  getOrganization(organizationId: string): Promise<Organization | undefined> {
    return Promise.resolve(
      this.state.organizations.find(
        (organization) => organization.id === organizationId,
      ),
    );
  }

  assortmentForOrganization(
    organizationId: string,
  ): Promise<OrganizationAssortmentItem[]> {
    return Promise.resolve(
      this.state.assortment
        .filter((item) => item.organizationId === organizationId)
        .map((item) => structuredClone(item)),
    );
  }

  visiblePriceLists(
    organizationId: string | undefined,
  ): Promise<OrganizationPriceList[]> {
    return Promise.resolve(visibleLists(this.state.priceLists, organizationId));
  }

  entriesForPriceLists(priceListIds: string[]): Promise<PriceListEntry[]> {
    const allowed = new Set(priceListIds);
    return Promise.resolve(
      this.state.entries.filter((entry) => allowed.has(entry.priceListId)),
    );
  }

  factsForVariants(variantIds: string[]): Promise<AssortmentCatalogFacts[]> {
    const wanted = new Set(variantIds);
    return Promise.resolve(
      this.state.catalog.filter((facts) => wanted.has(facts.variantId)),
    );
  }

  matchCandidates(limit: number): Promise<AssortmentCatalogFacts[]> {
    return Promise.resolve(this.state.catalog.slice(0, limit));
  }

  variantExists(variantId: string): Promise<boolean> {
    return Promise.resolve(
      this.state.catalog.some((facts) => facts.variantId === variantId),
    );
  }

  upsertOrganization(organization: Organization): Promise<void> {
    const position = this.state.organizations.findIndex(
      (candidate) => candidate.id === organization.id,
    );
    if (position >= 0) this.state.organizations[position] = organization;
    else this.state.organizations.push(organization);
    return Promise.resolve();
  }

  upsertAssortmentItems(
    organizationId: string,
    items: OrganizationAssortmentItem[],
  ): Promise<void> {
    for (const item of items) {
      if (item.organizationId !== organizationId)
        throw new Error('organization-mismatch');
      const position = this.state.assortment.findIndex(
        (existing) =>
          existing.organizationId === organizationId &&
          existing.externalKey === item.externalKey,
      );
      if (position >= 0)
        this.state.assortment[position] = {
          ...this.state.assortment[position]!,
          ...item,
          id: this.state.assortment[position]!.id,
        };
      else this.state.assortment.push(structuredClone(item));
    }
    return Promise.resolve();
  }

  updateAssortmentItem(
    organizationId: string,
    itemId: string,
    patch: Parameters<BusinessAdminRepository['updateAssortmentItem']>[2],
  ): Promise<OrganizationAssortmentItem | undefined> {
    const item = this.state.assortment.find(
      (candidate) =>
        candidate.id === itemId && candidate.organizationId === organizationId,
    );
    if (!item) return Promise.resolve(undefined);
    if (patch.commercialVariantId === null) delete item.commercialVariantId;
    else if (patch.commercialVariantId !== undefined)
      item.commercialVariantId = patch.commercialVariantId;
    if (patch.active !== undefined) item.active = patch.active;
    if (patch.preferred !== undefined) item.preferred = patch.preferred;
    if (patch.displayNameOverride === null) delete item.displayNameOverride;
    else if (patch.displayNameOverride !== undefined)
      item.displayNameOverride = patch.displayNameOverride;
    return Promise.resolve(structuredClone(item));
  }

  recordImport(audit: AssortmentImportAudit): Promise<void> {
    this.state.audits.push(audit);
    return Promise.resolve();
  }

  upsertOrganizationPrices(input: {
    priceList: OrganizationPriceList;
    entries: PriceListEntry[];
  }): Promise<void> {
    const position = this.state.priceLists.findIndex(
      (list) => list.id === input.priceList.id,
    );
    if (position >= 0) this.state.priceLists[position] = input.priceList;
    else this.state.priceLists.push(input.priceList);
    for (const entry of input.entries) {
      const existing = this.state.entries.findIndex(
        (candidate) => candidate.id === entry.id,
      );
      if (existing >= 0) this.state.entries[existing] = entry;
      else this.state.entries.push(entry);
    }
    return Promise.resolve();
  }
}
