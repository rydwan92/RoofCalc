// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { createRoofProjectDocument } from '@cieslacalc/calculator-core';
import { App } from '../App';
import i18n from '../i18n';
import { useAssembly } from './store';

beforeEach(async () => {
  localStorage.clear();
  useAssembly.getState().reset();
  useAssembly.getState().setMode('quick');
  localStorage.setItem('cieslacalc.creatorStartSeen.v1', '1');
  await i18n.changeLanguage('pl');
});
afterEach(cleanup);

const zoomLabel = () =>
  screen
    .getByRole('button', { name: 'Powiększ rysunek' })
    .parentElement!.querySelector('span')!.textContent;

describe('VNext-5 drawing camera', () => {
  it('keeps the zoom across tasks for the same roof and starts fitted for another project', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Kreator' }));
    await screen.findByRole(
      'button',
      { name: 'Powiększ rysunek' },
      { timeout: 5000 },
    );
    // The Builder's project session restores asynchronously and refits the
    // camera once; zoom only after it has settled (a race under load).
    await screen.findAllByText('Zapisano lokalnie', {}, { timeout: 5000 });
    expect(zoomLabel()).toBe('100%');
    fireEvent.click(screen.getByRole('button', { name: 'Powiększ rysunek' }));
    fireEvent.click(screen.getByRole('button', { name: 'Powiększ rysunek' }));
    expect(zoomLabel()).toBe('140%');
    // Away to another task and back: the same camera, no history entry.
    const history = useAssembly.getState().historyPast.length;
    act(() => useAssembly.getState().navigatePerspective('covering'));
    act(() => useAssembly.getState().navigatePerspective('project'));
    await screen.findByRole('button', { name: 'Powiększ rysunek' });
    expect(zoomLabel()).toBe('140%');
    expect(useAssembly.getState().historyPast).toHaveLength(history);
    // Another project document starts fitted.
    act(() =>
      useAssembly
        .getState()
        .replaceProjectDocument(
          createRoofProjectDocument(
            structuredClone(useAssembly.getState().template),
          ),
        ),
    );
    act(() => useAssembly.getState().navigatePerspective('covering'));
    act(() => useAssembly.getState().navigatePerspective('project'));
    await screen.findByRole('button', { name: 'Powiększ rysunek' });
    expect(zoomLabel()).toBe('100%');
  });
});
