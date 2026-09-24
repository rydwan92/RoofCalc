export * from './analysis';

export type IfcElementGroup = 'roof' | 'structure' | 'opening' | 'other';

export interface IfcElementSummary {
  /** Express ID is a parser handle for this session, never project identity. */
  expressId: number;
  globalId?: string;
  ifcClass: string;
  name?: string;
  description?: string;
  predefinedType?: string;
  storey?: string;
  material?: string;
  rawProperties?: Record<string, string>;
  group: IfcElementGroup;
}

export interface IfcSpatialNode {
  expressId: number;
  globalId?: string;
  ifcClass: string;
  name: string;
  parentExpressId?: number;
}

export interface IfcReferenceMetadata {
  fileName: string;
  fileSize: number;
  schema: string;
  sourceLengthUnit: string;
  sourceToMillimetres?: number;
  /** Source IFC coordinate origin is retained; rendering recentres separately. */
  sourceCoordinationMatrix: number[];
}

export interface IfcRoofCandidate {
  expressId: number;
  globalId?: string;
  name: string;
  sourceClass: string;
  evidence: string[];
}

export type IfcImportIssueCode =
  | 'invalid-ifc'
  | 'file-too-large'
  | 'unsupported-schema'
  | 'missing-units'
  | 'ambiguous-unit'
  | 'no-roof-candidate'
  | 'multiple-roofs'
  | 'unsupported-roof-shape'
  | 'parameter-required';

export interface IfcImportIssue {
  code: IfcImportIssueCode;
  expressId?: number;
}

export interface IfcReferenceSummary {
  metadata: IfcReferenceMetadata;
  elements: IfcElementSummary[];
  spatialNodes: IfcSpatialNode[];
  roofCandidates: IfcRoofCandidate[];
  issues: IfcImportIssue[];
}

export const MAX_IFC_FILE_BYTES = 100 * 1024 * 1024;

export function validateIfcFile(
  name: string,
  size: number,
): IfcImportIssueCode | undefined {
  if (!name.toLowerCase().endsWith('.ifc') || size <= 0) return 'invalid-ifc';
  if (size > MAX_IFC_FILE_BYTES) return 'file-too-large';
  return undefined;
}

export function classifyIfcElement(
  ifcClass: string,
  predefinedType?: string,
): IfcElementGroup {
  const kind = ifcClass.toUpperCase();
  if (
    kind === 'IFCROOF' ||
    kind === 'IFCCOVERING' ||
    (kind === 'IFCSLAB' && predefinedType?.toUpperCase() === 'ROOF')
  )
    return 'roof';
  if (kind === 'IFCBEAM' || kind === 'IFCMEMBER' || kind === 'IFCCOLUMN')
    return 'structure';
  if (
    kind === 'IFCOPENINGELEMENT' ||
    kind === 'IFCWINDOW' ||
    kind === 'IFCDOOR'
  )
    return 'opening';
  return 'other';
}

export function discoverRoofCandidates(
  elements: readonly IfcElementSummary[],
): IfcRoofCandidate[] {
  return elements
    .filter(
      (element) =>
        element.ifcClass.toUpperCase() === 'IFCROOF' ||
        (element.ifcClass.toUpperCase() === 'IFCSLAB' &&
          element.predefinedType?.toUpperCase() === 'ROOF'),
    )
    .map((element) => ({
      expressId: element.expressId,
      globalId: element.globalId,
      name: element.name || element.ifcClass,
      sourceClass: element.ifcClass,
      evidence:
        element.ifcClass.toUpperCase() === 'IFCROOF'
          ? ['ifc-roof-class']
          : ['ifc-slab-roof-predefined-type'],
    }));
}

/** IFC SI length unit Prefix + METRE -> exact millimetre multiplier. */
export function siLengthUnitToMillimetres(
  name: string,
  prefix?: string,
): number | undefined {
  if (name.toUpperCase() !== 'METRE') return undefined;
  const factors: Record<string, number> = {
    '': 1000,
    MILLI: 1,
    CENTI: 10,
    DECI: 100,
    KILO: 1_000_000,
  };
  return factors[(prefix ?? '').toUpperCase()];
}
export * from './hip-analysis';
export * from './reference';
