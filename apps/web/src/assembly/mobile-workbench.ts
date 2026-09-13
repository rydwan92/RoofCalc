import { useEffect, useState } from 'react';

export const mobileWorkbenchQuery =
  '(max-width: 800px), (max-height: 480px) and (pointer: coarse)';

/** Viewport class is local presentation state, never a project value. */
export function useMobileWorkbench() {
  const [mobile, setMobile] = useState(
    () =>
      typeof window !== 'undefined' &&
      !!window.matchMedia?.(mobileWorkbenchQuery).matches,
  );
  useEffect(() => {
    const query = window.matchMedia?.(mobileWorkbenchQuery);
    if (!query) return;
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return mobile;
}
