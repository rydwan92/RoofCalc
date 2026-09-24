import type { IfcReferenceSummary } from '@cieslacalc/bim-import-core';

export interface IfcReferenceMesh {
  expressId: number;
  /** Local, recentered metre coordinates for display only. */
  positions: Float32Array;
  indices: Uint32Array;
  color: [number, number, number, number];
}

export interface IfcReferenceModel {
  summary: IfcReferenceSummary;
  meshes: IfcReferenceMesh[];
  /** Metres in IFC's axes, subtracted for display; never canonical roof data. */
  displayOrigin: [number, number, number];
}

export type IfcWorkerRequest = {
  kind: 'parse';
  buffer: ArrayBuffer;
  fileName: string;
};
export type IfcWorkerResponse =
  | { kind: 'stage'; stage: 'parser' | 'analysis' | 'preview' }
  | { kind: 'result'; model: IfcReferenceModel }
  | { kind: 'error'; message: string };
