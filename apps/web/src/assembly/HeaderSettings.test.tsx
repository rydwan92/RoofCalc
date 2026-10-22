// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import i18n from '../i18n';
import { HeaderSettings } from './HeaderSettings';
import { useAssembly } from './store';

beforeEach(async () => {
  useAssembly.getState().reset();
  useAssembly.getState().setMode('builder');
  await i18n.changeLanguage('pl');
});
afterEach(cleanup);

describe('header settings (VNext-6.2)', () => {
  it.each([false, true])(
    'mobile=%s: "Przywróć przykład" is one undoable edit with a notice',
    (mobile) => {
      useAssembly.getState().setRoofType('hip');
      const project = useAssembly.getState().projectDocument;
      const history = useAssembly.getState().historyPast.length;
      const restored = vi.fn();
      render(<HeaderSettings mobile={mobile} onExampleRestored={restored} />);
      fireEvent.click(
        screen.getByRole('button', { name: 'Przywróć przykład' }),
      );
      expect(useAssembly.getState().projectDocument.project.roof.type).toBe(
        'gable',
      );
      expect(useAssembly.getState().historyPast).toHaveLength(history + 1);
      expect(restored).toHaveBeenCalledOnce();
      fireEvent.click(screen.getByRole('button', { name: 'Cofnij zmianę' }));
      expect(useAssembly.getState().projectDocument).toEqual(project);
    },
  );

  it('keeps Undo and Redo disabled until there is history', () => {
    render(
      <HeaderSettings mobile={false} onExampleRestored={() => undefined} />,
    );
    expect(
      screen.getByRole('button', { name: 'Cofnij zmianę' }),
    ).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Ponów zmianę' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('switches the display unit without touching the history', () => {
    render(
      <HeaderSettings mobile={false} onExampleRestored={() => undefined} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'm' }));
    expect(useAssembly.getState().unit).toBe('m');
    expect(useAssembly.getState().historyPast).toHaveLength(0);
  });
});
