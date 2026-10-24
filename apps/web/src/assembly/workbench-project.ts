import {
  createMemberInstanceContexts,
  createRoofFabricationPackage,
  detailPreviewsFromFabricationPackage,
  type MemberInstanceContext,
  type ResolvedRoofProject,
  type RoofFabricationPackage,
} from '@cieslacalc/calculator-core';
import {
  createRoofSkeletonFromResolved,
  resolveRoofTemplate,
} from '@cieslacalc/roof-math';
import type { DetailPreviewModel } from '@cieslacalc/drawing-engine';
import type { RoofSkeleton, RoofTemplateSpec } from '@cieslacalc/timber-model';
import { memberInstanceCode } from './workbench';

export interface WorkbenchProjectProjection {
  resolved: ResolvedRoofProject;
  skeleton: RoofSkeleton;
  fabricationPackage: RoofFabricationPackage;
  memberInstances: MemberInstanceContext[];
  detailPreviews: DetailPreviewModel[];
}

interface WorkbenchProjectDependencies {
  resolveTemplate: (template: RoofTemplateSpec) => ResolvedRoofProject;
  createSkeleton: (resolved: ResolvedRoofProject) => RoofSkeleton;
  createFabricationPackage: (
    resolved: ResolvedRoofProject,
  ) => RoofFabricationPackage;
}

const defaultDependencies: WorkbenchProjectDependencies = {
  resolveTemplate: resolveRoofTemplate,
  createSkeleton: createRoofSkeletonFromResolved,
  createFabricationPackage: createRoofFabricationPackage,
};

/**
 * One memoized projection boundary for the Builder. View-only selection,
 * navigation and camera changes reuse this result and never rerun geometry.
 */
export function createWorkbenchProjectResolver(
  dependencies: WorkbenchProjectDependencies = defaultDependencies,
) {
  const cache = new WeakMap<RoofTemplateSpec, WorkbenchProjectProjection>();
  let resolutionCount = 0;

  return {
    resolve(template: RoofTemplateSpec): WorkbenchProjectProjection {
      const cached = cache.get(template);
      if (cached) return cached;

      resolutionCount += 1;
      const resolved = dependencies.resolveTemplate(template);
      const skeleton = dependencies.createSkeleton(resolved);
      const fabricationPackage =
        dependencies.createFabricationPackage(resolved);
      const memberInstances = createMemberInstanceContexts({
        resolved,
        skeleton,
        roofPackage: fabricationPackage,
      });
      const projection = {
        resolved,
        skeleton,
        fabricationPackage,
        memberInstances,
        detailPreviews:
          detailPreviewsFromFabricationPackage(fabricationPackage),
      };
      cache.set(template, projection);
      return projection;
    },
    getResolutionCount: () => resolutionCount,
  };
}

export const workbenchProjectResolver = createWorkbenchProjectResolver();

/**
 * VNext-9: schedule codes for one roof's member instances, the family taken
 * from each instance's context — K2 on an asymmetric gable's right side —
 * never from its ID (ADR-007).
 */
export function memberInstanceCodes(
  template: RoofTemplateSpec,
): (id: string) => string {
  const families = new Map(
    workbenchProjectResolver
      .resolve(template)
      .memberInstances.map((instance) => [
        instance.instanceId,
        instance.familyCode,
      ]),
  );
  return (id) => memberInstanceCode(id, families.get(id));
}
