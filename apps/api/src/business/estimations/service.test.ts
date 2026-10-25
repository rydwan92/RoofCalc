import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import {
  assemblyDefaults,
  gableTemplateFromAssembly,
} from '@cieslacalc/roof-math';
import { createRoofProjectDocument } from '@cieslacalc/calculator-core';
import {
  createProjectRecord,
  projectRecordSchema,
} from '@cieslacalc/project-core';
import type { WorkspaceRepository } from '../workspace/contracts';
import { EstimationService } from './service';

it('duplicates an independent project for the same tenant/customer without copying a quote', async () => {
  const project = createProjectRecord(
    createRoofProjectDocument(gableTemplateFromAssembly(assemblyDefaults)),
    'Original',
  );
  const createEstimation = vi.fn(async (_org, _user, input, snapshot) => ({
    estimation: { ...input, id: 'new-estimation', status: 'draft' },
    project: snapshot,
  }));
  const repository = {
    getEstimation: vi.fn(async (org: string) =>
      org === 'org:a'
        ? {
            project,
            estimation: { customerId: 'customer:a', location: 'Wrocław' },
            quote: { number: 'OF/2026/1' },
          }
        : undefined,
    ),
    createEstimation,
  } as unknown as WorkspaceRepository;
  const service = new EstimationService(repository);
  const result = await service.duplicate('org:a', 'sales', 'original', {
    newName: 'Variant',
  });
  expect(result.estimation).toMatchObject({
    customerId: 'customer:a',
    name: 'Variant',
    status: 'draft',
  });
  expect(result.project.id).not.toBe(project.id);
  expect(result.project.document).toEqual(project.document);
  expect(result.project.document).not.toBe(project.document);
  expect(result.quote).toBeUndefined();
  if (result.project.schemaVersion !== 1) throw new Error('one roof expected');
  expect(result.project.document.project.roof).not.toBe(
    project.document.project.roof,
  );
  await expect(
    service.duplicate('org:b', 'sales', 'original', { newName: 'Other' }),
  ).rejects.toThrow('estimation-not-found');
  expect(createEstimation).toHaveBeenCalledTimes(1);
});

/**
 * VNext-10F (ADR-017 §8): an estimation carries a project of several
 * structures as an opaque, validated record — created, saved and
 * duplicated as it is; the server never opens its structures.
 */
it('creates, saves and duplicates a project of several structures', async () => {
  const project = projectRecordSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          '../../../../../fixtures/projects/structures/13-house-and-carport.cieslacalc.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  );
  expect(project.schemaVersion).toBe(2);
  const createEstimation = vi.fn(async (_org, _user, input, snapshot) => ({
    estimation: { ...input, id: 'estimation:1', status: 'draft' },
    project: snapshot,
  }));
  const saveProject = vi.fn(async () => 3);
  const repository = {
    getCustomer: vi.fn(async () => ({ id: 'customer:a' })),
    getEstimation: vi.fn(async () => ({
      project,
      estimation: {
        customerId: 'customer:a',
        roofProjectId: project.id,
      },
    })),
    createEstimation,
    saveProject,
  } as unknown as WorkspaceRepository;
  const service = new EstimationService(repository);
  const input = {
    customerId: 'customer:a',
    roofProjectId: project.id,
    name: 'Dom z wiatą',
  };

  await service.create('org:a', 'sales', { input, project });
  expect(createEstimation.mock.calls[0]![3]).toEqual(project);

  await expect(
    service.save('org:a', 'estimation:1', { version: 2, project }),
  ).resolves.toEqual({ version: 3 });
  expect(saveProject).toHaveBeenCalledWith('org:a', 'estimation:1', 2, project);
  await expect(
    service.save('org:a', 'estimation:1', {
      version: 2,
      project: { ...project, id: 'project:other' },
    }),
  ).rejects.toThrow('project-mismatch');

  const copy = await service.duplicate('org:a', 'sales', 'estimation:1', {
    newName: 'Wariant',
  });
  expect(copy.project.schemaVersion).toBe(2);
  expect(copy.project.document).toEqual(project.document);
  expect(copy.project.id).not.toBe(project.id);
});
