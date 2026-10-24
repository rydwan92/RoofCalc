import { z } from 'zod';
import { PROJECT_ROOF_STRUCTURE_ID } from '@cieslacalc/calculator-core';
import { costScenarioV1Schema, type CostScenario } from '@cieslacalc/cost-core';
import { pruneOrphanSidecars } from './sidecar-prune';

const namespace = 'cieslacalc.costEstimate.v1';
const recordKey = (projectId: string) => `${namespace}.${projectId}`;
/**
 * VNext-10B: estimates of the further structures of a project (ADR-017),
 * one sidecar per project keyed by structure ID. Its own namespace, so the
 * project-ID pruning of the main one never reads it as a project.
 */
const structureNamespace = 'cieslacalc.structureCostEstimate.v1';
const structureRecordKey = (projectId: string) =>
  `${structureNamespace}.${projectId}`;
const structureEstimatesSchema = z.object({
  schemaVersion: z.literal(1),
  estimates: z.record(z.string(), costScenarioV1Schema),
});
type StructureEstimates = {
  schemaVersion: 1;
  estimates: Record<string, CostScenario>;
};

/**
 * The roof a project of one roof holds — and, after it gets more
 * structures, its first one — keeps the project's own estimate key, so an
 * existing estimate stays with its roof.
 */
const isProjectRoof = (structureId?: string) =>
  !structureId || structureId === PROJECT_ROOF_STRUCTURE_ID;

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
 * wrong estimate onto another project; VNext-10B: and by structure ID
 * inside a project of several structures.
 */
export class LocalCostRepository {
  constructor(
    private readonly storage: CostStorage | undefined = browserStorage(),
  ) {}

  async get(
    projectId: string,
    structureId?: string,
  ): Promise<CostScenario | undefined> {
    if (!isProjectRoof(structureId))
      return this.readStructures(projectId).estimates[structureId!];
    try {
      const raw = this.storage?.getItem(recordKey(projectId));
      if (!raw) return undefined;
      return costScenarioV1Schema.parse(JSON.parse(raw)) as CostScenario;
    } catch {
      return undefined;
    }
  }

  async save(
    projectId: string,
    scenario: CostScenario,
    structureId?: string,
  ): Promise<void> {
    const valid = costScenarioV1Schema.parse(scenario) as CostScenario;
    if (!this.storage)
      throw new Error('Lokalny zapis kosztorysu jest niedostępny.');
    if (!isProjectRoof(structureId)) {
      const stored = this.readStructures(projectId);
      this.writeStructures(projectId, {
        ...stored,
        estimates: { ...stored.estimates, [structureId!]: valid },
      });
      return;
    }
    try {
      this.storage.setItem(recordKey(projectId), JSON.stringify(valid));
    } catch {
      throw new Error('Nie udało się zapisać kosztorysu lokalnie.');
    }
  }

  /** Every structure's estimate (undefined: none yet), in the given order. */
  async getMany(
    projectId: string,
    structureIds: readonly string[],
  ): Promise<{ structureId: string; scenario?: CostScenario }[]> {
    return Promise.all(
      structureIds.map(async (structureId) => {
        const scenario = await this.get(projectId, structureId);
        return { structureId, ...(scenario ? { scenario } : {}) };
      }),
    );
  }

  /**
   * A removed structure takes its estimate with it. When the project is a
   * project of one roof again, the remaining structure's estimate becomes
   * the project's own.
   */
  async afterStructureRemoved(
    projectId: string,
    removedId: string,
    remainingSingleId?: string,
  ): Promise<void> {
    if (!this.storage) return;
    const stored = this.readStructures(projectId);
    const estimates = { ...stored.estimates };
    if (isProjectRoof(removedId)) this.storage.removeItem(recordKey(projectId));
    else delete estimates[removedId];
    if (remainingSingleId && !isProjectRoof(remainingSingleId)) {
      const moved = estimates[remainingSingleId];
      delete estimates[remainingSingleId];
      if (moved)
        this.storage.setItem(recordKey(projectId), JSON.stringify(moved));
    }
    this.writeStructures(projectId, { schemaVersion: 1, estimates });
  }

  async delete(projectId: string): Promise<void> {
    this.storage?.removeItem(recordKey(projectId));
    this.storage?.removeItem(structureRecordKey(projectId));
  }

  /**
   * Removes estimates of deleted projects (VNext-6.2; preflight finding 13).
   * Driven by the project record, never by the index — see
   * `pruneOrphanSidecars`.
   */
  prune(): void {
    pruneOrphanSidecars(this.storage, namespace);
    pruneOrphanSidecars(this.storage, structureNamespace);
  }

  private readStructures(projectId: string): StructureEstimates {
    try {
      const raw = this.storage?.getItem(structureRecordKey(projectId));
      if (raw)
        return structureEstimatesSchema.parse(
          JSON.parse(raw),
        ) as StructureEstimates;
    } catch {
      // An unreadable sidecar is treated as no estimates, never as an error.
    }
    return { schemaVersion: 1, estimates: {} };
  }

  private writeStructures(projectId: string, value: StructureEstimates) {
    if (!this.storage) return;
    try {
      if (Object.keys(value.estimates).length === 0)
        this.storage.removeItem(structureRecordKey(projectId));
      else
        this.storage.setItem(
          structureRecordKey(projectId),
          JSON.stringify(value),
        );
    } catch {
      throw new Error('Nie udało się zapisać kosztorysu lokalnie.');
    }
  }
}
