import { describe, expect, it } from 'vitest';
import type { PriceListEntry } from '@cieslacalc/pricing-core';
import {
  resolveOrganizationItemPrice,
  resolveOrganizationPrice,
  visiblePriceLists,
  type OrganizationAssortmentItem,
  type OrganizationContext,
  type OrganizationPriceList,
} from './index';

const VARIANT = 'variant:swissporton:koda:antracytowa-angoba';

function context(
  id: string,
  pricePolicy: OrganizationContext['pricePolicy'] = 'organization-then-catalogue',
): OrganizationContext {
  return {
    organization: {
      id,
      slug: id.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      name: id,
      currencyCode: 'PLN',
      active: true,
    },
    pricePolicy,
  };
}

function assortmentRow(
  organizationId: string,
  overrides: Partial<OrganizationAssortmentItem> = {},
): OrganizationAssortmentItem {
  return {
    id: `${organizationId}:row`,
    organizationId,
    commercialVariantId: VARIANT,
    externalKey: `${organizationId}-SKU`,
    sourceName: 'KODA antracyt',
    active: true,
    preferred: false,
    ...overrides,
  };
}

const globalList: OrganizationPriceList = {
  id: 'price-list:global',
  ownerLabel: 'rabatplus.pl (retail)',
  currencyCode: 'PLN',
  validFrom: '2026-01-01',
};
const listA: OrganizationPriceList = {
  id: 'price-list:a',
  organizationId: 'org:a',
  ownerLabel: 'Hurtownia A',
  currencyCode: 'PLN',
  validFrom: '2026-01-01',
};
const listB: OrganizationPriceList = {
  id: 'price-list:b',
  organizationId: 'org:b',
  ownerLabel: 'Hurtownia B',
  currencyCode: 'PLN',
  validFrom: '2026-01-01',
};

function entry(
  id: string,
  priceListId: string,
  netAmountMinor: number,
  overrides: Partial<PriceListEntry> = {},
): PriceListEntry {
  return {
    id,
    priceListId,
    commercialVariantId: VARIANT,
    saleUnit: 'piece',
    netAmountMinor,
    validFrom: '2026-01-01',
    ...overrides,
  };
}

const PRICE_LISTS = [globalList, listA, listB];
const ENTRIES = [
  entry('e:global', 'price-list:global', 924),
  entry('e:a', 'price-list:a', 482),
  entry('e:b', 'price-list:b', 401),
];
const ASSORTMENT = [assortmentRow('org:a'), assortmentRow('org:b')];

const at = '2026-09-20';

describe('organization price resolution', () => {
  it('returns the organization own price with full provenance', () => {
    const result = resolveOrganizationPrice({
      context: context('org:a'),
      commercialVariantId: VARIANT,
      assortment: ASSORTMENT,
      priceLists: PRICE_LISTS,
      entries: ENTRIES,
      atDate: at,
    });
    expect(result.price).toEqual({
      source: 'organization',
      organizationId: 'org:a',
      priceListId: 'price-list:a',
      priceListLabel: 'Hurtownia A',
      entryId: 'e:a',
      commercialVariantId: VARIANT,
      saleUnit: 'piece',
      netAmountMinor: 482,
      currencyCode: 'PLN',
      validFrom: '2026-01-01',
    });
  });

  it('never leaks another organization price (tenant isolation)', () => {
    for (const [organizationId, expected] of [
      ['org:a', 482],
      ['org:b', 401],
    ] as const) {
      const result = resolveOrganizationPrice({
        context: context(organizationId),
        commercialVariantId: VARIANT,
        assortment: ASSORTMENT,
        priceLists: PRICE_LISTS,
        entries: ENTRIES,
        atDate: at,
      });
      expect(result.price?.netAmountMinor).toBe(expected);
      expect(result.price?.organizationId).toBe(organizationId);
    }
  });

  it('says the product is outside the assortment instead of pricing it', () => {
    expect(
      resolveOrganizationPrice({
        context: context('org:c'),
        commercialVariantId: VARIANT,
        assortment: ASSORTMENT,
        priceLists: PRICE_LISTS,
        entries: ENTRIES,
        atDate: at,
      }),
    ).toEqual({ missing: 'not-in-assortment' });
  });

  it('refuses to price an inactive row', () => {
    expect(
      resolveOrganizationPrice({
        context: context('org:a'),
        commercialVariantId: VARIANT,
        assortment: [assortmentRow('org:a', { active: false })],
        priceLists: PRICE_LISTS,
        entries: ENTRIES,
        atDate: at,
      }),
    ).toEqual({ missing: 'assortment-inactive' });
  });

  it('an unmapped row cannot be reached by variant at all', () => {
    expect(
      resolveOrganizationPrice({
        context: context('org:a'),
        commercialVariantId: VARIANT,
        assortment: [
          assortmentRow('org:a', { commercialVariantId: undefined }),
        ],
        priceLists: PRICE_LISTS,
        entries: ENTRIES,
        atDate: at,
      }),
    ).toEqual({ missing: 'not-in-assortment' });
  });
});

describe('row-keyed resolution (Admin assortment list)', () => {
  it('names an unmatched row rather than showing an empty price', () => {
    expect(
      resolveOrganizationItemPrice({
        context: context('org:a'),
        item: assortmentRow('org:a', { commercialVariantId: undefined }),
        priceLists: PRICE_LISTS,
        entries: ENTRIES,
        atDate: at,
      }),
    ).toEqual({ missing: 'assortment-unmatched' });
  });

  it('refuses a row belonging to another organization', () => {
    expect(
      resolveOrganizationItemPrice({
        context: context('org:a'),
        item: assortmentRow('org:b'),
        priceLists: PRICE_LISTS,
        entries: ENTRIES,
        atDate: at,
      }),
    ).toEqual({ missing: 'not-in-assortment' });
  });

  it('prices a matched row from its own organization list', () => {
    expect(
      resolveOrganizationItemPrice({
        context: context('org:b', 'organization-only'),
        item: assortmentRow('org:b'),
        priceLists: PRICE_LISTS,
        entries: ENTRIES,
        atDate: at,
      }).price,
    ).toMatchObject({ netAmountMinor: 401, priceListId: 'price-list:b' });
  });
});

describe('price policy, validity and determinism', () => {
  it('falls back to a global catalogue price only when the policy allows it', () => {
    const input = {
      context: context('org:a'),
      commercialVariantId: VARIANT,
      assortment: ASSORTMENT,
      priceLists: [globalList, listA, listB],
      entries: [
        entry('e:global', 'price-list:global', 924),
        entry('e:b', 'price-list:b', 401),
      ],
      atDate: at,
    };
    expect(resolveOrganizationPrice(input).price).toMatchObject({
      source: 'catalogue',
      netAmountMinor: 924,
      priceListLabel: 'rabatplus.pl (retail)',
    });
    expect(
      resolveOrganizationPrice({
        ...input,
        context: context('org:a', 'organization-only'),
      }),
    ).toEqual({
      missing: 'no-organization-price',
    });
  });

  it('honours the requested sale unit and the organization currency', () => {
    const packEntry = entry('e:a-pack', 'price-list:a', 24100, {
      saleUnit: 'pack',
    });
    const result = resolveOrganizationPrice({
      context: context('org:a', 'organization-only'),
      commercialVariantId: VARIANT,
      assortment: ASSORTMENT,
      priceLists: [listA],
      entries: [packEntry],
      atDate: at,
      saleUnit: 'piece',
    });
    expect(result).toEqual({ missing: 'no-organization-price' });
    expect(
      resolveOrganizationPrice({
        context: context('org:a', 'organization-only'),
        commercialVariantId: VARIANT,
        assortment: ASSORTMENT,
        priceLists: [{ ...listA, currencyCode: 'EUR' }],
        entries: [entry('e:a', 'price-list:a', 120)],
        atDate: at,
      }),
    ).toEqual({ missing: 'no-organization-price' });
  });

  it('ignores an expired entry or an expired price list', () => {
    const expired = entry('e:a', 'price-list:a', 482, {
      validTo: '2026-06-30',
    });
    expect(
      resolveOrganizationPrice({
        context: context('org:a', 'organization-only'),
        commercialVariantId: VARIANT,
        assortment: ASSORTMENT,
        priceLists: [listA],
        entries: [expired],
        atDate: at,
      }),
    ).toEqual({ missing: 'no-organization-price' });
    expect(
      resolveOrganizationPrice({
        context: context('org:a', 'organization-only'),
        commercialVariantId: VARIANT,
        assortment: ASSORTMENT,
        priceLists: [{ ...listA, validTo: '2026-06-30' }],
        entries: [entry('e:a', 'price-list:a', 482)],
        atDate: at,
      }),
    ).toEqual({ missing: 'no-organization-price' });
  });

  it('picks the newest organization entry deterministically', () => {
    const result = resolveOrganizationPrice({
      context: context('org:a', 'organization-only'),
      commercialVariantId: VARIANT,
      assortment: ASSORTMENT,
      priceLists: [listA],
      entries: [
        entry('e:a-old', 'price-list:a', 482),
        entry('e:a-new', 'price-list:a', 510, { validFrom: '2026-09-01' }),
      ],
      atDate: at,
    });
    expect(result.price?.entryId).toBe('e:a-new');
  });
});

describe('visiblePriceLists', () => {
  it('shows global lists to everyone and an organization list only to its owner', () => {
    expect(
      visiblePriceLists(PRICE_LISTS, 'org:a').map((list) => list.id),
    ).toEqual(['price-list:global', 'price-list:a']);
    expect(
      visiblePriceLists(PRICE_LISTS, undefined).map((list) => list.id),
    ).toEqual(['price-list:global']);
  });
});
