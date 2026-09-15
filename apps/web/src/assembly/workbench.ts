import type {
  DrawingDimension,
  MeasurementResult,
  MeasurementSnapPoint,
} from '@cieslacalc/drawing-engine';
import type {
  AssemblySpec,
  RoofSkeleton,
  RoofTemplateSpec,
  SkeletonMember3D,
} from '@cieslacalc/timber-model';

export type WorkbenchMode = 'quick' | 'builder';
export type WorkbenchCanvasView = 'skeleton' | 'rafter' | 'hip';
export type ViewPreset =
  'construction' | 'openings' | 'layers' | 'covering' | 'cuts' | 'materials';
export type BuildUpView =
  'overview' | 'membrane' | 'counterBattens' | 'battens';
export type MaterialsView = 'summary' | 'schedule' | 'drawing';
export type MobilePanel = 'none' | 'tools' | 'inspector' | 'view';
export type DimensionLevel = 'minimal' | 'working' | 'full';
export type DetailDockMode = 'collapsed' | 'working' | 'focus';
export type WorkbenchToolCategory =
  'geometry' | 'timber' | 'support' | 'opening' | 'build-up' | 'quantity';
export type VisualInteractionState =
  'normal' | 'hover' | 'selected' | 'related' | 'muted' | 'warning' | 'invalid';

export interface RoofWindowPlacementToolState {
  kind: 'roof-window';
  mode: 'new' | 'duplicate';
  step: 'choose-plane' | 'position';
  roofPlaneId?: string;
  sourceFeatureId?: string;
}

export interface RoofWindowPlacementFeedback {
  featureId?: string;
  status: 'placed' | 'failed';
  reason?: 'no-rafter-bay' | 'opening-too-wide';
  memberInstanceIds?: [string, string];
  availableWidthMm?: number;
  requiredWidthMm?: number;
}

export interface RoofWindowLayoutFeedback {
  status: 'applied' | 'rejected';
  operation: 'align' | 'distribute';
  reason?:
    | 'not-enough-windows'
    | 'anchor-not-found'
    | 'cross-plane-selection'
    | 'alignment-does-not-fit'
    | 'distribution-does-not-fit';
  clearGapMm?: number;
}

export interface OperationMarkerLayoutInput {
  id: string;
  at: { x: number; y: number };
  active: boolean;
}

export interface OperationMarkerLayout extends OperationMarkerLayoutInput {
  marker: { x: number; y: number };
  compact: boolean;
}

export interface WorkbenchViewState {
  mode: WorkbenchMode;
  selectedId: string;
  /** Primary selection remains selectedId; these canonical feature IDs are transient. */
  selectedFeatureIds: string[];
  selectedPrototypeId?: string;
  /** Physical placement retained while an operation/detail becomes active. */
  selectedInstanceId?: string;
  /** Derived quantity row/instance selection; never enters project data/history. */
  selectedScheduleRowId?: string;
  selectedScheduleInstanceId?: string;
  /** Active primary covering editor target; view-only and never serialized. */
  selectedCoveringAssignmentId?: string;
  canvasView: WorkbenchCanvasView;
  viewPreset: ViewPreset;
  buildUpView: BuildUpView;
  materialsView: MaterialsView;
  /** Transient phone presentation; excluded from project documents and history. */
  mobilePanel: MobilePanel;
  /** View restored when a contextual cut detail is closed. */
  returnViewPreset?: ViewPreset;
  isolateSelection: boolean;
  dimensionLevel: DimensionLevel;
  toolboxCollapsed: boolean;
  collapsedToolGroups: WorkbenchToolCategory[];
  inspectorOpen: boolean;
  preparationExpanded: boolean;
  workspaceFocus: {
    active: boolean;
    restoreToolboxCollapsed?: boolean;
    restoreInspectorOpen?: boolean;
  };
  measurement?: {
    active: true;
    firstPoint?: MeasurementSnapPoint;
    result?: MeasurementResult;
  };
  focusId?: string;
  placementTool?: RoofWindowPlacementToolState;
  placementFeedback?: RoofWindowPlacementFeedback;
  windowLayoutFeedback?: RoofWindowLayoutFeedback;
  /** Transient preview; applying it is the only canonical/history mutation. */
  openingFramingProposalFeatureId?: string;
  /** Monotonic view-only signal consumed by the canvas. */
  fitRequestId: number;
  activeOperationId?: string;
  detailDrawer: {
    open: boolean;
    mode: DetailDockMode;
    pinned: boolean;
    activePreviewId?: string;
    cutState: 'before' | 'after';
  };
  layerVisibility: {
    dimensions: boolean;
    labels: boolean;
    structure: boolean;
    features: boolean;
    membrane: boolean;
    counterBattens: boolean;
    battens: boolean;
  };
}

export const initialWorkbenchViewState: WorkbenchViewState = {
  mode: 'quick',
  selectedId: 'roof',
  selectedFeatureIds: [],
  selectedPrototypeId: undefined,
  selectedInstanceId: undefined,
  selectedScheduleRowId: undefined,
  selectedScheduleInstanceId: undefined,
  selectedCoveringAssignmentId: undefined,
  canvasView: 'skeleton',
  viewPreset: 'construction',
  buildUpView: 'overview',
  materialsView: 'schedule',
  mobilePanel: 'none',
  returnViewPreset: undefined,
  isolateSelection: false,
  dimensionLevel: 'working',
  toolboxCollapsed: false,
  collapsedToolGroups: [],
  inspectorOpen: true,
  preparationExpanded: false,
  workspaceFocus: { active: false },
  measurement: undefined,
  focusId: undefined,
  placementTool: undefined,
  placementFeedback: undefined,
  windowLayoutFeedback: undefined,
  openingFramingProposalFeatureId: undefined,
  fitRequestId: 0,
  activeOperationId: undefined,
  detailDrawer: {
    open: false,
    mode: 'collapsed',
    pinned: false,
    activePreviewId: undefined,
    cutState: 'before',
  },
  layerVisibility: {
    dimensions: true,
    labels: true,
    structure: true,
    features: true,
    membrane: true,
    counterBattens: true,
    battens: true,
  },
};

export interface WorkbenchProjectionPolicy {
  showRoofPlanes: boolean;
  showPrimaryMembers: boolean;
  showSecondaryMembers: boolean;
  showSupports: boolean;
  showRoofFeatures: boolean;
  showMembrane: boolean;
  showCounterBattens: boolean;
  showBattens: boolean;
  showCutMarkers: boolean;
  showDatums: boolean;
  showDimensions: boolean;
  showLabels: boolean;
  showDirectManipulation: boolean;
  muteUnrelated: boolean;
  isolateSelection: boolean;
  effectiveDimensionLevel: DimensionLevel;
}

export function deriveWorkbenchProjectionPolicy(
  view: WorkbenchViewState,
  narrow = false,
): WorkbenchProjectionPolicy {
  const effectiveDimensionLevel =
    narrow && view.dimensionLevel === 'full' ? 'working' : view.dimensionLevel;
  const cuts = view.viewPreset === 'cuts';
  const openings = view.viewPreset === 'openings';
  const layers = view.viewPreset === 'layers';
  const covering = view.viewPreset === 'covering';
  const membrane =
    layers &&
    (view.buildUpView === 'overview' || view.buildUpView === 'membrane');
  const counterBattens =
    layers &&
    (view.buildUpView === 'overview' || view.buildUpView === 'counterBattens');
  const materials = view.viewPreset === 'materials';
  return {
    showRoofPlanes: true,
    showPrimaryMembers: view.layerVisibility.structure,
    showSecondaryMembers:
      view.layerVisibility.structure &&
      (!layers || view.buildUpView === 'counterBattens'),
    showSupports: true,
    showRoofFeatures:
      view.layerVisibility.features &&
      (openings ||
        layers ||
        covering ||
        view.selectedId.startsWith('feature:')),
    showMembrane: membrane && view.layerVisibility.membrane,
    showCounterBattens: counterBattens && view.layerVisibility.counterBattens,
    showBattens:
      ((layers &&
        (view.buildUpView === 'overview' || view.buildUpView === 'battens')) ||
        materials ||
        covering) &&
      view.layerVisibility.battens,
    showCutMarkers: cuts || !!view.selectedInstanceId,
    showDatums: cuts,
    showDimensions: view.layerVisibility.dimensions,
    showLabels: view.layerVisibility.labels,
    showDirectManipulation: !cuts && !materials && !covering,
    muteUnrelated:
      cuts ||
      openings ||
      layers ||
      covering ||
      (materials && !!view.selectedScheduleRowId) ||
      view.isolateSelection,
    isolateSelection: view.isolateSelection,
    effectiveDimensionLevel,
  };
}

export function dimensionAllowed(
  dimension: DrawingDimension,
  policy: WorkbenchProjectionPolicy,
  hasFocusedSelection: boolean,
): boolean {
  if (!policy.showDimensions || dimension.valueMm <= 1e-7) return false;
  const group = dimension.group ?? 'primary';
  if (policy.effectiveDimensionLevel === 'full') return true;
  if (policy.effectiveDimensionLevel === 'minimal') return group === 'primary';
  return group === 'primary' || hasFocusedSelection;
}

export function resolveMemberVisualState(args: {
  member: SkeletonMember3D;
  view: WorkbenchViewState;
  relatedSupportId?: string;
  relatedIds?: ReadonlySet<string>;
}): Exclude<VisualInteractionState, 'hover' | 'warning' | 'invalid'> {
  const { member, view, relatedSupportId, relatedIds } = args;
  const selected =
    view.selectedInstanceId === member.id ||
    view.selectedId === member.selectionId ||
    view.selectedId === member.id ||
    view.selectedId === member.prototypeId;
  if (selected) return 'selected';
  const related =
    relatedSupportId === member.selectionId ||
    relatedIds?.has(member.id) ||
    relatedIds?.has(member.selectionId ?? '') ||
    relatedIds?.has(member.prototypeId) ||
    (!!view.selectedPrototypeId &&
      view.selectedPrototypeId === member.prototypeId);
  if (related) return 'related';
  if (view.selectedId !== 'roof') return 'muted';
  return 'normal';
}

/** Small deterministic presentation policy; operation anchors stay canonical. */
export function layoutOperationMarkers(
  inputs: readonly OperationMarkerLayoutInput[],
  narrow: boolean,
): OperationMarkerLayout[] {
  const offsets = narrow
    ? [
        { x: 0, y: -18 },
        { x: 15, y: -25 },
        { x: -15, y: -25 },
        { x: 20, y: 4 },
        { x: -20, y: 4 },
      ]
    : [
        { x: 0, y: -24 },
        { x: 22, y: -34 },
        { x: -22, y: -34 },
        { x: 30, y: 4 },
        { x: -30, y: 4 },
        { x: 0, y: 22 },
      ];
  const threshold = narrow ? 25 : 38;
  const placed: { x: number; y: number }[] = [];
  const layouts = new Map<string, OperationMarkerLayout>();
  for (const input of [...inputs].sort(
    (a, b) => Number(b.active) - Number(a.active) || a.id.localeCompare(b.id),
  )) {
    const candidate =
      offsets.find((offset) => {
        const point = { x: input.at.x + offset.x, y: input.at.y + offset.y };
        return placed.every(
          (other) =>
            Math.hypot(point.x - other.x, point.y - other.y) >= threshold,
        );
      }) ?? offsets[placed.length % offsets.length]!;
    const marker = {
      x: input.at.x + candidate.x,
      y: input.at.y + candidate.y,
    };
    placed.push(marker);
    layouts.set(input.id, {
      ...input,
      marker,
      compact: narrow || !input.active,
    });
  }
  return inputs.map((input) => layouts.get(input.id)!);
}

export type LegendRole = 'family' | 'selected' | 'removed' | 'guide';
export interface WorkbenchLegendEntry {
  id: string;
  code?: string;
  labelKey: string;
  role: LegendRole;
}

export function createWorkbenchLegend(args: {
  skeleton: RoofSkeleton;
  policy: WorkbenchProjectionPolicy;
  hasSelection: boolean;
}): WorkbenchLegendEntry[] {
  const kinds = new Set(args.skeleton.members.map((member) => member.kind));
  const entries: WorkbenchLegendEntry[] = [];
  if (kinds.has('rafter'))
    entries.push({
      id: 'family:K1',
      code: 'K1',
      labelKey: 'commonRafter',
      role: 'family',
    });
  if (kinds.has('hip-rafter'))
    entries.push({
      id: 'family:H1',
      code: 'H1',
      labelKey: 'hipRafter',
      role: 'family',
    });
  if (kinds.has('jack-rafter'))
    entries.push({
      id: 'family:J1',
      code: 'J1',
      labelKey: 'jackRafter',
      role: 'family',
    });
  if (kinds.has('collar-tie'))
    entries.push({
      id: 'family:C1',
      code: 'C1',
      labelKey: 'collar-tie',
      role: 'family',
    });
  const purlinIds = [
    ...new Set(
      args.skeleton.members
        .filter((member) => member.kind === 'purlin')
        .map((member) => member.selectionId ?? member.prototypeId),
    ),
  ].sort();
  for (const id of purlinIds) {
    const number = /purlin-(\d+)$/.exec(id)?.[1];
    entries.push({
      id: `family:${id}`,
      code: number ? `P${number}` : 'P',
      labelKey: 'purlin',
      role: 'family',
    });
  }
  if (args.hasSelection)
    entries.push({
      id: 'semantic:selected',
      labelKey: 'legendSelected',
      role: 'selected',
    });
  if (args.policy.showCutMarkers)
    entries.push({
      id: 'semantic:removed',
      labelKey: 'legendRemoved',
      role: 'removed',
    });
  if (args.policy.showRoofPlanes)
    entries.push({
      id: 'semantic:guide',
      labelKey: 'legendGuide',
      role: 'guide',
    });
  return entries;
}

export type ToolIconKey = 'roof' | 'timber' | 'support' | 'ridge' | 'add';
export interface WorkbenchToolDescriptor {
  id: string;
  category: WorkbenchToolCategory;
  action: 'select' | 'add-purlin';
  selectionId?: string;
  prototypeId?: string;
  labelKey: string;
  code?: string;
  icon: ToolIconKey;
  enabled: boolean;
}

export function memberInstanceCode(id: string) {
  const common = /instance:(?:rafter-pair|hip-common-pair)-(\d+):/.exec(id);
  if (common) return `K1-${common[1]!.padStart(2, '0')}`;
  const jack = /instance:jack:[^:]+:[^:]+:(\d+)$/.exec(id);
  if (jack) return `J1-${jack[1]!.padStart(2, '0')}`;
  if (id.startsWith('instance:hip:')) return 'H1';
  return id;
}

/** Web-layer registry for real, currently implemented workbench tools only. */
export function createWorkbenchToolRegistry(args: {
  template: RoofTemplateSpec;
  spec: AssemblySpec;
  canAddPurlin: boolean;
}): WorkbenchToolDescriptor[] {
  const tools: WorkbenchToolDescriptor[] = [
    {
      id: 'tool:roof',
      category: 'geometry',
      action: 'select',
      selectionId: 'roof',
      labelKey: 'roof',
      icon: 'roof',
      enabled: true,
    },
    {
      id: 'tool:K1',
      category: 'timber',
      action: 'select',
      selectionId: args.spec.member.id,
      prototypeId: args.spec.member.id,
      labelKey: 'rafter',
      code: 'K1',
      icon: 'timber',
      enabled: true,
    },
  ];
  if (args.template.type === 'gable' && args.template.structure?.collarTie) {
    tools.push({
      id: 'tool:collar-tie',
      category: 'timber',
      action: 'select',
      selectionId: 'member:collar-tie-1',
      prototypeId: 'member:collar-tie-1',
      labelKey: 'collar-tie',
      code: 'C1',
      icon: 'timber',
      enabled: true,
    });
  }
  if (args.template.type === 'hip') {
    tools.push(
      {
        id: 'tool:H1',
        category: 'timber',
        action: 'select',
        selectionId: 'member:hip-rafter-H1',
        prototypeId: 'member:hip-rafter-H1',
        labelKey: 'hipRafter',
        code: 'H1',
        icon: 'timber',
        enabled: true,
      },
      {
        id: 'tool:J1',
        category: 'timber',
        action: 'select',
        selectionId: 'member:jack-rafter-J1',
        prototypeId: 'member:jack-rafter-J1',
        labelKey: 'jackRafter',
        code: 'J1',
        icon: 'timber',
        enabled: true,
      },
    );
  }
  tools.push(
    ...args.spec.supports.map((support) => ({
      id: `tool:${support.id}`,
      category: 'support' as const,
      action: 'select' as const,
      selectionId: support.id,
      labelKey: support.kind,
      code: /^support:purlin-(\d+)$/.exec(support.id)?.[1]
        ? `P${/^support:purlin-(\d+)$/.exec(support.id)![1]}`
        : undefined,
      icon: 'support' as const,
      enabled: true,
    })),
    {
      id: 'tool:add-purlin',
      category: 'support',
      action: 'add-purlin',
      labelKey: 'addPurlin',
      icon: 'add',
      enabled: args.canAddPurlin,
    },
    {
      id: 'tool:ridge',
      category: 'support',
      action: 'select',
      selectionId: args.spec.ridge.id,
      labelKey: 'ridge',
      icon: 'ridge',
      enabled: true,
    },
  );
  return tools;
}
