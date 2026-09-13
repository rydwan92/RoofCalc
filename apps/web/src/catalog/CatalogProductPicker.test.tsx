// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../i18n';
import { CatalogProductPicker } from './CatalogProductPicker';
import type { CatalogClient } from './client';
import type { CatalogProductDetail } from '@cieslacalc/catalog-core';

const detail: CatalogProductDetail = {
  manufacturer: {
    id: 'm:demo',
    slug: 'demo',
    name: 'DEMO Roof',
    active: true,
  },
  product: {
    id: 'p:tile',
    manufacturerId: 'm:demo',
    slug: 'tile',
    name: 'Tile 30 (DEMO)',
    coveringKind: 'roof-tile',
    active: true,
  },
  currentRevision: {
    id: 'r:tile:1',
    productId: 'p:tile',
    revisionCode: '2026-01',
    source: { label: 'DEMO fixture' },
    technicalSpec: {
      schemaVersion: 1,
      kind: 'roof-tile',
      installationModes: [
        {
          id: 'standard',
          coverWidthMm: 300,
          gaugeRangeMm: { min: 320, max: 360 },
          minPitchDeg: 20,
          coursePattern: {
            layers: [{ id: 'base', horizontalOffsetFraction: 0 }],
            battenRowOffsetCycle: [0],
          },
        },
      ],
    },
  },
  variants: [
    {
      id: 'v:tile:red',
      productId: 'p:tile',
      name: 'Red',
      color: 'red',
      active: true,
    },
  ],
};

function client(overrides: Partial<CatalogClient> = {}): CatalogClient {
  return {
    listManufacturers: vi.fn(async () => [detail.manufacturer]),
    searchProducts: vi.fn(async (query) => ({
      items:
        query.kind === 'roof-tile'
          ? [
              {
                id: detail.product.id,
                manufacturer: {
                  id: detail.manufacturer.id,
                  name: detail.manufacturer.name,
                },
                name: detail.product.name,
                kind: 'roof-tile' as const,
                currentRevisionId: detail.currentRevision.id,
                variantCount: 1,
                technicalPreview: {
                  effectiveWidthMm: 300,
                  gaugeMinMm: 320,
                  gaugeMaxMm: 360,
                  minPitchDeg: 20,
                },
              },
            ]
          : [],
    })),
    getProduct: vi.fn(async () => detail),
    getRevision: vi.fn(async () => ({
      manufacturer: detail.manufacturer,
      product: detail.product,
      revision: detail.currentRevision,
    })),
    ...overrides,
  };
}

function renderPicker(
  api: CatalogClient,
  onApply = vi.fn(),
  onManual = vi.fn(),
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <CatalogProductPicker
        kind="roof-tile"
        client={api}
        onApply={onApply}
        onManual={onManual}
        onClose={() => undefined}
      />
    </QueryClientProvider>,
  );
  return { onApply, onManual };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('catalogue product picker', () => {
  it('shows loading then filtered scan-friendly results', async () => {
    const api = client();
    renderPicker(api);
    expect(screen.getByText('Ładowanie katalogu…')).toBeTruthy();
    expect(await screen.findByText('Tile 30 (DEMO)')).toBeTruthy();
    expect(screen.getByText('320–360 mm')).toBeTruthy();
    expect(api.searchProducts).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'roof-tile', limit: 30 }),
      expect.any(AbortSignal),
    );
    fireEvent.change(screen.getByLabelText('Producent'), {
      target: { value: 'm:demo' },
    });
    await waitFor(() =>
      expect(api.searchProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({
          kind: 'roof-tile',
          manufacturerId: 'm:demo',
        }),
        expect.any(AbortSignal),
      ),
    );
  });

  it('debounces search and applies an exact revision plus selected variant', async () => {
    const api = client();
    const { onApply } = renderPicker(api);
    await screen.findByText('Tile 30 (DEMO)');
    fireEvent.change(
      screen.getByPlaceholderText('Szukaj producenta lub produktu'),
      {
        target: { value: 'tile' },
      },
    );
    expect(api.searchProducts).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(api.searchProducts).toHaveBeenCalledTimes(2), {
      timeout: 1_500,
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Wybierz' }));
    const product = await screen.findByTestId('catalog-detail');
    fireEvent.change(await within(product).findByLabelText('Wariant'), {
      target: { value: 'v:tile:red' },
    });
    fireEvent.click(
      within(product).getByRole('button', { name: 'Zastosuj produkt' }),
    );
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(api.getRevision).toHaveBeenCalledWith(
      'p:tile',
      'r:tile:1',
      expect.any(AbortSignal),
    );
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        catalogRef: {
          productId: 'p:tile',
          technicalRevisionId: 'r:tile:1',
          variantId: 'v:tile:red',
        },
        displaySnapshot: {
          manufacturer: 'DEMO Roof',
          familyName: 'Tile 30 (DEMO)',
          variantName: 'Red',
        },
        technicalSpecSnapshot: expect.objectContaining({ kind: 'roof-tile' }),
      }),
    );
  });

  it('offers a manual fallback without exposing a raw network error', async () => {
    const api = client({
      searchProducts: vi.fn(async () => {
        throw new Error('ECONNREFUSED secret');
      }),
    });
    const { onManual } = renderPicker(api);
    expect(
      await screen.findByText('Katalog jest obecnie niedostępny.'),
    ).toBeTruthy();
    expect(screen.queryByText(/ECONNREFUSED/)).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Użyj parametrów ręcznych' }),
    );
    expect(onManual).toHaveBeenCalledTimes(1);
  });

  it('shows a clear empty state for a valid search with no matches', async () => {
    renderPicker(
      client({
        searchProducts: vi.fn(async () => ({ items: [] })),
      }),
    );
    expect(await screen.findByText(/Brak produkt/)).toBeTruthy();
  });

  it('keeps detail and results in one predictable dialog', async () => {
    renderPicker(client());
    const dialog = screen.getByRole('dialog', { name: 'Katalog produktów' });
    await within(dialog).findByText('Tile 30 (DEMO)');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Wybierz' }));
    await within(dialog).findByTestId('catalog-detail');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Wróć do wyników' }),
    );
    expect(await within(dialog).findByTestId('catalog-results')).toBeTruthy();
  });

  it('uses one dominant mobile sheet for results and detail', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    renderPicker(client());
    const sheet = screen.getByRole('dialog', { name: /Katalog produkt/ });
    expect(sheet.classList.contains('is-expanded')).toBe(true);
    expect(
      within(sheet).getByPlaceholderText(/Szukaj producenta lub produktu/),
    ).toBeTruthy();
    await within(sheet).findByText('Tile 30 (DEMO)');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Wybierz' }));
    await within(sheet).findByTestId('catalog-detail');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.click(
      within(sheet).getByRole('button', { name: /Wr.*do wynik/ }),
    );
    expect(await within(sheet).findByTestId('catalog-results')).toBeTruthy();
  });
});
