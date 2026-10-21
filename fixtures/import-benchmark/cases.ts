import {
  createDesignPdf,
  createRoofPlanPdf,
  gableRoofPlanSpec,
  hipRoofPlanSpec,
  houseDesignSpecs,
} from '../documents/roof-plan-pdf';

/**
 * VNext-6.1 import benchmark — ground truth per document.
 *
 * Every case states what a careful human reads from the document (the
 * truth), which fields the document does NOT state (a correct import leaves
 * them to defaults and says so) and which disagreements it contains on
 * purpose. See README.md for the schema and the rules for adding real,
 * licensed and anonymised documents.
 */
export type BenchmarkField =
  | 'buildingLength'
  | 'buildingWidth'
  | 'pitch'
  | 'eave'
  | 'spacing'
  | 'rafterWidth'
  | 'rafterDepth';

export interface BenchmarkCase {
  id: string;
  /** What kind of input it is — for the per-kind breakdown. */
  input: 'pdf-text' | 'pdf-vector' | 'scan' | 'photo' | 'dxf' | 'ifc';
  description: string;
  /** Licence / provenance of the document (synthetic = generated here). */
  licence: 'synthetic' | string;
  bytes: () => Uint8Array;
  truth: {
    roofType: 'gable' | 'hip';
    /** mm, degrees for pitch; only what the document states. */
    values: Partial<Record<BenchmarkField, number>>;
  };
  /** Fields with two different written values in the document. */
  conflicts: BenchmarkField[];
}

export const BENCHMARK_CASES: readonly BenchmarkCase[] = [
  {
    id: 'gable-1p-title-block',
    input: 'pdf-text',
    description:
      'One sheet, gable, labelled dimensions in a title block, 1:100 outline.',
    licence: 'synthetic',
    bytes: () => createRoofPlanPdf(gableRoofPlanSpec()),
    truth: {
      roofType: 'gable',
      values: {
        buildingLength: 12_400,
        buildingWidth: 9_600,
        pitch: 35,
        eave: 500,
        spacing: 900,
        rafterWidth: 80,
        rafterDepth: 180,
      },
    },
    conflicts: [],
  },
  {
    id: 'hip-1p-unitless-percent',
    input: 'pdf-vector',
    description:
      'One sheet, hip, unitless numbers resolved by the drawn outline, slope in %.',
    licence: 'synthetic',
    bytes: () => createRoofPlanPdf(hipRoofPlanSpec()),
    truth: {
      roofType: 'hip',
      values: {
        buildingLength: 14_000,
        buildingWidth: 10_000,
        pitch: (Math.atan(0.7) * 180) / Math.PI,
      },
    },
    conflicts: [],
  },
  {
    id: 'house-4p-cross-sheet-conflict',
    input: 'pdf-text',
    description:
      'Four sheets: title, roof plan, section A-A, window schedule quoting another length.',
    licence: 'synthetic',
    bytes: () => createDesignPdf(houseDesignSpecs()),
    truth: {
      roofType: 'gable',
      values: {
        buildingLength: 12_400,
        buildingWidth: 9_600,
        pitch: 40,
        eave: 500,
        spacing: 800,
        rafterWidth: 80,
        rafterDepth: 200,
      },
    },
    conflicts: ['buildingLength'],
  },
];
