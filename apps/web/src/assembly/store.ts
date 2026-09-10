import { create } from 'zustand';
import {
  addPurlin,
  assemblyDefaults,
  assemblyFromGableTemplate,
  calculateBirdsmouth,
  gableTemplateFromAssembly,
  seatLength,
  toMillimetres,
  type LengthUnit,
} from '@cieslacalc/roof-math';
import type {
  AssemblySpec,
  GableRoofTemplateSpec,
  RafterSpacingMode,
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
  | 'ridge.thicknessMm'
  | 'template.buildingLengthMm'
  | 'template.rafterSpacingMm'
  | `support/${string}/${SupportField}`;
type AssemblyEditField = Exclude<
  EditField,
  'template.buildingLengthMm' | 'template.rafterSpacingMm'
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
  template?: GableRoofTemplateSpec,
): number {
  if (field === 'template.buildingLengthMm')
    return template?.buildingLengthMm ?? NaN;
  if (field === 'template.rafterSpacingMm')
    return template?.rafterSpacing.spacingMm ?? NaN;
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
function templateLayout(template: GableRoofTemplateSpec) {
  return {
    id: template.id,
    buildingLengthMm: template.buildingLengthMm,
    rafterSpacing: template.rafterSpacing,
  };
}
function valueForTemplate(
  template: GableRoofTemplateSpec,
  spec: AssemblySpec,
  field: EditField,
): number {
  return editValue(spec, field, template);
}
function editedTemplate(
  template: GableRoofTemplateSpec,
  spec: AssemblySpec,
  field: EditField,
  value: number,
): GableRoofTemplateSpec {
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
  return gableTemplateFromAssembly(
    editedSpec(spec, field, value),
    templateLayout(template),
  );
}
function committedTemplate(
  template: GableRoofTemplateSpec,
  drafts: Partial<Record<EditField, string>>,
  invalidFields: Partial<Record<EditField, boolean>>,
) {
  const spec = assemblyFromGableTemplate(template);
  return { template, spec, drafts, invalidFields };
}
interface AssemblyState {
  template: GableRoofTemplateSpec;
  spec: AssemblySpec;
  mode: 'quick' | 'builder';
  view: 'skeleton' | 'rafter';
  unit: LengthUnit;
  selected: string;
  collapsed: boolean;
  inspectorOpen: boolean;
  drafts: Partial<Record<EditField, string>>;
  invalidFields: Partial<Record<EditField, boolean>>;
  setMode: (mode: 'quick' | 'builder') => void;
  setView: (view: 'skeleton' | 'rafter') => void;
  setUnit: (unit: LengthUnit) => void;
  setField: (field: EditField, raw: string) => void;
  stepField: (field: EditField, delta: number) => void;
  setSpacingMode: (mode: RafterSpacingMode) => void;
  movePurlin: (id: string, xMm: number) => void;
  add: () => void;
  remove: (id: string) => void;
  select: (id: string) => void;
  setJointControl: (
    id: string,
    control: SupportSpec['joint']['control'],
  ) => void;
  reset: () => void;
}
export const useAssembly = create<AssemblyState>((set) => ({
  template: structuredClone(templateDefaults),
  spec: assemblyFromGableTemplate(templateDefaults),
  mode: 'quick',
  view: 'skeleton',
  unit: 'mm',
  selected: 'roof',
  collapsed: false,
  inspectorOpen: true,
  drafts: {},
  invalidFields: {},
  setMode: (mode) => set({ mode }),
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
        const template = editedTemplate(state.template, state.spec, field, value);
        delete invalidFields[field];
        return committedTemplate(template, drafts, invalidFields);
      } catch {
        invalidFields[field] = true;
        return { drafts, invalidFields };
      }
    }),
  stepField: (field, delta) =>
    set((state) => {
      const value = valueForTemplate(state.template, state.spec, field) + delta;
      try {
        const template = editedTemplate(state.template, state.spec, field, value);
        const drafts = { ...state.drafts };
        delete drafts[field];
        const invalidFields = { ...state.invalidFields };
        delete invalidFields[field];
        return committedTemplate(template, drafts, invalidFields);
      } catch {
        return state;
      }
    }),
  setSpacingMode: (mode) =>
    set((state) => {
      const template = {
        ...state.template,
        rafterSpacing: { ...state.template.rafterSpacing, mode },
      };
      return committedTemplate(template, state.drafts, state.invalidFields);
    }),
  movePurlin: (id, xMm) =>
    set((state) => {
      const field = supportField(id, 'xMm');
      const template = editedTemplate(state.template, state.spec, field, xMm);
      return committedTemplate(
        template,
        { ...state.drafts, [field]: editableLength(xMm, state.unit) },
        state.invalidFields,
      );
    }),
  add: () =>
    set((state) => {
      const template = gableTemplateFromAssembly(
        addPurlin(state.spec),
        templateLayout(state.template),
      );
      return {
        ...committedTemplate(template, state.drafts, state.invalidFields),
        selected: 'support:purlin-1',
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
        ...committedTemplate(
          gableTemplateFromAssembly(spec, templateLayout(state.template)),
          drafts,
          invalidFields,
        ),
        selected: 'roof',
      };
    }),
  select: (selected) => set({ selected, inspectorOpen: true }),
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
      return committedTemplate(
        gableTemplateFromAssembly(spec, templateLayout(state.template)),
        drafts,
        invalidFields,
      );
    }),
  reset: () =>
    set({
      template: structuredClone(templateDefaults),
      spec: assemblyFromGableTemplate(templateDefaults),
      drafts: {},
      invalidFields: {},
      selected: 'roof',
      inspectorOpen: true,
      view: 'skeleton',
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
