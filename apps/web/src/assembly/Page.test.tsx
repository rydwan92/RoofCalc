// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { App } from '../App';
import i18n from '../i18n';
import { calculateAssembly, purlinRange } from '@cieslacalc/roof-math';
import { createAssemblyDrawing } from '@cieslacalc/calculator-core';
import { fitDimensionedDrawing } from '@cieslacalc/drawing-engine';
import { formatLength } from '../format';
import { useAssembly } from './store';

beforeEach(async () => {
  useAssembly.getState().reset();
  useAssembly.setState({ unit: 'mm', mode: 'quick', collapsed: false });
  await i18n.changeLanguage('pl');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const input = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const enter = (name: string, value: string) =>
  fireEvent.change(input(name), { target: { value } });
const builder = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Kreator' }));
const rafterView = () =>
  fireEvent.click(screen.getByRole('tab', { name: 'Krokiew' }));
const add = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj płatew' }));
const purlin = () =>
  useAssembly.getState().spec.supports.find((s) => s.kind === 'purlin')!;
const canvasButton = (name: string) =>
  within(screen.getByTestId('assembly-drawing')).getByRole('button', { name });

describe('dual-mode parametric workbench', () => {
  it('starts with three basic inputs and transfers exact geometry and results to Builder', () => {
    render(<App />);
    expect(document.querySelectorAll('.a-basic-fields input')).toHaveLength(3);
    expect(document.querySelector('.a-more')?.hasAttribute('open')).toBe(false);
    enter('Rzut do osi kalenicy', '4250,123456');
    enter('Kąt połaci', '30');
    const spec = useAssembly.getState().spec,
      stock = screen.getByTestId('stock-length').textContent;
    expect(stock).toMatch(/\smm$/);
    fireEvent.click(screen.getByRole('button', { name: /Otwórz w kreatorze/ }));
    expect(useAssembly.getState().spec).toBe(spec);
    expect(screen.getByTestId('stock-length').textContent).toBe(stock);
    expect(screen.getByTestId('skeleton-drawing')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Detal' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Element' })).toBeNull();
  });
  it('adds a real purlin, updates profile/stations numerically and preserves it in Quick mode', () => {
    const { container } = render(<App />);
    builder();
    add();
    expect(
      container.querySelector('[data-entity="skeleton:support:purlin-1:left"]'),
    ).toBeTruthy();
    rafterView();
    const before = container
      .querySelector('[data-profile="member:rafter-1"]')!
      .getAttribute('points');
    enter('Pozycja od lica murłaty', '2400,125');
    expect(purlin().placement.xMm).toBe(2400.125);
    expect(
      container
        .querySelector('[data-profile="member:rafter-1"]')!
        .getAttribute('points'),
    ).not.toBe(before);
    expect(
      container.querySelector('[data-datum="datum:purlin-1-heel"]'),
    ).toBeTruthy();
    const spec = useAssembly.getState().spec;
    fireEvent.click(screen.getByRole('button', { name: 'Szybkie' }));
    expect(useAssembly.getState().spec).toBe(spec);
    expect(screen.getByText(/Model zawiera płatew/)).toBeTruthy();
    builder();
    fireEvent.click(screen.getByRole('button', { name: 'Usuń płatew' }));
    expect(
      container.querySelector('[data-profile="support:purlin-1"]'),
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'Dodaj płatew' })).toBeTruthy();
  });
  it('keeps geometry unchanged when changing display units', () => {
    const { container } = render(<App />);
    builder();
    add();
    rafterView();
    enter('Pozycja od lica murłaty', '2100,123456');
    const spec = useAssembly.getState().spec,
      shape = container
        .querySelector('[data-profile="support:purlin-1"]')!
        .getAttribute('points');
    fireEvent.click(screen.getByRole('button', { name: 'm' }));
    expect(input('Pozycja od lica murłaty').value).toBe('2.100123456');
    expect(useAssembly.getState().spec).toBe(spec);
    expect(
      container
        .querySelector('[data-profile="support:purlin-1"]')!
        .getAttribute('points'),
    ).toBe(shape);
  });
  it('selects notch by keyboard, opens contextual detail automatically and enlarges it', () => {
    render(<App />);
    builder();
    add();
    rafterView();
    fireEvent.keyDown(canvasButton('Zacios · Płatew'), { key: 'Enter' });
    expect(screen.getByTestId('detail-drawing')).toBeTruthy();
    expect(input('Pozycja od lica murłaty')).toBeTruthy();
    enter('Długość siedziska', '100');
    expect(screen.getByTestId('selected-notch-depth').textContent).toBe(
      '57,4 mm',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Powiększ detal' }));
    expect(screen.getAllByTestId('detail-drawing')).toHaveLength(2);
    fireEvent.keyDown(screen.getAllByTestId('detail-drawing')[0]!, {
      key: 'Escape',
    });
    expect(screen.getByTestId('assembly-drawing')).toBeTruthy();
  });
  it('retains the last valid drawing during an invalid draft and recovers through exact input', () => {
    const { container } = render(<App />);
    builder();
    add();
    rafterView();
    const before = container
      .querySelector('[data-profile="member:rafter-1"]')!
      .getAttribute('points');
    enter('Pozycja od lica murłaty', '10');
    expect(input('Pozycja od lica murłaty').getAttribute('aria-invalid')).toBe(
      'true',
    );
    expect(screen.getByTestId('assembly-drawing')).toBeTruthy();
    expect(screen.getByTestId('stock-length').textContent).not.toContain('—');
    expect(
      container
        .querySelector('[data-profile="member:rafter-1"]')!
        .getAttribute('points'),
    ).toBe(before);
    expect(container.innerHTML).not.toMatch(/NaN|Infinity|undefined/);
    enter('Pozycja od lica murłaty', '2200');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('assembly-drawing')).toBeTruthy();
  });
  it('keeps malformed roof/section inputs editable without a crash or non-finite output', () => {
    const { container } = render(<App />);
    enter('Rzut do osi kalenicy', '');
    expect(input('Rzut do osi kalenicy').getAttribute('aria-invalid')).toBe('true');
    expect(container.innerHTML).not.toMatch(/NaN|Infinity|undefined/);
    enter('Rzut do osi kalenicy', '4000');
    builder();
    add();
    rafterView();
    enter('Szerokość', '');
    expect(container.innerHTML).not.toMatch(/NaN|Infinity|undefined/);
    fireEvent.click(screen.getByRole('button', { name: 'Usuń płatew' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('moves the support with arrow keys and clamps to valid endpoints', () => {
    render(<App />);
    builder();
    add();
    rafterView();
    enter('Pozycja od lica murłaty', '2000');
    fireEvent.keyDown(canvasButton('Płatew'), {
      key: 'ArrowRight',
      shiftKey: true,
    });
    expect(purlin().placement.xMm).toBe(2010);
    const range = purlinRange(useAssembly.getState().spec, 140);
    enter('Pozycja od lica murłaty', String(range.max));
    fireEvent.keyDown(canvasButton('Płatew'), { key: 'ArrowRight' });
    expect(purlin().placement.xMm).toBe(range.max);
  });
  it('toggles toolbox/inspector/dimensions and translates the complete new workflow', async () => {
    const { container } = render(<App />);
    builder();
    rafterView();
    fireEvent.click(screen.getByRole('button', { name: 'Zwiń narzędzia' }));
    expect(container.querySelector('.tools-collapsed')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: /Właściwości elementu Połać/ }),
    );
    expect(screen.queryByLabelText('Kąt połaci')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Wymiary' }));
    expect(container.querySelector('.dimension-layer')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Zmień język na angielski' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Common rafter' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add purlin' })).toBeTruthy();
    expect(container.textContent).not.toContain('assembly.');
    expect(document.documentElement.lang).toBe('en');
  });
  it.each(['mouse', 'touch'])(
    'drags with %s through the screen transform, updates live and supports cancellation',
    (pointerType) => {
      class TestPointerEvent extends MouseEvent {
        pointerId: number;
        pointerType: string;
        constructor(type: string, init: PointerEventInit = {}) {
          super(type, init);
          this.pointerId = init.pointerId ?? 1;
          this.pointerType = init.pointerType ?? 'mouse';
        }
      }
      vi.stubGlobal('PointerEvent', TestPointerEvent);
      render(<App />);
      builder();
      add();
      rafterView();
      enter('Pozycja od lica murłaty', '2000');
      const drawing = screen.getByTestId(
        'assembly-drawing',
      ) as unknown as SVGSVGElement;
      Object.defineProperties(drawing, {
        getScreenCTM: {
          value: () => ({ a: 0.75, b: 0, c: 0, d: 0.75, e: 100, f: 80 }),
        },
        setPointerCapture: { value: vi.fn() },
        hasPointerCapture: { value: () => false },
      });
      const spec = useAssembly.getState().spec,
        result = calculateAssembly(spec),
        model = createAssemblyDrawing(result.assembly);
      const projection = fitDimensionedDrawing(
        model.bounds,
        { width: 820, height: 570, padding: 115 },
        model.dimensions,
        (d) =>
          `${d.fromLabel ? `${d.fromLabel}→${d.toLabel} · ` : ''}${formatLength(d.valueMm, 'mm', 'pl')} mm`
            .length * 6.5,
      );
      const start = projection.project({
        x: 2030,
        y: result.assembly.supports[1]!.topReference[0].y - 40,
      });
      const down = {
        clientX: start.x * 0.75 + 100,
        clientY: start.y * 0.75 + 80,
        pointerId: 9,
        pointerType,
        button: 0,
      };
      fireEvent.pointerDown(canvasButton('Płatew'), down);
      fireEvent.pointerMove(drawing, {
        ...down,
        clientX: down.clientX + 300 * projection.scale * 0.75,
      });
      expect(purlin().placement.xMm).toBe(2300);
      expect(screen.getByRole('status').textContent).toContain('2300');
      expect(input('Pozycja od lica murłaty').value).toBe('2300');
      fireEvent.pointerCancel(drawing, down);
      expect(purlin().placement.xMm).toBe(2000);
      fireEvent.pointerDown(canvasButton('Płatew'), down);
      fireEvent.pointerMove(drawing, {
        ...down,
        clientX: down.clientX + 500 * projection.scale * 0.75,
      });
      fireEvent.pointerUp(drawing, down);
      expect(purlin().placement.xMm).toBe(2500);
      expect(screen.queryByRole('status')).toBeNull();
    },
  );
  it('updates the skeleton instances, ridge height and stock from one template', () => {
    const { container } = render(<App />);
    builder();
    const rafterCount = () =>
      container.querySelectorAll('[data-entity^="instance:rafter-pair"]').length;
    const ridge = () =>
      container
        .querySelector('[data-entity="skeleton:ridge"] .a-skeleton-line')!
        .getAttribute('y1');
    const beforeCount = rafterCount();
    const beforeRidge = ridge();
    const beforeStock = screen.getByTestId('stock-length').textContent;
    expect(
      screen.queryByRole('region', { name: 'Trasowanie krok po kroku' }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Pokaż trasowanie' }));
    expect(
      screen.getByRole('region', { name: 'Trasowanie krok po kroku' }),
    ).toBeTruthy();
    enter('Długość budynku', '12000');
    enter('Rozstaw krokwi', '600');
    expect(rafterCount()).toBeGreaterThan(beforeCount);
    expect(screen.getByText('21 par krokwi')).toBeTruthy();
    expect(screen.getByText('Pary krokwi')).toBeTruthy();
    enter('Kąt połaci', '42');
    expect(ridge()).not.toBe(beforeRidge);
    expect(screen.getByTestId('stock-length').textContent).not.toBe(beforeStock);
    add();
    expect(
      container.querySelector('[data-entity="skeleton:support:purlin-1:right"]'),
    ).toBeTruthy();
  });
});
