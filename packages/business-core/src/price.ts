import type { PriceListEntry } from '@cieslacalc/pricing-core';
import { assortmentItemForVariant, assortmentState } from './assortment';
import type {
  OrganizationAssortmentItem,
  OrganizationContext,
  OrganizationPriceList,
  OrganizationPriceResult,
  ResolvedOrganizationPrice,
} from './model';

/**
 * Organization price resolution (§11). Pure: no geometry, no quantity, no
 * catalogue. It answers one question — *what does this organization charge for
 * this catalogue variant today, and where did that number come from* — and it
 * never invents an answer.
 *
 * Two invariants this function exists to protect:
 *
 * 1. **Tenant isolation.** A price list owned by another organization is never
 *    considered, whatever the caller passes in (§10, §58). The filter is here,
 *    in pure code, as well as in the repository query — defence in depth.
 * 2. **Visible provenance.** The result always carries its price list, owner
 *    label and validity, so the UI can say *"Cennik: Hurtownia Demo"* instead
 *    of an anonymous "catalogue price" (§39, §41).
 */

export interface OrganizationPriceInput {
  context: OrganizationContext;
  commercialVariantId: string;
  /** The organization's own assortment rows (any organization's; filtered). */
  assortment: readonly OrganizationAssortmentItem[];
  priceLists: readonly OrganizationPriceList[];
  entries: readonly PriceListEntry[];
  /** UTC calendar date; defaults to today. */
  atDate?: string;
  /** When given, only a price in this exact sale unit may be used. */
  saleUnit?: PriceListEntry['saleUnit'];
}

function activeAt(
  range: { validFrom: string; validTo?: string },
  atDate: string,
): boolean {
  return (
    range.validFrom <= atDate &&
    (range.validTo === undefined || range.validTo >= atDate)
  );
}

function resolved(
  entry: PriceListEntry,
  list: OrganizationPriceList,
  source: ResolvedOrganizationPrice['source'],
): ResolvedOrganizationPrice {
  return {
    source,
    ...(list.organizationId ? { organizationId: list.organizationId } : {}),
    priceListId: list.id,
    priceListLabel: list.ownerLabel,
    entryId: entry.id,
    commercialVariantId: entry.commercialVariantId,
    saleUnit: entry.saleUnit,
    netAmountMinor: entry.netAmountMinor,
    currencyCode: list.currencyCode,
    validFrom: entry.validFrom,
    ...(entry.validTo ? { validTo: entry.validTo } : {}),
  };
}

/**
 * The newest active entry wins, tie-broken by entry ID so the result is
 * deterministic — the same rule `pricing-core`'s `resolvePriceForVariant`
 * already uses, applied inside one already-isolated candidate set.
 */
function newest(
  candidates: readonly ResolvedOrganizationPrice[],
): ResolvedOrganizationPrice | undefined {
  return [...candidates].sort(
    (a, b) =>
      b.validFrom.localeCompare(a.validFrom) ||
      a.entryId.localeCompare(b.entryId),
  )[0];
}

export function resolveOrganizationPrice(
  input: OrganizationPriceInput,
): OrganizationPriceResult {
  const item = assortmentItemForVariant(
    input.assortment,
    input.context.organization.id,
    input.commercialVariantId,
  );
  if (!item) return { missing: 'not-in-assortment' };
  return resolveOrganizationItemPrice({ ...input, item });
}

/**
 * The same resolution keyed by an assortment **row** rather than by a
 * catalogue variant. The Admin assortment list needs this: it prices every row
 * the organization has, including the ones RoofCalc cannot identify, so it can
 * say *"niepowiązany"* rather than showing an empty price cell that looks like
 * a missing price.
 */
export function resolveOrganizationItemPrice(
  input: Omit<OrganizationPriceInput, 'commercialVariantId' | 'assortment'> & {
    item: OrganizationAssortmentItem;
  },
): OrganizationPriceResult {
  const { context, item, priceLists, entries, saleUnit } = input;
  const atDate = input.atDate ?? new Date().toISOString().slice(0, 10);
  const organizationId = context.organization.id;
  if (item.organizationId !== organizationId)
    return { missing: 'not-in-assortment' };
  const state = assortmentState(item);
  if (state === 'inactive') return { missing: 'assortment-inactive' };
  if (state === 'unmatched') return { missing: 'assortment-unmatched' };
  const commercialVariantId = item.commercialVariantId!;

  const candidates = (
    owner: (list: OrganizationPriceList) => boolean,
    source: ResolvedOrganizationPrice['source'],
  ) => {
    const lists = priceLists.filter(
      (list) => owner(list) && activeAt(list, atDate),
    );
    const byId = new Map(lists.map((list) => [list.id, list]));
    return entries.flatMap((entry) => {
      const list = byId.get(entry.priceListId);
      if (!list) return [];
      if (entry.commercialVariantId !== commercialVariantId) return [];
      if (!activeAt(entry, atDate)) return [];
      if (saleUnit !== undefined && entry.saleUnit !== saleUnit) return [];
      if (list.currencyCode !== context.organization.currencyCode) return [];
      return [resolved(entry, list, source)];
    });
  };

  const organizationPrice = newest(
    candidates(
      (list) => list.organizationId === organizationId,
      'organization',
    ),
  );
  if (organizationPrice) return { price: organizationPrice };
  if (context.pricePolicy === 'organization-only')
    return { missing: 'no-organization-price' };

  const cataloguePrice = newest(
    candidates((list) => list.organizationId === undefined, 'catalogue'),
  );
  return cataloguePrice ? { price: cataloguePrice } : { missing: 'no-price' };
}

/**
 * The price lists one organization is allowed to see: its own, plus the
 * global source-backed lists. Another organization's list is never included —
 * this is the single place the visibility rule is written for readers that do
 * not go through `resolveOrganizationPrice` (§10).
 */
export function visiblePriceLists(
  priceLists: readonly OrganizationPriceList[],
  organizationId: string | undefined,
): OrganizationPriceList[] {
  return priceLists.filter(
    (list) =>
      list.organizationId === undefined ||
      (organizationId !== undefined && list.organizationId === organizationId),
  );
}
