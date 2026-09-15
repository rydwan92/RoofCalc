// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assemblyDefaults,
  gableTemplateFromAssembly,
  resolveRoofTemplate,
  createRoofSkeletonFromResolved,
} from '@cieslacalc/roof-math';
import { createRoofMemberSchedule } from '@cieslacalc/quantity-core';
import '../i18n';
import { createK1CuttingRequirement } from './k1-cutting-adapter';
import { K1CuttingPlan } from './K1CuttingPlan';

vi.mock('../catalog/TimberStockProductPicker', () => ({
  TimberStockProductPicker: ({
    requiredSection,
    onApply,
    onClose,
  }: {
    requiredSection?: { widthMm: number; depthMm: number };
    onApply: (pick: {
      lengthMm: number;
      widthMm: number;
      depthMm: number;
      sourceLabel: string;
      commercialVariantId?: string;
    }) => void;
    onClose: () => void;
  }) => (
    <div data-testid="fake-timber-picker">
      <span data-testid="fake-required-section">
        {requiredSection?.widthMm}x{requiredSection?.depthMm}
      </span>
      <button
        onClick={() =>
          onApply({
            lengthMm: 4000,
            widthMm: requiredSection?.widthMm ?? 45,
            depthMm: requiredSection?.depthMm ?? 145,
            sourceLabel:
              'Generic sawn timber (C24) · C24 45×145×4000 · 2026-09',
          })
        }
      >
        fake-apply
      </button>
      <button
        onClick={() =>
          onApply({
            lengthMm: 20000,
            widthMm: requiredSection?.widthMm ?? 45,
            depthMm: requiredSection?.depthMm ?? 145,
            sourceLabel:
              'Generic sawn timber (C24) · C24 45×145×20000 · 2026-09',
            commercialVariantId: 'variant:timber:c24-45x145x4000:standard',
          })
        }
      >
        fake-apply-priced
      </button>
      <button onClick={onClose}>fake-close</button>
    </div>
  ),
}));

function resolvedRequirement() {
  const gable = gableTemplateFromAssembly(assemblyDefaults);
  const resolved = resolveRoofTemplate(gable);
  const schedule = createRoofMemberSchedule({
    skeleton: createRoofSkeletonFromResolved(resolved),
  });
  const result = createK1CuttingRequirement(resolved, schedule);
  if (result.status !== 'resolved')
    throw new Error(`fixture requirement did not resolve: ${result.reason}`);
  return result;
}

function renderK1(
  props: Partial<{
    requirement: ReturnType<typeof resolvedRequirement>;
    unit: 'mm' | 'cm' | 'm';
    mobile: boolean;
    onClose: () => void;
  }> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <K1CuttingPlan
        requirement={props.requirement ?? resolvedRequirement()}
        unit={props.unit ?? 'mm'}
        mobile={props.mobile ?? false}
        onClose={props.onClose ?? vi.fn()}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('K1CuttingPlan catalogue-sourced commercial lengths', () => {
  it('opens the timber-stock picker filtered to the K1 blank section', async () => {
    const requirement = resolvedRequirement();
    renderK1({ requirement });
    fireEvent.click(screen.getByTestId('k1-add-from-catalogue'));
    const picker = await screen.findByTestId('fake-timber-picker');
    expect(
      within(picker).getByTestId('fake-required-section').textContent,
    ).toBe(
      `${requirement.blank.section.widthMm}x${requirement.blank.section.depthMm}`,
    );
  });

  it('replaces the initial empty stock with a source-labelled catalogue pick', async () => {
    renderK1();
    expect(screen.getAllByTestId('k1-stock-length')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('k1-add-from-catalogue'));
    fireEvent.click(await screen.findByText('fake-apply'));
    const lengthInputs = screen.getAllByTestId('k1-stock-length');
    expect(lengthInputs).toHaveLength(1);
    expect((lengthInputs[0] as HTMLInputElement).value).toBe('4000');
    expect(screen.getByTestId('k1-stock-source').textContent).toBe(
      'Generic sawn timber (C24) · C24 45×145×4000 · 2026-09',
    );
    expect(screen.queryByTestId('fake-timber-picker')).toBeNull();
  });

  it('clears the source label once the picked length is hand-edited', async () => {
    renderK1();
    fireEvent.click(screen.getByTestId('k1-add-from-catalogue'));
    fireEvent.click(await screen.findByText('fake-apply'));
    expect(screen.getByTestId('k1-stock-source')).toBeTruthy();
    const lengthInputs = screen.getAllByTestId('k1-stock-length');
    fireEvent.change(lengthInputs[0]!, { target: { value: '3900' } });
    expect(screen.queryByTestId('k1-stock-source')).toBeNull();
  });
});

describe('K1CuttingPlan MVP material cost', () => {
  it('resolves a catalogue price for an assigned stock item and shows a verify-before-purchase total', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes('/api/pricing/variants'))
        throw new Error(`unexpected fetch: ${url}`);
      return new Response(
        JSON.stringify({
          items: [
            {
              variantId: 'variant:timber:c24-45x145x4000:standard',
              entry: {
                id: 'price:bat:2026-09:c24-45x145x4000',
                priceListId: 'price-list:bat-retail-2026-09',
                commercialVariantId: 'variant:timber:c24-45x145x4000:standard',
                saleUnit: 'piece',
                netAmountMinor: 5683,
                sourceAmountBasis: 'gross',
                sourceVatRateBps: 2300,
                validFrom: '2026-09-15',
              },
              currencyCode: 'PLN',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    renderK1();
    fireEvent.click(screen.getByRole('button', { name: 'Usuń długość 1' }));
    fireEvent.click(screen.getByTestId('k1-add-from-catalogue'));
    fireEvent.click(await screen.findByText('fake-apply-priced'));
    fireEvent.click(screen.getByTestId('k1-run-plan'));

    const cost = await screen.findByTestId('k1-material-cost');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        '/api/pricing/variants?ids=variant%3Atimber%3Ac24-45x145x4000%3Astandard',
      ),
      expect.anything(),
    );
    expect(within(cost).getAllByText(/56[,.]83/).length).toBeGreaterThan(0);
    expect(within(cost).getByText(/454[,.]64/)).toBeTruthy();
    expect(within(cost).queryByText(/bez ceny/)).toBeNull();
  });

  it('renders no material-cost panel when nothing assigned has a catalogue price', async () => {
    renderK1();
    fireEvent.change(screen.getByTestId('k1-stock-length'), {
      target: { value: '7000' },
    });
    fireEvent.click(screen.getByTestId('k1-run-plan'));
    await screen.findByTestId('k1-cutting-result');
    expect(screen.queryByTestId('k1-material-cost')).toBeNull();
  });
});
