// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  AssortmentPreviewResponse,
  Organization,
  OrganizationAssortmentItem,
  OrganizationAssortmentResponse,
  OrganizationPricesResponse,
} from '@cieslacalc/business-core';
import '../i18n';
import { BusinessContextProvider } from './context';
import type { BusinessClient } from './client';
import { AdminAssortment } from './admin/AdminAssortment';
import { BusinessAssortmentPicker } from './BusinessAssortmentPicker';
import { BusinessHeader } from './BusinessHeader';
import { OutsideAssortmentNotice } from './OutsideAssortment';
import { guessMapping } from './admin/AssortmentImport';

const ORGANIZATION: Organization = {
  id: 'org:demo',
  slug: 'demo-hurtownia',
  name: 'DEMO Hurtownia',
  currencyCode: 'PLN',
  active: true,
};

const KODA = 'variant:swissporton:koda:antracytowa-angoba';

function row(
  overrides: Partial<OrganizationAssortmentItem> & { id: string },
  extra: Partial<OrganizationAssortmentResponse['items'][number]> = {},
): OrganizationAssortmentResponse['items'][number] {
  return {
    item: {
      organizationId: 'org:demo',
      externalKey: 'DACH-00384',
      sourceName: 'KODA antracyt',
      active: true,
      preferred: false,
      ...overrides,
    },
    state: overrides.commercialVariantId ? 'matched' : 'unmatched',
    ...extra,
  };
}

const MATCHED = row(
  { id: 'oai:1', commercialVariantId: KODA, preferred: true },
  {
    catalog: {
      productId: 'product:swissporton:koda',
      productName: 'KODA',
      manufacturerId: 'manufacturer:swissporton',
      manufacturerName: 'swissporTON',
      kind: 'roof-tile',
      currentRevisionId: 'revision:koda:1',
      variantId: KODA,
      variantName: 'Antracytowa angoba',
    },
    price: {
      priceListId: 'price-list:demo',
      priceListLabel: 'DEMO Hurtownia — cennik testowy',
      entryId: 'e:1',
      netAmountMinor: 482,
      currencyCode: 'PLN',
      saleUnit: 'piece',
      validFrom: '2026-09-01',
    },
  },
);

const UNMATCHED = row({
  id: 'oai:2',
  externalKey: 'MEM-00901',
  sourceName: 'Membrana 150',
});

function stubClient(overrides: Partial<BusinessClient> = {}): BusinessClient {
  return {
    listOrganizations: () => Promise.resolve([ORGANIZATION]),
    assortment: () =>
      Promise.resolve({
        organization: ORGANIZATION,
        items: [MATCHED, UNMATCHED],
        summary: {
          total: 2,
          matched: 1,
          unmatched: 1,
          inactive: 0,
          withoutPrice: 1,
        },
      } satisfies OrganizationAssortmentResponse),
    pricesForVariants: (_organizationId, ids) =>
      Promise.resolve({
        organizationId: 'org:demo',
        items: [...ids].map((commercialVariantId) =>
          commercialVariantId === KODA
            ? {
                commercialVariantId,
                externalKey: 'DACH-00384',
                price: MATCHED.price!,
              }
            : {
                commercialVariantId,
                missing: 'not-in-assortment' as const,
              },
        ),
      } satisfies OrganizationPricesResponse),
    assortmentDetail: () =>
      Promise.resolve({ row: MATCHED, priceHistory: [MATCHED.price!] }),
    link: () => Promise.reject(new Error('not-found')),
    unlink: () => Promise.reject(new Error('not-found')),
    setFlags: () => Promise.reject(new Error('not-found')),
    setFlagsBulk: () => Promise.reject(new Error('not-found')),
    createItem: () => Promise.reject(new Error('not-found')),
    addPrice: () => Promise.reject(new Error('not-found')),
    importCsv: () => Promise.reject(new Error('not-found')),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderBusiness(
  ui: React.ReactNode,
  {
    client = stubClient(),
    mode = 'business' as const,
  }: { client?: BusinessClient; mode?: 'standard' | 'business' } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BusinessContextProvider client={client} initialMode={mode}>
        {ui}
      </BusinessContextProvider>
    </QueryClientProvider>,
  );
}

describe('Standard mode regression', () => {
  it('renders no business header, selector or admin entry', async () => {
    const listOrganizations = vi.fn(() => Promise.resolve([ORGANIZATION]));
    renderBusiness(<BusinessHeader />, {
      mode: 'standard',
      client: stubClient({ listOrganizations }),
    });
    expect(screen.queryByTestId('business-header')).toBeNull();
    expect(screen.queryByTestId('business-admin-entry')).toBeNull();
    // §65: Standard mode issues no business request at all.
    await waitFor(() => expect(listOrganizations).not.toHaveBeenCalled());
  });

  it('renders no outside-assortment notice', () => {
    renderBusiness(
      <OutsideAssortmentNotice variantId="variant:other" productName="KODA" />,
      { mode: 'standard' },
    );
    expect(screen.queryByTestId('outside-assortment')).toBeNull();
  });
});

describe('business header', () => {
  it('names the active wholesaler and offers the admin entry', async () => {
    renderBusiness(<BusinessHeader />);
    expect(
      (await screen.findByTestId('business-organization-name')).textContent ??
        '',
    ).toContain('DEMO Hurtownia');
    expect(screen.getByTestId('business-admin-entry')).toBeTruthy();
  });

  it('says company data is unavailable rather than crashing', async () => {
    renderBusiness(<BusinessHeader />, {
      client: stubClient({
        listOrganizations: () => Promise.reject(new Error('offline')),
      }),
    });
    expect(
      (await screen.findByTestId('business-header-offline')).textContent ?? '',
    ).toMatch(/chwilowo niedostępne|temporarily unavailable/i);
  });
});

describe('business product picker', () => {
  const catalogStub = {
    listManufacturers: () => Promise.resolve([]),
    searchProducts: () => Promise.resolve({ items: [] }),
    getProduct: () =>
      Promise.resolve({
        manufacturer: {
          id: 'manufacturer:swissporton',
          slug: 'swissporton',
          name: 'swissporTON',
          active: true,
        },
        product: {
          id: 'product:swissporton:koda',
          manufacturerId: 'manufacturer:swissporton',
          slug: 'koda',
          name: 'KODA',
          coveringKind: 'roof-tile' as const,
          active: true,
        },
        currentRevision: {
          id: 'revision:koda:1',
          productId: 'product:swissporton:koda',
          revisionCode: 'r1',
          technicalSpec: {} as never,
        },
        variants: [
          {
            id: KODA,
            productId: 'product:swissporton:koda',
            name: 'Antracytowa angoba',
            active: true,
          },
        ],
      }),
    getRevision: () => Promise.reject(new Error('unused')),
  };

  it('lists only the company assortment for the requested kind, with codes', async () => {
    renderBusiness(
      <BusinessAssortmentPicker
        kind="roof-tile"
        onApply={vi.fn()}
        onBrowseCatalog={vi.fn()}
        catalog={catalogStub as never}
      />,
    );
    const rows = await screen.findAllByTestId('business-picker-row');
    // The unmatched membrane row is never offered as a technical product.
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent ?? '').toContain('DACH-00384');
    expect(rows[0]!.textContent ?? '').toMatch(/Kod hurtowni|Wholesaler code/i);
    expect(rows[0]!.textContent ?? '').toMatch(/Preferowany|Preferred/i);
    expect(rows[0]!.textContent ?? '').toMatch(
      /Cena: dostępna|Price: available/i,
    );
  });

  it('searches the assortment by warehouse code', async () => {
    const assortment = vi.fn(stubClient().assortment);
    const user = userEvent.setup();
    renderBusiness(
      <BusinessAssortmentPicker
        kind="roof-tile"
        onApply={vi.fn()}
        onBrowseCatalog={vi.fn()}
        catalog={catalogStub as never}
      />,
      { client: stubClient({ assortment }) },
    );
    await screen.findAllByTestId('business-picker-row');
    await user.type(screen.getByRole('textbox'), 'ZZZ');
    expect(await screen.findByTestId('business-picker-empty')).toBeTruthy();
    await waitFor(() =>
      expect(assortment).toHaveBeenCalledWith(
        'org:demo',
        expect.objectContaining({ q: 'ZZZ', limit: 40 }),
        expect.anything(),
      ),
    );
  });

  it('loads the next bounded page without replacing the first page', async () => {
    const second = {
      ...MATCHED,
      item: {
        ...MATCHED.item,
        id: 'oai:late',
        externalKey: 'DACH-09999',
        sourceName: 'KODA późna pozycja',
        preferred: false,
      },
    };
    const assortment: BusinessClient['assortment'] = vi.fn(
      (_organizationId, query) =>
        Promise.resolve({
          organization: ORGANIZATION,
          items: query.cursor ? [second] : [MATCHED],
          summary: {
            total: 2,
            matched: 2,
            unmatched: 0,
            inactive: 0,
            withoutPrice: 0,
          },
          ...(query.cursor ? {} : { nextCursor: '40' }),
        }),
    );
    const user = userEvent.setup();
    renderBusiness(
      <BusinessAssortmentPicker
        kind="roof-tile"
        onApply={vi.fn()}
        onBrowseCatalog={vi.fn()}
        catalog={catalogStub as never}
      />,
      { client: stubClient({ assortment }) },
    );
    expect(await screen.findAllByTestId('business-picker-row')).toHaveLength(1);
    await user.click(
      screen.getByRole('button', { name: /Załaduj więcej|Load more/i }),
    );
    await waitFor(() =>
      expect(screen.getAllByTestId('business-picker-row')).toHaveLength(2),
    );
    expect(vi.mocked(assortment).mock.calls[1]?.[1]).toMatchObject({
      cursor: '40',
      limit: 40,
    });
  });

  it('offers the full technical catalogue as a secondary route', async () => {
    const onBrowseCatalog = vi.fn();
    const user = userEvent.setup();
    renderBusiness(
      <BusinessAssortmentPicker
        kind="roof-tile"
        onApply={vi.fn()}
        onBrowseCatalog={onBrowseCatalog}
        catalog={catalogStub as never}
      />,
    );
    await user.click(
      await screen.findByRole('button', {
        name: /katalog techniczny|technical catalogue/i,
      }),
    );
    expect(onBrowseCatalog).toHaveBeenCalled();
  });

  it('says company data is unavailable and still offers the catalogue', async () => {
    renderBusiness(
      <BusinessAssortmentPicker
        kind="roof-tile"
        onApply={vi.fn()}
        onBrowseCatalog={vi.fn()}
        catalog={catalogStub as never}
      />,
      {
        client: stubClient({
          assortment: () => Promise.reject(new Error('offline')),
        }),
      },
    );
    expect(
      await screen.findByText(/chwilowo niedostępne|temporarily unavailable/i),
    ).toBeTruthy();
  });
});

describe('outside assortment', () => {
  it('reports the commercial state and insists the roof stays valid', async () => {
    renderBusiness(
      <OutsideAssortmentNotice
        variantId="variant:not-sold"
        productName="KODA antracyt"
        onFindReplacement={vi.fn()}
      />,
    );
    const notice = await screen.findByTestId('outside-assortment');
    expect(notice.textContent ?? '').toMatch(
      /Brak w asortymencie|Not in assortment/i,
    );
    expect(notice.textContent ?? '').toMatch(/pozostają ważne|stays valid/i);
    expect(within(notice).getByTestId('outside-find-replacement')).toBeTruthy();
    expect(within(notice).getByTestId('outside-keep')).toBeTruthy();
  });

  it('lets the user keep the technical product, which only hides the notice', async () => {
    const user = userEvent.setup();
    renderBusiness(
      <OutsideAssortmentNotice
        variantId="variant:not-sold"
        productName="KODA antracyt"
      />,
    );
    await screen.findByTestId('outside-assortment');
    await user.click(screen.getByTestId('outside-keep'));
    await waitFor(() =>
      expect(screen.queryByTestId('outside-assortment')).toBeNull(),
    );
  });

  it('shows nothing for a product the wholesaler does sell', async () => {
    renderBusiness(
      <OutsideAssortmentNotice variantId={KODA} productName="KODA antracyt" />,
    );
    await waitFor(() =>
      expect(screen.queryByTestId('outside-assortment')).toBeNull(),
    );
  });
});

describe('admin assortment', () => {
  it('shows the dashboard counts and every row', async () => {
    renderBusiness(<AdminAssortment onClose={vi.fn()} />);
    const rows = await screen.findAllByTestId('admin-row');
    expect(rows).toHaveLength(2);
    expect(screen.getByTestId('admin-dashboard').textContent ?? '').toContain(
      '2',
    );
    expect(rows[1]!.textContent ?? '').toMatch(/NIEPOWIĄZANY|UNMATCHED/i);
  });

  it('filters to unmatched rows', async () => {
    const assortment = vi.fn(stubClient().assortment);
    const user = userEvent.setup();
    renderBusiness(<AdminAssortment onClose={vi.fn()} />, {
      client: stubClient({ assortment }),
    });
    await screen.findAllByTestId('admin-row');
    await user.click(
      screen.getByRole('tab', { name: /Niepowiązane|Unmatched/i }),
    );
    await waitFor(() =>
      expect(assortment).toHaveBeenCalledWith(
        'org:demo',
        expect.objectContaining({ filter: 'unmatched' }),
        expect.anything(),
      ),
    );
  });

  it('bulk-marks selected assortment rows as preferred', async () => {
    const setFlagsBulk = vi.fn(() => Promise.resolve([MATCHED.item]));
    const user = userEvent.setup();
    renderBusiness(<AdminAssortment onClose={vi.fn()} />, {
      client: stubClient({ setFlagsBulk }),
    });
    await screen.findAllByTestId('admin-row');
    await user.click(screen.getByRole('checkbox', { name: /DACH-00384/ }));
    await user.click(
      screen.getByRole('button', {
        name: /Oznacz jako preferowane|Mark preferred/i,
      }),
    );
    await waitFor(() =>
      expect(setFlagsBulk).toHaveBeenCalledWith('org:demo', ['oai:1'], {
        preferred: true,
      }),
    );
  });

  it('opens a row detail with the internal SKU and the match', async () => {
    const user = userEvent.setup();
    renderBusiness(<AdminAssortment onClose={vi.fn()} />);
    const rows = await screen.findAllByTestId('admin-row');
    await user.click(rows[0]!);
    const detail = await screen.findByTestId('assortment-detail');
    expect(
      within(detail).getByTestId('detail-match').textContent ?? '',
    ).toContain('swissporTON');
    expect(detail.textContent ?? '').toContain('DACH-00384');
    expect(within(detail).getByTestId('detail-unlink')).toBeTruthy();
  });

  it('appends a new price version and shows price history', async () => {
    const addPrice: BusinessClient['addPrice'] = vi.fn(async (_org, input) => ({
      id: 'price:new',
      priceListId: 'price-list:demo',
      commercialVariantId: KODA,
      saleUnit: input.saleUnit,
      netAmountMinor: input.netAmountMinor,
      validFrom: input.validFrom,
    }));
    const user = userEvent.setup();
    renderBusiness(<AdminAssortment onClose={vi.fn()} />, {
      client: stubClient({ addPrice }),
    });
    await user.click((await screen.findAllByTestId('admin-row'))[0]!);
    const editor = await screen.findByTestId('price-editor');
    expect(within(editor).getByTestId('price-history')).toBeTruthy();
    await user.type(
      within(editor).getByLabelText(/Cena netto|Net price/i),
      '5,25',
    );
    await user.click(
      within(editor).getByRole('button', {
        name: /Zapisz nową cenę|Save new price/i,
      }),
    );
    await waitFor(() =>
      expect(addPrice).toHaveBeenCalledWith(
        'org:demo',
        expect.objectContaining({
          itemId: 'oai:1',
          netAmountMinor: 525,
          saleUnit: 'piece',
        }),
      ),
    );
  });

  it('adds one assortment row without requiring a CSV file', async () => {
    const createItem: BusinessClient['createItem'] = vi.fn(
      async (_org, input) => ({
        id: 'oai:manual',
        organizationId: 'org:demo',
        externalKey: input.externalKey,
        sourceName: input.sourceName,
        active: input.active,
        preferred: input.preferred,
      }),
    );
    const user = userEvent.setup();
    renderBusiness(<AdminAssortment onClose={vi.fn()} />, {
      client: stubClient({ createItem }),
    });
    await screen.findAllByTestId('admin-row');
    await user.click(screen.getByTestId('admin-manual-open'));
    const form = await screen.findByTestId('manual-assortment-entry');
    await user.type(
      within(form).getByLabelText(/Kod hurtowni|Internal SKU/i),
      'NOWY-1',
    );
    await user.type(
      within(form).getByLabelText(/Nazwa z importu|Imported name/i),
      'Nowy produkt',
    );
    await user.click(
      within(form).getByRole('button', {
        name: /Dodaj produkt|Add product/i,
      }),
    );
    await waitFor(() =>
      expect(createItem).toHaveBeenCalledWith(
        'org:demo',
        expect.objectContaining({
          externalKey: 'NOWY-1',
          sourceName: 'Nowy produkt',
        }),
      ),
    );
  });

  it('warns that an unmatched row is not a technical product', async () => {
    const user = userEvent.setup();
    renderBusiness(<AdminAssortment onClose={vi.fn()} />);
    const rows = await screen.findAllByTestId('admin-row');
    await user.click(rows[1]!);
    const detail = await screen.findByTestId('assortment-detail');
    expect(detail.textContent ?? '').toMatch(
      /nie może być użyta jako materiał techniczny|cannot be used as technical material/i,
    );
  });

  it('reports the disabled write capability instead of failing silently', async () => {
    const user = userEvent.setup();
    renderBusiness(<AdminAssortment onClose={vi.fn()} />);
    const rows = await screen.findAllByTestId('admin-row');
    await user.click(rows[0]!);
    await user.click(await screen.findByTestId('detail-unlink'));
    expect((await screen.findByRole('alert')).textContent ?? '').toMatch(
      /BUSINESS_ADMIN_DEV_MODE/,
    );
  });

  it('names the real reason a link was refused, not a generic failure', async () => {
    const user = userEvent.setup();
    renderBusiness(<AdminAssortment onClose={vi.fn()} />, {
      client: stubClient({
        setFlags: () => Promise.reject(new Error('duplicate-active-variant')),
      }),
    });
    const rows = await screen.findAllByTestId('admin-row');
    await user.click(rows[0]!);
    await user.click(
      await screen.findByRole('button', {
        name: /preferowany|preferred/i,
      }),
    );
    expect((await screen.findByRole('alert')).textContent ?? '').toMatch(
      /już powiązany|already linked/i,
    );
  });

  it('says company data is unavailable rather than showing an empty table', async () => {
    renderBusiness(<AdminAssortment onClose={vi.fn()} />, {
      client: stubClient({
        assortment: () => Promise.reject(new Error('offline')),
      }),
    });
    expect(
      await screen.findByText(/chwilowo niedostępne|temporarily unavailable/i),
    ).toBeTruthy();
  });
});

describe('CSV import screen', () => {
  const PREVIEW: AssortmentPreviewResponse = {
    organizationId: 'org:demo',
    applied: false,
    counts: {
      total: 2,
      matched: 1,
      needsReview: 0,
      noMatch: 1,
      invalidPrice: 0,
      create: 2,
      update: 0,
      unchanged: 0,
      skip: 0,
    },
    rows: [
      {
        sourceLine: 2,
        externalKey: 'DACH-00384',
        sourceName: 'KODA antracyt',
        action: 'create',
        matchState: 'matched',
        commercialVariantId: KODA,
        issues: [],
      },
      {
        sourceLine: 3,
        externalKey: 'MEM-00901',
        sourceName: 'Membrana 150',
        action: 'create',
        matchState: 'no-match',
        issues: [],
      },
    ],
  };

  async function openImport(client: BusinessClient) {
    const user = userEvent.setup();
    renderBusiness(<AdminAssortment onClose={vi.fn()} />, { client });
    await screen.findAllByTestId('admin-row');
    await user.click(screen.getByTestId('admin-import-open'));
    const file = new File(
      [
        'KOD_TOW;NAZWA;CENA_NETTO\nDACH-00384;KODA antracyt;4,82\nMEM-00901;Membrana 150;12,90\n',
      ],
      'cennik.csv',
      { type: 'text/csv' },
    );
    await user.upload(screen.getByTestId('import-file'), file);
    return user;
  }

  it('maps recognisable columns automatically and shows a dry-run preview', async () => {
    const importCsv: BusinessClient['importCsv'] = vi.fn(() =>
      Promise.resolve(PREVIEW),
    );
    const user = await openImport(stubClient({ importCsv }));
    await waitFor(() =>
      expect(
        (screen.getByTestId('map-externalKey') as HTMLSelectElement).value,
      ).toBe('KOD_TOW'),
    );
    expect(
      (screen.getByTestId('map-sourceName') as HTMLSelectElement).value,
    ).toBe('NAZWA');
    expect(
      (screen.getByTestId('map-netAmount') as HTMLSelectElement).value,
    ).toBe('CENA_NETTO');

    await user.click(screen.getByTestId('import-dry-run'));
    const preview = await screen.findByTestId('import-preview');
    expect(preview.textContent ?? '').toContain('2');
    expect(
      within(preview).getByTestId('preview-matched').textContent ?? '',
    ).toContain('1');
    expect(
      within(preview).getByTestId('preview-no-match').textContent ?? '',
    ).toContain('1');
    expect(importCsv).toHaveBeenCalledWith(
      'org:demo',
      expect.objectContaining({ apply: false, sourceLabel: 'cennik.csv' }),
    );
  });

  it('applies only on an explicit second action', async () => {
    const importCsv: BusinessClient['importCsv'] = vi.fn(() =>
      Promise.resolve(PREVIEW),
    );
    const user = await openImport(stubClient({ importCsv }));
    await user.click(screen.getByTestId('import-dry-run'));
    await screen.findByTestId('import-preview');
    expect(vi.mocked(importCsv)).toHaveBeenCalledTimes(1);

    vi.mocked(importCsv).mockResolvedValueOnce({ ...PREVIEW, applied: true });
    await user.click(screen.getByTestId('import-apply'));
    await waitFor(() => expect(vi.mocked(importCsv)).toHaveBeenCalledTimes(2));
    expect(vi.mocked(importCsv).mock.calls[1]?.[1]).toMatchObject({
      apply: true,
    });
  });

  it('invalidates a preview when the column mapping changes', async () => {
    const user = await openImport(
      stubClient({ importCsv: () => Promise.resolve(PREVIEW) }),
    );
    await user.click(screen.getByTestId('import-dry-run'));
    await screen.findByTestId('import-preview');
    await user.selectOptions(screen.getByTestId('map-netAmount'), '');
    expect(screen.queryByTestId('import-preview')).toBeNull();
    expect(screen.queryByTestId('import-apply')).toBeNull();
  });

  it('lists the rows that need attention', async () => {
    const user = await openImport(
      stubClient({ importCsv: () => Promise.resolve(PREVIEW) }),
    );
    await user.click(screen.getByTestId('import-dry-run'));
    await screen.findByTestId('import-preview');
    await user.click(screen.getByTestId('import-show-problems'));
    const problems = await screen.findByTestId('import-problems');
    expect(problems.textContent ?? '').toContain('MEM-00901');
    expect(problems.textContent ?? '').toMatch(/BRAK DOPASOWANIA|NO MATCH/i);
  });

  it('reports the disabled write capability', async () => {
    const user = await openImport(stubClient());
    await user.click(screen.getByTestId('import-dry-run'));
    expect((await screen.findByRole('alert')).textContent ?? '').toMatch(
      /BUSINESS_ADMIN_DEV_MODE/,
    );
  });
});

describe('column mapping guesses', () => {
  it('recognises common Polish and English headers', () => {
    expect(
      guessMapping(['KOD_TOW', 'NAZWA', 'CENA_NETTO', 'EAN', 'VAT', 'JM']),
    ).toEqual({
      externalKey: 'KOD_TOW',
      sourceName: 'NAZWA',
      netAmount: 'CENA_NETTO',
      ean: 'EAN',
      vatRate: 'VAT',
      saleUnit: 'JM',
    });
    expect(guessMapping(['sku', 'name', 'net_price'])).toMatchObject({
      externalKey: 'sku',
      sourceName: 'name',
      netAmount: 'net_price',
    });
  });

  it('guesses nothing it cannot recognise, leaving the operator to choose', () => {
    expect(guessMapping(['kolumna1', 'kolumna2'])).toEqual({});
  });
});
