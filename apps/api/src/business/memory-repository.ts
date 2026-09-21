import {
  assortmentState,
  resolveOrganizationItemPrice,
  sortForPicker,
  visiblePriceLists as visibleLists,
  type AssortmentQuery,
  type AssortmentImportAudit,
  type AssortmentSummary,
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

  assortmentItemForOrganization(
    organizationId: string,
    itemId: string,
  ): Promise<OrganizationAssortmentItem | undefined> {
    const item = this.state.assortment.find(
      (candidate) =>
        candidate.organizationId === organizationId && candidate.id === itemId,
    );
    return Promise.resolve(item ? structuredClone(item) : undefined);
  }

  searchAssortment(
    organizationId: string,
    query: AssortmentQuery,
    offset: number,
    atDate: string,
  ): Promise<{
    items: OrganizationAssortmentItem[];
    nextCursor?: string;
  }> {
    const organization = this.state.organizations.find(
      (candidate) => candidate.id === organizationId,
    );
    if (!organization) return Promise.resolve({ items: [] });
    const facts = new Map(
      this.state.catalog.map((entry) => [entry.variantId, entry]),
    );
    const rows = sortForPicker(
      this.state.assortment.filter((item) => {
        if (item.organizationId !== organizationId) return false;
        const catalog = item.commercialVariantId
          ? facts.get(item.commercialVariantId)
          : undefined;
        const state = assortmentState(item);
        const hasPrice = this.hasCurrentPrice(item, organization, atDate);
        const preferred = query.preferred ?? query.preferredOnly;
        if (query.state && state !== query.state) return false;
        if (query.active !== undefined && item.active !== query.active)
          return false;
        if (preferred !== undefined && item.preferred !== preferred)
          return false;
        if (query.hasPrice !== undefined && hasPrice !== query.hasPrice)
          return false;
        if (query.kind && catalog?.kind !== query.kind) return false;
        if (
          query.manufacturerId &&
          catalog?.manufacturerId !== query.manufacturerId
        )
          return false;
        if (
          query.manufacturer &&
          !catalog?.manufacturerName
            .toLocaleLowerCase()
            .startsWith(query.manufacturer.toLocaleLowerCase())
        )
          return false;
        if (!matchesLegacyFilter(query.filter, state, item, hasPrice))
          return false;
        if (!matchesSearch(query.q, item, catalog)) return false;
        return true;
      }),
    );
    const page = rows.slice(offset, offset + query.limit);
    const nextOffset = offset + query.limit;
    return Promise.resolve({
      items: page.map((item) => structuredClone(item)),
      ...(nextOffset < rows.length ? { nextCursor: String(nextOffset) } : {}),
    });
  }

  assortmentSummaryForOrganization(
    organizationId: string,
    atDate: string,
  ): Promise<AssortmentSummary> {
    const organization = this.state.organizations.find(
      (candidate) => candidate.id === organizationId,
    );
    const items = this.state.assortment.filter(
      (item) => item.organizationId === organizationId,
    );
    const summary: AssortmentSummary = {
      total: items.length,
      matched: 0,
      unmatched: 0,
      inactive: 0,
      withoutPrice: 0,
    };
    for (const item of items) {
      const state = assortmentState(item);
      summary[state] += 1;
      if (
        item.active &&
        (!organization || !this.hasCurrentPrice(item, organization, atDate))
      )
        summary.withoutPrice += 1;
    }
    return Promise.resolve(summary);
  }

  private hasCurrentPrice(
    item: OrganizationAssortmentItem,
    organization: Organization,
    atDate: string,
  ): boolean {
    return Boolean(
      resolveOrganizationItemPrice({
        context: { organization, pricePolicy: 'organization-only' },
        item,
        priceLists: visibleLists(this.state.priceLists, organization.id),
        entries: this.state.entries,
        atDate,
      }).price,
    );
  }

  visiblePriceLists(
    organizationId: string | undefined,
  ): Promise<OrganizationPriceList[]> {
    return Promise.resolve(visibleLists(this.state.priceLists, organizationId));
  }

  entriesForPriceLists(
    priceListIds: string[],
    variantIds?: string[],
  ): Promise<PriceListEntry[]> {
    const allowed = new Set(priceListIds);
    const variants = variantIds ? new Set(variantIds) : undefined;
    return Promise.resolve(
      this.state.entries.filter(
        (entry) =>
          allowed.has(entry.priceListId) &&
          (!variants || variants.has(entry.commercialVariantId)),
      ),
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

  async createAssortmentItemWithPrice(input: {
    item: OrganizationAssortmentItem;
    priceList?: OrganizationPriceList;
    priceEntry?: PriceListEntry;
  }): Promise<void> {
    await this.upsertAssortmentItems(input.item.organizationId, [input.item]);
    if (input.priceList && input.priceEntry)
      await this.upsertOrganizationPrices({
        priceList: input.priceList,
        entries: [input.priceEntry],
      });
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

  updateAssortmentItemsFlags(
    organizationId: string,
    itemIds: string[],
    flags: { active?: boolean; preferred?: boolean },
  ): Promise<OrganizationAssortmentItem[]> {
    const wanted = new Set(itemIds);
    const updated: OrganizationAssortmentItem[] = [];
    for (const item of this.state.assortment) {
      if (item.organizationId !== organizationId || !wanted.has(item.id))
        continue;
      if (flags.active !== undefined) item.active = flags.active;
      if (flags.preferred !== undefined) item.preferred = flags.preferred;
      updated.push(structuredClone(item));
    }
    return Promise.resolve(updated);
  }

  recordImport(audit: AssortmentImportAudit): Promise<void> {
    this.state.audits.push(audit);
    return Promise.resolve();
  }

  async applyAssortmentImport(input: {
    organizationId: string;
    items: OrganizationAssortmentItem[];
    priceList?: OrganizationPriceList;
    entries: PriceListEntry[];
    audit: AssortmentImportAudit;
  }): Promise<void> {
    await this.upsertAssortmentItems(input.organizationId, input.items);
    if (input.priceList && input.entries.length)
      await this.upsertOrganizationPrices({
        priceList: input.priceList,
        entries: input.entries,
      });
    await this.recordImport(input.audit);
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

function matchesLegacyFilter(
  filter: AssortmentQuery['filter'],
  state: ReturnType<typeof assortmentState>,
  item: OrganizationAssortmentItem,
  hasPrice: boolean,
): boolean {
  switch (filter) {
    case 'active':
      return item.active;
    case 'unmatched':
      return state === 'unmatched';
    case 'without-price':
      return item.active && !hasPrice;
    case 'inactive':
      return state === 'inactive';
    case 'preferred':
      return item.preferred;
    case 'all':
      return true;
  }
}

function matchesSearch(
  query: string | undefined,
  item: OrganizationAssortmentItem,
  catalog: AssortmentCatalogFacts | undefined,
): boolean {
  const needle = query?.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [
    item.externalKey,
    item.ean,
    item.sourceName,
    item.displayNameOverride,
    catalog?.manufacturerName,
    catalog?.productName,
    catalog?.variantName,
    catalog?.variantSku,
  ].some((value) => value?.toLocaleLowerCase().startsWith(needle));
}
