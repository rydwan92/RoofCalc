// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../App';
import i18n from '../i18n';
import { useAssembly } from './store';
import { mobileWorkbenchQuery } from './mobile-workbench';

beforeEach(async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((media: string) => ({
      media,
      matches: media === mobileWorkbenchQuery,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  useAssembly.getState().reset();
  useAssembly.getState().setMode('quick');
  await i18n.changeLanguage('pl');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('opens mobile Builder on drawing with six tasks and one on-demand tools sheet', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Kreator' }));
  await screen.findByTestId('skeleton-drawing');
  expect(screen.queryByRole('dialog')).toBeNull();
  const dock = screen.getByRole('tablist', { name: 'Widok zadaniowy' });
  expect(within(dock).getAllByRole('tab')).toHaveLength(6);
  expect(useAssembly.getState().historyPast).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Narzędzia' }));
  const sheet = screen.getByRole('dialog', { name: 'Narzędzia' });
  expect(within(sheet).getByText('Geometria')).toBeTruthy();
  expect(
    within(sheet).queryByRole('button', { name: 'Dodaj okno' }),
  ).toBeNull();
  fireEvent.click(within(dock).getByRole('tab', { name: 'Otwory' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(useAssembly.getState().historyPast).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Narzędzia' }));
  expect(
    within(screen.getByRole('dialog', { name: 'Narzędzia' })).getByRole(
      'button',
      { name: 'Dodaj okno' },
    ),
  ).toBeTruthy();
});

it('keeps selection as a peek and edits it only on request', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Kreator' }));
  await screen.findByTestId('skeleton-drawing');
  act(() => {
    const id = useAssembly.getState().spec.member.id;
    useAssembly.getState().select(id, id);
  });
  expect(screen.getByRole('button', { name: 'Edytuj' })).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Edytuj' }));
  expect(
    screen.getByRole('dialog', { name: 'Właściwości elementu' }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Widok' }));
  expect(screen.getByRole('dialog', { name: 'Widok' })).toBeTruthy();
  expect(
    screen.queryByRole('dialog', { name: 'Właściwości elementu' }),
  ).toBeNull();
});

it('opens the material Inspector sheet only after an exact schedule row is selected', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Kreator' }));
  act(() =>
    useAssembly.getState().setBattenLayout({
      enabled: true,
      battenHeightMm: 40,
      battenWidthMm: 60,
      gaugeMm: 350,
      eaveOffsetMm: 250,
    }),
  );
  const dock = screen.getByRole('tablist', { name: 'Widok zadaniowy' });
  fireEvent.click(within(dock).getByRole('tab', { name: 'Zestawienie' }));
  const schedule = await screen.findByTestId('material-schedule');
  expect(screen.queryByRole('dialog')).toBeNull();
  const summary = within(schedule).getByTestId('material-build-up-summary');
  fireEvent.click(within(summary).getByText(/Pokaż długości/));
  fireEvent.click(
    within(summary).getAllByTestId('material-build-up-exact-row')[0]!,
  );
  expect(
    screen.getByRole('dialog', { name: 'Właściwości elementu' }),
  ).toBeTruthy();
  expect(await screen.findByTestId('schedule-inspector')).toBeTruthy();
});

it('treats a touch window tap as selection, then commits one activated drag and restores cancellation', async () => {
  class TouchPointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(
      type: string,
      init: MouseEventInit & { pointerId?: number; pointerType?: string },
    ) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? 'touch';
    }
  }
  vi.stubGlobal('PointerEvent', TouchPointerEvent);
  const { container } = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Kreator' }));
  await screen.findByTestId('skeleton-drawing');
  act(() => useAssembly.getState().addRoofWindow());
  act(() => useAssembly.setState({ historyPast: [], historyFuture: [] }));
  const drawing = screen.getByTestId(
    'skeleton-drawing',
  ) as unknown as SVGSVGElement;
  Object.defineProperties(drawing, {
    getBoundingClientRect: {
      value: () => ({ left: 0, top: 0, width: 820, height: 518 }),
    },
    setPointerCapture: { value: vi.fn() },
    releasePointerCapture: { value: vi.fn() },
    hasPointerCapture: { value: () => false },
  });
  const windowElement = container.querySelector(
    '[data-roof-window="feature:roof-window-1"]',
  )!;
  const before = structuredClone(
    useAssembly.getState().projectDocument.project.features[0],
  );
  const pointer = { pointerId: 71, pointerType: 'touch', button: 0 };
  fireEvent.pointerDown(windowElement, {
    ...pointer,
    clientX: 400,
    clientY: 280,
  });
  fireEvent.pointerMove(drawing, { ...pointer, clientX: 403, clientY: 283 });
  fireEvent.pointerUp(drawing, pointer);
  expect(useAssembly.getState().projectDocument.project.features[0]).toEqual(
    before,
  );
  expect(useAssembly.getState().historyPast).toHaveLength(0);
  fireEvent.pointerDown(windowElement, {
    ...pointer,
    clientX: 400,
    clientY: 280,
  });
  fireEvent.pointerMove(drawing, { ...pointer, clientX: 430, clientY: 300 });
  fireEvent.pointerUp(drawing, pointer);
  expect(useAssembly.getState().historyPast).toHaveLength(1);
  act(() => useAssembly.getState().undo());
  expect(useAssembly.getState().projectDocument.project.features[0]).toEqual(
    before,
  );
  fireEvent.pointerDown(windowElement, {
    ...pointer,
    clientX: 400,
    clientY: 280,
  });
  fireEvent.pointerMove(drawing, { ...pointer, clientX: 430, clientY: 300 });
  fireEvent.pointerCancel(drawing, pointer);
  expect(useAssembly.getState().projectDocument.project.features[0]).toEqual(
    before,
  );
  fireEvent.pointerDown(windowElement, {
    ...pointer,
    clientX: 400,
    clientY: 280,
  });
  fireEvent.pointerMove(drawing, { ...pointer, clientX: 430, clientY: 300 });
  fireEvent.pointerDown(drawing, {
    pointerId: 72,
    pointerType: 'touch',
    button: 0,
    clientX: 300,
    clientY: 280,
  });
  expect(useAssembly.getState().activeTransaction).toBeUndefined();
  expect(useAssembly.getState().projectDocument.project.features[0]).toEqual(
    before,
  );
  fireEvent.pointerMove(drawing, {
    pointerId: 72,
    pointerType: 'touch',
    button: 0,
    clientX: 250,
    clientY: 280,
  });
  expect(
    drawing.closest('.a-skeleton')?.querySelector('.a-canvas-controls > span')
      ?.textContent,
  ).not.toBe('100%');
  expect(useAssembly.getState().historyPast).toHaveLength(0);
});

it('keeps the covering drawing separate from exact product parameters and routes batten issues', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Kreator' }));
  const dock = screen.getByRole('tablist', { name: 'Widok zadaniowy' });
  fireEvent.click(within(dock).getByRole('tab', { name: 'Pokrycie' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Dodaj dachówkę ręcznie' }),
  );
  await screen.findByTestId('covering-workspace');
  expect(screen.getByTestId('tile-layout-drawing')).toBeTruthy();
  expect(
    within(screen.getByTestId('covering-workspace')).queryByLabelText(
      'Nazwa produktu',
    ),
  ).toBeNull();
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Parametry / Popraw' })[0]!,
  );
  const sheet = screen.getByRole('dialog', { name: 'Właściwości elementu' });
  expect(await within(sheet).findByLabelText('Nazwa produktu')).toBeTruthy();
  expect(useAssembly.getState().historyPast).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: /Przejdź do Warstwy/ }));
  expect(useAssembly.getState().workbench.viewPreset).toBe('layers');
  expect(useAssembly.getState().workbench.buildUpView).toBe('battens');
  expect(useAssembly.getState().workbench.mobilePanel).toBe('none');
});

it('opens standing-seam numeric parameters and width modes through the mobile Inspector sheet', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Kreator' }));
  const dock = screen.getByRole('tablist', { name: 'Widok zadaniowy' });
  fireEvent.click(within(dock).getByRole('tab', { name: 'Pokrycie' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Dodaj rąbek stojący' }),
  );
  expect(
    await screen.findByTestId('standing-seam-layout-drawing'),
  ).toBeTruthy();
  expect(screen.queryByTestId('standing-seam-editor')).toBeNull();
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Parametry / Popraw' })[0]!,
  );
  const sheet = screen.getByRole('dialog', { name: 'Właściwości elementu' });
  const editor = await within(sheet).findByTestId('standing-seam-editor');
  expect(
    within(editor).getByLabelText(/Maksymalna długość panelu/),
  ).toBeTruthy();
  fireEvent.click(
    within(editor).getByRole('button', { name: 'Dodaj szerokość krycia' }),
  );
  expect(within(editor).getAllByRole('radio')).toHaveLength(2);
});
