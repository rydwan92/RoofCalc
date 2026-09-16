// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import i18n from '../../i18n';
import { useAssembly } from '../store';
import { workbenchProjectResolver } from '../workbench-project';
import { TechnicalScene3D } from './TechnicalScene3D';

/**
 * JSDOM has no WebGL, so this file deliberately proves the failure contract
 * rather than the rendering: an unavailable renderer must never break the
 * workbench, and the way back to 2D must exist in normal DOM (§30, §44).
 * Scene correctness is proved renderer-free in `packages/technical-scene`.
 */

beforeEach(async () => {
  await i18n.changeLanguage('pl');
  useAssembly.getState().reset();
  // JSDOM has no 2D or WebGL canvas backend; both it and Three.js log loudly
  // about it. The unavailable path is the behaviour under test, not an error.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

it('states that 3D is unavailable and offers a DOM route back to 2D', () => {
  const skeleton = workbenchProjectResolver.resolve(
    useAssembly.getState().template,
  ).skeleton;
  let returned = false;
  render(
    <div className="assembly-app">
      <TechnicalScene3D
        skeleton={skeleton}
        onReturnTo2D={() => {
          returned = true;
        }}
      />
    </div>,
  );
  const alert = screen.getByRole('alert');
  expect(alert.textContent).toContain('niedostępny');
  const back = screen.getByRole('button', { name: 'Wróć do 2D' });
  fireEvent.click(back);
  expect(returned).toBe(true);
  // The canonical project and its history are untouched by a failed renderer.
  expect(useAssembly.getState().historyPast).toHaveLength(0);
});
