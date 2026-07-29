/**
 * Ties the server-side database to the live store: completes the GitHub OAuth
 * handoff on load, merges the server copy with what's local, and pushes changes
 * back on a short debounce. A sibling of useVault — same shape, different sink.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Database } from './types';
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

  // On load: finish any OAuth handoff, then pull + merge + converge.
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

        const { db: remote } = await pull();
        if (cancelled) return;
        if (remote) {
          const merged = mergeDatabases(latest.current, remote);
          replaceAll(merged);
          await push(merged); // make both sides agree
        } else {
          await push(latest.current); // first sign-in: seed the server
        }

        if (cancelled) return;
        setLastSyncedAt(Date.now());
        primed.current = true;
        setStatus('idle');
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
    // Runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push changes out, debounced, once the initial sync has primed us.
  useEffect(() => {
    if (!signedIn.current || !primed.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        setStatus('saving');
        await push(latest.current);
        setLastSyncedAt(Date.now());
        setStatus('idle');
      } catch (err) {
        setError((err as Error).message);
        setStatus('error');
      }
    }, 1500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // Only data changes should schedule a write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.days, db.settings, db.unlocked]);

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
