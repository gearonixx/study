/** Preferences, data import/export, and the optional GitHub connection. */

import { useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { normalize, serialize } from '../lib/storage';
import { parseNote, dateFromFilename } from '../lib/mdParse';
import { todayKey } from '../lib/date';
import {
  BRIDGE_AFTER,
  SLOTS_PER_DAY,
  dayHours,
  emptyDatabase,
  type Day,
  type Settings,
} from '../lib/types';
import { stageWindow } from '../lib/schedule';
import {
  backupToGist,
  clearAuth,
  findBackupGist,
  loadAuth,
  restoreFromGist,
  signInWithToken,
  type AuthLike,
} from '../lib/auth';
import { Button, Card, Modal, TextInput, num } from './ui';

export function SettingsPage({ onAuthChange }: { onAuthChange: () => void }) {
  const { db, dispatch, vault, cloud } = useStore();
  const s = db.settings;
  const [importOpen, setImportOpen] = useState(false);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const auth = loadAuth();

  const set = (patch: Partial<Settings>) => dispatch({ type: 'setSettings', patch });

  const exportJson = () => {
    const blob = new Blob([serialize(db)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wizzard-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File) => {
    try {
      const next = normalize(JSON.parse(await file.text()));
      dispatch({ type: 'replaceAll', db: next });
      setStatus(`Imported ${Object.keys(next.days).length} days.`);
    } catch (err) {
      setStatus(`Import failed: ${(err as Error).message}`);
    }
  };

  return (
    <div className="stack-lg">
      <Card title="Focus">
        <div className="setting-row">
          <div className="setting-row__text">
            <strong>The day</strong>
            <span>
              {SLOTS_PER_DAY} blocks of an hour, ten minutes between them, a thirty minute BRIDGE
              between the stages. It starts itself and it cannot be paused, skipped or reset.
            </span>
          </div>
          <span className="chip chip--ghost" style={{ cursor: 'default' }}>
            locked
          </span>
        </div>

        <div className="setting-row">
          <div className="setting-row__text">
            <strong>Stage 1</strong>
            <span>Blocks 1–{BRIDGE_AFTER}, every day.</span>
          </div>
          <span className="setting-row__value">{stageWindow(1, Date.now())}</span>
        </div>

        <div className="setting-row">
          <div className="setting-row__text">
            <strong>Stage 2</strong>
            <span>
              Blocks {BRIDGE_AFTER + 1}–{SLOTS_PER_DAY}, after the BRIDGE.
            </span>
          </div>
          <span className="setting-row__value">{stageWindow(2, Date.now())}</span>
        </div>

        <div className="setting-row">
          <div className="setting-row__text">
            <strong>Unclaimed blocks</strong>
            <span>An hour you don't mark clean or dirty goes red an hour after it closes.</span>
          </div>
          <span className="chip chip--ghost" style={{ cursor: 'default' }}>
            1h — locked
          </span>
        </div>

        <div className="setting-row">
          <div className="setting-row__text">
            <strong>Daily goal</strong>
            <span>Hours the progress bar fills toward.</span>
          </div>
          <TextInput
            type="number"
            min={1}
            max={SLOTS_PER_DAY}
            value={s.dailyGoal}
            style={{ width: 80 }}
            onChange={(e) =>
              set({ dailyGoal: Math.min(SLOTS_PER_DAY, Math.max(1, Number(e.target.value) || 1)) })
            }
          />
        </div>

        <Toggle
          label="Desktop notifications"
          hint="Alerts you when a block ends and when the break is over."
          checked={s.notifications}
          onChange={(v) => {
            set({ notifications: v });
            if (v && typeof Notification !== 'undefined') void Notification.requestPermission();
          }}
        />

        <Toggle
          label="Sound"
          hint="A short chime on every phase change."
          checked={s.sound}
          onChange={(v) => set({ sound: v })}
        />

      </Card>

      <Card title="Folder sync">
        {!vault.supported ? (
          <p className="muted small">
            This browser can't write to a folder. Chrome or Edge can — everywhere else, use the
            JSON export below.
          </p>
        ) : vault.status === 'off' ? (
          <div className="setting-row" style={{ paddingTop: 0 }}>
            <div className="setting-row__text">
              <strong>Keep a folder of Markdown files</strong>
              <span>
                One <code>YYYY-MM-DD.md</code> per day, written as you work. Point it at your
                Obsidian vault and the notes stay yours — readable, diffable, synced by whatever
                already syncs that folder.
              </span>
            </div>
            <Button variant="primary" onClick={() => void vault.connect()}>
              Choose folder
            </Button>
          </div>
        ) : (
          <>
            <div className="setting-row" style={{ paddingTop: 0 }}>
              <div className="setting-row__text">
                <strong>
                  <span className={`dot dot--${vault.status}`} /> {vault.name}
                </strong>
                <span>
                  {vault.status === 'saving'
                    ? 'Saving…'
                    : vault.lastSyncedAt
                      ? `Last synced ${new Date(vault.lastSyncedAt).toLocaleTimeString()}`
                      : 'Connected'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={() => void vault.pull()}>Re-read folder</Button>
                <Button onClick={() => void vault.disconnect()}>Disconnect</Button>
              </div>
            </div>
            <p className="muted small">
              Edits made in Obsidian are picked up on “Re-read folder” and at startup.
            </p>
          </>
        )}
        {vault.error && (
          <p className="small" style={{ color: 'var(--danger)' }}>
            {vault.error}
          </p>
        )}
      </Card>

      <Card title="Your data">
        <p className="muted small" style={{ marginBottom: 12 }}>
          Everything lives in this browser's localStorage. Nothing leaves the machine unless you
          connect a folder or back up to a gist.
        </p>

        <div className="setting-row">
          <div className="setting-row__text">
            <strong>Import Obsidian notes</strong>
            <span>Paste a daily note, or load the .md files straight from disk.</span>
          </div>
          <Button onClick={() => setImportOpen(true)}>Import .md</Button>
        </div>

        <div className="setting-row">
          <div className="setting-row__text">
            <strong>Export</strong>
            <span>
              {Object.keys(db.days).length} days ·{' '}
              {num(Object.values(db.days).reduce((n, d) => n + dayHours(d), 0))} hours
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={exportJson}>Download JSON</Button>
            <Button onClick={() => fileRef.current?.click()}>Restore JSON</Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importJson(f);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-row__text">
            <strong>Reset everything</strong>
            <span>Deletes every day, badge and setting on this device.</span>
          </div>
          <Button
            variant="danger"
            onClick={() => {
              if (confirm('Delete all local study data? This cannot be undone.'))
                dispatch({ type: 'replaceAll', db: emptyDatabase() });
            }}
          >
            Reset
          </Button>
        </div>
        {status && <p className="muted small">{status}</p>}
      </Card>

      {cloud.configured && (
        <Card title="Cloud sync">
          {cloud.user ? (
            <>
              <div className="setting-row" style={{ paddingTop: 0 }}>
                <div className="setting-row__text">
                  <strong>
                    <span className={`dot dot--${cloud.status}`} /> Signed in as {cloud.user.login}
                  </strong>
                  <span>
                    {cloud.status === 'saving'
                      ? 'Saving…'
                      : cloud.status === 'connecting'
                        ? 'Syncing…'
                        : cloud.lastSyncedAt
                          ? `Synced ${new Date(cloud.lastSyncedAt).toLocaleTimeString()} · same data on every device`
                          : 'Connected'}
                  </span>
                </div>
                <Button onClick={() => cloud.signOut()}>Sign out</Button>
              </div>
              <p className="muted small">
                Your study data is saved to the server under your GitHub account — sign in on any
                other device to pick up where you left off. Local storage stays a fast cache, and
                the JSON export stays your portable copy.
              </p>
            </>
          ) : (
            <>
              <p className="muted small" style={{ marginBottom: 12 }}>
                Save your data to the server and reach it on any device. Everything still works
                offline; this just keeps a synced copy tied to your GitHub account.
              </p>
              <div className="setting-row" style={{ paddingTop: 0 }}>
                <div className="setting-row__text">
                  <strong>Sign in with GitHub</strong>
                  <span>One click — no token to paste.</span>
                </div>
                <Button variant="primary" onClick={() => cloud.signIn()}>
                  Sign in with GitHub
                </Button>
              </div>
            </>
          )}
          {cloud.error && (
            <p className="small" style={{ color: 'var(--danger)' }}>
              {cloud.error}
            </p>
          )}
        </Card>
      )}

      <Card title="GitHub">
        {auth.token ? (
          <>
            <div className="setting-row">
              <div className="setting-row__text">
                <strong>Signed in as {auth.login}</strong>
                <span>
                  {auth.gistId
                    ? `Backup gist ${auth.gistId.slice(0, 8)}… · ${
                        auth.lastSyncedAt ? new Date(auth.lastSyncedAt).toLocaleString() : 'never synced'
                      }`
                    : 'No backup gist yet.'}
                </span>
              </div>
              <Button
                onClick={() => {
                  clearAuth();
                  onAuthChange();
                }}
              >
                Sign out
              </Button>
            </div>

            <div className="setting-row">
              <div className="setting-row__text">
                <strong>Backup</strong>
                <span>Writes your database to a secret gist.</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  onClick={async () => {
                    try {
                      let a: AuthLike = auth;
                      if (!a.gistId) a = { ...a, gistId: await findBackupGist(a) };
                      await backupToGist(a, db);
                      onAuthChange();
                      setStatus('Backed up to gist.');
                    } catch (err) {
                      setStatus((err as Error).message);
                    }
                  }}
                >
                  Back up now
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      let a: AuthLike = auth;
                      if (!a.gistId) a = { ...a, gistId: await findBackupGist(a) };
                      const next = await restoreFromGist(a);
                      dispatch({ type: 'replaceAll', db: next });
                      setStatus(`Restored ${Object.keys(next.days).length} days from gist.`);
                    } catch (err) {
                      setStatus((err as Error).message);
                    }
                  }}
                >
                  Restore
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="muted small" style={{ marginBottom: 12 }}>
              Optional. Signing in only adds your name and avatar to the header and unlocks gist
              backup — every feature works signed out.
            </p>
            <div className="setting-row">
              <div className="setting-row__text">
                <strong>Sign in with GitHub</strong>
                <span>A personal access token with the gist scope.</span>
              </div>
              <Button variant="primary" onClick={() => setTokenOpen(true)}>
                Sign in
              </Button>
            </div>
          </>
        )}
      </Card>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={setStatus} />

      <TokenModal
        open={tokenOpen}
        onClose={() => setTokenOpen(false)}
        onDone={() => {
          setTokenOpen(false);
          onAuthChange();
        }}
      />
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="setting-row">
      <div className="setting-row__text">
        <strong>{label}</strong>
        <span>{hint}</span>
      </div>
      <button
        className="switch"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}

function ImportModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const { dispatch } = useStore();
  const [text, setText] = useState('');
  const [date, setDate] = useState(todayKey());
  const filesRef = useRef<HTMLInputElement>(null);

  const preview = text.trim() ? parseNote(text, date) : null;

  const importFiles = async (files: FileList) => {
    const year = new Date().getFullYear();
    const days: Day[] = [];
    let skipped = 0;
    for (const file of Array.from(files)) {
      const key = dateFromFilename(file.name, year);
      if (!key) {
        skipped++;
        continue;
      }
      const { day } = parseNote(await file.text(), key);
      days.push(day);
    }
    if (days.length) dispatch({ type: 'importDays', days });
    onDone(
      `Imported ${days.length} day${days.length === 1 ? '' : 's'}${
        skipped ? `, skipped ${skipped} file(s) with no date in the name` : ''
      }.`,
    );
    onClose();
  };

  return (
    <Modal
      open={open}
      title="Import notes"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!preview}
            onClick={() => {
              if (!preview) return;
              dispatch({ type: 'importDays', days: [preview.day] });
              onDone(`Imported ${date}.`);
              setText('');
              onClose();
            }}
          >
            Import this day
          </Button>
        </>
      }
    >
      <div className="stack">
        <div className="setting-row" style={{ paddingTop: 0 }}>
          <div className="setting-row__text">
            <strong>Bulk import</strong>
            <span>Select your whole notes folder — dates come from the filenames.</span>
          </div>
          <Button onClick={() => filesRef.current?.click()}>Choose .md files</Button>
          <input
            ref={filesRef}
            type="file"
            accept=".md,text/markdown"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) void importFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        <label className="field">
          <span className="field__label">Or paste one note</span>
          <textarea
            className="input"
            value={text}
            placeholder={'MATH\n00:00 - 12:00\n1 - done ✅\n2 - distracted\n…'}
            onChange={(e) => setText(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field__label">Date for the pasted note</span>
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        {preview && (
          <div className="field">
            <span className="field__label">Preview</span>
            <p className="muted small">
              {preview.day.slots.filter((s) => s.status !== 'empty').length} blocks ·{' '}
              {num(dayHours(preview.day))} hours ·{' '}
              {preview.day.goals.map((g) => g.label).join(', ') || 'no goals'} ·{' '}
              {preview.day.notes.length} notes
            </p>
            {preview.ignored.length > 0 && (
              <p className="muted small">Skipped: {preview.ignored.join(' | ')}</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function TokenModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open={open}
      title="Sign in with a token"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || !token.trim()}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await signInWithToken(token.trim());
                setToken('');
                onDone();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Checking…' : 'Sign in'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <p className="muted small">
          Create a fine-grained or classic token with the <code>gist</code> scope at{' '}
          <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">
            github.com/settings/tokens
          </a>
          . It is stored only in this browser and sent only to api.github.com.
        </p>
        <label className="field">
          <span className="field__label">Personal access token</span>
          <TextInput
            type="password"
            autoFocus
            value={token}
            placeholder="ghp_…"
            onChange={(e) => setToken(e.target.value)}
          />
        </label>
        {error && <p className="small" style={{ color: 'var(--danger)' }}>{error}</p>}
      </div>
    </Modal>
  );
}
