import { expect, it } from 'vitest';
import {
  addCostLine,
  createCostLine,
  createEmptyCostScenario,
} from '@cieslacalc/cost-core';
import { LocalCostRepository } from './cost-repository';
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
