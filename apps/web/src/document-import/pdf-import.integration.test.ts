import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveRoofTemplate } from '@cieslacalc/roof-math';
import {
  classifyDocumentBytes,
  confirmField,
  deriveImportedRoofDraft,
  EMPTY_DECISIONS,
  fieldProvenance,
  mapDraftToRoofStart,
  recognizeTextLayer,
  recognizeVectorGeometry,
  suggestPageRoles,
  summarizeIntake,
  type ImportDecisions,
  type ImportSource,
  type PageSegment,
  type TextLayerPage,
} from '@cieslacalc/document-import-core';
import {
  createDesignPdf,
  createRoofPlanPdf,
  gableRoofPlanSpec,
  hipRoofPlanSpec,
  houseDesignSpecs,
  monoPitchRoofPlanSpec,
} from '../../../../fixtures/documents/roof-plan-pdf';
import { createDefaultProjectDocument } from '../assembly/store';
import {
  createProjectStartTemplate,
  projectStartValuesFromTemplate,
  validateProjectStart,
} from '../assembly/project-start';
import { segmentsFromOperatorList } from './pdf-geometry';
import { textItemsFromPdf, type Matrix } from './pdf-text';

/**
 * End-to-end in Node with the real parser: PDF bytes → pdf.js text content →
 * positioned text → deterministic recognition → reviewed draft → the same
 * project-start mapping the Creator and the IFC import use.
 */
async function readPdf(bytes: Uint8Array): Promise<TextLayerPage[]> {
  return (await readPdfDocument(bytes)).pages;
}

async function readPdfDocument(
  bytes: Uint8Array,
): Promise<{ pages: TextLayerPage[]; segments: PageSegment[] }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    useSystemFonts: false,
    disableFontFace: true,
    isOffscreenCanvasSupported: false,
    enableXfa: false,
    verbosity: 0,
  });
  const document = await task.promise;
  try {
    const pages: TextLayerPage[] = [];
    const segments: PageSegment[] = [];
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      pages.push({
        page: number,
        width: viewport.width,
        height: viewport.height,
        unit: 'pt',
        items: textItemsFromPdf(
          content.items,
          viewport.transform as unknown as Matrix,
        ),
      });
      segments.push(
        ...segmentsFromOperatorList(
          number,
          await page.getOperatorList(),
          pdfjs.OPS,
          viewport.transform as unknown as Matrix,
        ),
      );
    }
    return { pages, segments };
  } finally {
    await task.destroy();
  }
}

function source(bytes: Uint8Array, pages: TextLayerPage[]): ImportSource {
  return {
    fileName: 'plan.pdf',
    kind: 'pdf',
    byteLength: bytes.length,
    pageCount: pages.length,
    pages: pages.map(({ page, width, height, unit }) => ({
      page,
      width,
      height,
      unit,
    })),
  };
}

describe('PDF document import (real pdf.js parser)', () => {
  const base = createDefaultProjectDocument().project.roof;
  const defaults = projectStartValuesFromTemplate(base);

  it('keeps the committed sample identical to its generator', () => {
    const committed = readFileSync(
      new URL(
        '../../../../fixtures/documents/rzut-dachu-dwuspadowy.pdf',
        import.meta.url,
      ),
    );
    expect(new Uint8Array(committed)).toEqual(
      createRoofPlanPdf(gableRoofPlanSpec()),
    );
  });

  it("serves the import samples with the generators' exact bytes", () => {
    for (const [name, bytes] of [
      ['rzut-dachu-dwuspadowy.pdf', createRoofPlanPdf(gableRoofPlanSpec())],
      ['rzut-dachu-kopertowy.pdf', createRoofPlanPdf(hipRoofPlanSpec())],
      [
        'rzut-dachu-jednospadowy.pdf',
        createRoofPlanPdf(monoPitchRoofPlanSpec()),
      ],
      ['projekt-domu-4-strony.pdf', createDesignPdf(houseDesignSpecs())],
    ] as const)
      expect(
        new Uint8Array(
          readFileSync(
            new URL(`../../public/samples/${name}`, import.meta.url),
          ),
        ),
      ).toEqual(bytes);
  });

  it('keeps the committed mono-pitch sample identical to its generator', () => {
    const committed = readFileSync(
      new URL(
        '../../../../fixtures/documents/rzut-dachu-jednospadowy.pdf',
        import.meta.url,
      ),
    );
    expect(new Uint8Array(committed)).toEqual(
      createRoofPlanPdf(monoPitchRoofPlanSpec()),
    );
  });

  it('turns a mono-pitch plan PDF into a mono-pitch project roof (VNext-8)', async () => {
    const bytes = createRoofPlanPdf(monoPitchRoofPlanSpec());
    const pages = await readPdf(bytes);
    const result = recognizeTextLayer(pages);
    expect(result.roofType).toMatchObject({
      value: 'mono-pitch',
      text: 'jednospadowy',
    });
    const draft = deriveImportedRoofDraft({
      source: source(bytes, pages),
      results: [result],
      decisions: { ...EMPTY_DECISIONS, roofTypeConfirmed: true },
    });
    const mapping = mapDraftToRoofStart(draft, {
      buildingLengthMm: defaults.buildingLengthMm,
      buildingWidthMm: defaults.buildingWidthMm,
      pitchDeg: defaults.pitchDeg,
      eaveOverhangMm: defaults.eaveOverhangMm,
      rafterSpacingMm: defaults.rafterSpacingMm,
      rafterWidthMm: defaults.rafterWidthMm!,
      rafterDepthMm: defaults.rafterDepthMm!,
    });
    expect(mapping.status).toBe('ready');
    if (mapping.status !== 'ready') return;
    // The same project start as the Creator (ADR-016).
    const template = createProjectStartTemplate(mapping.values, base);
    expect(template).toMatchObject({
      type: 'mono-pitch',
      buildingLengthMm: 7_200,
      runMm: 4_200,
      pitchDeg: 12,
      eaveOverhangMm: 400,
      rafterSpacing: { spacingMm: 800 },
      rafterSection: { widthMm: 80, depthMm: 200 },
    });
    const resolved = resolveRoofTemplate(template);
    expect(resolved.rafterSpacing?.stationCount).toBe(10);
  });

  it('turns a gable plan PDF into the existing canonical roof template', async () => {
    const bytes = createRoofPlanPdf(gableRoofPlanSpec());
    expect(
      classifyDocumentBytes({ byteLength: bytes.length, header: bytes }),
    ).toEqual({ status: 'accepted', kind: 'pdf' });
    const pages = await readPdf(bytes);
    const lines = pages[0]!.items.map((item) => item.text);
    expect(lines).toContain('Długość budynku:');
    expect(lines).toContain('Krokwie 8×18 cm co 90 cm');

    const result = recognizeTextLayer(pages);
    const draft = deriveImportedRoofDraft({
      source: source(bytes, pages),
      results: [result],
      decisions: { ...EMPTY_DECISIONS, roofTypeConfirmed: true },
    });
    expect(draft.documentUnit?.unit).toBe('cm');
    expect(draft.scale?.denominator).toBe(100);
    const mapping = mapDraftToRoofStart(draft, {
      buildingLengthMm: defaults.buildingLengthMm,
      buildingWidthMm: defaults.buildingWidthMm,
      pitchDeg: defaults.pitchDeg,
      eaveOverhangMm: defaults.eaveOverhangMm,
      rafterSpacingMm: defaults.rafterSpacingMm,
      rafterWidthMm: defaults.rafterWidthMm!,
      rafterDepthMm: defaults.rafterDepthMm!,
    });
    expect(mapping.status).toBe('ready');
    if (mapping.status !== 'ready') return;
    expect(mapping.values).toEqual({
      roofType: 'gable',
      buildingLengthMm: 12_400,
      buildingWidthMm: 9_600,
      pitchDeg: 35,
      eaveOverhangMm: 500,
      rafterSpacingMm: 900,
      rafterWidthMm: 80,
      rafterDepthMm: 180,
    });
    expect(
      validateProjectStart(
        {
          roofType: 'gable',
          buildingLength: mapping.values.buildingLengthMm,
          buildingWidth: mapping.values.buildingWidthMm,
          pitch: mapping.values.pitchDeg,
          eave: mapping.values.eaveOverhangMm,
          spacing: mapping.values.rafterSpacingMm,
          rafterWidth: mapping.values.rafterWidthMm,
          rafterDepth: mapping.values.rafterDepthMm,
        },
        [
          'buildingLength',
          'buildingWidth',
          'pitch',
          'eave',
          'spacing',
          'rafterWidth',
          'rafterDepth',
        ],
      ),
    ).toEqual([]);
    const template = createProjectStartTemplate(mapping.values, base);
    expect(template).toMatchObject({
      type: 'gable',
      buildingLengthMm: 12_400,
      halfRunMm: 4_800,
      pitchDeg: 35,
      eaveOverhangMm: 500,
      rafterSpacing: { spacingMm: 900 },
      rafterSection: { widthMm: 80, depthMm: 180 },
    });
  });

  it('locates every recognised value on the page', async () => {
    const bytes = createRoofPlanPdf(gableRoofPlanSpec());
    const pages = await readPdf(bytes);
    const result = recognizeTextLayer(pages);
    const length = result.measurements.find(
      (measurement) => measurement.field === 'buildingLength',
    )!;
    // "12,40 m" is drawn at x = 650 pt, baseline y = 478 pt (PDF y-up) →
    // viewport y = 595 − 478 = 117 pt at its baseline.
    expect(length.region?.page).toBe(1);
    expect(length.region?.box.x).toBeCloseTo(650, 0);
    expect(length.region!.box.y + length.region!.box.height).toBeCloseTo(
      117,
      0,
    );
    const rotated = result.measurements.find(
      (measurement) => measurement.raw.text === '960',
    );
    expect(rotated?.field).toBeUndefined();
    expect(rotated?.region?.box.height).toBeGreaterThan(
      rotated!.region!.box.width,
    );
  });

  it('measures the drawn outline at 1:100 and confirms the written dimensions', async () => {
    const bytes = createRoofPlanPdf(gableRoofPlanSpec());
    const { pages, segments } = await readPdfDocument(bytes);
    const text = recognizeTextLayer(pages);
    const vector = recognizeVectorGeometry({
      pages: pages.map((page) => ({ ...page, segments })),
      scale: text.scale,
      written: text.measurements,
    });
    expect(
      vector.measurements.map((item) => [item.field, item.valueMm]),
    ).toEqual([
      ['buildingLength', 12_400],
      ['buildingWidth', 9_600],
    ]);
    const checks = (vector.relations ?? []).flatMap((relation) =>
      relation.kind === 'scale-cross-check' ? [relation.deviationRatio] : [],
    );
    expect(checks).toHaveLength(2);
    for (const deviation of checks) expect(deviation).toBeLessThan(0.001);
    expect(vector.warnings).toEqual([]);
  });

  it('decodes a re-rectangle outline and lets it decide unitless values', async () => {
    const bytes = createRoofPlanPdf(hipRoofPlanSpec());
    const { pages, segments } = await readPdfDocument(bytes);
    const text = recognizeTextLayer(pages);
    const vector = recognizeVectorGeometry({
      pages: pages.map((page) => ({ ...page, segments })),
      scale: text.scale,
      written: text.measurements,
    });
    const draft = deriveImportedRoofDraft({
      source: source(bytes, pages),
      results: [text, vector],
    });
    expect(draft.fields.buildingLength).toMatchObject({
      value: 14_000,
      unitBasis: 'drawing-scale',
      confidence: 'high',
    });
    expect(draft.fields.buildingWidth).toMatchObject({
      value: 10_000,
      unitBasis: 'drawing-scale',
    });
  });

  /**
   * VNext-6: a four-page design. Dimensions on the plan, pitch on the
   * section, a different length on the schedule. Every assertion below is
   * what the review shows the user — and the confirmed import must give
   * EXACTLY the project a manual start with the same values gives.
   */
  it('a four-page design: page roles, a cross-page conflict, then the same project as a manual start', async () => {
    const bytes = createDesignPdf(houseDesignSpecs());
    const committed = readFileSync(
      new URL(
        '../../../../fixtures/documents/projekt-domu-4-strony.pdf',
        import.meta.url,
      ),
    );
    expect(new Uint8Array(committed)).toEqual(bytes);
    const started = performance.now();
    const { pages, segments } = await readPdfDocument(bytes);
    const text = recognizeTextLayer(pages);
    const vector = recognizeVectorGeometry({
      pages: pages.map((page) => ({
        ...page,
        segments: segments.filter((item) => item.page === page.page),
      })),
      scale: text.scale,
      written: text.measurements,
    });
    const roles = suggestPageRoles({ pages, results: [text, vector] });
    const readMs = performance.now() - started;
    // Generous bound: this is a smoke check, not a benchmark.
    expect(readMs).toBeLessThan(10_000);
    expect(roles.map((role) => role.role)).toEqual([
      'unknown',
      'roof-plan',
      'section',
      'schedule',
    ]);
    expect(roles[1]!.hasOutline).toBe(true);

    const importSource = { ...source(bytes, pages), fingerprint: 'test' };
    const draftWith = (decisions: ImportDecisions) =>
      deriveImportedRoofDraft({
        source: importSource,
        results: [text, vector],
        decisions,
      });
    // The schedule quotes 12,00 m: a decision, never a silent choice.
    let decisions: ImportDecisions = { ...EMPTY_DECISIONS };
    let draft = draftWith(decisions);
    expect(draft.fields.buildingLength.status).toBe('conflict');
    expect(summarizeIntake(draft, { reviewed: false }).next).toEqual({
      kind: 'resolve-conflict',
      field: 'buildingLength',
    });
    // The user sets the schedule aside; the plan's value stands, with its page.
    decisions = { ...decisions, excludedPages: [4] };
    draft = draftWith(decisions);
    expect(fieldProvenance(draft, 'buildingLength')).toMatchObject({
      value: 12_400,
      page: 2,
      engine: { mode: 'text-layer' },
    });
    expect(fieldProvenance(draft, 'pitch')).toMatchObject({
      value: 40,
      page: 3,
    });
    // Walk the one-next-step path to the end, counting the user's actions.
    let actions = 1; // setting the schedule aside
    let summary = summarizeIntake(draft, { reviewed: false });
    for (let guard = 0; guard < 12; guard += 1) {
      const next = summary.next;
      if (next.kind === 'final-review') break;
      if (next.kind === 'confirm-roof-type')
        decisions = { ...decisions, roofTypeConfirmed: true };
      else if (next.kind === 'confirm-value')
        decisions = confirmField(decisions, draft, next.field);
      else throw new Error(`unexpected step ${next.kind}`);
      actions += 1;
      draft = draftWith(decisions);
      summary = summarizeIntake(draft, { reviewed: false });
    }
    actions += 2; // final review tick + "Utwórz projekt"
    expect(summary.counts).toMatchObject({ missing: 0, toConfirm: 0 });
    expect(actions).toBeLessThanOrEqual(8);

    const mapping = mapDraftToRoofStart(draft, {
      buildingLengthMm: defaults.buildingLengthMm,
      buildingWidthMm: defaults.buildingWidthMm,
      pitchDeg: defaults.pitchDeg,
      eaveOverhangMm: defaults.eaveOverhangMm,
      rafterSpacingMm: defaults.rafterSpacingMm,
      rafterWidthMm: defaults.rafterWidthMm!,
      rafterDepthMm: defaults.rafterDepthMm!,
    });
    expect(mapping.status).toBe('ready');
    if (mapping.status !== 'ready') return;
    expect(mapping.values).toEqual({
      roofType: 'gable',
      buildingLengthMm: 12_400,
      buildingWidthMm: 9_600,
      pitchDeg: 40,
      eaveOverhangMm: 500,
      rafterSpacingMm: 800,
      rafterWidthMm: 80,
      rafterDepthMm: 200,
    });
    expect(Object.values(mapping.provenance)).toEqual(
      Array(7).fill('document'),
    );
    // Equality with the manual project start: the import adds nothing.
    const manual = createProjectStartTemplate(
      {
        roofType: 'gable',
        buildingLengthMm: 12_400,
        buildingWidthMm: 9_600,
        pitchDeg: 40,
        eaveOverhangMm: 500,
        rafterSpacingMm: 800,
        rafterWidthMm: 80,
        rafterDepthMm: 200,
      },
      base,
    );
    expect(createProjectStartTemplate(mapping.values, base)).toEqual(manual);
  });

  it('keeps unitless hip values uncertain from the text alone', async () => {
    const bytes = createRoofPlanPdf(hipRoofPlanSpec());
    const pages = await readPdf(bytes);
    const draft = deriveImportedRoofDraft({
      source: source(bytes, pages),
      results: [recognizeTextLayer(pages)],
    });
    expect(draft.roofType.value).toBe('hip');
    expect(draft.fields.buildingLength).toMatchObject({
      value: 14_000,
      unitBasis: 'plausible-range',
      requiresConfirmation: true,
    });
    expect(draft.fields.pitch.value).toBeCloseTo(34.992, 3);
    expect(
      mapDraftToRoofStart(draft, {
        buildingLengthMm: 1,
        buildingWidthMm: 1,
        pitchDeg: 1,
        eaveOverhangMm: 0,
        rafterSpacingMm: 1,
        rafterWidthMm: 1,
        rafterDepthMm: 1,
      }).status,
    ).toBe('blocked');
  });
});
