import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { CatalogService } from './catalog/service';
import { createCatalogDatabase } from './db/client';
import { DrizzleCatalogRepository } from './db/catalog-repository';
import { DrizzlePricingRepository } from './db/pricing-repository';
import { PricingService } from './pricing/service';

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Invalid PORT');
const webDirectory = fileURLToPath(new URL('../../web/dist/', import.meta.url));
const catalogDatabase = createCatalogDatabase();
const catalogService = catalogDatabase
  ? new CatalogService(new DrizzleCatalogRepository(catalogDatabase.db))
  : undefined;
const pricingService = catalogDatabase
  ? new PricingService(new DrizzlePricingRepository(catalogDatabase.db))
  : undefined;
const server = createApp(webDirectory, catalogService, pricingService).listen(
  port,
  process.env.HOST ?? '127.0.0.1',
  () => {
    console.log(`CieślaCalc: http://127.0.0.1:${port}`);
  },
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => server.close(() => void catalogDatabase?.close()));
