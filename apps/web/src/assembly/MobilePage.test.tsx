// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../App';
import { fromMillimetres } from '@cieslacalc/roof-math';
import i18n from '../i18n';
import { useAssembly } from './store';
import { mobileWorkbenchQuery } from './mobile-workbench';

beforeEach(async () => {
  localStorage.clear();
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
  localStorage.setItem('cieslacalc.creatorStartSeen.v1', '1');
  await i18n.changeLanguage('pl');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mobileCoveringValues = {
  'roof-tile': {
    physicalWidth: 330,
    physicalLength: 420,
    coverWidth: 300,
    gaugeMin: 300,
    gaugeMax: 380,
    minimumPitch: 19,
  },
  'modular-sheet': {
    effectiveWidth: 1145,
    totalWidth: 1200,
    effectiveLength: 700,
    totalLength: 725,
    moduleLength: 350,
    minimumPitch: 9,
  },
  'standing-seam': {
    effectiveWidth: 500,
    minimumLength: 500,
    maximumLength: 8000,
    minimumPitch: 8,
    seamHeight: 25,
  },
} as const;

async function addMobileManualCovering(
  kind: keyof typeof mobileCoveringValues,
) {
  const assistant = await screen.findByTestId('covering-add-assistant');
  const family = assistant.querySelector<HTMLButtonElement>(
    `[data-covering-family="${kind}"]`,
  );
  expect(family).toBeTruthy();
  fireEvent.click(family!);
  await waitFor(() =>
    expect(
      assistant.querySelector('[data-covering-source="manual"]'),
    ).toBeTruthy(),
  );
  fireEvent.click(
    assistant.querySelector<HTMLButtonElement>(
      '[data-covering-source="manual"]',
    )!,
  );
  const draft = await screen.findByTestId('manual-covering-draft');
  fireEvent.change(
    draft.querySelector<HTMLInputElement>('[data-manual-field="name"]')!,
    { target: { value: 'Produkt testowy' } },
  );
  const unit = useAssembly.getState().unit;
  for (const [key, valueMm] of Object.entries(mobileCoveringValues[kind])) {
    const value =
      key === 'minimumPitch' ? valueMm : fromMillimetres(valueMm, unit);
    fireEvent.change(
      draft.querySelector<HTMLInputElement>(`[data-manual-field="${key}"]`)!,
      { target: { value: String(value) } },
    );
  }
  fireEvent.click(within(draft).getByTestId('confirm-manual-covering'));
}

it('opens mobile Builder on drawing with five perspectives, contextual tasks and one on-demand tools sheet', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Kreator' }));
  await screen.findByTestId('skeleton-drawing', {}, { timeout: 5000 });
  expect(screen.queryByRole('dialog')).toBeNull();
  const dock = screen.getByRole('tablist', { name: 'Perspektywa' });
  expect(within(dock).getAllByRole('tab')).toHaveLength(5);
  const tasks = screen.getByRole('tablist', {
    name: 'Zadania w tej części projektu',
  });
  expect(within(tasks).getAllByRole('tab')).toHaveLength(4);
  expect(useAssembly.getState().historyPast).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Narzędzia' }));
  const sheet = screen.getByRole('dialog', { name: 'Narzędzia' });
  expect(within(sheet).getByText('Geometria')).toBeTruthy();
  expect(
    within(sheet).queryByRole('button', { name: 'Dodaj okno' }),
  ).toBeNull();
  fireEvent.click(within(tasks).getByRole('tab', { name: 'Otwory' }));
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

it('shows mobile project status and reaches summary and K1 planning through the task flow', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Kreator' }));
  expect(
    screen.getByTestId('project-workflow').querySelectorAll('li'),
  ).toHaveLength(6);
  fireEvent.click(screen.getByTestId('project-next-action'));
  expect(useAssembly.getState().workbench.viewPreset).toBe('covering');
  const dock = screen.getByRole('tablist', { name: 'Perspektywa' });
  fireEvent.click(
    within(dock).getByRole('tab', { name: 'Perspektywa: Materiały' }),
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Projekt' }));
  expect(screen.getByTestId('project-summary')).toBeTruthy();
  fireEvent.click(screen.getByTestId('summary-k1-cutting-cta'));
  expect(
    await screen.findByTestId('k1-cutting-panel', {}, { timeout: 5000 }),
  ).toBeTruthy();
  // V37: K1 cutting is the Materials › Rozkrój K1 tab, not a modal dialog.
  expect(useAssembly.getState().workbench.materialsView).toBe('cutting');
  expect(screen.getByTestId('workbench-back')).toBeTruthy();
  expect(useAssembly.getState().historyPast).toHaveLength(0);
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
  const dock = screen.getByRole('tablist', { name: 'Perspektywa' });
  fireEvent.click(
    within(dock).getByRole('tab', { name: 'Perspektywa: Materiały' }),
  );
  const schedule = await screen.findByTestId('material-schedule');
  expect(screen.queryByRole('dialog')).toBeNull();
  const layers = within(schedule).getByTestId(
    'result-layer-progress-schedule',
  ) as HTMLDetailsElement;
  expect(layers.open).toBe(false);
  fireEvent.click(within(layers).getByText('Jak czytać ten wynik'));
  expect(layers.open).toBe(true);
  expect(within(layers).getByText('Wykonanie')).toBeTruthy();
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

it('keeps the covering drawing separate from exact product parameters and repairs batten issues', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Kreator' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Pokrycie' }));
  await addMobileManualCovering('roof-tile');
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
  fireEvent.click(within(sheet).getByRole('button', { name: 'Zamknij' }));
  // V46: the first covering already created Auto battens (same entry).
  expect(
    useAssembly.getState().projectDocument.project.buildUp.battenLayout?.mode,
  ).toBe('auto-from-covering');
  expect(useAssembly.getState().workbench.viewPreset).toBe('covering');
  expect(useAssembly.getState().historyPast).toHaveLength(1);
  expect(
    screen.queryByRole('button', { name: /Rozmieść łaty automatycznie/ }),
  ).toBeNull();
});

it('opens standing-seam numeric parameters and width modes through the mobile Inspector sheet', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Kreator' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Pokrycie' }));
  await addMobileManualCovering('standing-seam');
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
  expect(
    within(editor)
      .getAllByRole('radio')
      .filter(
        (radio) => !radio.closest('[data-testid="horizontal-alignment"]'),
      ),
  ).toHaveLength(2);
});

it('edits cut-to-length metal in one mobile Inspector sheet and keeps drawing detail transient', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Kreator' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Pokrycie' }));
  await addMobileManualCovering('modular-sheet');
  await screen.findByTestId('sheet-layout-drawing');
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Parametry / Popraw' })[0]!,
  );
  const sheet = screen.getByRole('dialog', { name: 'Właściwości elementu' });
  fireEvent.change(await within(sheet).findByLabelText('Format arkusza'), {
    target: { value: 'cut-to-length' },
  });
  expect(
    await within(sheet).findByLabelText(/Maksymalna długość arkusza/),
  ).toBeTruthy();
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(
    await screen.findByTestId('cut-to-length-sheet-layout-drawing'),
  ).toBeTruthy();
  fireEvent.click(within(sheet).getByRole('button', { name: 'Zamknij' }));
  const before = useAssembly.getState().historyPast.length;
  fireEvent.click(screen.getByRole('button', { name: 'Uproszczony' }));
  expect(useAssembly.getState().historyPast).toHaveLength(before);
});

it('reaches exact roof geometry from the mobile Toolbox', async () => {
  // Regression: the roof is the default selection and therefore has no
  // selection peek, so choosing it from the Toolbox used to close the sheet and
  // leave span/pitch/overhang with no exact numeric input on mobile.
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Kreator' }));
  await screen.findByTestId('skeleton-drawing');
  fireEvent.click(screen.getByRole('button', { name: 'Narzędzia' }));
  const tools = screen.getByRole('dialog', { name: 'Narzędzia' });
  fireEvent.click(within(tools).getAllByRole('button', { name: 'Połać' })[0]!);

  expect(useAssembly.getState().workbench.mobilePanel).toBe('inspector');
  const inspector = await screen.findByRole('dialog');
  const pitch = within(inspector).getByLabelText(
    'Kąt połaci',
  ) as HTMLInputElement;
  expect(pitch.value).toBe('35');
  fireEvent.change(pitch, { target: { value: '42' } });
  fireEvent.blur(pitch);
  expect(useAssembly.getState().template.pitchDeg).toBe(42);
});
