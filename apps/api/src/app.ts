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
  // Local Apache builds keep their own origin and local project storage.
  // Only browser GET/HEAD requests from explicit loopback origins may read API.
  app.use('/api', (req, res, next) => {
    res.vary('Origin');
    const origin = req.get('Origin');
    if (origin && (req.method === 'GET' || req.method === 'HEAD')) {
      try {
        const url = new URL(origin);
        if (
          url.origin === origin &&
          ['http:', 'https:'].includes(url.protocol) &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        )
          res.setHeader('Access-Control-Allow-Origin', origin);
      } catch {
        /* An invalid origin receives no CORS permission. */
      }
    }
    next();
  });
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
