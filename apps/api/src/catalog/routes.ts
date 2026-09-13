import { Router, type Response } from 'express';
import { ZodError } from 'zod';
import {
  catalogIdSchema,
  catalogManufacturersResponseSchema,
  catalogProductResponseSchema,
  catalogRevisionResponseSchema,
  catalogSearchQuerySchema,
  catalogSearchResponseSchema,
} from '@cieslacalc/catalog-core';
import { CatalogService, CatalogServiceError } from './service';

function sendError(res: Response, status: number, code: string) {
  return res.status(status).json({ error: { code } });
}

function handleError(res: Response, error: unknown) {
  if (error instanceof ZodError)
    return sendError(res, 400, 'catalog-invalid-request');
  if (error instanceof CatalogServiceError)
    return sendError(
      res,
      error.code.endsWith('not-found') ? 404 : 400,
      error.code,
    );
  return sendError(res, 500, 'catalog-internal-error');
}

export function createCatalogRouter(service?: CatalogService) {
  const router = Router();
  router.use((_req, res, next) => {
    if (!service) return sendError(res, 503, 'catalog-unavailable');
    next();
  });
  router.get('/manufacturers', async (_req, res) => {
    try {
      res.json(
        catalogManufacturersResponseSchema.parse({
          items: await service!.listManufacturers(),
        }),
      );
    } catch (error) {
      handleError(res, error);
    }
  });
  router.get('/products', async (req, res) => {
    try {
      const query = catalogSearchQuerySchema.parse(req.query);
      res.json(
        catalogSearchResponseSchema.parse(await service!.searchProducts(query)),
      );
    } catch (error) {
      handleError(res, error);
    }
  });
  router.get('/products/:productId', async (req, res) => {
    try {
      const productId = catalogIdSchema.parse(req.params.productId);
      res.json(
        catalogProductResponseSchema.parse({
          item: await service!.getProduct(productId),
        }),
      );
    } catch (error) {
      handleError(res, error);
    }
  });
  router.get('/products/:productId/revisions/:revisionId', async (req, res) => {
    try {
      const productId = catalogIdSchema.parse(req.params.productId);
      const revisionId = catalogIdSchema.parse(req.params.revisionId);
      res.json(
        catalogRevisionResponseSchema.parse({
          item: await service!.getRevision(productId, revisionId),
        }),
      );
    } catch (error) {
      handleError(res, error);
    }
  });
  return router;
}
