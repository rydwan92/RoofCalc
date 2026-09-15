/** Renderer-neutral execution evidence. All lengths and areas are canonical mm/mm2. */
export type SectionKind =
  | 'project-summary'
  | 'roof-overview'
  | 'member-schedule'
  | 'member-fabrication'
  | 'cutting-plan'
  | 'layers'
  | 'covering'
  | 'assumptions';

export const sectionOrder: readonly SectionKind[] = [
  'project-summary',
  'roof-overview',
  'member-schedule',
  'member-fabrication',
  'cutting-plan',
  'layers',
  'covering',
  'assumptions',
];

export interface DocumentSource {
  projectId: string;
  projectName: string;
  projectCreatedAt: string;
  projectUpdatedAt: string;
  projectSchemaVersion: number;
}

export interface Point2D {
  x: number;
  y: number;
}
export interface DocumentDrawing {
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  lines: { id: string; from: Point2D; to: Point2D; role: string }[];
  polygons: { id: string; points: Point2D[]; role: string }[];
  dimensions: { id: string; valueMm: number; from: Point2D; to: Point2D }[];
}

export interface ProjectSummarySection {
  kind: 'project-summary';
  roofType: 'gable' | 'hip';
  structuralSystem: 'rafter' | 'rafter-collar-tie';
  buildingLengthMm: number;
  halfRunMm: number;
  pitchDeg: number;
  netRoofAreaMm2?: number;
  openingCount: number;
  timberFamilies: { code: string; count: number }[];
  enabledLayerCount: number;
  coveringCount: number;
  resolvedCoveringCount: number;
}
export interface RoofOverviewSection {
  kind: 'roof-overview';
  outlines: { id: string; points: Point2D[] }[];
  members: {
    id: string;
    code: string;
    from: Point2D;
    to: Point2D;
    role: string;
  }[];
  openings: { id: string; points: Point2D[] }[];
}
export interface MemberScheduleSection {
  kind: 'member-schedule';
  rows: {
    code: string;
    memberKind: string;
    count: number;
    widthMm?: number;
    depthMm?: number;
    minLengthMm: number;
    maxLengthMm: number;
    basis: 'axis-geometric' | 'resolved-visible';
  }[];
}
export interface MemberFabricationSection {
  kind: 'member-fabrication';
  code: 'K1';
  count: number;
  section: { widthMm: number; depthMm: number };
  requiredBlankLengthMm: number;
  ridgeConnection: 'ridge-board' | 'direct-meeting';
  drawing: DocumentDrawing;
  details: {
    type: 'birdsmouth-detail' | 'ridge-cut-detail';
    drawing: DocumentDrawing;
    dimensions: {
      labelKey: string;
      value: number;
      unit: 'length' | 'angle' | 'ratio';
    }[];
    steps: {
      action:
        | 'mark-plumb'
        | 'mark-seat'
        | 'check-depth'
        | 'measure-ridge-face'
        | 'mark-double-cheek'
        | 'check-backing';
      id: string;
      operationId: string;
      fromLabel?: string;
      targetLabel?: string;
      distanceMm?: number;
      angleDeg?: number;
      seatLengthMm?: number;
      normalDepthMm?: number;
      remainingDepthMm?: number;
    }[];
  }[];
}
export interface CuttingPlanSection {
  kind: 'cutting-plan';
  status: 'complete' | 'partial' | 'unfulfilled';
  stock: { lengthMm: number; count: number }[];
  usages: {
    id: string;
    lengthMm: number;
    cuts: {
      pieceId: string;
      label: string;
      fromMm: number;
      toMm: number;
      blankLengthMm: number;
    }[];
    remainingLengthMm: number;
    remnantClassification: 'none' | 'waste' | 'reusable-remnant';
  }[];
  requiredCount: number;
  assignedCount: number;
  unassignedCount: number;
  kerfMm: number;
  endTrimMm: number;
  minimumReusableRemnantMm: number;
  kerfLossMm: number;
  wasteLengthMm: number;
  reusableRemnantLengthMm: number;
}
export interface LayersSection {
  kind: 'layers';
  rows: {
    code: string;
    count?: number;
    lengthMm?: number;
    areaMm2?: number;
    basis: 'net-geometric' | 'resolved-visible' | 'axis-geometric';
    warnings: string[];
    layoutFacts?: {
      mode?: 'manual' | 'auto-from-covering';
      status: 'disabled' | 'resolved' | 'partial' | 'incomplete';
      actualGaugeMm?: number;
      minimumGaugeMm?: number;
      maximumGaugeMm?: number;
      planeCount?: number;
      courseCount?: number;
      axisCount?: number;
      segmentCount?: number;
    };
  }[];
}
export interface CoveringSection {
  kind: 'covering';
  rows: {
    name: string;
    family:
      | 'roof-tile'
      | 'modular-sheet'
      | 'modular-sheet-cut-to-length'
      | 'standing-seam';
    planeIds: string[];
    status: 'resolved' | 'unresolved';
    measure?: {
      kind: 'coverage-position' | 'geometric-run';
      count: number;
      full?: number;
      cut?: number;
    };
    warnings: string[];
  }[];
}
export interface AssumptionsSection {
  kind: 'assumptions';
  codes: (
    | 'ridge-board'
    | 'ridge-direct-meeting'
    | 'ridge-half-lap-unresolved'
    | 'collar-tie-geometric'
    | 'geometric-covering'
    | 'net-membrane'
    | 'no-structural-check'
    | 'unresolved-execution'
  )[];
}
export type ExecutionSection =
  | ProjectSummarySection
  | RoofOverviewSection
  | MemberScheduleSection
  | MemberFabricationSection
  | CuttingPlanSection
  | LayersSection
  | CoveringSection
  | AssumptionsSection;

export interface SectionCandidate {
  kind: SectionKind;
  readiness: 'available' | 'warning' | 'unavailable';
  reason?: string;
  section?: ExecutionSection;
}
export interface ExecutionDocument {
  version: 1;
  documentType: 'execution-package';
  source: DocumentSource;
  title: 'execution-package';
  generatedAt: string;
  sections: ExecutionSection[];
  warnings: string[];
}

export function buildExecutionDocument(input: {
  source: DocumentSource;
  candidates: readonly SectionCandidate[];
  selected: readonly SectionKind[];
  generatedAt: string;
}): ExecutionDocument {
  const selected = new Set(input.selected);
  const byKind = new Map(
    input.candidates.map((candidate) => [candidate.kind, candidate]),
  );
  const included = sectionOrder.flatMap((kind) => {
    const candidate = byKind.get(kind);
    return selected.has(kind) &&
      candidate?.readiness !== 'unavailable' &&
      candidate?.section?.kind === kind
      ? [candidate]
      : [];
  });
  return {
    version: 1,
    documentType: 'execution-package',
    source: input.source,
    title: 'execution-package',
    generatedAt: input.generatedAt,
    sections: included.map((candidate) => candidate.section!),
    warnings: included.flatMap((candidate) =>
      candidate.reason ? [candidate.reason] : [],
    ),
  };
}

export function defaultSectionSelection(
  candidates: readonly SectionCandidate[],
): SectionKind[] {
  const byKind = new Map(
    candidates.map((candidate) => [candidate.kind, candidate]),
  );
  return sectionOrder.filter(
    (kind) =>
      byKind.get(kind)?.readiness !== 'unavailable' &&
      !!byKind.get(kind)?.section,
  );
}
