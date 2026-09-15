import express from 'express';
import type { HealthResponse } from '@cieslacalc/shared';
import type { CatalogService } from './catalog/service';
import { createCatalogRouter } from './catalog/routes';
import type { PricingService } from './pricing/service';
import { createPricingRouter } from './pricing/routes';

export function createApp(
  webDirectory?: string,
  catalogService?: CatalogService,
  pricingService?: PricingService,
) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/api/health', (_req, res) => {
    const response: HealthResponse = {
      status: 'ok',
      service: 'cieslacalc-api',
      version: '0.1.0',
    };
    res.json(response);
  });
  app.use('/api/catalog', createCatalogRouter(catalogService));
  app.use('/api/pricing', createPricingRouter(pricingService));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'not-found' } });
  });
  if (webDirectory) {
    app.use(express.static(webDirectory));
    app.get('*', (_req, res) => {
      res.sendFile('index.html', { root: webDirectory });
    });
  }
  return app;
}
