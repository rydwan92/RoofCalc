import { drizzle } from 'drizzle-orm/mysql2';
import { createConnection } from 'mysql2/promise';
import { CatalogService } from '../catalog/service';
import { DrizzleCatalogRepository } from '../db/catalog-repository';
import { DrizzlePricingRepository } from '../db/pricing-repository';
import { schema } from '../db/schema-bundle';
import { handleApiRequest } from '../http/handler';
import { PricingService } from '../pricing/service';

interface HyperdriveBinding {
  host: string;
  user: string;
  password: string;
  database: string;
  port: number;
}

interface WorkerEnv {
  HYPERDRIVE?: HyperdriveBinding;
  ASSETS: { fetch(request: Request): Promise<Response> };
}

/** Same-origin API over the same services/repositories as the Node API. */
export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (
      url.pathname === '/api/health' ||
      (request.method !== 'GET' && request.method !== 'HEAD') ||
      (!url.pathname.startsWith('/api/catalog/') &&
        !url.pathname.startsWith('/api/pricing/'))
    ) {
      const result = await handleApiRequest(
        request.method,
        url.pathname,
        url.searchParams,
      );
      return request.method === 'HEAD'
        ? new Response(null, { status: result.status })
        : Response.json(result.body, { status: result.status });
    }
    if (!env.HYPERDRIVE)
      return Response.json(
        { error: { code: 'database-unavailable' } },
        { status: 503 },
      );
    try {
      // Hyperdrive pools the origin connections. Close this logical mysql2
      // connection after every request, as Cloudflare's driver guide requires.
      const connection = await createConnection({
        host: env.HYPERDRIVE.host,
        user: env.HYPERDRIVE.user,
        password: env.HYPERDRIVE.password,
        database: env.HYPERDRIVE.database,
        port: env.HYPERDRIVE.port,
        disableEval: true,
      });
      try {
        const db = drizzle(connection, { schema, mode: 'default' });
        const catalog = new CatalogService(new DrizzleCatalogRepository(db));
        const pricing = new PricingService(new DrizzlePricingRepository(db));
        const result = await handleApiRequest(
          request.method,
          url.pathname,
          url.searchParams,
          catalog,
          pricing,
        );
        return request.method === 'HEAD'
          ? new Response(null, { status: result.status })
          : Response.json(result.body, { status: result.status });
      } finally {
        await connection.end();
      }
    } catch {
      // Do not forward driver messages: they can contain origin details.
      return Response.json(
        { error: { code: 'database-unavailable' } },
        { status: 503 },
      );
    }
  },
};
