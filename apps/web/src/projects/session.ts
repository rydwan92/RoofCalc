import {
  canonicalProjectDocument,
  createProjectRecord,
  createProjectRecordFor,
  duplicateProject,
  exportProject,
  importProject,
  nextProjectName,
  newProjectId,
  projectRecordV1Schema,
  projectRecordWithDocument,
  projectSummary,
  renameProject,
  type ProjectDocument,
  type ProjectRecord,
  type ProjectRecordV1,
  type ProjectRepository,
  type ProjectSummary,
} from '@cieslacalc/project-core';
import {
  addRoofStructure,
  moveRoofStructure,
  removeRoofStructure,
  renameRoofStructure,
  roofProjectDocumentV2FromV1,
  roofStructure,
  roofStructureDocument,
  serializeRoofProjectDocument,
  serializeRoofProjectDocumentV2,
  structureCornerPlacement,
  structureTransformAtCorner,
  withRoofStructureProject,
  type RoofProjectDocumentV1,
  type StructureCornerPlacement,
} from '@cieslacalc/calculator-core';
import type { RoofTemplateSpec } from '@cieslacalc/timber-model';
import {
  createDefaultProjectDocument,
  useAssembly,
  type AssemblyState,
} from '../assembly/store';
import { LocalProjectRepository } from './local-repository';

export type SaveStatus = 'saved' | 'saving' | 'dirty' | 'error';

/**
 * VNext-10: where a structure stands on the site (ADR-017 §5) — its
 * building corner, plate level and rotation.
 */
export type StructurePlacement = StructureCornerPlacement;

/** One roof structure of the active project, for the structure bar. */
export interface StructureSummary {
  id: string;
  name?: string;
  family: RoofTemplateSpec['type'];
  placement: StructurePlacement;
}

export interface ProjectSessionState {
  active?: ProjectSummary;
  projects: ProjectSummary[];
  saveStatus: SaveStatus;
  initialized: boolean;
  freshProject: boolean;
  error?: string;
  /**
   * VNext-10: the structures of a project of several roofs, in document
   * order; absent for a project of one roof (a V1 record).
   */
  structures?: StructureSummary[];
  /** The structure the workbench edits (session view state, ADR-002). */
  activeStructureId?: string;
}

interface ActiveIdStorage {
  getActiveId(): Promise<string | undefined>;
  setActiveId(id: string | undefined): Promise<void>;
}

/** Browser session state is deliberately separate from roof Undo/Redo. */
export class ProjectSession {
  private state: ProjectSessionState = {
    projects: [],
    saveStatus: 'saved',
    initialized: false,
    freshProject: false,
  };
  private listeners = new Set<() => void>();
  private record?: ProjectRecord;
  /** VNext-10: the structure the workbench edits, when the record is V2. */
  private structureId?: string;
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

  /** Business synchronization carries a normal technical record, never commerce. */
  exportRecord(): ProjectRecord | undefined {
    if (!this.record) return undefined;
    return projectRecordWithDocument(
      this.record,
      this.composed(
        this.workingDocument ?? useAssembly.getState().projectDocument,
      ),
      this.record.updatedAt,
    );
  }

  /**
   * The whole project document with the workbench's structure written
   * back — what is saved, exported and totalled. A project of one roof is
   * its V1 document.
   */
  projectDocument(): ProjectDocument | undefined {
    if (!this.record) return undefined;
    return this.composed(this.currentLocalDocument());
  }

  private currentLocalDocument(): RoofProjectDocumentV1 {
    const assembly = useAssembly.getState();
    return assembly.workbench.mode === 'builder'
      ? assembly.projectDocument
      : (this.workingDocument ?? assembly.projectDocument);
  }

  /** The workbench document written back into the selected structure. */
  private composed(local: RoofProjectDocumentV1): ProjectDocument {
    const record = this.record;
    if (!record || record.schemaVersion === 1 || !this.structureId)
      return local;
    return withRoofStructureProject(record.document, this.structureId, local);
  }

  /** Canonical text of what would be saved (V1 or V2, ADR-017 §1). */
  private serialize(document: ProjectDocument): string {
    const canonical = canonicalProjectDocument(document);
    return canonical.schemaVersion === 1
      ? serializeRoofProjectDocument(canonical)
      : serializeRoofProjectDocumentV2(canonical);
  }

  /** Structure bar state for a record (none for a project of one roof). */
  private structurePatch(): Pick<
    ProjectSessionState,
    'structures' | 'activeStructureId'
  > {
    const record = this.record;
    if (!record || record.schemaVersion === 1)
      return { structures: undefined, activeStructureId: undefined };
    return {
      structures: record.document.structures.map((structure) => ({
        id: structure.id,
        ...(structure.name ? { name: structure.name } : {}),
        family: structure.project.roof.type,
        placement: structureCornerPlacement(structure),
      })),
      activeStructureId: this.structureId,
    };
  }

  async openRemote(record: ProjectRecordV1): Promise<void> {
    const validated = projectRecordV1Schema.parse(record);
    await this.persistNow();
    await this.repository.save(validated);
    await this.activate(validated, true);
    this.update({
      projects: await this.repository.list(),
      freshProject: false,
    });
  }

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
    const serialized = this.serialize(this.composed(assembly.projectDocument));
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

  private async restore(record: ProjectRecord) {
    const local = useAssembly.getState().projectDocument;
    const quickChanged =
      serializeRoofProjectDocument(local) !==
      serializeRoofProjectDocument(createDefaultProjectDocument());
    await this.activate(record, !quickChanged);
    if (
      quickChanged &&
      this.serialize(this.composed(local)) !== this.savedDocument
    ) {
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
      this.update({ initialized: true, freshProject: false });
      return;
    }
    for (const summary of this.state.projects) {
      const record = await this.repository.get(summary.id);
      if (record) {
        await this.restore(record);
        this.update({ initialized: true, freshProject: false });
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
    this.update({ initialized: true, freshProject: true });
  }

  acknowledgeFreshProject(): void {
    this.update({ freshProject: false });
  }

  private async activate(
    record: ProjectRecord,
    replace = true,
    persisted = true,
    remember = true,
  ) {
    this.clearTimer();
    if (this.pending) await this.pending.catch(() => undefined);
    this.suppressed = true;
    this.record = record;
    // A project of several roofs opens on its first structure.
    this.structureId =
      record.schemaVersion === 2
        ? record.document.structures[0]!.id
        : undefined;
    this.activeRemembered = false;
    this.savedDocument = persisted ? this.serialize(record.document) : '';
    if (replace)
      useAssembly
        .getState()
        .replaceProjectDocument(
          record.schemaVersion === 2
            ? roofStructureDocument(record.document, this.structureId!)
            : record.document,
        );
    this.workingDocument = useAssembly.getState().projectDocument;
    this.suppressed = false;
    this.update({
      active: projectSummary(record),
      saveStatus: persisted ? 'saved' : 'dirty',
      error: undefined,
      ...this.structurePatch(),
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
    const document = this.composed(
      assembly.workbench.mode === 'builder'
        ? assembly.projectDocument
        : (this.workingDocument ?? assembly.projectDocument),
    );
    const serialized = this.serialize(document);
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
    const next = projectRecordWithDocument(record, document);
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
        this.serialize(
          this.composed(
            this.workingDocument ?? useAssembly.getState().projectDocument,
          ),
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
      this.serialize(this.composed(useAssembly.getState().projectDocument)) !==
        this.savedDocument
    )
      throw new Error('Najpierw wyeksportuj niezapisane zmiany.');
  }

  /* ---------------------------------------------------------------------- */
  /* VNext-10: the structures of one project (ADR-017). Each operation     */
  /* saves the whole project first and then edits it as one record write;  */
  /* none is a workbench Undo entry.                                       */
  /* ---------------------------------------------------------------------- */

  /** Writes a new document of the active project and shows a structure. */
  private async commitStructures(
    document: ProjectDocument,
    structureId: string | undefined,
  ) {
    const record = this.record;
    if (!record) return;
    const next = projectRecordWithDocument(record, document);
    await this.repository.save(next);
    this.suppressed = true;
    this.record = next;
    this.structureId = next.schemaVersion === 2 ? structureId : undefined;
    this.savedDocument = this.serialize(next.document);
    const local =
      next.schemaVersion === 2
        ? roofStructureDocument(next.document, this.structureId!)
        : next.document;
    if (
      serializeRoofProjectDocument(local) !==
      serializeRoofProjectDocument(useAssembly.getState().projectDocument)
    )
      useAssembly
        .getState()
        .replaceProjectDocument(local, { keepPerspective: true });
    this.workingDocument = useAssembly.getState().projectDocument;
    this.suppressed = false;
    this.update({
      active: projectSummary(next),
      projects: await this.repository.list(),
      saveStatus: 'saved',
      error: undefined,
      ...this.structurePatch(),
    });
  }

  /** The current project as a document of structures (a V1 one becomes one). */
  private async structuresDocument(firstName?: string) {
    await this.flushBeforeChange();
    const document = this.projectDocument();
    if (!document) throw new Error('Brak aktywnego projektu.');
    return document.schemaVersion === 2
      ? document
      : roofProjectDocumentV2FromV1(document, firstName);
  }

  /**
   * Adds a roof structure and opens it in the workbench. A project of one
   * roof becomes a project of structures; its roof is named `firstName`.
   */
  async addStructure(
    local: RoofProjectDocumentV1,
    names: { name?: string; firstName?: string } = {},
  ): Promise<string> {
    const document = await this.structuresDocument(names.firstName);
    const added = addRoofStructure(document, {
      project: local.project,
      ...(names.name ? { name: names.name } : {}),
    });
    await this.commitStructures(added.document, added.structureId);
    return added.structureId;
  }

  /** Opens another structure in the workbench; its Undo starts empty. */
  async selectStructure(id: string): Promise<void> {
    if (id === this.structureId) return;
    const document = await this.structuresDocument();
    if (!document.structures.some((structure) => structure.id === id))
      throw new Error('Nie ma takiej bryły w projekcie.');
    await this.commitStructures(document, id);
  }

  async renameStructure(id: string, name: string): Promise<void> {
    const document = await this.structuresDocument();
    await this.commitStructures(
      renameRoofStructure(document, id, name),
      this.structureId,
    );
  }

  async moveStructure(
    id: string,
    placement: StructurePlacement,
  ): Promise<void> {
    const document = await this.structuresDocument();
    const structure = roofStructure(document, id);
    if (!structure) throw new Error('Nie ma takiej bryły w projekcie.');
    await this.commitStructures(
      moveRoofStructure(
        document,
        id,
        structureTransformAtCorner(structure.project, placement),
      ),
      this.structureId,
    );
  }

  /**
   * Removes a structure. When one unmoved structure remains the project is
   * a project of one roof again (V1, ADR-017 §1).
   */
  async removeStructure(
    id: string,
  ): Promise<{ removedId: string; remainingSingleId?: string }> {
    const document = await this.structuresDocument();
    const next = removeRoofStructure(document, id);
    await this.commitStructures(
      next,
      this.structureId === id ? next.structures[0]!.id : this.structureId,
    );
    // A project of one roof again: its sidecars follow the remaining one.
    return this.record?.schemaVersion === 1
      ? { removedId: id, remainingSingleId: next.structures[0]!.id }
      : { removedId: id };
  }

  async open(id: string): Promise<void> {
    // (VNext-10) A project of structures reopens on its first structure.
    await this.flushBeforeChange();
    if (this.record?.id === id) return;
    const record = await this.repository.get(id);
    if (!record) throw new Error('Nie można otworzyć tego projektu.');
    await this.activate(record);
    this.update({ freshProject: false });
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
    this.update({
      projects: await this.repository.list(),
      initialized: true,
      freshProject: true,
    });
  }

  /**
   * V37: an example (or any prepared document) always becomes a new record.
   * The active project is flushed first and never overwritten.
   */
  async createFromDocument(
    document: ProjectDocument,
    name: string,
  ): Promise<void> {
    await this.flushBeforeChange();
    const projects = await this.repository.list();
    const unique = projects.some((project) => project.name === name)
      ? nextProjectName(projects, name)
      : name;
    const record = createProjectRecordFor(
      structuredClone(document),
      unique,
      await this.uniqueId(),
    );
    await this.repository.save(record);
    await this.activate(record);
    this.update({
      projects: await this.repository.list(),
      initialized: true,
      freshProject: false,
    });
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
    this.update({
      projects: await this.repository.list(),
      freshProject: false,
    });
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
    const current = projectRecordWithDocument(
      this.record,
      this.composed(this.currentLocalDocument()),
      this.record.updatedAt,
    );
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
    this.update({
      projects: await this.repository.list(),
      freshProject: false,
    });
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
