// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CatalogProductDetail,
  CatalogProductSummary,
} from '@cieslacalc/catalog-core';
import type { LinearStockSelectionSpec } from '@cieslacalc/timber-model';
import i18n from '../i18n';
import type { CatalogClient } from '../catalog/client';
import { LinearPurchasePanel } from './LinearPurchase';
import type { LinearMaterialRequirement } from './linear-material-plan';

/**
 * V49 catalogue lengths in the purchase panel. The stub serves the same four
 * products as `timber-linear-stock-2026-09.json`, so these tests lock the
 * user-visible consequences of the seeded classification.
 */

afterEach(cleanup);
beforeEach(async () => {
  await i18n.changeLanguage('pl');
});

function summary(
  id: string,
  name: string,
  manufacturer: string,
  section: [number, number, number],
  applications: (
    'batten' | 'counter-batten' | 'structural-framing' | 'general'
  )[],
): CatalogProductSummary {
  return {
    id,
    manufacturer: { id: `m:${manufacturer}`, name: manufacturer },
    name,
    kind: 'timber-stock',
    currentRevisionId: `${id}:rev`,
    variantCount: 1,
    technicalPreview: {
      sectionWidthMm: section[0],
      sectionDepthMm: section[1],
      lengthMm: section[2],
      treated: true,
      declaredApplications: applications,
    },
  };
}

const PRODUCTS = [
  summary(
    'p:complex-3',
    'Łata Complex 40×60×3000',
    'Kingfisher',
    [40, 60, 3000],
    ['batten'],
  ),
  summary(
    'p:complex-4',
    'Łata Complex 40×60×4000',
    'Kingfisher',
    [40, 60, 4000],
    ['batten'],
  ),
  summary(
    'p:bat-4',
    'Łata konstrukcyjna 40×60×4000',
    'BAT',
    [40, 60, 4000],
    ['batten', 'structural-framing'],
  ),
  summary(
    'p:bat-25x50',
    'Tarcica 25×50×4000',
    'BAT',
    [25, 50, 4000],
    ['general'],
  ),
  summary(
    'p:c24',
    'C24 45×145×4000',
    'Generic',
    [45, 145, 4000],
    ['structural-framing'],
  ),
];

function client(options: { fail?: boolean } = {}): CatalogClient {
  return {
    listManufacturers: vi.fn(),
    getRevision: vi.fn(),
    searchProducts: vi.fn(async () => {
      if (options.fail) throw new Error('offline');
      return { items: PRODUCTS };
    }),
    getProduct: vi.fn(
      async (id: string) =>
        ({
          currentRevision: { id: `${id}:rev` },
          variants: [{ id: `${id}:variant`, active: true }],
        }) as unknown as CatalogProductDetail,
    ),
  } as unknown as CatalogClient;
}

function requirement(section: {
  widthMm: number;
  depthMm: number;
}): LinearMaterialRequirement {
  return {
    kind: 'batten',
    status: 'ready',
    blockers: [],
    policy: 'joint-at-support',
    section,
    stockClassId: 'class',
    runs: [],
    installedLengthMm: 240000,
    angledRunCount: 0,
  };
}

function renderPanel(props: {
  kind?: 'batten' | 'counter-batten';
  section?: { widthMm: number; depthMm: number };
  selection: LinearStockSelectionSpec;
  catalogue: CatalogClient;
  onChange?: (selection?: LinearStockSelectionSpec) => void;
  onChangeSection?: (section: { widthMm: number; depthMm: number }) => void;
}) {
  const onChange = props.onChange ?? vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <LinearPurchasePanel
        kind={props.kind ?? 'batten'}
        requirement={{
          ...requirement(props.section ?? { widthMm: 60, depthMm: 40 }),
          kind: props.kind ?? 'batten',
        }}
        selection={props.selection}
        locale="pl-PL"
        onChange={onChange}
        catalogue={props.catalogue}
        {...(props.onChangeSection
          ? { onChangeSection: props.onChangeSection }
          : {})}
      />
    </QueryClientProvider>,
  );
  return onChange;
}

describe('catalogue lengths (V49 §24–§29)', () => {
  it('offers only products declared as battens, in the project section (60×40 = 40×60)', async () => {
    renderPanel({
      selection: { source: 'catalogue', lengths: [] },
      catalogue: client(),
    });
    const items = await screen.findAllByTestId(
      'linear-purchase-batten-catalogue-item',
    );
    expect(items.map((item) => item.getAttribute('data-product'))).toEqual([
      'p:complex-3',
      'p:bat-4',
      'p:complex-4',
    ]);
    // 45×145 C24 construction stock is never suggested as a batten.
    expect(screen.queryByText(/45×145/)).toBeNull();
  });

  it('never offers a same-section product the source did not declare for the use', async () => {
    renderPanel({
      kind: 'counter-batten',
      section: { widthMm: 50, depthMm: 25 },
      selection: { source: 'catalogue', lengths: [] },
      catalogue: client(),
    });
    // BAT 25×50 matches the section but is marketed for garden projects.
    expect(
      await screen.findByTestId(
        'linear-purchase-counter-batten-catalogue-empty',
      ),
    ).toBeTruthy();
    expect(
      screen.queryAllByTestId('linear-purchase-counter-batten-catalogue-item'),
    ).toHaveLength(0);
    expect(screen.getByText(/nie jest deklarowany/)).toBeTruthy();
  });

  it('keeps product identity when a catalogue length is chosen', async () => {
    const onChange = renderPanel({
      selection: { source: 'catalogue', lengths: [] },
      catalogue: client(),
    });
    const items = await screen.findAllByTestId(
      'linear-purchase-batten-catalogue-item',
    );
    fireEvent.click(items[1]!);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const next = (onChange as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(next).toEqual({
      source: 'catalogue',
      lengths: [
        {
          lengthMm: 4000,
          catalogRef: {
            productId: 'p:bat-4',
            technicalRevisionId: 'p:bat-4:rev',
            variantId: 'p:bat-4:variant',
            productName: 'Łata konstrukcyjna 40×60×4000',
            manufacturerName: 'BAT',
          },
        },
      ],
    });
  });

  it('offers a different catalogue section only as an explicit decision', async () => {
    const onChangeSection = vi.fn();
    renderPanel({
      section: { widthMm: 50, depthMm: 40 },
      selection: { source: 'catalogue', lengths: [] },
      catalogue: client(),
      onChangeSection,
    });
    const change = await screen.findByTestId(
      'linear-purchase-batten-catalogue-change-section',
    );
    expect(onChangeSection).not.toHaveBeenCalled();
    fireEvent.click(change);
    expect(onChangeSection).toHaveBeenCalledWith({ widthMm: 60, depthMm: 40 });
  });

  it('falls back to manual when the catalogue is unavailable', async () => {
    renderPanel({
      selection: { source: 'catalogue', lengths: [] },
      catalogue: client({ fail: true }),
    });
    expect(
      (
        await screen.findByTestId(
          'linear-purchase-batten-catalogue-unavailable',
        )
      ).textContent,
    ).toContain('możesz podać długości ręcznie');
    expect(
      (
        screen.getByTestId(
          'linear-purchase-batten-source-manual',
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it('never invents availability', async () => {
    renderPanel({
      selection: { source: 'catalogue', lengths: [] },
      catalogue: client(),
    });
    expect(
      await screen.findByText('Dostępność ilościowa nieznana.'),
    ).toBeTruthy();
  });
});

describe('manual lengths (V49 §14, §21)', () => {
  it('adds a custom length in metres and stores millimetres', () => {
    const onChange = renderPanel({
      selection: { source: 'manual', lengths: [{ lengthMm: 4000 }] },
      catalogue: client(),
    });
    fireEvent.change(screen.getByTestId('linear-purchase-batten-add-length'), {
      target: { value: '4,5' },
    });
    fireEvent.click(
      screen.getByTestId('linear-purchase-batten-add-length-button'),
    );
    expect(onChange).toHaveBeenCalledWith({
      source: 'manual',
      lengths: [{ lengthMm: 4000 }, { lengthMm: 4500 }],
    });
  });

  it('never commits an unparsable or non-positive length', () => {
    const onChange = renderPanel({
      selection: { source: 'manual', lengths: [] },
      catalogue: client(),
    });
    for (const value of ['', '-', '0', 'abc', '-3']) {
      fireEvent.change(
        screen.getByTestId('linear-purchase-batten-add-length'),
        { target: { value } },
      );
      expect(
        (
          screen.getByTestId(
            'linear-purchase-batten-add-length-button',
          ) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it('switching source never mixes manual and catalogue lengths', () => {
    const onChange = renderPanel({
      selection: { source: 'manual', lengths: [{ lengthMm: 4000 }] },
      catalogue: client(),
    });
    fireEvent.click(
      screen.getByTestId('linear-purchase-batten-source-catalogue'),
    );
    expect(onChange).toHaveBeenCalledWith({ source: 'catalogue', lengths: [] });
  });
});
