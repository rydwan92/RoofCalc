import { costScenarioV1Schema, type CostScenario } from '@cieslacalc/cost-core';
import { pruneOrphanSidecars } from './sidecar-prune';

const namespace = 'cieslacalc.costEstimate.v1';
const recordKey = (projectId: string) => `${namespace}.${projectId}`;

type CostStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'
>;

function browserStorage(): CostStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Project-owned sidecar persistence boundary for the cost estimate (§13).
 * Deliberately outside `RoofProjectDocumentV1` and `ProjectRecordV1`: cost is
 * a commerce concern (ADR-005), one layer downstream of the canonical
 * technical document, and never enters roof Undo/Redo history. Keyed by
 * project ID so deleting/duplicating a project cannot silently swap the
 * wrong estimate onto another project.
 */
export class LocalCostRepository {
  constructor(
    private readonly storage: CostStorage | undefined = browserStorage(),
  ) {}

  async get(projectId: string): Promise<CostScenario | undefined> {
    try {
      const raw = this.storage?.getItem(recordKey(projectId));
      if (!raw) return undefined;
      return costScenarioV1Schema.parse(JSON.parse(raw)) as CostScenario;
    } catch {
      return undefined;
    }
  }

  async save(projectId: string, scenario: CostScenario): Promise<void> {
    const valid = costScenarioV1Schema.parse(scenario);
    if (!this.storage)
      throw new Error('Lokalny zapis kosztorysu jest niedostępny.');
    try {
      this.storage.setItem(recordKey(projectId), JSON.stringify(valid));
    } catch {
      throw new Error('Nie udało się zapisać kosztorysu lokalnie.');
    }
  }

  async delete(projectId: string): Promise<void> {
    this.storage?.removeItem(recordKey(projectId));
  }

  /**
   * Removes estimates of deleted projects (VNext-6.2; preflight finding 13).
   * Driven by the project record, never by the index — see
   * `pruneOrphanSidecars`.
   */
  prune(): void {
    pruneOrphanSidecars(this.storage, namespace);
  }
}
