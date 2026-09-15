import {
  catalogApiErrorSchema,
  catalogManufacturersResponseSchema,
  catalogProductResponseSchema,
  catalogRevisionResponseSchema,
  catalogSearchResponseSchema,
  type CatalogProductDetail,
  type CatalogRevisionDetail,
  type CatalogSearchQuery,
  type Manufacturer,
} from '@cieslacalc/catalog-core';
import type { z } from 'zod';
import { resolveApiBaseUrl } from '../api-base';

export class CatalogClientError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export interface CatalogClient {
  listManufacturers(signal?: AbortSignal): Promise<Manufacturer[]>;
  searchProducts(
    query: CatalogSearchQuery,
    signal?: AbortSignal,
  ): Promise<z.infer<typeof catalogSearchResponseSchema>>;
  getProduct(id: string, signal?: AbortSignal): Promise<CatalogProductDetail>;
  getRevision(
    productId: string,
    revisionId: string,
    signal?: AbortSignal,
  ): Promise<CatalogRevisionDetail>;
}

async function requestJson<T>(
  url: string,
  schema: { parse(value: unknown): T },
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal,
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new CatalogClientError('catalog-unavailable');
  }
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const parsed = catalogApiErrorSchema.safeParse(payload);
    throw new CatalogClientError(
      parsed.success ? parsed.data.error.code : 'catalog-unavailable',
    );
  }
  try {
    return schema.parse(payload);
  } catch {
    throw new CatalogClientError('catalog-invalid-response');
  }
}

export class HttpCatalogClient implements CatalogClient {
  constructor(private readonly baseUrl = `${resolveApiBaseUrl()}/catalog`) {}

  async listManufacturers(signal?: AbortSignal) {
    return (
      await requestJson(
        `${this.baseUrl}/manufacturers`,
        catalogManufacturersResponseSchema,
        signal,
      )
    ).items;
  }

  searchProducts(query: CatalogSearchQuery, signal?: AbortSignal) {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.kind) params.set('kind', query.kind);
    if (query.manufacturerId)
      params.set('manufacturerId', query.manufacturerId);
    if (query.limit) params.set('limit', String(query.limit));
    if (query.cursor) params.set('cursor', query.cursor);
    return requestJson(
      `${this.baseUrl}/products?${params}`,
      catalogSearchResponseSchema,
      signal,
    );
  }

  async getProduct(id: string, signal?: AbortSignal) {
    return (
      await requestJson(
        `${this.baseUrl}/products/${encodeURIComponent(id)}`,
        catalogProductResponseSchema,
        signal,
      )
    ).item;
  }

  async getRevision(
    productId: string,
    revisionId: string,
    signal?: AbortSignal,
  ) {
    return (
      await requestJson(
        `${this.baseUrl}/products/${encodeURIComponent(productId)}/revisions/${encodeURIComponent(revisionId)}`,
        catalogRevisionResponseSchema,
        signal,
      )
    ).item;
  }
}

export const catalogClient = new HttpCatalogClient();
