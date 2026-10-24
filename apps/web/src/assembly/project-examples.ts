import { roofTemplateSpanMm } from '@cieslacalc/roof-math';
import type { RoofFamily } from '@cieslacalc/timber-model';
import { importProject, type ProjectDocument } from '@cieslacalc/project-core';
import basicGable from '../../../../fixtures/projects/01-basic-gable.cieslacalc.json';
import basicHip from '../../../../fixtures/projects/02-basic-hip.cieslacalc.json';
import collarTie from '../../../../fixtures/projects/10-gable-collar-tie-direct-meeting.cieslacalc.json';
import carport from '../../../../fixtures/projects/11-mono-pitch-carport.cieslacalc.json';
import asymmetric from '../../../../fixtures/projects/12-asymmetric-gable.cieslacalc.json';
import houseAndCarport from '../../../../fixtures/projects/structures/13-house-and-carport.cieslacalc.json';

export type ProjectExampleId =
  | 'basic-gable'
  | 'hip'
  | 'collar-tie'
  | 'mono-pitch-carport'
  | 'asymmetric-gable'
  | 'house-and-carport';

export interface ProjectExample {
  id: ProjectExampleId;
  illustration:
    'gable' | 'hip' | 'collar-tie' | 'mono-pitch' | 'asymmetric-gable';
}

/**
 * V37 example projects reuse the reference fixture corpus, so an example is a
 * real, regression-tested document rather than a disconnected fake project.
 */
const FIXTURES: Record<ProjectExampleId, unknown> = {
  'basic-gable': basicGable,
  hip: basicHip,
  'collar-tie': collarTie,
  // VNext-11: every roof family, and a project of two structures.
  'mono-pitch-carport': carport,
  'asymmetric-gable': asymmetric,
  'house-and-carport': houseAndCarport,
};

export const PROJECT_EXAMPLES: readonly ProjectExample[] = [
  { id: 'basic-gable', illustration: 'gable' },
  { id: 'hip', illustration: 'hip' },
  { id: 'collar-tie', illustration: 'collar-tie' },
  { id: 'mono-pitch-carport', illustration: 'mono-pitch' },
  { id: 'asymmetric-gable', illustration: 'asymmetric-gable' },
  { id: 'house-and-carport', illustration: 'gable' },
];

export function projectExampleDocument(id: ProjectExampleId): ProjectDocument {
  // Parsed on demand through the same import boundary as a user file; every
  // call returns a fresh document so an example is never shared mutable state.
  return importProject(JSON.stringify(FIXTURES[id]), {
    legacyName: id,
  }).document;
}

export interface ProjectExampleFacts {
  roofType: RoofFamily;
  buildingLengthMm: number;
  buildingWidthMm: number;
  pitchDeg: number;
  collarTie: boolean;
  /** VNext-11: roof structures in the example (1 for a single roof). */
  structureCount: number;
}

/** The facts of an example's first roof, and how many roofs it has. */
export function projectExampleFacts(
  document: ProjectDocument,
): ProjectExampleFacts {
  const project =
    document.schemaVersion === 1
      ? document.project
      : document.structures[0]!.project;
  const roof = project.roof;
  return {
    roofType: roof.type,
    buildingLengthMm: roof.buildingLengthMm,
    buildingWidthMm: roofTemplateSpanMm(roof),
    pitchDeg: roof.pitchDeg,
    collarTie:
      roof.type === 'gable' && roof.structure?.system === 'rafter-collar-tie',
    structureCount:
      document.schemaVersion === 1 ? 1 : document.structures.length,
  };
}
