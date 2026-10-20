import {
  DOCUMENT_IMPORT_LIMITS,
  type DocumentPageInfo,
  type PageSegment,
  type TextLayerPage,
} from '@cieslacalc/document-import-core';
import { segmentsFromOperatorList } from './pdf-geometry';
import { textItemsFromPdf, type Matrix } from './pdf-text';

/**
 * Browser adapter around pdf.js. Loaded lazily (its own chunk and worker),
 * reads only from an in-memory copy of the user's file, never fetches the
 * document from a URL, never runs document JavaScript (pdf.js renders no
 * scripting without the viewer sandbox, which is not shipped), and disables
 * XFA forms. Everything it creates is released by `close()`.
 */

/**
 * The legacy build: pdf.js 6's modern build calls very recent JavaScript APIs
 * (e.g. `Map.prototype.getOrInsertComputed`) that ordinary site laptops and
 * older Firefox/Chromium versions lack. The legacy build ships polyfills.
 */
type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let runtime: Promise<PdfJs> | undefined;
let worker: Worker | undefined;

function loadPdfJs(): Promise<PdfJs> {
  runtime ??= import('pdfjs-dist/legacy/build/pdf.mjs');
  return runtime.then((pdfjs) => {
    if (!worker) {
      // Our own bundled worker entry (see pdf-worker.ts), handed to pdf.js
      // as its port: no separate `.mjs` request, no fake-worker fallback.
      worker = new Worker(new URL('./pdf-worker.ts', import.meta.url), {
        type: 'module',
      });
      pdfjs.GlobalWorkerOptions.workerPort = worker;
    }
    return pdfjs;
  });
}

/**
 * Ends the parser worker when the importer closes, so no document data or
 * parser memory outlives the import session.
 */
export async function releasePdfRuntime(): Promise<void> {
  if (!worker || !runtime) return;
  const pdfjs = await runtime;
  worker.terminate();
  worker = undefined;
  pdfjs.GlobalWorkerOptions.workerPort = null;
}

export class PdfPasswordError extends Error {
  constructor() {
    super('pdf-password');
    this.name = 'PdfPasswordError';
  }
}

export interface OpenedPdf {
  pageCount: number;
  pages: DocumentPageInfo[];
  textPages: TextLayerPage[];
  /** Straight drawn lines of every analysed page, in page space. */
  segments: PageSegment[];
  render(
    page: number,
    canvas: HTMLCanvasElement,
    cssScale: number,
  ): Promise<void>;
  /**
   * VNext-6: a small page preview for the page navigator. Independent of
   * `render`, so drawing thumbnails never cancels the page being read.
   */
  thumbnail(
    page: number,
    canvas: HTMLCanvasElement,
    cssWidth: number,
  ): Promise<void>;
  close(): Promise<void>;
}

export async function openPdf(bytes: ArrayBuffer): Promise<OpenedPdf> {
  const pdfjs = await loadPdfJs();
  // pdf.js 6 contains no eval/Function code generation, so a document
  // cannot make the parser compile code; XFA forms stay disabled.
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    enableXfa: false,
    stopAtErrors: false,
    wasmUrl: new URL('pdfjs/wasm/', document.baseURI).href,
  });
  let document_: Awaited<typeof task.promise>;
  try {
    document_ = await task.promise;
  } catch (error) {
    await task.destroy().catch(() => undefined);
    if (error instanceof Error && error.name === 'PasswordException')
      throw new PdfPasswordError();
    throw error;
  }
  const pageCount = document_.numPages;
  const analysed = Math.min(pageCount, DOCUMENT_IMPORT_LIMITS.maxPdfPages);
  const pages: DocumentPageInfo[] = [];
  const textPages: TextLayerPage[] = [];
  const segments: PageSegment[] = [];
  try {
    for (let number = 1; number <= analysed; number += 1) {
      const page = await document_.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const info: DocumentPageInfo = {
        page: number,
        width: viewport.width,
        height: viewport.height,
        unit: 'pt',
      };
      pages.push(info);
      textPages.push({
        ...info,
        items: textItemsFromPdf(
          content.items,
          viewport.transform as unknown as Matrix,
        ),
      });
      const operators = await page.getOperatorList();
      segments.push(
        ...segmentsFromOperatorList(
          number,
          operators,
          pdfjs.OPS,
          viewport.transform as unknown as Matrix,
        ),
      );
      page.cleanup();
    }
  } catch (error) {
    await task.destroy().catch(() => undefined);
    throw error;
  }

  let activeRender: { cancel(): void } | undefined;
  const thumbnails = new Set<{ cancel(): void }>();
  return {
    pageCount,
    pages,
    textPages,
    segments,
    async render(number, canvas, cssScale) {
      activeRender?.cancel();
      const page = await document_.getPage(number);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: cssScale * ratio });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
      canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;
      const task = page.render({ canvas, viewport });
      activeRender = task;
      try {
        await task.promise;
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === 'RenderingCancelledException'
        )
          return;
        throw error;
      } finally {
        if (activeRender === task) activeRender = undefined;
      }
    },
    async thumbnail(number, canvas, cssWidth) {
      const page = await document_.getPage(number);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const unscaled = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: (cssWidth / unscaled.width) * ratio,
      });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const job = page.render({ canvas, viewport });
      thumbnails.add(job);
      try {
        await job.promise;
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === 'RenderingCancelledException'
        )
          return;
        throw error;
      } finally {
        thumbnails.delete(job);
      }
    },
    async close() {
      activeRender?.cancel();
      for (const job of thumbnails) job.cancel();
      await task.destroy();
    },
  };
}
