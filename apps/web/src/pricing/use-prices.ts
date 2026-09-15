import { useQuery } from '@tanstack/react-query';
import { pricingClient, type PricingClient, type VariantPrice } from './client';

/**
 * Active price-list entries for a set of catalogue variant IDs, keyed by
 * variant ID. A missing key means no active price exists — callers must
 * never invent one; `apps/web` is the only place a `price-list`-sourced
 * price may pre-fill a cost line (`docs/ARCHITECTURE_V34C_MATERIAL_
 * TRUTHFULNESS_AND_CATALOGUE.md`).
 */
export function usePriceOptions(
  variantIds: readonly string[],
  client: PricingClient = pricingClient,
) {
  const sortedIds = [...new Set(variantIds)].sort();
  const query = useQuery({
    queryKey: ['pricing', 'variants', sortedIds],
    queryFn: () => client.pricesForVariants(sortedIds),
    enabled: sortedIds.length > 0,
    staleTime: 60_000,
  });
  return query.data ?? [];
}

export function usePricesForVariants(
  variantIds: readonly string[],
  client: PricingClient = pricingClient,
) {
  const options = usePriceOptions(variantIds, client);
  const byVariantId = new Map<string, VariantPrice>();
  for (const row of options) {
    if (
      options.filter((candidate) => candidate.variantId === row.variantId)
        .length === 1
    )
      byVariantId.set(row.variantId, row);
  }
  return byVariantId;
}
