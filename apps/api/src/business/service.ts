import {
  assortmentState,
  assortmentSummary,
  resolveOrganizationItemPrice,
  sortForPicker,
  type AssortmentQuery,
  type Organization,
  type OrganizationAssortmentItem,
  type OrganizationAssortmentResponse,
  type OrganizationAssortmentRow,
  type OrganizationContext,
  type OrganizationPricesResponse,
  type ResolvedOrganizationPrice,
} from '@cieslacalc/business-core';
import type {
  AssortmentCatalogFacts,
  BusinessCatalogReader,
  BusinessRepository,
} from './repository';

export class BusinessServiceError extends Error {
  constructor(
    readonly code:
      | 'business-invalid-request'
      | 'organization-not-found'
      | 'assortment-item-not-found',
  ) {
    super(code);
  }
}

/**
 * Read-only business service.
 *
 * Every public method takes an `organizationId` and resolves the organization
 * first; a caller can never obtain rows or prices without naming the tenant it
 * is asking for. Isolation is enforced in three independent places — the
 * repository query, this service, and `business-core`'s pure resolver — so no
 * single mistake can leak one wholesaler's commercial data to another (§58).
 */
export class BusinessService {
  constructor(
    private readonly repository: BusinessRepository,
    private readonly catalog: BusinessCatalogReader,
  ) {}

  listOrganizations(): Promise<Organization[]> {
    return this.repository.listOrganizations();
  }

  private async requireOrganization(
    organizationId: string,
  ): Promise<Organization> {
    if (!organizationId.trim())
      throw new BusinessServiceError('business-invalid-request');
    const organization = await this.repository.getOrganization(organizationId);
    if (!organization) throw new BusinessServiceError('organization-not-found');
    return organization;
  }

  /**
   * Loads one organization's assortment joined with catalogue display facts
   * and its resolved prices. Returned in one payload because every consumer —
   * the Admin list, the business picker and the dashboard — needs all three,
   * and three round trips per keystroke would be worse (§51).
   */
  async assortment(
    organizationId: string,
    query: AssortmentQuery,
    atDate?: string,
  ): Promise<OrganizationAssortmentResponse> {
    const organization = await this.requireOrganization(organizationId);
    const items =
      await this.repository.assortmentForOrganization(organizationId);
    const { rows } = await this.decorate(organization, items, atDate);

    const filtered = rows
      .filter((row) => matchesFilter(row, query))
      .filter((row) => matchesSearch(row, query.q));
    const ordered = sortForPicker(
      filtered.map((row) => row.item),
      (item) => item.displayNameOverride ?? item.sourceName,
    ).map((item) => filtered.find((row) => row.item.id === item.id)!);

    const offset = decodeCursor(query.cursor);
    const page = ordered.slice(offset, offset + query.limit);
    const nextOffset = offset + query.limit;
    return {
      organization,
      items: page,
      summary: assortmentSummary(items, organizationId, (item) =>
        rows.some((row) => row.item.id === item.id && row.price !== undefined),
      ),
      ...(nextOffset < ordered.length
        ? { nextCursor: String(nextOffset) }
        : {}),
    };
  }

  /**
   * Organization-scoped prices for already-known catalogue variants — the
   * business-mode counterpart of `/api/pricing/variants`. A variant the
   * organization does not sell comes back with a named `missing` reason rather
   * than a price from elsewhere (§17, §41).
   */
  async pricesForVariants(
    organizationId: string,
    variantIds: string[],
    atDate?: string,
  ): Promise<OrganizationPricesResponse> {
    const organization = await this.requireOrganization(organizationId);
    if (variantIds.some((id) => !id.trim()))
      throw new BusinessServiceError('business-invalid-request');
    const items =
      await this.repository.assortmentForOrganization(organizationId);
    const context: OrganizationContext = {
      organization,
      pricePolicy: 'organization-only',
    };
    const { priceLists, entries } = await this.priceData(organizationId);
    const wanted = new Set(variantIds);
    return {
      organizationId,
      items: [...wanted].map((commercialVariantId) => {
        const item = items.find(
          (candidate) =>
            candidate.commercialVariantId === commercialVariantId &&
            candidate.active,
        );
        if (!item)
          return {
            commercialVariantId,
            missing: 'not-in-assortment' as const,
          };
        const result = resolveOrganizationItemPrice({
          context,
          item,
          priceLists,
          entries,
          ...(atDate ? { atDate } : {}),
        });
        return {
          commercialVariantId,
          externalKey: item.externalKey,
          ...(result.price ? { price: toPricePayload(result.price) } : {}),
          ...(result.missing ? { missing: result.missing } : {}),
        };
      }),
    };
  }

  private async priceData(organizationId: string) {
    const priceLists = await this.repository.visiblePriceLists(organizationId);
    const entries = await this.repository.entriesForPriceLists(
      priceLists.map((list) => list.id),
    );
    return { priceLists, entries };
  }

  /** Joins rows with catalogue identity and price, without changing order. */
  private async decorate(
    organization: Organization,
    items: readonly OrganizationAssortmentItem[],
    atDate?: string,
  ): Promise<{ rows: OrganizationAssortmentRow[] }> {
    const variantIds = [
      ...new Set(
        items.flatMap((item) =>
          item.commercialVariantId ? [item.commercialVariantId] : [],
        ),
      ),
    ];
    const facts = variantIds.length
      ? await this.catalog.factsForVariants(variantIds)
      : [];
    const byVariant = new Map<string, AssortmentCatalogFacts>(
      facts.map((entry) => [entry.variantId, entry]),
    );
    const { priceLists, entries } = await this.priceData(organization.id);
    const context: OrganizationContext = {
      organization,
      pricePolicy: 'organization-only',
    };
    return {
      rows: items.map((item) => {
        const catalog = item.commercialVariantId
          ? byVariant.get(item.commercialVariantId)
          : undefined;
        const price = resolveOrganizationItemPrice({
          context,
          item,
          priceLists,
          entries,
          ...(atDate ? { atDate } : {}),
        }).price;
        return {
          item,
          state: assortmentState(item),
          ...(catalog ? { catalog } : {}),
          ...(price ? { price: toPricePayload(price) } : {}),
        };
      }),
    };
  }
}

function toPricePayload(price: ResolvedOrganizationPrice) {
  return {
    priceListId: price.priceListId,
    priceListLabel: price.priceListLabel,
    entryId: price.entryId,
    netAmountMinor: price.netAmountMinor,
    currencyCode: price.currencyCode,
    saleUnit: price.saleUnit,
    validFrom: price.validFrom,
    ...(price.validTo ? { validTo: price.validTo } : {}),
  };
}

function matchesFilter(
  row: OrganizationAssortmentRow,
  query: AssortmentQuery,
): boolean {
  if (query.kind && row.catalog?.kind !== query.kind) return false;
  if (
    query.manufacturerId &&
    row.catalog?.manufacturerId !== query.manufacturerId
  )
    return false;
  if (query.preferredOnly && !row.item.preferred) return false;
  switch (query.filter) {
    case 'active':
      return row.state !== 'inactive';
    case 'unmatched':
      return row.state === 'unmatched';
    case 'without-price':
      return row.state !== 'inactive' && row.price === undefined;
    case 'all':
      return true;
  }
}

/**
 * Searches the organization's own words *and* the catalogue identity, because
 * a salesperson types either the warehouse code or the product name (§15).
 */
function matchesSearch(
  row: OrganizationAssortmentRow,
  q: string | undefined,
): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [
    row.item.externalKey,
    row.item.sourceName,
    row.item.displayNameOverride,
    row.item.ean,
    row.catalog?.productName,
    row.catalog?.manufacturerName,
    row.catalog?.variantName,
    row.catalog?.variantSku,
  ].some((value) => value?.toLowerCase().includes(needle));
}

/** Opaque offset cursor, same convention as the catalogue search API. */
function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const parsed = Number(cursor);
  if (!Number.isInteger(parsed) || parsed < 0)
    throw new BusinessServiceError('business-invalid-request');
  return parsed;
}
