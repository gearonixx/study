/**
 * The router, in both of its modes.
 *
 * Paths on the web and the hash inside the extension are the same table read
 * two ways, and the pair only stays in step if something checks it. The hash
 * migration is here too: links handed out before the move still have to land.
 *
 * One origin per process is not needed — nothing here is module state — but
 * `location` is stubbed per case, so the module is imported once and the stub
 * swapped underneath it.
 */

const def = (name: string, value: unknown) =>
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });

let replaced = '';
def('history', { replaceState: (_s: unknown, _t: string, url: string) => { replaced = url; } });
def('window', { addEventListener() {}, removeEventListener() {} });

const at = (protocol: string, pathname: string, hash = '', search = '') =>
  def('location', { protocol, pathname, hash, search });

// The module reads `location.protocol` once, at import, to pick its mode.
at('https:', '/');
const web = await import('../src/lib/route');

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${ok || !detail ? '' : `  — ${detail}`}`);
}

console.log('web: real paths, and Today is the bare root');
{
  check('today is the root', web.pathFor('today') === '/', web.pathFor('today'));
  check('a page is its own path', web.pathFor('journal') === '/journal', web.pathFor('journal'));
  check('hrefFor matches', web.hrefFor('board') === '/board', web.hrefFor('board'));

  at('https:', '/');
  check('the root reads as today', web.readRoute().id === 'today', web.readRoute().id);
  at('https:', '/journal');
  check('/journal reads as journal', web.readRoute().id === 'journal', web.readRoute().id);
  at('https:', '/board/');
  check('a trailing slash is ignored', web.readRoute().id === 'board', web.readRoute().id);

  // Page names win the namespace; anything else is a handle.
  at('https:', '/gearonixx');
  const p = web.readRoute();
  check('an unknown path is a profile', p.id === 'profile' && p.login === 'gearonixx', JSON.stringify(p));
  at('https:', '/@gearonixx');
  check('@login still resolves', web.readRoute().login === 'gearonixx');
  at('https:', '/u/gearonixx');
  check('u/login still resolves', web.readRoute().login === 'gearonixx');
  at('https:', '/settings');
  check('settings is a page, not a person', web.readRoute().id === 'settings');
}

console.log('old hash links still land');
{
  at('https:', '/', '#/journal');
  web.migrateHash();
  check('#/journal becomes /journal', replaced === '/journal', replaced);
  at('https:', '/', '#/today');
  web.migrateHash();
  check('#/today becomes the root', replaced === '/', replaced);
  at('https:', '/', '#/gearonixx');
  web.migrateHash();
  check('#/<login> becomes /<login>', replaced === '/gearonixx', replaced);

  replaced = '';
  at('https:', '/journal');
  web.migrateHash();
  check('a path with no hash is left alone', replaced === '', replaced);
}

console.log('the extension keeps the hash');
{
  // Re-imported under a different protocol: no server behind moz-extension://,
  // so `/journal` would be a missing file rather than a route.
  at('moz-extension:', '/index.html');
  const ext = await import(`../src/lib/route?ext`);
  check('hrefFor is a hash', ext.hrefFor('journal') === '#/journal', ext.hrefFor('journal'));
  at('moz-extension:', '/index.html', '#/board');
  check('and it reads the hash back', ext.readRoute().id === 'board', ext.readRoute().id);
  at('moz-extension:', '/index.html', '');
  check('no hash is today', ext.readRoute().id === 'today', ext.readRoute().id);
  replaced = '';
  at('moz-extension:', '/index.html', '#/journal');
  ext.migrateHash();
  check('and nothing is migrated away', replaced === '', replaced);
}

console.log(failures ? `\n${failures} route check(s) failed` : '\nall route checks passed');
if (failures) process.exit(1);
