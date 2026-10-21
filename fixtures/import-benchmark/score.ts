import {
  chooseMeasurement,
  confirmField,
  deriveImportedRoofDraft,
  EMPTY_DECISIONS,
  enterValue,
  summarizeIntake,
  type ImportDecisions,
  type ImportedRoofDraftV1,
  type ImportSource,
  type RecognitionResult,
} from '@cieslacalc/document-import-core';
import type { BenchmarkCase, BenchmarkField } from './cases';

/**
 * VNext-6.1 benchmark scoring. Pure: it reads the draft an import produced
 * and replays the ONE-next-step review a careful user would do with the
 * truth in hand, counting their actions. Nothing here knows a parser.
 */
export interface BenchmarkScore {
  id: string;
  input: BenchmarkCase['input'];
  /** Fields the document states (the truth). */
  fieldsInTruth: number;
  /** Of those, read with the right value before any user action. */
  recalled: number;
  /**
   * The dangerous error: accepted WITHOUT asking (no confirmation needed)
   * but wrong. Must stay 0.
   */
  falseAccepted: BenchmarkField[];
  /** Wrong, but the import asked — the review catches it. */
  wrongButAsked: BenchmarkField[];
  conflictsExpected: number;
  conflictsDetected: number;
  roofTypeCorrect: boolean;
  /** Actions from the loaded document to a created project. */
  actions: number;
  ready: boolean;
}

const matches = (field: BenchmarkField, value: number, truth: number) =>
  Math.abs(value - truth) <= (field === 'pitch' ? 0.05 : 1);

export function scoreBenchmarkCase(input: {
  testCase: BenchmarkCase;
  source: ImportSource;
  results: readonly RecognitionResult[];
}): BenchmarkScore {
  const { testCase } = input;
  const truth = testCase.truth.values;
  const draftWith = (decisions: ImportDecisions) =>
    deriveImportedRoofDraft({
      source: input.source,
      results: input.results,
      decisions,
    });
  const first = draftWith(EMPTY_DECISIONS);
  const fields = Object.keys(truth) as BenchmarkField[];
  const falseAccepted: BenchmarkField[] = [];
  const wrongButAsked: BenchmarkField[] = [];
  let recalled = 0;
  for (const field of fields) {
    const state = first.fields[field];
    if (state.value === undefined) continue;
    if (matches(field, state.value, truth[field]!)) {
      recalled += 1;
      continue;
    }
    if (state.requiresConfirmation || state.status === 'conflict')
      wrongButAsked.push(field);
    else falseAccepted.push(field);
  }

  // Replay the review: one next step at a time, the truth in hand.
  let decisions = EMPTY_DECISIONS;
  let draft: ImportedRoofDraftV1 = first;
  let actions = 0;
  let ready = false;
  for (let guard = 0; guard < 40; guard += 1) {
    const next = summarizeIntake(draft, { reviewed: false }).next;
    if (next.kind === 'final-review') {
      actions += 2; // tick the review + "Utwórz projekt"
      ready = true;
      break;
    }
    actions += 1;
    switch (next.kind) {
      case 'unsupported-roof':
      case 'choose-roof-type':
        decisions = { ...decisions, roofType: testCase.truth.roofType };
        break;
      case 'confirm-roof-type':
        decisions =
          draft.roofType.value === testCase.truth.roofType
            ? { ...decisions, roofTypeConfirmed: true }
            : { ...decisions, roofType: testCase.truth.roofType };
        break;
      case 'resolve-conflict': {
        const wanted = truth[next.field];
        const reading =
          wanted === undefined
            ? undefined
            : draft.measurements.find((measurement) => {
                const value =
                  measurement.quantity === 'angle'
                    ? measurement.valueDeg
                    : measurement.valueMm;
                return (
                  measurement.field === next.field &&
                  value !== undefined &&
                  matches(next.field, value, wanted)
                );
              });
        decisions = reading
          ? chooseMeasurement(decisions, next.field, reading.id)
          : enterValue(decisions, next.field, wanted);
        break;
      }
      case 'enter-value':
        if (truth[next.field] === undefined) return finish();
        decisions = enterValue(decisions, next.field, truth[next.field]);
        break;
      case 'confirm-value': {
        const state = draft.fields[next.field];
        const wanted = truth[next.field];
        decisions =
          wanted === undefined ||
          (state.value !== undefined &&
            matches(next.field, state.value, wanted))
            ? confirmField(decisions, draft, next.field)
            : enterValue(decisions, next.field, wanted);
        break;
      }
      default:
        return finish();
    }
    draft = draftWith(decisions);
  }
  return finish();

  function finish(): BenchmarkScore {
    return {
      id: testCase.id,
      input: testCase.input,
      fieldsInTruth: fields.length,
      recalled,
      falseAccepted,
      wrongButAsked,
      conflictsExpected: testCase.conflicts.length,
      conflictsDetected: testCase.conflicts.filter(
        (field) => first.fields[field].status === 'conflict',
      ).length,
      roofTypeCorrect: first.roofType.value === testCase.truth.roofType,
      actions,
      ready,
    };
  }
}
