import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolveApiPort } from './dev-api-port';

const require = createRequire(import.meta.url);

/**
 * The dev proxy follows the API's `PORT` from the ONE root `.env` (the
 * same file the API reads), so changing the port in one place can never
 * leave Vite talking to a dead address. The real environment wins, unless
 * it names this web server's own port (`dev-api-port.ts`). Resolved in the
 * `config` hook, where a `--port` from the command line is already known.
 */
function localApi(): Plugin {
  const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
  return {
    name: 'roofcalc-local-api',
    config(config) {
      const port = resolveApiPort({
        environmentPort: process.env.PORT,
        envFileText: existsSync(envFile)
          ? readFileSync(envFile, 'utf8')
          : undefined,
        webServerPort: config.server?.port ?? 5173,
      });
      return {
        // The static XAMPP build calls the Node API directly on this port.
        define: { __ROOFCALC_LOCAL_API_PORT__: JSON.stringify(port) },
        server: { proxy: { '/api': `http://127.0.0.1:${port}` } },
      };
    },
  };
}

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
  plugins: [react(), pdfjsWasmAssets(), localApi()],
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
  },
});
