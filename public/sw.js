/**
 * Offline shell for the installed app.
 *
 * No precache manifest: the build's asset names are hashed and unknown here, so
 * caching is decided at runtime by what the request *is*.
 *
 *   /assets/*  — content-hashed, so a hit is always correct: cache first.
 *   navigation — network first, falling back to the cached shell when the
 *                phone is offline. Never serve a stale index.html while the
 *                network works, or a deploy would take days to arrive.
 *   API        — cross-origin, never touched. Sync is the app's job, and a
 *                cached PUT response would be a lie.
 *
 * The app's data lives in localStorage, which needs no service worker at all;
 * this only makes the app itself launchable without a connection.
 */

const VERSION = 'v1';
const SHELL = `study-shell-${VERSION}`;
const ASSETS = `study-assets-${VERSION}`;
const SHELL_URL = new URL('./index.html', self.registration.scope).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.add(SHELL_URL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Anything on another origin — the API above all — is none of our business.
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(SHELL_URL, copy));
          return res;
        })
        .catch(() => caches.match(SHELL_URL).then((hit) => hit ?? Response.error())),
    );
    return;
  }

  const cacheable =
    url.pathname.includes('/assets/') ||
    /\.(png|svg|webmanifest|woff2?)$/.test(url.pathname);
  if (!cacheable) return;

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          // Opaque and error responses are not worth keeping.
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(ASSETS).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
