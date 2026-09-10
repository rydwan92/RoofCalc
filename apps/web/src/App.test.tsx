// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from './i18n';
// Historical v2 screen regression suite; v3 has its own integration tests.
import { WorkbenchPage as App } from './workbench/WorkbenchPage';
import { useWorkbench } from './store';

beforeEach(async () => {
  useWorkbench.getState().reset();
  useWorkbench.getState().setUnit('mm');
  useWorkbench.setState({
    selected: 'geometry',
    view: 'assembly',
    detailTarget: 'birdsmouth',
    dimensions: true,
    inspectorOpen: true,
  });
  await i18n.changeLanguage('pl');
});
afterEach(cleanup);
function mount() {
  return render(
    <MemoryRouter initialEntries={['/calculators/common-rafter']}>
      <App />
    </MemoryRouter>,
  );
}
function objectButton(name: string) {
  return screen.getByRole('button', { name });
}

describe('parametric workbench', () => {
  it('keeps physical geometry unchanged when switching display units', () => {
    const { container } = mount();
    fireEvent.change(screen.getByLabelText('Rzut do osi kalenicy'), {
      target: { value: '1000' },
    });
    fireEvent.click(screen.getByRole('button', { name: '30°' }));
    const profile = container
      .querySelector('[data-object="rafter"]')!
      .getAttribute('points');
    const canonical = structuredClone(useWorkbench.getState().input);
    fireEvent.click(screen.getByRole('button', { name: 'm' }));
    expect(
      (screen.getByLabelText('Rzut do osi kalenicy') as HTMLInputElement).value,
    ).toBe('1');
    expect(useWorkbench.getState().input).toEqual(canonical);
    expect(
      container.querySelector('[data-object="rafter"]')!.getAttribute('points'),
    ).toBe(profile);
    expect(screen.getByTestId('total-length').textContent).toBe('1,709m');
  });
  it('reacts to canvas timber selection and edits the actual section', () => {
    const { container } = mount();
    const before = container
      .querySelector('[data-object="rafter"]')!
      .getAttribute('points');
    fireEvent.click(objectButton('Krokiew'));
    fireEvent.change(screen.getByLabelText('Wysokość przekroju'), {
      target: { value: '250' },
    });
    expect(useWorkbench.getState().input.timber.depthMm).toBe(250);
    expect(
      container.querySelector('[data-object="rafter"]')!.getAttribute('points'),
    ).not.toBe(before);
  });
  it('reacts to a seat change and shows the same cut in detail', () => {
    const { container } = mount();
    fireEvent.click(objectButton('Murłata'));
    fireEvent.change(screen.getByLabelText('Długość siedziska'), {
      target: { value: '120' },
    });
    expect(screen.getByTestId('notch-depth').textContent).toBe('68,8 mm');
    expect(screen.getByTestId('seat-depth-summary').textContent).toBe(
      '120 / 68,8mm',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Detal' }));
    expect(useWorkbench.getState().view).toBe('detail');
    expect(container.querySelector('[data-object="rafter"]')).toBeTruthy();
    expect(screen.getByText(/Powiększenie złącza/)).toBeTruthy();
  });
  it('rejects an oversized seat, hides all stale geometry and recovers', () => {
    const { container } = mount();
    fireEvent.click(objectButton('Murłata'));
    fireEvent.change(screen.getByLabelText('Długość siedziska'), {
      target: { value: '150' },
    });
    expect(screen.getByRole('alert').textContent).toContain(
      'nie może być szersze',
    );
    expect(container.querySelector('.workbench-drawing')).toBeNull();
    expect(screen.getByTestId('total-length').textContent).toBe('—mm');
    expect(container.innerHTML).not.toMatch(/NaN|Infinity|undefined/);
    fireEvent.click(screen.getByRole('button', { name: 'Przywróć przykład' }));
    expect(container.querySelector('.workbench-drawing')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('can find invalid fields in another inspector and does not leak malformed decimals', () => {
    const { container } = mount();
    fireEvent.change(screen.getByLabelText('Rzut do osi kalenicy'), {
      target: { value: '1,2.3' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Krokiew 80 mm/ }));
    expect(screen.queryByLabelText('Rzut do osi kalenicy')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Rzut do osi kalenicy →' }),
    );
    expect(screen.getByLabelText('Rzut do osi kalenicy')).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity|undefined/);
  });
  it('supports keyboard selection, view switching, dimensions and translation', async () => {
    const { container } = mount();
    fireEvent.keyDown(objectButton('Murłata'), { key: 'Enter' });
    expect(screen.getByLabelText('Szerokość murłaty')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Element' }));
    expect(container.querySelector('[data-object="wall-plate"]')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Wymiary' }));
    expect(container.querySelector('.dimension-layer')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Zmień język na angielski' }),
    );
    expect(
      await screen.findByRole('heading', { name: /Common rafter/ }),
    ).toBeTruthy();
    expect(document.documentElement.lang).toBe('en');
  });
});
