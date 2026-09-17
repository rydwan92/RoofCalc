import { create } from 'zustand';
import {
  fitInstallationToRoof,
  withBattensForNewCovering,
} from './installation-repair';
import type {
  CoveringAssignmentSpec,
  MembraneProductSelection,
} from '@cieslacalc/covering-core';
import {
  createRoofProjectDocument,
  parseRoofProjectDocument,
  reconcilePlaneScopes,
  type RoofProjectDocumentV1,
} from '@cieslacalc/calculator-core';
import {
  measureDistance3d,
  type MeasurementSnapPoint,
} from '@cieslacalc/drawing-engine';
import {
  addPurlin,
  alignRoofWindows,
  assemblyDefaults,
  assemblyFromRoofTemplate,
  calculateBirdsmouth,
  clampCollarTieHeightMm,
  clampRoofWindow,
  convertRoofTemplate,
  createDefaultRoofWindow,
  createOpeningFramingDraft,
  createRoofSkeleton,
  distributeRoofWindowsAlongEave,
  distributePurlins,
  gableTemplateFromAssembly,
  HIP_RAFTER_PROTOTYPE_ID,
  JACK_RAFTER_PROTOTYPE_ID,
  maxCollarTieHeightMm,
  resolveRoofWindowPlacement,
  resolveOpeningFraming,
  resolveOpeningFramingSet,
  roofTemplateFromAssembly,
  seatLength,
  toMillimetres,
  type LengthUnit,
  type RoofWindowAlignmentMode,
  type RoofWindowAlignmentResult,
  type RoofWindowDistributionResult,
} from '@cieslacalc/roof-math';
import type {
  AssemblySpec,
  BattenLayoutSpec,
  CounterBattenLayoutSpec,
  HipCounterBattenDetail,
  HipExecutionIntent,
  EndStationPolicy,
  RafterSpacingMode,
  RidgeConnectionType,
  RoofTemplateSpec,
  RoofOpeningFramingSpec,
  MembraneLayerSpec,
  RoofWindowFeature,
  SupportSpec,
} from '@cieslacalc/timber-model';
import { editableLength, parseDecimal } from '../format';
import { loadDisplayUnit, saveDisplayUnit } from '../unit-preference';
import {
  currentWorkbenchLocation,
  initialWorkbenchViewState,
  pushNavigationTrail,
  sameWorkbenchLocation,
  supportsTechnical3D,
  tasksForPerspective,
  type WorkbenchLocation,
  type WorkbenchPerspective,
  type BuildUpView,
  type DimensionLevel,
  type ViewPreset,
  type MaterialsView,
  type MobilePanel,
  type WorkbenchCanvasView,
  type WorkbenchMode,
  type WorkbenchToolCategory,
  type WorkbenchViewState,
  type WorkspaceRenderer,
} from './workbench';

export type SupportField = 'xMm' | 'widthMm' | 'heightMm' | 'valueMm';
export type EditField =
  | 'roof.runMm'
  | 'roof.pitchDeg'
  | 'roof.overhangMm'
  | 'member.widthMm'
  | 'member.depthMm'
  | 'hip.widthMm'
  | 'hip.depthMm'
  | 'ridge.thicknessMm'
  | 'ridge.depthMm'
  | 'template.buildingLengthMm'
  | 'template.rafterSpacingMm'
  | 'collarTie.heightAboveWallPlateMm'
  | 'collarTie.widthMm'
  | 'collarTie.depthMm'
  | `support/${string}/${SupportField}`;
type AssemblyEditField = Exclude<
  EditField,
  | 'template.buildingLengthMm'
  | 'template.rafterSpacingMm'
  | 'hip.widthMm'
  | 'hip.depthMm'
  | 'collarTie.heightAboveWallPlateMm'
  | 'collarTie.widthMm'
  | 'collarTie.depthMm'
>;
export const supportField = (id: string, field: SupportField): EditField =>
  `support/${id}/${field}`;
export function editableFields(spec: AssemblySpec): EditField[] {
  return [
    'roof.runMm',
    'roof.pitchDeg',
    'roof.overhangMm',
    'member.widthMm',
    'member.depthMm',
    'ridge.thicknessMm',
    'ridge.depthMm',
    'template.buildingLengthMm',
    'template.rafterSpacingMm',
    ...spec.supports.flatMap((s) =>
      (['xMm', 'widthMm', 'heightMm', 'valueMm'] as const).map((f) =>
        supportField(s.id, f),
      ),
    ),
  ];
}
export function editValue(
  spec: AssemblySpec,
  field: EditField,
  template?: RoofTemplateSpec,
): number {
  if (field === 'template.buildingLengthMm')
    return template?.buildingLengthMm ?? NaN;
  if (field === 'template.rafterSpacingMm')
    return template?.rafterSpacing.spacingMm ?? NaN;
  if (field === 'hip.widthMm')
    return template?.type === 'hip' ? template.hipRafterSection.widthMm : NaN;
  if (field === 'hip.depthMm')
    return template?.type === 'hip' ? template.hipRafterSection.depthMm : NaN;
  if (field === 'collarTie.heightAboveWallPlateMm')
    return template?.type === 'gable'
      ? (template.structure?.collarTie?.heightAboveWallPlateMm ?? NaN)
      : NaN;
  if (field === 'collarTie.widthMm')
    return template?.type === 'gable'
      ? (template.structure?.collarTie?.section.widthMm ?? NaN)
      : NaN;
  if (field === 'collarTie.depthMm')
    return template?.type === 'gable'
      ? (template.structure?.collarTie?.section.depthMm ?? NaN)
      : NaN;
  if (field === 'ridge.depthMm') return spec.ridge.depthMm ?? NaN;
  if (field.startsWith('support/')) {
    const [, id, key] = field.split('/');
    const support = spec.supports.find((s) => s.id === id)!;
    return key === 'xMm'
      ? support.placement.xMm
      : key === 'valueMm'
        ? support.joint.valueMm
        : support.section[key as 'widthMm' | 'heightMm'];
  }
  switch (field) {
    case 'roof.runMm':
      return spec.roof.runMm;
    case 'roof.pitchDeg':
      return spec.roof.pitchDeg;
    case 'roof.overhangMm':
      return spec.roof.overhangMm;
    case 'member.widthMm':
      return spec.member.section.widthMm;
    case 'member.depthMm':
      return spec.member.section.depthMm;
    default:
      return spec.ridge.thicknessMm;
  }
}
function editedSpec(
  spec: AssemblySpec,
  field: AssemblyEditField,
  value: number,
): AssemblySpec {
  const next = structuredClone(spec);
  if (field.startsWith('support/')) {
    const [, id, key] = field.split('/');
    const support = next.supports.find((s) => s.id === id)!;
    if (key === 'xMm') support.placement.xMm = value;
    else if (key === 'valueMm') support.joint.valueMm = value;
    else support.section[key as 'widthMm' | 'heightMm'] = value;
  } else {
    switch (field) {
      case 'roof.runMm':
        next.roof.runMm = value;
        break;
      case 'roof.pitchDeg':
        next.roof.pitchDeg = value;
        break;
      case 'roof.overhangMm':
        next.roof.overhangMm = value;
        break;
      case 'member.widthMm':
        next.member.section.widthMm = value;
        break;
      case 'member.depthMm':
        next.member.section.depthMm = value;
        break;
      case 'ridge.thicknessMm':
        next.ridge.thicknessMm = value;
        break;
      case 'ridge.depthMm':
        if (Number.isFinite(value)) next.ridge.depthMm = value;
        else delete next.ridge.depthMm;
        break;
    }
  }
  return next;
}
const templateDefaults = gableTemplateFromAssembly(assemblyDefaults);
export const createDefaultProjectDocument = () =>
  createRoofProjectDocument(structuredClone(templateDefaults));
function nextRoofWindowId(features: readonly { id: string }[]) {
  const nextNumber =
    Math.max(
      0,
      ...features.map((feature) =>
        Number(/roof-window-(\d+)$/.exec(feature.id)?.[1] ?? 0),
      ),
    ) + 1;
  return `feature:roof-window-${nextNumber}`;
}
function valueForTemplate(
  template: RoofTemplateSpec,
  spec: AssemblySpec,
  field: EditField,
): number {
  return editValue(spec, field, template);
}
function editedTemplate(
  template: RoofTemplateSpec,
  spec: AssemblySpec,
  field: EditField,
  value: number,
): RoofTemplateSpec {
  if (field === 'template.buildingLengthMm')
    return {
      ...template,
      buildingLengthMm: value,
    };
  if (field === 'template.rafterSpacingMm')
    return {
      ...template,
      rafterSpacing: { ...template.rafterSpacing, spacingMm: value },
    };
  if (field === 'hip.widthMm' || field === 'hip.depthMm') {
    if (template.type !== 'hip') throw new RangeError('hip_template_required');
    const key = field === 'hip.widthMm' ? 'widthMm' : 'depthMm';
    return {
      ...template,
      hipRafterSection: { ...template.hipRafterSection, [key]: value },
    };
  }
  if (
    field === 'collarTie.heightAboveWallPlateMm' ||
    field === 'collarTie.widthMm' ||
    field === 'collarTie.depthMm'
  ) {
    if (template.type !== 'gable' || !template.structure?.collarTie)
      throw new RangeError('collar_tie_required');
    const collarTie = template.structure.collarTie;
    return {
      ...template,
      structure: {
        ...template.structure,
        collarTie:
          field === 'collarTie.heightAboveWallPlateMm'
            ? { ...collarTie, heightAboveWallPlateMm: value }
            : {
                ...collarTie,
                section: {
                  ...collarTie.section,
                  [field === 'collarTie.widthMm' ? 'widthMm' : 'depthMm']:
                    value,
                },
              },
      },
    };
  }
  return roofTemplateFromAssembly(
    editedSpec(spec, field as AssemblyEditField, value),
    template,
  );
}
function committedTemplate(
  template: RoofTemplateSpec,
  drafts: Partial<Record<EditField, string>>,
  invalidFields: Partial<Record<EditField, boolean>>,
  currentDocument?: RoofProjectDocumentV1,
) {
  const spec = assemblyFromRoofTemplate(template);
  return {
    projectDocument: createRoofProjectDocument(template, {
      features: currentDocument?.project.features ?? [],
      openingFraming: currentDocument?.project.openingFraming ?? [],
      buildUp: currentDocument?.project.buildUp ?? {},
      coverings: currentDocument?.project.coverings ?? [],
      membraneProduct: currentDocument?.project.membraneProduct,
    }),
    template,
    spec,
    drafts,
    invalidFields,
  };
}
function committedDocument(
  document: RoofProjectDocumentV1,
  drafts: Partial<Record<EditField, string>>,
  invalidFields: Partial<Record<EditField, boolean>>,
) {
  return committedTemplate(
    document.project.roof,
    drafts,
    invalidFields,
    document,
  );
}
interface DomainSnapshot {
  document: RoofProjectDocumentV1;
}
const historyLimit = 40;
const snapshot = (document: RoofProjectDocumentV1): DomainSnapshot => ({
  document: structuredClone(document),
});
const sameDocument = (a: RoofProjectDocumentV1, b: RoofProjectDocumentV1) =>
  JSON.stringify(a) === JSON.stringify(b);
export interface AssemblyState {
  /** Future persistence/revision boundary. `template` and `spec` are runtime derivatives. */
  projectDocument: RoofProjectDocumentV1;
  template: RoofTemplateSpec;
  spec: AssemblySpec;
  /** Transient session/view state. Never serialized as project data. */
  workbench: WorkbenchViewState;
  unit: LengthUnit;
  /** Transient editor text; canonical values are committed into projectDocument. */
  drafts: Partial<Record<EditField, string>>;
  invalidFields: Partial<Record<EditField, boolean>>;
  historyPast: DomainSnapshot[];
  historyFuture: DomainSnapshot[];
  activeTransaction?: DomainSnapshot;
  setMode: (mode: WorkbenchMode) => void;
  setRoofType: (type: RoofTemplateSpec['type']) => void;
  setRoofStructureSystem: (system: 'rafter' | 'rafter-collar-tie') => void;
  setRidgeConnection: (connection: RidgeConnectionType) => void;
  setProjectRoof: (template: RoofTemplateSpec) => void;
  setView: (view: WorkbenchCanvasView) => void;
  /** V38 transient 2D/3D workspace renderer. Never history, never persisted. */
  setWorkspaceRenderer: (renderer: WorkspaceRenderer) => void;
  setViewPreset: (preset: ViewPreset) => void;
  setBuildUpView: (view: BuildUpView) => void;
  setMaterialsView: (view: MaterialsView) => void;
  setMobilePanel: (panel: MobilePanel) => void;
  setScheduleSelection: (rowId?: string, instanceId?: string) => void;
  setSelectedCoveringAssignment: (assignmentId?: string) => void;
  setIsolation: (isolated: boolean) => void;
  setDimensionLevel: (level: DimensionLevel) => void;
  setLayerVisibility: (
    layer: keyof WorkbenchViewState['layerVisibility'],
    visible: boolean,
  ) => void;
  setToolboxCollapsed: (collapsed: boolean) => void;
  setToolGroupCollapsed: (
    category: WorkbenchToolCategory,
    collapsed: boolean,
  ) => void;
  setInspectorOpen: (open: boolean) => void;
  setPreparationExpanded: (expanded: boolean) => void;
  setWorkspaceFocus: (active: boolean) => void;
  toggleMeasurement: () => void;
  chooseMeasurementPoint: (point: MeasurementSnapPoint) => void;
  cancelMeasurement: () => void;
  setFocusId: (focusId?: string) => void;
  requestFit: () => void;
  setDetailDrawer: (
    detail: Partial<WorkbenchViewState['detailDrawer']>,
  ) => void;
  closeDetailDrawer: () => void;
  activateOperation: (args: {
    operationId: string;
    prototypeId: string;
    selectionId?: string;
    instanceId?: string;
    previewId?: string;
  }) => void;
  navigateToInstance: (args: {
    instanceId: string;
    prototypeId: string;
    operationIds: string[];
  }) => void;
  stepBackContext: () => void;
  /** V37 top-level perspective switch; clears the transient return trail. */
  navigatePerspective: (perspective: WorkbenchPerspective) => void;
  /** Cross-context jump; remembers the current location for "Wróć". */
  navigateTo: (
    location: WorkbenchLocation,
    options?: { remember?: boolean },
  ) => void;
  /** Returns to the last remembered location. Never touches edit history. */
  navigateBack: () => void;
  beginRoofWindowPlacement: () => void;
  beginRoofWindowDuplicatePlacement: (sourceFeatureId: string) => boolean;
  setRoofWindowPlacementPlane: (roofPlaneId?: string) => void;
  cancelRoofWindowPlacement: () => void;
  placeRoofWindowAt: (
    roofPlaneId: string,
    position: RoofWindowFeature['position'],
  ) => string | undefined;
  selectRoofWindow: (id: string, additive?: boolean) => void;
  clearRoofWindowSelection: () => void;
  alignSelectedRoofWindows: (
    mode: RoofWindowAlignmentMode,
  ) => RoofWindowAlignmentResult;
  distributeSelectedRoofWindows: () => RoofWindowDistributionResult;
  setUnit: (unit: LengthUnit) => void;
  setField: (field: EditField, raw: string) => void;
  setCanonicalField: (field: EditField, value: number) => void;
  stepField: (field: EditField, delta: number) => void;
  setSpacingMode: (mode: RafterSpacingMode) => void;
  setEndStationPolicy: (policy: EndStationPolicy) => void;
  movePurlin: (id: string, xMm: number) => void;
  distributePurlins: () => void;
  addRoofWindow: () => void;
  removeRoofWindow: (id: string) => void;
  updateRoofWindow: (
    id: string,
    patch: Partial<
      Pick<
        RoofWindowFeature,
        'roofPlaneId' | 'widthMm' | 'heightMm' | 'clearanceMm' | 'position'
      >
    >,
  ) => void;
  moveRoofWindow: (id: string, position: RoofWindowFeature['position']) => void;
  placeRoofWindowBetweenRafters: (id: string) => boolean;
  planOpeningFraming: (featureId: string) => void;
  cancelOpeningFramingProposal: () => void;
  applyOpeningFraming: (featureId: string) => boolean;
  removeOpeningFraming: (featureId: string) => void;
  setBattenLayout: (layout?: BattenLayoutSpec) => void;
  /** V46: one undoable repair of covering/batten/layer scope for this roof. */
  fitInstallationToRoof: () => void;
  setMembraneLayer: (layer?: MembraneLayerSpec) => void;
  setMembraneProduct: (product?: MembraneProductSelection) => void;
  setCounterBattenLayout: (layout?: CounterBattenLayoutSpec) => void;
  /**
   * V39 hip-boundary counter-batten detail. Canonical execution intent, so it
   * is a normal undoable edit — unlike the transient 3D display toggles.
   */
  setHipCounterBattenDetail: (detail: HipCounterBattenDetail) => void;
  /** V39 hip execution intent (top treatment, jack connection). Canonical. */
  setHipExecution: (intent: HipExecutionIntent) => void;
  setCoveringAssignments: (assignments: CoveringAssignmentSpec[]) => void;
  add: () => void;
  remove: (id: string) => void;
  select: (id: string, prototypeId?: string) => void;
  beginTransaction: () => void;
  commitTransaction: () => void;
  cancelTransaction: () => void;
  undo: () => void;
  redo: () => void;
  setJointControl: (
    id: string,
    control: SupportSpec['joint']['control'],
  ) => void;
  reset: () => void;
  replaceProjectDocument: (document: RoofProjectDocumentV1) => void;
}
function withHistory(
  state: AssemblyState,
  next: ReturnType<typeof committedTemplate>,
) {
  // An open gesture transaction already owns the single history entry, so the
  // cheap flag is checked before the deep document comparison. Reversing these
  // ran two JSON.stringify passes over the whole document on every drag frame.
  if (
    state.activeTransaction ||
    sameDocument(state.projectDocument, next.projectDocument)
  )
    return next;
  return {
    ...next,
    historyPast: [...state.historyPast, snapshot(state.projectDocument)].slice(
      -historyLimit,
    ),
    historyFuture: [],
  };
}
/** Transient cleanup shared by every task switch. Creates no history. */
function withViewPreset(
  workbench: WorkbenchViewState,
  viewPreset: ViewPreset,
): WorkbenchViewState {
  return {
    ...workbench,
    viewPreset,
    // The renderer is a property of the workspace, so a task without a
    // technical 3D workspace falls back to 2D rather than showing nothing.
    workspaceRenderer: supportsTechnical3D(viewPreset)
      ? workbench.workspaceRenderer
      : '2d',
    mobilePanel: 'none',
    measurement: undefined,
    returnViewPreset:
      viewPreset === 'cuts' ? workbench.returnViewPreset : undefined,
    placementTool:
      viewPreset === 'openings' ? workbench.placementTool : undefined,
    selectedFeatureIds:
      viewPreset === 'openings' ? workbench.selectedFeatureIds : [],
    placementFeedback:
      viewPreset === 'openings' ? workbench.placementFeedback : undefined,
    selectedScheduleRowId:
      viewPreset === 'materials' ? workbench.selectedScheduleRowId : undefined,
    selectedScheduleInstanceId:
      viewPreset === 'materials'
        ? workbench.selectedScheduleInstanceId
        : undefined,
    openingFramingProposalFeatureId:
      viewPreset === 'openings'
        ? workbench.openingFramingProposalFeatureId
        : undefined,
    activeOperationId:
      viewPreset === 'cuts' ? workbench.activeOperationId : undefined,
    focusId: viewPreset === 'cuts' ? workbench.focusId : undefined,
    detailDrawer:
      viewPreset === 'cuts'
        ? workbench.detailDrawer
        : {
            ...workbench.detailDrawer,
            open: false,
            mode: 'collapsed',
            activePreviewId: undefined,
          },
  };
}
function materialsViewFor(
  location: WorkbenchLocation,
  current: MaterialsView,
): MaterialsView {
  if (location.task !== 'materials') return current;
  return location.localView && location.localView !== 'document-preview'
    ? location.localView
    : 'plan';
}
function restoredSnapshot(snapshotToRestore: DomainSnapshot) {
  return committedTemplate(
    structuredClone(snapshotToRestore.document.project.roof),
    {},
    {},
    snapshotToRestore.document,
  );
}
export const useAssembly = create<AssemblyState>((set) => ({
  projectDocument: createRoofProjectDocument(structuredClone(templateDefaults)),
  template: structuredClone(templateDefaults),
  spec: assemblyFromRoofTemplate(templateDefaults),
  workbench: structuredClone(initialWorkbenchViewState),
  unit: loadDisplayUnit(),
  drafts: {},
  invalidFields: {},
  historyPast: [],
  historyFuture: [],
  activeTransaction: undefined,
  setMode: (mode) =>
    set((state) => ({
      workbench: {
        ...state.workbench,
        mode,
        focusId: undefined,
        measurement:
          mode === 'builder' ? state.workbench.measurement : undefined,
      },
    })),
  setRoofType: (type) =>
    set((state) => {
      const template = convertRoofTemplate(state.template, type);
      // V46: plane IDs belong to the template, so coverings and build-up
      // layers follow the new roof in the same undoable edit.
      const project = state.projectDocument.project;
      const scopes = reconcilePlaneScopes({
        previousTemplate: state.template,
        nextTemplate: template,
        coverings: project.coverings,
        buildUp: project.buildUp,
      });
      return {
        ...withHistory(
          state,
          committedTemplate(template, state.drafts, state.invalidFields, {
            ...state.projectDocument,
            project: {
              ...project,
              coverings: scopes.coverings,
              buildUp: scopes.buildUp,
            },
          }),
        ),
        workbench: {
          ...state.workbench,
          selectedId: 'roof',
          selectedFeatureIds: [],
          selectedPrototypeId: undefined,
          selectedInstanceId: undefined,
          selectedScheduleRowId: undefined,
          selectedScheduleInstanceId: undefined,
          canvasView: 'skeleton',
          isolateSelection: false,
          activeOperationId: undefined,
          measurement: undefined,
        },
      };
    }),
  setRoofStructureSystem: (system) =>
    set((state) => {
      if (state.template.type !== 'gable') return state;
      const template: RoofTemplateSpec = {
        ...state.template,
        structure:
          system === 'rafter-collar-tie'
            ? {
                system,
                collarTie: state.template.structure?.collarTie ?? {
                  heightAboveWallPlateMm: clampCollarTieHeightMm(
                    state.template.halfRunMm,
                    state.template.pitchDeg,
                    maxCollarTieHeightMm(
                      state.template.halfRunMm,
                      state.template.pitchDeg,
                    ) / 2,
                  ),
                  section: { widthMm: 100, depthMm: 38 },
                },
              }
            : { system },
      };
      return withHistory(
        state,
        committedTemplate(
          template,
          state.drafts,
          state.invalidFields,
          state.projectDocument,
        ),
      );
    }),
  setRidgeConnection: (connection) =>
    set((state) => {
      const next = structuredClone(state.spec);
      next.ridge.connection = connection;
      const template = roofTemplateFromAssembly(next, state.template);
      return withHistory(
        state,
        committedTemplate(
          template,
          state.drafts,
          state.invalidFields,
          state.projectDocument,
        ),
      );
    }),
  setProjectRoof: (template) =>
    set((state) => ({
      ...withHistory(
        state,
        committedTemplate(template, {}, {}, state.projectDocument),
      ),
      workbench: {
        ...state.workbench,
        selectedId: 'roof',
        selectedFeatureIds: [],
        selectedPrototypeId: undefined,
        selectedInstanceId: undefined,
        selectedScheduleRowId: undefined,
        selectedScheduleInstanceId: undefined,
        selectedCoveringAssignmentId: undefined,
        canvasView: 'skeleton',
      },
    })),
  setView: (canvasView) =>
    set((state) => ({ workbench: { ...state.workbench, canvasView } })),
  setWorkspaceRenderer: (workspaceRenderer) =>
    set((state) => ({
      workbench: {
        ...state.workbench,
        workspaceRenderer: supportsTechnical3D(state.workbench.viewPreset)
          ? workspaceRenderer
          : '2d',
      },
    })),
  setViewPreset: (viewPreset) =>
    set((state) => ({
      workbench: withViewPreset(state.workbench, viewPreset),
    })),
  navigatePerspective: (perspective) =>
    set((state) => {
      const tasks = tasksForPerspective(perspective);
      const stay = tasks.includes(state.workbench.viewPreset);
      const task = stay ? state.workbench.viewPreset : tasks[0]!;
      const next = withViewPreset(state.workbench, task);
      return {
        workbench: {
          ...next,
          materialsView:
            perspective === 'materials' && !stay ? 'plan' : next.materialsView,
          navigationTrail: [],
        },
      };
    }),
  navigateTo: (location, options) =>
    set((state) => {
      const current = currentWorkbenchLocation(state.workbench);
      if (sameWorkbenchLocation(current, location)) return state;
      const next = withViewPreset(state.workbench, location.task);
      return {
        workbench: {
          ...next,
          materialsView: materialsViewFor(location, next.materialsView),
          navigationTrail:
            options?.remember === false
              ? state.workbench.navigationTrail
              : pushNavigationTrail(state.workbench.navigationTrail, current),
        },
      };
    }),
  navigateBack: () =>
    set((state) => {
      const trail = state.workbench.navigationTrail;
      const target = trail.at(-1);
      if (!target) return state;
      const next = withViewPreset(state.workbench, target.task);
      return {
        workbench: {
          ...next,
          materialsView: materialsViewFor(target, next.materialsView),
          navigationTrail: trail.slice(0, -1),
        },
      };
    }),
  setBuildUpView: (buildUpView) =>
    set((state) => ({
      workbench: {
        ...state.workbench,
        viewPreset: 'layers',
        buildUpView,
        mobilePanel: 'none',
        selectedScheduleRowId: undefined,
        selectedScheduleInstanceId: undefined,
        activeOperationId: undefined,
        focusId: undefined,
        detailDrawer: {
          ...state.workbench.detailDrawer,
          open: false,
          mode: 'collapsed',
          activePreviewId: undefined,
        },
      },
    })),
  setMaterialsView: (materialsView) =>
    set((state) => ({
      workbench: { ...state.workbench, materialsView },
    })),
  setMobilePanel: (mobilePanel) =>
    set((state) => ({
      workbench: {
        ...state.workbench,
        mobilePanel,
        ...(mobilePanel === 'inspector' || mobilePanel === 'tools'
          ? {
              detailDrawer: {
                ...state.workbench.detailDrawer,
                open: false,
                mode: 'collapsed' as const,
              },
            }
          : {}),
      },
    })),
  setScheduleSelection: (selectedScheduleRowId, selectedScheduleInstanceId) =>
    set((state) => ({
      workbench: {
        ...state.workbench,
        selectedId: selectedScheduleInstanceId ?? 'roof',
        selectedPrototypeId: selectedScheduleInstanceId
          ? state.workbench.selectedPrototypeId
          : undefined,
        selectedInstanceId: selectedScheduleInstanceId
          ? state.workbench.selectedInstanceId
          : undefined,
        viewPreset: 'materials',
        selectedScheduleRowId,
        selectedScheduleInstanceId,
        inspectorOpen: true,
        placementTool: undefined,
        placementFeedback: undefined,
        activeOperationId: undefined,
        focusId: undefined,
        detailDrawer: {
          ...state.workbench.detailDrawer,
          open: false,
          mode: 'collapsed',
          activePreviewId: undefined,
        },
      },
    })),
  setSelectedCoveringAssignment: (selectedCoveringAssignmentId) =>
    set((state) => ({
      workbench: { ...state.workbench, selectedCoveringAssignmentId },
    })),
  setIsolation: (isolateSelection) =>
    set((state) => ({ workbench: { ...state.workbench, isolateSelection } })),
  setDimensionLevel: (dimensionLevel) =>
    set((state) => ({ workbench: { ...state.workbench, dimensionLevel } })),
  setLayerVisibility: (layer, visible) =>
    set((state) => ({
      workbench: {
        ...state.workbench,
        layerVisibility: {
          ...state.workbench.layerVisibility,
          [layer]: visible,
        },
      },
    })),
  setToolboxCollapsed: (toolboxCollapsed) =>
    set((state) => ({ workbench: { ...state.workbench, toolboxCollapsed } })),
  setToolGroupCollapsed: (category, collapsed) =>
    set((state) => ({
      workbench: {
        ...state.workbench,
        collapsedToolGroups: collapsed
          ? [...new Set([...state.workbench.collapsedToolGroups, category])]
          : state.workbench.collapsedToolGroups.filter(
              (candidate) => candidate !== category,
            ),
      },
    })),
  setInspectorOpen: (inspectorOpen) =>
    set((state) => ({ workbench: { ...state.workbench, inspectorOpen } })),
  setPreparationExpanded: (preparationExpanded) =>
    set((state) => ({
      workbench: { ...state.workbench, preparationExpanded },
    })),
  setWorkspaceFocus: (active) =>
    set((state) => {
      if (active === state.workbench.workspaceFocus.active) return state;
      if (active)
        return {
          workbench: {
            ...state.workbench,
            toolboxCollapsed: true,
            inspectorOpen: false,
            workspaceFocus: {
              active: true,
              restoreToolboxCollapsed: state.workbench.toolboxCollapsed,
              restoreInspectorOpen: state.workbench.inspectorOpen,
            },
          },
        };
      return {
        workbench: {
          ...state.workbench,
          toolboxCollapsed:
            state.workbench.workspaceFocus.restoreToolboxCollapsed ?? false,
          inspectorOpen:
            state.workbench.workspaceFocus.restoreInspectorOpen ?? true,
          workspaceFocus: { active: false },
        },
      };
    }),
  toggleMeasurement: () =>
    set((state) => ({
      workbench: {
        ...state.workbench,
        measurement: state.workbench.measurement ? undefined : { active: true },
        placementTool: undefined,
        placementFeedback: undefined,
      },
    })),
  chooseMeasurementPoint: (point) =>
    set((state) => {
      const current = state.workbench.measurement;
      if (!current) return state;
      if (!current.firstPoint || current.result)
        return {
          workbench: {
            ...state.workbench,
            measurement: { active: true, firstPoint: point },
          },
        };
      return {
        workbench: {
          ...state.workbench,
          measurement: {
            active: true,
            firstPoint: current.firstPoint,
            result: measureDistance3d(current.firstPoint, point),
          },
        },
      };
    }),
  cancelMeasurement: () =>
    set((state) => ({
      workbench: { ...state.workbench, measurement: undefined },
    })),
  setFocusId: (focusId) =>
    set((state) => ({ workbench: { ...state.workbench, focusId } })),
  requestFit: () =>
    set((state) => ({
      workbench: {
        ...state.workbench,
        fitRequestId: state.workbench.fitRequestId + 1,
      },
    })),
  setDetailDrawer: (detail) =>
    set((state) => ({
      workbench: {
        ...state.workbench,
        mobilePanel:
          detail.open || (detail.mode && detail.mode !== 'collapsed')
            ? 'none'
            : state.workbench.mobilePanel,
        detailDrawer: {
          ...state.workbench.detailDrawer,
          ...detail,
          open:
            detail.mode !== undefined
              ? detail.mode !== 'collapsed'
              : (detail.open ?? state.workbench.detailDrawer.open),
          mode:
            detail.open === false
              ? 'collapsed'
              : detail.open === true && detail.mode === undefined
                ? 'working'
                : (detail.mode ?? state.workbench.detailDrawer.mode),
        },
      },
    })),
  closeDetailDrawer: () =>
    set((state) => ({
      workbench: {
        ...state.workbench,
        viewPreset:
          state.workbench.returnViewPreset ?? state.workbench.viewPreset,
        returnViewPreset: undefined,
        activeOperationId: undefined,
        detailDrawer: {
          ...state.workbench.detailDrawer,
          open: false,
          mode: 'collapsed',
          activePreviewId: undefined,
        },
      },
    })),
  activateOperation: ({
    operationId,
    prototypeId,
    selectionId,
    instanceId,
    previewId,
  }) =>
    set((state) => {
      const selectedInstanceId =
        instanceId ??
        (state.workbench.selectedPrototypeId === prototypeId
          ? state.workbench.selectedInstanceId
          : undefined);
      return {
        workbench: {
          ...state.workbench,
          selectedId: selectionId ?? operationId,
          selectedPrototypeId: prototypeId,
          selectedInstanceId,
          activeOperationId: operationId,
          preparationExpanded: true,
          returnViewPreset:
            state.workbench.viewPreset === 'cuts'
              ? state.workbench.returnViewPreset
              : state.workbench.viewPreset,
          viewPreset: 'cuts',
          canvasView:
            prototypeId === HIP_RAFTER_PROTOTYPE_ID
              ? 'hip'
              : prototypeId === JACK_RAFTER_PROTOTYPE_ID
                ? 'skeleton'
                : 'rafter',
          detailDrawer: {
            ...state.workbench.detailDrawer,
            open: !!previewId,
            mode: previewId ? 'working' : 'collapsed',
            activePreviewId: previewId,
          },
        },
      };
    }),
  navigateToInstance: ({ instanceId, prototypeId, operationIds }) =>
    set((state) => {
      const activeOperationId = operationIds.includes(
        state.workbench.activeOperationId ?? '',
      )
        ? state.workbench.activeOperationId
        : undefined;
      return {
        workbench: {
          ...state.workbench,
          selectedId: activeOperationId ?? instanceId,
          selectedPrototypeId: prototypeId,
          selectedInstanceId: instanceId,
          activeOperationId,
          inspectorOpen: true,
          preparationExpanded: true,
          detailDrawer: activeOperationId
            ? state.workbench.detailDrawer
            : {
                ...state.workbench.detailDrawer,
                open: false,
                mode: 'collapsed',
                activePreviewId: undefined,
              },
        },
      };
    }),
  stepBackContext: () =>
    set((state) => {
      if (state.workbench.placementTool)
        return {
          workbench: {
            ...state.workbench,
            placementTool: undefined,
            placementFeedback: undefined,
          },
        };
      if (state.workbench.selectedFeatureIds.length > 1)
        return {
          workbench: {
            ...state.workbench,
            selectedFeatureIds: state.workbench.selectedId.startsWith(
              'feature:roof-window-',
            )
              ? [state.workbench.selectedId]
              : [],
            windowLayoutFeedback: undefined,
          },
        };
      if (state.workbench.selectedScheduleRowId)
        return {
          workbench: {
            ...state.workbench,
            selectedScheduleRowId: undefined,
            selectedScheduleInstanceId: undefined,
          },
        };
      if (state.workbench.detailDrawer.mode === 'focus')
        return {
          workbench: {
            ...state.workbench,
            detailDrawer: {
              ...state.workbench.detailDrawer,
              open: true,
              mode: 'working',
            },
          },
        };
      if (state.workbench.detailDrawer.mode === 'working')
        return {
          workbench: {
            ...state.workbench,
            detailDrawer: {
              ...state.workbench.detailDrawer,
              open: false,
              mode: 'collapsed',
            },
          },
        };
      const operationLike =
        !!state.workbench.activeOperationId ||
        state.workbench.selectedId.startsWith('joint:') ||
        state.workbench.selectedId.startsWith('cut:');
      if (operationLike) {
        const selectedId =
          state.workbench.selectedInstanceId ??
          state.workbench.selectedPrototypeId ??
          'roof';
        return {
          workbench: {
            ...state.workbench,
            selectedId,
            activeOperationId: undefined,
            canvasView: state.workbench.selectedInstanceId
              ? 'skeleton'
              : state.workbench.canvasView,
            detailDrawer: {
              ...state.workbench.detailDrawer,
              open: false,
              mode: 'collapsed',
              activePreviewId: undefined,
            },
            viewPreset: state.workbench.returnViewPreset ?? 'construction',
            returnViewPreset: undefined,
          },
        };
      }
      if (
        state.workbench.selectedInstanceId ||
        state.workbench.selectedId !== 'roof'
      )
        return {
          workbench: {
            ...state.workbench,
            selectedId: 'roof',
            selectedFeatureIds: [],
            selectedPrototypeId: undefined,
            selectedInstanceId: undefined,
            activeOperationId: undefined,
            isolateSelection: false,
            canvasView: 'skeleton',
          },
        };
      return state;
    }),
  beginRoofWindowPlacement: () =>
    set((state) => ({
      workbench: {
        ...state.workbench,
        viewPreset: 'openings',
        canvasView: 'skeleton',
        measurement: undefined,
        placementTool: {
          kind: 'roof-window',
          mode: 'new',
          step: 'choose-plane',
        },
        placementFeedback: undefined,
        windowLayoutFeedback: undefined,
        activeOperationId: undefined,
        focusId: undefined,
      },
    })),
  beginRoofWindowDuplicatePlacement: (sourceFeatureId) => {
    let started = false;
    set((state) => {
      const source = state.projectDocument.project.features.find(
        (feature): feature is RoofWindowFeature =>
          feature.kind === 'roof-window' && feature.id === sourceFeatureId,
      );
      if (!source) return state;
      started = true;
      return {
        workbench: {
          ...state.workbench,
          selectedId: source.id,
          selectedFeatureIds: [source.id],
          viewPreset: 'openings',
          canvasView: 'skeleton',
          measurement: undefined,
          placementTool: {
            kind: 'roof-window',
            mode: 'duplicate',
            step: 'position',
            roofPlaneId: source.roofPlaneId,
            sourceFeatureId: source.id,
          },
          placementFeedback: undefined,
          windowLayoutFeedback: undefined,
          activeOperationId: undefined,
          focusId: undefined,
        },
      };
    });
    return started;
  },
  setRoofWindowPlacementPlane: (roofPlaneId) =>
    set((state) => {
      if (!state.workbench.placementTool) return state;
      return {
        workbench: {
          ...state.workbench,
          placementTool: {
            kind: 'roof-window',
            mode: state.workbench.placementTool.mode,
            step: roofPlaneId ? 'position' : 'choose-plane',
            roofPlaneId,
            sourceFeatureId: state.workbench.placementTool.sourceFeatureId,
          },
        },
      };
    }),
  cancelRoofWindowPlacement: () =>
    set((state) => ({
      workbench: {
        ...state.workbench,
        placementTool: undefined,
        placementFeedback: undefined,
      },
    })),
  placeRoofWindowAt: (roofPlaneId, position) => {
    let createdId: string | undefined;
    set((state) => {
      const placementTool = state.workbench.placementTool;
      if (!placementTool) return state;
      let feature: RoofWindowFeature;
      try {
        const source = placementTool.sourceFeatureId
          ? state.projectDocument.project.features.find(
              (candidate): candidate is RoofWindowFeature =>
                candidate.kind === 'roof-window' &&
                candidate.id === placementTool.sourceFeatureId,
            )
          : undefined;
        const seed = source
          ? { ...source, roofPlaneId }
          : createDefaultRoofWindow(state.template, roofPlaneId);
        feature = clampRoofWindow(state.template, {
          ...seed,
          id: nextRoofWindowId(state.projectDocument.project.features),
          position: {
            uMm: position.uMm - seed.widthMm / 2,
            vMm: position.vMm - seed.heightMm / 2,
          },
        });
      } catch {
        return {
          workbench: {
            ...state.workbench,
            placementFeedback: {
              status: 'failed',
              reason: 'no-rafter-bay',
            },
          },
        };
      }
      createdId = feature.id;
      const document = createRoofProjectDocument(state.template, {
        features: [...state.projectDocument.project.features, feature],
        openingFraming: state.projectDocument.project.openingFraming,
        buildUp: state.projectDocument.project.buildUp,
        coverings: state.projectDocument.project.coverings,
        membraneProduct: state.projectDocument.project.membraneProduct,
      });
      return {
        ...withHistory(
          state,
          committedDocument(document, state.drafts, state.invalidFields),
        ),
        workbench: {
          ...state.workbench,
          selectedId: feature.id,
          selectedFeatureIds: [feature.id],
          selectedPrototypeId: undefined,
          selectedInstanceId: undefined,
          viewPreset: 'openings',
          inspectorOpen: true,
          placementTool: undefined,
          placementFeedback: { featureId: feature.id, status: 'placed' },
          windowLayoutFeedback: undefined,
        },
      };
    });
    return createdId;
  },
  setUnit: (unit) => {
    saveDisplayUnit(unit);
    set((state) => ({
      unit,
      drafts: Object.fromEntries(
        Object.entries(state.drafts).filter(
          ([field]) =>
            state.invalidFields[field as EditField] ||
            !Number.isFinite(
              editValue(state.spec, field as EditField, state.template),
            ),
        ),
      ),
    }));
  },
  setField: (field, raw) =>
    set((state) => {
      const parsed = parseDecimal(raw);
      const drafts = { ...state.drafts, [field]: raw };
      const invalidFields = { ...state.invalidFields };
      try {
        const value =
          parsed === null
            ? NaN
            : field === 'roof.pitchDeg'
              ? parsed
              : toMillimetres(parsed, state.unit);
        const template = editedTemplate(
          state.template,
          state.spec,
          field,
          value,
        );
        delete invalidFields[field];
        return withHistory(
          state,
          committedTemplate(
            template,
            drafts,
            invalidFields,
            state.projectDocument,
          ),
        );
      } catch {
        invalidFields[field] = true;
        return { drafts, invalidFields };
      }
    }),
  setCanonicalField: (field, value) =>
    set((state) => {
      try {
        const template = editedTemplate(
          state.template,
          state.spec,
          field,
          value,
        );
        const drafts = { ...state.drafts };
        const invalidFields = { ...state.invalidFields };
        delete drafts[field];
        delete invalidFields[field];
        return withHistory(
          state,
          committedTemplate(
            template,
            drafts,
            invalidFields,
            state.projectDocument,
          ),
        );
      } catch {
        return state;
      }
    }),
  stepField: (field, delta) =>
    set((state) => {
      const value = valueForTemplate(state.template, state.spec, field) + delta;
      try {
        const template = editedTemplate(
          state.template,
          state.spec,
          field,
          value,
        );
        const drafts = { ...state.drafts };
        delete drafts[field];
        const invalidFields = { ...state.invalidFields };
        delete invalidFields[field];
        return withHistory(
          state,
          committedTemplate(
            template,
            drafts,
            invalidFields,
            state.projectDocument,
          ),
        );
      } catch {
        return state;
      }
    }),
  setSpacingMode: (mode) =>
    set((state) => {
      const template = {
        ...state.template,
        rafterSpacing:
          mode === 'fixed-module'
            ? {
                mode,
                spacingMm: state.template.rafterSpacing.spacingMm,
                endPolicy:
                  state.template.rafterSpacing.mode === 'fixed-module'
                    ? state.template.rafterSpacing.endPolicy
                    : 'require-both-ends',
              }
            : { mode, spacingMm: state.template.rafterSpacing.spacingMm },
      };
      return withHistory(
        state,
        committedTemplate(
          template,
          state.drafts,
          state.invalidFields,
          state.projectDocument,
        ),
      );
    }),
  setEndStationPolicy: (endPolicy) =>
    set((state) => {
      if (state.template.rafterSpacing.mode !== 'fixed-module') return state;
      const template = {
        ...state.template,
        rafterSpacing: { ...state.template.rafterSpacing, endPolicy },
      };
      return withHistory(
        state,
        committedTemplate(
          template,
          state.drafts,
          state.invalidFields,
          state.projectDocument,
        ),
      );
    }),
  movePurlin: (id, xMm) =>
    set((state) => {
      const field = supportField(id, 'xMm');
      const template = editedTemplate(state.template, state.spec, field, xMm);
      return withHistory(
        state,
        committedTemplate(
          template,
          { ...state.drafts, [field]: editableLength(xMm, state.unit) },
          state.invalidFields,
          state.projectDocument,
        ),
      );
    }),
  distributePurlins: () =>
    set((state) => {
      const proposal = distributePurlins(state.spec, {
        supportIds: state.spec.supports
          .filter((support) => support.kind === 'purlin')
          .map((support) => support.id),
        mode: 'equal-gaps',
      });
      const spec = structuredClone(state.spec);
      const drafts = { ...state.drafts };
      for (const position of proposal.positions) {
        const support = spec.supports.find(
          (candidate) => candidate.id === position.supportId,
        )!;
        support.placement.xMm = position.xMm;
        drafts[supportField(position.supportId, 'xMm')] = editableLength(
          position.xMm,
          state.unit,
        );
      }
      return withHistory(
        state,
        committedTemplate(
          roofTemplateFromAssembly(spec, state.template),
          drafts,
          state.invalidFields,
          state.projectDocument,
        ),
      );
    }),
  addRoofWindow: () =>
    set((state) => {
      const feature = {
        ...createDefaultRoofWindow(state.template),
        id: nextRoofWindowId(state.projectDocument.project.features),
      };
      const document = createRoofProjectDocument(state.template, {
        features: [...state.projectDocument.project.features, feature],
        openingFraming: state.projectDocument.project.openingFraming,
        buildUp: state.projectDocument.project.buildUp,
        coverings: state.projectDocument.project.coverings,
        membraneProduct: state.projectDocument.project.membraneProduct,
      });
      return {
        ...withHistory(
          state,
          committedDocument(document, state.drafts, state.invalidFields),
        ),
        workbench: {
          ...state.workbench,
          selectedId: feature.id,
          selectedFeatureIds: [feature.id],
          selectedPrototypeId: undefined,
          selectedInstanceId: undefined,
          viewPreset: 'openings',
          inspectorOpen: true,
          placementFeedback: { featureId: feature.id, status: 'placed' },
          windowLayoutFeedback: undefined,
        },
      };
    }),
  removeRoofWindow: (id) =>
    set((state) => {
      const features = state.projectDocument.project.features.filter(
        (feature) => feature.id !== id,
      );
      if (features.length === state.projectDocument.project.features.length)
        return state;
      const selectedFeatureIds = state.workbench.selectedFeatureIds.filter(
        (featureId) => featureId !== id,
      );
      const document = createRoofProjectDocument(state.template, {
        features,
        openingFraming: state.projectDocument.project.openingFraming.filter(
          (spec) => spec.featureId !== id,
        ),
        buildUp: state.projectDocument.project.buildUp,
        coverings: state.projectDocument.project.coverings,
        membraneProduct: state.projectDocument.project.membraneProduct,
      });
      return {
        ...withHistory(
          state,
          committedDocument(document, state.drafts, state.invalidFields),
        ),
        workbench: {
          ...state.workbench,
          selectedId: selectedFeatureIds[0] ?? 'roof',
          selectedFeatureIds,
          placementFeedback: undefined,
          windowLayoutFeedback: undefined,
          openingFramingProposalFeatureId: undefined,
        },
      };
    }),
  selectRoofWindow: (id, additive = false) =>
    set((state) => {
      const exists = state.projectDocument.project.features.some(
        (feature) => feature.kind === 'roof-window' && feature.id === id,
      );
      if (!exists) return state;
      if (!additive)
        return {
          workbench: {
            ...state.workbench,
            selectedId: id,
            selectedFeatureIds: [id],
            selectedPrototypeId: undefined,
            selectedInstanceId: undefined,
            viewPreset: 'openings',
            inspectorOpen: true,
            placementTool: undefined,
            placementFeedback: undefined,
            windowLayoutFeedback: undefined,
          },
        };
      const selected = new Set(state.workbench.selectedFeatureIds);
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      const selectedFeatureIds = [...selected];
      const selectedId = selectedFeatureIds.includes(state.workbench.selectedId)
        ? state.workbench.selectedId
        : (selectedFeatureIds[0] ?? 'roof');
      return {
        workbench: {
          ...state.workbench,
          selectedId,
          selectedFeatureIds,
          selectedPrototypeId: undefined,
          selectedInstanceId: undefined,
          viewPreset: 'openings',
          inspectorOpen: true,
          placementTool: undefined,
          placementFeedback: undefined,
          windowLayoutFeedback: undefined,
        },
      };
    }),
  clearRoofWindowSelection: () =>
    set((state) => ({
      workbench: {
        ...state.workbench,
        selectedId: 'roof',
        selectedFeatureIds: [],
        windowLayoutFeedback: undefined,
      },
    })),
  alignSelectedRoofWindows: (mode) => {
    let result: RoofWindowAlignmentResult = {
      status: 'rejected',
      reason: 'not-enough-windows',
    };
    set((state) => {
      const windows = state.projectDocument.project.features.filter(
        (feature): feature is RoofWindowFeature =>
          feature.kind === 'roof-window' &&
          state.workbench.selectedFeatureIds.includes(feature.id),
      );
      result = alignRoofWindows({
        template: state.template,
        windows,
        anchorFeatureId: state.workbench.selectedId,
        mode,
      });
      if (result.status === 'rejected')
        return {
          workbench: {
            ...state.workbench,
            windowLayoutFeedback: {
              status: 'rejected',
              operation: 'align',
              reason: result.reason,
            },
          },
        };
      const positions = new Map(
        result.changes.map((change) => [
          change.featureId,
          change.proposedPosition,
        ]),
      );
      const document = createRoofProjectDocument(state.template, {
        features: state.projectDocument.project.features.map((feature) =>
          feature.kind === 'roof-window' && positions.has(feature.id)
            ? { ...feature, position: positions.get(feature.id)! }
            : feature,
        ),
        openingFraming: state.projectDocument.project.openingFraming,
        buildUp: state.projectDocument.project.buildUp,
        coverings: state.projectDocument.project.coverings,
        membraneProduct: state.projectDocument.project.membraneProduct,
      });
      return {
        ...withHistory(
          state,
          committedDocument(document, state.drafts, state.invalidFields),
        ),
        workbench: {
          ...state.workbench,
          windowLayoutFeedback: {
            status: 'applied',
            operation: 'align',
          },
        },
      };
    });
    return result;
  },
  distributeSelectedRoofWindows: () => {
    let result: RoofWindowDistributionResult = {
      status: 'rejected',
      reason: 'not-enough-windows',
    };
    set((state) => {
      const windows = state.projectDocument.project.features.filter(
        (feature): feature is RoofWindowFeature =>
          feature.kind === 'roof-window' &&
          state.workbench.selectedFeatureIds.includes(feature.id),
      );
      result = distributeRoofWindowsAlongEave({
        template: state.template,
        windows,
      });
      if (result.status === 'rejected')
        return {
          workbench: {
            ...state.workbench,
            windowLayoutFeedback: {
              status: 'rejected',
              operation: 'distribute',
              reason: result.reason,
            },
          },
        };
      const positions = new Map(
        result.changes.map((change) => [
          change.featureId,
          change.proposedPosition,
        ]),
      );
      const document = createRoofProjectDocument(state.template, {
        features: state.projectDocument.project.features.map((feature) =>
          feature.kind === 'roof-window' && positions.has(feature.id)
            ? { ...feature, position: positions.get(feature.id)! }
            : feature,
        ),
        openingFraming: state.projectDocument.project.openingFraming,
        buildUp: state.projectDocument.project.buildUp,
        coverings: state.projectDocument.project.coverings,
        membraneProduct: state.projectDocument.project.membraneProduct,
      });
      return {
        ...withHistory(
          state,
          committedDocument(document, state.drafts, state.invalidFields),
        ),
        workbench: {
          ...state.workbench,
          windowLayoutFeedback: {
            status: 'applied',
            operation: 'distribute',
            clearGapMm: result.clearGapMm,
          },
        },
      };
    });
    return result;
  },
  updateRoofWindow: (id, patch) =>
    set((state) => {
      let features;
      try {
        features = state.projectDocument.project.features.map((feature) => {
          if (feature.id !== id || feature.kind !== 'roof-window')
            return feature;
          return clampRoofWindow(state.template, {
            ...feature,
            ...patch,
            position: patch.position ?? feature.position,
          });
        });
      } catch {
        return state;
      }
      const document = createRoofProjectDocument(state.template, {
        features,
        openingFraming: state.projectDocument.project.openingFraming,
        buildUp: state.projectDocument.project.buildUp,
        coverings: state.projectDocument.project.coverings,
        membraneProduct: state.projectDocument.project.membraneProduct,
      });
      return {
        ...withHistory(
          state,
          committedDocument(document, state.drafts, state.invalidFields),
        ),
        workbench: {
          ...state.workbench,
          placementFeedback: undefined,
          windowLayoutFeedback: undefined,
        },
      };
    }),
  moveRoofWindow: (id, position) =>
    set((state) => {
      const feature = state.projectDocument.project.features.find(
        (candidate): candidate is RoofWindowFeature =>
          candidate.id === id && candidate.kind === 'roof-window',
      );
      if (!feature) return state;
      let moved: RoofWindowFeature;
      try {
        moved = clampRoofWindow(state.template, { ...feature, position });
      } catch {
        return state;
      }
      const document = createRoofProjectDocument(state.template, {
        features: state.projectDocument.project.features.map((candidate) =>
          candidate.id === id ? moved : candidate,
        ),
        openingFraming: state.projectDocument.project.openingFraming,
        buildUp: state.projectDocument.project.buildUp,
        coverings: state.projectDocument.project.coverings,
        membraneProduct: state.projectDocument.project.membraneProduct,
      });
      return {
        ...withHistory(
          state,
          committedDocument(document, state.drafts, state.invalidFields),
        ),
        workbench: {
          ...state.workbench,
          placementFeedback: undefined,
          windowLayoutFeedback: undefined,
        },
      };
    }),
  placeRoofWindowBetweenRafters: (id) => {
    let placed = false;
    set((state) => {
      const feature = state.projectDocument.project.features.find(
        (candidate): candidate is RoofWindowFeature =>
          candidate.id === id && candidate.kind === 'roof-window',
      );
      if (!feature) return state;
      const placement = resolveRoofWindowPlacement({
        template: state.template,
        skeleton: createRoofSkeleton(state.template),
        feature,
      });
      if (!placement.placed)
        return {
          workbench: {
            ...state.workbench,
            placementFeedback: {
              featureId: id,
              status: 'failed',
              reason: placement.reason,
              memberInstanceIds: placement.nearestBay?.memberInstanceIds,
              availableWidthMm: placement.nearestBay?.availableWidthMm,
              requiredWidthMm: placement.requiredWidthMm,
            },
          },
        };
      placed = true;
      const document = createRoofProjectDocument(state.template, {
        features: state.projectDocument.project.features.map((candidate) =>
          candidate.id === id ? placement.feature : candidate,
        ),
        openingFraming: state.projectDocument.project.openingFraming,
        buildUp: state.projectDocument.project.buildUp,
        coverings: state.projectDocument.project.coverings,
        membraneProduct: state.projectDocument.project.membraneProduct,
      });
      return {
        ...withHistory(
          state,
          committedDocument(document, state.drafts, state.invalidFields),
        ),
        workbench: {
          ...state.workbench,
          placementFeedback: {
            featureId: id,
            status: 'placed',
            memberInstanceIds: placement.bay.memberInstanceIds,
            availableWidthMm: placement.bay.availableWidthMm,
            requiredWidthMm: placement.bay.requiredWidthMm,
          },
        },
      };
    });
    return placed;
  },
  planOpeningFraming: (featureId) =>
    set((state) => {
      const feature = state.projectDocument.project.features.find(
        (candidate): candidate is RoofWindowFeature =>
          candidate.id === featureId && candidate.kind === 'roof-window',
      );
      if (!feature) return state;
      const result = resolveOpeningFraming({
        template: state.template,
        skeleton: createRoofSkeleton(state.template),
        feature,
        framingSpec: createOpeningFramingDraft(state.template, featureId),
      });
      if (result.status !== 'resolved') return state;
      return {
        workbench: {
          ...state.workbench,
          viewPreset: 'openings',
          selectedId: featureId,
          openingFramingProposalFeatureId: featureId,
        },
      };
    }),
  cancelOpeningFramingProposal: () =>
    set((state) => ({
      workbench: {
        ...state.workbench,
        openingFramingProposalFeatureId: undefined,
      },
    })),
  applyOpeningFraming: (featureId) => {
    let applied = false;
    set((state) => {
      const feature = state.projectDocument.project.features.find(
        (candidate): candidate is RoofWindowFeature =>
          candidate.id === featureId && candidate.kind === 'roof-window',
      );
      if (!feature) return state;
      const existing = state.projectDocument.project.openingFraming.find(
        (spec) => spec.featureId === featureId,
      );
      const draft: RoofOpeningFramingSpec = {
        ...(existing ?? createOpeningFramingDraft(state.template, featureId)),
        acceptedGeometrySignature: '',
      };
      const candidateSpecs = [
        ...state.projectDocument.project.openingFraming.filter(
          (spec) => spec.featureId !== featureId,
        ),
        draft,
      ];
      const projection = resolveOpeningFramingSet({
        template: state.template,
        skeleton: createRoofSkeleton(state.template),
        features: state.projectDocument.project.features,
        framingSpecs: candidateSpecs,
      });
      const result = projection.results.find(
        (candidate) => candidate.featureId === featureId,
      );
      if (!result || result.status !== 'resolved' || !result.geometrySignature)
        return state;
      const accepted = {
        ...draft,
        acceptedGeometrySignature: result.geometrySignature,
      };
      const document = createRoofProjectDocument(state.template, {
        features: state.projectDocument.project.features,
        openingFraming: candidateSpecs.map((spec) =>
          spec.featureId === featureId ? accepted : spec,
        ),
        buildUp: state.projectDocument.project.buildUp,
        coverings: state.projectDocument.project.coverings,
        membraneProduct: state.projectDocument.project.membraneProduct,
      });
      applied = true;
      return {
        ...withHistory(
          state,
          committedDocument(document, state.drafts, state.invalidFields),
        ),
        workbench: {
          ...state.workbench,
          selectedId: featureId,
          viewPreset: 'openings',
          openingFramingProposalFeatureId: undefined,
        },
      };
    });
    return applied;
  },
  removeOpeningFraming: (featureId) =>
    set((state) => {
      const openingFraming =
        state.projectDocument.project.openingFraming.filter(
          (spec) => spec.featureId !== featureId,
        );
      if (
        openingFraming.length ===
        state.projectDocument.project.openingFraming.length
      )
        return state;
      const document = createRoofProjectDocument(state.template, {
        features: state.projectDocument.project.features,
        openingFraming,
        buildUp: state.projectDocument.project.buildUp,
        coverings: state.projectDocument.project.coverings,
        membraneProduct: state.projectDocument.project.membraneProduct,
      });
      return {
        ...withHistory(
          state,
          committedDocument(document, state.drafts, state.invalidFields),
        ),
        workbench: {
          ...state.workbench,
          openingFramingProposalFeatureId: undefined,
        },
      };
    }),
  setBattenLayout: (battenLayout) =>
    set((state) => {
      const document = createRoofProjectDocument(state.template, {
        features: state.projectDocument.project.features,
        openingFraming: state.projectDocument.project.openingFraming,
        buildUp: { ...state.projectDocument.project.buildUp, battenLayout },
        coverings: state.projectDocument.project.coverings,
        membraneProduct: state.projectDocument.project.membraneProduct,
      });
      return withHistory(
        state,
        committedDocument(document, state.drafts, state.invalidFields),
      );
    }),
  fitInstallationToRoof: () =>
    set((state) => {
      const project = state.projectDocument.project;
      const repair = fitInstallationToRoof({
        template: state.template,
        coverings: project.coverings,
        buildUp: project.buildUp,
      });
      if (!repair.changed) return state;
      const document = createRoofProjectDocument(state.template, {
        features: project.features,
        openingFraming: project.openingFraming,
        buildUp: repair.buildUp,
        coverings: repair.coverings,
        membraneProduct: project.membraneProduct,
      });
      return withHistory(
        state,
        committedDocument(document, state.drafts, state.invalidFields),
      );
    }),
  setMembraneLayer: (membrane) =>
    set((state) => {
      const document = createRoofProjectDocument(state.template, {
        features: state.projectDocument.project.features,
        openingFraming: state.projectDocument.project.openingFraming,
        buildUp: { ...state.projectDocument.project.buildUp, membrane },
        coverings: state.projectDocument.project.coverings,
        membraneProduct: state.projectDocument.project.membraneProduct,
      });
      return withHistory(
        state,
        committedDocument(document, state.drafts, state.invalidFields),
      );
    }),
  setMembraneProduct: (membraneProduct) =>
    set((state) => {
      const document = createRoofProjectDocument(state.template, {
        features: state.projectDocument.project.features,
        openingFraming: state.projectDocument.project.openingFraming,
        buildUp: state.projectDocument.project.buildUp,
        coverings: state.projectDocument.project.coverings,
        membraneProduct,
      });
      return withHistory(
        state,
        committedDocument(document, state.drafts, state.invalidFields),
      );
    }),
  setCounterBattenLayout: (counterBattens) =>
    set((state) => {
      const document = createRoofProjectDocument(state.template, {
        features: state.projectDocument.project.features,
        openingFraming: state.projectDocument.project.openingFraming,
        buildUp: { ...state.projectDocument.project.buildUp, counterBattens },
        coverings: state.projectDocument.project.coverings,
        membraneProduct: state.projectDocument.project.membraneProduct,
      });
      return withHistory(
        state,
        committedDocument(document, state.drafts, state.invalidFields),
      );
    }),
  setHipCounterBattenDetail: (hipBoundaryDetail) =>
    set((state) => {
      const current = state.projectDocument.project.buildUp.counterBattens;
      if (!current) return state;
      const document = createRoofProjectDocument(state.template, {
        features: state.projectDocument.project.features,
        openingFraming: state.projectDocument.project.openingFraming,
        buildUp: {
          ...state.projectDocument.project.buildUp,
          counterBattens: { ...current, hipBoundaryDetail },
        },
        coverings: state.projectDocument.project.coverings,
        membraneProduct: state.projectDocument.project.membraneProduct,
      });
      return withHistory(
        state,
        committedDocument(document, state.drafts, state.invalidFields),
      );
    }),
  setHipExecution: (intent) =>
    set((state) => {
      if (state.template.type !== 'hip') return state;
      const next = {
        ...state.template,
        hipExecution: { ...state.template.hipExecution, ...intent },
      };
      // The current document must be passed through, or features, build-up
      // and coverings would silently reset to empty.
      return withHistory(
        state,
        committedTemplate(
          next,
          state.drafts,
          state.invalidFields,
          state.projectDocument,
        ),
      );
    }),
  setCoveringAssignments: (coverings) =>
    set((state) => {
      const document = createRoofProjectDocument(state.template, {
        features: state.projectDocument.project.features,
        openingFraming: state.projectDocument.project.openingFraming,
        buildUp: withBattensForNewCovering(
          state.projectDocument.project.buildUp,
          state.projectDocument.project.coverings,
          coverings,
          state.template,
        ),
        coverings,
        membraneProduct: state.projectDocument.project.membraneProduct,
      });
      const previousId = state.workbench.selectedCoveringAssignmentId;
      const previousIndex = previousId
        ? state.projectDocument.project.coverings.findIndex(
            (item) => item.id === previousId,
          )
        : -1;
      const selectedCoveringAssignmentId =
        previousId && coverings.some((item) => item.id === previousId)
          ? previousId
          : coverings[
              Math.min(Math.max(previousIndex, 0), coverings.length - 1)
            ]?.id;
      return {
        ...withHistory(
          state,
          committedDocument(document, state.drafts, state.invalidFields),
        ),
        workbench: { ...state.workbench, selectedCoveringAssignmentId },
      };
    }),
  add: () =>
    set((state) => {
      const template = roofTemplateFromAssembly(
        addPurlin(state.spec),
        state.template,
      );
      return {
        ...withHistory(
          state,
          committedTemplate(
            template,
            state.drafts,
            state.invalidFields,
            state.projectDocument,
          ),
        ),
        workbench: {
          ...state.workbench,
          selectedId: template.intermediateSupports.at(-1)!.id,
          selectedPrototypeId: undefined,
          selectedInstanceId: undefined,
          inspectorOpen: true,
          activeOperationId: undefined,
        },
      };
    }),
  remove: (id) =>
    set((state) => {
      const spec = {
        ...state.spec,
        supports: state.spec.supports.filter(
          (s) => s.id !== id || s.kind !== 'purlin',
        ),
      };
      const drafts = Object.fromEntries(
        Object.entries(state.drafts).filter(
          ([key]) => !key.startsWith(`support/${id}/`),
        ),
      );
      const invalidFields = Object.fromEntries(
        Object.entries(state.invalidFields).filter(
          ([key]) => !key.startsWith(`support/${id}/`),
        ),
      );
      return {
        ...withHistory(
          state,
          committedTemplate(
            roofTemplateFromAssembly(spec, state.template),
            drafts,
            invalidFields,
            state.projectDocument,
          ),
        ),
        workbench: {
          ...state.workbench,
          selectedId: 'roof',
          selectedFeatureIds: [],
          selectedPrototypeId: undefined,
          selectedInstanceId: undefined,
          isolateSelection: false,
          activeOperationId: undefined,
        },
      };
    }),
  select: (selectedId, selectedPrototypeId) =>
    set((state) => {
      const operationLike =
        selectedId.startsWith('joint:') || selectedId.startsWith('cut:');
      const prototypeSelection =
        selectedId === state.spec.member.id ||
        selectedId === HIP_RAFTER_PROTOTYPE_ID ||
        selectedId === JACK_RAFTER_PROTOTYPE_ID;
      const instanceSelection =
        selectedId.startsWith('instance:') && !!selectedPrototypeId;
      const nextPrototypeId =
        selectedId === 'roof'
          ? undefined
          : (selectedPrototypeId ??
            (prototypeSelection
              ? selectedId
              : operationLike
                ? state.workbench.selectedPrototypeId
                : undefined));
      const selectedInstanceId =
        selectedId === 'roof'
          ? undefined
          : instanceSelection
            ? selectedId
            : operationLike
              ? state.workbench.selectedInstanceId
              : undefined;
      const contextualPreset = selectedId.startsWith('feature:')
        ? 'openings'
        : selectedId.startsWith('batten:') ||
            selectedId.startsWith('counter-batten:') ||
            (selectedId.startsWith('surface:') &&
              state.workbench.viewPreset !== 'covering') ||
            selectedId.startsWith('layer:')
          ? 'layers'
          : selectedId === 'roof'
            ? 'construction'
            : state.workbench.viewPreset;
      const isRoofWindowSelection =
        selectedId.startsWith('feature:') &&
        state.projectDocument.project.features.some(
          (feature) =>
            feature.kind === 'roof-window' && feature.id === selectedId,
        );
      return {
        workbench: {
          ...state.workbench,
          selectedId,
          selectedPrototypeId: nextPrototypeId,
          selectedInstanceId,
          selectedScheduleRowId: undefined,
          selectedScheduleInstanceId: undefined,
          inspectorOpen: true,
          preparationExpanded:
            selectedId === 'roof'
              ? false
              : !!nextPrototypeId || state.workbench.preparationExpanded,
          isolateSelection:
            selectedId === 'roof' ? false : state.workbench.isolateSelection,
          activeOperationId: undefined,
          focusId: undefined,
          viewPreset: contextualPreset,
          // V43B: picking a row or axis inside the installation plan keeps
          // the composite view instead of jumping to a single layer.
          buildUpView:
            state.workbench.buildUpView === 'installation' &&
            (selectedId.startsWith('batten:') ||
              selectedId.startsWith('counter-batten:') ||
              selectedId.startsWith('layer:'))
              ? 'installation'
              : selectedId.startsWith('surface:')
                ? 'membrane'
                : selectedId.startsWith('counter-batten:')
                  ? 'counterBattens'
                  : selectedId.startsWith('batten:')
                    ? 'battens'
                    : state.workbench.buildUpView,
          placementTool: undefined,
          placementFeedback: selectedId.startsWith('feature:')
            ? state.workbench.placementFeedback
            : undefined,
          selectedFeatureIds: isRoofWindowSelection ? [selectedId] : [],
          windowLayoutFeedback: undefined,
        },
      };
    }),
  beginTransaction: () =>
    set((state) =>
      state.activeTransaction
        ? state
        : { activeTransaction: snapshot(state.projectDocument) },
    ),
  commitTransaction: () =>
    set((state) => {
      const start = state.activeTransaction;
      if (!start) return state;
      if (sameDocument(start.document, state.projectDocument))
        return { activeTransaction: undefined };
      return {
        activeTransaction: undefined,
        historyPast: [...state.historyPast, start].slice(-historyLimit),
        historyFuture: [],
      };
    }),
  cancelTransaction: () =>
    set((state) =>
      state.activeTransaction
        ? {
            ...restoredSnapshot(state.activeTransaction),
            activeTransaction: undefined,
          }
        : state,
    ),
  undo: () =>
    set((state) => {
      const previous = state.historyPast.at(-1);
      if (!previous) return state;
      return {
        ...restoredSnapshot(previous),
        historyPast: state.historyPast.slice(0, -1),
        historyFuture: [
          snapshot(state.projectDocument),
          ...state.historyFuture,
        ].slice(0, historyLimit),
        activeTransaction: undefined,
      };
    }),
  redo: () =>
    set((state) => {
      const next = state.historyFuture[0];
      if (!next) return state;
      return {
        ...restoredSnapshot(next),
        historyPast: [
          ...state.historyPast,
          snapshot(state.projectDocument),
        ].slice(-historyLimit),
        historyFuture: state.historyFuture.slice(1),
        activeTransaction: undefined,
      };
    }),
  setJointControl: (id, control) =>
    set((state) => {
      const spec = structuredClone(state.spec),
        support = spec.supports.find((s) => s.id === id)!;
      const seat = seatLength(support, spec.roof.pitchDeg);
      // Conversion uses the shared joint resolver's values supplied by the math package.
      support.joint = {
        kind: 'seat-notch',
        control,
        valueMm: jointControlValue(support, spec, seat, control),
      };
      const drafts = { ...state.drafts };
      delete drafts[supportField(id, 'valueMm')];
      const invalidFields = { ...state.invalidFields };
      delete invalidFields[supportField(id, 'valueMm')];
      return withHistory(
        state,
        committedTemplate(
          roofTemplateFromAssembly(spec, state.template),
          drafts,
          invalidFields,
          state.projectDocument,
        ),
      );
    }),
  reset: () =>
    set((state) => ({
      projectDocument: createRoofProjectDocument(
        structuredClone(templateDefaults),
      ),
      template: structuredClone(templateDefaults),
      spec: assemblyFromRoofTemplate(templateDefaults),
      drafts: {},
      invalidFields: {},
      workbench: {
        ...structuredClone(initialWorkbenchViewState),
        mode: state.workbench.mode,
      },
      historyPast: [],
      historyFuture: [],
      activeTransaction: undefined,
    })),
  replaceProjectDocument: (input) =>
    set((state) => {
      const document = parseRoofProjectDocument(JSON.stringify(input));
      return {
        ...committedDocument(document, {}, {}),
        workbench: {
          ...structuredClone(initialWorkbenchViewState),
          mode: state.workbench.mode,
        },
        historyPast: [],
        historyFuture: [],
        activeTransaction: undefined,
      };
    }),
}));

export const selectCanonicalProject = (state: AssemblyState) =>
  state.projectDocument;
export const selectWorkbenchView = (state: AssemblyState) => state.workbench;

function jointControlValue(
  support: SupportSpec,
  spec: AssemblySpec,
  seat: number,
  control: SupportSpec['joint']['control'],
) {
  if (support.joint.control === control) return support.joint.valueMm;
  return control === 'seat'
    ? seat
    : calculateBirdsmouth({
        pitchDeg: spec.roof.pitchDeg,
        seatLengthMm: seat,
        depthMm: spec.member.section.depthMm,
      }).normalDepthMm;
}
