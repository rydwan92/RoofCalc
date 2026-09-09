import { create } from 'zustand';
import {
  toMillimetres,
  workbenchDefaults,
  type WorkbenchInput,
  type LengthUnit,
} from '@cieslacalc/roof-math';
import type {
  WorkbenchObject,
  WorkbenchView,
} from '@cieslacalc/calculator-core';
import { editableLength, parseDecimal } from './format';

export const fields = [
  'geometry.runMm',
  'geometry.pitchDeg',
  'geometry.overhangMm',
  'timber.widthMm',
  'timber.depthMm',
  'wallPlate.widthMm',
  'wallPlate.seatLengthMm',
  'ridge.thicknessMm',
] as const;
export type Field = (typeof fields)[number];
export function fieldValue(input: WorkbenchInput, field: Field): number {
  switch (field) {
    case 'geometry.runMm':
      return input.geometry.runMm;
    case 'geometry.pitchDeg':
      return input.geometry.pitchDeg;
    case 'geometry.overhangMm':
      return input.geometry.overhangMm;
    case 'timber.widthMm':
      return input.timber.widthMm;
    case 'timber.depthMm':
      return input.timber.depthMm;
    case 'wallPlate.widthMm':
      return input.wallPlate.widthMm;
    case 'wallPlate.seatLengthMm':
      return input.wallPlate.seatLengthMm;
    case 'ridge.thicknessMm':
      return input.ridge.thicknessMm;
  }
}
function setValue(
  input: WorkbenchInput,
  field: Field,
  value: number,
): WorkbenchInput {
  const next = structuredClone(input);
  switch (field) {
    case 'geometry.runMm':
      next.geometry.runMm = value;
      break;
    case 'geometry.pitchDeg':
      next.geometry.pitchDeg = value;
      break;
    case 'geometry.overhangMm':
      next.geometry.overhangMm = value;
      break;
    case 'timber.widthMm':
      next.timber.widthMm = value;
      break;
    case 'timber.depthMm':
      next.timber.depthMm = value;
      break;
    case 'wallPlate.widthMm':
      next.wallPlate.widthMm = value;
      break;
    case 'wallPlate.seatLengthMm':
      next.wallPlate.seatLengthMm = value;
      break;
    case 'ridge.thicknessMm':
      next.ridge.thicknessMm = value;
      break;
  }
  return next;
}
function draftFor(
  input: WorkbenchInput,
  unit: LengthUnit,
): Record<Field, string> {
  return Object.fromEntries(
    fields.map((field) => [
      field,
      field === 'geometry.pitchDeg'
        ? String(fieldValue(input, field))
        : editableLength(fieldValue(input, field), unit),
    ]),
  ) as Record<Field, string>;
}
interface WorkbenchState {
  input: WorkbenchInput;
  draft: Record<Field, string>;
  unit: LengthUnit;
  selected: WorkbenchObject;
  view: WorkbenchView;
  detailTarget: 'birdsmouth' | 'ridge-cut';
  dimensions: boolean;
  inspectorOpen: boolean;
  setField: (field: Field, raw: string) => void;
  setUnit: (unit: LengthUnit) => void;
  select: (selected: WorkbenchObject) => void;
  setView: (view: WorkbenchView) => void;
  setInspectorOpen: (open: boolean) => void;
  toggleDimensions: () => void;
  reset: () => void;
}
export const useWorkbench = create<WorkbenchState>((set) => ({
  input: structuredClone(workbenchDefaults),
  draft: draftFor(workbenchDefaults, 'mm'),
  unit: 'mm',
  selected: 'geometry',
  view: 'assembly',
  detailTarget: 'birdsmouth',
  dimensions: true,
  inspectorOpen: true,
  setField: (field, raw) =>
    set((state) => {
      const parsed = parseDecimal(raw);
      let value = NaN;
      if (parsed !== null) {
        try {
          value =
            field === 'geometry.pitchDeg'
              ? parsed
              : toMillimetres(parsed, state.unit);
        } catch {
          /* Validation hides invalid geometry. */
        }
      }
      return {
        draft: { ...state.draft, [field]: raw },
        input: setValue(state.input, field, value),
      };
    }),
  setUnit: (unit) =>
    set((state) => ({
      unit,
      draft: Object.fromEntries(
        fields.map((field) => {
          const value = fieldValue(state.input, field);
          return [
            field,
            field === 'geometry.pitchDeg' || !Number.isFinite(value)
              ? state.draft[field]
              : editableLength(value, unit),
          ];
        }),
      ) as Record<Field, string>,
    })),
  select: (selected) =>
    set((state) => ({
      selected,
      inspectorOpen: true,
      detailTarget:
        selected === 'ridge' || selected === 'ridge-cut'
          ? 'ridge-cut'
          : selected === 'wall-plate' || selected === 'birdsmouth'
            ? 'birdsmouth'
            : state.detailTarget,
    })),
  setView: (view) =>
    set((state) => ({
      view,
      ...(view === 'detail' && state.selected === 'geometry'
        ? { selected: state.detailTarget }
        : {}),
    })),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  toggleDimensions: () => set((state) => ({ dimensions: !state.dimensions })),
  reset: () =>
    set((state) => ({
      input: structuredClone(workbenchDefaults),
      draft: draftFor(workbenchDefaults, state.unit),
    })),
}));
