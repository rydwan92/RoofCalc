import { expect, it } from 'vitest';
import { createProjectRecord, projectSummary } from '@cieslacalc/project-core';
import { createDefaultProjectDocument } from '../assembly/store';
import { LocalProjectRepository } from './local-repository';
import { MemoryStorage } from './memory-storage';

const record = createProjectRecord(
  createDefaultProjectDocument(),
  'Dach A',
  'project-a',
  '2026-09-13T10:00:00.000Z',
);

it('saves, updates, lists metadata, restores active ID and deletes records', async () => {
  const storage = new MemoryStorage();
  const repository = new LocalProjectRepository(storage);
  expect(await repository.list()).toEqual([]);
  expect(await repository.get('missing')).toBeUndefined();
  await repository.save(record);
  await repository.setActiveId(record.id);
  expect(await repository.getActiveId()).toBe(record.id);
  expect(await repository.get(record.id)).toEqual(record);
  expect(await repository.list()).toEqual([projectSummary(record)]);
  const updated = { ...record, name: 'Dach B' };
  await repository.save(updated);
  expect(await repository.list()).toEqual([projectSummary(updated)]);
  const index = storage.getItem('cieslacalc.projects.v1.index')!;
  expect(index).not.toContain('roof');
  expect(index).not.toContain('skeleton');
  expect(
    storage.getItem('cieslacalc.projects.v1.record.project-a'),
  ).not.toContain('historyPast');
  await repository.delete(record.id);
  expect(await repository.list()).toEqual([]);
  expect(await repository.getActiveId()).toBeUndefined();
});

it('recovers a damaged index, isolates damaged records and reports unavailable writes', async () => {
  const storage = new MemoryStorage();
  const repository = new LocalProjectRepository(storage);
  await repository.save(record);
  storage.setItem('cieslacalc.projects.v1.index', '{bad');
  storage.setItem('cieslacalc.projects.v1.record.bad', '{bad');
  expect(await repository.list()).toEqual([projectSummary(record)]);
  expect(await repository.get('bad')).toBeUndefined();
  storage.failWrites = true;
  await expect(repository.save(record)).rejects.toThrow('Nie udało');
  const unavailable = new LocalProjectRepository(undefined);
  await expect(unavailable.save(record)).rejects.toThrow();
});
