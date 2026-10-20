import { describe, expect, it } from 'vitest';
import {
  chooseMeasurement,
  confirmField,
  conflictingReadings,
  deriveImportedRoofDraft,
  EMPTY_DECISIONS,
  enterValue,
  type ImportDecisions,
} from './draft';
import { fieldProvenance, summarizeIntake } from './intake';
import { mapDraftToRoofStart } from './mapping';
import type { ImportSource } from './model';
import { effectivePageRole, suggestPageRoles, withoutPages } from './pages';
import {
  recognizeTextLayer,
  type TextLayerItem,
  type TextLayerPage,
} from './text-layer';

/** One text item; y grows downwards like a rendered page. */
function item(text: string, x: number, y: number, size = 10): TextLayerItem {
  return {
    text,
    box: { x, y, width: text.length * size * 0.5, height: size },
  };
}

function page(pageNumber: number, items: TextLayerItem[]): TextLayerPage {
  return { page: pageNumber, width: 842, height: 595, unit: 'pt', items };
}

const DEFAULTS = {
  buildingLengthMm: 10_000,
  buildingWidthMm: 8_000,
  pitchDeg: 35,
  eaveOverhangMm: 500,
  rafterSpacingMm: 800,
  rafterWidthMm: 80,
  rafterDepthMm: 200,
};

/**
 * A four-page building design, the way an architect issues it: a title
 * sheet, the roof plan (dimensions), a section (pitch) and a window
 * schedule whose numbers have nothing to do with the roof.
 */
const TITLE = page(1, [
  item('PROJEKT BUDOWLANY', 50, 40, 18),
  item('Dom jednorodzinny — dach dwuspadowy', 50, 80),
  item('Inwestor: przykład', 50, 100),
  // A drawing list names other sheets; it never makes this one a roof plan.
  item('Spis rysunków: rzut dachu, przekrój A-A, zestawienie', 50, 120, 8),
]);
const ROOF_PLAN = page(2, [
  item('RZUT DACHU', 50, 30, 16),
  item('Długość budynku:', 500, 80),
  item('12,40 m', 650, 80),
  item('Szerokość budynku:', 500, 100),
  item('9,60 m', 650, 100),
  item('patrz przekrój A-A', 500, 400, 7),
  item('Skala 1:100', 500, 500, 8),
]);
const SECTION = page(3, [
  item('PRZEKRÓJ A-A', 50, 30, 16),
  item('Kąt nachylenia dachu', 500, 120),
  item('40°', 650, 120),
  item('Krokwie 8×20 cm co 80 cm', 500, 140),
]);
const SCHEDULE = page(4, [
  item('ZESTAWIENIE STOLARKI OKIENNEJ', 50, 30, 16),
  item('O1 okno 1200 × 1500', 50, 80),
  // Written under its label, not beside it: a medium-confidence reading.
  item('Długość budynku (wariant)', 50, 120),
  item('12,00 m', 50, 134),
]);
const DESIGN = [TITLE, ROOF_PLAN, SECTION, SCHEDULE];

const SOURCE: ImportSource = {
  fileName: 'projekt-domu.pdf',
  kind: 'pdf',
  byteLength: 81920,
  pageCount: 4,
  fingerprint: 'a1b2c3',
  pages: DESIGN.map(({ page: number, width, height, unit }) => ({
    page: number,
    width,
    height,
    unit,
  })),
};

describe('page roles (VNext-6)', () => {
  const text = recognizeTextLayer(DESIGN);
  const roles = suggestPageRoles({ pages: DESIGN, results: [text] });

  it('names each page only from its written title', () => {
    expect(roles.map((role) => [role.page, role.role, role.basis])).toEqual([
      [1, 'unknown', 'none'],
      [2, 'roof-plan', 'heading'],
      [3, 'section', 'heading'],
      [4, 'schedule', 'heading'],
    ]);
    expect(roles[1]!.evidence?.text).toBe('RZUT DACHU');
    expect(roles[1]!.evidence?.region.page).toBe(2);
  });

  it('a small note naming another drawing does not outrank the title', () => {
    // Page 2 says "patrz przekrój A-A" in 7 pt under a 16 pt title.
    expect(roles[1]!.role).toBe('roof-plan');
  });

  it('"przekrój krokwi" is a timber size, not a section drawing', () => {
    const rafters = page(1, [item('Przekrój krokwi 8×18 cm', 50, 50, 16)]);
    expect(suggestPageRoles({ pages: [rafters] })[0]!.role).toBe('unknown');
  });

  it('counts the readings and fields located on each page', () => {
    expect(roles[1]!.fields).toEqual(['buildingLength', 'buildingWidth']);
    expect(roles[2]!.fields).toEqual(
      expect.arrayContaining(['pitch', 'spacing', 'rafterWidth']),
    );
    expect(roles[1]!.readings).toBeGreaterThanOrEqual(2);
    expect(roles.every((role) => role.hasText)).toBe(true);
  });

  it('a user correction overrides the suggestion', () => {
    expect(effectivePageRole(roles[0]!, { 1: 'elevation' })).toBe('elevation');
    expect(effectivePageRole(roles[1]!, { 1: 'elevation' })).toBe('roof-plan');
  });

  it('a scan page without text stays unknown', () => {
    const scan = suggestPageRoles({ pages: [page(1, [])] })[0]!;
    expect(scan).toMatchObject({ role: 'unknown', hasText: false });
  });
});

describe('cross-page conflicts and set-aside pages (VNext-6)', () => {
  const text = recognizeTextLayer(DESIGN);
  const draftWith = (decisions: ImportDecisions = EMPTY_DECISIONS) =>
    deriveImportedRoofDraft({ source: SOURCE, results: [text], decisions });

  it('two explicitly written lengths on different sheets need a decision', () => {
    const draft = draftWith();
    // 12,40 m (same line, explicit unit: high) vs 12,00 m (medium, with a
    // trailing word) — the more certain-looking value is NOT chosen silently.
    expect(draft.fields.buildingLength.status).toBe('conflict');
    // Different certainty levels: before VNext-6 the high one won silently.
    expect(
      conflictingReadings(draft, 'buildingLength').map((reading) => [
        reading.valueMm,
        reading.confidence,
        reading.region?.page,
      ]),
    ).toEqual([
      [12_400, 'high', 2],
      [12_000, 'medium', 4],
    ]);
    const mapping = mapDraftToRoofStart(draft, DEFAULTS);
    expect(mapping.status).toBe('blocked');
    expect(summarizeIntake(draft, { reviewed: false }).next).toEqual({
      kind: 'resolve-conflict',
      field: 'buildingLength',
    });
  });

  it('a choice resolves the conflict and keeps the page of the source', () => {
    const draft = draftWith();
    const selected = draft.fields.buildingLength.measurementId!;
    const resolved = draftWith(
      chooseMeasurement(EMPTY_DECISIONS, 'buildingLength', selected),
    );
    expect(resolved.fields.buildingLength.status).toBe('recognized');
    expect(fieldProvenance(resolved, 'buildingLength')).toMatchObject({
      value: 12_400,
      page: 2,
      documentFingerprint: 'a1b2c3',
      engine: { mode: 'text-layer' },
      valueSource: 'written',
      raw: '12,40 m',
    });
  });

  it('setting the schedule aside removes its readings from the draft', () => {
    const draft = draftWith({ ...EMPTY_DECISIONS, excludedPages: [4] });
    expect(draft.fields.buildingLength.status).toBe('recognized');
    expect(draft.fields.buildingLength.value).toBe(12_400);
    expect(
      draft.measurements.some((measurement) => measurement.region?.page === 4),
    ).toBe(false);
  });

  it('pitch from the section and dimensions from the plan meet in one draft', () => {
    const draft = draftWith({ ...EMPTY_DECISIONS, excludedPages: [4] });
    expect(draft.fields.pitch.value).toBe(40);
    expect(fieldProvenance(draft, 'pitch').page).toBe(3);
    expect(fieldProvenance(draft, 'buildingWidth').page).toBe(2);
    expect(draft.roofType.value).toBe('gable');
  });

  it('withoutPages drops statements located on a skipped page', () => {
    const [kept] = withoutPages([text], [1]);
    // "dach dwuspadowy" is written on the title sheet only.
    expect(kept!.roofType).toBeUndefined();
    expect(kept!.measurements.every((m) => m.region?.page !== 1)).toBe(true);
  });
});

describe('intake summary (VNext-6)', () => {
  const text = recognizeTextLayer(DESIGN);
  const base: ImportDecisions = { ...EMPTY_DECISIONS, excludedPages: [4] };
  const draftWith = (decisions: ImportDecisions) =>
    deriveImportedRoofDraft({ source: SOURCE, results: [text], decisions });

  it('counts settled, uncertain, missing and defaulted values', () => {
    const summary = summarizeIntake(draftWith(base), { reviewed: false });
    const state = Object.fromEntries(
      summary.items.map((entry) => [entry.key, entry.state]),
    );
    expect(state).toMatchObject({
      roofType: 'to-confirm',
      buildingLength: 'recognized',
      buildingWidth: 'recognized',
      pitch: 'recognized',
      eave: 'defaulted',
    });
    expect(summary.counts.total).toBe(8);
    expect(summary.counts.defaulted).toBe(1);
    expect(summary.counts.missing).toBe(0);
    expect(summary.next).toEqual({ kind: 'confirm-roof-type' });
  });

  it('walks the user through one step at a time to the final review', () => {
    let decisions: ImportDecisions = { ...base, roofTypeConfirmed: true };
    let draft = draftWith(decisions);
    let summary = summarizeIntake(draft, { reviewed: false });
    // The section pair (8×20) and "co 80 cm" are read, then confirmed
    // one by one in field order.
    while (summary.next.kind === 'confirm-value') {
      decisions = confirmField(decisions, draft, summary.next.field);
      draft = draftWith(decisions);
      summary = summarizeIntake(draft, { reviewed: false });
    }
    expect(summary.next).toEqual({ kind: 'final-review' });
    expect(summarizeIntake(draft, { reviewed: true }).next).toEqual({
      kind: 'create',
    });
    expect(mapDraftToRoofStart(draft, DEFAULTS).status).toBe('ready');
  });

  it('asks for the roof type first, then for a missing required value', () => {
    const bare = deriveImportedRoofDraft({
      source: SOURCE,
      results: [recognizeTextLayer([ROOF_PLAN])],
    });
    expect(summarizeIntake(bare, { reviewed: false }).next).toEqual({
      kind: 'choose-roof-type',
    });
    const typed = deriveImportedRoofDraft({
      source: SOURCE,
      results: [recognizeTextLayer([ROOF_PLAN])],
      decisions: { ...EMPTY_DECISIONS, roofType: 'gable' },
    });
    expect(summarizeIntake(typed, { reviewed: false }).next).toEqual({
      kind: 'enter-value',
      field: 'pitch',
    });
    const entered = deriveImportedRoofDraft({
      source: SOURCE,
      results: [recognizeTextLayer([ROOF_PLAN])],
      decisions: enterValue(
        { ...EMPTY_DECISIONS, roofType: 'gable' },
        'pitch',
        38,
      ),
    });
    const summary = summarizeIntake(entered, { reviewed: false });
    expect(summary.items.find((entry) => entry.key === 'pitch')?.state).toBe(
      'entered',
    );
  });

  it('a document naming an unsupported roof says so first', () => {
    const mono = page(1, [
      item('Dach jednospadowy', 50, 50),
      item('Długość budynku: 8,00 m', 50, 80),
    ]);
    const draft = deriveImportedRoofDraft({
      source: SOURCE,
      results: [recognizeTextLayer([mono])],
    });
    const summary = summarizeIntake(draft, { reviewed: false });
    expect(summary.next).toEqual({
      kind: 'unsupported-roof',
      text: 'jednospadowy',
    });
    expect(summary.counts.unsupported).toBe(1);
  });
});
