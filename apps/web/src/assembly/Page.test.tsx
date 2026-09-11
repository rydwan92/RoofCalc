// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { calculateAssembly, purlinRange } from '@cieslacalc/roof-math';
import { createAssemblyDrawing } from '@cieslacalc/calculator-core';
import { fitDimensionedDrawing } from '@cieslacalc/drawing-engine';
import { formatLength } from '../format';
import { useAssembly } from './store';

beforeEach(async () => {
  useAssembly.getState().reset();
  useAssembly.getState().setUnit('mm');
  useAssembly.getState().setMode('quick');
  useAssembly.getState().setToolboxCollapsed(false);
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
const rafterView = () => act(() => useAssembly.getState().setView('rafter'));
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
  it('shows canonical-derived compact K1 and H1 cut previews in Quick Calc', () => {
    render(<App />);
    expect(screen.getByTestId('detail-preview-birdsmouth-detail')).toBeTruthy();
    expect(screen.getByTestId('detail-preview-ridge-cut-detail')).toBeTruthy();
    expect(screen.getByText('Szybkie podglądy cięć')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Krokiew narożna' }));
    expect(screen.getByTestId('detail-preview-hip-cut-detail')).toBeTruthy();
    expect(
      screen.getAllByText(/Górne cięcie krokwi narożnej/).length,
    ).toBeGreaterThan(0);
  });
  it('explains the 940 / 800 maximum policy and exposes target deviation', () => {
    render(<App />);
    builder();
    enter('Długość budynku', '940');
    expect(
      screen
        .getAllByTestId('requested-spacing')
        .every((node) => node.textContent === '800 mm'),
    ).toBe(true);
    expect(
      screen
        .getAllByTestId('actual-spacing')
        .every((node) => node.textContent === '470 mm'),
    ).toBe(true);
    expect(
      screen
        .getAllByTestId('bay-count')
        .every((node) => node.textContent === '2'),
    ).toBe(true);
    expect(
      screen
        .getAllByTestId('station-count')
        .every((node) => node.textContent === '3'),
    ).toBe(true);
    expect(
      screen.getAllByText(/żadne pole nie przekracza 800 mm/).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByTestId('spacing-station-axis')).toHaveLength(3);
    expect(screen.getAllByTestId('spacing-bay-dimension')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Sposób rozstawu'), {
      target: { value: 'target-even-spacing' },
    });
    expect(
      screen
        .getAllByTestId('actual-spacing')
        .every((node) => node.textContent === '940 mm'),
    ).toBe(true);
    expect(
      screen
        .getAllByTestId('station-count')
        .every((node) => node.textContent === '2'),
    ).toBe(true);
    expect(
      screen
        .getAllByTestId('spacing-deviation')
        .every((node) => node.textContent === '+17,5%'),
    ).toBe(true);
    expect(screen.getAllByTestId('spacing-station-axis')).toHaveLength(2);
    expect(screen.getAllByTestId('spacing-bay-dimension')).toHaveLength(1);
  });
  it('adds a real purlin, updates profile/stations numerically and preserves it in Quick mode', () => {
    const { container } = render(<App />);
    builder();
    add();
    expect(
      container.querySelector('[data-entity="instance:purlin-1:left"]'),
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
    fireEvent.click(screen.getByRole('tab', { name: 'Cięcia' }));
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
    fireEvent.keyDown(canvasButton('Zacios · Płatew P1'), { key: 'Enter' });
    expect(
      screen.getByTestId('detail-drawer').classList.contains('is-open'),
    ).toBe(true);
    expect(screen.getByTestId('detail-preview-birdsmouth-detail')).toBeTruthy();
    expect(
      screen.getByTestId('detail-drawer').querySelector('.shape-removed'),
    ).toBeTruthy();
    expect(
      screen.getByRole('region', { name: 'Detal wykonawczy' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Po cięciu' }));
    expect(useAssembly.getState().workbench.detailDrawer.cutState).toBe(
      'after',
    );
    expect(
      screen.getByTestId('detail-drawer').querySelector('.shape-removed'),
    ).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Przed cięciem' }));
    expect(
      screen.getByTestId('detail-drawer').querySelector('.shape-removed'),
    ).toBeTruthy();
    expect(
      document
        .querySelector('.a-member-preparation')
        ?.getAttribute('data-family'),
    ).toBe('K1');
    expect(input('Pozycja od lica murłaty')).toBeTruthy();
    enter('Długość siedziska', '100');
    expect(screen.getByTestId('selected-notch-depth').textContent).toBe(
      '57,4 mm',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Zbliż do detalu' }));
    expect(screen.getByTestId('detail-drawing')).toBeTruthy();
    fireEvent.keyDown(screen.getByTestId('detail-drawing'), {
      key: 'Escape',
    });
    expect(screen.getByTestId('assembly-drawing')).toBeTruthy();
  });
  it('coordinates ridge and H1 cut selection with the smart detail drawer', () => {
    render(<App />);
    builder();
    rafterView();
    fireEvent.click(canvasButton('Cięcie kalenicowe'));
    expect(screen.getByTestId('detail-preview-ridge-cut-detail')).toBeTruthy();
    expect(screen.getByTestId('detail-drawer').textContent).toContain(
      'Cięcie kalenicowe',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Szybkie' }));
    fireEvent.click(screen.getByRole('button', { name: 'Krokiew narożna' }));
    builder();
    fireEvent.click(screen.getByRole('button', { name: 'Połać' }));
    enter('Długość budynku', '10000');
    expect(
      screen.getAllByText('Strefa pełnych krokwi K1').length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('Strefa kulawek J1').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Krokiew narożna H1' }));
    fireEvent.click(
      screen.getAllByRole('button', {
        name: /Górne cięcie krokwi narożnej/,
      })[0]!,
    );
    expect(screen.getByTestId('detail-preview-hip-cut-detail')).toBeTruthy();
    expect(useAssembly.getState().workbench.selectedId).toBe(
      'cut:hip-ridge-H1',
    );
    expect(
      document
        .querySelector('.a-member-preparation')
        ?.getAttribute('data-family'),
    ).toBe('H1');
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
    expect(
      screen.getByRole('region', { name: 'Parametry podpory' }),
    ).toBeTruthy();
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
    expect(input('Rzut do osi kalenicy').getAttribute('aria-invalid')).toBe(
      'true',
    );
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
    fireEvent.keyDown(canvasButton('Płatew P1'), {
      key: 'ArrowRight',
      shiftKey: true,
    });
    expect(purlin().placement.xMm).toBe(2010);
    const range = purlinRange(useAssembly.getState().spec, 140);
    enter('Pozycja od lica murłaty', String(range.max));
    fireEvent.keyDown(canvasButton('Płatew P1'), { key: 'ArrowRight' });
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
    fireEvent.click(screen.getByRole('button', { name: 'Minimalne' }));
    expect(useAssembly.getState().workbench.dimensionLevel).toBe('minimal');
    expect(
      screen
        .getByRole('button', { name: 'Minimalne' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.click(
      screen.getByRole('button', { name: 'Zmień język na angielski' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Roof workbench' }),
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
      fireEvent.pointerDown(canvasButton('Płatew P1'), down);
      fireEvent.pointerMove(drawing, {
        ...down,
        clientX: down.clientX + 300 * projection.scale * 0.75,
      });
      expect(purlin().placement.xMm).toBe(2300);
      expect(screen.getByRole('status').textContent).toContain('2300');
      expect(input('Pozycja od lica murłaty').value).toBe('2300');
      fireEvent.pointerCancel(drawing, down);
      expect(purlin().placement.xMm).toBe(2000);
      fireEvent.pointerDown(canvasButton('Płatew P1'), down);
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
      container.querySelectorAll('[data-entity^="instance:rafter-pair"]')
        .length;
    const ridge = () =>
      container
        .querySelector('[data-entity="skeleton:ridge"] .a-skeleton-face')!
        .getAttribute('points');
    const beforeCount = rafterCount();
    const beforeRidge = ridge();
    const beforeStock = screen.getByTestId('stock-length').textContent;
    expect(screen.getByTestId('roof-fabrication-package')).toBeTruthy();
    enter('Długość budynku', '12000');
    enter('Rozstaw krokwi', '600');
    expect(rafterCount()).toBeGreaterThan(beforeCount);
    expect(screen.getByText('21 par krokwi')).toBeTruthy();
    expect(screen.getByText('Krokiew zwykła K1')).toBeTruthy();
    enter('Kąt połaci', '42');
    expect(ridge()).not.toBe(beforeRidge);
    expect(screen.getByTestId('stock-length').textContent).not.toBe(
      beforeStock,
    );
    add();
    expect(
      container.querySelector('[data-entity="instance:purlin-1:right"]'),
    ).toBeTruthy();
  });
  it('opens a selected physical rafter instance in the shared fabrication view', () => {
    const { container } = render(<App />);
    builder();
    fireEvent.click(screen.getByRole('button', { name: 'Krokiew #4 - lewa' }));
    expect(container.querySelectorAll('.kind-rafter.is-selected')).toHaveLength(
      1,
    );
    expect(screen.getByText('instance:rafter-pair-4:left')).toBeTruthy();
    expect(screen.getAllByText('Krokiew K1').length).toBeGreaterThan(0);
    expect(screen.getByTestId('instance-navigator').textContent).toContain(
      'K1 7/22',
    );
    expect(screen.getByTestId('orientation-minimap')).toBeTruthy();
    const operation = within(
      screen.getByTestId('member-instance-overlay'),
    ).getAllByRole('button')[0]!;
    fireEvent.keyDown(operation, { key: 'Enter' });
    expect(useAssembly.getState().workbench.activeOperationId).toBeTruthy();
    expect(useAssembly.getState().workbench.selectedInstanceId).toBe(
      'instance:rafter-pair-4:left',
    );
    expect(screen.getByTestId('assembly-drawing')).toBeTruthy();
    expect(screen.getByLabelText('Orientacja elementu').textContent).toContain(
      'Kierunek: okap → kalenica',
    );
    fireEvent.keyDown(container.querySelector('.assembly-app')!, {
      key: 'Escape',
    });
    expect(useAssembly.getState().workbench.activeOperationId).toBeUndefined();
    expect(screen.getByTestId('skeleton-drawing')).toBeTruthy();
  });
  it('adds and selects multiple independently resolved purlins in the skeleton', () => {
    const { container } = render(<App />);
    builder();
    add();
    add();
    expect(screen.getByRole('button', { name: 'Płatew P2' })).toBeTruthy();
    expect(
      container.querySelector('[data-entity="instance:purlin-2:left"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-entity="instance:purlin-2:right"]'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Płatew P2' }));
    expect(input('Pozycja od lica murłaty')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Właściwości elementu Płatew P2 −' }),
    ).toBeTruthy();
    const purlinBefore =
      useAssembly.getState().template.intermediateSupports[1]!.placement.xMm;
    fireEvent.keyDown(
      screen.getAllByRole('slider', {
        name: 'Przeciągnij, aby przesunąć płatew',
      })[1]!,
      { key: 'ArrowRight' },
    );
    expect(
      useAssembly.getState().template.intermediateSupports[1]!.placement.xMm,
    ).toBe(purlinBefore + 10);
    expect(useAssembly.getState().template.intermediateSupports).toHaveLength(
      2,
    );
    const preparation = screen.getByTestId('roof-fabrication-package');
    fireEvent.click(
      within(preparation).getByRole('button', {
        name: /K1.*Krokiew zwykła/,
      }),
    );
    expect(
      within(preparation).getByRole('tab', { name: 'Z1 Murłata' }),
    ).toBeTruthy();
    fireEvent.click(
      within(preparation).getByRole('tab', { name: /Z\d Płatew P2/ }),
    );
    expect(useAssembly.getState().workbench.activeOperationId).toBe(
      'joint:support:purlin-2',
    );
    expect(screen.getByTestId('detail-drawer').classList).toContain('is-open');
    fireEvent.click(
      within(preparation).getByRole('button', { name: 'Następna operacja' }),
    );
    expect(useAssembly.getState().workbench.activeOperationId).toBe(
      'joint:support:purlin-1',
    );
    expect(
      within(preparation).getByRole('tab', { name: /Z\d Płatew P1/ }),
    ).toBeTruthy();
  });
  it('adjusts skeleton handles through canonical history while camera controls leave geometry unchanged', () => {
    render(<App />);
    builder();
    const before = structuredClone(useAssembly.getState().template);
    const pitchHandle = screen.getByRole('slider', {
      name: 'Przeciągnij, aby zmienić kąt połaci',
    });
    fireEvent.keyDown(pitchHandle, { key: 'ArrowUp' });
    expect(useAssembly.getState().template.pitchDeg).toBe(35.5);
    expect(
      (screen.getByRole('button', { name: 'Cofnij' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Cofnij' }));
    expect(useAssembly.getState().template).toEqual(before);
    fireEvent.click(screen.getByRole('button', { name: 'Ponów' }));
    expect(useAssembly.getState().template.pitchDeg).toBe(35.5);
    fireEvent.keyDown(
      screen.getByRole('slider', {
        name: 'Przeciągnij, aby zmienić rozpiętość',
      }),
      { key: 'ArrowRight' },
    );
    fireEvent.keyDown(
      screen.getByRole('slider', {
        name: 'Przeciągnij, aby zmienić długość budynku',
      }),
      { key: 'ArrowUp', shiftKey: true },
    );
    expect(useAssembly.getState().template.halfRunMm).toBe(4010);
    expect(useAssembly.getState().template.buildingLengthMm).toBe(8100);
    const afterEdit = structuredClone(useAssembly.getState().template);
    fireEvent.click(screen.getByRole('button', { name: 'Powiększ rysunek' }));
    expect(screen.getByText('120%')).toBeTruthy();
    expect(useAssembly.getState().template).toEqual(afterEdit);
    fireEvent.click(screen.getByRole('button', { name: 'Dopasuj' }));
    expect(screen.getByText('100%')).toBeTruthy();
  });
  it('drags a skeleton purlin through one canonical transaction and restores it on cancellation', () => {
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
    const { container } = render(<App />);
    builder();
    add();
    useAssembly.setState({ historyPast: [], historyFuture: [] });
    const drawing = screen.getByTestId(
      'skeleton-drawing',
    ) as unknown as SVGSVGElement;
    Object.defineProperties(drawing, {
      getBoundingClientRect: {
        value: () => ({ left: 0, top: 0, width: 820, height: 570 }),
      },
      setPointerCapture: { value: vi.fn() },
      hasPointerCapture: { value: () => false },
    });
    const handle = container.querySelector('[data-handle="purlin"]')!;
    const circle = handle.querySelector('circle')!;
    const axis = handle.querySelector('line')!;
    const start = {
      x: Number(circle.getAttribute('cx')),
      y: Number(circle.getAttribute('cy')),
    };
    const axisX =
      Number(axis.getAttribute('x2')) - Number(axis.getAttribute('x1'));
    const axisY =
      Number(axis.getAttribute('y2')) - Number(axis.getAttribute('y1'));
    const axisLength = Math.hypot(axisX, axisY);
    const before = purlin().placement.xMm;
    const pointer = { pointerId: 31, pointerType: 'mouse', button: 0 };
    fireEvent.pointerDown(circle, {
      ...pointer,
      clientX: start.x,
      clientY: start.y,
    });
    fireEvent.pointerMove(drawing, {
      ...pointer,
      clientX: start.x + (axisX / axisLength) * 50,
      clientY: start.y + (axisY / axisLength) * 50,
    });
    expect(purlin().placement.xMm).not.toBe(before);
    fireEvent.pointerCancel(drawing, pointer);
    expect(purlin().placement.xMm).toBe(before);
    expect(useAssembly.getState().historyPast).toHaveLength(0);
    fireEvent.pointerDown(circle, {
      ...pointer,
      clientX: start.x,
      clientY: start.y,
    });
    fireEvent.pointerMove(drawing, {
      ...pointer,
      clientX: start.x + (axisX / axisLength) * 50,
      clientY: start.y + (axisY / axisLength) * 50,
    });
    fireEvent.pointerUp(drawing, pointer);
    expect(useAssembly.getState().historyPast).toHaveLength(1);
  });
  it('offers a fast H1 path with shared reactive math and coordinated drawings', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Krokiew narożna' }));
    expect(useAssembly.getState().template.type).toBe('hip');
    expect(document.querySelectorAll('.a-basic-fields input')).toHaveLength(3);
    expect(screen.getByTestId('hip-physical-length')).toBeTruthy();
    expect(screen.getByTestId('hip-fabrication-sheet')).toBeTruthy();
    expect(screen.getByText('Rzut z góry')).toBeTruthy();
    expect(screen.getByText('Widok wzdłuż krokwi')).toBeTruthy();
    expect(screen.getByText('Cięcie górne i fazowanie')).toBeTruthy();
    const before = screen.getByTestId('hip-theoretical-length').textContent;
    enter('Kąt połaci', '42');
    expect(screen.getByTestId('hip-theoretical-length').textContent).not.toBe(
      before,
    );
    fireEvent.click(screen.getByRole('button', { name: /Otwórz w kreatorze/ }));
    expect(useAssembly.getState().template.type).toBe('hip');
    expect(screen.getByTestId('skeleton-drawing')).toBeTruthy();
  });

  it('selects one physical hip and opens its shared H1 fabrication sheet', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Krokiew narożna' }));
    builder();
    const hips = container.querySelectorAll('[data-entity^="instance:hip:"]');
    expect(hips).toHaveLength(4);
    fireEvent.click(
      screen.getByRole('button', {
        name: /Krokiew narożna H1.*przedni lewy narożnik/,
      }),
    );
    expect(useAssembly.getState().workbench.selectedId).toBe(
      'instance:hip:front-left',
    );
    expect(screen.getByText('instance:hip:front-left')).toBeTruthy();
    expect(screen.getByTestId('orientation-minimap')).toBeTruthy();
    expect(screen.getByTestId('instance-navigator').textContent).toContain(
      'H1 1/4',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Następny element tej rodziny' }),
    );
    expect(useAssembly.getState().workbench.selectedInstanceId).toBe(
      'instance:hip:front-right',
    );
    expect(screen.getByTestId('instance-navigator').textContent).toContain(
      'H1 2/4',
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Przygotuj krokiew narożną H1/ }),
    );
    expect(useAssembly.getState().workbench.canvasView).toBe('hip');
    expect(screen.getByTestId('hip-fabrication-sheet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Wróć do szkieletu' }));
    expect(useAssembly.getState().workbench.canvasView).toBe('skeleton');
  });

  it('renders first-class J1 members and switches roof, prototype and instance results', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Krokiew narożna' }));
    builder();

    const jacks = container.querySelectorAll('.kind-jack-rafter');
    expect(jacks).toHaveLength(32);
    expect(screen.getByTestId('jack-count').textContent).toBe('32');
    expect(
      screen.getByRole('region', { name: 'Podsumowanie dachu' }),
    ).toBeTruthy();
    expect(screen.getByTestId('roof-fabrication-package')).toBeTruthy();

    fireEvent.click(
      container.querySelector('.a-toolbox [aria-label="Krokiew K1"]')!,
    );
    expect(
      screen.getByRole('region', { name: 'Podsumowanie prototypu' }),
    ).toBeTruthy();
    expect(screen.getAllByText('K1 · Krokiew zwykła').length).toBeGreaterThan(
      0,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Krokiew narożna H1' }));
    expect(
      screen.getByRole('region', { name: 'Podsumowanie prototypu' }),
    ).toBeTruthy();
    expect(screen.getAllByText('H1 · Krokiew narożna').length).toBeGreaterThan(
      0,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Kulawek J1' }));
    expect(useAssembly.getState().workbench.selectedId).toBe(
      'member:jack-rafter-J1',
    );
    expect(
      screen.getByRole('region', { name: 'Podsumowanie prototypu' }),
    ).toBeTruthy();
    expect(screen.getByText('długość osobna dla każdej sztuki')).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', {
        name: /Kulawek J1\/1 · lewa · przedni lewy narożnik/,
      }),
    );
    expect(useAssembly.getState().workbench.selectedId).toBe(
      'instance:jack:front-left:left:1',
    );
    expect(useAssembly.getState().workbench.selectedPrototypeId).toBe(
      'member:jack-rafter-J1',
    );
    expect(
      screen
        .getByTestId('member-instance-inspector')
        .getAttribute('data-family'),
    ).toBe('J1');
    expect(
      screen.getByRole('region', { name: 'Parametry konkretnej sztuki' }),
    ).toBeTruthy();
    expect(screen.getByTestId('instance-length').textContent).toMatch(/mm$/);
    expect(
      container
        .querySelector('[data-entity="instance:jack:front-left:left:1"]')
        ?.getAttribute('data-selection-state'),
    ).toBe('selected');
    expect(
      container
        .querySelector('[data-entity="instance:jack:front-left:left:2"]')
        ?.getAttribute('data-selection-state'),
    ).toBe('related');
    expect(
      container
        .querySelector('[data-entity="instance:hip:front-left"]')
        ?.getAttribute('data-selection-state'),
    ).toBe('related');
    const limitedOperation = screen
      .getByTestId('member-instance-overlay')
      .querySelector<SVGGElement>(
        '.a-operation-marker[data-operation-status="limited"]',
      )!;
    fireEvent.keyDown(limitedOperation, { key: ' ' });
    expect(useAssembly.getState().workbench.activeOperationId).toBeTruthy();
    expect(useAssembly.getState().workbench.detailDrawer.open).toBe(false);
    expect(useAssembly.getState().workbench.canvasView).toBe('skeleton');
    expect(
      document.querySelector('.a-length-groups span[data-active="true"]'),
    ).toBeTruthy();
    fireEvent.keyDown(container.querySelector('.assembly-app')!, {
      key: 'Escape',
    });
    expect(useAssembly.getState().workbench.selectedInstanceId).toBe(
      'instance:jack:front-left:left:1',
    );
    const projectBeforeIsolation = structuredClone(
      useAssembly.getState().projectDocument,
    );
    const historyBeforeIsolation = useAssembly.getState().historyPast.length;
    fireEvent.click(screen.getByRole('button', { name: 'Izoluj element' }));
    expect(useAssembly.getState().workbench.isolateSelection).toBe(true);
    expect(useAssembly.getState().projectDocument).toEqual(
      projectBeforeIsolation,
    );
    expect(useAssembly.getState().historyPast).toHaveLength(
      historyBeforeIsolation,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pokaż cały dach' }));
    expect(useAssembly.getState().workbench.isolateSelection).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Połać' }));
    expect(
      screen.getByRole('region', { name: 'Podsumowanie dachu' }),
    ).toBeTruthy();
  });

  it('shows support and J1 fabrication contexts with explicit limitations', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Krokiew narożna' }));
    builder();
    fireEvent.click(screen.getByRole('button', { name: 'Kalenica' }));
    expect(
      screen.getByRole('region', { name: 'Parametry podpory' }),
    ).toBeTruthy();
    expect(screen.getByTestId('roof-fabrication-package')).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', {
        name: /Kulawek J1\/2 · przód · przedni lewy narożnik/,
      }),
    );
    expect(
      screen.getAllByText(/Odjęcie do fizycznego lica H1/).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole('tab', { name: /J1 .*Połączenie z H1/ }),
    ).toBeTruthy();
  });

  it('keeps the instance workflow compact on a narrow drawing', () => {
    class NarrowResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [
            {
              target,
              contentRect: { width: 360 } as DOMRectReadOnly,
            } as ResizeObserverEntry,
          ],
          this as unknown as ResizeObserver,
        );
      }
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal('ResizeObserver', NarrowResizeObserver);
    const { container } = render(<App />);
    builder();
    fireEvent.click(screen.getByRole('button', { name: 'Krokiew #1 - lewa' }));

    const overlay = screen.getByTestId('member-instance-overlay');
    expect(
      overlay.querySelectorAll('.a-operation-badge').length,
    ).toBeGreaterThan(0);
    expect(overlay.querySelector('.a-operation-label-bg')).toBeNull();
    expect(
      screen.getByTestId('instance-navigator').querySelectorAll('button'),
    ).toHaveLength(4);
    expect(container.querySelector('.a-context-breadcrumb')).toBeTruthy();
  });

  it('does not run global history shortcuts while an exact input is active', () => {
    render(<App />);
    builder();
    enter('Kąt połaci', '42');
    const historyLength = useAssembly.getState().historyPast.length;

    fireEvent.keyDown(input('Kąt połaci'), { key: 'z', ctrlKey: true });
    fireEvent.keyDown(input('Kąt połaci'), { key: 'Escape' });

    expect(useAssembly.getState().template.pitchDeg).toBe(42);
    expect(useAssembly.getState().historyPast).toHaveLength(historyLength);
    expect(useAssembly.getState().workbench.selectedId).toBe('roof');
  });

  it('renders the square hip as a zero-ridge pyramid and a rectangle with a ridge', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Krokiew narożna' }));
    builder();
    expect(useAssembly.getState().template.buildingLengthMm).toBe(8000);
    expect(
      container.querySelector('[data-entity="skeleton:ridge"]'),
    ).toBeNull();
    enter('Długość budynku', '10000');
    expect(
      container.querySelector('[data-entity="skeleton:ridge"]'),
    ).toBeTruthy();
    enter('Długość budynku', '7999');
    expect(input('Długość budynku').getAttribute('aria-invalid')).toBe('true');
    expect(useAssembly.getState().template.buildingLengthMm).toBe(10000);
  });
});
