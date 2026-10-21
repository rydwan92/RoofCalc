import { describe, expect, it } from 'vitest';
import {
  recognizeTextLayer,
  recognizeVectorGeometry,
  type PageSegment,
  type TextLayerPage,
} from '@cieslacalc/document-import-core';
import { BENCHMARK_CASES } from '../../../../fixtures/import-benchmark/cases';
import {
  scoreBenchmarkCase,
  type BenchmarkScore,
} from '../../../../fixtures/import-benchmark/score';
import { segmentsFromOperatorList } from './pdf-geometry';
import { textItemsFromPdf, type Matrix } from './pdf-text';

/**
 * VNext-6.1 import benchmark over `fixtures/import-benchmark` with the real
 * pdf.js parser (Node). The corpus is synthetic today — it proves the
 * harness and guards regressions; it does NOT measure accuracy on real
 * designs (README.md). The safety bar is absolute: no wrong value may be
 * accepted without asking.
 */
async function read(bytes: Uint8Array) {
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
      const transform = viewport.transform as unknown as Matrix;
      pages.push({
        page: number,
        width: viewport.width,
        height: viewport.height,
        unit: 'pt',
        items: textItemsFromPdf((await page.getTextContent()).items, transform),
      });
      segments.push(
        ...segmentsFromOperatorList(
          number,
          await page.getOperatorList(),
          pdfjs.OPS,
          transform,
        ),
      );
    }
    return { pages, segments };
  } finally {
    await task.destroy();
  }
}

const scores: (BenchmarkScore & { readMs: number })[] = [];

describe('import benchmark (synthetic corpus)', () => {
  it.each(BENCHMARK_CASES.map((testCase) => [testCase.id, testCase] as const))(
    '%s',
    async (_, testCase) => {
      const bytes = testCase.bytes();
      const started = performance.now();
      const { pages, segments } = await read(bytes);
      const text = recognizeTextLayer(pages);
      const vector = recognizeVectorGeometry({
        pages: pages.map((page) => ({
          ...page,
          segments: segments.filter((item) => item.page === page.page),
        })),
        scale: text.scale,
        written: text.measurements,
      });
      const readMs = performance.now() - started;
      const score = scoreBenchmarkCase({
        testCase,
        source: {
          fileName: `${testCase.id}.pdf`,
          kind: 'pdf',
          byteLength: bytes.length,
          pageCount: pages.length,
          pages: pages.map(({ page, width, height, unit }) => ({
            page,
            width,
            height,
            unit,
          })),
        },
        results: [text, vector],
      });
      scores.push({ ...score, readMs });
      // The safety bar: never a wrong value accepted without asking.
      expect(score.falseAccepted).toEqual([]);
      expect(score.conflictsDetected).toBe(score.conflictsExpected);
      expect(score.roofTypeCorrect).toBe(true);
      expect(score.ready).toBe(true);
      // Regression bars for this synthetic corpus (see README.md).
      expect(score.recalled).toBe(score.fieldsInTruth);
      expect(score.actions).toBeLessThanOrEqual(8);
    },
  );

  it('summarises the corpus', () => {
    const fields = scores.reduce((sum, score) => sum + score.fieldsInTruth, 0);
    const recalled = scores.reduce((sum, score) => sum + score.recalled, 0);
    expect(scores).toHaveLength(BENCHMARK_CASES.length);
    expect(recalled / fields).toBe(1);
    if (process.env.ROOFCALC_BENCHMARK_REPORT)
      console.table(
        scores.map((score) => ({
          case: score.id,
          recall: `${score.recalled}/${score.fieldsInTruth}`,
          falseAccepted: score.falseAccepted.length,
          conflicts: `${score.conflictsDetected}/${score.conflictsExpected}`,
          actions: score.actions,
          readMs: Math.round(score.readMs),
        })),
      );
  });
});
