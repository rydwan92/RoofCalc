import { drizzle } from 'drizzle-orm/mysql2';
import { createConnection, type Connection } from 'mysql2/promise';
import { CatalogService } from '../catalog/service';
import { DrizzleCatalogRepository } from '../db/catalog-repository';
import { DrizzlePricingRepository } from '../db/pricing-repository';
import { DrizzleBusinessRepository } from '../db/business-repository';
import { BusinessService } from '../business/service';
import { schema } from '../db/schema-bundle';
import { handleApiRequest, type ApiResult } from '../http/handler';
import { PricingService } from '../pricing/service';
import {
  createBusinessAuth,
  authConfigured,
  type AuthConfiguration,
} from '../business/auth/auth';
import {
  businessOriginAllowed,
  resolveBusinessAccess,
} from '../business/auth/access';
import { BusinessAdminService } from '../business/admin-service';
import { DrizzleWorkspaceRepository } from '../business/workspace/drizzle-repository';
import {
  bootstrapFirstOwner,
  readSetupStatus,
} from '../business/auth/bootstrap';
import { readSystemStatus } from '../db/system-status';

/** The subset of Cloudflare's Hyperdrive binding that mysql2 needs. */
export interface HyperdriveBinding {
  host: string;
  user: string;
  password: string;
  database: string;
  port: number;
}

export interface WorkerEnv extends AuthConfiguration {
  HYPERDRIVE?: HyperdriveBinding;
  ROOFCALC_BOOTSTRAP_TOKEN?: string;
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
              auth: authConfigured(env) ? 'configured' : 'unconfigured',
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

      const setupStatus = url.pathname === '/api/setup/status';
      const setupBootstrap = url.pathname === '/api/setup/first-owner';
      if (setupStatus && request.method !== 'GET' && request.method !== 'HEAD')
        return respond(request, {
          status: 404,
          body: { error: { code: 'not-found' } },
        });
      if (setupBootstrap && request.method !== 'POST')
        return respond(request, {
          status: 404,
          body: { error: { code: 'not-found' } },
        });
      if (
        setupBootstrap &&
        !businessOriginAllowed(
          request.method,
          request.headers.get('Origin') ?? undefined,
          env.BETTER_AUTH_URL,
        )
      )
        return respond(request, {
          status: 403,
          body: { error: { code: 'business-origin-forbidden' } },
        });
      if (setupStatus && !env.HYPERDRIVE)
        return respond(request, {
          status: 200,
          body: await readSetupStatus(
            undefined,
            authConfigured(env),
            env.ROOFCALC_BOOTSTRAP_TOKEN,
          ),
        });
      if (setupBootstrap && !authConfigured(env))
        return respond(request, {
          status: 503,
          body: { error: { code: 'auth-not-configured' } },
        });
      if (
        setupBootstrap &&
        (!env.ROOFCALC_BOOTSTRAP_TOKEN ||
          env.ROOFCALC_BOOTSTRAP_TOKEN.length < 32)
      )
        return respond(request, {
          status: 503,
          body: { error: { code: 'bootstrap-unavailable' } },
        });

      const needsDatabase =
        setupStatus ||
        setupBootstrap ||
        ((request.method === 'GET' || request.method === 'HEAD') &&
          (url.pathname.startsWith('/api/catalog/') ||
            url.pathname.startsWith('/api/pricing/'))) ||
        url.pathname.startsWith('/api/business/') ||
        url.pathname.startsWith('/api/auth/');
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
        const auth = createBusinessAuth(db, env);
        if (setupStatus)
          return respond(request, {
            status: 200,
            body: await readSetupStatus(
              db,
              !!auth,
              env.ROOFCALC_BOOTSTRAP_TOKEN,
            ),
          });
        if (setupBootstrap) {
          if (
            !request.headers.get('Content-Type')?.startsWith('application/json')
          )
            return respond(request, {
              status: 415,
              body: { error: { code: 'json-required' } },
            });
          const bytes = await request.arrayBuffer();
          if (bytes.byteLength > 16 * 1024)
            return respond(request, {
              status: 413,
              body: { error: { code: 'body-too-large' } },
            });
          let body: unknown;
          try {
            body = JSON.parse(new TextDecoder().decode(bytes));
          } catch {
            return respond(request, {
              status: 400,
              body: { error: { code: 'invalid-json' } },
            });
          }
          return respond(
            request,
            await bootstrapFirstOwner(db, env.ROOFCALC_BOOTSTRAP_TOKEN!, body),
          );
        }
        if (url.pathname.startsWith('/api/auth/')) {
          if (!auth)
            return respond(request, {
              status: 503,
              body: { error: { code: 'auth-not-configured' } },
            });
          return await auth.handler(request);
        }
        const isBusiness = url.pathname.startsWith('/api/business/');
        if (
          isBusiness &&
          !businessOriginAllowed(
            request.method,
            request.headers.get('Origin') ?? undefined,
            env.BETTER_AUTH_URL,
          )
        )
          return respond(request, {
            status: 403,
            body: { error: { code: 'business-origin-forbidden' } },
          });
        const access = isBusiness
          ? await resolveBusinessAccess(db, auth, request.headers)
          : undefined;
        let body: unknown;
        if (isBusiness && !['GET', 'HEAD'].includes(request.method)) {
          if (
            !request.headers.get('Content-Type')?.startsWith('application/json')
          )
            return respond(request, {
              status: 415,
              body: { error: { code: 'json-required' } },
            });
          const bytes = await request.arrayBuffer();
          if (bytes.byteLength > 8 * 1024 * 1024)
            return respond(request, {
              status: 413,
              body: { error: { code: 'body-too-large' } },
            });
          try {
            body = JSON.parse(new TextDecoder().decode(bytes));
          } catch {
            return respond(request, {
              status: 400,
              body: { error: { code: 'invalid-json' } },
            });
          }
        }
        const catalog = new CatalogService(new DrizzleCatalogRepository(db));
        const pricing = new PricingService(new DrizzlePricingRepository(db));
        const businessRepository = new DrizzleBusinessRepository(db);
        return respond(
          request,
          await handleApiRequest(
            request.method,
            url.pathname,
            url.searchParams,
            catalog,
            pricing,
            {
              runtime: 'cloudflare-worker',
              auth: auth ? 'configured' : 'unconfigured',
            },
            /** Each mutation is gated by a live session, active membership,
             * capability and exact same-origin check in the shared handler. */
            {
              access,
              workspace: new DrizzleWorkspaceRepository(db),
              systemStatus: () => readSystemStatus(db),
              admin: new BusinessAdminService(
                businessRepository,
                businessRepository,
                businessRepository,
              ),
              service: new BusinessService(
                businessRepository,
                businessRepository,
              ),
            },
            body,
          ),
        );
      } catch {
        // Do not forward driver messages: they can contain origin details.
        if (setupStatus)
          return respond(request, {
            status: 200,
            body: await readSetupStatus(
              undefined,
              authConfigured(env),
              env.ROOFCALC_BOOTSTRAP_TOKEN,
            ),
          });
        return databaseUnavailable(request);
      } finally {
        await connection?.end().catch(() => undefined);
      }
    },
  };
}

export default createWorker();
