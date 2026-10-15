import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  classifyDocumentBytes,
  deriveImportedRoofDraft,
  EMPTY_DECISIONS,
  mapDraftToRoofStart,
  recognizeTextLayer,
  type ImportSource,
  type TextLayerPage,
} from '@cieslacalc/document-import-core';
import {
  createRoofPlanPdf,
  gableRoofPlanSpec,
  hipRoofPlanSpec,
} from '../../../../fixtures/documents/roof-plan-pdf';
import { createDefaultProjectDocument } from '../assembly/store';
import {
  createProjectStartTemplate,
  projectStartValuesFromTemplate,
  validateProjectStart,
} from '../assembly/project-start';
import { textItemsFromPdf, type Matrix } from './pdf-text';

/**
 * End-to-end in Node with the real parser: PDF bytes → pdf.js text content →
 * positioned text → deterministic recognition → reviewed draft → the same
 * project-start mapping the Creator and the IFC import use.
 */
async function readPdf(bytes: Uint8Array): Promise<TextLayerPage[]> {
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
    }
    return pages;
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

  it('keeps unitless hip values uncertain until confirmed', async () => {
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
