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
import {
  assortmentBulkFlagsRequestSchema,
  assortmentCreateRequestSchema,
  assortmentDetailResponseSchema,
  assortmentFlagsRequestSchema,
  assortmentImportRequestSchema,
  assortmentLinkRequestSchema,
  assortmentPriceCreateRequestSchema,
  assortmentPreviewResponseSchema,
  assortmentQuerySchema,
  assortmentUnlinkRequestSchema,
  organizationAssortmentResponseSchema,
  organizationPricesResponseSchema,
  organizationsResponseSchema,
} from '@cieslacalc/business-core';
import { CatalogService, CatalogServiceError } from '../catalog/service';
import { PricingService, PricingServiceError } from '../pricing/service';
import { BusinessService, BusinessServiceError } from '../business/service';
import {
  BusinessAdminError,
  BusinessAdminService,
} from '../business/admin-service';
import {
  adminWritesAllowed,
  type AdminRequestContext,
} from '../business/capability';

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

/**
 * V54 business surface. Read services are always safe to pass; `admin` is only
 * constructed by the Node server, and even then every mutation re-checks the
 * local/dev capability gate per request (`business/capability.ts`). The
 * Cloudflare Worker never passes one, so the edge deployment has no write
 * surface at all (§33, §53).
 */
export interface BusinessApi {
  service: BusinessService;
  admin?: BusinessAdminService;
  /** Per-request transport facts the capability gate needs. */
  request?: AdminRequestContext;
}

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
  business?: BusinessApi,
  /** Parsed JSON body, supplied by the transport for admin mutations only. */
  body?: unknown,
): Promise<ApiResult> {
  const businessPath = pathname.startsWith('/api/business/');
  if (method === 'POST' && businessPath)
    return handleBusinessAdmin(pathname, business, body);
  if (method !== 'GET' && method !== 'HEAD')
    return errorResult(404, 'not-found');
  if (pathname === '/api/health') return healthResult(health);
  const catalogPath = pathname.startsWith('/api/catalog/');
  const pricingPath = pathname.startsWith('/api/pricing/');
  if (catalogPath && !catalog) return errorResult(503, 'catalog-unavailable');
  if (pricingPath && !pricing) return errorResult(503, 'pricing-unavailable');
  if (businessPath && !business)
    return errorResult(503, 'business-unavailable');
  try {
    if (businessPath)
      return await handleBusinessRead(pathname, search, business!.service);
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
    if (error instanceof BusinessServiceError)
      return errorResult(
        error.code.endsWith('not-found') ? 404 : 400,
        error.code,
      );
    if (error instanceof ZodError || error instanceof URIError)
      return errorResult(
        400,
        businessPath
          ? 'business-invalid-request'
          : pricingPath
            ? 'pricing-invalid-request'
            : 'catalog-invalid-request',
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
      businessPath
        ? 'business-internal-error'
        : pricingPath
          ? 'pricing-internal-error'
          : 'catalog-internal-error',
    );
  }
  return errorResult(404, 'not-found');
}

/**
 * `GET /api/business/...` — organization reads. Edge-compatible: the same
 * services run under Node and the Cloudflare Worker (§53).
 */
async function handleBusinessRead(
  pathname: string,
  search: URLSearchParams,
  service: BusinessService,
): Promise<ApiResult> {
  if (pathname === '/api/business/organizations')
    return json(
      organizationsResponseSchema.parse({
        items: await service.listOrganizations(),
      }),
    );
  const segments = pathname.split('/');
  const organizationResource =
    segments[1] === 'api' &&
    segments[2] === 'business' &&
    segments[3] === 'organizations' &&
    segments.length === 6;
  if (!organizationResource) return errorResult(404, 'not-found');
  const organizationId = decodeURIComponent(segments[4]!);
  const atDate = search.get('at') ?? undefined;
  if (atDate !== undefined && !isValidDateString(atDate))
    return errorResult(400, 'business-invalid-request');

  if (segments[5] === 'assortment') {
    const parameters = Object.fromEntries(search.entries());
    delete parameters.at;
    const query = assortmentQuerySchema.parse(parameters);
    const result = await service.assortment(organizationId, query, atDate);
    return json(organizationAssortmentResponseSchema.parse(result));
  }
  if (segments[5] === 'assortment-detail') {
    const itemId = search.get('itemId');
    if (!itemId) return errorResult(400, 'business-invalid-request');
    return json(
      assortmentDetailResponseSchema.parse(
        await service.assortmentDetail(organizationId, itemId),
      ),
    );
  }
  if (segments[5] === 'prices') {
    const ids = (search.get('ids') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    return json(
      organizationPricesResponseSchema.parse(
        await service.pricesForVariants(organizationId, ids, atDate),
      ),
    );
  }
  return errorResult(404, 'not-found');
}

/**
 * `POST /api/business/...` — admin mutations, **disabled unless** the
 * local/dev capability gate passes. A refused request is `404 not-found`, not
 * `403`: with no authentication to negotiate, the honest answer is that no
 * such endpoint is available here. Nothing about the admin surface is
 * disclosed to a remote caller.
 */
async function handleBusinessAdmin(
  pathname: string,
  business: BusinessApi | undefined,
  body: unknown,
): Promise<ApiResult> {
  const admin = business?.admin;
  if (!admin || !adminWritesAllowed(business?.request ?? {}))
    return errorResult(404, 'not-found');
  const segments = pathname.split('/');
  if (
    segments[1] !== 'api' ||
    segments[2] !== 'business' ||
    segments[3] !== 'organizations' ||
    segments.length !== 7 ||
    segments[5] !== 'assortment'
  )
    return errorResult(404, 'not-found');
  const organizationId = decodeURIComponent(segments[4]!);
  const action = segments[6]!;
  try {
    if (action === 'link') {
      const request = assortmentLinkRequestSchema.parse(body);
      return json({
        item: await admin.link(
          organizationId,
          request.itemId,
          request.commercialVariantId,
        ),
      });
    }
    if (action === 'unlink') {
      const request = assortmentUnlinkRequestSchema.parse(body);
      return json({ item: await admin.unlink(organizationId, request.itemId) });
    }
    if (action === 'flags') {
      const { itemId, ...flags } = assortmentFlagsRequestSchema.parse(body);
      return json({
        item: await admin.setFlags(organizationId, itemId, flags),
      });
    }
    if (action === 'bulk-flags') {
      const { itemIds, ...flags } =
        assortmentBulkFlagsRequestSchema.parse(body);
      return json({
        items: await admin.setFlagsBulk(organizationId, itemIds, flags),
      });
    }
    if (action === 'create') {
      const request = assortmentCreateRequestSchema.parse(body);
      return json({ item: await admin.createItem(organizationId, request) });
    }
    if (action === 'price') {
      const request = assortmentPriceCreateRequestSchema.parse(body);
      return json({ entry: await admin.addPrice(organizationId, request) });
    }
    if (action === 'import') {
      const request = assortmentImportRequestSchema.parse(body);
      return json(
        assortmentPreviewResponseSchema.parse(
          await admin.importCsv(organizationId, request),
        ),
      );
    }
  } catch (error) {
    if (error instanceof BusinessAdminError)
      return errorResult(
        error.code.endsWith('not-found') ? 404 : 400,
        error.code,
      );
    if (error instanceof ZodError)
      return errorResult(400, 'business-invalid-request');
    return errorResult(500, 'business-internal-error');
  }
  return errorResult(404, 'not-found');
}
