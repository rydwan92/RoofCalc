import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const require = createRequire(import.meta.url);

/**
 * VNext document import: pdf.js decodes JBIG2/JPEG 2000 scans with WASM
 * modules it fetches at run time from `wasmUrl`. They are served from the
 * application's own origin (never a CDN), like the IFC parser's WASM, and
 * only requested when a document actually contains such an image.
 */
function pdfjsWasmAssets(): Plugin {
  const directory = join(
    dirname(require.resolve('pdfjs-dist/package.json')),
    'wasm',
  );
  // QuickJS is pdf.js's sandbox for running document JavaScript. RoofCalc
  // never runs document scripts, so the sandbox is not shipped at all.
  const files = () =>
    readdirSync(directory).filter((name) => !name.startsWith('quickjs'));
  return {
    name: 'roofcalc-pdfjs-wasm',
    configureServer(server) {
      server.middlewares.use('/pdfjs/wasm/', (request, response, next) => {
        const name = basename((request.url ?? '').split('?')[0] ?? '');
        const file = join(directory, name);
        if (!name || !files().includes(name) || !existsSync(file)) {
          next();
          return;
        }
        response.setHeader(
          'Content-Type',
          name.endsWith('.wasm')
            ? 'application/wasm'
            : name.endsWith('.js')
              ? 'text/javascript'
              : 'text/plain',
        );
        response.end(readFileSync(file));
      });
    },
    generateBundle() {
      for (const name of files())
        this.emitFile({
          type: 'asset',
          fileName: `pdfjs/wasm/${name}`,
          source: readFileSync(join(directory, name)),
        });
    },
  };
}

export default defineConfig({
  plugins: [react(), pdfjsWasmAssets()],
  worker: { format: 'es' },
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          localization: ['i18next', 'react-i18next'],
          'query-vendor': ['@tanstack/react-query'],
          icons: ['lucide-react'],
          'covering-core': ['@cieslacalc/covering-core'],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
});
