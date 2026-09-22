// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createQuoteDraft } from '@cieslacalc/quote-core';
import { QuoteWorkspace } from './QuoteWorkspace';

afterEach(cleanup);

const draft = createQuoteDraft({
  id: 'OF-TEST',
  organizationSnapshot: { id: 'org:1', name: 'Hurtownia ABC' },
  customerSnapshot: { name: 'Jan Kowalski' },
  projectReference: { id: 'project:1', name: 'Dom Kowalski' },
  createdAt: '2026-09-22T08:00:00.000Z',
  currencyCode: 'PLN',
  sourceFingerprint: 'q1-old',
  lines: [
    {
      id: 'line:tile',
      group: 'covering',
      description: 'Dachówka KODA',
      organizationSku: 'DACH-00384',
      technicalQuantity: { value: 120, unit: 'piece' },
      offerQuantity: { value: 120, unit: 'piece' },
      quantityOverridden: false,
      unitNetAmountMinor: 10_000,
      organizationUnitNetAmountMinor: 10_000,
      priceSource: 'organization-price-list',
      vatRateBps: 2300,
      included: true,
    },
  ],
});

describe('QuoteWorkspace', () => {
  it('shows snapshot staleness without changing old values', () => {
    render(
      <QuoteWorkspace
        draft={draft}
        currentFingerprint="q1-new"
        locale="pl"
        onChange={vi.fn()}
        onRefresh={vi.fn()}
        onOpenMaterials={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('quote-stale').textContent ?? '').toMatch(
      /Projekt zmienił się/,
    );
    expect(screen.getByTestId('quote-workspace').textContent ?? '').toContain(
      '12 000,00',
    );
  });

  it('creates an explicit commercial quantity override', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <QuoteWorkspace
        draft={draft}
        currentFingerprint="q1-old"
        locale="pl"
        onChange={onChange}
        onRefresh={vi.fn()}
        onOpenMaterials={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const line = screen.getByTestId('quote-line');
    const offered = within(line).getByLabelText('Ofertowa');
    await user.clear(offered);
    await user.type(offered, '125');
    await user.tab();
    const changed = onChange.mock.calls.at(-1)?.[0];
    expect(changed.lines[0]).toMatchObject({
      technicalQuantity: { value: 120 },
      offerQuantity: { value: 125 },
      quantityOverridden: true,
    });
  });

  it('keeps the company price visible after a quote-only override', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <QuoteWorkspace
        draft={draft}
        currentFingerprint="q1-old"
        locale="pl"
        onChange={onChange}
        onRefresh={vi.fn()}
        onOpenMaterials={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const price = screen.getByLabelText(/Cena netto Dachówka KODA/);
    await user.clear(price);
    await user.type(price, '94,50');
    await user.tab();
    const changed = onChange.mock.calls.at(-1)?.[0];
    expect(changed.lines[0]).toMatchObject({
      unitNetAmountMinor: 9450,
      organizationUnitNetAmountMinor: 10_000,
      priceSource: 'manual-estimation',
    });
  });
});
