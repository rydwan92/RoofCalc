import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createProjectRecord } from '@cieslacalc/project-core';
import { createDefaultProjectDocument, useAssembly } from '../assembly/store';
import { LocalProjectRepository } from './local-repository';
import { MemoryStorage } from './memory-storage';
import { ProjectSession } from './session';

let storage: MemoryStorage;
let repository: LocalProjectRepository;
let session: ProjectSession;

beforeEach(() => {
  storage = new MemoryStorage();
  repository = new LocalProjectRepository(storage);
  session = new ProjectSession(repository, 800);
  useAssembly.getState().reset();
  useAssembly.getState().setMode('builder');
  useAssembly.getState().setUnit('mm');
});
afterEach(async () => {
  vi.useRealTimers();
  await session.dispose();
  vi.unstubAllGlobals();
});

it('creates, renames, duplicates, opens and deletes with deterministic active fallback', async () => {
  await session.initialize();
  const first = session.snapshot().active!;
  expect(first.name).toBe('Projekt 1');
  await session.rename('  Dach domu  ');
  expect(session.snapshot().active?.id).toBe(first.id);
  expect(session.snapshot().active?.name).toBe('Dach domu');
  await session.duplicate();
  const copy = session.snapshot().active!;
  expect(copy.id).not.toBe(first.id);
  expect(copy.name).toBe('Dach domu — kopia');
  await session.open(first.id);
  expect(session.snapshot().active?.id).toBe(first.id);
  await session.delete(first.id);
  expect(session.snapshot().active?.id).toBe(copy.id);
  await session.delete(copy.id);
  expect(session.snapshot().active?.id).toBeTruthy();
  expect(session.snapshot().active?.id).not.toBe(copy.id);
  expect(await repository.getActiveId()).toBe(session.snapshot().active?.id);
  await session.create();
  expect(session.snapshot().active?.name).toBe('Projekt 2');
});

it('opens atomically, resets history and transient tools while preserving display unit', async () => {
  await session.initialize();
  const original = session.snapshot().active!;
  useAssembly.getState().setCanonicalField('roof.runMm', 4450);
  await session.persistNow();
  await session.create();
  useAssembly.getState().setUnit('m');
  useAssembly.getState().setCanonicalField('roof.runMm', 5100);
  useAssembly.getState().setScheduleSelection('row-1', 'instance-1');
  useAssembly.getState().beginRoofWindowPlacement();
  useAssembly.getState().toggleMeasurement();
  useAssembly.getState().beginTransaction();
  expect(useAssembly.getState().historyPast.length).toBeGreaterThan(0);
  useAssembly.getState().commitTransaction();
  await session.open(original.id);
  const state = useAssembly.getState();
  expect(state.template.halfRunMm).toBe(4450);
  expect(state.historyPast).toEqual([]);
  expect(state.historyFuture).toEqual([]);
  expect(state.activeTransaction).toBeUndefined();
  expect(state.workbench.placementTool).toBeUndefined();
  expect(state.workbench.measurement).toBeUndefined();
  expect(state.workbench.selectedScheduleRowId).toBeUndefined();
  expect(state.unit).toBe('m');
});

it('debounces canonical edits, waits for transaction commit and ignores view/unit changes', async () => {
  await session.initialize();
  const active = session.snapshot().active!;
  const before = storage.getItem(`cieslacalc.projects.v1.record.${active.id}`);
  vi.useFakeTimers();
  useAssembly.getState().setUnit('cm');
  useAssembly.getState().setViewPreset('materials');
  await vi.advanceTimersByTimeAsync(1000);
  expect(storage.getItem(`cieslacalc.projects.v1.record.${active.id}`)).toBe(
    before,
  );
  useAssembly.getState().beginTransaction();
  useAssembly.getState().setCanonicalField('roof.runMm', 4300);
  useAssembly.getState().setCanonicalField('roof.runMm', 4400);
  expect(session.snapshot().saveStatus).toBe('dirty');
  await vi.advanceTimersByTimeAsync(1000);
  expect(storage.getItem(`cieslacalc.projects.v1.record.${active.id}`)).toBe(
    before,
  );
  useAssembly.getState().commitTransaction();
  expect(useAssembly.getState().historyPast).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(800);
  expect(session.snapshot().saveStatus).toBe('saved');
  expect(
    (await repository.get(active.id))?.document.project.roof.halfRunMm,
  ).toBe(4400);
  expect(useAssembly.getState().historyPast).toHaveLength(1);
});

it('preserves an editable document and shows error when storage fails', async () => {
  await session.initialize();
  storage.failWrites = true;
  useAssembly.getState().setCanonicalField('roof.runMm', 4600);
  await expect(session.persistNow()).rejects.toThrow();
  expect(session.snapshot().saveStatus).toBe('error');
  expect(useAssembly.getState().template.halfRunMm).toBe(4600);
  expect(session.exportActive()?.contents).toContain('4600');
  storage.failWrites = false;
});

it('does not claim a first project was saved when local storage is unavailable', async () => {
  await session.dispose();
  storage.failWrites = true;
  session = new ProjectSession(repository);
  await session.initialize();
  expect(session.snapshot().active?.name).toBe('Projekt 1');
  expect(session.snapshot().saveStatus).toBe('error');
  expect(await repository.getActiveId()).toBeUndefined();
  useAssembly.getState().setViewPreset('materials');
  expect(session.snapshot().saveStatus).toBe('error');
  storage.failWrites = false;
  await session.persistNow();
  expect(session.snapshot().saveStatus).toBe('saved');
  expect(await repository.getActiveId()).toBe(session.snapshot().active?.id);
});

it('validates import before replacing and gives imported archives a new local ID', async () => {
  await session.initialize();
  const original = session.snapshot().active!;
  const document = structuredClone(useAssembly.getState().projectDocument);
  const archive = session.exportActive()!.contents;
  await expect(session.import('{bad')).rejects.toThrow();
  expect(session.snapshot().active?.id).toBe(original.id);
  expect(useAssembly.getState().projectDocument).toEqual(document);
  await session.import(archive);
  expect(session.snapshot().active?.id).not.toBe(original.id);
  expect(useAssembly.getState().projectDocument).toEqual(document);
  await session.import(JSON.stringify(document));
  expect(session.snapshot().active?.name).toBe('Importowany projekt');
  expect(session.snapshot().projects).toHaveLength(3);
});

it('never overwrites a local record when an imported ID collides', async () => {
  await session.initialize();
  const original = session.snapshot().active!;
  const archive = session.exportActive()!.contents;
  vi.stubGlobal('crypto', { randomUUID: () => original.id });
  await session.import(archive);
  expect(session.snapshot().active?.id).toBe(`${original.id}-1`);
  expect(await repository.get(original.id)).toBeTruthy();
  expect(await repository.get(`${original.id}-1`)).toBeTruthy();
});

it('restores a valid last project and safely falls back from a missing active ID', async () => {
  const record = createProjectRecord(
    createDefaultProjectDocument(),
    'Stored',
    'stored',
  );
  await repository.save(record);
  await repository.setActiveId('missing');
  await session.initialize();
  expect(session.snapshot().active?.id).toBe('stored');
  expect(await repository.getActiveId()).toBe('stored');
});

it('restores the last edited project in a new application session', async () => {
  await session.initialize();
  const id = session.snapshot().active!.id;
  useAssembly.getState().setCanonicalField('roof.runMm', 4780);
  await session.persistNow();
  await session.dispose();
  useAssembly.getState().reset();
  useAssembly.getState().setMode('builder');
  session = new ProjectSession(repository);
  await session.initialize();
  expect(session.snapshot().active?.id).toBe(id);
  expect(useAssembly.getState().template.halfRunMm).toBe(4780);
});

it('keeps an edited Quick calculation when entering a restored Builder project', async () => {
  const stored = createProjectRecord(
    createDefaultProjectDocument(),
    'Existing',
    'existing',
  );
  await repository.save(stored);
  await repository.setActiveId(stored.id);
  useAssembly.getState().setMode('quick');
  useAssembly.getState().setCanonicalField('roof.runMm', 4860);
  useAssembly.getState().setMode('builder');
  await session.initialize();
  expect(session.snapshot().active?.id).toBe(stored.id);
  expect(useAssembly.getState().template.halfRunMm).toBe(4860);
  expect(session.snapshot().saveStatus).toBe('dirty');
  await session.persistNow();
  expect(
    (await repository.get(stored.id))?.document.project.roof.halfRunMm,
  ).toBe(4860);
});

it('does not persist later Quick-only edits into the active Builder project', async () => {
  await session.initialize();
  const id = session.snapshot().active!.id;
  useAssembly.getState().setCanonicalField('roof.runMm', 4320);
  useAssembly.getState().setMode('quick');
  await session.persistNow();
  useAssembly.getState().setCanonicalField('roof.runMm', 4990);
  await session.dispose();
  expect((await repository.get(id))?.document.project.roof.halfRunMm).toBe(
    4320,
  );
});

it('shows saving while a write is pending and blocks switching after a failed flush', async () => {
  let release: (() => void) | undefined;
  let hold = false;
  class DelayedRepository extends LocalProjectRepository {
    override async save(record: Parameters<LocalProjectRepository['save']>[0]) {
      if (hold)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      return super.save(record);
    }
  }
  await session.dispose();
  const delayed = new DelayedRepository(storage);
  session = new ProjectSession(delayed);
  await session.initialize();
  hold = true;
  useAssembly.getState().setCanonicalField('roof.runMm', 4900);
  const write = session.persistNow();
  expect(session.snapshot().saveStatus).toBe('saving');
  hold = false;
  release?.();
  await write;
  expect(session.snapshot().saveStatus).toBe('saved');
  storage.failWrites = true;
  useAssembly.getState().setCanonicalField('roof.runMm', 5000);
  await expect(session.create()).rejects.toThrow();
  expect(useAssembly.getState().template.halfRunMm).toBe(5000);
  expect(session.snapshot().saveStatus).toBe('error');
  storage.failWrites = false;
});
