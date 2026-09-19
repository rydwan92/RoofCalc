/** Renderer-neutral execution evidence. All lengths and areas are canonical mm/mm2. */
export type SectionKind =
  | 'project-summary'
  | 'roof-overview'
  | 'member-schedule'
  | 'member-fabrication'
  | 'cutting-plan'
  | 'layers'
  | 'covering'
  | 'drainage-plan'
  | 'assumptions'
  | 'material-list'
  | 'cost-estimate';

export const sectionOrder: readonly SectionKind[] = [
  'project-summary',
  'roof-overview',
  'member-schedule',
  'member-fabrication',
  'cutting-plan',
  'layers',
  'covering',
  'drainage-plan',
  'assumptions',
  'material-list',
  'cost-estimate',
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
    basis:
      | 'net-geometric'
      | 'gross-installed'
      | 'resolved-visible'
      | 'axis-geometric';
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
      decisionStatus?:
        | 'ready'
        | 'partially-automatic'
        | 'decision-required'
        | 'incompatible'
        | 'no-data';
      decisionIssueCodes?: string[];
      gaugeSource?:
        'manufacturer-product-data' | 'project-user-input' | 'unavailable';
      eaveOffsetMm?: number;
      ridgeOffsetMm?: number;
      /** V43B workflow facts copied from the app projection, never recomputed. */
      workflowState?: string;
      coveringProduct?: string;
      installationModeId?: string;
      hipDetail?: 'not-decided' | 'no-dedicated-run' | 'paired-plane-runs';
      hipBoundaryCount?: number;
      unresolvedHipBoundaryCount?: number;
      // Per-plane solver evidence: never infer one gauge for unequal planes.
      autoPlans?: {
        planeId: string;
        regularSpanMm: number;
        targetGaugeMm: number;
        intervalCount: number;
        courseCount: number;
        actualGaugeMm: number;
        firstStationMm: number;
        lastStationMm: number;
      }[];
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
    /**
     * V50 execution facts for a roof-tile row, copied from the resolved
     * layout and the prepared purchase plan. Packaging stays in the material
     * list; this is what the roofer lays.
     */
    tile?: {
      installationModeId?: string;
      courseCount?: number;
      gaugeMinMm?: number;
      gaugeMaxMm?: number;
      accessories: {
        role: string;
        name?: string;
        quantity?: number;
        status: string;
      }[];
    };
    warnings: string[];
  }[];
}
/**
 * A translated-by-code fact. Numbers stay canonical (mm, mm², m² where the
 * code says so); the renderer owns wording and formatting.
 */
export interface DocumentFact {
  code: string;
  params?: Record<string, string | number>;
}
/**
 * V47: what the document covers (scope), what this project's result does not
 * yet resolve (limitations, read from resolver facts) and what RoofCalc does
 * not model at all. No generic disclaimer lives here.
 */
export interface AssumptionsSection {
  kind: 'assumptions';
  scope: DocumentFact[];
  limitations: DocumentFact[];
  notModelled: DocumentFact[];
}
/**
 * V47 document readiness as printed: a working document carries its open
 * warnings/blockers visibly, never only in the application UI.
 */
export interface DocumentStatus {
  state: 'ready' | 'warning' | 'blocked';
  issues: (DocumentFact & { severity: 'blocker' | 'warning' })[];
}
/**
 * Renderer-neutral cost estimate evidence (V34B). Numbers only — no
 * translation, no product/geometry concept. `basis` mirrors
 * `@cieslacalc/cost-core`'s `CostQuantityBasis` as plain strings so this
 * package keeps its zero-dependency guarantee while staying honest about
 * what each line's quantity means (never a hidden purchase-count claim).
 */
export interface CostEstimateSection {
  kind: 'cost-estimate';
  currencyCode: string;
  taxRateBps?: number;
  lines: {
    category: 'material' | 'labour' | 'transport' | 'equipment' | 'other';
    label: string;
    quantityValue: number;
    quantityUnit:
      'piece' | 'pack' | 'pallet' | 'm' | 'm2' | 'm3' | 'kg' | 'hour' | 'flat';
    basis:
      | 'procurement-stock'
      | 'fabrication-requirement'
      | 'geometric-length'
      | 'net-area'
      | 'gross-area'
      | 'effective-coverage'
      | 'manual';
    unitPriceMinor?: number;
    netMinor?: number;
    taxMinor?: number;
    grossMinor?: number;
    noteKeys: string[];
  }[];
  categoryTotals: { category: string; netMinor: number }[];
  netMinor: number;
  taxMinor?: number;
  grossMinor?: number;
  complete: boolean;
}

export interface MaterialListSection {
  kind: 'material-list';
  rows: {
    category: string;
    labelKey: string;
    description?: string;
    product?: string;
    basis: string;
    quantity?: number;
    minimumQuantity?: number;
    maximumQuantity?: number;
    unit: string;
    partial: boolean;
    warnings: string[];
    metrics: {
      labelKey: string;
      value: number;
      maxValue?: number;
      unit: string;
    }[];
    priceProvenance?: string;
    unitPriceMinor?: number;
    minimumValueMinor?: number;
    maximumValueMinor?: number;
    currencyCode?: string;
  }[];
}

/**
 * V51 concise drainage plan for the execution package: where the gutters
 * run, where the outlets and downpipes are. Quantities and prices belong to
 * the material list and cost estimate, never here. Numbers are canonical mm.
 */
export interface DrainagePlanSection {
  kind: 'drainage-plan';
  systemName?: string;
  layout: 'proposed' | 'manual';
  /** Plan-view roof outline and gutter/outlet geometry (x right, y up). */
  outlines: { id: string; points: Point2D[] }[];
  gutters: {
    eaveLabel: string;
    from: Point2D;
    to: Point2D;
    lengthMm: number;
  }[];
  runs: {
    label: string;
    eaveLabels: string[];
    lengthMm: number;
    closed: boolean;
    connectedCorners: number;
  }[];
  outlets: {
    label: string;
    eaveLabel: string;
    at: Point2D;
    distanceFromEaveStartMm: number;
    downpipeHeightMm?: number;
    elbows?: number;
  }[];
  hookSpacingMm?: number;
  /** Always true: hydraulic adequacy is not assessed. */
  hydraulicsNotVerified: true;
}

export type ExecutionSection =
  | ProjectSummarySection
  | RoofOverviewSection
  | MemberScheduleSection
  | MemberFabricationSection
  | CuttingPlanSection
  | LayersSection
  | CoveringSection
  | DrainagePlanSection
  | AssumptionsSection
  | MaterialListSection
  | CostEstimateSection;

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
  /** Absent on documents built before V47 readiness existed. */
  status?: DocumentStatus;
}

export function buildExecutionDocument(input: {
  source: DocumentSource;
  candidates: readonly SectionCandidate[];
  selected: readonly SectionKind[];
  generatedAt: string;
  status?: DocumentStatus;
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
    ...(input.status ? { status: input.status } : {}),
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
