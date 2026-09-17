import { ZodError, z } from 'zod';
import type { DatabaseHealth, HealthResponse } from '@cieslacalc/shared';
import {
  catalogIdSchema,
  catalogManufacturersResponseSchema,
  catalogProductResponseSchema,
  catalogRevisionResponseSchema,
  catalogSearchQuerySchema,
  catalogSearchResponseSchema,
} from '@cieslacalc/catalog-core';
import {
  isValidDateString,
  priceListEntrySchema,
} from '@cieslacalc/pricing-core';
import { CatalogService, CatalogServiceError } from '../catalog/service';
import { PricingService, PricingServiceError } from '../pricing/service';

export interface ApiResult {
  status: number;
  body: unknown;
}

const json = (body: unknown, status = 200): ApiResult => ({ status, body });
const errorResult = (status: number, code: string) =>
  json({ error: { code } }, status);

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

/** Shared endpoint semantics for Express and Cloudflare Fetch transports. */
export interface HealthContext {
  runtime: HealthResponse['runtime'];
  /** Runs a trivial read; must never throw driver details to the caller. */
  probeDatabase?: () => Promise<void>;
}

const HEALTH_PROBE_TIMEOUT_MS = 5000;

export async function databaseHealth(
  probe: HealthContext['probeDatabase'],
): Promise<DatabaseHealth> {
  if (!probe) return 'not-configured';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      probe(),
      new Promise((_, reject) => {
        timer = setTimeout(reject, HEALTH_PROBE_TIMEOUT_MS);
      }),
    ]);
    return 'connected';
  } catch {
    return 'unavailable';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Health stays HTTP 200 whenever the API process answers: the calculator
 * core does not need the database, so a DB outage is `degraded`, not down.
 */
export async function healthResult(context: HealthContext): Promise<ApiResult> {
  const database = await databaseHealth(context.probeDatabase);
  const body: HealthResponse = {
    status: database === 'connected' ? 'ok' : 'degraded',
    service: 'cieslacalc-api',
    version: '0.1.0',
    runtime: context.runtime,
    database,
  };
  return json(body);
}

export async function handleApiRequest(
  method: string,
  pathname: string,
  search: URLSearchParams,
  catalog?: CatalogService,
  pricing?: PricingService,
  health: HealthContext = { runtime: 'node' },
): Promise<ApiResult> {
  if (method !== 'GET' && method !== 'HEAD')
    return errorResult(404, 'not-found');
  if (pathname === '/api/health') return healthResult(health);
  const catalogPath = pathname.startsWith('/api/catalog/');
  const pricingPath = pathname.startsWith('/api/pricing/');
  if (catalogPath && !catalog) return errorResult(503, 'catalog-unavailable');
  if (pricingPath && !pricing) return errorResult(503, 'pricing-unavailable');
  try {
    if (pathname === '/api/catalog/manufacturers')
      return json(
        catalogManufacturersResponseSchema.parse({
          items: await catalog!.listManufacturers(),
        }),
      );
    if (pathname === '/api/catalog/products') {
      const query = catalogSearchQuerySchema.parse(
        Object.fromEntries(search.entries()),
      );
      return json(
        catalogSearchResponseSchema.parse(await catalog!.searchProducts(query)),
      );
    }
    const segments = pathname.split('/');
    const productResource =
      segments[1] === 'api' &&
      segments[2] === 'catalog' &&
      segments[3] === 'products';
    if (
      productResource &&
      segments.length === 7 &&
      segments[5] === 'revisions'
    ) {
      const productId = catalogIdSchema.parse(decodeURIComponent(segments[4]!));
      const revisionId = catalogIdSchema.parse(
        decodeURIComponent(segments[6]!),
      );
      return json(
        catalogRevisionResponseSchema.parse({
          item: await catalog!.getRevision(productId, revisionId),
        }),
      );
    }
    if (productResource && segments.length === 5) {
      const productId = catalogIdSchema.parse(decodeURIComponent(segments[4]!));
      return json(
        catalogProductResponseSchema.parse({
          item: await catalog!.getProduct(productId),
        }),
      );
    }
    if (pathname === '/api/pricing/variants') {
      const atDate = search.get('at') ?? undefined;
      if (atDate !== undefined && !isValidDateString(atDate))
        return errorResult(400, 'pricing-invalid-request');
      const ids = (search.get('ids') ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      return json(
        pricingVariantsResponseSchema.parse({
          items: await pricing!.pricesForVariants(ids, atDate),
        }),
      );
    }
  } catch (error) {
    if (error instanceof ZodError || error instanceof URIError)
      return errorResult(
        400,
        pricingPath ? 'pricing-invalid-request' : 'catalog-invalid-request',
      );
    if (error instanceof CatalogServiceError)
      return errorResult(
        error.code.endsWith('not-found') ? 404 : 400,
        error.code,
      );
    if (error instanceof PricingServiceError)
      return errorResult(400, error.code);
    return errorResult(
      500,
      pricingPath ? 'pricing-internal-error' : 'catalog-internal-error',
    );
  }
  return errorResult(404, 'not-found');
}
