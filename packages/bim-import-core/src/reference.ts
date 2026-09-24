import type {
  IfcAnalysisGeometry,
  IfcRoofAnalysis,
  IfcRoofAnalysisInput,
} from './analysis';

export type SupportedIfcRoofAnalysis = Extract<
  IfcRoofAnalysis,
  { status: 'supported' }
>;

/** Display-only IFC roof surface already placed in the RoofCalc frame (mm). */
export interface IfcRoofReferenceMesh {
  positions: Float32Array;
  indices: Uint32Array;
  /** IFC outline in plan, for a factual comparison with RoofCalc's roof. */
  outline: { lengthMm: number; widthMm: number };
  ridgeLengthMm: number;
}

/**
 * Places the analysed IFC roof surface into RoofCalc's roof frame for a
 * visual reference: plan centre → building centre (x = 0, y = length / 2),
 * ridge → +y, IFC ridge level → RoofCalc ridge level. It is a rigid move
 * (rotation + translation, no scaling), so the surface keeps its own shape.
 * Reference only: nothing here may become a quantity or a project value.
 */
export function placeIfcRoofReference(
  input: Pick<IfcRoofAnalysisInput, 'geometry' | 'sourceToMillimetres'>,
  analysis: SupportedIfcRoofAnalysis,
  target: { buildingLengthMm: number; ridgeLevelMm: number },
): IfcRoofReferenceMesh | undefined {
  const scale = input.sourceToMillimetres;
  if (!scale) return undefined;
  const [dx, dy] = analysis.geometry.ridgeDirection;
  const [cx, cy] = analysis.geometry.planCentreMm;
  const positions: number[] = [];
  const indices: number[] = [];
  let origin: [number, number, number] | undefined;
  for (const mesh of input.geometry as readonly IfcAnalysisGeometry[]) {
    const offset = positions.length / 3;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      // Same origin as the analysis: the first physical input vertex.
      origin ??= [
        mesh.positions[i]!,
        mesh.positions[i + 1]!,
        mesh.positions[i + 2]!,
      ];
      const x = (mesh.positions[i]! - origin[0]) * scale - cx;
      const y = (mesh.positions[i + 1]! - origin[1]) * scale - cy;
      const z = (mesh.positions[i + 2]! - origin[2]) * scale;
      const along = x * dx + y * dy;
      const across = -x * dy + y * dx;
      positions.push(
        across,
        target.buildingLengthMm / 2 + along,
        z - analysis.geometry.ridgeLevelMm + target.ridgeLevelMm,
      );
    }
    for (let i = 0; i < mesh.indices.length; i++)
      indices.push(mesh.indices[i]! + offset);
  }
  if (!positions.length) return undefined;
  const width = analysis.proposed.buildingWidthMm;
  const length = analysis.proposed.buildingLengthMm;
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    outline: { lengthMm: length, widthMm: width },
    ridgeLengthMm:
      analysis.roofType === 'hip'
        ? (analysis.geometry.ridgeLengthMm ?? length - width)
        : length,
  };
}

/** What the IFC import hands to the workbench session (transient). */
export interface IfcRoofSource {
  geometry: IfcRoofAnalysisInput['geometry'];
  sourceToMillimetres?: number;
  analysis: SupportedIfcRoofAnalysis;
}
