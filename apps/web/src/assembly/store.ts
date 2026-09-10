import { create } from 'zustand';
import {
  addPurlin,
  assemblyDefaults,
  assemblyFromRoofTemplate,
  calculateBirdsmouth,
  convertRoofTemplate,
  gableTemplateFromAssembly,
  roofTemplateFromAssembly,
  seatLength,
  toMillimetres,
  type LengthUnit,
} from '@cieslacalc/roof-math';
import type {
  AssemblySpec,
  EndStationPolicy,
  RafterSpacingMode,
  RoofTemplateSpec,
  SupportSpec,
} from '@cieslacalc/timber-model';
import { editableLength, parseDecimal } from '../format';

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
) {
  const spec = assemblyFromRoofTemplate(template);
  return { template, spec, drafts, invalidFields };
}
interface DomainSnapshot {
  template: RoofTemplateSpec;
}
const historyLimit = 40;
const snapshot = (template: RoofTemplateSpec): DomainSnapshot => ({
  template: structuredClone(template),
});
const sameTemplate = (a: RoofTemplateSpec, b: RoofTemplateSpec) =>
  JSON.stringify(a) === JSON.stringify(b);
interface AssemblyState {
  template: RoofTemplateSpec;
  spec: AssemblySpec;
  mode: 'quick' | 'builder';
  view: 'skeleton' | 'rafter' | 'hip';
  unit: LengthUnit;
  selected: string;
  selectedPrototype?: string;
  collapsed: boolean;
  inspectorOpen: boolean;
  drafts: Partial<Record<EditField, string>>;
  invalidFields: Partial<Record<EditField, boolean>>;
  historyPast: DomainSnapshot[];
  historyFuture: DomainSnapshot[];
  activeTransaction?: DomainSnapshot;
  setMode: (mode: 'quick' | 'builder') => void;
  setRoofType: (type: RoofTemplateSpec['type']) => void;
  setView: (view: 'skeleton' | 'rafter' | 'hip') => void;
  setUnit: (unit: LengthUnit) => void;
  setField: (field: EditField, raw: string) => void;
  setCanonicalField: (field: EditField, value: number) => void;
  stepField: (field: EditField, delta: number) => void;
  setSpacingMode: (mode: RafterSpacingMode) => void;
  setEndStationPolicy: (policy: EndStationPolicy) => void;
  movePurlin: (id: string, xMm: number) => void;
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
  if (sameTemplate(state.template, next.template) || state.activeTransaction)
    return next;
  return {
    ...next,
    historyPast: [...state.historyPast, snapshot(state.template)].slice(
      -historyLimit,
    ),
    historyFuture: [],
  };
}
function restoredSnapshot(snapshotToRestore: DomainSnapshot) {
  return committedTemplate(structuredClone(snapshotToRestore.template), {}, {});
}
export const useAssembly = create<AssemblyState>((set) => ({
  template: structuredClone(templateDefaults),
  spec: assemblyFromRoofTemplate(templateDefaults),
  mode: 'quick',
  view: 'skeleton',
  unit: 'mm',
  selected: 'roof',
  selectedPrototype: undefined,
  collapsed: false,
  inspectorOpen: true,
  drafts: {},
  invalidFields: {},
  historyPast: [],
  historyFuture: [],
  activeTransaction: undefined,
  setMode: (mode) => set({ mode }),
  setRoofType: (type) =>
    set((state) => {
      const template = convertRoofTemplate(state.template, type);
      return {
        ...withHistory(
          state,
          committedTemplate(template, state.drafts, state.invalidFields),
        ),
        selected: 'roof',
        selectedPrototype: undefined,
        view: 'skeleton',
      };
    }),
  setView: (view) => set({ view }),
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
          committedTemplate(template, drafts, invalidFields),
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
          committedTemplate(template, drafts, invalidFields),
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
          committedTemplate(template, drafts, invalidFields),
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
        committedTemplate(template, state.drafts, state.invalidFields),
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
        committedTemplate(template, state.drafts, state.invalidFields),
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
        ),
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
          committedTemplate(template, state.drafts, state.invalidFields),
        ),
        selected: template.intermediateSupports.at(-1)!.id,
        selectedPrototype: undefined,
        inspectorOpen: true,
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
          ),
        ),
        selected: 'roof',
        selectedPrototype: undefined,
      };
    }),
  select: (selected, selectedPrototype) =>
    set({ selected, selectedPrototype, inspectorOpen: true }),
  beginTransaction: () =>
    set((state) =>
      state.activeTransaction
        ? state
        : { activeTransaction: snapshot(state.template) },
    ),
  commitTransaction: () =>
    set((state) => {
      const start = state.activeTransaction;
      if (!start) return state;
      if (sameTemplate(start.template, state.template))
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
        historyFuture: [snapshot(state.template), ...state.historyFuture].slice(
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
        historyPast: [...state.historyPast, snapshot(state.template)].slice(
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
        ),
      );
    }),
  reset: () =>
    set({
      template: structuredClone(templateDefaults),
      spec: assemblyFromRoofTemplate(templateDefaults),
      drafts: {},
      invalidFields: {},
      selected: 'roof',
      selectedPrototype: undefined,
      inspectorOpen: true,
      view: 'skeleton',
      historyPast: [],
      historyFuture: [],
      activeTransaction: undefined,
    }),
}));

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
