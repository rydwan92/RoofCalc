import express from 'express';
import type { CatalogService } from './catalog/service';
import type { PricingService } from './pricing/service';
import {
  handleApiRequest,
  type BusinessApi,
  type HealthContext,
} from './http/handler';

/** Admin mutation bodies are small JSON documents; a CSV import is the largest. */
const JSON_BODY_LIMIT = '8mb';

export function createApp(
  webDirectory?: string,
  catalogService?: CatalogService,
  pricingService?: PricingService,
  health: HealthContext = { runtime: 'node' },
  business?: Omit<BusinessApi, 'request'>,
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
  /**
   * A body is parsed **only** for the local/dev admin surface. Everything else
   * stays GET/HEAD-only, so adding the admin route did not widen the write
   * surface of any existing endpoint. The capability gate in
   * `business/capability.ts` still decides whether the route answers at all.
   */
  app.use('/api/business', express.json({ limit: JSON_BODY_LIMIT }));
  app.use('/api', async (req, res) => {
    const url = new URL(req.originalUrl, 'http://localhost');
    const result = await handleApiRequest(
      req.method,
      url.pathname,
      url.searchParams,
      catalogService,
      pricingService,
      health,
      business
        ? {
            ...business,
            request: {
              ...(req.socket.remoteAddress
                ? { remoteAddress: req.socket.remoteAddress }
                : {}),
              ...(req.get('Host') ? { host: req.get('Host')! } : {}),
            },
          }
        : undefined,
      req.body,
    );
    res.status(result.status).json(result.body);
  });
  if (webDirectory) {
    app.use(express.static(webDirectory));
    app.get('*', (_req, res) => {
      res.sendFile('index.html', { root: webDirectory });
    });
  }
  return app;
}
