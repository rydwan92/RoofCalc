import { useMemo } from 'react';
import type { VariantPrice } from '../pricing/client';
import { useBusiness } from './context';
import { useOrganizationPrices } from './use-assortment';

/**
 * The prices the Cost workspace should actually suggest (§40, §41).
 *
 * In STANDARD mode this returns the catalogue prices unchanged — the exact
 * pre-V54 behaviour, with no business request involved (§65).
 *
 * In BUSINESS mode the active organization's price is the **primary**
 * commercial suggestion, and the fallback is an explicit, configured policy
 * rather than a silent substitution:
 *
 * - `organization-only` (the default, strict wholesaler mode): a variant with
 *   no organization price gets **no price at all**, so the workspace says
 *   "Brak ceny w cenniku hurtowni" rather than quietly showing a retail
 *   observation as if the wholesaler had quoted it;
 * - `organization-then-catalogue`: the global source-backed price is used, and
 *   keeps its own `ownerLabel`, so the UI still names where the number came
 *   from. Source switching is never hidden.
 *
 * Prices from two organizations are never combined: `useOrganizationPrices`
 * only ever asks for the one active organization, and the server refuses to
 * answer for any other (§40, §58).
 */
export function useEffectiveVariantPrices(
  cataloguePrices: readonly VariantPrice[],
  variantIds: readonly string[],
): VariantPrice[] {
  const { mode, organization, pricePolicy } = useBusiness();
  const { byVariantId } = useOrganizationPrices(
    mode === 'business' ? variantIds : [],
  );
  return useMemo(() => {
    if (mode !== 'business' || !organization) return [...cataloguePrices];
    const organizationPrices: VariantPrice[] = [];
    for (const [variantId, row] of byVariantId) {
      if (!row.price) continue;
      organizationPrices.push({
        variantId,
        entry: {
          id: row.price.entryId,
          priceListId: row.price.priceListId,
          commercialVariantId: variantId,
          saleUnit: row.price.saleUnit,
          netAmountMinor: row.price.netAmountMinor,
          validFrom: row.price.validFrom,
          ...(row.price.validTo ? { validTo: row.price.validTo } : {}),
        },
        currencyCode: row.price.currencyCode,
        // This label is what the workspace prints as "Cennik: …" (§39).
        ownerLabel: row.price.priceListLabel,
      });
    }
    if (pricePolicy === 'organization-only') return organizationPrices;
    const priced = new Set(organizationPrices.map((price) => price.variantId));
    return [
      ...organizationPrices,
      ...cataloguePrices.filter((price) => !priced.has(price.variantId)),
    ];
  }, [byVariantId, cataloguePrices, mode, organization, pricePolicy]);
}
