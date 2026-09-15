// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { App } from '../App';
import i18n from '../i18n';
import {
  calculateAssembly,
  fromMillimetres,
  purlinRange,
  resolveBattenLayout,
} from '@cieslacalc/roof-math';
import { createAssemblyDrawing } from '@cieslacalc/calculator-core';
import { fitDimensionedDrawing } from '@cieslacalc/drawing-engine';
import { formatLength } from '../format';
import { useAssembly } from './store';

beforeEach(async () => {
  localStorage.clear();
  useAssembly.getState().reset();
  useAssembly.getState().setUnit('mm');
  useAssembly.getState().setMode('quick');
  useAssembly.getState().setToolboxCollapsed(false);
  useAssembly.getState().setMaterialsView('schedule');
  localStorage.setItem('cieslacalc.creatorStartSeen.v1', '1');
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

const coveringValues = {
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

async function addManualCovering(kind: keyof typeof coveringValues) {
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
  for (const [key, valueMm] of Object.entries(coveringValues[kind])) {
    const value =
      key === 'minimumPitch' ? valueMm : fromMillimetres(valueMm, unit);
    fireEvent.change(
      draft.querySelector<HTMLInputElement>(`[data-manual-field="${key}"]`)!,
      { target: { value: String(value) } },
    );
  }
  fireEvent.click(within(draft).getByTestId('confirm-manual-covering'));
}

describe('dual-mode parametric workbench', () => {
  it('guides the first Creator entry and maps the full building width to halfRun', async () => {
    localStorage.removeItem('cieslacalc.creatorStartSeen.v1');
    render(<App />);
    builder();
    const assistant = await screen.findByTestId('project-start-assistant');
    const setStartField = (name: string, value: string) =>
      fireEvent.change(
        assistant.querySelector<HTMLInputElement>(
          `[data-project-start-field="${name}"]`,
        )!,
        { target: { value } },
      );
    setStartField('buildingLength', '12000');
    setStartField('buildingWidth', '9000');
    setStartField('pitch', '35');
    setStartField('eave', '500');
    setStartField('spacing', '800');
    fireEvent.click(within(assistant).getByTestId('project-start-submit'));
    await waitFor(() =>
      expect(screen.queryByTestId('project-start-assistant')).toBeNull(),
    );
    expect(useAssembly.getState().template).toMatchObject({
      type: 'gable',
      buildingLengthMm: 12_000,
      halfRunMm: 4_500,
      pitchDeg: 35,
      eaveOverhangMm: 500,
      rafterSpacing: { spacingMm: 800 },
    });
    expect(useAssembly.getState().historyPast).toHaveLength(0);
  });

  it('opens project export, omits an absent cutting plan and previews printable pages without roof history', async () => {
    render(<App />);
    builder();
    const before = structuredClone(useAssembly.getState().projectDocument);
    const trigger = await screen.findByTestId('project-execution-export');
    await waitFor(() =>
      expect((trigger as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(trigger);
    const config = await screen.findByTestId(
      'execution-config',
      {},
      { timeout: 5000 },
    );
    expect(within(config).getByText('Pakiet wykonawczy')).toBeTruthy();
    expect(
      within(config).getByText('Najpierw zaplanuj rozkrój K1.'),
    ).toBeTruthy();
    fireEvent.click(
      within(config).getByRole('button', { name: 'Podgląd dokumentu' }),
    );
    const preview = await screen.findByTestId('execution-preview');
    expect(
      preview.querySelector('[data-section="project-summary"]'),
    ).toBeTruthy();
    expect(
      preview.querySelector('[data-section="member-fabrication"]'),
    ).toBeTruthy();
    expect(preview.querySelector('[data-section="cutting-plan"]')).toBeFalsy();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    fireEvent.click(screen.getByTestId('execution-print'));
    expect(print).toHaveBeenCalledOnce();
    expect(useAssembly.getState().projectDocument).toEqual(before);
    expect(useAssembly.getState().historyPast).toHaveLength(0);
  });

  it('derives project guidance and opens the existing K1 planner from the summary without roof history', async () => {
    render(<App />);
    builder();
    const before = structuredClone(useAssembly.getState().projectDocument);
    const workflow = screen.getByTestId('project-workflow');
    expect(workflow.querySelectorAll('li')).toHaveLength(6);
    expect(
      workflow
        .querySelector('[data-stage="covering"]')
        ?.getAttribute('data-status'),
    ).toBe('incomplete');
    fireEvent.click(screen.getByTestId('project-next-action'));
    expect(useAssembly.getState().workbench.viewPreset).toBe('covering');
    act(() => useAssembly.getState().setViewPreset('materials'));
    fireEvent.click(screen.getByRole('tab', { name: 'Projekt' }));
    expect(screen.getByTestId('project-summary')).toBeTruthy();
    expect(useAssembly.getState().workbench.materialsView).toBe('summary');
    fireEvent.click(screen.getByTestId('summary-k1-cutting-cta'));
    expect(
      await screen.findByTestId('k1-cutting-panel', {}, { timeout: 5000 }),
    ).toBeTruthy();
    expect(useAssembly.getState().projectDocument).toEqual(before);
    expect(useAssembly.getState().historyPast).toHaveLength(0);
  });

  it('explains missing schedule layers and covering with routes to their tasks', async () => {
    render(<App />);
    builder();
    act(() => useAssembly.getState().setViewPreset('materials'));
    expect(await screen.findByTestId('layers-schedule-empty')).toBeTruthy();
    const emptyCovering = screen.getByTestId('covering-schedule-empty');
    expect(
      within(emptyCovering).getByText(/Dodaj dachówkę lub blachę/),
    ).toBeTruthy();
    fireEvent.click(within(emptyCovering).getByRole('button'));
    expect(useAssembly.getState().workbench.viewPreset).toBe('covering');
    act(() => useAssembly.getState().setViewPreset('openings'));
    expect(screen.getByText(/Nie dodano otworów/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dodaj okno' })).toBeTruthy();
  });

  it('reports an assigned but unresolved covering as needing attention in the strip and summary', async () => {
    render(<App />);
    builder();
    act(() => useAssembly.getState().setViewPreset('covering'));
    await addManualCovering('roof-tile');
    const coveringStage = screen
      .getByTestId('project-workflow')
      .querySelector('[data-stage="covering"]')!;
    expect(coveringStage.getAttribute('data-status')).toBe('warning');
    expect(coveringStage.textContent).toContain('Wymaga uwagi');
    expect(screen.getByTestId('project-next-action').textContent).toContain(
      'Sprawdź pokrycie',
    );
    act(() => {
      useAssembly.getState().setViewPreset('materials');
    });
    await screen.findByTestId('material-schedule');
    expect(
      document.querySelector('.a-schedule-summary article:nth-child(3) strong')
        ?.textContent,
    ).toBe('Wymaga uwagi');
    act(() => {
      useAssembly.getState().setMaterialsView('summary');
    });
    expect(screen.getByTestId('project-summary').textContent).toContain(
      'Wymaga uwagi',
    );
  });

  it('uses centimetres consistently in Quick Calc and Builder when preferred', async () => {
    act(() => useAssembly.getState().setUnit('cm'));
    render(<App />);

    expect(input('Rzut do osi kalenicy').value).toBe('400');
    expect(useAssembly.getState().unit).toBe('cm');
    builder();
    await screen.findByTestId('skeleton-drawing', {}, { timeout: 5000 });
    expect(useAssembly.getState().unit).toBe('cm');
    expect(
      screen
        .getAllByLabelText('Rzut do osi kalenicy')
        .every((field) => (field as HTMLInputElement).value === '400'),
    ).toBe(true);
  });

  it('starts with three basic inputs and transfers exact geometry and results to Builder', async () => {
    render(<App />);
    expect(document.querySelectorAll('.a-basic-fields input')).toHaveLength(3);
    expect(document.querySelector('.a-more')?.hasAttribute('open')).toBe(false);
    enter('Rzut do osi kalenicy', '4250,123456');
    enter('Kąt połaci', '30');
    const spec = useAssembly.getState().spec,
      stock = screen.getByTestId('stock-length').textContent;
    expect(screen.getAllByText('Minimalna długość geometryczna').length).toBe(
      1,
    );
    expect(stock).toMatch(/\smm$/);
    fireEvent.click(screen.getByTestId('quick-create-project'));
    expect(await screen.findByTestId('project-start-assistant')).toBeTruthy();
    expect(
      document.querySelector('[data-project-start-field="buildingWidth"]'),
    ).toBeNull();
    fireEvent.click(screen.getByTestId('project-start-submit'));
    await waitFor(() =>
      expect(screen.queryByTestId('project-start-assistant')).toBeNull(),
    );
    expect(useAssembly.getState().spec).toEqual(spec);
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
  it('opens canonical Quick details, switches cut state, closes on Escape and hands off to Builder', () => {
    render(<App />);
    const initialDocument = structuredClone(
      useAssembly.getState().projectDocument,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'K1 · Zacios przy podporze' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Zacios przy podporze',
    });
    expect(
      within(dialog).getByTestId('detail-preview-birdsmouth-detail'),
    ).toBeTruthy();
    expect(dialog.querySelector('.shape-removed')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Po cięciu' }));
    expect(dialog.querySelector('.shape-removed')).toBeNull();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useAssembly.getState().projectDocument).toEqual(initialDocument);
    fireEvent.click(
      screen.getByRole('button', { name: 'K1 · Zacios przy podporze' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Zamknij szybki detal' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: 'K1 · Cięcie kalenicowe' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Otwórz detal w Kreatorze' }),
    );
    expect(useAssembly.getState().workbench.mode).toBe('builder');
    expect(useAssembly.getState().workbench.viewPreset).toBe('cuts');
    expect(useAssembly.getState().workbench.selectedId).toBe('cut:ridge');
    expect(useAssembly.getState().workbench.detailDrawer.open).toBe(true);
  });
  it('keeps H1 warnings visible in its Quick detail dialog', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Krokiew narożna' }));
    fireEvent.click(
      screen.getByRole('button', {
        name: 'H1 · Górne cięcie krokwi narożnej',
      }),
    );
    expect(screen.getByRole('dialog').textContent).toContain(
      'Nie wybiera automatycznie podcięcia grzbietu',
    );
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
    expect(screen.getAllByTestId('spacing-bay-dimension')).toHaveLength(1);
    expect(screen.getByTestId('spacing-bay-dimension').textContent).toContain(
      '2 × 470 mm',
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Pełne' }));
    expect(screen.getAllByTestId('spacing-bay-dimension')).toHaveLength(2);
    expect(
      screen
        .getAllByTestId('spacing-bay-dimension')
        .every(
          (node) =>
            node.getAttribute('data-spacing-presentation') === 'individual',
        ),
    ).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Robocze' }));
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
    fireEvent.click(
      screen.getByRole('button', { name: 'Tryb skupienia panelu detalu' }),
    );
    expect(useAssembly.getState().workbench.detailDrawer.mode).toBe('focus');
    fireEvent.keyDown(document.querySelector('.assembly-app')!, {
      key: 'Escape',
    });
    expect(useAssembly.getState().workbench.detailDrawer.mode).toBe('working');
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
    fireEvent.click(screen.getByRole('radio', { name: 'Minimalne' }));
    expect(useAssembly.getState().workbench.dimensionLevel).toBe('minimal');
    expect(
      (screen.getByRole('radio', { name: 'Minimalne' }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole('button', { name: 'Zmień język na angielski' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Roof workbench' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add purlin' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Schedule' }));
    expect(
      await screen.findByRole('heading', { name: 'Member schedule' }),
    ).toBeTruthy();
    expect(container.textContent).not.toContain('assembly.');
    expect(document.documentElement.lang).toBe('en');
  });
  it('keeps workspace focus and exact 3D measurement transient with Escape cancellation', () => {
    const { container } = render(<App />);
    builder();
    const app = container.querySelector('.assembly-app')!;
    const project = structuredClone(useAssembly.getState().projectDocument);
    const historyLength = useAssembly.getState().historyPast.length;

    fireEvent.click(screen.getByRole('button', { name: 'Skup widok' }));
    expect(container.querySelector('.is-workspace-focus')).toBeTruthy();
    fireEvent.keyDown(app, { key: 'Escape' });
    expect(container.querySelector('.is-workspace-focus')).toBeNull();

    fireEvent.keyDown(app, { key: 'm' });
    expect(screen.getByTestId('measure-hud').textContent).toContain(
      'Wskaż pierwszy punkt',
    );
    act(() => {
      useAssembly.getState().chooseMeasurementPoint({
        id: 'a',
        label: 'A',
        point: { x: 0, y: 0, z: 0 },
      });
      useAssembly.getState().chooseMeasurementPoint({
        id: 'b',
        label: 'B',
        point: { x: 300, y: 400, z: 1200 },
      });
    });
    expect(screen.getByTestId('measure-hud').textContent).toContain('1300 mm');
    expect(useAssembly.getState().projectDocument).toEqual(project);
    expect(useAssembly.getState().historyPast).toHaveLength(historyLength);
    fireEvent.keyDown(app, { key: 'Escape' });
    expect(screen.queryByTestId('measure-hud')).toBeNull();
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
    expect(screen.getByTestId('member-local-hud').textContent).toContain(
      'K1-04',
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
    expect(useAssembly.getState().workbench.detailDrawer.mode).toBe(
      'collapsed',
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
      container.querySelector('[data-entity="instance:purlin-2:left"]')!,
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
  it('shows and applies the geometric equal-distribution proposal from the purlin group', () => {
    render(<App />);
    builder();
    add();
    add();
    add();
    useAssembly.setState({ historyPast: [], historyFuture: [] });
    const documentBeforeProposal = structuredClone(
      useAssembly.getState().projectDocument,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Akcje płatwi' }));
    const dialog = screen.getByRole('dialog', { name: 'Rozmieść równo' });
    expect(dialog.textContent).toContain('Rozmieszczenie geometryczne');
    expect(useAssembly.getState().projectDocument).toEqual(
      documentBeforeProposal,
    );
    expect(useAssembly.getState().historyPast).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zastosuj' }));
    expect(useAssembly.getState().historyPast).toHaveLength(1);
    expect(
      useAssembly
        .getState()
        .template.intermediateSupports.map((support) => support.placement.xMm),
    ).toEqual(
      [...useAssembly.getState().template.intermediateSupports]
        .map((support) => support.placement.xMm)
        .sort((a, b) => a - b),
    );
  });
  it('adjusts skeleton handles through canonical history while camera controls leave geometry unchanged', () => {
    render(<App />);
    builder();
    const before = structuredClone(useAssembly.getState().template);
    const drawing = screen.getByTestId('skeleton-drawing');
    const fitScaleBeforeEdit = drawing.getAttribute('data-fit-scale');
    const pitchHandle = screen.getByRole('slider', {
      name: 'Przeciągnij, aby zmienić kąt połaci',
    });
    fireEvent.keyDown(pitchHandle, { key: 'ArrowUp' });
    expect(useAssembly.getState().template.pitchDeg).toBe(35.5);
    expect(drawing.getAttribute('data-fit-scale')).toBe(fitScaleBeforeEdit);
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
    fireEvent.click(screen.getAllByRole('button', { name: 'Dopasuj' }).at(-1)!);
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
    const body = container.querySelector(
      '[data-purlin-hit-target="support:purlin-1"]',
    )!;
    const start = {
      x:
        (Number(body.getAttribute('x1')) + Number(body.getAttribute('x2'))) / 2,
      y:
        (Number(body.getAttribute('y1')) + Number(body.getAttribute('y2'))) / 2,
    };
    const before = purlin().placement.xMm;
    const pointer = { pointerId: 31, pointerType: 'mouse', button: 0 };
    fireEvent.pointerDown(body, {
      ...pointer,
      clientX: start.x,
      clientY: start.y,
    });
    fireEvent.pointerMove(drawing, {
      ...pointer,
      clientX: start.x + 50,
      clientY: start.y - 20,
    });
    expect(purlin().placement.xMm).not.toBe(before);
    fireEvent.pointerCancel(drawing, pointer);
    expect(purlin().placement.xMm).toBe(before);
    expect(useAssembly.getState().historyPast).toHaveLength(0);
    fireEvent.pointerDown(body, {
      ...pointer,
      clientX: start.x,
      clientY: start.y,
    });
    fireEvent.pointerMove(drawing, {
      ...pointer,
      clientX: start.x + 50,
      clientY: start.y - 20,
    });
    fireEvent.pointerUp(drawing, pointer);
    expect(useAssembly.getState().historyPast).toHaveLength(1);
  });
  it('drags a purlin directly by its timber body without making wall plate or ridge draggable', () => {
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
    const hitTarget = container.querySelector(
      '[data-purlin-hit-target="support:purlin-1"]',
    )!;
    const start = {
      x:
        (Number(hitTarget.getAttribute('x1')) +
          Number(hitTarget.getAttribute('x2'))) /
        2,
      y:
        (Number(hitTarget.getAttribute('y1')) +
          Number(hitTarget.getAttribute('y2'))) /
        2,
    };
    const before = purlin().placement.xMm;
    const pointer = { pointerId: 42, pointerType: 'mouse', button: 0 };
    fireEvent.pointerDown(hitTarget, {
      ...pointer,
      clientX: start.x,
      clientY: start.y,
    });
    expect(useAssembly.getState().workbench.selectedId).toBe(
      'support:purlin-1',
    );
    expect(useAssembly.getState().activeTransaction).toBeTruthy();
    fireEvent.pointerMove(drawing, {
      ...pointer,
      clientX: start.x + 50,
      clientY: start.y - 20,
    });
    expect(purlin().placement.xMm).not.toBe(before);
    expect(screen.getByTestId('purlin-placement-guide')).toBeTruthy();
    fireEvent.pointerUp(drawing, pointer);
    expect(useAssembly.getState().historyPast).toHaveLength(2);
    fireEvent.pointerDown(
      container.querySelector('.kind-wall-plate')!,
      pointer,
    );
    fireEvent.pointerDown(container.querySelector('.kind-ridge')!, pointer);
    expect(useAssembly.getState().activeTransaction).toBeUndefined();
    expect(container.querySelector('[data-handle="purlin"]')).toBeNull();
  });
  it('places a canonical geometric opening on a roof plane and selects a derived batten row', async () => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    const { container } = render(<App />);
    builder();
    await screen.findByTestId('skeleton-drawing');
    const before = structuredClone(useAssembly.getState().projectDocument);
    act(() => useAssembly.getState().setUnit('cm'));
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj okno' }));
    expect(useAssembly.getState().workbench.viewPreset).toBe('openings');
    expect(useAssembly.getState().projectDocument).toEqual(before);
    expect(screen.getByText(/Wybierz połać i wskaż miejsce/)).toBeTruthy();
    const drawing = screen.getByTestId('skeleton-drawing');
    Object.defineProperty(drawing, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 820, height: 570 }),
    });
    const plane = container.querySelector(
      '[data-roof-plane="roof-plane:left"]',
    )!;
    const points = plane
      .getAttribute('points')!
      .split(' ')
      .map((point) => point.split(',').map(Number));
    const centre = points.reduce(
      (sum, [x, y]) => ({
        x: sum.x + x! / points.length,
        y: sum.y + y! / points.length,
      }),
      { x: 0, y: 0 },
    );
    fireEvent.pointerEnter(plane);
    let activePlane = container.querySelector(
      '[data-roof-plane="roof-plane:left"]',
    )!;
    fireEvent.pointerMove(activePlane, {
      clientX: centre.x,
      clientY: centre.y,
    });
    expect(useAssembly.getState().workbench.placementTool?.roofPlaneId).toBe(
      'roof-plane:left',
    );
    fireEvent.pointerLeave(activePlane);
    expect(
      useAssembly.getState().workbench.placementTool?.roofPlaneId,
    ).toBeUndefined();
    activePlane = container.querySelector(
      '[data-roof-plane="roof-plane:left"]',
    )!;
    fireEvent.pointerEnter(activePlane);
    activePlane = container.querySelector(
      '[data-roof-plane="roof-plane:left"]',
    )!;
    fireEvent.pointerMove(activePlane, {
      clientX: centre.x,
      clientY: centre.y,
    });
    expect(
      container.querySelector('.a-roof-window-ghost')?.textContent,
    ).toContain('78 cm × 118 cm');
    expect(
      container.querySelector('.a-roof-window-ghost')?.textContent,
    ).not.toContain('mm');
    fireEvent.click(activePlane, { clientX: centre.x, clientY: centre.y });
    expect(
      container.querySelector('[data-roof-window="feature:roof-window-1"]'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Okno dachowe O1' }));
    expect(screen.getByLabelText('Szerokość otworu')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Umieść między krokwiami' }),
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'Otwór nie mieści się w polu',
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Warstwy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Łaty' }));
    const battenSwitch = screen.getByRole('switch', {
      name: 'Łaty · Wyłączona',
    });
    expect(battenSwitch.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(battenSwitch);
    expect(
      screen
        .getByRole('switch', { name: 'Łaty · Włączona' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect(screen.getByTestId('batten-inspector')).toBeTruthy();
    expect(
      container.querySelectorAll('.a-batten-segment').length,
    ).toBeGreaterThan(0);
    fireEvent.click(container.querySelector('[data-batten-row]')!);
    expect(screen.getByTestId('batten-row-detail')).toBeTruthy();
  });
  it('duplicates by keyboard and exposes accessible group-selection alignment tools', async () => {
    render(<App />);
    builder();
    await screen.findByTestId('skeleton-drawing');
    act(() => {
      useAssembly.getState().addRoofWindow();
      useAssembly.getState().addRoofWindow();
      useAssembly.getState().updateRoofWindow('feature:roof-window-1', {
        position: { uMm: 900, vMm: 1500 },
      });
      useAssembly.setState({ historyPast: [], historyFuture: [] });
    });
    expect(screen.getByRole('button', { name: 'Powiel' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'd', ctrlKey: true });
    expect(useAssembly.getState().workbench.placementTool).toMatchObject({
      mode: 'duplicate',
      sourceFeatureId: 'feature:roof-window-2',
    });
    expect(useAssembly.getState().historyPast).toHaveLength(0);
    expect(screen.getByText(/Wskaż pozycję kopii/)).toBeTruthy();
    act(() => useAssembly.getState().cancelRoofWindowPlacement());

    fireEvent.click(
      screen.getByRole('button', { name: 'Dodaj O1 do zaznaczenia grupowego' }),
    );
    expect(useAssembly.getState().workbench.selectedFeatureIds).toEqual([
      'feature:roof-window-2',
      'feature:roof-window-1',
    ]);
    expect(screen.getByText('Układ zaznaczonych okien')).toBeTruthy();
    expect(screen.getAllByText('Zaznaczone okna: 2')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Osie środkowe' }));
    expect(useAssembly.getState().historyPast).toHaveLength(1);
    expect(screen.getByText('Otwory: 2')).toBeTruthy();
  });
  it('cancels the opening tool with Escape and commits a numeric draft as one undo step', () => {
    const { container } = render(<App />);
    builder();
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj okno' }));
    fireEvent.keyDown(container.querySelector('.assembly-app')!, {
      key: 'Escape',
    });
    expect(useAssembly.getState().workbench.placementTool).toBeUndefined();
    expect(useAssembly.getState().projectDocument.project.features).toEqual([]);
    expect(useAssembly.getState().historyPast).toHaveLength(0);

    act(() => useAssembly.getState().addRoofWindow());
    act(() => useAssembly.setState({ historyPast: [], historyFuture: [] }));
    const widthField = screen.getByLabelText(
      'Szerokość otworu',
    ) as HTMLInputElement;
    fireEvent.focus(widthField);
    fireEvent.change(widthField, { target: { value: '' } });
    expect(widthField.value).toBe('');
    expect(widthField.getAttribute('aria-invalid')).toBe('true');
    expect(
      useAssembly.getState().projectDocument.project.features[0]!.widthMm,
    ).toBe(780);
    fireEvent.keyDown(widthField, { key: 'Escape' });
    expect(widthField.value).toBe('780');
    fireEvent.focus(widthField);
    fireEvent.change(widthField, { target: { value: '800' } });
    expect(
      useAssembly.getState().projectDocument.project.features[0]!.widthMm,
    ).toBe(780);
    fireEvent.keyDown(widthField, { key: 'Enter' });
    expect(
      useAssembly.getState().projectDocument.project.features[0]!.widthMm,
    ).toBe(800);
    expect(useAssembly.getState().historyPast).toHaveLength(1);
    act(() => useAssembly.getState().undo());
    expect(
      useAssembly.getState().projectDocument.project.features[0]!.widthMm,
    ).toBe(780);
  });
  it('previews geometric opening framing before one-step apply and composes interrupted rafters', () => {
    const { container } = render(<App />);
    builder();
    act(() => {
      useAssembly.getState().addRoofWindow();
      useAssembly.getState().updateRoofWindow('feature:roof-window-1', {
        widthMm: 600,
        position: { uMm: 700, vMm: 1200 },
      });
      useAssembly.setState({ historyPast: [], historyFuture: [] });
    });
    expect(screen.getAllByText(/K1-02/).length).toBeGreaterThan(0);
    fireEvent.click(
      screen.getByRole('button', { name: 'Zaplanuj obramowanie' }),
    );
    expect(
      useAssembly.getState().projectDocument.project.openingFraming,
    ).toEqual([]);
    expect(useAssembly.getState().historyPast).toHaveLength(0);
    expect(
      container.querySelectorAll('.kind-opening-header.is-framing-proposal'),
    ).toHaveLength(2);
    expect(
      screen.getByText(
        'Układ i przekroje wymagają weryfikacji konstrukcyjnej.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zastosuj' }));
    expect(
      useAssembly.getState().projectDocument.project.openingFraming,
    ).toHaveLength(1);
    expect(useAssembly.getState().historyPast).toHaveLength(1);
    expect(container.querySelectorAll('.kind-opening-header')).toHaveLength(2);
    expect(container.querySelectorAll('.kind-rafter-segment')).toHaveLength(2);
    expect(
      container.querySelector('[data-entity="instance:rafter-pair-2:left"]'),
    ).toBeNull();
    act(() => useAssembly.getState().undo());
    expect(
      useAssembly.getState().projectDocument.project.openingFraming,
    ).toEqual([]);
    expect(
      container.querySelector('[data-entity="instance:rafter-pair-2:left"]'),
    ).toBeTruthy();
  });
  it('commits a roof-window pointer drag as one undo step and fully cancels it with Escape', () => {
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
    act(() => useAssembly.getState().addRoofWindow());
    act(() => useAssembly.setState({ historyPast: [], historyFuture: [] }));
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
    const roofWindow = container.querySelector(
      '[data-roof-window="feature:roof-window-1"]',
    )!;
    const before = structuredClone(
      useAssembly.getState().projectDocument.project.features[0]!,
    );
    const pointer = { pointerId: 71, pointerType: 'mouse', button: 0 };
    fireEvent.pointerDown(roofWindow, {
      ...pointer,
      clientX: 400,
      clientY: 280,
    });
    fireEvent.pointerMove(drawing, {
      ...pointer,
      clientX: 430,
      clientY: 295,
    });
    fireEvent.pointerMove(drawing, {
      ...pointer,
      clientX: 460,
      clientY: 310,
    });
    expect(useAssembly.getState().historyPast).toHaveLength(0);
    expect(
      useAssembly.getState().projectDocument.project.features[0]!.position,
    ).not.toEqual(before.position);
    fireEvent.pointerUp(drawing, pointer);
    expect(useAssembly.getState().historyPast).toHaveLength(1);
    act(() => useAssembly.getState().undo());
    expect(useAssembly.getState().projectDocument.project.features[0]).toEqual(
      before,
    );

    fireEvent.pointerDown(roofWindow, {
      ...pointer,
      clientX: 400,
      clientY: 280,
    });
    fireEvent.pointerMove(drawing, {
      ...pointer,
      clientX: 450,
      clientY: 300,
    });
    fireEvent.keyDown(drawing, { key: 'Escape' });
    expect(useAssembly.getState().activeTransaction).toBeUndefined();
    expect(useAssembly.getState().projectDocument.project.features[0]).toEqual(
      before,
    );
    expect(useAssembly.getState().historyPast).toHaveLength(0);
    fireEvent.pointerMove(drawing, {
      ...pointer,
      clientX: 500,
      clientY: 330,
    });
    expect(useAssembly.getState().projectDocument.project.features[0]).toEqual(
      before,
    );
  });
  it('nudges a roof window by 10, Shift 100 and Alt 1 mm with one undo entry each', () => {
    const { container } = render(<App />);
    builder();
    act(() => useAssembly.getState().addRoofWindow());
    act(() => useAssembly.setState({ historyPast: [], historyFuture: [] }));
    const roofWindow = container.querySelector(
      '[data-roof-window="feature:roof-window-1"]',
    )!;
    const start = useAssembly.getState().projectDocument.project.features[0]!;
    fireEvent.keyDown(roofWindow, { key: 'ArrowRight' });
    expect(
      useAssembly.getState().projectDocument.project.features[0]!.position.uMm,
    ).toBe(start.position.uMm + 10);
    fireEvent.keyDown(roofWindow, { key: 'ArrowRight', shiftKey: true });
    expect(
      useAssembly.getState().projectDocument.project.features[0]!.position.uMm,
    ).toBe(start.position.uMm + 110);
    fireEvent.keyDown(roofWindow, { key: 'ArrowRight', altKey: true });
    expect(
      useAssembly.getState().projectDocument.project.features[0]!.position.uMm,
    ).toBe(start.position.uMm + 111);
    expect(useAssembly.getState().historyPast).toHaveLength(3);
    act(() => useAssembly.getState().undo());
    expect(
      useAssembly.getState().projectDocument.project.features[0]!.position.uMm,
    ).toBe(start.position.uMm + 110);
  });
  it('shows the exact colliding rafter and places a fitting window between rafters', () => {
    const { container } = render(<App />);
    builder();
    act(() => useAssembly.getState().addRoofWindow());
    const id = 'feature:roof-window-1';
    act(() =>
      useAssembly.getState().updateRoofWindow(id, {
        widthMm: 500,
        position: { uMm: 0, vMm: 1200 },
      }),
    );
    act(() => useAssembly.setState({ historyPast: [], historyFuture: [] }));
    const before = structuredClone(
      useAssembly.getState().projectDocument.project.features[0]!,
    );
    expect(
      container
        .querySelector(`[data-roof-window="${id}"]`)
        ?.getAttribute('data-collision'),
    ).toBe('true');
    expect(
      container.querySelector('[data-selection-state="warning"]'),
    ).toBeTruthy();
    expect(
      screen.getAllByText(/Kolizja geometryczna z krokwią: K1-01/).length,
    ).toBeGreaterThan(0);
    fireEvent.click(
      screen.getByRole('button', { name: 'Umieść między krokwiami' }),
    );
    const placed = useAssembly.getState().projectDocument.project.features[0]!;
    expect(placed.widthMm).toBe(500);
    expect(placed.position).not.toEqual(before.position);
    expect(useAssembly.getState().historyPast).toHaveLength(1);
    expect(useAssembly.getState().workbench.placementFeedback).toMatchObject({
      featureId: id,
      status: 'placed',
    });
    expect(
      screen.getByText(/Otwór umieszczono geometrycznie pomiędzy/),
    ).toBeTruthy();
    expect(
      screen.queryAllByText(/Kolizja geometryczna z krokwią:/),
    ).toHaveLength(0);
    act(() => useAssembly.getState().undo());
    expect(useAssembly.getState().projectDocument.project.features[0]).toEqual(
      before,
    );
  });
  it('offers a fast H1 path with shared reactive math and coordinated drawings', async () => {
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
    fireEvent.click(screen.getByTestId('quick-create-project'));
    expect(await screen.findByTestId('project-start-assistant')).toBeTruthy();
    fireEvent.click(screen.getByTestId('project-start-submit'));
    await waitFor(() =>
      expect(screen.queryByTestId('project-start-assistant')).toBeNull(),
    );
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

  it('keeps roof build-up navigation transient and exposes membrane and counter-battens in drawing and schedule', async () => {
    const { container } = render(<App />);
    expect(screen.queryByRole('tab', { name: 'Warstwy' })).toBeNull();
    builder();
    act(() => {
      useAssembly.getState().setMembraneLayer({ enabled: true });
      useAssembly.getState().setCounterBattenLayout({
        enabled: true,
        widthMm: 50,
        heightMm: 30,
      });
      useAssembly.setState({ historyPast: [], historyFuture: [] });
    });
    const before = structuredClone(useAssembly.getState().projectDocument);

    fireEvent.click(screen.getByRole('tab', { name: 'Warstwy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Membrana' }));
    expect(container.querySelectorAll('[data-roof-surface]')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Kontrłaty' }));
    expect(
      container.querySelectorAll('[data-counter-batten-row]').length,
    ).toBeGreaterThan(0);
    expect(useAssembly.getState().projectDocument).toEqual(before);
    expect(useAssembly.getState().historyPast).toHaveLength(0);

    fireEvent.click(screen.getByRole('tab', { name: 'Zestawienie' }));
    expect(await screen.findByTestId('material-schedule')).toBeTruthy();
    expect(container.querySelectorAll('[data-build-up-quantity]')).toHaveLength(
      1,
    );
    expect(
      container.querySelectorAll('.a-build-up-quantity-groups > *'),
    ).toHaveLength(2);
    expect(screen.getAllByText('Membrana').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Kontrłaty').length).toBeGreaterThan(0);
    expect(
      container.querySelector('[data-semantic="net-geometric"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-semantic="resolved-visible"]'),
    ).toBeTruthy();
  });

  it('opens the geometry-based material schedule and highlights its source members without editing the project', async () => {
    const { container } = render(<App />);
    expect(screen.queryByRole('tab', { name: 'Zestawienie' })).toBeNull();
    expect(useAssembly.getState().unit).toBe('mm');
    builder();
    act(() => {
      useAssembly.getState().setBattenLayout({
        enabled: true,
        battenHeightMm: 40,
        battenWidthMm: 60,
        gaugeMm: 350,
        eaveOffsetMm: 250,
      });
      useAssembly.setState({ historyPast: [], historyFuture: [] });
    });
    const before = structuredClone(useAssembly.getState().projectDocument);
    const historyLength = useAssembly.getState().historyPast.length;

    fireEvent.click(screen.getByRole('tab', { name: 'Zestawienie' }));
    expect(await screen.findByTestId('material-schedule')).toBeTruthy();
    expect(screen.getByTestId('batten-quantity')).toBeTruthy();
    expect(
      container.querySelector('[data-volume-status="partial"]'),
    ).toBeTruthy();
    expect(
      screen.getAllByText(/nie uwzględnia długości handlowych/i),
    ).not.toHaveLength(0);
    expect(
      container.querySelector('[data-semantic="axis-geometric"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-layer="purchase"][data-state="resolved"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-layer="cutting"][data-state="pending"]'),
    ).toBeTruthy();

    const battenSummary = screen.getAllByTestId(
      'material-build-up-summary',
    )[0]!;
    expect(screen.queryByTestId('schedule-inspector')).toBeNull();
    expect(
      container.querySelector('.a-builder-layout.material-inspector-empty'),
    ).toBeTruthy();
    fireEvent.click(within(battenSummary).getByText(/Pokaż długości/));
    const battenRow = within(battenSummary).getAllByTestId(
      'material-build-up-exact-row',
    )[0]!;
    fireEvent.click(battenRow);
    expect(await screen.findByTestId('schedule-inspector')).toBeTruthy();
    expect(
      container.querySelector('.a-builder-layout.material-inspector-empty'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-batten-row][aria-pressed="true"]')
        .length,
    ).toBeGreaterThan(0);

    const row = screen.getAllByTestId('material-schedule-row')[0]!;
    fireEvent.click(within(row).getAllByRole('button')[0]!);
    expect(useAssembly.getState().workbench.selectedScheduleRowId).toBe(
      row.getAttribute('data-row-id'),
    );
    expect(
      container.querySelectorAll('[data-selection-state="related"]').length,
    ).toBeGreaterThan(0);
    expect(useAssembly.getState().projectDocument).toEqual(before);
    expect(useAssembly.getState().historyPast).toHaveLength(historyLength);
  });

  it('plans only proven K1 blanks from entered commercial lengths without roof history', async () => {
    render(<App />);
    builder();
    const before = structuredClone(useAssembly.getState().projectDocument);
    const history = useAssembly.getState().historyPast.length;
    fireEvent.click(screen.getByRole('tab', { name: 'Zestawienie' }));
    await screen.findByTestId('material-schedule');
    expect(screen.getByTestId('k1-cutting-cta')).toBeTruthy();
    fireEvent.click(screen.getByTestId('k1-cutting-cta'));
    const panel = await screen.findByTestId('k1-cutting-panel');
    expect(panel.querySelector('.a-k1-advanced[open]')).toBeNull();
    fireEvent.change(within(panel).getByTestId('k1-stock-length'), {
      target: { value: '7000' },
    });
    fireEvent.click(within(panel).getByText('+ Dodaj długość'));
    fireEvent.change(within(panel).getAllByTestId('k1-stock-length')[1]!, {
      target: { value: '8000' },
    });
    fireEvent.change(within(panel).getByTestId('k1-objective'), {
      target: { value: 'minimum-stock-count' },
    });
    fireEvent.click(within(panel).getByTestId('k1-run-plan'));
    expect(await within(panel).findByTestId('k1-purchase-list')).toBeTruthy();
    expect(
      within(panel).getByTestId('k1-cutting-result').textContent,
    ).toContain('Przypisane');
    fireEvent.click(within(panel).getByText('Ustawienia zaawansowane'));
    expect(panel.querySelector('.a-k1-advanced[open]')).toBeTruthy();
    fireEvent.change(within(panel).getAllByTestId('k1-stock-length')[0]!, {
      target: { value: '1000' },
    });
    fireEvent.change(within(panel).getAllByTestId('k1-stock-length')[1]!, {
      target: { value: '2000' },
    });
    fireEvent.click(within(panel).getByTestId('k1-run-plan'));
    expect(
      await within(panel).findByTestId('k1-unassigned-warning'),
    ).toBeTruthy();
    expect(useAssembly.getState().projectDocument).toEqual(before);
    expect(useAssembly.getState().historyPast).toHaveLength(history);
  });

  it('explains why K1 cutting is unavailable without a physical ridge board', async () => {
    render(<App />);
    builder();
    act(() => useAssembly.getState().setCanonicalField('ridge.thicknessMm', 0));
    fireEvent.click(screen.getByRole('tab', { name: 'Zestawienie' }));
    await screen.findByTestId('material-schedule');
    expect(screen.queryByTestId('k1-cutting-cta')).toBeNull();
    expect(screen.getByText(/Brak fizycznej deski kalenicowej/)).toBeTruthy();
  });

  it('explains why K1 cutting is unavailable for an unmodeled half-lap ridge connection', async () => {
    render(<App />);
    builder();
    act(() => useAssembly.getState().setRidgeConnection('half-lap'));
    fireEvent.click(screen.getByRole('tab', { name: 'Zestawienie' }));
    await screen.findByTestId('material-schedule');
    expect(screen.queryByTestId('k1-cutting-cta')).toBeNull();
    expect(
      screen.getByText(/nakładka\) nie jest jeszcze opracowana/),
    ).toBeTruthy();
  });

  it('resolves K1 cutting for a direct ridge meeting exactly like the ridge-board default', async () => {
    render(<App />);
    builder();
    act(() => useAssembly.getState().setRidgeConnection('direct-meeting'));
    fireEvent.click(screen.getByRole('tab', { name: 'Zestawienie' }));
    await screen.findByTestId('material-schedule');
    expect(screen.getByTestId('k1-cutting-cta')).toBeTruthy();
  });

  it('adds and removes collar ties when the structural system is toggled', async () => {
    render(<App />);
    builder();
    const history = useAssembly.getState().historyPast.length;
    act(() =>
      useAssembly.getState().setRoofStructureSystem('rafter-collar-tie'),
    );
    expect(useAssembly.getState().historyPast.length).toBeGreaterThan(history);
    fireEvent.click(screen.getByRole('tab', { name: 'Zestawienie' }));
    await screen.findByTestId('material-schedule');
    expect(screen.getAllByText('C1', { exact: false }).length).toBeGreaterThan(
      0,
    );
    act(() => useAssembly.getState().setRoofStructureSystem('rafter'));
    expect(screen.queryByText('C1', { exact: false })).toBeNull();
  });

  it('preserves separate geometric length groups for hip-roof J1 members', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Krokiew narożna' }));
    builder();
    fireEvent.click(screen.getByRole('tab', { name: 'Zestawienie' }));
    await screen.findByTestId('material-schedule');
    const jackRows = screen
      .getAllByTestId('material-schedule-row')
      .filter((row) => row.getAttribute('data-family') === 'J1');
    expect(jackRows.length).toBeGreaterThan(1);
    expect(
      new Set(jackRows.map((row) => row.textContent)).size,
    ).toBeGreaterThan(1);
  });

  it('keeps 40+ exact hip batten lengths behind one compact presentation summary without history', async () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Krokiew narożna' }));
    builder();
    act(() => {
      useAssembly.getState().setBattenLayout({
        enabled: true,
        battenHeightMm: 40,
        battenWidthMm: 60,
        gaugeMm: 100,
        eaveOffsetMm: 50,
      });
      useAssembly.setState({ historyPast: [], historyFuture: [] });
    });
    const projectBeforeExpansion = structuredClone(
      useAssembly.getState().projectDocument,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Zestawienie' }));
    await screen.findByTestId('material-schedule');
    const summaries = screen.getAllByTestId('material-build-up-summary');
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.getAttribute('data-member-kind')).toBe('batten');
    const details = summaries[0]!.querySelector(
      '.a-build-up-lengths',
    ) as HTMLDetailsElement;
    const exactRows = within(summaries[0]!).getAllByTestId(
      'material-build-up-exact-row',
    );
    expect(exactRows.length).toBeGreaterThan(40);
    expect(details.open).toBe(false);
    expect(
      container.querySelectorAll(
        '.a-build-up-lengths[open] [data-testid="material-build-up-exact-row"]',
      ),
    ).toHaveLength(0);

    const exactTotal = exactRows.reduce(
      (total, row) => total + Number(row.getAttribute('data-total-length-mm')),
      0,
    );
    expect(
      Number(summaries[0]!.getAttribute('data-total-length-mm')),
    ).toBeCloseTo(exactTotal, 7);
    fireEvent.click(within(summaries[0]!).getByText(/Pokaż długości/));
    expect(details.open).toBe(true);
    expect(
      container.querySelectorAll(
        '.a-build-up-lengths[open] [data-testid="material-build-up-exact-row"]',
      ).length,
    ).toBe(exactRows.length);
    expect(useAssembly.getState().projectDocument).toEqual(
      projectBeforeExpansion,
    );
    expect(useAssembly.getState().historyPast).toHaveLength(0);
  });

  it('counts accepted opening headers and segments, then removes them from the schedule on undo', async () => {
    render(<App />);
    builder();
    act(() => {
      useAssembly.getState().addRoofWindow();
      useAssembly.getState().updateRoofWindow('feature:roof-window-1', {
        widthMm: 600,
        position: { uMm: 700, vMm: 1200 },
      });
      useAssembly.setState({ historyPast: [], historyFuture: [] });
      useAssembly.getState().planOpeningFraming('feature:roof-window-1');
      expect(
        useAssembly.getState().applyOpeningFraming('feature:roof-window-1'),
      ).toBe(true);
      useAssembly.getState().setViewPreset('materials');
    });
    await screen.findByTestId('material-schedule');
    expect(
      document.querySelectorAll('[data-member-kind="opening-header"]'),
    ).toHaveLength(2);
    expect(
      document.querySelectorAll('[data-member-kind="rafter-segment"]'),
    ).toHaveLength(2);

    act(() => useAssembly.getState().undo());
    expect(
      document.querySelectorAll(
        '[data-member-kind="opening-header"], [data-member-kind="rafter-segment"]',
      ),
    ).toHaveLength(0);
  });

  it('keeps the Materials preset reachable in a narrow Builder workspace', async () => {
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
    const preset = screen.getByRole('tab', { name: 'Zestawienie' });
    fireEvent.click(preset);
    expect(preset.getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByTestId('material-schedule')).toBeTruthy();
    expect(container.querySelector('.a-material-workspace')).toBeTruthy();
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

  it('opens the Builder-only covering task, creates one canonical manual tile and routes missing battens', async () => {
    const { container } = render(<App />);
    expect(screen.queryByRole('tab', { name: 'Pokrycie' })).toBeNull();
    builder();
    const coveringTab = screen.getByRole('tab', { name: 'Pokrycie' });
    const historyBeforeTask = useAssembly.getState().historyPast.length;
    fireEvent.click(coveringTab);
    expect(useAssembly.getState().historyPast).toHaveLength(historyBeforeTask);
    expect(await screen.findByTestId('covering-empty')).toBeTruthy();

    await addManualCovering('roof-tile');
    expect(await screen.findByTestId('covering-workspace')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '+ Dodaj pokrycie' }),
    ).toBeTruthy();
    expect(container.textContent).not.toContain('assembly.roofTile');
    expect(container.textContent).not.toContain('roof-plane:left');
    expect(container.textContent).not.toContain('manual-standard');
    expect(useAssembly.getState().historyPast).toHaveLength(
      historyBeforeTask + 1,
    );
    expect(
      useAssembly.getState().projectDocument.project.coverings[0],
    ).toMatchObject({
      selectedInstallationModeId: 'manual-standard',
      layoutIntent: { horizontalAlignment: 'centered' },
      product: { technicalSpecSnapshot: { kind: 'roof-tile' } },
    });
    expect(screen.getAllByText(/Włącz i skonfiguruj łaty/)).toHaveLength(2);
    const historyBeforeFit = useAssembly.getState().historyPast.length;
    fireEvent.click(
      screen.getByRole('button', { name: 'Dopasuj łaty automatycznie' }),
    );
    expect(
      useAssembly.getState().projectDocument.project.buildUp.battenLayout,
    ).toMatchObject({
      enabled: true,
      mode: 'auto-from-covering',
      roofPlaneIds: ['roof-plane:left'],
    });
    expect(useAssembly.getState().historyPast).toHaveLength(
      historyBeforeFit + 1,
    );
    expect(screen.queryByText(/Włącz i skonfiguruj łaty/)).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Warstwy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Łaty' }));
    expect(
      screen
        .getByRole('button', { name: 'Automatycznie z pokrycia' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    const autoState = useAssembly.getState();
    const automaticGauge = resolveBattenLayout({
      template: autoState.template,
      layout: autoState.projectDocument.project.buildUp.battenLayout!,
      autoSource: {
        status: 'resolved',
        minimumGaugeMm: 300,
        maximumGaugeMm: 380,
      },
    }).planes[0]!.actualGaugeMm;
    fireEvent.click(screen.getByRole('button', { name: 'Ręcznie' }));
    expect(
      useAssembly.getState().projectDocument.project.buildUp.battenLayout,
    ).toMatchObject({ mode: 'manual' });
    expect(
      useAssembly.getState().projectDocument.project.buildUp.battenLayout!
        .gaugeMm,
    ).toBe(automaticGauge);
    act(() => {
      const coverings = structuredClone(
        useAssembly.getState().projectDocument.project.coverings,
      );
      const spec = coverings[0]!.product.technicalSpecSnapshot;
      if (spec.kind !== 'roof-tile') throw Error('expected tile');
      spec.installationModes[0]!.gaugeRangeMm = { min: 200, max: 250 };
      useAssembly.getState().setCoveringAssignments(coverings);
    });
    expect(
      useAssembly.getState().projectDocument.project.buildUp.battenLayout!
        .gaugeMm,
    ).toBe(automaticGauge);
    expect(screen.getByTestId('batten-layout-status').textContent).toBe(
      'Wymaga uwagi',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Automatycznie z pokrycia' }),
    );
    expect(screen.getByTestId('batten-layout-status').textContent).toBe(
      'Gotowe',
    );
    expect(
      useAssembly.getState().projectDocument.project.buildUp.battenLayout!
        .gaugeMm,
    ).toBe(automaticGauge);
  });

  it('keeps an incomplete manual covering form outside canonical state and history', async () => {
    render(<App />);
    builder();
    fireEvent.click(screen.getByRole('tab', { name: 'Pokrycie' }));
    const assistant = await screen.findByTestId('covering-add-assistant');
    fireEvent.click(
      assistant.querySelector<HTMLButtonElement>(
        '[data-covering-family="roof-tile"]',
      )!,
    );
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
      { target: { value: 'Niedokończony produkt' } },
    );
    expect(useAssembly.getState().projectDocument.project.coverings).toEqual(
      [],
    );
    expect(useAssembly.getState().historyPast).toHaveLength(0);
  });

  it('shows a batten-aware tile grid, opening cut-outs and a separate covering schedule section', async () => {
    render(<App />);
    builder();
    act(() =>
      useAssembly.getState().setBattenLayout({
        enabled: true,
        battenHeightMm: 40,
        battenWidthMm: 60,
        gaugeMm: 350,
        eaveOffsetMm: 250,
      }),
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Pokrycie' }));
    await addManualCovering('roof-tile');
    const gableDrawing = await screen.findByTestId('tile-layout-drawing');
    expect(gableDrawing.style.aspectRatio).not.toBe('');
    expect(
      document
        .querySelector('.a-covering-plane')!
        .getAttribute('points')!
        .trim()
        .split(/\s+/),
    ).toHaveLength(4);
    expect(
      document.querySelectorAll('.a-tile-fragment').length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Krycie efektywne')).toBeTruthy();
    const coveringLayers = screen.getByTestId(
      'result-layer-progress-covering',
    ) as HTMLDetailsElement;
    expect(coveringLayers.open).toBe(false);
    fireEvent.click(within(coveringLayers).getByText('Jak czytać ten wynik'));
    expect(coveringLayers.open).toBe(true);
    expect(within(coveringLayers).getByText('Wykonanie')).toBeTruthy();
    expect(within(coveringLayers).getByText('Rozkrój')).toBeTruthy();
    expect(within(coveringLayers).getByText('Zakup')).toBeTruthy();
    expect(
      coveringLayers.querySelector(
        '[data-layer="cutting"][data-state="unavailable"]',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/cena/i)).toBeNull();
    const tilePositionCount = () =>
      Number(
        [...document.querySelectorAll('.a-covering-counts span')]
          .find((element) => element.textContent?.startsWith('Pozycje'))
          ?.querySelector('b')?.textContent,
      );
    const positionsBeforeOpening = tilePositionCount();

    act(() => {
      useAssembly.getState().addRoofWindow();
      useAssembly.getState().setViewPreset('covering');
    });
    expect(document.querySelector('.a-covering-opening')).toBeTruthy();
    expect(tilePositionCount()).not.toBe(positionsBeforeOpening);

    act(() => useAssembly.getState().setViewPreset('materials'));
    expect(await screen.findByTestId('covering-quantity')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Pokrycia' })).toBeTruthy();
    expect(screen.getByText(/Dachówka —/)).toBeTruthy();
    const coveringSchedule = screen.getByTestId('covering-quantity');
    expect(within(coveringSchedule).getByText(/pozycji krycia/)).toBeTruthy();
    expect(
      coveringSchedule.querySelector(
        '[data-semantic="effective-coverage-position"]',
      ),
    ).toBeTruthy();
    expect(
      within(coveringSchedule).getByText(
        /nie są potwierdzonymi sztukami fizycznymi ani ilością do zamówienia/i,
      ),
    ).toBeTruthy();
    expect(within(coveringSchedule).queryByText(/szt\. do zakupu/i)).toBeNull();
    act(() =>
      useAssembly.getState().setBattenLayout({
        enabled: true,
        battenHeightMm: 40,
        battenWidthMm: 60,
        gaugeMm: 500,
        eaveOffsetMm: 250,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByTestId('covering-quantity')).toBeNull(),
    );
    act(() => useAssembly.getState().undo());
    expect(await screen.findByTestId('covering-quantity')).toBeTruthy();
  });

  it('creates and draws a fixed modular-sheet assignment without exposing technical IDs', async () => {
    render(<App />);
    builder();
    act(() =>
      useAssembly.getState().setBattenLayout({
        enabled: true,
        battenHeightMm: 40,
        battenWidthMm: 60,
        gaugeMm: 350,
        eaveOffsetMm: 250,
      }),
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Pokrycie' }));
    await addManualCovering('modular-sheet');

    expect(await screen.findByTestId('sheet-layout-drawing')).toBeTruthy();
    expect(
      useAssembly.getState().projectDocument.project.coverings[0],
    ).toMatchObject({
      layoutIntent: {
        kind: 'modular-sheet',
        horizontalAlignment: 'centered',
      },
      product: {
        technicalSpecSnapshot: {
          kind: 'modular-sheet',
          effectiveWidthMm: 1145,
          totalWidthMm: 1200,
          lengthModel: { kind: 'fixed-sheet', effectiveLengthMm: 700 },
          moduleLengthMm: 350,
        },
      },
    });
    expect(
      document.querySelectorAll('.a-covering-fragment').length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('tab', { name: /^Lewa połać/ })).toBeTruthy();
    expect(screen.queryByText('manual-standard')).toBeNull();

    act(() => useAssembly.getState().setViewPreset('materials'));
    expect(await screen.findByTestId('covering-quantity')).toBeTruthy();
    expect(
      screen.getByText(/pozycje krycia w efektywnym układzie arkuszy/i),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Pokrycia' })).toBeTruthy();
    expect(screen.getByText(/Blacha modułowa —/)).toBeTruthy();
  });

  it('edits a manual metal product to cut-to-length and keeps drawing detail outside project history', async () => {
    render(<App />);
    builder();
    fireEvent.click(screen.getByRole('tab', { name: 'Pokrycie' }));
    await addManualCovering('modular-sheet');
    await screen.findByTestId('sheet-layout-drawing');
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Parametry / Popraw' })[0]!,
    );
    const inspector = await screen.findByTestId('covering-inspector');
    fireEvent.change(within(inspector).getByLabelText('Format arkusza'), {
      target: { value: 'cut-to-length' },
    });
    expect(
      await screen.findByTestId('cut-to-length-sheet-layout-drawing'),
    ).toBeTruthy();
    const assignment =
      useAssembly.getState().projectDocument.project.coverings[0]!;
    expect(assignment.product.technicalSpecSnapshot).toMatchObject({
      kind: 'modular-sheet',
      lengthModel: { kind: 'cut-to-length' },
    });
    expect(assignment.layoutIntent?.kind).toBe('modular-sheet-cut-to-length');
    expect(
      await within(inspector).findByLabelText(/Minimalna długość arkusza/),
    ).toBeTruthy();
    expect(screen.getByText('Całe pokrycie')).toBeTruthy();
    act(() => {
      const assignments = structuredClone(
        useAssembly.getState().projectDocument.project.coverings,
      );
      assignments[0]!.roofPlaneIds = ['roof-plane:left', 'roof-plane:right'];
      useAssembly.getState().setCoveringAssignments(assignments);
    });
    fireEvent.click(screen.getByRole('tab', { name: /^Prawa połać/ }));
    const totalRuns = Number(
      document.querySelector('.a-covering-count-primary b')?.textContent,
    );
    const selectedRuns = Number(
      document.querySelector('.a-covering-plane-result span b')?.textContent,
    );
    expect(totalRuns).toBeGreaterThan(selectedRuns);
    expect(
      document.querySelector('.a-covering-plane-result')?.textContent,
    ).toContain('Prawa połać');
    const documentBefore = useAssembly.getState().projectDocument;
    const historyBefore = useAssembly.getState().historyPast.length;
    fireEvent.click(screen.getByRole('button', { name: 'Uproszczony' }));
    expect(useAssembly.getState().projectDocument).toBe(documentBefore);
    expect(useAssembly.getState().historyPast).toHaveLength(historyBefore);
    fireEvent.click(screen.getByRole('button', { name: 'Dokładny' }));
    expect(
      document.querySelectorAll('.a-panel-fragment').length,
    ).toBeGreaterThan(0);
    expect(useAssembly.getState().historyPast).toHaveLength(historyBefore);
    act(() => useAssembly.getState().setViewPreset('materials'));
    const schedule = await screen.findByTestId('covering-quantity');
    expect(
      within(schedule).getByText(/Blacha cięta na długość —/),
    ).toBeTruthy();
    expect(
      within(schedule).getByText(/geometryczne przebiegi blachy/),
    ).toBeTruthy();
    expect(
      schedule.querySelector('[data-semantic="geometric-panel-run"]'),
    ).toBeTruthy();
  });

  it('shows a readable catalogue source and detaches revision identity after a technical edit', async () => {
    render(<App />);
    builder();
    fireEvent.click(screen.getByRole('tab', { name: 'Pokrycie' }));
    await addManualCovering('modular-sheet');
    await screen.findByTestId('sheet-layout-drawing');
    act(() => {
      const assignments = structuredClone(
        useAssembly.getState().projectDocument.project.coverings,
      );
      assignments[0]!.product.catalogRef = {
        productId: 'catalog-internal-id',
        technicalRevisionId: 'revision-internal-id',
      };
      assignments[0]!.product.displaySnapshot = {
        manufacturer: 'DEMO Roof',
        familyName: 'Metal 350',
        revisionCode: '2026-01',
      };
      useAssembly.getState().setCoveringAssignments(assignments);
    });
    expect(screen.getAllByText(/DEMO Roof.*2026-01/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('revision-internal-id');
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Parametry / Popraw' })[0]!,
    );
    const inspector = await screen.findByTestId('covering-inspector');
    const width = within(inspector).getByLabelText(
      /Szerokość efektywna/,
    ) as HTMLInputElement;
    fireEvent.change(width, { target: { value: '1110' } });
    fireEvent.blur(width);
    expect(
      useAssembly.getState().projectDocument.project.coverings[0]?.product
        .catalogRef,
    ).toBeUndefined();
    expect(within(inspector).getByText('Parametry ręczne')).toBeTruthy();
  });

  it('creates standing seam, edits its width in Inspector and keeps exact run lengths compact', async () => {
    render(<App />);
    builder();
    fireEvent.click(screen.getByRole('tab', { name: 'Pokrycie' }));
    await addManualCovering('standing-seam');
    expect(
      await screen.findByTestId('standing-seam-layout-drawing'),
    ).toBeTruthy();
    expect(
      screen.getAllByText('Przebiegi geometryczne paneli').length,
    ).toBeGreaterThan(0);
    expect(
      document.querySelectorAll('.a-panel-fragment').length,
    ).toBeGreaterThan(0);
    const columnCount = () =>
      Number(
        document.querySelector('.a-covering-counts span:nth-of-type(2) b')
          ?.textContent,
      );
    const initialColumns = columnCount();
    expect(document.body.textContent).not.toContain('manual-standard');
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Parametry / Popraw' })[0]!,
    );
    const inspector = await screen.findByTestId('standing-seam-editor');
    expect(
      within(inspector).getByLabelText(/Minimalna długość panelu/),
    ).toBeTruthy();
    fireEvent.click(
      within(inspector).getByRole('button', { name: 'Dodaj szerokość krycia' }),
    );
    expect(
      useAssembly.getState().projectDocument.project.coverings[0]!.product
        .technicalSpecSnapshot,
    ).toMatchObject({ kind: 'standing-seam', installationModes: [{}, {}] });
    expect(within(inspector).getAllByRole('radio')).toHaveLength(2);
    const widthInput = within(inspector).getByLabelText(
      /Szerokość efektywna/,
    ) as HTMLInputElement;
    fireEvent.change(widthInput, { target: { value: '250' } });
    fireEvent.blur(widthInput);
    expect(columnCount()).toBeGreaterThan(initialColumns);
    act(() => {
      const coverings = structuredClone(
        useAssembly.getState().projectDocument.project.coverings,
      );
      coverings[0]!.roofPlaneIds = ['roof-plane:left', 'roof-plane:right'];
      useAssembly.getState().setCoveringAssignments(coverings);
    });
    fireEvent.click(screen.getByRole('tab', { name: /^Prawa połać/ }));
    expect(
      document.querySelector('.a-covering-plane-result')?.textContent,
    ).toContain('Prawa połać');
    act(() => useAssembly.getState().setViewPreset('materials'));
    const schedule = await screen.findByTestId('covering-quantity');
    expect(within(schedule).getByText(/Rąbek stojący —/)).toBeTruthy();
    expect(
      within(schedule).getByText(/przebiegów geometrycznych/),
    ).toBeTruthy();
    const lengths = within(schedule)
      .getByText(/Pokaż długości/)
      .closest('details')!;
    expect(lengths.open).toBe(false);
    fireEvent.click(within(lengths).getByText(/Pokaż długości/));
    expect(lengths.open).toBe(true);
    expect(
      useAssembly.getState().projectDocument.project.coverings,
    ).toHaveLength(1);
  });

  it('shows standing-seam opening interruptions and separate short/long run diagnostics', async () => {
    render(<App />);
    builder();
    fireEvent.click(screen.getByRole('tab', { name: 'Pokrycie' }));
    await addManualCovering('standing-seam');
    await screen.findByTestId('standing-seam-layout-drawing');
    act(() => {
      useAssembly.getState().addRoofWindow();
      useAssembly.getState().setViewPreset('covering');
    });
    expect(document.querySelector('.a-covering-opening')).toBeTruthy();
    const setLengths = (minimum: number, maximum: number) =>
      act(() => {
        const coverings = structuredClone(
          useAssembly.getState().projectDocument.project.coverings,
        );
        const spec = coverings[0]!.product.technicalSpecSnapshot;
        if (spec.kind !== 'standing-seam')
          throw new Error('expected standing seam');
        spec.minPanelLengthMm = minimum;
        spec.maxPanelLengthMm = maximum;
        useAssembly.getState().setCoveringAssignments(coverings);
      });
    setLengths(100, 300);
    expect(
      screen.getAllByText(/Wymaga osobnego rozwiązania połączenia poprzecznego/)
        .length,
    ).toBeGreaterThan(0);
    setLengths(100_000, 200_000);
    expect(
      screen.getAllByText(/krótszy od zadanej minimalnej długości panelu/)
        .length,
    ).toBeGreaterThan(0);
  });

  it('fits hip trapezoid and triangular covering planes to their technical frame', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Krokiew narożna' }));
    builder();
    act(() =>
      useAssembly.getState().setBattenLayout({
        enabled: true,
        battenHeightMm: 40,
        battenWidthMm: 60,
        gaugeMm: 350,
        eaveOffsetMm: 250,
      }),
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Pokrycie' }));
    await addManualCovering('roof-tile');
    act(() => {
      const coverings = structuredClone(
        useAssembly.getState().projectDocument.project.coverings,
      );
      coverings[0]!.roofPlaneIds = [
        'roof-plane:left',
        'roof-plane:right',
        'roof-plane:front',
        'roof-plane:rear',
      ];
      useAssembly.getState().setCoveringAssignments(coverings);
    });
    const drawing = await screen.findByTestId('tile-layout-drawing');
    const planePointCount = () =>
      document
        .querySelector('.a-covering-plane')!
        .getAttribute('points')!
        .trim()
        .split(/\s+/).length;
    expect(drawing.style.aspectRatio).not.toBe('');
    expect(planePointCount()).toBe(4);

    fireEvent.click(screen.getByRole('tab', { name: /^Przednia połać/ }));
    expect(planePointCount()).toBe(3);
    expect(drawing.style.aspectRatio).not.toBe('');
  });

  it('labels tile and modular-sheet schedule rows by structured covering kind', async () => {
    render(<App />);
    builder();
    act(() =>
      useAssembly.getState().setBattenLayout({
        enabled: true,
        battenHeightMm: 40,
        battenWidthMm: 60,
        gaugeMm: 350,
        eaveOffsetMm: 250,
      }),
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Pokrycie' }));
    await addManualCovering('roof-tile');
    fireEvent.click(screen.getByRole('button', { name: '+ Dodaj pokrycie' }));
    await addManualCovering('modular-sheet');
    act(() => {
      const coverings = structuredClone(
        useAssembly.getState().projectDocument.project.coverings,
      );
      coverings[0]!.roofPlaneIds = ['roof-plane:left'];
      coverings[1]!.roofPlaneIds = ['roof-plane:right'];
      useAssembly.getState().setCoveringAssignments(coverings);
      useAssembly.getState().setViewPreset('materials');
    });

    expect(await screen.findByTestId('covering-quantity')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Pokrycia' })).toBeTruthy();
    expect(screen.getByText(/Dachówka —/)).toBeTruthy();
    expect(screen.getByText(/Blacha modułowa —/)).toBeTruthy();
  });

  it('marks overlapping primary coverings as conflicted and emits no duplicate quantity', async () => {
    render(<App />);
    builder();
    fireEvent.click(screen.getByRole('tab', { name: 'Pokrycie' }));
    await addManualCovering('roof-tile');
    fireEvent.click(screen.getByRole('button', { name: '+ Dodaj pokrycie' }));
    await addManualCovering('modular-sheet');

    expect(
      screen.getAllByText(/więcej niż jedno pokrycie/i).length,
    ).toBeGreaterThan(0);
    act(() => useAssembly.getState().setViewPreset('materials'));
    expect(screen.queryByTestId('covering-quantity')).toBeNull();
  });
});
