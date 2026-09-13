import {
  createProjectRecord,
  duplicateProject,
  exportProject,
  importProject,
  nextProjectName,
  newProjectId,
  projectSummary,
  renameProject,
  type ProjectRecordV1,
  type ProjectRepository,
  type ProjectSummary,
} from '@cieslacalc/project-core';
import {
  serializeRoofProjectDocument,
  type RoofProjectDocumentV1,
} from '@cieslacalc/calculator-core';
import {
  createDefaultProjectDocument,
  useAssembly,
  type AssemblyState,
} from '../assembly/store';
import { LocalProjectRepository } from './local-repository';

export type SaveStatus = 'saved' | 'saving' | 'dirty' | 'error';
export interface ProjectSessionState {
  active?: ProjectSummary;
  projects: ProjectSummary[];
  saveStatus: SaveStatus;
  error?: string;
}

interface ActiveIdStorage {
  getActiveId(): Promise<string | undefined>;
  setActiveId(id: string | undefined): Promise<void>;
}

/** Browser session state is deliberately separate from roof Undo/Redo. */
export class ProjectSession {
  private state: ProjectSessionState = { projects: [], saveStatus: 'saved' };
  private listeners = new Set<() => void>();
  private record?: ProjectRecordV1;
  private workingDocument?: RoofProjectDocumentV1;
  private activeRemembered = false;
  private savedDocument = '';
  private timer?: ReturnType<typeof setTimeout>;
  private pending?: Promise<void>;
  private initialization?: Promise<void>;
  private suppressed = false;
  private unsubscribeAssembly?: () => void;

  constructor(
    private readonly repository: ProjectRepository &
      ActiveIdStorage = new LocalProjectRepository(),
    private readonly debounceMs = 800,
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  snapshot = () => this.state;

  private update(patch: Partial<ProjectSessionState>) {
    if (
      Object.entries(patch).every(
        ([key, value]) =>
          this.state[key as keyof ProjectSessionState] === value,
      )
    )
      return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule() {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.persistNow().catch(() => undefined);
    }, this.debounceMs);
  }

  private async uniqueId(candidate = newProjectId()): Promise<string> {
    const indexed = new Set(
      (await this.repository.list()).map((item) => item.id),
    );
    let id = candidate;
    let suffix = 0;
    while (indexed.has(id) || (await this.repository.get(id)))
      id = `${candidate}-${++suffix}`;
    return id;
  }

  private onAssemblyChange = (
    assembly: AssemblyState,
    previous: AssemblyState,
  ) => {
    if (this.suppressed || !this.record) return;
    if (
      assembly.projectDocument === previous.projectDocument &&
      assembly.activeTransaction === previous.activeTransaction &&
      assembly.workbench.mode === previous.workbench.mode
    )
      return;
    if (assembly.workbench.mode !== 'builder') {
      if (
        previous.workbench.mode === 'builder' &&
        this.state.saveStatus === 'dirty'
      ) {
        if (assembly.activeTransaction)
          useAssembly.getState().commitTransaction();
        void this.persistNow().catch(() => undefined);
      }
      return;
    }
    this.workingDocument = assembly.projectDocument;
    const serialized = serializeRoofProjectDocument(assembly.projectDocument);
    if (serialized === this.savedDocument) {
      this.clearTimer();
      if (!this.pending && this.state.saveStatus === 'dirty')
        this.update({ saveStatus: 'saved', error: undefined });
      return;
    }
    if (this.state.saveStatus !== 'dirty')
      this.update({ saveStatus: 'dirty', error: undefined });
    if (assembly.activeTransaction) this.clearTimer();
    else this.schedule();
  };

  private async restore(record: ProjectRecordV1) {
    const current = serializeRoofProjectDocument(
      useAssembly.getState().projectDocument,
    );
    const quickChanged =
      current !== serializeRoofProjectDocument(createDefaultProjectDocument());
    await this.activate(record, !quickChanged);
    if (quickChanged && current !== this.savedDocument) {
      this.update({ saveStatus: 'dirty' });
      this.schedule();
    }
  }

  initialize(): Promise<void> {
    this.initialization ??= this.initializeImpl();
    return this.initialization;
  }

  private async initializeImpl(): Promise<void> {
    this.unsubscribeAssembly = useAssembly.subscribe(this.onAssemblyChange);
    this.update({ projects: await this.repository.list() });
    const activeId = await this.repository.getActiveId();
    const stored = activeId ? await this.repository.get(activeId) : undefined;
    if (stored) {
      await this.restore(stored);
      return;
    }
    for (const summary of this.state.projects) {
      const record = await this.repository.get(summary.id);
      if (record) {
        await this.restore(record);
        return;
      }
    }
    // First Quick -> Builder handoff retains the exact current technical inputs.
    const record = createProjectRecord(
      useAssembly.getState().projectDocument,
      nextProjectName(this.state.projects, 'Projekt'),
      await this.uniqueId(),
    );
    let saved = false;
    try {
      await this.repository.save(record);
      saved = true;
    } catch (error) {
      this.update({ error: errorMessage(error) });
    }
    await this.activate(record, false, saved, saved);
    if (saved) this.update({ projects: await this.repository.list() });
    else
      this.update({
        saveStatus: 'error',
        error: 'Lokalny zapis jest niedostępny.',
      });
  }

  private async activate(
    record: ProjectRecordV1,
    replace = true,
    persisted = true,
    remember = true,
  ) {
    this.clearTimer();
    if (this.pending) await this.pending.catch(() => undefined);
    this.suppressed = true;
    this.record = record;
    this.activeRemembered = false;
    this.savedDocument = persisted
      ? serializeRoofProjectDocument(record.document)
      : '';
    if (replace) useAssembly.getState().replaceProjectDocument(record.document);
    this.workingDocument = useAssembly.getState().projectDocument;
    this.suppressed = false;
    this.update({
      active: projectSummary(record),
      saveStatus: persisted ? 'saved' : 'dirty',
      error: undefined,
    });
    if (remember) {
      try {
        await this.repository.setActiveId(record.id);
        this.activeRemembered = true;
      } catch {
        this.update({
          saveStatus: 'error',
          error: 'Nie można zapamiętać aktywnego projektu. Wyeksportuj kopię.',
        });
      }
    }
  }

  async persistNow(): Promise<void> {
    this.clearTimer();
    if (this.pending) await this.pending.catch(() => undefined);
    const record = this.record;
    if (!record) return;
    const assembly = useAssembly.getState();
    if (assembly.activeTransaction) {
      this.schedule();
      return;
    }
    const document =
      assembly.workbench.mode === 'builder'
        ? assembly.projectDocument
        : (this.workingDocument ?? assembly.projectDocument);
    const serialized = serializeRoofProjectDocument(document);
    if (serialized === this.savedDocument) {
      if (!this.activeRemembered) {
        try {
          await this.repository.setActiveId(record.id);
          this.activeRemembered = true;
          this.update({ saveStatus: 'saved', error: undefined });
        } catch {
          this.update({
            saveStatus: 'error',
            error:
              'Nie można zapamiętać aktywnego projektu. Wyeksportuj kopię.',
          });
        }
      }
      return;
    }
    const next: ProjectRecordV1 = {
      ...record,
      updatedAt: new Date().toISOString(),
      document: structuredClone(document),
    };
    this.update({ saveStatus: 'saving', error: undefined });
    const write = this.repository.save(next);
    this.pending = write;
    let failed = false;
    try {
      await write;
      if (this.record?.id !== record.id) return;
      this.record = next;
      this.savedDocument = serialized;
      if (!this.activeRemembered) {
        try {
          await this.repository.setActiveId(next.id);
          this.activeRemembered = true;
        } catch {
          this.update({
            saveStatus: 'error',
            error:
              'Nie można zapamiętać aktywnego projektu. Wyeksportuj kopię.',
          });
        }
      }
      this.update({
        active: projectSummary(next),
        projects: await this.repository.list(),
        saveStatus: this.activeRemembered ? 'saved' : 'error',
      });
    } catch (error) {
      failed = true;
      this.update({ saveStatus: 'error', error: errorMessage(error) });
      throw error;
    } finally {
      this.pending = undefined;
      if (
        !failed &&
        this.record?.id === record.id &&
        serializeRoofProjectDocument(
          this.workingDocument ?? useAssembly.getState().projectDocument,
        ) !== this.savedDocument
      ) {
        if (this.state.saveStatus !== 'error')
          this.update({ saveStatus: 'dirty' });
        this.schedule();
      }
    }
  }

  private async flushBeforeChange() {
    if (this.initialization) await this.initialization;
    if (useAssembly.getState().activeTransaction)
      useAssembly.getState().commitTransaction();
    if (this.record && this.state.saveStatus !== 'saved')
      await this.persistNow();
    if (
      this.state.saveStatus === 'error' &&
      serializeRoofProjectDocument(useAssembly.getState().projectDocument) !==
        this.savedDocument
    )
      throw new Error('Najpierw wyeksportuj niezapisane zmiany.');
  }

  async open(id: string): Promise<void> {
    await this.flushBeforeChange();
    if (this.record?.id === id) return;
    const record = await this.repository.get(id);
    if (!record) throw new Error('Nie można otworzyć tego projektu.');
    await this.activate(record);
  }

  async create(): Promise<void> {
    await this.flushBeforeChange();
    const projects = await this.repository.list();
    const record = createProjectRecord(
      createDefaultProjectDocument(),
      nextProjectName(projects, 'Projekt'),
      await this.uniqueId(),
    );
    await this.repository.save(record);
    await this.activate(record);
    this.update({ projects: await this.repository.list() });
  }

  async rename(name: string): Promise<void> {
    if (!this.record) return;
    await this.flushBeforeChange();
    const record = renameProject(this.record, name);
    await this.repository.save(record);
    this.record = record;
    this.update({
      active: projectSummary(record),
      projects: await this.repository.list(),
    });
  }

  async duplicate(): Promise<void> {
    if (!this.record) return;
    await this.flushBeforeChange();
    const copy = duplicateProject(
      this.record,
      `${this.record.name} — kopia`,
      await this.uniqueId(),
    );
    await this.repository.save(copy);
    await this.activate(copy);
    this.update({ projects: await this.repository.list() });
  }

  async delete(id: string): Promise<void> {
    if (this.initialization) await this.initialization;
    const wasActive = this.record?.id === id;
    await this.repository.delete(id);
    const remaining = await this.repository.list();
    this.update({ projects: remaining });
    if (!wasActive) return;
    for (const summary of remaining) {
      const record = await this.repository.get(summary.id);
      if (record) {
        await this.activate(record);
        return;
      }
    }
    const fresh = createProjectRecord(
      createDefaultProjectDocument(),
      nextProjectName(remaining, 'Projekt'),
      await this.uniqueId(),
    );
    try {
      await this.repository.save(fresh);
      await this.activate(fresh);
      this.update({ projects: await this.repository.list() });
    } catch (error) {
      await this.activate(fresh, true, false, false);
      this.update({ saveStatus: 'error', error: errorMessage(error) });
    }
  }

  exportActive(): { name: string; contents: string } | undefined {
    if (!this.record) return undefined;
    const current = {
      ...this.record,
      document: structuredClone(
        useAssembly.getState().workbench.mode === 'builder'
          ? useAssembly.getState().projectDocument
          : (this.workingDocument ?? useAssembly.getState().projectDocument),
      ),
    };
    const safeName = current.name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    return {
      name: `${safeName || 'projekt'}.cieslacalc.json`,
      contents: exportProject(current),
    };
  }

  async import(contents: string): Promise<void> {
    // Parse before touching the current project or its Undo history.
    const imported = importProject(contents, {
      legacyName: 'Importowany projekt',
    });
    await this.flushBeforeChange();
    const localRecord = { ...imported, id: await this.uniqueId(imported.id) };
    await this.repository.save(localRecord);
    await this.activate(localRecord);
    this.update({ projects: await this.repository.list() });
  }

  async dispose(): Promise<void> {
    this.unsubscribeAssembly?.();
    this.clearTimer();
    if (this.state.saveStatus === 'dirty')
      await this.persistNow().catch(() => undefined);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Błąd zapisu projektu.';
}
