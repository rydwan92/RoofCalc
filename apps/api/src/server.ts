import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { CatalogService } from './catalog/service';
import { createCatalogDatabase } from './db/client';
import { DatabaseConfigError, describeDatabaseTarget } from './db/config';
import { DrizzleCatalogRepository } from './db/catalog-repository';
import { DrizzlePricingRepository } from './db/pricing-repository';
import { PricingService } from './pricing/service';

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
const server = createApp(webDirectory, catalogService, pricingService, {
  runtime: 'node',
  probeDatabase: catalogDatabase
    ? async () => {
        await catalogDatabase.pool.query('SELECT 1');
      }
    : undefined,
}).listen(port, process.env.HOST ?? '127.0.0.1', () => {
  console.log(`CieślaCalc: http://127.0.0.1:${port}`);
  console.log(
    `Catalogue database: ${catalogDatabase ? describeDatabaseTarget(catalogDatabase.options) : 'not configured (geometry works offline)'}`,
  );
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => server.close(() => void catalogDatabase?.close()));
