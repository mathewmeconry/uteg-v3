import { defineConfig } from 'vite';

/** The worker that renders PDFs, see app/pdf/render.server.ts. */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  publicDir: false,
  build: {
    ssr: 'app/pdf/worker.tsx',
    target: 'node24',
    outDir: 'build/server',
    emptyOutDir: false,
    rollupOptions: { output: { entryFileNames: 'pdf-worker.js' } },
  },
});
