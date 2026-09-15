import { expect, it } from 'vitest';
import { PricingService } from './service';
import { MemoryPricingRepository } from './memory-repository';

it('returns every active source for explicit choice, excluding expired lists', async () => {
  const service = new PricingService(
    new MemoryPricingRepository({
      priceLists: [
        {
          id: 'a',
          ownerLabel: 'A',
          currencyCode: 'PLN',
          validFrom: '2026-01-01',
        },
        {
          id: 'b',
          ownerLabel: 'B',
          currencyCode: 'PLN',
          validFrom: '2026-01-01',
        },
        {
          id: 'old',
          ownerLabel: 'Old',
          currencyCode: 'PLN',
          validFrom: '2026-01-01',
          validTo: '2026-01-02',
        },
      ],
      entries: ['a', 'b', 'old'].map((id) => ({
        id,
        priceListId: id,
        commercialVariantId: 'variant',
        saleUnit: 'piece',
        netAmountMinor: 100,
        validFrom: '2026-01-01',
      })),
    }),
  );
  const result = await service.pricesForVariants(['variant']);
  expect(result.map((price) => price.ownerLabel)).toEqual(['A', 'B']);
});
