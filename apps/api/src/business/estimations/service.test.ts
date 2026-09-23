import { expect, it, vi } from 'vitest';
import {
  assemblyDefaults,
  gableTemplateFromAssembly,
} from '@cieslacalc/roof-math';
import { createRoofProjectDocument } from '@cieslacalc/calculator-core';
import { createProjectRecord } from '@cieslacalc/project-core';
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
  expect(result.project.document.project.roof).not.toBe(
    project.document.project.roof,
  );
  await expect(
    service.duplicate('org:b', 'sales', 'original', { newName: 'Other' }),
  ).rejects.toThrow('estimation-not-found');
  expect(createEstimation).toHaveBeenCalledTimes(1);
});
