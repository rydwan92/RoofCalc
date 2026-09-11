import type { DrawingDimension } from '@cieslacalc/drawing-engine';
import type {
  AssemblySpec,
  RoofSkeleton,
  RoofTemplateSpec,
  SkeletonMember3D,
} from '@cieslacalc/timber-model';

export type WorkbenchMode = 'quick' | 'builder';
export type WorkbenchCanvasView = 'skeleton' | 'rafter' | 'hip';
export type ViewPreset = 'construction' | 'cuts';
export type DimensionLevel = 'minimal' | 'working' | 'full';
export type WorkbenchToolCategory = 'geometry' | 'timber' | 'support';
export type VisualInteractionState =
  'normal' | 'hover' | 'selected' | 'related' | 'muted' | 'warning' | 'invalid';

export interface WorkbenchViewState {
  mode: WorkbenchMode;
  selectedId: string;
  selectedPrototypeId?: string;
  canvasView: WorkbenchCanvasView;
  viewPreset: ViewPreset;
  isolateSelection: boolean;
  dimensionLevel: DimensionLevel;
  toolboxCollapsed: boolean;
  collapsedToolGroups: WorkbenchToolCategory[];
  inspectorOpen: boolean;
  preparationExpanded: boolean;
  focusId?: string;
  activeOperationId?: string;
  detailDrawer: {
    open: boolean;
    pinned: boolean;
    activePreviewId?: string;
    cutState: 'before' | 'after';
  };
}

export const initialWorkbenchViewState: WorkbenchViewState = {
  mode: 'quick',
  selectedId: 'roof',
  selectedPrototypeId: undefined,
  canvasView: 'skeleton',
  viewPreset: 'construction',
  isolateSelection: false,
  dimensionLevel: 'working',
  toolboxCollapsed: false,
  collapsedToolGroups: [],
  inspectorOpen: true,
  preparationExpanded: false,
  focusId: undefined,
  activeOperationId: undefined,
  detailDrawer: {
    open: false,
    pinned: false,
    activePreviewId: undefined,
    cutState: 'before',
  },
};

export interface WorkbenchProjectionPolicy {
  showRoofPlanes: boolean;
  showPrimaryMembers: boolean;
  showSecondaryMembers: boolean;
  showSupports: boolean;
  showCutMarkers: boolean;
  showDatums: boolean;
  showDimensions: boolean;
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
  return {
    showRoofPlanes: true,
    showPrimaryMembers: true,
    showSecondaryMembers: true,
    showSupports: true,
    showCutMarkers: cuts,
    showDatums: cuts,
    showDimensions: true,
    showDirectManipulation: !cuts,
    muteUnrelated: cuts || view.isolateSelection,
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
