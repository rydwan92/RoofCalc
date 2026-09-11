import type { LengthUnit } from '@cieslacalc/roof-math';

export const DEFAULT_DISPLAY_UNIT: LengthUnit = 'cm';

const preferenceKey = 'cieslacalc.display-unit';
const preferenceVersion = 1;

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): PreferenceStorage | undefined {
  try {
    return typeof globalThis.localStorage === 'undefined'
      ? undefined
      : globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function isLengthUnit(value: unknown): value is LengthUnit {
  return value === 'mm' || value === 'cm' || value === 'm';
}

export function loadDisplayUnit(
  storage: PreferenceStorage | undefined = browserStorage(),
): LengthUnit {
  if (!storage) return DEFAULT_DISPLAY_UNIT;
  try {
    const parsed = JSON.parse(storage.getItem(preferenceKey) ?? 'null') as {
      version?: unknown;
      unit?: unknown;
    } | null;
    return parsed?.version === preferenceVersion && isLengthUnit(parsed.unit)
      ? parsed.unit
      : DEFAULT_DISPLAY_UNIT;
  } catch {
    return DEFAULT_DISPLAY_UNIT;
  }
}

export function saveDisplayUnit(
  unit: LengthUnit,
  storage: PreferenceStorage | undefined = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(
      preferenceKey,
      JSON.stringify({ version: preferenceVersion, unit }),
    );
  } catch {
    // A blocked or full preference store must never break calculation.
  }
}
