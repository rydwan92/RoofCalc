import type { RoofProjectDocumentV1 } from '@cieslacalc/calculator-core';
import {
  createRoofMemberSchedule,
  type QuantitySection,
  type RoofMemberSchedule,
} from '@cieslacalc/quantity-core';
import { resolveOpeningFramingSet } from '@cieslacalc/roof-math';
import type {
  RoofSkeleton,
  RoofTemplateSpec,
  RoofWindowFeature,
} from '@cieslacalc/timber-model';
import { workbenchProjectResolver } from './workbench-project';

/**
 * The exact sections the template states, keyed by prototype: the ridge
 * board's thickness and depth (a mono-pitch roof has no ridge member to
 * size, VNext-8). Every other member keeps the skeleton's own section.
 */
export function structuralSectionOverrides(
  template: RoofTemplateSpec,
): Record<string, QuantitySection> {
  if (template.type === 'mono-pitch') return {};
  const ridge = template.ridge;
  return {
    [ridge.id]: {
      ...(ridge.thicknessMm > 0 ? { widthMm: ridge.thicknessMm } : {}),
      ...(ridge.depthMm !== undefined ? { depthMm: ridge.depthMm } : {}),
      completeness:
        ridge.thicknessMm > 0 && ridge.depthMm !== undefined
          ? 'complete'
          : 'partial',
    },
  };
}

/**
 * VNext-10E: the structural timber of one roof project, outside the
 * workbench — the same resolver, the same accepted opening framing and the
 * same schedule the workbench counts (construction projection), without
 * the build-up layers that need the open workbench's layouts.
 */
export function structuralTimberSchedule(
  project: RoofProjectDocumentV1['project'],
): RoofMemberSchedule {
  return createRoofMemberSchedule({
    skeleton: composedStructureSkeleton(project),
    sectionOverrides: structuralSectionOverrides(project.roof),
  });
}

/**
 * The skeleton a roof project builds: the workbench's resolver and its
 * accepted opening framing — what the schedule counts and the site draws.
 */
export function composedStructureSkeleton(
  project: RoofProjectDocumentV1['project'],
): RoofSkeleton {
  const template = project.roof;
  const { skeleton } = workbenchProjectResolver.resolve(template);
  return resolveOpeningFramingSet({
    template,
    skeleton,
    features: project.features.filter(
      (feature): feature is RoofWindowFeature => feature.kind === 'roof-window',
    ),
    framingSpecs: project.openingFraming,
  }).composedSkeleton;
}
