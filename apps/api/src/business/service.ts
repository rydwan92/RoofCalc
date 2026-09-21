import {
  assortmentState,
  resolveOrganizationItemPrice,
  type AssortmentQuery,
  type AssortmentDetailResponse,
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
    const offset = decodeCursor(query.cursor);
    const effectiveDate = atDate ?? new Date().toISOString().slice(0, 10);
    const [page, summary] = await Promise.all([
      this.repository.searchAssortment(
        organizationId,
        query,
        offset,
        effectiveDate,
      ),
      this.repository.assortmentSummaryForOrganization(
        organizationId,
        effectiveDate,
      ),
    ]);
    const { rows } = await this.decorate(
      organization,
      page.items,
      effectiveDate,
    );
    return {
      organization,
      items: rows,
      summary,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  }

  async assortmentDetail(
    organizationId: string,
    itemId: string,
  ): Promise<AssortmentDetailResponse> {
    const organization = await this.requireOrganization(organizationId);
    const item = await this.repository.assortmentItemForOrganization(
      organizationId,
      itemId,
    );
    if (!item) throw new BusinessServiceError('assortment-item-not-found');
    const { rows } = await this.decorate(organization, [item]);
    const ownLists = (
      await this.repository.visiblePriceLists(organizationId)
    ).filter((list) => list.organizationId === organizationId);
    const entries = item.commercialVariantId
      ? await this.repository.entriesForPriceLists(
          ownLists.map((list) => list.id),
          [item.commercialVariantId],
        )
      : [];
    const lists = new Map(ownLists.map((list) => [list.id, list]));
    return {
      row: rows[0]!,
      priceHistory: entries
        .map((entry) => {
          const list = lists.get(entry.priceListId);
          return list
            ? {
                priceListId: list.id,
                priceListLabel: list.ownerLabel,
                entryId: entry.id,
                netAmountMinor: entry.netAmountMinor,
                currencyCode: list.currencyCode,
                saleUnit: entry.saleUnit,
                validFrom: entry.validFrom,
                ...(entry.validTo ? { validTo: entry.validTo } : {}),
              }
            : undefined;
        })
        .filter((price): price is NonNullable<typeof price> => Boolean(price))
        .sort(
          (a, b) =>
            b.validFrom.localeCompare(a.validFrom) ||
            a.entryId.localeCompare(b.entryId),
        ),
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
    const wanted = new Set(variantIds);
    const { priceLists, entries } = await this.priceData(organizationId, [
      ...wanted,
    ]);
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

  private async priceData(organizationId: string, variantIds?: string[]) {
    const priceLists = await this.repository.visiblePriceLists(organizationId);
    const entries = await this.repository.entriesForPriceLists(
      priceLists.map((list) => list.id),
      variantIds,
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
    const { priceLists, entries } = await this.priceData(
      organization.id,
      variantIds,
    );
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

/** Opaque offset cursor, same convention as the catalogue search API. */
function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const parsed = Number(cursor);
  if (!Number.isInteger(parsed) || parsed < 0)
    throw new BusinessServiceError('business-invalid-request');
  return parsed;
}
