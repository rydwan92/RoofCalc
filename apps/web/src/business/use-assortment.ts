import { useEffect, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type {
  AssortmentQuery,
  OrganizationAssortmentRow,
} from '@cieslacalc/business-core';
import { useBusiness } from './context';

/**
 * Server state for the active organization's assortment. TanStack Query owns
 * it; nothing is copied into Zustand, exactly as catalogue data is not (V24).
 *
 * Every hook here is disabled outside business mode, so STANDARD mode issues
 * no business request at all — a calculation never waits on a wholesaler (§65).
 */

export function useAssortment(query: Partial<AssortmentQuery> = {}) {
  const { organizationId, client, mode } = useBusiness();
  return useQuery({
    queryKey: ['business', 'assortment', organizationId, query],
    queryFn: ({ signal }) => client.assortment(organizationId!, query, signal),
    enabled: mode === 'business' && Boolean(organizationId),
    retry: false,
    staleTime: 30_000,
  });
}

export function useInfiniteAssortment(
  query: Omit<Partial<AssortmentQuery>, 'cursor'> = {},
) {
  const { organizationId, client, mode } = useBusiness();
  return useInfiniteQuery({
    queryKey: ['business', 'assortment-infinite', organizationId, query],
    queryFn: ({ signal, pageParam }) =>
      client.assortment(
        organizationId!,
        { ...query, ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
      ),
    initialPageParam: '' as string,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: mode === 'business' && Boolean(organizationId),
    retry: false,
    staleTime: 30_000,
  });
}

export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, value]);
  return debounced;
}

/**
 * The organization's price for a set of catalogue variants, keyed by variant.
 * A variant the organization does not sell is simply absent from the map —
 * callers must render "poza asortymentem", never invent a price (§17, §41).
 */
export function useOrganizationPrices(variantIds: readonly string[]) {
  const { organizationId, client, mode } = useBusiness();
  const ids = [...new Set(variantIds)].filter(Boolean).sort();
  const query = useQuery({
    queryKey: ['business', 'prices', organizationId, ids],
    queryFn: ({ signal }) =>
      client.pricesForVariants(organizationId!, ids, signal),
    enabled: mode === 'business' && Boolean(organizationId) && ids.length > 0,
    retry: false,
    staleTime: 60_000,
  });
  return {
    items: query.data?.items ?? [],
    byVariantId: new Map(
      (query.data?.items ?? []).map((item) => [item.commercialVariantId, item]),
    ),
    isPending: query.isPending,
    isError: query.isError,
  };
}

/** Rows a picker may offer for one product kind: active and catalogue-mapped. */
export function pickerRows(
  rows: readonly OrganizationAssortmentRow[],
  kind: string,
): OrganizationAssortmentRow[] {
  return rows.filter(
    (row) => row.state === 'matched' && row.catalog?.kind === kind,
  );
}
