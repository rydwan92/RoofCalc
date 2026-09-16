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
import i18n from '../i18n';
import { useAssembly } from '../assembly/store';
import { mobileWorkbenchQuery } from '../assembly/mobile-workbench';
import { projectStatusLabel } from './ProjectManager';

beforeEach(async () => {
  localStorage.clear();
  useAssembly.getState().reset();
  useAssembly.getState().setMode('quick');
  localStorage.setItem('cieslacalc.creatorStartSeen.v1', '1');
  await i18n.changeLanguage('pl');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openBuilder() {
  fireEvent.click(screen.getByRole('button', { name: 'Kreator' }));
  await screen.findByRole('button', { name: 'Projekty' });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Projekty' }).textContent,
    ).toContain('Projekt 1'),
  );
}

it('manages named local projects without recording roof history', async () => {
  render(<App />);
  await openBuilder();
  expect(screen.queryByText('Sesja robocza · bez zapisu')).toBeNull();
  expect(screen.getAllByText('Zapisano lokalnie').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'Projekty' }));
  let dialog = screen.getByRole('dialog', { name: 'Projekty' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Nowy projekt' }));
  const start = await screen.findByTestId('project-start-assistant');
  // V37: "Od razu do edycji" creates a separate project with defaults.
  fireEvent.click(within(start).getByTestId('project-start-advanced'));
  await waitFor(() =>
    expect(screen.queryByTestId('project-start-assistant')).toBeNull(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Projekty' }));
  dialog = screen.getByRole('dialog', { name: 'Projekty' });
  await waitFor(() =>
    expect(within(dialog).getAllByText('Projekt 2').length).toBeGreaterThan(0),
  );
  expect(useAssembly.getState().historyPast).toHaveLength(0);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Zmień nazwę' }));
  fireEvent.change(within(dialog).getByLabelText('Nazwa projektu'), {
    target: { value: '  Dach A  ' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Zapisz nazwę' }));
  await waitFor(() =>
    expect(within(dialog).getAllByText('Dach A').length).toBeGreaterThan(0),
  );
  fireEvent.click(within(dialog).getByRole('button', { name: 'Duplikuj' }));
  await waitFor(() =>
    expect(
      within(dialog).getAllByText('Dach A — kopia').length,
    ).toBeGreaterThan(0),
  );
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Usuń: Projekt 1' }),
  );
  expect(within(dialog).getByText('Potwierdź usunięcie?')).toBeTruthy();
  fireEvent.click(
    within(dialog).getAllByRole('button', { name: 'Usuń' }).at(-1)!,
  );
  await waitFor(() =>
    expect(within(dialog).queryByText('Projekt 1')).toBeNull(),
  );
  expect(within(dialog).getAllByText('Dach A — kopia').length).toBeGreaterThan(
    0,
  );
  fireEvent.click(within(dialog).getByRole('button', { name: 'Usuń' }));
  expect(within(dialog).getByText('Potwierdź usunięcie?')).toBeTruthy();
  fireEvent.click(
    within(dialog).getAllByRole('button', { name: 'Usuń' }).at(-1)!,
  );
  await waitFor(() =>
    expect(within(dialog).queryByText('Dach A — kopia')).toBeNull(),
  );
  expect(useAssembly.getState().historyPast).toHaveLength(0);
});

it('shows dirty and error statuses and keeps import failures non-destructive', async () => {
  render(<App />);
  await openBuilder();
  act(() => useAssembly.getState().setCanonicalField('roof.runMm', 4550));
  expect(screen.getAllByText('Niezapisane zmiany').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'Projekty' }));
  const dialog = screen.getByRole('dialog', { name: 'Projekty' });
  const before = useAssembly.getState().projectDocument;
  const file = new File(['{bad'], 'bad.cieslacalc.json', {
    type: 'application/json',
  });
  Object.defineProperty(file, 'text', { value: async () => '{bad' });
  fireEvent.change(within(dialog).getByLabelText('Importuj projekt'), {
    target: { files: [file] },
  });
  await within(dialog).findByText(
    'Plik nie jest poprawnym projektem CieślaCalc.',
  );
  expect(useAssembly.getState().projectDocument).toBe(before);
  expect(projectStatusLabel('saving', 'pl')).toBe('Zapisywanie…');
  expect(projectStatusLabel('error', 'pl')).toBe('Błąd zapisu');
});

it('opens the project manager as a usable mobile sheet', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((media: string) => ({
      media,
      matches: media === mobileWorkbenchQuery,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  render(<App />);
  await openBuilder();
  fireEvent.click(screen.getByRole('button', { name: 'Projekty' }));
  const sheet = screen.getByRole('dialog', { name: 'Projekty' });
  expect(
    within(sheet).getByRole('button', { name: 'Nowy projekt' }),
  ).toBeTruthy();
  fireEvent.click(within(sheet).getByRole('button', { name: 'Zamknij' }));
  expect(screen.queryByRole('dialog', { name: 'Projekty' })).toBeNull();
});
