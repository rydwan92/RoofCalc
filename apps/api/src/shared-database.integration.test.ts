import request from 'supertest';
import { createConnection } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { CatalogService } from './catalog/service';
import { createCatalogDatabase } from './db/client';
import { DrizzleCatalogRepository } from './db/catalog-repository';
import { DrizzlePricingRepository } from './db/pricing-repository';
import { createWorker } from './edge/worker';
import { PricingService } from './pricing/service';

/**
 * Opt-in, read-only acceptance test against the real shared DEV database
 * (`pnpm test:shared-db`). It proves that the Node transport and the
 * Cloudflare Worker handler (same mysql2 `disableEval` single-connection
 * path Hyperdrive uses; TLS is added here because there is no Hyperdrive
 * in front of the origin) return identical canonical records. Nothing is
 * written, so no test rows are left behind.
 */
const enabled =
  (process.env.npm_lifecycle_event === 'test:shared-db' ||
    process.env.ROOFCALC_SHARED_DB_TEST === '1') &&
  !!process.env.DATABASE_URL;

const PATHS = [
  '/api/catalog/manufacturers',
  '/api/catalog/products?kind=roof-tile&limit=50',
  '/api/catalog/products?kind=modular-sheet&limit=50',
  '/api/catalog/products?kind=standing-seam&limit=50',
  '/api/catalog/products?kind=membrane&limit=50',
  '/api/catalog/products?kind=timber-stock&limit=50',
  '/api/catalog/products/product:swissporton:koda',
  '/api/pricing/variants?ids=variant:timber:c24-45x145x4000-treated:standard',
  '/api/pricing/variants?ids=variant:ruukki:finnera:qc50-pural-bt-mat&at=2026-07-01',
];

describe.runIf(enabled)('shared DEV database: Node API and Worker', () => {
  const database = enabled ? createCatalogDatabase() : undefined;

  beforeAll(() => {
    expect(database).toBeDefined();
  });
  afterAll(async () => {
    await database?.close();
  });

  const nodeApp = () =>
    createApp(
      undefined,
      new CatalogService(new DrizzleCatalogRepository(database!.db)),
      new PricingService(new DrizzlePricingRepository(database!.db)),
      {
        runtime: 'node',
        probeDatabase: async () => {
          await database!.pool.query('SELECT 1');
        },
      },
    );

  const worker = () =>
    createWorker((binding) =>
      createConnection({
        ...binding,
        ssl: database!.options.ssl,
        disableEval: true,
      }),
    );

  const workerEnv = () => ({
    HYPERDRIVE: {
      host: database!.options.host,
      port: database!.options.port,
      user: database!.options.user,
      password: database!.options.password,
      database: database!.options.database,
    },
    ASSETS: { fetch: async () => new Response('spa') },
  });

  it('both transports report a connected database', async () => {
    const node = await request(nodeApp()).get('/api/health');
    const edge = await worker().fetch(
      new Request('https://roofcalc.test/api/health'),
      workerEnv(),
    );
    expect(node.body).toMatchObject({ status: 'ok', database: 'connected' });
    expect(await edge.json()).toMatchObject({
      status: 'ok',
      runtime: 'cloudflare-worker',
      database: 'connected',
    });
  });

  it.each(PATHS)('returns identical data for %s', async (path) => {
    const node = await request(nodeApp()).get(path);
    const edge = await worker().fetch(
      new Request(`https://roofcalc.test${path}`),
      workerEnv(),
    );
    expect(node.status).toBe(200);
    expect(edge.status).toBe(200);
    const edgeBody = await edge.json();
    expect(edgeBody).toEqual(node.body);
    expect(JSON.stringify(edgeBody)).not.toContain(database!.options.password);
  });

  it('serves the canonical seeded catalogue', async () => {
    const manufacturers = await request(nodeApp()).get(
      '/api/catalog/manufacturers',
    );
    expect(manufacturers.body.items.length).toBeGreaterThan(0);
    const koda = await request(nodeApp()).get(
      '/api/catalog/products/product:swissporton:koda',
    );
    expect(koda.body.item.currentRevision.technicalSpec.kind).toBe('roof-tile');
  });
});
