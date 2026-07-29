/**
 * The vault: an optional real folder on disk that mirrors the database as one
 * Markdown file per day.
 *
 * Why files and not just localStorage: localStorage is a browser detail — it
 * dies with a cleared cache and syncs nowhere. A folder of `2026-07-29.md`
 * files is the opposite: readable in Obsidian, diffable in git, and synced by
 * whatever already syncs your notes (Dropbox, Syncthing, git). The app stays
 * the fast working copy; the folder is the durable one.
 *
 * Uses the File System Access API, so the browser holds a *persistent handle*
 * to the folder you picked — granted once, remembered across sessions, and
 * revocable at any time. Unsupported browsers (Firefox, Safari) fall back to
 * the JSON download/restore in Settings; nothing else changes.
 */

import { dateFromFilename, parseNote, toMarkdown } from './mdParse';
import { dayTouched, type Database, type Day } from './types';

/** Non-day metadata that Markdown can't carry: settings and badge unlocks. */
const META_FILE = '.wizzard.json';
const IDB_NAME = 'wizzard';
const IDB_STORE = 'handles';
const HANDLE_KEY = 'vault';

export const vaultSupported =
  typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/* -- Handle persistence (IndexedDB — handles can't go in localStorage) ------ */

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* -- Directory handle ------------------------------------------------------ */

type Dir = FileSystemDirectoryHandle;

/** Prompts for a folder and remembers it. */
export async function chooseVault(): Promise<Dir> {
  const dir = await window.showDirectoryPicker({ id: 'wizzard', mode: 'readwrite' });
  await idbSet(HANDLE_KEY, dir);
  return dir;
}

/**
 * Returns the remembered folder, or null when there isn't one or permission
 * has lapsed. Pass `prompt` to re-ask rather than silently returning null —
 * browsers require a user gesture for that, so only do it from a click.
 */
export async function getVault(prompt = false): Promise<Dir | null> {
  const dir = await idbGet<Dir>(HANDLE_KEY);
  if (!dir) return null;
  const opts = { mode: 'readwrite' } as const;
  let state = await dir.queryPermission(opts);
  if (state !== 'granted' && prompt) state = await dir.requestPermission(opts);
  return state === 'granted' ? dir : null;
}

export async function forgetVault(): Promise<void> {
  await idbDelete(HANDLE_KEY);
}

export async function vaultName(): Promise<string | null> {
  const dir = await idbGet<Dir>(HANDLE_KEY);
  return dir?.name ?? null;
}

/* -- Writing --------------------------------------------------------------- */

async function writeFile(dir: Dir, name: string, contents: string): Promise<void> {
  const file = await dir.getFileHandle(name, { create: true });
  const stream = await file.createWritable();
  await stream.write(contents);
  await stream.close();
}

/**
 * Writes every touched day plus the metadata sidecar. Days are only rewritten
 * when their text actually changed, so syncing a folder full of unchanged
 * files doesn't churn mtimes (and doesn't spam a git working tree).
 */
export async function writeVault(dir: Dir, db: Database): Promise<number> {
  let written = 0;

  for (const day of Object.values(db.days)) {
    if (!dayTouched(day)) continue;
    const name = `${day.date}.md`;
    const next = toMarkdown(day);

    let current: string | null = null;
    try {
      current = await (await (await dir.getFileHandle(name)).getFile()).text();
    } catch {
      // Missing file — this is a create.
    }
    if (current === next) continue;

    await writeFile(dir, name, next);
    written++;
  }

  await writeFile(
    dir,
    META_FILE,
    JSON.stringify({ version: 1, settings: db.settings, unlocked: db.unlocked }, null, 2),
  );
  return written;
}

/** Writes a single day — the hot path called after every edit. */
export async function writeDay(dir: Dir, day: Day): Promise<void> {
  if (!dayTouched(day)) return;
  await writeFile(dir, `${day.date}.md`, toMarkdown(day));
}

/* -- Reading --------------------------------------------------------------- */

export interface VaultRead {
  days: Day[];
  settings: Partial<Database['settings']> | null;
  unlocked: Record<string, number> | null;
}

/**
 * Reads the folder back. Any `YYYY-MM-DD.md` is parsed as a day, so notes
 * written by hand in Obsidian between sessions are picked up too.
 */
export async function readVault(dir: Dir): Promise<VaultRead> {
  // Keyed by date so a canonical file always beats a legacy one for the same day.
  const byDate = new Map<string, { day: Day; canonical: boolean }>();
  let settings: VaultRead['settings'] = null;
  let unlocked: VaultRead['unlocked'] = null;

  const year = new Date().getFullYear();

  for await (const entry of dir.values()) {
    if (entry.kind !== 'file') continue;

    if (entry.name === META_FILE) {
      try {
        const meta = JSON.parse(await (await entry.getFile()).text());
        settings = meta.settings ?? null;
        unlocked = meta.unlocked ?? null;
      } catch {
        // A corrupt sidecar shouldn't block reading the days.
      }
      continue;
    }

    if (!entry.name.toLowerCase().endsWith('.md')) continue;

    // `2026-07-29.md` is what we write. Anything else that still names a date —
    // `C - 21 july.md`, `F - july 17.md` — is a hand-written note from before
    // the app existed, and is just as readable.
    const strict = /^(\d{4}-\d{2}-\d{2})\.md$/.exec(entry.name);
    const date = strict ? strict[1] : dateFromFilename(entry.name, year);
    if (!date) continue;

    const file = await entry.getFile();
    const { day } = parseNote(await file.text(), date);
    // A folder may hold plenty of Markdown that isn't a day log. Require at
    // least one numbered block before treating a file as study history.
    if (!day.slots.some((s) => s.status !== 'empty' || s.note)) continue;
    if (!dayTouched(day)) continue;
    // The file's own mtime is the only honest "when was this last edited".
    day.updatedAt = file.lastModified || day.updatedAt;

    const prev = byDate.get(date);
    if (!prev || (!prev.canonical && !!strict) || (prev.canonical === !!strict && day.updatedAt > prev.day.updatedAt)) {
      byDate.set(date, { day, canonical: !!strict });
    }
  }

  return { days: [...byDate.values()].map((v) => v.day), settings, unlocked };
}

/**
 * Merges a vault read into the in-memory database. The newer side wins per day,
 * using the file's mtime against the day's `updatedAt`, so editing in Obsidian
 * and editing in the app both survive.
 */
export function mergeVault(db: Database, read: VaultRead): Database {
  const days = { ...db.days };
  for (const incoming of read.days) {
    const existing = days[incoming.date];
    if (!existing || incoming.updatedAt >= existing.updatedAt) days[incoming.date] = incoming;
  }
  return {
    ...db,
    days,
    settings: { ...db.settings, ...(read.settings ?? {}) },
    unlocked: { ...(read.unlocked ?? {}), ...db.unlocked },
  };
}
