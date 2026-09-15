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
import { MembraneProductPicker } from './MembraneProductPicker';
import type { CatalogClient } from './client';
import type { CatalogProductDetail } from '@cieslacalc/catalog-core';

const detail: CatalogProductDetail = {
  manufacturer: {
    id: 'm:dorken',
    slug: 'dorken',
    name: 'DÖRKEN',
    active: true,
  },
  product: {
    id: 'p:delta-maxx-plus',
    manufacturerId: 'm:dorken',
    slug: 'delta-maxx-plus',
    name: 'DELTA-MAXX PLUS',
    coveringKind: 'membrane',
    active: true,
  },
  currentRevision: {
    id: 'r:delta-maxx-plus:1',
    productId: 'p:delta-maxx-plus',
    revisionCode: '2026-09',
    source: { label: 'DEMO fixture' },
    technicalSpec: {
      schemaVersion: 1,
      kind: 'membrane',
      rollWidthMm: 1500,
      rollLengthMm: 50_000,
      minimumOverlapMm: 100,
      material: 'synthetic',
      salesUnit: 'roll',
    },
  },
  variants: [],
};

function client(overrides: Partial<CatalogClient> = {}): CatalogClient {
  return {
    listManufacturers: vi.fn(async () => [detail.manufacturer]),
    searchProducts: vi.fn(async (query) => ({
      items:
        query.kind === 'membrane'
          ? [
              {
                id: detail.product.id,
                manufacturer: {
                  id: detail.manufacturer.id,
                  name: detail.manufacturer.name,
                },
                name: detail.product.name,
                kind: 'membrane' as const,
                currentRevisionId: detail.currentRevision.id,
                variantCount: 0,
                technicalPreview: {
                  rollWidthMm: 1500,
                  rollLengthMm: 50_000,
                  minimumOverlapMm: 100,
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
      <MembraneProductPicker
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

describe('membrane catalogue picker', () => {
  it('always searches kind: membrane and shows scan-friendly roll facts', async () => {
    const api = client();
    renderPicker(api);
    expect(await screen.findByText('DELTA-MAXX PLUS')).toBeTruthy();
    expect(screen.getByText('1500 mm')).toBeTruthy();
    expect(api.searchProducts).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'membrane', limit: 30 }),
      expect.any(AbortSignal),
    );
  });

  it('applies an exact revision as a MembraneProductSelection, never a covering one', async () => {
    const api = client();
    const { onApply } = renderPicker(api);
    await screen.findByText('DELTA-MAXX PLUS');
    fireEvent.click(await screen.findByRole('button', { name: 'Szczegóły' }));
    const product = await screen.findByTestId('membrane-catalog-detail');
    fireEvent.click(
      await within(product).findByRole('button', { name: 'Użyj produktu' }),
    );
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(api.getRevision).toHaveBeenCalledWith(
      'p:delta-maxx-plus',
      'r:delta-maxx-plus:1',
      expect.any(AbortSignal),
    );
    expect(onApply).toHaveBeenCalledWith({
      catalogRef: {
        productId: 'p:delta-maxx-plus',
        technicalRevisionId: 'r:delta-maxx-plus:1',
        variantId: undefined,
      },
      displaySnapshot: {
        manufacturer: 'DÖRKEN',
        familyName: 'DELTA-MAXX PLUS',
        variantName: undefined,
        revisionCode: '2026-09',
      },
      technicalSpecSnapshot: detail.currentRevision.technicalSpec,
    });
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
    expect(await screen.findByText(/Brak membran/)).toBeTruthy();
  });
});
