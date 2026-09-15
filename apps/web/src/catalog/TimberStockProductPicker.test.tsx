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
import { TimberStockProductPicker } from './TimberStockProductPicker';
import type { CatalogClient } from './client';
import type {
  CatalogProductDetail,
  CatalogProductSummary,
} from '@cieslacalc/catalog-core';

const manufacturer = {
  id: 'm:generic-sawn-timber',
  slug: 'generic-sawn-timber',
  name: 'Generic sawn timber (C24)',
  active: true,
};

const detailA: CatalogProductDetail = {
  manufacturer,
  product: {
    id: 'p:timber-a',
    manufacturerId: manufacturer.id,
    slug: 'c24-45x145x4000',
    name: 'C24 45×145×4000',
    coveringKind: 'timber-stock',
    active: true,
  },
  currentRevision: {
    id: 'r:timber-a:1',
    productId: 'p:timber-a',
    revisionCode: '2026-09',
    source: { label: 'BAT fixture' },
    technicalSpec: {
      schemaVersion: 1,
      kind: 'timber-stock',
      widthMm: 45,
      depthMm: 145,
      lengthMm: 4000,
      strengthClass: 'C24',
      salesUnit: 'piece',
    },
  },
  variants: [
    {
      id: 'variant:timber:c24-45x145x4000:standard',
      productId: 'p:timber-a',
      name: 'Standard',
      active: true,
    },
  ],
};

const detailB: CatalogProductDetail = {
  manufacturer,
  product: {
    id: 'p:timber-b',
    manufacturerId: manufacturer.id,
    slug: 'c24-45x95x3000',
    name: 'C24 45×95×3000',
    coveringKind: 'timber-stock',
    active: true,
  },
  currentRevision: {
    id: 'r:timber-b:1',
    productId: 'p:timber-b',
    revisionCode: '2026-09',
    source: { label: 'Castorama fixture' },
    technicalSpec: {
      schemaVersion: 1,
      kind: 'timber-stock',
      widthMm: 45,
      depthMm: 95,
      lengthMm: 3000,
      strengthClass: 'C24',
      kilnDried: true,
      planed: true,
      salesUnit: 'piece',
    },
  },
  variants: [],
};

function summary(detail: CatalogProductDetail): CatalogProductSummary {
  const spec = detail.currentRevision.technicalSpec;
  return {
    id: detail.product.id,
    manufacturer: {
      id: detail.manufacturer.id,
      name: detail.manufacturer.name,
    },
    name: detail.product.name,
    kind: 'timber-stock',
    currentRevisionId: detail.currentRevision.id,
    variantCount: 0,
    technicalPreview:
      spec.kind === 'timber-stock'
        ? {
            sectionWidthMm: spec.widthMm,
            sectionDepthMm: spec.depthMm,
            lengthMm: spec.lengthMm,
            strengthClass: spec.strengthClass,
          }
        : {},
  };
}

function client(overrides: Partial<CatalogClient> = {}): CatalogClient {
  const details: Record<string, CatalogProductDetail> = {
    'p:timber-a': detailA,
    'p:timber-b': detailB,
  };
  return {
    listManufacturers: vi.fn(async () => [manufacturer]),
    searchProducts: vi.fn(async (query) => ({
      items:
        query.kind === 'timber-stock'
          ? [summary(detailA), summary(detailB)]
          : [],
    })),
    getProduct: vi.fn(async (id) => details[id]!),
    getRevision: vi.fn(async (productId) => {
      const detail = details[productId]!;
      return {
        manufacturer: detail.manufacturer,
        product: detail.product,
        revision: detail.currentRevision,
      };
    }),
    ...overrides,
  };
}

function renderPicker(
  api: CatalogClient,
  onApply = vi.fn(),
  requiredSection?: { widthMm: number; depthMm: number },
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <TimberStockProductPicker
        client={api}
        requiredSection={requiredSection}
        onApply={onApply}
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
  return { onApply, onClose };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('timber stock catalogue picker', () => {
  it('always searches kind: timber-stock and shows section facts', async () => {
    const api = client();
    renderPicker(api);
    expect(await screen.findByText('C24 45×145×4000')).toBeTruthy();
    expect(screen.getByText('C24 45×95×3000')).toBeTruthy();
    expect(api.searchProducts).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'timber-stock', limit: 30 }),
      expect.any(AbortSignal),
    );
  });

  it('filters results to the required section only, dropping incompatible items', async () => {
    const api = client();
    renderPicker(api, vi.fn(), { widthMm: 45, depthMm: 145 });
    expect(await screen.findByText('C24 45×145×4000')).toBeTruthy();
    expect(screen.queryByText('C24 45×95×3000')).toBeNull();
    expect(screen.getByText(/45 × 145 mm/)).toBeTruthy();
  });

  it('applies an exact revision as a TimberStockCatalogPick with a source label', async () => {
    const api = client();
    const { onApply } = renderPicker(api, vi.fn(), {
      widthMm: 45,
      depthMm: 145,
    });
    await screen.findByText('C24 45×145×4000');
    fireEvent.click(await screen.findByRole('button', { name: 'Szczegóły' }));
    const detailPane = await screen.findByTestId('timber-stock-catalog-detail');
    fireEvent.click(
      await within(detailPane).findByRole('button', {
        name: 'Użyj tej długości',
      }),
    );
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(api.getRevision).toHaveBeenCalledWith(
      'p:timber-a',
      'r:timber-a:1',
      expect.any(AbortSignal),
    );
    expect(onApply).toHaveBeenCalledWith({
      lengthMm: 4000,
      widthMm: 45,
      depthMm: 145,
      sourceLabel: 'Generic sawn timber (C24) · C24 45×145×4000 · 2026-09',
      commercialVariantId: 'variant:timber:c24-45x145x4000:standard',
    });
  });

  it('leaves commercialVariantId undefined when the product has no single variant to price', async () => {
    const api = client();
    const { onApply } = renderPicker(api, vi.fn(), {
      widthMm: 45,
      depthMm: 95,
    });
    await screen.findByText('C24 45×95×3000');
    fireEvent.click(await screen.findByRole('button', { name: 'Szczegóły' }));
    const detailPane = await screen.findByTestId('timber-stock-catalog-detail');
    fireEvent.click(
      await within(detailPane).findByRole('button', {
        name: 'Użyj tej długości',
      }),
    );
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ commercialVariantId: undefined }),
    );
  });

  it('rejects an exact revision whose section no longer matches the required blank, never silently substituting it', async () => {
    const api = client({
      getRevision: vi.fn(async () => ({
        manufacturer: detailB.manufacturer,
        product: detailB.product,
        revision: detailB.currentRevision,
      })),
    });
    const { onApply } = renderPicker(api, vi.fn(), {
      widthMm: 45,
      depthMm: 145,
    });
    await screen.findByText('C24 45×145×4000');
    fireEvent.click(await screen.findByRole('button', { name: 'Szczegóły' }));
    const detailPane = await screen.findByTestId('timber-stock-catalog-detail');
    fireEvent.click(
      await within(detailPane).findByRole('button', {
        name: 'Użyj tej długości',
      }),
    );
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(onApply).not.toHaveBeenCalled();
  });

  it('offers a manual fallback without exposing a raw network error', async () => {
    const api = client({
      searchProducts: vi.fn(async () => {
        throw new Error('ECONNREFUSED secret');
      }),
    });
    const { onClose } = renderPicker(api);
    expect(
      await screen.findByText('Katalog jest obecnie niedostępny.'),
    ).toBeTruthy();
    expect(screen.queryByText(/ECONNREFUSED/)).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Zamknij i wprowadź ręcznie' }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a section-specific empty state when nothing matches the required section', async () => {
    renderPicker(
      client({
        searchProducts: vi.fn(async () => ({ items: [summary(detailB)] })),
      }),
      vi.fn(),
      { widthMm: 45, depthMm: 145 },
    );
    expect(
      await screen.findByText(/Brak elementów w katalogu o przekroju zgodnym/),
    ).toBeTruthy();
  });
});
