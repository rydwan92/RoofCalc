import {
  assortmentPreviewResponseSchema,
  businessApiErrorSchema,
  organizationAssortmentResponseSchema,
  organizationPricesResponseSchema,
  organizationsResponseSchema,
  type AssortmentPreviewResponse,
  type AssortmentQuery,
  type Organization,
  type OrganizationAssortmentItem,
  type OrganizationAssortmentResponse,
  type OrganizationPricesResponse,
} from '@cieslacalc/business-core';
import { z } from 'zod';
import { resolveApiBaseUrl } from '../api-base';

/**
 * Typed HTTP client for `/api/business`, mirroring `CatalogClient`'s shape and
 * dependency-injection pattern so tests never need a server.
 *
 * Note what is *not* here and never will be: a database connection string, an
 * admin password or any credential. Every write goes browser → API →
 * repository → database (§34); the browser has no privileged path of its own,
 * and the admin routes only answer at all behind the server's local/dev gate.
 */

export class BusinessClientError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const itemResponseSchema = z.object({ item: z.unknown() });

async function requestJson<T>(
  url: string,
  schema: { parse(value: unknown): T },
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new BusinessClientError('business-unavailable');
  }
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const parsed = businessApiErrorSchema.safeParse(payload);
    throw new BusinessClientError(
      parsed.success ? parsed.data.error.code : 'business-unavailable',
    );
  }
  try {
    return schema.parse(payload);
  } catch {
    throw new BusinessClientError('business-invalid-response');
  }
}

export interface BusinessClient {
  listOrganizations(signal?: AbortSignal): Promise<Organization[]>;
  assortment(
    organizationId: string,
    query: Partial<AssortmentQuery>,
    signal?: AbortSignal,
  ): Promise<OrganizationAssortmentResponse>;
  pricesForVariants(
    organizationId: string,
    variantIds: readonly string[],
    signal?: AbortSignal,
  ): Promise<OrganizationPricesResponse>;
  /** Admin: only answers when the server's local/dev capability is enabled. */
  link(
    organizationId: string,
    itemId: string,
    commercialVariantId: string,
  ): Promise<OrganizationAssortmentItem>;
  unlink(
    organizationId: string,
    itemId: string,
  ): Promise<OrganizationAssortmentItem>;
  setFlags(
    organizationId: string,
    itemId: string,
    flags: {
      active?: boolean;
      preferred?: boolean;
      displayNameOverride?: string | null;
    },
  ): Promise<OrganizationAssortmentItem>;
  importCsv(
    organizationId: string,
    input: {
      sourceLabel: string;
      csv: string;
      mapping: Record<string, string>;
      apply: boolean;
    },
  ): Promise<AssortmentPreviewResponse>;
}

export class HttpBusinessClient implements BusinessClient {
  constructor(private readonly baseUrl = `${resolveApiBaseUrl()}/business`) {}

  private organizationUrl(organizationId: string) {
    return `${this.baseUrl}/organizations/${encodeURIComponent(organizationId)}`;
  }

  async listOrganizations(signal?: AbortSignal) {
    return (
      await requestJson(
        `${this.baseUrl}/organizations`,
        organizationsResponseSchema,
        { signal },
      )
    ).items;
  }

  assortment(
    organizationId: string,
    query: Partial<AssortmentQuery>,
    signal?: AbortSignal,
  ) {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.filter) params.set('filter', query.filter);
    if (query.kind) params.set('kind', query.kind);
    if (query.manufacturerId)
      params.set('manufacturerId', query.manufacturerId);
    if (query.preferredOnly) params.set('preferredOnly', 'true');
    if (query.limit) params.set('limit', String(query.limit));
    if (query.cursor) params.set('cursor', query.cursor);
    return requestJson(
      `${this.organizationUrl(organizationId)}/assortment?${params}`,
      organizationAssortmentResponseSchema,
      { signal },
    );
  }

  pricesForVariants(
    organizationId: string,
    variantIds: readonly string[],
    signal?: AbortSignal,
  ) {
    const params = new URLSearchParams({ ids: [...variantIds].join(',') });
    return requestJson(
      `${this.organizationUrl(organizationId)}/prices?${params}`,
      organizationPricesResponseSchema,
      { signal },
    );
  }

  private async mutate(
    organizationId: string,
    action: string,
    body: unknown,
  ): Promise<OrganizationAssortmentItem> {
    const result = await requestJson(
      `${this.organizationUrl(organizationId)}/assortment/${action}`,
      itemResponseSchema,
      { method: 'POST', body: JSON.stringify(body) },
    );
    return result.item as OrganizationAssortmentItem;
  }

  link(organizationId: string, itemId: string, commercialVariantId: string) {
    return this.mutate(organizationId, 'link', { itemId, commercialVariantId });
  }

  unlink(organizationId: string, itemId: string) {
    return this.mutate(organizationId, 'unlink', { itemId });
  }

  setFlags(
    organizationId: string,
    itemId: string,
    flags: {
      active?: boolean;
      preferred?: boolean;
      displayNameOverride?: string | null;
    },
  ) {
    return this.mutate(organizationId, 'flags', { itemId, ...flags });
  }

  importCsv(
    organizationId: string,
    input: {
      sourceLabel: string;
      csv: string;
      mapping: Record<string, string>;
      apply: boolean;
    },
  ) {
    return requestJson(
      `${this.organizationUrl(organizationId)}/assortment/import`,
      assortmentPreviewResponseSchema,
      { method: 'POST', body: JSON.stringify(input) },
    );
  }
}

export const businessClient = new HttpBusinessClient();
