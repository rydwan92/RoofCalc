import { expect, it, vi } from 'vitest';
import {
  createRoofFabricationPackage,
  type ResolvedRoofProject,
} from '@cieslacalc/calculator-core';
import {
  createRoofSkeletonFromResolved,
  gableTemplateFromAssembly,
  assemblyDefaults,
  resolveRoofTemplate,
} from '@cieslacalc/roof-math';
import { createWorkbenchProjectResolver } from './workbench-project';

it('resolves canonical geometry once while view-only context changes', () => {
  const resolveTemplate = vi.fn(resolveRoofTemplate);
  const createSkeleton = vi.fn(createRoofSkeletonFromResolved);
  const createFabrication = vi.fn((resolved: ResolvedRoofProject) =>
    createRoofFabricationPackage(resolved),
  );
  const resolver = createWorkbenchProjectResolver({
    resolveTemplate,
    createSkeleton,
    createFabricationPackage: createFabrication,
  });
  const template = gableTemplateFromAssembly(assemblyDefaults);

  const first = resolver.resolve(template);
  const transientViewStates = [
    { selectedInstanceId: first.memberInstances[0]!.instanceId },
    { activeOperationId: first.memberInstances[0]!.operations[0]!.operationId },
    { isolated: true },
    { zoom: 1.4 },
  ];
  transientViewStates.forEach(() =>
    expect(resolver.resolve(template)).toBe(first),
  );

  expect(resolveTemplate).toHaveBeenCalledTimes(1);
  expect(createSkeleton).toHaveBeenCalledTimes(1);
  expect(createFabrication).toHaveBeenCalledTimes(1);
  expect(resolver.getResolutionCount()).toBe(1);
});

it('rebuilds the project projection for a new canonical template identity', () => {
  const resolver = createWorkbenchProjectResolver();
  const firstTemplate = gableTemplateFromAssembly(assemblyDefaults);
  const first = resolver.resolve(firstTemplate);
  const nextTemplate = {
    ...firstTemplate,
    pitchDeg: firstTemplate.pitchDeg + 1,
  };
  const next = resolver.resolve(nextTemplate);

  expect(next).not.toBe(first);
  expect(next.resolved.calculation.plan.referenceLengthMm).not.toBe(
    first.resolved.calculation.plan.referenceLengthMm,
  );
  expect(resolver.getResolutionCount()).toBe(2);
});
