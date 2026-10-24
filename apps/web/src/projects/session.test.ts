import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createProjectRecord,
  type ProjectRecord,
} from '@cieslacalc/project-core';
import { createDefaultProjectDocument, useAssembly } from '../assembly/store';
import { LocalProjectRepository } from './local-repository';
import { MemoryStorage } from './memory-storage';
import { ProjectSession } from './session';
import { ridged } from '../assembly/test-templates';
import { createRoofProjectDocument } from '@cieslacalc/calculator-core';
import { convertRoofTemplate } from '@cieslacalc/roof-math';

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
  expect(ridged(state.template).halfRunMm).toBe(4450);
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
  expect(storedHalfRun(await repository.get(active.id))).toBe(4400);
  expect(useAssembly.getState().historyPast).toHaveLength(1);
});

it('autosaves and reopens a catalogue selection from its local technical snapshot', async () => {
  await session.initialize();
  const id = session.snapshot().active!.id;
  vi.useFakeTimers();
  useAssembly.getState().setCoveringAssignments([
    {
      id: 'covering:catalogue',
      roofPlaneIds: ['roof-plane:left'],
      selectedInstallationModeId: 'standard',
      product: {
        catalogRef: {
          productId: 'product:tile',
          technicalRevisionId: 'revision:tile:r1',
          variantId: 'variant:tile:red',
        },
        displaySnapshot: {
          manufacturer: 'DEMO Roof',
          familyName: 'Tile 30 (DEMO)',
          variantName: 'Red',
        },
        technicalSpecSnapshot: {
          schemaVersion: 1,
          kind: 'roof-tile',
          installationModes: [
            {
              id: 'standard',
              coverWidthMm: 300,
              gaugeRangeMm: { min: 320, max: 360 },
              minPitchDeg: 20,
              coursePattern: {
                layers: [{ id: 'base', horizontalOffsetFraction: 0 }],
                battenRowOffsetCycle: [0],
              },
            },
          ],
        },
      },
    },
  ]);
  expect(useAssembly.getState().historyPast).toHaveLength(1);
  expect(session.snapshot().saveStatus).toBe('dirty');
  await vi.advanceTimersByTimeAsync(800);
  expect(
    single(await repository.get(id))?.document.project.coverings[0]?.product
      .catalogRef?.technicalRevisionId,
  ).toBe('revision:tile:r1');

  await session.dispose();
  useAssembly.getState().reset();
  useAssembly.getState().setMode('builder');
  session = new ProjectSession(repository);
  await session.initialize();
  const reopened = useAssembly.getState().projectDocument.project.coverings[0];
  expect(reopened?.product.technicalSpecSnapshot.kind).toBe('roof-tile');
  expect(reopened?.product.displaySnapshot?.familyName).toBe('Tile 30 (DEMO)');
});

it('preserves an editable document and shows error when storage fails', async () => {
  await session.initialize();
  storage.failWrites = true;
  useAssembly.getState().setCanonicalField('roof.runMm', 4600);
  await expect(session.persistNow()).rejects.toThrow();
  expect(session.snapshot().saveStatus).toBe('error');
  expect(ridged(useAssembly.getState().template).halfRunMm).toBe(4600);
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
  expect(ridged(useAssembly.getState().template).halfRunMm).toBe(4780);
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
  expect(ridged(useAssembly.getState().template).halfRunMm).toBe(4860);
  expect(session.snapshot().saveStatus).toBe('dirty');
  await session.persistNow();
  expect(storedHalfRun(await repository.get(stored.id))).toBe(4860);
});

it('does not persist later Quick-only edits into the active Builder project', async () => {
  await session.initialize();
  const id = session.snapshot().active!.id;
  useAssembly.getState().setCanonicalField('roof.runMm', 4320);
  useAssembly.getState().setMode('quick');
  await session.persistNow();
  useAssembly.getState().setCanonicalField('roof.runMm', 4990);
  await session.dispose();
  expect(storedHalfRun(await repository.get(id))).toBe(4320);
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
  expect(ridged(useAssembly.getState().template).halfRunMm).toBe(5000);
  expect(session.snapshot().saveStatus).toBe('error');
  storage.failWrites = false;
});

/** A stored project of one roof (a V1 record), or a loud failure. */
function single(record: ProjectRecord | undefined) {
  if (record && record.schemaVersion !== 1)
    throw new Error('expected a project of one roof');
  return record;
}

/** A stored gable/hip project's half run (ADR-016: the roof is a union). */
function storedHalfRun(record: ProjectRecord | undefined) {
  const stored = single(record);
  return stored ? ridged(stored.document.project.roof).halfRunMm : undefined;
}

/* VNext-10 (ADR-017): a project of several roof structures. */

/** A mono-pitch garage as the V1 document the workbench edits. */
function garageDocument() {
  return createRoofProjectDocument(
    convertRoofTemplate(
      createDefaultProjectDocument().project.roof,
      'mono-pitch',
    ),
  );
}

it('adds a structure, edits only the selected one and switches with fresh Undo', async () => {
  await session.initialize();
  const active = session.snapshot().active!;
  useAssembly.getState().setCanonicalField('roof.runMm', 4450);
  const garageId = await session.addStructure(garageDocument(), {
    name: 'Garaż',
    firstName: 'Dom',
  });
  // The project is now a V2 record of two structures, the garage open.
  const stored = await repository.get(active.id);
  expect(stored?.schemaVersion).toBe(2);
  expect(session.snapshot().structures?.map((s) => [s.name, s.family])).toEqual(
    [
      ['Dom', 'gable'],
      ['Garaż', 'mono-pitch'],
    ],
  );
  expect(session.snapshot().activeStructureId).toBe(garageId);
  expect(useAssembly.getState().template.type).toBe('mono-pitch');
  expect(useAssembly.getState().historyPast).toEqual([]);

  // An edit of the garage lands in the garage only.
  useAssembly.getState().setField('template.buildingLengthMm', '5000');
  await session.persistNow();
  const afterEdit = await repository.get(active.id);
  if (afterEdit?.schemaVersion !== 2) throw new Error('expected V2');
  expect(
    afterEdit.document.structures.map((s) => s.project.roof.buildingLengthMm),
  ).toEqual([
    createDefaultProjectDocument().project.roof.buildingLengthMm,
    5000,
  ]);
  expect(ridged(afterEdit.document.structures[0]!.project.roof).halfRunMm).toBe(
    4450,
  );

  // Back to the house: its roof, an empty Undo, the perspective kept.
  useAssembly.getState().setViewPreset('materials');
  await session.selectStructure(afterEdit.document.structures[0]!.id);
  expect(ridged(useAssembly.getState().template).halfRunMm).toBe(4450);
  expect(useAssembly.getState().historyPast).toEqual([]);
  expect(useAssembly.getState().workbench.viewPreset).toBe('materials');
});

it('renames, moves and removes a structure; one unmoved roof is V1 again', async () => {
  await session.initialize();
  const active = session.snapshot().active!;
  const garageId = await session.addStructure(garageDocument(), {
    name: 'Garaż',
  });
  await session.renameStructure(garageId, 'Wiata');
  await session.moveStructure(garageId, {
    cornerMm: { x: 12000, y: 1500 },
    elevationMm: 300,
    rotationAboutVerticalDeg: 90,
  });
  const garage = session
    .snapshot()
    .structures!.find((structure) => structure.id === garageId)!;
  expect(garage.name).toBe('Wiata');
  // The building corner lands exactly where it was typed.
  expect(garage.placement.cornerMm.x).toBeCloseTo(12000, 9);
  expect(garage.placement.cornerMm.y).toBeCloseTo(1500, 9);
  expect(garage.placement).toMatchObject({
    elevationMm: 300,
    rotationAboutVerticalDeg: 90,
  });
  await session.removeStructure(garageId);
  expect(session.snapshot().structures).toBeUndefined();
  expect((await repository.get(active.id))?.schemaVersion).toBe(1);
  expect(useAssembly.getState().template.type).toBe('gable');
});

it('reopens a project of structures on its first one and exports it whole', async () => {
  await session.initialize();
  const active = session.snapshot().active!;
  await session.addStructure(garageDocument(), { name: 'Garaż' });
  const exported = session.exportActive()!;
  await session.dispose();

  // A page load: the store starts from the default document.
  useAssembly.getState().reset();
  useAssembly.getState().setMode('builder');
  const reopened = new ProjectSession(repository, 800);
  session = reopened;
  await reopened.initialize();
  expect(reopened.snapshot().active?.id).toBe(active.id);
  expect(reopened.snapshot().structures).toHaveLength(2);
  expect(useAssembly.getState().template.type).toBe('gable');

  await reopened.import(exported.contents);
  expect(reopened.snapshot().active?.id).not.toBe(active.id);
  expect(reopened.snapshot().structures?.map((s) => s.name)).toEqual([
    undefined,
    'Garaż',
  ]);
});
