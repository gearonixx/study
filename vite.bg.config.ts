/**
 * The background page's script, built on its own.
 *
 * A plain IIFE rather than a module: Firefox loads MV3 background scripts as
 * classic scripts unless the manifest says otherwise, and a single self-
 * contained file is one less thing to get wrong. It shares `lib/` with the app
 * but pulls in no React — the whole file is the clock.
 */

import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist-ext',
    // The app build already ran and owns this directory.
    emptyOutDir: false,
    lib: {
      entry: 'src/ext/background.ts',
      formats: ['iife'],
      name: 'TimeForcesBackground',
      fileName: () => 'background.js',
    },
  },
});
