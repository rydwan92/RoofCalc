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
        stale
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
        stale={false}
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
        stale={false}
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

  // VNext-10F (ADR-017 §9): a quote of a house and a garage.
  const tile = draft.lines[0]!;
  const sectioned = createQuoteDraft({
    ...draft,
    sourceFingerprint: 'q1-sections',
    sections: [
      { id: 'structure:roof', label: 'Dom', sourceFingerprint: 'q1-house' },
      { id: 'structure:2', label: 'Garaż', sourceFingerprint: 'q1-garage' },
    ],
    lines: [
      { ...tile, sectionId: 'structure:roof' },
      // The same material row in the garage: the same id, another section.
      {
        ...tile,
        sectionId: 'structure:2',
        technicalQuantity: { value: 40, unit: 'piece' },
        offerQuantity: { value: 40, unit: 'piece' },
      },
    ],
  });

  it('shows a section per structure with its own subtotal', () => {
    render(
      <QuoteWorkspace
        draft={sectioned}
        stale={false}
        structures={{
          open: { id: 'structure:2', label: 'Garaż' },
          missing: [],
          onOpen: vi.fn(),
        }}
        locale="pl"
        onChange={vi.fn()}
        onRefresh={vi.fn()}
        onOpenMaterials={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const sections = screen
      .getByTestId('quote-workspace')
      .querySelectorAll('.bz-quote-section');
    expect(
      [...sections].map((row) => row.getAttribute('data-section-id')),
    ).toEqual(['structure:roof', 'structure:2']);
    // 120 × 100,00 zł and 40 × 100,00 zł.
    expect(sections[0]!.textContent).toContain('Dom');
    expect(sections[0]!.textContent).toMatch(/12\s000,00/);
    expect(sections[1]!.textContent).toContain('Garaż');
    expect(sections[1]!.textContent).toContain('4000,00');
    expect(screen.getAllByTestId('quote-line')).toHaveLength(2);
  });

  it('edits the garage line without touching the same line of the house', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <QuoteWorkspace
        draft={sectioned}
        stale={false}
        locale="pl"
        onChange={onChange}
        onRefresh={vi.fn()}
        onOpenMaterials={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const price = screen.getAllByLabelText(/Cena netto Dachówka KODA/)[1]!;
    await user.clear(price);
    await user.type(price, '90');
    await user.tab();
    const changed = onChange.mock.calls.at(-1)?.[0];
    expect(changed.lines[0]).toEqual(sectioned.lines[0]);
    expect(changed.lines[1]).toMatchObject({
      sectionId: 'structure:2',
      unitNetAmountMinor: 9000,
    });
  });

  it('names a structure without items and opens it on request', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(
      <QuoteWorkspace
        draft={draft}
        stale
        structures={{
          open: { id: 'structure:roof', label: 'Dom' },
          missing: [{ id: 'structure:2', label: 'Garaż' }],
          onOpen,
        }}
        locale="pl"
        onChange={vi.fn()}
        onRefresh={vi.fn()}
        onOpenMaterials={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const missing = screen.getByTestId('quote-missing-structures');
    expect(missing.textContent).toContain('Bez pozycji w ofercie: Garaż');
    expect(screen.getByTestId('quote-stale').textContent).toContain(
      'Odśwież pozycje bryły „Dom”',
    );
    await user.click(within(missing).getByTestId('quote-open-structure'));
    expect(onOpen).toHaveBeenCalledWith('structure:2');
  });
});
