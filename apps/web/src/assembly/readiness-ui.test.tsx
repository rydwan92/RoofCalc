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
import type {
  CoveringAssignmentSpec,
  RoofTileTechnicalSpec,
} from '@cieslacalc/covering-core';
import { roofPlaneIds } from '@cieslacalc/roof-math';
import { App } from '../App';
import i18n from '../i18n';
import { newBattenLayer, newCounterBattenLayer } from './build-up-defaults';
import { useAssembly } from './store';

const TILE: RoofTileTechnicalSpec = {
  schemaVersion: 1,
  kind: 'roof-tile',
  physicalWidthMm: 298,
  physicalLengthMm: 500,
  installationModes: [
    {
      id: 'standard',
      coverWidthMm: 263,
      gaugeRangeMm: { min: 338, max: 366 },
      minPitchDeg: 10,
      coursePattern: {
        layers: [{ id: 'base', horizontalOffsetFraction: 0 }],
        battenRowOffsetCycle: [0],
      },
    },
  ],
};
const tile = (planes: string[]): CoveringAssignmentSpec => ({
  id: 'covering:tile',
  roofPlaneIds: planes,
  product: {
    catalogRef: { productId: 'p', technicalRevisionId: 'r' },
    displaySnapshot: { familyName: 'Tile' },
    technicalSpecSnapshot: TILE,
  },
});

beforeEach(async () => {
  localStorage.clear();
  useAssembly.getState().reset();
  useAssembly.getState().setUnit('mm');
  useAssembly.getState().setMode('quick');
  localStorage.setItem('cieslacalc.creatorStartSeen.v1', '1');
  await i18n.changeLanguage('pl');
});
afterEach(cleanup);

const builder = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Kreator' }));
const primary = () => screen.getByTestId('project-primary-issue');

describe('V47 readiness UI', () => {
  it('a saved project with a stale plane scope loads untouched, then one safe repair fixes it and Undo restores it', () => {
    render(<App />);
    builder();
    const template = useAssembly.getState().template;
    expect(template.type).toBe('gable');
    act(() => {
      useAssembly
        .getState()
        .setCoveringAssignments([
          tile(['roof-plane:front', 'roof-plane:left']),
        ]);
      useAssembly.getState().setBattenLayout({
        ...newBattenLayer(),
        roofPlaneIds: ['roof-plane:rear'],
      });
    });
    // Loading/rendering never mutates the project silently.
    const stale = structuredClone(useAssembly.getState().projectDocument);
    expect(primary().getAttribute('data-issue')).toBe('plane-scope-stale');
    expect(primary().getAttribute('data-severity')).toBe('blocker');
    expect(useAssembly.getState().projectDocument).toEqual(stale);

    fireEvent.click(screen.getByTestId('project-progress'));
    const panel = screen.getByTestId('project-readiness-panel');
    fireEvent.click(within(panel).getByTestId('readiness-safe-repair-open'));
    const preview = within(panel).getByTestId('readiness-safe-repair-preview');
    expect(preview.textContent).toContain('przypisz pokrycie do 2 połaci');
    expect(preview.textContent).toContain('rozszerz łaty na cały dach');
    const history = useAssembly.getState().historyPast.length;
    fireEvent.click(within(panel).getByTestId('readiness-safe-repair-apply'));

    expect(useAssembly.getState().historyPast.length).toBe(history + 1);
    expect(
      useAssembly.getState().projectDocument.project.coverings[0]!.roofPlaneIds,
    ).toEqual(roofPlaneIds(template));
    expect(
      screen.queryByText('Pokrycie wskazuje nieistniejące połacie'),
    ).toBeNull();
    expect(screen.getByTestId('action-feedback').textContent).toContain(
      'Dopasowano pokrycie i warstwy do dachu.',
    );

    fireEvent.click(screen.getByTestId('action-feedback-undo'));
    expect(useAssembly.getState().projectDocument).toEqual(stale);
    expect(primary().getAttribute('data-issue')).toBe('plane-scope-stale');
  });

  it('the H1 detail issue lands directly on the counter-batten hip detail', () => {
    render(<App />);
    builder();
    act(() => {
      useAssembly.getState().setRoofType('hip');
      const planes = roofPlaneIds(useAssembly.getState().template);
      useAssembly.getState().setCoveringAssignments([tile(planes)]);
      useAssembly.getState().setBattenLayout(newBattenLayer());
      useAssembly.getState().setCounterBattenLayout(newCounterBattenLayer());
    });
    expect(primary().getAttribute('data-issue')).toBe('hip-detail-required');
    expect(primary().textContent).toContain('4 grzbiety H1');
    fireEvent.click(screen.getByTestId('project-next-action'));
    const workbench = useAssembly.getState().workbench;
    expect(workbench.viewPreset).toBe('layers');
    expect(workbench.buildUpView).toBe('counterBattens');
    expect(workbench.selectedId).toBe('layer:counter-battens');
    expect(screen.getByTestId('hip-boundary-detail')).toBeTruthy();
    // Choosing the detail clears the warning immediately.
    act(() => {
      const layout =
        useAssembly.getState().projectDocument.project.buildUp.counterBattens!;
      useAssembly.getState().setCounterBattenLayout({
        ...layout,
        hipBoundaryDetail: 'no-dedicated-run',
      });
    });
    expect(
      screen.queryByTestId('project-primary-issue')?.getAttribute('data-issue'),
    ).not.toBe('hip-detail-required');
  });

  it('Document Hub shows each document state before opening it', () => {
    render(<App />);
    builder();
    act(() => {
      useAssembly.getState().setRoofType('hip');
      const planes = roofPlaneIds(useAssembly.getState().template);
      useAssembly.getState().setCoveringAssignments([tile(planes)]);
      useAssembly.getState().setBattenLayout(newBattenLayer());
      useAssembly.getState().setCounterBattenLayout(newCounterBattenLayer());
      useAssembly.getState().setViewPreset('documents');
    });
    const execution = screen.getByTestId('document-status-execution');
    expect(execution.textContent).toContain('1 ograniczenie');
    expect(
      screen.getByTestId('document-preview-execution').textContent,
    ).toContain('Podgląd roboczy');
    expect(
      screen.getByTestId('document-preflight-execution').textContent,
    ).toContain('Uzupełnij detal kontrłat przy H1');
    expect(screen.getByTestId('document-status-cost').textContent).toContain(
      'Brak danych',
    );
    expect(screen.getByTestId('document-open-cost')).toBeTruthy();

    // A blocker offers the direct fix on the card.
    act(() => {
      useAssembly.getState().setRoofType('gable');
      useAssembly
        .getState()
        .setCoveringAssignments([tile(['roof-plane:front'])]);
    });
    expect(
      screen.getByTestId('document-status-execution').textContent,
    ).toContain('problem');
    const history = useAssembly.getState().historyPast.length;
    fireEvent.click(screen.getByTestId('document-fix-execution'));
    expect(useAssembly.getState().historyPast.length).toBe(history + 1);
  });

  it('explains the consequences before a roof type change with dependent data', () => {
    render(<App />);
    builder();
    act(() => {
      const planes = roofPlaneIds(useAssembly.getState().template);
      useAssembly.getState().setCoveringAssignments([tile(planes)]);
      useAssembly.getState().setBattenLayout(newBattenLayer());
      useAssembly.getState().select('roof');
      useAssembly.getState().setViewPreset('construction');
    });
    const hipButton = screen
      .getAllByRole('button', { name: 'Kopertowy' })
      .find((button) => button.closest('.a-roof-type'))!;
    fireEvent.click(hipButton);
    const consequence = screen.getByTestId('roof-type-consequence');
    expect(consequence.textContent).toContain('Dwuspadowy → Kopertowy');
    expect(consequence.textContent).toContain('Pokrycie (1)');
    expect(consequence.textContent).toContain('Łaty');
    expect(useAssembly.getState().template.type).toBe('gable');
    fireEvent.click(
      within(consequence).getByRole('button', { name: 'Anuluj' }),
    );
    expect(useAssembly.getState().template.type).toBe('gable');
    fireEvent.click(hipButton);
    fireEvent.click(screen.getByTestId('roof-type-consequence-confirm'));
    expect(useAssembly.getState().template.type).toBe('hip');
    expect(
      useAssembly.getState().projectDocument.project.coverings[0]!.roofPlaneIds,
    ).toHaveLength(4);
  });
});
