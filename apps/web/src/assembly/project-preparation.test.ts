import { describe, expect, it } from 'vitest';
import { deriveProjectJourney } from './project-journey';
import {
  confirmIntakeDefaults,
  deriveIntakeReview,
  deriveProjectPreparation,
  intakeDefaults,
  type ImportIntakeReport,
  type IntakeReviewState,
  type IntakeValueKey,
} from './project-preparation';
import type {
  ProjectReadiness,
  ReadinessAreaSummary,
  ReadinessIssue,
} from './project-readiness';
import type { RoofSystemChecklist } from './roof-system-checklist';

const issue = (
  code: ReadinessIssue['code'],
  area: ReadinessIssue['area'],
  severity: ReadinessIssue['severity'],
  action?: ReadinessIssue['action'],
): ReadinessIssue => ({
  id: code,
  code,
  area,
  severity,
  ...(action ? { action } : {}),
  affects: ['materials'],
  safeRepair: false,
  source: 'test',
});

function readiness(
  issues: ReadinessIssue[],
  execution: 'ready' | 'blocked' = 'ready',
): ProjectReadiness {
  const areas = (
    [
      'construction',
      'covering',
      'layers',
      'execution',
      'materials',
      'cost',
    ] as const
  ).map((area): ReadinessAreaSummary => ({
    area,
    requirement: 'required',
    state: 'ready',
    counted: true,
    issueIds: [],
  }));
  const doc = (kind: 'execution' | 'materials' | 'cost', state: string) => ({
    kind,
    state: state as 'ready',
    blockerIds: [],
    warningIds: [],
    readySections: 1,
    totalSections: 1,
  });
  return {
    issues,
    areas,
    documents: {
      execution: doc('execution', execution),
      materials: doc('materials', 'ready'),
      cost: doc('cost', 'unavailable'),
    },
    primary: issues.find((item) => item.severity !== 'info') ?? issues[0],
    progress: { ready: 0, total: 0 },
    safeRepair: { issueIds: [], changes: [] },
    limitations: [],
  };
}

function checklist(hasBaseCovering: boolean): RoofSystemChecklist {
  return {
    areas: (
      ['covering', 'ridge', 'verge', 'eave', 'openings', 'drainage'] as const
    ).map((key) => ({
      key,
      state: key === 'covering' && hasBaseCovering ? 'ready' : 'not-configured',
      items: [],
    })),
    counts: { ready: 0, attention: 0, optional: 0 },
    hasBaseCovering,
  };
}

/** A gable read from a PDF: dimensions and pitch written, the rest default. */
const PDF_INTAKE: ImportIntakeReport = {
  source: 'pdf',
  fileName: 'projekt-domu.pdf',
  fingerprint: 'a1b2',
  values: {
    buildingLength: 'document',
    buildingWidth: 'document',
    pitch: 'document',
    eave: 'user',
    spacing: 'roofcalc-default',
    rafterWidth: 'roofcalc-default',
    rafterDepth: 'roofcalc-default',
  },
  pagesRead: 4,
  pagesSkipped: 1,
  readMs: 120,
};

/** The project as created from that import (mm, degrees). */
const START: Partial<Record<IntakeValueKey, number>> = {
  buildingLength: 12_400,
  buildingWidth: 9_600,
  pitch: 40,
  eave: 500,
  spacing: 800,
  rafterWidth: 80,
  rafterDepth: 200,
};
const NOT_OPENED: IntakeReviewState = { opened: false, confirmed: {} };
const reviewOf = (
  state: IntakeReviewState,
  current: Partial<Record<IntakeValueKey, number>> = START,
) =>
  deriveIntakeReview({
    report: PDF_INTAKE,
    startValues: START,
    currentValues: current,
    state,
  })!;

describe('VNext-6.1 review of imported defaults', () => {
  it('starts as needs-review with the current value of every default', () => {
    const review = reviewOf(NOT_OPENED);
    expect(review.status).toBe('needs-review');
    expect(review.fields).toEqual([
      { key: 'spacing', value: 800, state: 'needs-review' },
      { key: 'rafterWidth', value: 80, state: 'needs-review' },
      { key: 'rafterDepth', value: 200, state: 'needs-review' },
    ]);
  });

  it('opening the editor is NOT a confirmation (audit P0)', () => {
    const review = reviewOf({ opened: true, confirmed: {} });
    expect(review.status).toBe('reviewing');
    expect(review.pending).toEqual(['spacing', 'rafterWidth', 'rafterDepth']);
  });

  it('only the explicit confirmation settles the exact values shown', () => {
    const opened: IntakeReviewState = { opened: true, confirmed: {} };
    const confirmed = confirmIntakeDefaults(opened, reviewOf(opened));
    expect(confirmed.confirmed).toEqual({
      spacing: 800,
      rafterWidth: 80,
      rafterDepth: 200,
    });
    expect(reviewOf(confirmed).status).toBe('reviewed');
  });

  it('a value the user changes is their decision; changing it back to the default needs a confirmation again', () => {
    const edited = reviewOf(NOT_OPENED, { ...START, spacing: 900 });
    expect(edited.fields.find((field) => field.key === 'spacing')?.state).toBe(
      'changed',
    );
    expect(edited.pending).toEqual(['rafterWidth', 'rafterDepth']);
    // Confirmed at 900 would not cover 800: the confirmation is the value.
    const confirmedOther: IntakeReviewState = {
      opened: true,
      confirmed: { spacing: 900, rafterWidth: 80, rafterDepth: 200 },
    };
    expect(reviewOf(confirmedOther).pending).toEqual(['spacing']);
  });

  it('an import without defaults has nothing to review', () => {
    expect(
      deriveIntakeReview({
        report: { ...PDF_INTAKE, values: { buildingLength: 'document' } },
        startValues: START,
        currentValues: START,
        state: NOT_OPENED,
      }),
    ).toBeUndefined();
  });
});

describe('VNext-6 project preparation', () => {
  const freshAfterImport = () => {
    const ready = readiness([
      issue('covering-missing', 'covering', 'info', 'choose-covering'),
    ]);
    const journey = deriveProjectJourney({
      readiness: ready,
      checklist: checklist(false),
      cost: { started: false, missingPrices: 0 },
    });
    return { ready, journey };
  };

  it('after an import, the first step is checking what the document did not give', () => {
    const { ready, journey } = freshAfterImport();
    const preparation = deriveProjectPreparation({
      journey,
      readiness: ready,
      intake: PDF_INTAKE,
      review: reviewOf(NOT_OPENED),
    });
    expect(intakeDefaults(PDF_INTAKE)).toEqual([
      'spacing',
      'rafterWidth',
      'rafterDepth',
    ]);
    expect(preparation.next).toEqual({
      group: 'structure',
      action: { action: 'review-structure' },
      reason: 'intake-defaults',
    });
    expect(preparation.intake).toMatchObject({
      fromDocument: ['buildingLength', 'buildingWidth', 'pitch'],
      entered: ['eave'],
      defaults: ['spacing', 'rafterWidth', 'rafterDepth'],
      review: { status: 'needs-review' },
    });
    expect(
      preparation.groups.find((group) => group.key === 'structure'),
    ).toMatchObject({
      state: 'check',
      defaultsToCheck: true,
      action: { action: 'review-structure' },
    });
  });

  it('after opening the editor the next step is the explicit confirmation', () => {
    const { ready, journey } = freshAfterImport();
    const preparation = deriveProjectPreparation({
      journey,
      readiness: ready,
      intake: PDF_INTAKE,
      review: reviewOf({ opened: true, confirmed: {} }),
    });
    expect(preparation.next).toMatchObject({
      group: 'structure',
      reason: 'intake-confirm',
    });
    expect(preparation.groups[0]).toMatchObject({
      state: 'check',
      defaultsToCheck: true,
    });
  });

  it('once confirmed, the journey leads: choose the covering; later groups wait', () => {
    const { ready, journey } = freshAfterImport();
    const opened: IntakeReviewState = { opened: true, confirmed: {} };
    const preparation = deriveProjectPreparation({
      journey,
      readiness: ready,
      intake: PDF_INTAKE,
      review: reviewOf(confirmIntakeDefaults(opened, reviewOf(opened))),
    });
    expect(preparation.next).toMatchObject({
      group: 'covering',
      action: { action: 'choose-covering' },
      reason: 'journey',
    });
    const state = Object.fromEntries(
      preparation.groups.map((group) => [group.key, group.state]),
    );
    // The execution package and the material list can already be printed;
    // the full package waits for the covering.
    expect(state).toEqual({
      structure: 'done',
      covering: 'check',
      'roof-system': 'waiting',
      materials: 'waiting',
      documents: 'partial',
    });
    expect(
      preparation.groups.find((group) => group.key === 'documents')?.available,
    ).toEqual({ ready: 2, total: 2 });
    expect(
      preparation.groups.find((group) => group.key === 'materials')?.waitingFor,
    ).toBe('covering');
  });

  it('without an import the card is the plain journey (no intake facts)', () => {
    const { ready, journey } = freshAfterImport();
    const preparation = deriveProjectPreparation({ journey, readiness: ready });
    expect(preparation.intake).toBeUndefined();
    expect(preparation.next?.reason).toBe('journey');
  });

  it('missing prices keep materials in "check" and are counted, never zero-priced', () => {
    const ready = readiness([]);
    const journey = deriveProjectJourney({
      readiness: ready,
      checklist: checklist(true),
      cost: { started: true, missingPrices: 3 },
    });
    const preparation = deriveProjectPreparation({
      journey,
      readiness: ready,
      cost: { started: true, priced: 9, missing: 3 },
    });
    expect(
      preparation.groups.find((group) => group.key === 'materials')?.state,
    ).toBe('check');
    expect(preparation.prices).toEqual({ priced: 9, missing: 3 });
  });

  it('reports which documents can be produced now', () => {
    const blocked = readiness(
      [issue('geometry-invalid', 'construction', 'blocker', 'review-geometry')],
      'blocked',
    );
    const preparation = deriveProjectPreparation({
      journey: deriveProjectJourney({
        readiness: blocked,
        checklist: checklist(true),
      }),
      readiness: blocked,
    });
    expect(preparation.documents).toEqual([
      { kind: 'execution', state: 'blocked' },
      { kind: 'materials', state: 'ready' },
      { kind: 'cost', state: 'unavailable' },
    ]);
    expect(preparation.groups[0]).toMatchObject({
      key: 'structure',
      state: 'todo',
      action: { action: 'review-geometry' },
    });
    expect(preparation.next?.action.action).toBe('review-geometry');
  });
});
