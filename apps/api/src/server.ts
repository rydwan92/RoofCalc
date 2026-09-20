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
import { adminDevModeEnabled } from './business/capability';

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
/**
 * V54. The read service is always built when a database exists. The **admin**
 * service is built only when `BUSINESS_ADMIN_DEV_MODE=true`, and every request
 * it serves is re-checked against the loopback gate — see the header comment
 * in `business/capability.ts`: PRODUCTION ADMIN AUTH IS NOT IMPLEMENTED YET.
 */
const businessRepository = catalogDatabase
  ? new DrizzleBusinessRepository(catalogDatabase.db)
  : undefined;
const adminDevMode = adminDevModeEnabled();
const business = businessRepository
  ? {
      service: new BusinessService(businessRepository, businessRepository),
      ...(adminDevMode
        ? {
            admin: new BusinessAdminService(
              businessRepository,
              businessRepository,
              businessRepository,
            ),
          }
        : {}),
    }
  : undefined;
const server = createApp(
  webDirectory,
  catalogService,
  pricingService,
  {
    runtime: 'node',
    probeDatabase: catalogDatabase
      ? async () => {
          await catalogDatabase.pool.query('SELECT 1');
        }
      : undefined,
  },
  business,
).listen(port, process.env.HOST ?? '127.0.0.1', () => {
  console.log(`CieślaCalc: http://127.0.0.1:${port}`);
  console.log(
    `Catalogue database: ${catalogDatabase ? describeDatabaseTarget(catalogDatabase.options) : 'not configured (geometry works offline)'}`,
  );
  console.log(
    adminDevMode
      ? 'Business admin: LOCAL DEV MODE — write endpoints enabled for loopback requests only. Not authenticated.'
      : 'Business admin: disabled (read-only). Set BUSINESS_ADMIN_DEV_MODE=true for the local admin MVP.',
  );
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => server.close(() => void catalogDatabase?.close()));
