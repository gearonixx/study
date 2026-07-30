/**
 * Ties the server-side database to the live store: completes the GitHub OAuth
 * handoff on load, then keeps the two copies converged. A sibling of useVault —
 * same shape, different sink.
 *
 * Every write to the server is a read-modify-write: pull, merge, push. Pushing
 * `latest.current` straight out is what let a device with a stale copy erase
 * another device's afternoon on 2026-07-30 — it had never seen the newer work
 * it was overwriting. On top of that this re-converges whenever the tab comes
 * back to the foreground and on a slow interval, so a phone left open in a
 * pocket stops being stale instead of quietly diverging for hours.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Database } from './types';
import { snapshotPrevious } from './storage';
import {
  cloudConfigured,
  completeSignIn,
  mergeDatabases,
  pull,
  push,
  signIn as cloudSignIn,
  signOut as cloudSignOut,
  type CloudUser,
} from './cloud';

export type CloudStatus = 'off' | 'signed-out' | 'connecting' | 'idle' | 'saving' | 'error';

/** How often a tab that is simply sitting there re-checks the server. */
const REFRESH_MS = 60_000;

export interface CloudApi {
  configured: boolean;
  status: CloudStatus;
  user: CloudUser | null;
  lastSyncedAt: number | null;
  error: string | null;
  signIn: () => void;
  signOut: () => void;
}

export function useServerSync(db: Database, replaceAll: (next: Database) => void): CloudApi {
  const [status, setStatus] = useState<CloudStatus>(cloudConfigured ? 'signed-out' : 'off');
  const [user, setUser] = useState<CloudUser | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Latest state, so the debounced writer never pushes a stale db.
  const latest = useRef(db);
  latest.current = db;
  const timer = useRef<number | null>(null);
  const signedIn = useRef(false);
  const primed = useRef(false);
  // One convergence at a time: two overlapping read-modify-writes would race.
  const busy = useRef(false);
  const apply = useRef(replaceAll);
  apply.current = replaceAll;

  /**
   * Pull, merge, adopt, push. The merge is non-destructive (see cloud.ts), so
   * whichever device runs this last still ends up holding both sides' work.
   */
  const converge = useCallback(async (): Promise<void> => {
    if (!signedIn.current || busy.current) return;
    busy.current = true;
    try {
      setStatus('saving');
      const { db: remote } = await pull();
      const merged = remote ? mergeDatabases(latest.current, remote) : latest.current;

      // Only touch the store when the merge actually brought something in;
      // adopting an identical copy would just cycle the effects below.
      if (JSON.stringify(merged.days) !== JSON.stringify(latest.current.days)) {
        // Last line of defence: whatever this device held is kept aside before
        // anything from elsewhere replaces it.
        snapshotPrevious(latest.current);
        latest.current = merged;
        apply.current(merged);
      }

      await push(merged);
      setLastSyncedAt(Date.now());
      setError(null);
      setStatus('idle');
      primed.current = true;
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    } finally {
      busy.current = false;
    }
  }, []);

  // On load: finish any OAuth handoff, then converge.
  useEffect(() => {
    if (!cloudConfigured) return;
    let cancelled = false;
    (async () => {
      try {
        const u = await completeSignIn();
        if (cancelled) return;
        if (!u) {
          setStatus('signed-out');
          return;
        }
        setUser(u);
        signedIn.current = true;
        setStatus('connecting');
        await converge();
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [converge]);

  // Local changes converge on a short debounce.
  useEffect(() => {
    if (!signedIn.current || !primed.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void converge(), 1500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // Only data changes should schedule a write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.days, db.settings, db.unlocked, converge]);

  // And so does simply coming back to the tab, or leaving it open.
  useEffect(() => {
    if (!cloudConfigured) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void converge();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onVisible);
    const id = window.setInterval(() => void converge(), REFRESH_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onVisible);
      clearInterval(id);
    };
  }, [converge]);

  const signIn = useCallback(() => cloudSignIn(), []);
  const signOut = useCallback(() => {
    cloudSignOut();
    signedIn.current = false;
    primed.current = false;
    setUser(null);
    setLastSyncedAt(null);
    setError(null);
    setStatus('signed-out');
  }, []);

  return { configured: cloudConfigured, status, user, lastSyncedAt, error, signIn, signOut };
}
