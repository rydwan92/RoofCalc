import {
  priceListEntrySchema,
  type PriceListEntry,
} from '@cieslacalc/pricing-core';
import { z } from 'zod';
import { resolveApiBaseUrl } from '../api-base';

const pricingVariantsResponseSchema = z.object({
  items: z.array(
    z.object({
      variantId: z.string(),
      entry: priceListEntrySchema,
      currencyCode: z.string(),
      ownerLabel: z.string().optional(),
      taxContext: z.string().optional(),
    }),
  ),
});

export class PricingClientError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export interface VariantPrice {
  variantId: string;
  entry: PriceListEntry;
  currencyCode: string;
  ownerLabel?: string;
  taxContext?: string;
}

export interface PricingClient {
  pricesForVariants(
    variantIds: string[],
    signal?: AbortSignal,
  ): Promise<VariantPrice[]>;
}

export class HttpPricingClient implements PricingClient {
  constructor(private readonly baseUrl = `${resolveApiBaseUrl()}/pricing`) {}

  async pricesForVariants(variantIds: string[], signal?: AbortSignal) {
    if (!variantIds.length) return [];
    const params = new URLSearchParams({ ids: variantIds.join(',') });
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/variants?${params}`, {
        signal,
        headers: { Accept: 'application/json' },
      });
    } catch {
      throw new PricingClientError('pricing-unavailable');
    }
    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const code =
        payload &&
        typeof payload === 'object' &&
        'error' in payload &&
        payload.error &&
        typeof payload.error === 'object' &&
        'code' in payload.error &&
        typeof payload.error.code === 'string'
          ? payload.error.code
          : 'pricing-unavailable';
      throw new PricingClientError(code);
    }
    try {
      return pricingVariantsResponseSchema.parse(payload).items;
    } catch {
      throw new PricingClientError('pricing-invalid-response');
    }
  }
}

export const pricingClient = new HttpPricingClient();
