/**
 * Exactly one tab speaks.
 *
 * Every open copy of the app runs its own clock — it has to, since each one
 * draws its own ring. But the clock also *announces*, and a notification is not
 * a thing you want three of. Two tabs and a pinned one, and every block change
 * arrives in triplicate.
 *
 * So the tabs elect a speaker. The Web Locks API is exactly the right shape for
 * it: one holder at a time, and the browser hands the lock to the next waiter
 * the moment the holder's tab goes away — including when it crashes, which a
 * hand-rolled lease has to notice by timeout. Where locks are missing, a
 * heartbeat lease in localStorage does the same job with a few seconds of lag.
 */

const LOCK = 'timeforces:announcer';
const LEASE_KEY = 'timeforces:announcer:lease';
/** How often the holder proves it is still there, and how stale is abandoned. */
const BEAT_MS = 1000;
const STALE_MS = 3500;
/** Long enough for every tab's competing claim to have been written. */
const SETTLE_MS = 80;

let speaking = false;
let started = false;
const listeners = new Set<(mine: boolean) => void>();

function announce(next: boolean): void {
  if (next === speaking) return;
  speaking = next;
  for (const fn of listeners) fn(next);
}

/** True when this tab is the one that should notify and chime. */
export function isAnnouncer(): boolean {
  return speaking;
}

export function onAnnouncerChange(fn: (mine: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * A lock held for as long as the tab lives. The promise never settles, which is
 * the documented way to hold a Web Lock indefinitely — releasing it is the tab
 * going away, and that is precisely the event another tab needs to take over.
 */
function viaLocks(): void {
  void navigator.locks
    .request(LOCK, () => {
      announce(true);
      return new Promise<void>(() => {});
    })
    .catch(() => viaLease());
}

/**
 * The fallback: a lease in localStorage, refreshed by whoever holds it. A tab
 * that finds the lease stale takes it. `storage` events mean the others notice
 * a handover without waiting for their own next beat.
 */
function viaLease(): void {
  const me = `${Date.now()}:${Math.random().toString(36).slice(2)}`;

  const read = (): { id: string; at: number } | null => {
    try {
      return JSON.parse(localStorage.getItem(LEASE_KEY) ?? 'null');
    } catch {
      return null;
    }
  };

  const write = (): boolean => {
    try {
      localStorage.setItem(LEASE_KEY, JSON.stringify({ id: me, at: Date.now() }));
      return true;
    } catch {
      return false;
    }
  };

  const beat = () => {
    const held = read();

    // Already ours: just say so again and keep speaking.
    if (held?.id === me) {
      if (!write()) announce(true); // storage denied; better one speaks than none
      else announce(true);
      return;
    }

    // Someone else holds it and is still alive.
    const stale = !held || Date.now() - held.at > STALE_MS;
    if (!stale) {
      announce(false);
      return;
    }

    // Contested. Every tab that notices the lease expire reaches this line in
    // the same tick, so claiming it is not the same as winning it: localStorage
    // is last-write-wins, and taking the lease *and speaking* in one breath is
    // exactly how three tabs end up announcing the same block. Claim, let the
    // other writes land, then look again — only the tab whose id survived is
    // the one that actually holds it.
    if (!write()) {
      announce(true);
      return;
    }
    announce(false);
    setTimeout(() => {
      if (read()?.id === me) announce(true);
    }, SETTLE_MS);
  };

  beat();
  setInterval(beat, BEAT_MS);
  // Hand the lease over deliberately rather than making the next tab wait it out.
  window.addEventListener('pagehide', () => {
    if (read()?.id === me) {
      try {
        localStorage.removeItem(LEASE_KEY);
      } catch {
        /* going away anyway */
      }
    }
  });
}

/**
 * The one deployment allowed to speak.
 *
 * The election above settles which *tab* announces, and it cannot do more than
 * that: Web Locks and localStorage are both scoped to an origin, so a copy of
 * the app on a different origin cannot see this one's claim and elects itself
 * too. That is a security boundary, not a flaw in the election — no amount of
 * cleverness here reaches across it.
 *
 * So the fix is for a copy that is not the canonical deployment to stay quiet.
 * The case that made this necessary: the app moved off GitHub Pages, and the
 * retired origin kept a registered service worker and a granted notification
 * permission. A tab left open there goes on running its own clock — served from
 * its own cache even after the site began returning 404 — and every block
 * arrived twice.
 *
 * Localhost is development and speaks freely. The extension speaks because it
 * has its own gate: the background page owns announcements there, and the app
 * page inside it is passed `notifications: false`.
 */
const CANONICAL_HOST = 'timeforces.vercel.app';

function mayAnnounce(): boolean {
  if (typeof location === 'undefined') return false;
  if (location.protocol === 'moz-extension:' || location.protocol === 'chrome-extension:') {
    return true;
  }
  const host = location.hostname;
  return host === CANONICAL_HOST || host === 'localhost' || host === '127.0.0.1';
}

/** Starts the election once per page. Safe to call from anywhere, any number of times. */
export function electAnnouncer(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  // A retired deployment draws its ring and keeps its clock; it just does not
  // get to tell you about it.
  if (!mayAnnounce()) return;
  // Firefox has had locks since 96 and Safari since 15.4, but the lease is
  // cheap enough to keep for whatever is left below that.
  if (typeof navigator.locks?.request === 'function') viaLocks();
  else viaLease();
}
