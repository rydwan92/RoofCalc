import { drizzle } from 'drizzle-orm/mysql2';
import { createConnection, type Connection } from 'mysql2/promise';
import { CatalogService } from '../catalog/service';
import { DrizzleCatalogRepository } from '../db/catalog-repository';
import { DrizzlePricingRepository } from '../db/pricing-repository';
import { schema } from '../db/schema-bundle';
import { handleApiRequest, type ApiResult } from '../http/handler';
import { PricingService } from '../pricing/service';

/** The subset of Cloudflare's Hyperdrive binding that mysql2 needs. */
export interface HyperdriveBinding {
  host: string;
  user: string;
  password: string;
  database: string;
  port: number;
}

export interface WorkerEnv {
  HYPERDRIVE?: HyperdriveBinding;
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export type ConnectDatabase = (
  binding: HyperdriveBinding,
) => Promise<Pick<Connection, 'end' | 'query'>>;

/**
 * Hyperdrive terminates TLS to the origin and pools origin connections, so
 * the Worker opens one short-lived logical mysql2 connection per request
 * (Cloudflare's mysql2 guide; mysql2 >= 3.13, `disableEval` is mandatory).
 * Only text-protocol `query` is used — Hyperdrive does not support
 * protocol-level prepared statements.
 */
export const connectHyperdrive: ConnectDatabase = (binding) =>
  createConnection({
    host: binding.host,
    user: binding.user,
    password: binding.password,
    database: binding.database,
    port: binding.port,
    disableEval: true,
  });

function respond(request: Request, result: ApiResult): Response {
  const headers = { 'Cache-Control': 'no-store' };
  return request.method === 'HEAD'
    ? new Response(null, { status: result.status, headers })
    : Response.json(result.body, { status: result.status, headers });
}

const databaseUnavailable = (request: Request) =>
  respond(request, {
    status: 503,
    body: { error: { code: 'database-unavailable' } },
  });

/** Same-origin API over the same services/repositories as the Node API. */
export function createWorker(connect: ConnectDatabase = connectHyperdrive) {
  return {
    async fetch(request: Request, env: WorkerEnv): Promise<Response> {
      const url = new URL(request.url);
      // Everything outside /api/ is the SPA; `run_worker_first` limits Worker
      // invocations to /api/*, this branch keeps local/dev routing identical.
      if (url.pathname !== '/api' && !url.pathname.startsWith('/api/'))
        return env.ASSETS.fetch(request);

      if (url.pathname === '/api/health') {
        const binding = env.HYPERDRIVE;
        return respond(
          request,
          await handleApiRequest(
            request.method,
            url.pathname,
            url.searchParams,
            undefined,
            undefined,
            {
              runtime: 'cloudflare-worker',
              probeDatabase: binding
                ? async () => {
                    const connection = await connect(binding);
                    try {
                      await connection.query('SELECT 1');
                    } finally {
                      await connection.end();
                    }
                  }
                : undefined,
            },
          ),
        );
      }

      const needsDatabase =
        (request.method === 'GET' || request.method === 'HEAD') &&
        (url.pathname.startsWith('/api/catalog/') ||
          url.pathname.startsWith('/api/pricing/'));
      if (!needsDatabase)
        return respond(
          request,
          await handleApiRequest(
            request.method,
            url.pathname,
            url.searchParams,
          ),
        );
      if (!env.HYPERDRIVE) return databaseUnavailable(request);

      let connection: Awaited<ReturnType<ConnectDatabase>> | undefined;
      try {
        connection = await connect(env.HYPERDRIVE);
        const db = drizzle(connection as Connection, {
          schema,
          mode: 'default',
        });
        const catalog = new CatalogService(new DrizzleCatalogRepository(db));
        const pricing = new PricingService(new DrizzlePricingRepository(db));
        return respond(
          request,
          await handleApiRequest(
            request.method,
            url.pathname,
            url.searchParams,
            catalog,
            pricing,
            { runtime: 'cloudflare-worker' },
          ),
        );
      } catch {
        // Do not forward driver messages: they can contain origin details.
        return databaseUnavailable(request);
      } finally {
        await connection?.end().catch(() => undefined);
      }
    },
  };
}

export default createWorker();
