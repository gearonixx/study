/**
 * Recovery.
 *
 * Two independent histories, because the failure that prompted this took out
 * both live copies at once: the server keeps every version ever pushed (thinned
 * to one a day after 48 hours), and this device keeps its own last few states
 * from just before anything arriving from elsewhere replaced them. Either can
 * be restored without the other being reachable.
 *
 * Restoring *merges* rather than overwrites — the same slot-level merge sync
 * uses — so pulling an old version back can only ever add work, never remove
 * today's. There is no destructive button here on purpose.
 */

import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { fetchSnapshot, fetchSnapshots, mergeDatabases, type Snapshot } from '../lib/cloud';
import { readBackups, type LocalBackup } from '../lib/storage';
import { dayHours, type Database } from '../lib/types';
import { Button, Card, num } from './ui';

function when(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return sameDay ? `today ${time}` : `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${time}`;
}

function summary(db: Database): string {
  const days = Object.keys(db.days).length;
  const hours = Object.values(db.days).reduce((n, d) => n + dayHours(d), 0);
  return `${days} day${days === 1 ? '' : 's'} · ${num(hours)} hours`;
}

export function Backups() {
  const { db, dispatch, cloud } = useStore();
  const [local, setLocal] = useState<LocalBackup[]>([]);
  const [remote, setRemote] = useState<Snapshot[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setLocal(readBackups()), []);

  useEffect(() => {
    if (!cloud.user) return;
    let cancelled = false;
    fetchSnapshots()
      .then((s) => !cancelled && setRemote(s))
      .catch(() => !cancelled && setRemote([]));
    return () => {
      cancelled = true;
    };
  }, [cloud.user]);

  // Merging in, never replacing: a restore can add back what was lost without
  // taking away anything recorded since.
  const restore = useCallback(
    (next: Database, label: string) => {
      const merged = mergeDatabases(db, next);
      const before = summary(db);
      dispatch({ type: 'replaceAll', db: merged });
      setStatus(`Merged ${label}. ${before} → ${summary(merged)}.`);
    },
    [db, dispatch],
  );

  const restoreRemote = useCallback(
    async (snap: Snapshot) => {
      setBusy(true);
      setStatus(null);
      try {
        restore(await fetchSnapshot(snap.id), `the version from ${when(Date.parse(snap.createdAt))}`);
      } catch (err) {
        setStatus((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [restore],
  );

  return (
    <Card title="Backups">
      <p className="muted small" style={{ marginBottom: 12 }}>
        Restoring merges an old copy into the current one, so it can only add work back — never
        remove what you have recorded since.
      </p>

      <div className="setting-row">
        <div className="setting-row__text">
          <strong>On this device</strong>
          <span>
            Kept automatically before anything from another device replaces what is here.{' '}
            {local.length === 0 ? 'Nothing saved yet.' : `${local.length} kept.`}
          </span>
        </div>
      </div>
      {local.map((b) => (
        <div className="setting-row" key={b.savedAt}>
          <div className="setting-row__text">
            <strong>{when(b.savedAt)}</strong>
            <span>{summary(b.db)}</span>
          </div>
          <Button onClick={() => restore(b.db, `the local copy from ${when(b.savedAt)}`)}>Restore</Button>
        </div>
      ))}

      {cloud.user && (
        <>
          <div className="setting-row">
            <div className="setting-row__text">
              <strong>On the server</strong>
              <span>
                Every version ever pushed, thinned to one a day after two days.{' '}
                {remote === null ? 'Loading…' : remote.length === 0 ? 'Nothing yet.' : `${remote.length} kept.`}
              </span>
            </div>
          </div>
          {(remote ?? []).map((s) => (
            <div className="setting-row" key={s.id}>
              <div className="setting-row__text">
                <strong>{when(Date.parse(s.createdAt))}</strong>
                <span>
                  {s.days} day{s.days === 1 ? '' : 's'} · {num(s.hours)} hours
                </span>
              </div>
              <Button disabled={busy} onClick={() => void restoreRemote(s)}>
                Restore
              </Button>
            </div>
          ))}
        </>
      )}

      {status && <p className="muted small">{status}</p>}
    </Card>
  );
}
