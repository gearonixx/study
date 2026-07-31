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

  const beat = () => {
    const held = read();
    const stale = !held || Date.now() - held.at > STALE_MS;
    if (held?.id === me || stale) {
      try {
        localStorage.setItem(LEASE_KEY, JSON.stringify({ id: me, at: Date.now() }));
        announce(true);
      } catch {
        // Private mode with storage denied: better every tab speaks than none.
        announce(true);
      }
      return;
    }
    announce(false);
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

/** Starts the election once per page. Safe to call from anywhere, any number of times. */
export function electAnnouncer(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  // Firefox has had locks since 96 and Safari since 15.4, but the lease is
  // cheap enough to keep for whatever is left below that.
  if (typeof navigator.locks?.request === 'function') viaLocks();
  else viaLease();
}
