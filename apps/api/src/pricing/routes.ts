import { Router, type Response } from 'express';
import { ZodError, z } from 'zod';
import { priceListEntrySchema } from '@cieslacalc/pricing-core';
import { PricingService, PricingServiceError } from './service';

const pricingVariantsResponseSchema = z.object({
  items: z.array(
    z.object({
      variantId: z.string(),
      entry: priceListEntrySchema,
      currencyCode: z.string(),
    }),
  ),
});

function sendError(res: Response, status: number, code: string) {
  return res.status(status).json({ error: { code } });
}

function handleError(res: Response, error: unknown) {
  if (error instanceof ZodError)
    return sendError(res, 400, 'pricing-invalid-request');
  if (error instanceof PricingServiceError)
    return sendError(res, 400, error.code);
  return sendError(res, 500, 'pricing-internal-error');
}

export function createPricingRouter(service?: PricingService) {
  const router = Router();
  router.use((_req, res, next) => {
    if (!service) return sendError(res, 503, 'pricing-unavailable');
    next();
  });
  router.get('/variants', async (req, res) => {
    try {
      const raw = req.query.ids;
      const ids = (typeof raw === 'string' ? raw.split(',') : [])
        .map((id) => id.trim())
        .filter(Boolean);
      res.json(
        pricingVariantsResponseSchema.parse({
          items: await service!.pricesForVariants(ids),
        }),
      );
    } catch (error) {
      handleError(res, error);
    }
  });
  return router;
}
