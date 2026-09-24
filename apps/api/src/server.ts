import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { CatalogService } from './catalog/service';
import { createCatalogDatabase } from './db/client';
import { DatabaseConfigError, describeDatabaseTarget } from './db/config';
import { DrizzleCatalogRepository } from './db/catalog-repository';
import { DrizzlePricingRepository } from './db/pricing-repository';
import { PricingService } from './pricing/service';
import { DrizzleBusinessRepository } from './db/business-repository';
import { BusinessService } from './business/service';
import { BusinessAdminService } from './business/admin-service';
import { createBusinessAuth } from './business/auth/auth';
import { resolveBusinessAccess } from './business/auth/access';
import { DrizzleWorkspaceRepository } from './business/workspace/drizzle-repository';
import { readSystemStatus } from './db/system-status';

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Invalid PORT');
const webDirectory = fileURLToPath(new URL('../../web/dist/', import.meta.url));

function openDatabase() {
  try {
    return createCatalogDatabase();
  } catch (error) {
    // A malformed DATABASE_URL must not stop geometry/local projects.
    console.error(
      error instanceof DatabaseConfigError
        ? `Catalogue disabled: ${error.message}`
        : 'Catalogue disabled: database configuration failed.',
    );
    return undefined;
  }
}

const catalogDatabase = openDatabase();
const catalogService = catalogDatabase
  ? new CatalogService(new DrizzleCatalogRepository(catalogDatabase.db))
  : undefined;
const pricingService = catalogDatabase
  ? new PricingService(new DrizzlePricingRepository(catalogDatabase.db))
  : undefined;
/** Read and write services share the authenticated, capability-gated API. */
const businessRepository = catalogDatabase
  ? new DrizzleBusinessRepository(catalogDatabase.db)
  : undefined;
const auth = catalogDatabase
  ? createBusinessAuth(catalogDatabase.db, process.env)
  : undefined;
const business = businessRepository
  ? {
      service: new BusinessService(businessRepository, businessRepository),
      workspace: new DrizzleWorkspaceRepository(catalogDatabase!.db),
      systemStatus: () => readSystemStatus(catalogDatabase!.db),
      admin: new BusinessAdminService(
        businessRepository,
        businessRepository,
        businessRepository,
      ),
    }
  : undefined;
const server = createApp(
  webDirectory,
  catalogService,
  pricingService,
  {
    runtime: 'node',
    auth: auth ? 'configured' : 'unconfigured',
    probeDatabase: catalogDatabase
      ? async () => {
          await catalogDatabase.pool.query('SELECT 1');
        }
      : undefined,
  },
  business,
  {
    auth,
    baseURL: process.env.BETTER_AUTH_URL,
    setup: catalogDatabase
      ? { db: catalogDatabase.db, token: process.env.ROOFCALC_BOOTSTRAP_TOKEN }
      : undefined,
    resolve: (headers) =>
      catalogDatabase
        ? resolveBusinessAccess(catalogDatabase.db, auth, headers)
        : Promise.resolve(undefined),
  },
).listen(port, process.env.HOST ?? '127.0.0.1', () => {
  console.log(`CieślaCalc: http://127.0.0.1:${port}`);
  console.log(
    `Catalogue database: ${catalogDatabase ? describeDatabaseTarget(catalogDatabase.options) : 'not configured (geometry works offline)'}`,
  );
  console.log(
    auth
      ? 'Business: authenticated organization workspace enabled.'
      : 'Business: auth not configured; business access fails closed.',
  );
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => server.close(() => void catalogDatabase?.close()));
