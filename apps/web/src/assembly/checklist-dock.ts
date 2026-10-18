import { useEffect, useState } from 'react';

/**
 * The project checklist ("Sprawdzenie projektu") can stay pinned beside the
 * workbench so the user always sees what is done and what is missing. The
 * choice is a device-local view preference: never part of the project
 * document, its history or its file.
 */
const KEY = 'cieslacalc.checklistPinned.v1';
/** Below this width the drawing would be too narrow beside a docked list. */
export const checklistDockQuery = '(min-width: 1200px)';

export function readChecklistPinned(): boolean {
  try {
    return globalThis.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberChecklistPinned(pinned: boolean): void {
  try {
    if (pinned) globalThis.localStorage.setItem(KEY, '1');
    else globalThis.localStorage.removeItem(KEY);
  } catch {
    // The checklist still opens as a drawer when storage is blocked.
  }
}

export function useChecklistDockAvailable(): boolean {
  const [available, setAvailable] = useState(
    () =>
      typeof window !== 'undefined' &&
      !!window.matchMedia?.(checklistDockQuery).matches,
  );
  useEffect(() => {
    const query = window.matchMedia?.(checklistDockQuery);
    if (!query) return;
    const update = () => setAvailable(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return available;
}
