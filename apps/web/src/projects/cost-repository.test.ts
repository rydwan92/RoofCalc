import { expect, it } from 'vitest';
import {
  addCostLine,
  createCostLine,
  createEmptyCostScenario,
} from '@cieslacalc/cost-core';
import { LocalCostRepository } from './cost-repository';
import { projectRecordKey } from './local-repository';
import { MemoryStorage } from './memory-storage';

function sampleScenario() {
  let scenario = createEmptyCostScenario('PLN', '2026-09-15T10:00:00.000Z');
  scenario = addCostLine(
    scenario,
    createCostLine({
      id: 'battens',
      category: 'material',
      label: 'Łaty',
      quantity: { value: 492.1, unit: 'm' },
      quantityBasis: 'geometric-length',
      suitability: 'geometric-estimate',
      currencyCode: 'PLN',
      unitPriceMinor: 733,
      source: 'project-derived',
      projectQuantityValue: 492.1,
    }),
    '2026-09-15T10:00:00.000Z',
  );
  return scenario;
}

it('saves and restores a cost scenario per project ID', async () => {
  const storage = new MemoryStorage();
  const repository = new LocalCostRepository(storage);
  expect(await repository.get('project-a')).toBeUndefined();
  const scenario = sampleScenario();
  await repository.save('project-a', scenario);
  expect(await repository.get('project-a')).toEqual(scenario);
  expect(await repository.get('project-b')).toBeUndefined();
});

it('keeps two projects independent', async () => {
  const storage = new MemoryStorage();
  const repository = new LocalCostRepository(storage);
  await repository.save('project-a', sampleScenario());
  await repository.save('project-b', createEmptyCostScenario('PLN'));
  expect((await repository.get('project-a'))?.lines).toHaveLength(1);
  expect((await repository.get('project-b'))?.lines).toHaveLength(0);
});

it('deletes a scenario without disturbing another project', async () => {
  const storage = new MemoryStorage();
  const repository = new LocalCostRepository(storage);
  await repository.save('project-a', sampleScenario());
  await repository.delete('project-a');
  expect(await repository.get('project-a')).toBeUndefined();
});

it('isolates a damaged record instead of throwing', async () => {
  const storage = new MemoryStorage();
  storage.setItem('cieslacalc.costEstimate.v1.project-a', '{bad');
  const repository = new LocalCostRepository(storage);
  expect(await repository.get('project-a')).toBeUndefined();
});

it('is unavailable without storage rather than throwing on read', async () => {
  const repository = new LocalCostRepository(undefined);
  expect(await repository.get('project-a')).toBeUndefined();
  await expect(
    repository.save('project-a', sampleScenario()),
  ).rejects.toThrow();
});

it('removes estimates of deleted projects only, never one with a record (VNext-6.2)', async () => {
  const storage = new MemoryStorage();
  const repository = new LocalCostRepository(storage);
  await repository.save('kept', sampleScenario());
  await repository.save('deleted', sampleScenario());
  storage.setItem(projectRecordKey('kept'), '{}');
  // An unreadable project index must not count as "no projects".
  storage.setItem('cieslacalc.projects.v1.index', 'not json');
  storage.setItem('cieslacalc.costEstimateNotes', 'unrelated');
  repository.prune();
  expect(await repository.get('kept')).toBeDefined();
  expect(await repository.get('deleted')).toBeUndefined();
  expect(storage.getItem('cieslacalc.costEstimateNotes')).toBe('unrelated');
});

/* VNext-10B (ADR-017): one estimate per structure of a project. */

it('keeps the project roof on its own key and each further structure apart', async () => {
  const storage = new MemoryStorage();
  const repository = new LocalCostRepository(storage);
  const house = sampleScenario();
  const garage = createEmptyCostScenario('PLN');
  await repository.save('project-a', house);
  await repository.save('project-a', garage, 'structure:2');
  // The roof a V1 project had keeps its estimate when it becomes structure 1.
  expect(await repository.get('project-a', 'structure:roof')).toEqual(house);
  expect(await repository.get('project-a')).toEqual(house);
  expect(await repository.get('project-a', 'structure:2')).toEqual(garage);
  expect(await repository.get('project-a', 'structure:3')).toBeUndefined();
  expect(
    await repository.getMany('project-a', [
      'structure:roof',
      'structure:2',
      'structure:3',
    ]),
  ).toEqual([
    { structureId: 'structure:roof', scenario: house },
    { structureId: 'structure:2', scenario: garage },
    { structureId: 'structure:3' },
  ]);
});

it('drops a removed structure and gives the last one the project key', async () => {
  const storage = new MemoryStorage();
  const repository = new LocalCostRepository(storage);
  const garage = sampleScenario();
  await repository.save('project-a', createEmptyCostScenario('PLN'));
  await repository.save('project-a', garage, 'structure:2');
  await repository.save('project-a', garage, 'structure:3');
  await repository.afterStructureRemoved('project-a', 'structure:3');
  expect(await repository.get('project-a', 'structure:3')).toBeUndefined();
  // Removing the first roof, the project is the garage alone (V1 again).
  await repository.afterStructureRemoved(
    'project-a',
    'structure:roof',
    'structure:2',
  );
  expect(await repository.get('project-a')).toEqual(garage);
  expect(
    storage.getItem('cieslacalc.structureCostEstimate.v1.project-a'),
  ).toBeNull();
});

it('prunes the structure estimates of a deleted project too', async () => {
  const storage = new MemoryStorage();
  const repository = new LocalCostRepository(storage);
  await repository.save('kept', sampleScenario(), 'structure:2');
  await repository.save('deleted', sampleScenario(), 'structure:2');
  storage.setItem(projectRecordKey('kept'), '{}');
  repository.prune();
  expect(await repository.get('kept', 'structure:2')).toBeDefined();
  expect(await repository.get('deleted', 'structure:2')).toBeUndefined();
});
