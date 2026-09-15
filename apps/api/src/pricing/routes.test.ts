import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { MemoryPricingRepository } from './memory-repository';
import { PricingService } from './service';

function appWithSeed() {
  const repository = new MemoryPricingRepository({
    priceLists: [
      {
        id: 'list-1',
        ownerLabel: 'Test retailer',
        currencyCode: 'PLN',
        validFrom: '2026-09-01',
      },
    ],
    entries: [
      {
        id: 'entry-1',
        priceListId: 'list-1',
        commercialVariantId: 'variant:creaton:koda:copper-nuance',
        saleUnit: 'piece',
        netAmountMinor: 924,
        validFrom: '2026-09-01',
      },
    ],
  });
  return createApp(undefined, undefined, new PricingService(repository));
}

describe('GET /api/pricing/variants', () => {
  it('is unavailable (503) with no pricing service configured', async () => {
    const app = createApp();
    const response = await request(app).get(
      '/api/pricing/variants?ids=variant:creaton:koda:copper-nuance',
    );
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('pricing-unavailable');
  });

  it('returns the active price for a known variant', async () => {
    const response = await request(appWithSeed()).get(
      '/api/pricing/variants?ids=variant:creaton:koda:copper-nuance',
    );
    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([
      {
        variantId: 'variant:creaton:koda:copper-nuance',
        entry: {
          id: 'entry-1',
          priceListId: 'list-1',
          commercialVariantId: 'variant:creaton:koda:copper-nuance',
          saleUnit: 'piece',
          netAmountMinor: 924,
          validFrom: '2026-09-01',
        },
        currencyCode: 'PLN',
      },
    ]);
  });

  it('omits an unpriced variant rather than inventing a value', async () => {
    const response = await request(appWithSeed()).get(
      '/api/pricing/variants?ids=variant:unpriced',
    );
    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
  });

  it('resolves several variant IDs in one request', async () => {
    const response = await request(appWithSeed()).get(
      '/api/pricing/variants?ids=variant:creaton:koda:copper-nuance,variant:unpriced',
    );
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
  });

  it('returns an empty list for a request with no ids', async () => {
    const response = await request(appWithSeed()).get('/api/pricing/variants');
    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
  });
});
