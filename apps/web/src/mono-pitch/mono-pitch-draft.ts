import { z } from 'zod';
import type { MonoPitchRoofSystemInput } from '@cieslacalc/calculator-core';
import { monoPitchFramingSpecSchema } from '@cieslacalc/roof-math';

/**
 * VNext-7B-3: the inputs of the mono-pitch workspace, all in millimetres and
 * degrees. A draft of THIS browser (per-viewer convenience), not a project:
 * the V2 project writer that will own mono-pitch roofs is still gated
 * (ADR-015). Everything is computed by `resolveMonoPitchRoofSystem`.
 */
/** VNext-7B-5: an intermediate purlin as the user enters it. */
export interface MonoPitchPurlinDraft {
  positionMm: number;
  widthMm: number;
  heightMm: number;
  seatMm: number;
}
export const MONO_PITCH_PURLIN_FIELDS = [
  'positionMm',
  'widthMm',
  'heightMm',
  'seatMm',
] as const satisfies readonly (keyof MonoPitchPurlinDraft)[];
export const MONO_PITCH_MAX_PURLINS = 4;

export interface MonoPitchDraft {
  buildingLengthMm: number;
  runMm: number;
  pitchDeg: number;
  lowEaveOverhangMm: number;
  topEdge: 'free' | 'abutment';
  highOverhangMm: number;
  vergeOverhangMm: number;
  rafterWidthMm: number;
  rafterDepthMm: number;
  rafterSpacingMm: number;
  lowPlateWidthMm: number;
  lowPlateHeightMm: number;
  lowSeatMm: number;
  highSupportWidthMm: number;
  highSupportHeightMm: number;
  highSeatMm: number;
  battensEnabled: boolean;
  battenGaugeMm: number;
  battenEaveOffsetMm: number;
  battenWidthMm: number;
  battenHeightMm: number;
  counterBattensEnabled: boolean;
  counterBattenWidthMm: number;
  counterBattenHeightMm: number;
  membraneEnabled: boolean;
  membraneRollWidthMm: number;
  membraneRollLengthMm: number;
  membraneOverlapMm: number;
  purlins: MonoPitchPurlinDraft[];
}

export type MonoPitchNumberField = {
  [K in keyof MonoPitchDraft]: MonoPitchDraft[K] extends number ? K : never;
}[keyof MonoPitchDraft];

/** A lean-to of 6 × 4 m at 15° on two 14 × 14 cm plates. */
export const defaultMonoPitchDraft: MonoPitchDraft = {
  buildingLengthMm: 6000,
  runMm: 4000,
  pitchDeg: 15,
  lowEaveOverhangMm: 500,
  topEdge: 'free',
  highOverhangMm: 300,
  vergeOverhangMm: 300,
  rafterWidthMm: 80,
  rafterDepthMm: 200,
  rafterSpacingMm: 900,
  lowPlateWidthMm: 140,
  lowPlateHeightMm: 140,
  lowSeatMm: 100,
  highSupportWidthMm: 140,
  highSupportHeightMm: 140,
  highSeatMm: 100,
  battensEnabled: true,
  battenGaugeMm: 340,
  battenEaveOffsetMm: 50,
  battenWidthMm: 60,
  battenHeightMm: 40,
  counterBattensEnabled: true,
  counterBattenWidthMm: 50,
  counterBattenHeightMm: 25,
  membraneEnabled: true,
  membraneRollWidthMm: 1500,
  membraneRollLengthMm: 50000,
  membraneOverlapMm: 100,
  purlins: [],
};

/** A new purlin halfway up the span, as a starting point to edit. */
export function newMonoPitchPurlin(
  draft: MonoPitchDraft,
): MonoPitchPurlinDraft {
  return {
    positionMm: Math.round((draft.runMm - 100) / 2),
    widthMm: 100,
    heightMm: 160,
    seatMm: 60,
  };
}

/** The key a purlin field's text and issue are stored under. */
export const purlinFieldKey = (
  index: number,
  field: (typeof MONO_PITCH_PURLIN_FIELDS)[number],
) => `purlins.${index}.${field}` as const;
export type MonoPitchPurlinKey = ReturnType<typeof purlinFieldKey>;
export type MonoPitchInputKey = MonoPitchNumberField | MonoPitchPurlinKey;

/** Fields shown in the display unit; the rest are degrees or counts. */
export const MONO_PITCH_ANGLE_FIELDS: ReadonlySet<MonoPitchNumberField> =
  new Set(['pitchDeg']);

export function monoPitchSystemInput(
  draft: MonoPitchDraft,
): MonoPitchRoofSystemInput {
  const abutment = draft.topEdge === 'abutment';
  return {
    framing: {
      roof: {
        type: 'mono-pitch',
        id: 'template:mono-pitch-draft',
        buildingLengthMm: draft.buildingLengthMm,
        runMm: draft.runMm,
        pitchDeg: draft.pitchDeg,
        lowEaveOverhangMm: draft.lowEaveOverhangMm,
        topEdge: draft.topEdge,
        // Against a wall the roof ends at the wall face (MONO_PITCH_ROOF §8).
        highOverhangMm: abutment ? 0 : draft.highOverhangMm,
        vergeOverhangMm: draft.vergeOverhangMm,
      },
      ...(draft.purlins.length
        ? {
            intermediateSupports: draft.purlins.map((purlin) => ({
              ...purlin,
            })),
          }
        : {}),
      rafter: {
        section: { widthMm: draft.rafterWidthMm, depthMm: draft.rafterDepthMm },
        spacing: { mode: 'max-even-spacing', spacingMm: draft.rafterSpacingMm },
      },
      lowSupport: {
        kind: 'wall-plate',
        widthMm: draft.lowPlateWidthMm,
        heightMm: draft.lowPlateHeightMm,
        seatMm: draft.lowSeatMm,
      },
      highSupport: {
        kind: abutment ? 'ledger' : 'wall-plate',
        widthMm: draft.highSupportWidthMm,
        heightMm: draft.highSupportHeightMm,
        seatMm: draft.highSeatMm,
      },
    },
    ...(draft.battensEnabled
      ? {
          battens: {
            enabled: true,
            mode: 'manual',
            gaugeMm: draft.battenGaugeMm,
            eaveOffsetMm: draft.battenEaveOffsetMm,
            battenWidthMm: draft.battenWidthMm,
            battenHeightMm: draft.battenHeightMm,
          },
        }
      : {}),
    ...(draft.counterBattensEnabled
      ? {
          counterBattens: {
            enabled: true,
            widthMm: draft.counterBattenWidthMm,
            heightMm: draft.counterBattenHeightMm,
          },
        }
      : {}),
    ...(draft.membraneEnabled
      ? {
          membrane: {
            layout: { enabled: true },
            product: {
              rollWidthMm: draft.membraneRollWidthMm,
              rollLengthMm: draft.membraneRollLengthMm,
              minimumOverlapMm: draft.membraneOverlapMm,
            },
          },
        }
      : {}),
  };
}

/** Where a framing issue belongs in the form. */
const FIELD_FOR_PATH: Record<string, MonoPitchNumberField> = {
  'roof.buildingLengthMm': 'buildingLengthMm',
  'roof.runMm': 'runMm',
  'roof.pitchDeg': 'pitchDeg',
  'roof.lowEaveOverhangMm': 'lowEaveOverhangMm',
  'roof.highOverhangMm': 'highOverhangMm',
  'roof.vergeOverhangMm': 'vergeOverhangMm',
  'rafter.section.widthMm': 'rafterWidthMm',
  'rafter.section.depthMm': 'rafterDepthMm',
  'rafter.spacing.spacingMm': 'rafterSpacingMm',
  'lowSupport.widthMm': 'lowPlateWidthMm',
  'lowSupport.heightMm': 'lowPlateHeightMm',
  'lowSupport.seatMm': 'lowSeatMm',
  'highSupport.widthMm': 'highSupportWidthMm',
  'highSupport.heightMm': 'highSupportHeightMm',
  'highSupport.seatMm': 'highSeatMm',
};

export type MonoPitchFieldIssue =
  | 'out-of-range'
  | 'seat_exceeds_support'
  | 'notch_consumes_depth'
  | 'supports_overlap'
  | 'support_outside_span';

const NAMED_ISSUES: ReadonlySet<string> = new Set([
  'seat_exceeds_support',
  'notch_consumes_depth',
  'supports_overlap',
  'support_outside_span',
]);

/** Validation paths of a purlin follow the order the user entered them. */
function keyForPath(
  path: readonly (string | number)[],
): MonoPitchInputKey | undefined {
  if (path[0] === 'intermediateSupports' && typeof path[1] === 'number') {
    const field = MONO_PITCH_PURLIN_FIELDS.find((name) => name === path[2]);
    return field ? purlinFieldKey(path[1], field) : undefined;
  }
  return FIELD_FOR_PATH[path.join('.')];
}

/** Field → the one reason it cannot be calculated; empty when it can. */
export function monoPitchDraftIssues(
  draft: MonoPitchDraft,
): Partial<Record<MonoPitchInputKey, MonoPitchFieldIssue>> {
  const result = monoPitchFramingSpecSchema.safeParse(
    monoPitchSystemInput(draft).framing,
  );
  if (result.success) return {};
  const issues: Partial<Record<MonoPitchInputKey, MonoPitchFieldIssue>> = {};
  for (const issue of result.error.issues) {
    const key = keyForPath(issue.path);
    if (!key || issues[key]) continue;
    issues[key] = NAMED_ISSUES.has(issue.message)
      ? (issue.message as MonoPitchFieldIssue)
      : 'out-of-range';
  }
  return issues;
}

const STORAGE_KEY = 'cieslacalc.monoPitchDraft.v1';
const storedDraftSchema = z.object({
  schemaVersion: z.literal(1),
  draft: z.object(
    Object.fromEntries(
      Object.entries(defaultMonoPitchDraft).map(([key, value]) => [
        key,
        Array.isArray(value)
          ? z
              .array(
                z.object({
                  positionMm: z.number().finite(),
                  widthMm: z.number().finite(),
                  heightMm: z.number().finite(),
                  seatMm: z.number().finite(),
                }),
              )
              .max(MONO_PITCH_MAX_PURLINS)
              // A draft saved before purlins existed simply has none.
              .optional()
          : typeof value === 'number'
            ? z.number().finite()
            : typeof value === 'boolean'
              ? z.boolean()
              : z.enum(['free', 'abutment']),
      ]),
    ) as Record<keyof MonoPitchDraft, z.ZodTypeAny>,
  ),
});

/** The remembered draft, or the example. Never throws. */
export function loadMonoPitchDraft(
  storage: Pick<Storage, 'getItem'> | undefined = safeStorage(),
): MonoPitchDraft {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultMonoPitchDraft };
    const parsed = storedDraftSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { ...defaultMonoPitchDraft };
    const stored = parsed.data.draft as Partial<MonoPitchDraft>;
    return {
      ...defaultMonoPitchDraft,
      ...stored,
      purlins: stored.purlins ?? [],
    };
  } catch {
    return { ...defaultMonoPitchDraft };
  }
}

export function saveMonoPitchDraft(
  draft: MonoPitchDraft,
  storage: Pick<Storage, 'setItem'> | undefined = safeStorage(),
): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, draft }));
  } catch {
    /* A full or blocked storage only loses the convenience. */
  }
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
