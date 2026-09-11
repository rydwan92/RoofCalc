import { expect, it } from 'vitest';
import {
  DEFAULT_DISPLAY_UNIT,
  loadDisplayUnit,
  saveDisplayUnit,
} from './unit-preference';

function memoryStorage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  };
}

it('defaults safely to centimetres for missing or corrupt preferences', () => {
  expect(DEFAULT_DISPLAY_UNIT).toBe('cm');
  expect(loadDisplayUnit(undefined)).toBe('cm');
  expect(loadDisplayUnit(memoryStorage('{broken'))).toBe('cm');
  expect(loadDisplayUnit(memoryStorage('{"version":1,"unit":"inch"}'))).toBe(
    'cm',
  );
});

it('round-trips every supported display unit through the versioned boundary', () => {
  const storage = memoryStorage();
  for (const unit of ['mm', 'cm', 'm'] as const) {
    saveDisplayUnit(unit, storage);
    expect(loadDisplayUnit(storage)).toBe(unit);
  }
});
