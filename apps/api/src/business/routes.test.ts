import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { InMemoryBusinessRepository } from './memory-repository';
import { BusinessService } from './service';
import { BusinessAdminService } from './admin-service';

const KODA = 'variant:swissporton:koda:antracytowa-angoba';

function api(options: { admin?: boolean; devMode?: boolean } = {}) {
  const repository = new InMemoryBusinessRepository({
    organizations: [
      {
        id: 'org:a',
        slug: 'hurtownia-a',
        name: 'Hurtownia A',
        currencyCode: 'PLN',
        active: true,
      },
    ],
    catalog: [
      {
        productId: 'product:swissporton:koda',
        productName: 'KODA',
        manufacturerId: 'manufacturer:swissporton',
        manufacturerName: 'swissporTON',
        kind: 'roof-tile',
        currentRevisionId: 'revision:koda:1',
        variantId: KODA,
        variantName: 'Antracytowa angoba',
      },
    ],
    assortment: [
      {
        id: 'oai:a:1',
        organizationId: 'org:a',
        externalKey: 'A-DACH-001',
        sourceName: 'Dachówka bez powiązania',
        active: true,
        preferred: false,
      },
    ],
  });
  if (options.devMode) process.env.BUSINESS_ADMIN_DEV_MODE = 'true';
  else delete process.env.BUSINESS_ADMIN_DEV_MODE;
  const app = createApp(
    undefined,
    undefined,
    undefined,
    { runtime: 'node' },
    {
      service: new BusinessService(repository, repository),
      ...(options.admin
        ? {
            admin: new BusinessAdminService(repository, repository, repository),
          }
        : {}),
    },
  );
  return { app, repository };
}

describe('business read API', () => {
  it('lists organizations', async () => {
    const response = await request(api().app).get(
      '/api/business/organizations',
    );
    expect(response.status).toBe(200);
    expect(response.body.items[0]).toMatchObject({ id: 'org:a' });
  });

  it('returns the assortment with its summary', async () => {
    const response = await request(api().app).get(
      '/api/business/organizations/org%3Aa/assortment',
    );
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.summary).toMatchObject({ total: 1, unmatched: 1 });
  });

  it('parses explicit false boolean filters without coercing them to true', async () => {
    const response = await request(api().app).get(
      '/api/business/organizations/org%3Aa/assortment?active=false&preferred=false&hasPrice=false',
    );
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(0);
  });

  it('returns 404 for an unknown organization', async () => {
    const response = await request(api().app).get(
      '/api/business/organizations/org%3Azzz/assortment',
    );
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'organization-not-found' },
    });
  });

  it('rejects a malformed query or date', async () => {
    for (const path of [
      '/api/business/organizations/org%3Aa/assortment?limit=999',
      '/api/business/organizations/org%3Aa/assortment?filter=nonsense',
      '/api/business/organizations/org%3Aa/assortment?at=yesterday',
    ]) {
      const response = await request(api().app).get(path);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('business-invalid-request');
    }
  });

  it('returns organization prices for known variants', async () => {
    const response = await request(api().app).get(
      `/api/business/organizations/org%3Aa/prices?ids=${encodeURIComponent(KODA)}`,
    );
    expect(response.status).toBe(200);
    expect(response.body.items[0]).toEqual({
      commercialVariantId: KODA,
      missing: 'not-in-assortment',
    });
  });

  it('returns one organization-scoped detail with price history', async () => {
    const { app } = api();
    const response = await request(app).get(
      '/api/business/organizations/org%3Aa/assortment-detail?itemId=oai%3Aa%3A1',
    );
    expect(response.status).toBe(200);
    expect(response.body.row.item.id).toBe('oai:a:1');
    expect(response.body.priceHistory).toEqual([]);
  });

  it('reports the business layer as unavailable when no database is configured', async () => {
    const response = await request(createApp()).get(
      '/api/business/organizations',
    );
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: { code: 'business-unavailable' },
    });
  });

  it('404s an unknown business path', async () => {
    const response = await request(api().app).get(
      '/api/business/organizations/org%3Aa/nonsense',
    );
    expect(response.status).toBe(404);
  });
});

/**
 * PRODUCTION ADMIN AUTH IS NOT IMPLEMENTED YET. These tests pin the two gates
 * that stand in for it, so a future change cannot open the write surface by
 * accident.
 */
describe('admin write gate', () => {
  const linkBody = { itemId: 'oai:a:1', commercialVariantId: KODA };

  it('rejects a mutation when no admin service is constructed', async () => {
    const { app, repository } = api({ devMode: true });
    const response = await request(app)
      .post('/api/business/organizations/org%3Aa/assortment/link')
      .send(linkBody);
    expect(response.status).toBe(404);
    expect(repository.state.assortment[0]?.commercialVariantId).toBeUndefined();
  });

  it('rejects a mutation when the dev capability is disabled', async () => {
    const { app, repository } = api({ admin: true, devMode: false });
    const response = await request(app)
      .post('/api/business/organizations/org%3Aa/assortment/link')
      .send(linkBody);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'not-found' } });
    expect(repository.state.assortment[0]?.commercialVariantId).toBeUndefined();
  });

  it('allows a loopback mutation when the dev capability is on', async () => {
    const { app, repository } = api({ admin: true, devMode: true });
    const response = await request(app)
      .post('/api/business/organizations/org%3Aa/assortment/link')
      .send(linkBody);
    expect(response.status).toBe(200);
    expect(response.body.item.commercialVariantId).toBe(KODA);
    expect(repository.state.assortment[0]?.commercialVariantId).toBe(KODA);
  });

  it('applies a bounded bulk flag action behind the same write gate', async () => {
    const { app, repository } = api({ admin: true, devMode: true });
    const response = await request(app)
      .post('/api/business/organizations/org%3Aa/assortment/bulk-flags')
      .send({ itemIds: ['oai:a:1'], preferred: true });
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(repository.state.assortment[0]?.preferred).toBe(true);
  });

  it('creates a manual item and appends price versions behind the write gate', async () => {
    const { app, repository } = api({ admin: true, devMode: true });
    const created = await request(app)
      .post('/api/business/organizations/org%3Aa/assortment/create')
      .send({
        externalKey: 'A-DACH-002',
        sourceName: 'KODA ręcznie',
        commercialVariantId: KODA,
        price: {
          netAmountMinor: 482,
          saleUnit: 'piece',
          validFrom: '2026-09-20',
        },
      });
    expect(created.status).toBe(200);
    const itemId = created.body.item.id as string;
    const price = await request(app)
      .post('/api/business/organizations/org%3Aa/assortment/price')
      .send({
        itemId,
        netAmountMinor: 499,
        saleUnit: 'piece',
        validFrom: '2026-09-21',
      });
    expect(price.status).toBe(200);
    expect(repository.state.entries).toHaveLength(2);

    const detail = await request(app).get(
      `/api/business/organizations/org%3Aa/assortment-detail?itemId=${encodeURIComponent(itemId)}`,
    );
    expect(
      detail.body.priceHistory.map(
        (row: { netAmountMinor: number }) => row.netAmountMinor,
      ),
    ).toEqual([499, 482]);
  });

  it('rejects a mutation whose Host is not loopback', async () => {
    const { app } = api({ admin: true, devMode: true });
    const response = await request(app)
      .post('/api/business/organizations/org%3Aa/assortment/link')
      .set('Host', 'roofcalc.example.com')
      .send(linkBody);
    expect(response.status).toBe(404);
  });

  it('still rejects every other write method on the business path', async () => {
    const { app } = api({ admin: true, devMode: true });
    for (const method of ['put', 'patch', 'delete'] as const) {
      const agent = request(app);
      const response = await agent[method](
        '/api/business/organizations/org%3Aa/assortment/link',
      ).send(linkBody);
      expect(response.status).toBe(404);
    }
  });

  it('validates an admin body and reports a named error', async () => {
    const { app } = api({ admin: true, devMode: true });
    const bad = await request(app)
      .post('/api/business/organizations/org%3Aa/assortment/link')
      .send({ itemId: 'oai:a:1' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('business-invalid-request');

    const missing = await request(app)
      .post('/api/business/organizations/org%3Aa/assortment/link')
      .send({ itemId: 'oai:a:9', commercialVariantId: KODA });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('assortment-item-not-found');
  });

  it('runs a CSV import dry run and then applies it', async () => {
    const { app, repository } = api({ admin: true, devMode: true });
    const body = {
      sourceLabel: 'demo.csv',
      csv: 'KOD;NAZWA;CENA\nA-DACH-001;Dachówka;4,82\nNEW-1;Nowa pozycja;5,00\n',
      mapping: { externalKey: 'KOD', sourceName: 'NAZWA', netAmount: 'CENA' },
    };
    const dryRun = await request(app)
      .post('/api/business/organizations/org%3Aa/assortment/import')
      .send(body);
    expect(dryRun.status).toBe(200);
    expect(dryRun.body.applied).toBe(false);
    expect(repository.state.assortment).toHaveLength(1);

    const applied = await request(app)
      .post('/api/business/organizations/org%3Aa/assortment/import')
      .send({ ...body, apply: true });
    expect(applied.status).toBe(200);
    expect(applied.body.applied).toBe(true);
    expect(repository.state.assortment).toHaveLength(2);
  });

  it('unlinks without removing the organization row', async () => {
    const { app, repository } = api({ admin: true, devMode: true });
    await request(app)
      .post('/api/business/organizations/org%3Aa/assortment/link')
      .send(linkBody);
    const response = await request(app)
      .post('/api/business/organizations/org%3Aa/assortment/unlink')
      .send({ itemId: 'oai:a:1' });
    expect(response.status).toBe(200);
    expect(response.body.item.commercialVariantId).toBeUndefined();
    expect(repository.state.assortment).toHaveLength(1);
  });
});
