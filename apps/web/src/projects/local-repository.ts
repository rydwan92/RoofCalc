import {
  projectRecordV1Schema,
  projectSummary,
  sortProjectSummaries,
  type ProjectRecordV1,
  type ProjectRepository,
  type ProjectSummary,
} from '@cieslacalc/project-core';
import { z } from 'zod';

const namespace = 'cieslacalc.projects.v1';
const indexKey = `${namespace}.index`;
const recordKey = (id: string) => `${namespace}.record.${id}`;
const activeKey = 'cieslacalc.activeProject.v1';
const indexSchema = z.object({
  schemaVersion: z.literal(1),
  projects: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().trim().min(1),
      createdAt: z.string().datetime({ offset: true }),
      updatedAt: z.string().datetime({ offset: true }),
    }),
  ),
});

type ProjectStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'
>;

function browserStorage(): ProjectStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** Versioned browser adapter. All project storage access is confined here. */
export class LocalProjectRepository implements ProjectRepository {
  constructor(
    private readonly storage: ProjectStorage | undefined = browserStorage(),
  ) {}

  private requiredStorage(): ProjectStorage {
    if (!this.storage) throw new Error('Lokalny zapis jest niedostępny.');
    return this.storage;
  }

  private recoveredIndex(): ProjectSummary[] {
    const storage = this.requiredStorage();
    const summaries: ProjectSummary[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(`${namespace}.record.`)) continue;
      try {
        const raw = storage.getItem(key);
        if (!raw) continue;
        summaries.push(
          projectSummary(projectRecordV1Schema.parse(JSON.parse(raw))),
        );
      } catch {
        // One damaged record must not hide the others.
      }
    }
    return sortProjectSummaries(summaries);
  }

  private readIndex(): ProjectSummary[] {
    const raw = this.requiredStorage().getItem(indexKey);
    if (!raw) return this.recoveredIndex();
    try {
      return sortProjectSummaries(indexSchema.parse(JSON.parse(raw)).projects);
    } catch {
      return this.recoveredIndex();
    }
  }

  async list(): Promise<ProjectSummary[]> {
    try {
      return this.readIndex();
    } catch {
      return [];
    }
  }

  async get(id: string): Promise<ProjectRecordV1 | undefined> {
    try {
      const raw = this.requiredStorage().getItem(recordKey(id));
      if (!raw) return undefined;
      const record = projectRecordV1Schema.parse(JSON.parse(raw));
      return record.id === id ? record : undefined;
    } catch {
      return undefined;
    }
  }

  async save(record: ProjectRecordV1): Promise<void> {
    const valid = projectRecordV1Schema.parse(record);
    try {
      const storage = this.requiredStorage();
      const previous = await this.list();
      storage.setItem(recordKey(valid.id), JSON.stringify(valid));
      storage.setItem(
        indexKey,
        JSON.stringify({
          schemaVersion: 1,
          projects: sortProjectSummaries([
            ...previous.filter((item) => item.id !== valid.id),
            projectSummary(valid),
          ]),
        }),
      );
    } catch {
      throw new Error('Nie udało się zapisać projektu lokalnie.');
    }
  }

  async delete(id: string): Promise<void> {
    const storage = this.requiredStorage();
    const previous = await this.list();
    storage.removeItem(recordKey(id));
    storage.setItem(
      indexKey,
      JSON.stringify({
        schemaVersion: 1,
        projects: previous.filter((item) => item.id !== id),
      }),
    );
    if ((await this.getActiveId()) === id) storage.removeItem(activeKey);
  }

  async getActiveId(): Promise<string | undefined> {
    try {
      return this.requiredStorage().getItem(activeKey) || undefined;
    } catch {
      return undefined;
    }
  }

  async setActiveId(id: string | undefined): Promise<void> {
    const storage = this.requiredStorage();
    if (id) storage.setItem(activeKey, id);
    else storage.removeItem(activeKey);
  }
}
