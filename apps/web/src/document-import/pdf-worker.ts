/**
 * pdf.js worker entry. Bundled by Vite as an ordinary `.js` worker chunk
 * (like the IFC worker) instead of shipping pdf.js's `.mjs` file: some
 * static servers — XAMPP's Apache among them — serve `.mjs` without a
 * JavaScript MIME type, and browsers then refuse to start the module worker.
 * Importing the worker module registers its message handler on `self`.
 */
import 'pdfjs-dist/build/pdf.worker.min.mjs';
