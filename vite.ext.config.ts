/**
 * The extension build of the app itself — the same pages, the same code, the
 * same localStorage, mounted at `moz-extension://…/index.html`.
 *
 * Two things differ from the web build, both forced by the extension CSP:
 * assets are addressed relatively, and the theme-boot script that index.html
 * runs inline has to become a file, because `script-src 'self'` refuses inline
 * scripts and there is no opting out of that in MV3.
 */

import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const INLINE = /<script>([\s\S]*?)<\/script>/;

function extensionHtml(): Plugin {
  // Lifted out of index.html rather than copied, so the two cannot drift.
  const html = readFileSync('index.html', 'utf8');
  const boot = INLINE.exec(html)?.[1] ?? '';

  return {
    name: 'timeforces-extension-html',
    transformIndexHtml(input) {
      return input
        .replace(INLINE, '<script src="./theme-boot.js"></script>')
        // A web app manifest means nothing to an extension page and only earns
        // a console warning.
        .replace(/\s*<link rel="manifest"[^>]*>/, '');
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'theme-boot.js', source: boot });
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
