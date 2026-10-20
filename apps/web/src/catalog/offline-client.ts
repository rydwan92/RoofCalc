import {
  CATALOGUE_DATA_AS_OF,
  CATALOGUE_SEED_BATCHES,
  type CatalogueSeedBatch,
} from '@cieslacalc/catalog-data';
import {
  catalogImportBatchV1Schema,
  createOfflineCatalogue,
  type CatalogSearchQuery,
  type OfflineCatalogue,
} from '@cieslacalc/catalog-core';
import { CatalogClientError, type CatalogClient } from './client';

/**
 * ADR-013 bundled technical catalogue. The batches are separate lazy chunks:
 * nothing is downloaded until the user deliberately chooses the offline
 * catalogue, and they come from this app's own origin — no third party.
 * Technical data only; prices never ship in the client.
 */
const LOADERS: Record<CatalogueSeedBatch, () => Promise<{ default: unknown }>> =
  {
    'tiles-2026-09.json': () =>
      import('@cieslacalc/catalog-data/batches/tiles-2026-09.json'),
    'tiles-2026-09-v35.json': () =>
      import('@cieslacalc/catalog-data/batches/tiles-2026-09-v35.json'),
    'membranes-2026-09.json': () =>
      import('@cieslacalc/catalog-data/batches/membranes-2026-09.json'),
    'timber-stock-2026-09.json': () =>
      import('@cieslacalc/catalog-data/batches/timber-stock-2026-09.json'),
    'metal-sheets-2026-09.json': () =>
      import('@cieslacalc/catalog-data/batches/metal-sheets-2026-09.json'),
    'metal-roofing-additions-2026-09-v42.json': () =>
      import('@cieslacalc/catalog-data/batches/metal-roofing-additions-2026-09-v42.json'),
    'timber-linear-stock-2026-09.json': () =>
      import('@cieslacalc/catalog-data/batches/timber-linear-stock-2026-09.json'),
    'tiles-commercial-2026-09-v50.json': () =>
      import('@cieslacalc/catalog-data/batches/tiles-commercial-2026-09-v50.json'),
    'drainage-galeco-stal2-2026-09-v51.json': () =>
      import('@cieslacalc/catalog-data/batches/drainage-galeco-stal2-2026-09-v51.json'),
    'roof-system-2026-09-v52.json': () =>
      import('@cieslacalc/catalog-data/batches/roof-system-2026-09-v52.json'),
    'drainage-galeco-stal2-colours-2026-10-vnext4.json': () =>
      import('@cieslacalc/catalog-data/batches/drainage-galeco-stal2-colours-2026-10-vnext4.json'),
  };

let loading: Promise<OfflineCatalogue> | undefined;

/** Loads, validates and indexes the bundled batches once per session. */
export function loadOfflineCatalogue(): Promise<OfflineCatalogue> {
  loading ??= Promise.all(
    CATALOGUE_SEED_BATCHES.map(async (file) =>
      // Build-time data is still parsed: a corrupt chunk must fail loudly.
      catalogImportBatchV1Schema.parse((await LOADERS[file]()).default),
    ),
  )
    .then((batches) => createOfflineCatalogue(batches, CATALOGUE_DATA_AS_OF))
    .catch((error: unknown) => {
      loading = undefined;
      throw error;
    });
  return loading;
}

function abortable<T>(signal: AbortSignal | undefined, value: () => T): T {
  if (signal?.aborted) throw new CatalogClientError('catalog-aborted');
  return value();
}

export class BundledCatalogClient implements CatalogClient {
  readonly dataAsOf = CATALOGUE_DATA_AS_OF;

  async status(signal?: AbortSignal) {
    const catalogue = await loadOfflineCatalogue();
    return abortable(signal, () => catalogue.status());
  }

  async listManufacturers(signal?: AbortSignal) {
    const catalogue = await loadOfflineCatalogue();
    return abortable(signal, () => catalogue.listManufacturers());
  }

  async searchProducts(query: CatalogSearchQuery, signal?: AbortSignal) {
    const catalogue = await loadOfflineCatalogue();
    return abortable(signal, () => catalogue.searchProducts(query));
  }

  async getProduct(id: string, signal?: AbortSignal) {
    const catalogue = await loadOfflineCatalogue();
    const item = abortable(signal, () => catalogue.getProduct(id));
    if (!item) throw new CatalogClientError('catalog-product-not-found');
    return item;
  }

  async getRevision(
    productId: string,
    revisionId: string,
    signal?: AbortSignal,
  ) {
    const catalogue = await loadOfflineCatalogue();
    const item = abortable(signal, () =>
      catalogue.getRevision(productId, revisionId),
    );
    if (!item) throw new CatalogClientError('catalog-revision-not-found');
    return item;
  }
}

export const bundledCatalogClient = new BundledCatalogClient();
