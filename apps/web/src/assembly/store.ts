import { create } from 'zustand';
import {
  createRoofProjectDocument,
  type RoofProjectDocumentV1,
} from '@cieslacalc/calculator-core';
import {
  addPurlin,
  assemblyDefaults,
  assemblyFromRoofTemplate,
  calculateBirdsmouth,
  clampRoofWindow,
  convertRoofTemplate,
  createDefaultRoofWindow,
  createRoofSkeleton,
  distributePurlins,
  gableTemplateFromAssembly,
  HIP_RAFTER_PROTOTYPE_ID,
  JACK_RAFTER_PROTOTYPE_ID,
  placeRoofWindowBetweenRafters,
  roofTemplateFromAssembly,
  seatLength,
  toMillimetres,
  type LengthUnit,
} from '@cieslacalc/roof-math';
import type {
  AssemblySpec,
  BattenLayoutSpec,
  EndStationPolicy,
  RafterSpacingMode,
  RoofTemplateSpec,
  RoofWindowFeature,
  SupportSpec,
} from '@cieslacalc/timber-model';
import { editableLength, parseDecimal } from '../format';
import {
  initialWorkbenchViewState,
  type DimensionLevel,
  type ViewPreset,
  type WorkbenchCanvasView,
  type WorkbenchMode,
  type WorkbenchToolCategory,
  type WorkbenchViewState,
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
  | 'template.buildingLengthMm'
  | 'template.rafterSpacingMm'
  | `support/${string}/${SupportField}`;
type AssemblyEditField = Exclude<
  EditField,
  | 'template.buildingLengthMm'
  | 'template.rafterSpacingMm'
  | 'hip.widthMm'
  | 'hip.depthMm'
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
    }
  }
  return next;
}
const templateDefaults = gableTemplateFromAssembly(assemblyDefaults);
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
      buildUp: currentDocument?.project.buildUp ?? {},
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
  return committedTemplate(document.project.roof, drafts, invalidFields, document);
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
  setView: (view: WorkbenchCanvasView) => void;
  setViewPreset: (preset: ViewPreset) => void;
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
  setFocusId: (focusId?: string) => void;
  setDetailDrawer: (
    detail: Partial<WorkbenchViewState['detailDrawer']>,
  ) => void;
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
    patch: Partial<Pick<RoofWindowFeature, 'roofPlaneId' | 'widthMm' | 'heightMm' | 'clearanceMm' | 'position'>>,
  ) => void;
  moveRoofWindow: (id: string, position: RoofWindowFeature['position']) => void;
  placeRoofWindowBetweenRafters: (id: string) => boolean;
  setBattenLayout: (layout?: BattenLayoutSpec) => void;
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
}
function withHistory(
  state: AssemblyState,
  next: ReturnType<typeof committedTemplate>,
) {
  if (sameDocument(state.projectDocument, next.projectDocument) || state.activeTransaction)
    return next;
  return {
    ...next,
    historyPast: [...state.historyPast, snapshot(state.projectDocument)].slice(
      -historyLimit,
    ),
    historyFuture: [],
  };
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
  unit: 'mm',
  drafts: {},
  invalidFields: {},
  historyPast: [],
  historyFuture: [],
  activeTransaction: undefined,
  setMode: (mode) =>
    set((state) => ({
      workbench: { ...state.workbench, mode, focusId: undefined },
    })),
  setRoofType: (type) =>
    set((state) => {
      const template = convertRoofTemplate(state.template, type);
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
          selectedId: 'roof',
          selectedPrototypeId: undefined,
          selectedInstanceId: undefined,
          canvasView: 'skeleton',
          isolateSelection: false,
          activeOperationId: undefined,
        },
      };
    }),
  setView: (canvasView) =>
    set((state) => ({ workbench: { ...state.workbench, canvasView } })),
  setViewPreset: (viewPreset) =>
    set((state) => ({ workbench: { ...state.workbench, viewPreset } })),
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
  setFocusId: (focusId) =>
    set((state) => ({ workbench: { ...state.workbench, focusId } })),
  setDetailDrawer: (detail) =>
    set((state) => ({
      workbench: {
        ...state.workbench,
        detailDrawer: { ...state.workbench.detailDrawer, ...detail },
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
                activePreviewId: undefined,
              },
        },
      };
    }),
  stepBackContext: () =>
    set((state) => {
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
              activePreviewId: undefined,
            },
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
            selectedPrototypeId: undefined,
            selectedInstanceId: undefined,
            activeOperationId: undefined,
            isolateSelection: false,
            canvasView: 'skeleton',
          },
        };
      return state;
    }),
  setUnit: (unit) =>
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
    })),
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
          committedTemplate(template, drafts, invalidFields, state.projectDocument),
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
          committedTemplate(template, drafts, invalidFields, state.projectDocument),
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
          committedTemplate(template, drafts, invalidFields, state.projectDocument),
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
        committedTemplate(template, state.drafts, state.invalidFields, state.projectDocument),
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
        committedTemplate(template, state.drafts, state.invalidFields, state.projectDocument),
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
      const nextNumber = Math.max(
        0,
        ...state.projectDocument.project.features.map(
          (feature) => Number(/roof-window-(\d+)$/.exec(feature.id)?.[1] ?? 0),
        ),
      ) + 1;
      const feature = {
        ...createDefaultRoofWindow(state.template),
        id: `feature:roof-window-${nextNumber}`,
      };
      const document = createRoofProjectDocument(state.template, {
        features: [...state.projectDocument.project.features, feature],
        buildUp: state.projectDocument.project.buildUp,
      });
      return {
        ...withHistory(
          state,
          committedDocument(document, state.drafts, state.invalidFields),
        ),
        workbench: {
          ...state.workbench,
          selectedId: feature.id,
          selectedPrototypeId: undefined,
          selectedInstanceId: undefined,
          viewPreset: 'openings',
          inspectorOpen: true,
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
      const document = createRoofProjectDocument(state.template, {
        features,
        buildUp: state.projectDocument.project.buildUp,
      });
      return {
        ...withHistory(
          state,
          committedDocument(document, state.drafts, state.invalidFields),
        ),
        workbench: { ...state.workbench, selectedId: 'roof' },
      };
    }),
  updateRoofWindow: (id, patch) =>
    set((state) => {
      const features = state.projectDocument.project.features.map((feature) => {
        if (feature.id !== id || feature.kind !== 'roof-window') return feature;
        return clampRoofWindow(state.template, {
          ...feature,
          ...patch,
          position: patch.position ?? feature.position,
        });
      });
      const document = createRoofProjectDocument(state.template, {
        features,
        buildUp: state.projectDocument.project.buildUp,
      });
      return withHistory(
        state,
        committedDocument(document, state.drafts, state.invalidFields),
      );
    }),
  moveRoofWindow: (id, position) =>
    set((state) => {
      const feature = state.projectDocument.project.features.find(
        (candidate): candidate is RoofWindowFeature =>
          candidate.id === id && candidate.kind === 'roof-window',
      );
      if (!feature) return state;
      const moved = clampRoofWindow(state.template, { ...feature, position });
      const document = createRoofProjectDocument(state.template, {
        features: state.projectDocument.project.features.map((candidate) =>
          candidate.id === id ? moved : candidate,
        ),
        buildUp: state.projectDocument.project.buildUp,
      });
      return withHistory(
        state,
        committedDocument(document, state.drafts, state.invalidFields),
      );
    }),
  placeRoofWindowBetweenRafters: (id) => {
    let placed = false;
    set((state) => {
      const feature = state.projectDocument.project.features.find(
        (candidate): candidate is RoofWindowFeature =>
          candidate.id === id && candidate.kind === 'roof-window',
      );
      if (!feature) return state;
      const placement = placeRoofWindowBetweenRafters({
        template: state.template,
        skeleton: createRoofSkeleton(state.template),
        feature,
      });
      if (!placement) return state;
      placed = true;
      const document = createRoofProjectDocument(state.template, {
        features: state.projectDocument.project.features.map((candidate) =>
          candidate.id === id ? placement.feature : candidate,
        ),
        buildUp: state.projectDocument.project.buildUp,
      });
      return withHistory(
        state,
        committedDocument(document, state.drafts, state.invalidFields),
      );
    });
    return placed;
  },
  setBattenLayout: (battenLayout) =>
    set((state) => {
      const document = createRoofProjectDocument(state.template, {
        features: state.projectDocument.project.features,
        buildUp: { ...state.projectDocument.project.buildUp, battenLayout },
      });
      return withHistory(
        state,
        committedDocument(document, state.drafts, state.invalidFields),
      );
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
      return {
        workbench: {
          ...state.workbench,
          selectedId,
          selectedPrototypeId: nextPrototypeId,
          selectedInstanceId,
          inspectorOpen: true,
          preparationExpanded:
            selectedId === 'roof'
              ? false
              : !!nextPrototypeId || state.workbench.preparationExpanded,
          isolateSelection:
            selectedId === 'roof' ? false : state.workbench.isolateSelection,
          activeOperationId: undefined,
          focusId: undefined,
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
        historyFuture: [snapshot(state.projectDocument), ...state.historyFuture].slice(
          0,
          historyLimit,
        ),
        activeTransaction: undefined,
      };
    }),
  redo: () =>
    set((state) => {
      const next = state.historyFuture[0];
      if (!next) return state;
      return {
        ...restoredSnapshot(next),
        historyPast: [...state.historyPast, snapshot(state.projectDocument)].slice(
          -historyLimit,
        ),
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
