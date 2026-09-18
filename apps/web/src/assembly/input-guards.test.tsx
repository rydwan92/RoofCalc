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
import { App } from '../App';
import i18n from '../i18n';
import { useAssembly } from './store';
import { newBattenLayer } from './build-up-defaults';

/**
 * V44 error prevention: impossible input is caught next to the field, the
 * canonical project never takes a negative, zero or non-finite geometry value,
 * and no NaN/Infinity reaches a visible result.
 */

const input = (name: string) =>
  screen.getAllByLabelText(name, { exact: true })[0] as HTMLInputElement;

describe('V44 input guards', () => {
  beforeEach(async () => {
    localStorage.clear();
    useAssembly.getState().reset();
    useAssembly.getState().setUnit('cm');
    useAssembly.getState().setMode('quick');
    await i18n.changeLanguage('pl');
  });
  afterEach(cleanup);

  it.each([
    ['Rzut do osi kalenicy', '-400'],
    ['Rzut do osi kalenicy', '0'],
    ['Kąt połaci', '95'],
    ['Kąt połaci', '0'],
    ['Okap w poziomie', '-50'],
    ['Rzut do osi kalenicy', 'abc'],
    ['Rzut do osi kalenicy', '1e400'],
  ])(
    'Quick %s = %s is flagged and never becomes project geometry',
    (name, raw) => {
      render(<App />);
      const before = useAssembly.getState().spec;
      const resultBefore = screen.getByTestId('stock-length').textContent;
      fireEvent.change(input(name), { target: { value: raw } });
      expect(input(name).getAttribute('aria-invalid')).toBe('true');
      expect(useAssembly.getState().spec).toEqual(before);
      const text = document.querySelector('.a-quick-output')?.textContent ?? '';
      expect(text).not.toMatch(/NaN|Infinity/);
      expect(screen.getByTestId('stock-length').textContent).toBe(resultBefore);
    },
  );

  it('a result explains itself with "Jak policzono?" built from the same facts', () => {
    render(<App />);
    const evidence = screen.getByTestId('k1-evidence');
    fireEvent.click(within(evidence).getByText('Jak policzono?'));
    const stock = screen
      .getByTestId('stock-length')
      .textContent!.replace(/\s+/g, ' ');
    const resultRow = evidence.querySelector('.is-result dd')!.textContent!;
    expect(resultRow.replace(/\s+/g, ' ')).toBe(stock.trim());
    expect(evidence.textContent).toContain('÷ cos(kąt)');
  });

  it('highlighting a Quick result is transient and points at the drawing', () => {
    render(<App />);
    const history = useAssembly.getState().historyPast.length;
    const birdsmouth = document.querySelector<HTMLButtonElement>(
      '.a-quick-fact[data-highlight="birdsmouth"]',
    )!;
    fireEvent.mouseEnter(birdsmouth);
    expect(
      document.querySelector(
        '.a-canvas.hl-birdsmouth [data-highlighted="true"]',
      ),
    ).toBeTruthy();
    fireEvent.mouseLeave(birdsmouth);
    expect(document.querySelector('.a-canvas.has-highlight')).toBeNull();
    expect(useAssembly.getState().historyPast).toHaveLength(history);
  });
});

describe('V44 presentation never changes quantities', () => {
  beforeEach(async () => {
    localStorage.clear();
    useAssembly.getState().reset();
    useAssembly.getState().setUnit('cm');
    localStorage.setItem('cieslacalc.creatorStartSeen.v1', '1');
    await i18n.changeLanguage('pl');
  });
  afterEach(cleanup);

  it('switching covering Technical ↔ Visual keeps every counted position', async () => {
    const { createManualTileAssignment } = await import('./CoveringWorkspace');
    const { roofPlaneIds } = await import('@cieslacalc/roof-math');
    useAssembly.getState().setMode('builder');
    render(<App />);
    act(() => {
      useAssembly.getState().setCoveringAssignments([
        createManualTileAssignment({
          existing: [],
          roofPlaneIds: roofPlaneIds(useAssembly.getState().template),
        }),
      ]);
      useAssembly.getState().setBattenLayout(newBattenLayer());
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Pokrycie' }));
    // Whole-roof counts only; a view may add per-plane detail rows.
    const counts = async () => {
      // The covering workspace is lazy-loaded; the default 1 s wait was too
      // tight under a loaded parallel suite and failed intermittently (seen on
      // untouched V48 HEAD too), without any behaviour being wrong.
      await screen.findAllByText(/Pozycje krycia/, undefined, {
        timeout: 5000,
      });
      return document.querySelector('.a-covering-counts')?.textContent ?? '';
    };
    const before = await counts();
    expect(before).toMatch(/Pozycje krycia [1-9]/);
    const project = JSON.stringify(useAssembly.getState().projectDocument);
    const visual = document.querySelector<HTMLButtonElement>(
      '[aria-label="' +
        i18n.t('assembly.studio.viewMode') +
        '"] button:not([aria-pressed="true"])',
    );
    expect(visual).toBeTruthy();
    fireEvent.click(visual!);
    const after = await counts();
    expect(after).toBe(before);
    expect(JSON.stringify(useAssembly.getState().projectDocument)).toBe(
      project,
    );
  });
});

describe('V47 covering input guardrails', () => {
  beforeEach(async () => {
    localStorage.clear();
    useAssembly.getState().reset();
    useAssembly.getState().setUnit('cm');
    localStorage.setItem('cieslacalc.creatorStartSeen.v1', '1');
    await i18n.changeLanguage('pl');
  });
  afterEach(cleanup);

  it('never commits a zero, negative or unparsable covering dimension and says why', async () => {
    const { createManualTileAssignment } = await import('./CoveringWorkspace');
    const { roofPlaneIds } = await import('@cieslacalc/roof-math');
    await i18n.changeLanguage('pl');
    useAssembly.getState().setMode('builder');
    render(<App />);
    act(() => {
      useAssembly.getState().setCoveringAssignments([
        createManualTileAssignment({
          existing: [],
          roofPlaneIds: roofPlaneIds(useAssembly.getState().template),
        }),
      ]);
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Pokrycie' }));
    const field = (
      await screen.findAllByLabelText(/Szerokość krycia/)
    )[0] as HTMLInputElement;
    const before = JSON.stringify(useAssembly.getState().projectDocument);
    for (const value of ['0', '-5', 'abc']) {
      fireEvent.change(field, { target: { value } });
      fireEvent.blur(field);
      expect(field.getAttribute('aria-invalid')).toBe('true');
      expect(JSON.stringify(useAssembly.getState().projectDocument)).toBe(
        before,
      );
    }
    expect(screen.getAllByRole('alert')[0]!.textContent).toContain(
      'Wpisz poprawną liczbę',
    );
  });
});
