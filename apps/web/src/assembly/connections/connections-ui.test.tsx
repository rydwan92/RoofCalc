// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { withPlannedConnection } from '@cieslacalc/connection-core';
import { App } from '../../App';
import i18n from '../../i18n';
import { useAssembly } from '../store';

beforeEach(async () => {
  localStorage.clear();
  useAssembly.getState().reset();
  useAssembly.getState().setUnit('mm');
  useAssembly.getState().setMode('quick');
  localStorage.setItem('cieslacalc.creatorStartSeen.v1', '1');
  await i18n.changeLanguage('pl');
});
afterEach(cleanup);

async function openConnections() {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Kreator' }));
  act(() => useAssembly.getState().setViewPreset('connections'));
  return screen.findByTestId('connection-plan', {}, { timeout: 5000 });
}

const markers = () =>
  screen.findByTestId('connection-markers', {}, { timeout: 5000 });

describe('connection plan ↔ drawing', () => {
  it('shows a node kind on the drawing, opens one occurrence, steps and closes — no history', async () => {
    const plan = await openConnections();
    const history = useAssembly.getState().historyPast.length;
    const rafters = useAssembly.getState().template.type; // gable by default
    expect(rafters).toBe('gable');
    fireEvent.click(
      within(plan).getByTestId('connection-show-rafter-wall-plate'),
    );
    expect(useAssembly.getState().workbench.connectionFocus).toBe(
      'rafter-wall-plate',
    );
    const drawn = await markers();
    const count = Number(drawn.getAttribute('data-count'));
    expect(count).toBeGreaterThan(0);
    expect(drawn.querySelectorAll('.a-connection-marker')).toHaveLength(count);
    // The joined members are emphasised, the rest muted.
    expect(
      document.querySelectorAll('.a-skeleton-member.is-related').length,
    ).toBeGreaterThan(0);
    expect(
      document.querySelectorAll('.a-skeleton-member.is-muted').length,
    ).toBeGreaterThan(0);

    // A marker is the occurrence: the ordinary selection, resolved to a node.
    fireEvent.click(drawn.querySelectorAll('.a-connection-marker')[1]!);
    const detail = await screen.findByTestId('connection-node-detail');
    expect(
      within(detail).getByTestId('connection-occurrence').textContent,
    ).toBe(`Wystąpienie 2 z ${count}`);
    expect(detail.textContent).toMatch(/K1-\d{2} \(połać/);
    expect(detail.textContent).toContain('Murłata');
    fireEvent.click(within(detail).getByRole('button', { name: 'Następne' }));
    expect(
      within(screen.getByTestId('connection-node-detail')).getByTestId(
        'connection-occurrence',
      ).textContent,
    ).toBe(`Wystąpienie 3 z ${count}`);
    // Nothing above is a project edit.
    expect(useAssembly.getState().historyPast).toHaveLength(history);

    fireEvent.click(screen.getByTestId('connection-drawing-close'));
    expect(useAssembly.getState().workbench.connectionFocus).toBeUndefined();
    expect(screen.queryByTestId('connection-markers')).toBeNull();
  });

  it('follows the geometry: pitch keeps the occurrence, a roof-type change drops it, undo restores the gable nodes', async () => {
    const plan = await openConnections();
    fireEvent.click(
      within(plan).getByTestId('connection-show-rafter-wall-plate'),
    );
    const gableCount = (await markers()).getAttribute('data-count');
    fireEvent.click((await markers()).querySelector('.a-connection-marker')!);
    const chosen = useAssembly.getState().workbench.selectedId;
    expect(screen.getByTestId('connection-node-detail')).toBeTruthy();

    act(() => useAssembly.getState().setCanonicalField('roof.pitchDeg', 45));
    // Same joint, new place: still the chosen occurrence.
    expect(
      screen.getByTestId('connection-node-detail').getAttribute('data-node-id'),
    ).toBe(chosen);

    act(() => useAssembly.getState().setRoofType('hip'));
    // That rafter no longer exists: nothing stale stays selected.
    expect(screen.queryByTestId('connection-node-detail')).toBeNull();
    expect(screen.getByTestId('connection-first-occurrence')).toBeTruthy();

    // A roof-type change resets the selection by design (store rule); undo
    // restores the geometry, and the shown kind recounts to the gable nodes.
    act(() => useAssembly.getState().undo());
    expect(useAssembly.getState().workbench.connectionFocus).toBe(
      'rafter-wall-plate',
    );
    expect(
      screen.getByTestId('connection-markers').getAttribute('data-count'),
    ).toBe(gableCount);
  });

  it('keeps a planned decision where the node still exists after a roof change', async () => {
    act(() =>
      useAssembly.getState().setConnectionPlan(
        withPlannedConnection(undefined, 'rafter-wall-plate', {
          connector: 'rafter-tie',
        }),
      ),
    );
    const plan = await openConnections();
    expect(
      within(plan)
        .getByTestId('connection-node-rafter-wall-plate')
        .getAttribute('data-status'),
    ).toBe('planned');
    act(() => useAssembly.getState().setRoofType('hip'));
    expect(
      within(screen.getByTestId('connection-plan'))
        .getByTestId('connection-node-rafter-wall-plate')
        .getAttribute('data-status'),
    ).toBe('planned');
    // Hip nodes appear with their own, still open decisions.
    expect(
      within(screen.getByTestId('connection-plan'))
        .getByTestId('connection-node-jack-rafter-hip-rafter')
        .getAttribute('data-status'),
    ).toBe('not-planned');
  });

  it('wall plates are counted as members with their length, never as anchors', async () => {
    const plan = await openConnections();
    const card = within(plan).getByTestId(
      'connection-node-wall-plate-anchorage',
    );
    expect(card.textContent).toContain('2 elementy');
    expect(card.textContent).toMatch(/\d+,\d m/);
    expect(card.textContent).toContain('Liczba kotew zależy od ich rozstawu');
    // Nothing to point at on the drawing for a member-count row.
    expect(
      within(card).queryByTestId('connection-show-wall-plate-anchorage'),
    ).toBeNull();
  });
});

describe('keyboard in the connection plan', () => {
  it('Escape closes the occurrence, then takes the node off the drawing', async () => {
    const plan = await openConnections();
    fireEvent.click(
      within(plan).getByTestId('connection-show-rafter-wall-plate'),
    );
    fireEvent.click((await markers()).querySelector('.a-connection-marker')!);
    expect(screen.getByTestId('connection-node-detail')).toBeTruthy();
    const app = document.querySelector('.assembly-app')!;
    fireEvent.keyDown(app, { key: 'Escape' });
    expect(screen.queryByTestId('connection-node-detail')).toBeNull();
    expect(useAssembly.getState().workbench.connectionFocus).toBe(
      'rafter-wall-plate',
    );
    fireEvent.keyDown(app, { key: 'Escape' });
    expect(useAssembly.getState().workbench.connectionFocus).toBeUndefined();
    expect(useAssembly.getState().workbench.viewPreset).toBe('connections');
  });

  it('suggests connection types from two answers, applies them as one undoable change and keeps a decided node', async () => {
    const plan = await openConnections();
    // The user already decided the ridge: the suggestion must not touch it.
    act(() =>
      useAssembly.getState().setConnectionPlan(
        withPlannedConnection(undefined, 'rafter-ridge', {
          fastening: { type: 'bolts', diameterMm: 12, perNode: 2 },
        }),
      ),
    );
    const history = useAssembly.getState().historyPast.length;
    fireEvent.click(within(plan).getByTestId('connection-practice-open'));
    const practice = screen.getByTestId('connection-practice');
    expect(practice.textContent).toContain('Wybierz sposób łączenia');
    fireEvent.click(
      within(practice).getByTestId('connection-practice-style-connectors'),
    );
    fireEvent.click(
      within(practice).getByTestId(
        'connection-practice-anchorage-anchor-rod',
      ),
    );
    const seat = within(practice).getByTestId(
      'connection-practice-rafter-wall-plate',
    );
    expect(seat.textContent).toContain('Łącznik krokwiowy');
    const ridge = within(practice).getByTestId(
      'connection-practice-rafter-ridge',
    );
    expect(ridge.textContent).toContain('Masz już');
    expect(
      (within(ridge).getByRole('checkbox') as HTMLInputElement).checked,
    ).toBe(false);
    // Nothing is stored until the user applies.
    expect(useAssembly.getState().historyPast).toHaveLength(history);
    fireEvent.click(within(practice).getByTestId('connection-practice-apply'));
    expect(useAssembly.getState().historyPast).toHaveLength(history + 1);
    const stored =
      useAssembly.getState().projectDocument.project.connectionPlan!;
    expect(stored.nodes['rafter-wall-plate']).toEqual({
      fastening: { type: 'nails' },
      connector: 'rafter-tie',
    });
    expect(stored.nodes['wall-plate-anchorage']).toEqual({
      connector: 'anchor-rod',
    });
    // No diameter or count is ever suggested; the decided ridge stays.
    expect(stored.nodes['rafter-ridge']).toEqual({
      fastening: { type: 'bolts', diameterMm: 12, perNode: 2 },
    });
    expect(screen.getByTestId('connection-practice-applied')).toBeTruthy();
    act(() => useAssembly.getState().undo());
    expect(
      useAssembly.getState().projectDocument.project.connectionPlan?.nodes[
        'rafter-wall-plate'
      ],
    ).toBeUndefined();
  });
});
