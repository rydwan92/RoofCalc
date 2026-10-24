// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import i18n from '../i18n';
import { MonoPitchWorkspace } from './MonoPitchWorkspace';

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage('pl');
});
afterEach(cleanup);

const field = (id: string) =>
  document.getElementById(`mono-pitch.${id}`) as HTMLInputElement;
const result = (id: string) =>
  screen.getByTestId(`mono-pitch-result-${id}`).textContent;

describe('mono-pitch workspace (VNext-7B-3)', () => {
  it('shows the reference roof in the chosen unit, computed by the shared solver', () => {
    render(<MonoPitchWorkspace unit="cm" onClose={() => undefined} />);
    expect(result('rafters')).toContain('8 szt. · co 85,7 cm');
    expect(result('stock')).toContain('502,3 cm');
    expect(result('plates')).toContain('103,4 cm');
    expect(field('runMm').value).toBe('400');
    expect(screen.getByTestId('mono-pitch-section')).toBeTruthy();
    const rows = [
      ...screen.getByTestId('mono-pitch-list').querySelectorAll('tr'),
    ].map((row) => row.getAttribute('data-row'));
    expect(rows).toEqual([
      'rafter',
      'low-plate',
      'high-support',
      'battens',
      'counter-battens',
      'membrane',
    ]);
  });

  it('recalculates as you type, decimal comma included', () => {
    render(<MonoPitchWorkspace unit="cm" onClose={() => undefined} />);
    fireEvent.change(field('pitchDeg'), { target: { value: '25' } });
    expect(result('plates')).toContain('180 cm');
    fireEvent.change(field('runMm'), { target: { value: '400,0' } });
    expect(result('plates')).toContain('180 cm');
  });

  it('marks the blocking field and keeps the last valid result', () => {
    render(<MonoPitchWorkspace unit="cm" onClose={() => undefined} />);
    fireEvent.change(field('lowSeatMm'), { target: { value: '20' } });
    expect(field('lowSeatMm').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe(
      'Siedzisko jest szersze niż podpora.',
    );
    expect(screen.getByTestId('mono-pitch-invalid')).toBeTruthy();
    expect(result('stock')).toContain('502,3 cm');
    fireEvent.change(field('lowSeatMm'), { target: { value: 'abc' } });
    expect(field('lowSeatMm').getAttribute('aria-invalid')).toBe('true');
  });

  it('against a higher wall: a ledger, no high overhang field', () => {
    render(<MonoPitchWorkspace unit="cm" onClose={() => undefined} />);
    expect(field('highOverhangMm')).toBeTruthy();
    fireEvent.click(screen.getByTestId('mono-pitch-top-abutment'));
    expect(field('highOverhangMm')).toBeNull();
    expect(result('plates')).toContain('łata przyścienna');
    expect(result('stock')).toContain('471,2 cm');
  });

  it('restores the example, remembers the draft and closes with Escape', () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <MonoPitchWorkspace unit="cm" onClose={onClose} />,
    );
    fireEvent.change(field('pitchDeg'), { target: { value: '30' } });
    unmount();
    render(<MonoPitchWorkspace unit="cm" onClose={onClose} />);
    expect(field('pitchDeg').value).toBe('30');
    fireEvent.click(screen.getByTestId('mono-pitch-restore'));
    expect(field('pitchDeg').value).toBe('15');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows millimetres when the app works in millimetres', () => {
    render(<MonoPitchWorkspace unit="mm" onClose={() => undefined} />);
    expect(field('runMm').value).toBe('4000');
    expect(result('stock')).toContain('5022,9 mm');
  });
});

describe('intermediate purlins in the workspace (VNext-7B-5)', () => {
  it('adds a purlin: one more notch, P1 in the schedule, rafter unchanged', () => {
    render(<MonoPitchWorkspace unit="cm" onClose={() => undefined} />);
    fireEvent.click(screen.getByTestId('mono-pitch-add-purlin'));
    fireEvent.change(field('purlins.0.positionMm'), {
      target: { value: '200' },
    });
    const cuts = screen.getByTestId('mono-pitch-cuts').textContent ?? '';
    expect(cuts).toContain('Zacięcie na płatwi P1');
    expect(cuts).toContain('od A: 258,8 cm');
    expect(
      screen.getByTestId('mono-pitch-list').querySelector('[data-row="purlin"]')
        ?.textContent,
    ).toContain('Płatew P1 · 10 × 16 cm');
    expect(result('stock')).toContain('502,3 cm');
  });

  it('names a purlin outside the span at its own field, then removes it', () => {
    render(<MonoPitchWorkspace unit="cm" onClose={() => undefined} />);
    fireEvent.click(screen.getByTestId('mono-pitch-add-purlin'));
    fireEvent.change(field('purlins.0.positionMm'), { target: { value: '5' } });
    expect(field('purlins.0.positionMm').getAttribute('aria-invalid')).toBe(
      'true',
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'Płatew musi leżeć między murłatami.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Usuń płatew P1' }));
    expect(screen.queryByTestId('mono-pitch-purlin-0')).toBeNull();
    expect(screen.queryByTestId('mono-pitch-invalid')).toBeNull();
  });
});

describe('site measurement (VNext-7C)', () => {
  it('takes the pitch from the plate tops and keeps the roof when switching', () => {
    render(<MonoPitchWorkspace unit="cm" onClose={() => undefined} />);
    fireEvent.click(screen.getByTestId('mono-pitch-source-plate-tops'));
    expect(field('pitchDeg')).toBeNull();
    // The tops start where the 15° roof puts them: same plates, same rafter.
    expect(field('highPlateTopMm').value).toBe('363.4');
    expect(result('plates')).toContain('103,4 cm');
    expect(
      screen.getByTestId('mono-pitch-derived-pitch').textContent,
    ).toContain('15');
    fireEvent.change(field('highPlateTopMm'), { target: { value: '360' } });
    expect(result('plates')).toContain('100 cm');
    fireEvent.change(field('highPlateTopMm'), { target: { value: '250' } });
    expect(screen.getByRole('alert').textContent).toBe(
      'Podpora górna musi być wyżej niż dolna.',
    );
    fireEvent.change(field('highPlateTopMm'), { target: { value: '360' } });
    fireEvent.click(screen.getByTestId('mono-pitch-source-angle'));
    // atan(1000 / 3860) = 14.524°, kept to two decimals.
    expect(field('pitchDeg').value).toBe('14.52');
  });
});

describe('from calculation to project (VNext-8)', () => {
  it('hands the computed roof to the project, and not while a field is wrong', () => {
    const onCreateProject = vi.fn();
    render(
      <MonoPitchWorkspace
        unit="cm"
        onClose={() => undefined}
        onCreateProject={onCreateProject}
      />,
    );
    const create = screen.getByTestId('mono-pitch-create-project');
    fireEvent.change(field('lowSeatMm'), { target: { value: '20' } });
    expect(create.hasAttribute('disabled')).toBe(true);
    fireEvent.change(field('lowSeatMm'), { target: { value: '10' } });
    fireEvent.click(create);
    expect(onCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        template: expect.objectContaining({
          type: 'mono-pitch',
          runMm: 4000,
          pitchDeg: 15,
        }),
      }),
    );
  });
});
