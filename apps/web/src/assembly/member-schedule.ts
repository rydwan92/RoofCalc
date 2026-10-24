import type { RoofProjectDocumentV1 } from '@cieslacalc/calculator-core';
import {
  createRoofMemberSchedule,
  type QuantitySection,
  type RoofMemberSchedule,
} from '@cieslacalc/quantity-core';
import { resolveOpeningFramingSet } from '@cieslacalc/roof-math';
import type {
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
  const template = project.roof;
  const { skeleton } = workbenchProjectResolver.resolve(template);
  const { composedSkeleton } = resolveOpeningFramingSet({
    template,
    skeleton,
    features: project.features.filter(
      (feature): feature is RoofWindowFeature => feature.kind === 'roof-window',
    ),
    framingSpecs: project.openingFraming,
  });
  return createRoofMemberSchedule({
    skeleton: composedSkeleton,
    sectionOverrides: structuralSectionOverrides(template),
  });
}
