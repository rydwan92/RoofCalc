import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createEmptyCostScenario,
  type CostScenario,
} from '@cieslacalc/cost-core';
import { LocalCostRepository } from '../projects/cost-repository';

/**
 * Loads/saves the sidecar cost estimate for the active project (§13). Cost
 * data never enters roof Undo/Redo or `RoofProjectDocumentV1` — switching
 * projects loads a different, independent scenario.
 */
export function useCostScenario(
  projectId: string | undefined,
): [CostScenario | undefined, (next: CostScenario) => void] {
  const [scenario, setScenario] = useState<CostScenario>();
  const repository = useRef(new LocalCostRepository());

  useEffect(() => {
    let cancelled = false;
    if (!projectId) {
      setScenario(undefined);
      return;
    }
    setScenario(undefined);
    void repository.current.get(projectId).then((stored) => {
      if (cancelled) return;
      setScenario(stored ?? createEmptyCostScenario('PLN'));
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const update = useCallback(
    (next: CostScenario) => {
      setScenario(next);
      if (projectId)
        void repository.current.save(projectId, next).catch(() => undefined);
    },
    [projectId],
  );

  return [scenario, update];
}
