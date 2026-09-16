import type { RoofProjectDocumentV1 } from '@cieslacalc/calculator-core';
import { importProject } from '@cieslacalc/project-core';
import basicGable from '../../../../fixtures/projects/01-basic-gable.cieslacalc.json';
import basicHip from '../../../../fixtures/projects/02-basic-hip.cieslacalc.json';
import collarTie from '../../../../fixtures/projects/10-gable-collar-tie-direct-meeting.cieslacalc.json';

export type ProjectExampleId = 'basic-gable' | 'hip' | 'collar-tie';

export interface ProjectExample {
  id: ProjectExampleId;
  illustration: 'gable' | 'hip' | 'collar-tie';
}

/**
 * V37 example projects reuse the reference fixture corpus, so an example is a
 * real, regression-tested document rather than a disconnected fake project.
 */
const FIXTURES: Record<ProjectExampleId, unknown> = {
  'basic-gable': basicGable,
  hip: basicHip,
  'collar-tie': collarTie,
};

export const PROJECT_EXAMPLES: readonly ProjectExample[] = [
  { id: 'basic-gable', illustration: 'gable' },
  { id: 'hip', illustration: 'hip' },
  { id: 'collar-tie', illustration: 'collar-tie' },
];

export function projectExampleDocument(
  id: ProjectExampleId,
): RoofProjectDocumentV1 {
  // Parsed on demand through the same import boundary as a user file; every
  // call returns a fresh document so an example is never shared mutable state.
  return importProject(JSON.stringify(FIXTURES[id]), {
    legacyName: id,
  }).document as RoofProjectDocumentV1;
}

export interface ProjectExampleFacts {
  roofType: 'gable' | 'hip';
  buildingLengthMm: number;
  buildingWidthMm: number;
  pitchDeg: number;
  collarTie: boolean;
}

export function projectExampleFacts(
  document: RoofProjectDocumentV1,
): ProjectExampleFacts {
  const roof = document.project.roof;
  return {
    roofType: roof.type,
    buildingLengthMm: roof.buildingLengthMm,
    buildingWidthMm: roof.halfRunMm * 2,
    pitchDeg: roof.pitchDeg,
    collarTie:
      roof.type === 'gable' && roof.structure?.system === 'rafter-collar-tie',
  };
}
