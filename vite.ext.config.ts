/**
 * The extension build of the app itself — the same pages, the same code, the
 * same localStorage, mounted at `moz-extension://…/index.html`.
 *
 * Assets are addressed relatively, and the web app manifest is dropped. There
 * used to be a third job here — lifting index.html's inline theme-boot script
 * into a file, because the MV3 CSP refuses inline scripts — but the app has no
 * themes to resolve before paint any more, so there is no inline script left.
 */

import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function extensionHtml(): Plugin {
  return {
    name: 'timeforces-extension-html',
    transformIndexHtml(input) {
      // A web app manifest means nothing to an extension page and only earns
      // a console warning.
      return input.replace(/\s*<link rel="manifest"[^>]*>/, '');
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), extensionHtml()],
  build: {
    outDir: 'dist-ext',
    emptyOutDir: true,
    // Same reasoning as the web build: the range syntax the minifier prefers
    // is younger than the Safari the app still has to render on.
    cssTarget: 'safari14',
  },
});
