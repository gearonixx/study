/**
 * Builds the Firefox extension into `dist-ext/`.
 *
 * Two Vite passes — the app, then the background script — and then the
 * manifest, whose version is taken from package.json so the two can never
 * disagree. Everything the extension does not need is dropped afterwards:
 * a service worker and a web app manifest are for the website.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-ext');

const run = (...args) =>
  execFileSync('npx', args, { cwd: root, stdio: 'inherit', env: process.env });

console.log('→ app');
run('vite', 'build', '-c', 'vite.ext.config.ts');

console.log('→ background');
run('vite', 'build', '-c', 'vite.bg.config.ts');

console.log('→ manifest');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(root, 'src/ext/manifest.json'), 'utf8'));
manifest.version = pkg.version;
writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// The website's offline story; inside an extension every asset is already local.
for (const stray of ['sw.js', 'manifest.webmanifest']) {
  const path = join(out, stray);
  if (existsSync(path)) rmSync(path);
}

console.log(`\n✓ dist-ext ready — load it with: npx web-ext run -s dist-ext`);
