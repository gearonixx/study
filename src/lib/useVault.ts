/**
 * Ties the vault folder to the live database: pulls on connect, and pushes
 * changed days back out on a short debounce.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Database } from './types';
import {
  chooseVault,
  forgetVault,
  getVault,
  mergeVault,
  readVault,
  vaultSupported,
  writeVault,
} from './vault';

export type VaultStatus = 'off' | 'connecting' | 'idle' | 'saving' | 'error';

export interface VaultApi {
  supported: boolean;
  status: VaultStatus;
  /** Folder name once connected, e.g. "july". */
  name: string | null;
  lastSyncedAt: number | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Re-read the folder, picking up edits made outside the app. */
  pull: () => Promise<void>;
}

export function useVault(
  db: Database,
  replaceAll: (next: Database) => void,
): VaultApi {
  const [status, setStatus] = useState<VaultStatus>('off');
  const [name, setName] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The reducer's latest state, so the debounced writer never saves a stale db.
  const latest = useRef(db);
  latest.current = db;
  const timer = useRef<number | null>(null);
  // Skip the very first write, which would otherwise fire on mount.
  const primed = useRef(false);

  const pullFrom = useCallback(
    async (dir: FileSystemDirectoryHandle) => {
      const read = await readVault(dir);
      if (read.days.length || read.settings) {
        replaceAll(mergeVault(latest.current, read));
      }
      setLastSyncedAt(Date.now());
    },
    [replaceAll],
  );

  // Reconnect silently on load if a folder was granted in a previous session.
  useEffect(() => {
    if (!vaultSupported) return;
    let cancelled = false;
    (async () => {
      try {
        const dir = await getVault();
        if (!dir || cancelled) return;
        setName(dir.name);
        setStatus('idle');
        await pullFrom(dir);
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
  }, [pullFrom]);

  // Push changes out, debounced so a burst of clicks is one write.
  useEffect(() => {
    if (status !== 'idle' && status !== 'saving') return;
    if (!primed.current) {
      primed.current = true;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        const dir = await getVault();
        if (!dir) return;
        setStatus('saving');
        await writeVault(dir, latest.current);
        setLastSyncedAt(Date.now());
        setStatus('idle');
      } catch (err) {
        setError((err as Error).message);
        setStatus('error');
      }
    }, 1200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // Only the data matters here; status changes must not retrigger a write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.days, db.settings, db.unlocked]);

  const connect = useCallback(async () => {
    setError(null);
    setStatus('connecting');
    try {
      const dir = await chooseVault();
      setName(dir.name);
      // Pull first so an existing folder of notes wins over an empty app.
      await pullFrom(dir);
      await writeVault(dir, latest.current);
      setStatus('idle');
    } catch (err) {
      const message = (err as Error).message;
      // The user closing the picker is not an error worth showing.
      if ((err as Error).name === 'AbortError') setStatus('off');
      else {
        setError(message);
        setStatus('error');
      }
    }
  }, [pullFrom]);

  const disconnect = useCallback(async () => {
    await forgetVault();
    setName(null);
    setStatus('off');
    setLastSyncedAt(null);
  }, []);

  const pull = useCallback(async () => {
    setError(null);
    try {
      const dir = await getVault(true);
      if (!dir) return;
      await pullFrom(dir);
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    }
  }, [pullFrom]);

  return { supported: vaultSupported, status, name, lastSyncedAt, error, connect, disconnect, pull };
}
