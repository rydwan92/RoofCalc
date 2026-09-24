import express from 'express';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import type { BusinessAuth } from './business/auth/auth';
import type { BusinessAccess } from './business/auth/access';
import { businessOriginAllowed } from './business/auth/access';
import {
  bootstrapFirstOwner,
  readSetupStatus,
} from './business/auth/bootstrap';
import type { CatalogDatabase } from './db/client';
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
  authentication?: {
    auth?: BusinessAuth;
    baseURL?: string;
    resolve: (headers: Headers) => Promise<BusinessAccess | undefined>;
    setup?: { db: CatalogDatabase; token?: string };
  },
) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/api/setup/status', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      res.json(
        await readSetupStatus(
          authentication?.setup?.db,
          !!authentication?.auth,
          authentication?.setup?.token,
        ),
      );
    } catch {
      res.json(
        await readSetupStatus(
          undefined,
          !!authentication?.auth,
          authentication?.setup?.token,
        ),
      );
    }
  });
  app.post(
    '/api/setup/first-owner',
    express.json({ limit: '16kb' }),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      if (!authentication?.auth) {
        res.status(503).json({ error: { code: 'auth-not-configured' } });
        return;
      }
      if (
        !businessOriginAllowed(
          req.method,
          req.get('Origin'),
          authentication.baseURL,
        )
      ) {
        res.status(403).json({ error: { code: 'business-origin-forbidden' } });
        return;
      }
      if (!authentication.setup?.db) {
        res.status(503).json({ error: { code: 'database-unavailable' } });
        return;
      }
      if (
        !authentication.setup.token ||
        authentication.setup.token.length < 32
      ) {
        res.status(503).json({ error: { code: 'bootstrap-unavailable' } });
        return;
      }
      try {
        const result = await bootstrapFirstOwner(
          authentication.setup.db,
          authentication.setup.token,
          req.body,
        );
        res.status(result.status).json(result.body);
      } catch {
        res.status(503).json({ error: { code: 'database-unavailable' } });
      }
    },
  );
  if (authentication?.auth)
    app.all('/api/auth/*', toNodeHandler(authentication.auth));
  else
    app.all('/api/auth/*', (_req, res) => {
      res.status(503).json({ error: { code: 'auth-not-configured' } });
    });
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
  /** Business JSON writes are checked against origin, session and capability. */
  app.use('/api/business', express.json({ limit: JSON_BODY_LIMIT }));
  app.use('/api', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const url = new URL(req.originalUrl, 'http://localhost');
    let access = business?.access;
    if (url.pathname.startsWith('/api/business/')) {
      if (
        !businessOriginAllowed(
          req.method,
          req.get('Origin'),
          authentication?.baseURL,
        )
      ) {
        res.status(403).json({ error: { code: 'business-origin-forbidden' } });
        return;
      }
      try {
        if (authentication)
          access = await authentication.resolve(fromNodeHeaders(req.headers));
      } catch {
        res.status(503).json({ error: { code: 'business-unavailable' } });
        return;
      }
    }
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
            access,
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
