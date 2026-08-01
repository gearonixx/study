/**
 * Persistence. The whole database is a single JSON blob in localStorage, which
 * keeps the app genuinely offline-first: no server, no IndexedDB migrations,
 * and the user can export/import the exact bytes at any time.
 */

import {
  DEFAULT_SETTINGS,
  emptyDatabase,
  emptySlots,
  blocksOf,
  MAX_BLOCKS,
  SCHEDULES,
  SLOTS_PER_DAY,
  STATUS_HOURS,
  THEME_PRESETS,
  type Ambition,
  type Database,
  type Day,
  type Goal,
  type SlotStatus,
} from './types';

const KEY = 'timeforces:db:v1';
/** Names this database has lived under before, newest first. */
const LEGACY_KEYS = [
  'study:db:v2',
  'wizzard:db:v1',
  'study:db:v1',
  'study-wizzard:db:v1',
  'study-anythere:db:v1',
];

/** Repairs partial/older blobs so a hand-edited import can never white-screen. */
export function normalize(raw: unknown): Database {
  const base = emptyDatabase();
  if (!raw || typeof raw !== 'object') return base;
  const input = raw as Partial<Database>;

  const days: Record<string, Day> = {};
  for (const [key, value] of Object.entries(input.days ?? {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !value || typeof value !== 'object') continue;
    const d = value as Partial<Day> & { tag?: string };

    // A day is sized by the shape it was run under, and read at the largest a
    // shape can be — so switching back to a shorter day can never truncate one
    // recorded under a longer one.
    const schedule = d.schedule && SCHEDULES[d.schedule] ? d.schedule : undefined;
    const slots = emptySlots(schedule ? blocksOf(SCHEDULES[schedule]) : SLOTS_PER_DAY);
    // Days written when a day was twelve blocks long carry slots past the end of
    // the current shape. Rather than dropping that history on the floor, the
    // ones with anything in them are folded into a side note below the day.
    const overflow: string[] = [];
    for (const s of d.slots ?? []) {
      const i = Number(s?.index);
      if (!Number.isInteger(i) || i < 1) continue;
      const note = typeof s.note === 'string' ? s.note : '';
      // Statuses this app no longer has, mapped onto the ones it does.
      //
      // 'failed' was retired when the day went to three states: a lost hour and
      // a dropped hour are the same red mark. 'idle' — IDLENESS LIMIT EXCEEDED,
      // stamped by a check-in that no longer exists — is the same again: an
      // hour that opened and got nothing is an hour that is gone.
      //
      // This is not housekeeping. Every one of these keys a `Record<SlotStatus,
      // …>` lookup, so a status the app has never heard of reads `undefined`
      // and `dayHours` returns NaN for the whole day — which is exactly what
      // put "NaN h" on the shadow panel and "NaN h to beat it" on the record.
      const raw = (s.status ?? 'empty') as SlotStatus | 'failed' | 'idle';
      const status: SlotStatus =
        raw === 'failed' || raw === 'idle' ? 'skipped'
        : raw in STATUS_HOURS ? raw
        : 'empty';
      if (i > MAX_BLOCKS) {
        if (status !== 'empty' || note.trim()) {
          overflow.push(`${i} — ${[status, note].filter(Boolean).join(' ').trim()}`);
        }
        continue;
      }
      // `updatedAt`/`auto` are what make a slot-level merge possible; days
      // written before they existed simply don't carry them, and the merge
      // falls back to the day's own stamp for those.
      // A day carrying more slots than its recorded shape grows to fit rather
      // than losing them: the shape is a label, the data is the truth.
      while (slots.length < i) slots.push({ index: slots.length + 1, status: 'empty', note: '' });
      slots[i - 1] = { index: i, status, note };
      if (Number.isFinite(Number(s.updatedAt))) slots[i - 1].updatedAt = Number(s.updatedAt);
      if (s.auto === true) slots[i - 1].auto = true;
    }

    const goals: Goal[] = (d.goals ?? [])
      .filter((g) => g && typeof g.label === 'string')
      .map((g, n) => ({
        id: g.id || `g${n}-${key}`,
        label: g.label,
        detail: typeof g.detail === 'string' ? g.detail : '',
        startSlot: Math.min(Math.max(Number(g.startSlot) || 1, 1), SLOTS_PER_DAY),
        color: Number.isInteger(g.color) ? g.color : 0,
      }))
      .sort((a, b) => a.startSlot - b.startSlot);

    // Databases written before goals existed carried a single day-wide `tag`.
    if (goals.length === 0 && typeof d.tag === 'string' && d.tag.trim()) {
      goals.push({ id: `g0-${key}`, label: d.tag.trim(), detail: '', startSlot: 1, color: 0 });
    }

    // A day carrying more blocks than the standard shape can only have been run
    // under the longer one; stamping it here means an import, a merge or a
    // hand-edited file can't leave those blocks recorded but invisible.
    const shape = schedule ?? (slots.length > SLOTS_PER_DAY ? ('experimental' as const) : undefined);

    days[key] = {
      date: key,
      ...(shape ? { schedule: shape } : {}),
      goals,
      windowTop: typeof d.windowTop === 'string' ? d.windowTop : '',
      windowBottom: typeof d.windowBottom === 'string' ? d.windowBottom : '',
      slots,
      notes: [
        ...(d.notes ?? [])
          .filter((n) => n && typeof n.text === 'string')
          .map((n, i) => ({
            id: n.id || `n${i}-${key}`,
            afterSlot: Math.min(Math.max(Number(n.afterSlot) || 0, 0), SLOTS_PER_DAY),
            text: n.text,
          })),
        ...(overflow.length
          ? [{ id: `overflow-${key}`, afterSlot: SLOTS_PER_DAY, text: `was ${overflow.join(' · ')}` }]
          : []),
      ],
      updatedAt: Number(d.updatedAt) || Date.now(),
    };
  }

  const settings = { ...DEFAULT_SETTINGS, ...(input.settings ?? {}) };
  // Blobs written when there were two skins stored `skin` alongside the theme;
  // only the GitHub pair survived, so anything unrecognised falls back to System.
  if (!THEME_PRESETS.some((p) => p.id === settings.theme)) settings.theme = 'system';
  // A goal of twelve outlived the twelve-block day.
  settings.dailyGoal = Math.min(Math.max(Number(settings.dailyGoal) || SLOTS_PER_DAY, 1), MAX_BLOCKS);
  if (!SCHEDULES[settings.schedule]) settings.schedule = 'standard';

  return {
    version: 1,
    days,
    settings,
    unlocked: input.unlocked && typeof input.unlocked === 'object' ? input.unlocked : {},
    ambitions: Array.isArray(input.ambitions)
      ? (input.ambitions as Ambition[])
          .filter((a) => a && typeof a.text === 'string' && a.text.trim())
          .map((a) => ({
            id: String(a.id || `a-${Math.random().toString(36).slice(2)}`),
            text: String(a.text),
            by: String(a.by ?? ''),
            createdAt: Number(a.createdAt) || Date.now(),
            reachedAt: a.reachedAt ? Number(a.reachedAt) : null,
            updatedAt: Number(a.updatedAt) || Number(a.createdAt) || Date.now(),
          }))
      : [],
  };
}

export function load(): Database {
  try {
    let raw = localStorage.getItem(KEY);
    // The project was renamed twice; adopt whatever an older name left behind
    // rather than silently opening to an empty year.
    if (!raw) {
      for (const legacy of LEGACY_KEYS) {
        raw = localStorage.getItem(legacy);
        if (raw) {
          localStorage.setItem(KEY, raw);
          break;
        }
      }
    }
    if (!raw) return emptyDatabase();
    return normalize(JSON.parse(raw));
  } catch {
    // A corrupt blob should cost the session, not the app.
    return emptyDatabase();
  }
}

export function save(db: Database): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (err) {
    console.error('wizzard: could not persist to localStorage', err);
  }
}

/** Where this device's own recent copies are kept. */
export const BACKUPS_KEY = `${KEY}.backups`;

/** How many local copies to hold, and the newest-first order they're held in. */
const BACKUP_LIMIT = 12;

export interface LocalBackup {
  savedAt: number;
  db: Database;
}

export function readBackups(): LocalBackup[] {
  try {
    const raw = localStorage.getItem(BACKUPS_KEY);
    const list = raw ? (JSON.parse(raw) as LocalBackup[]) : [];
    return Array.isArray(list) ? list.filter((b) => b && b.db && typeof b.savedAt === 'number') : [];
  } catch {
    return [];
  }
}

/**
 * Keeps this device's own copy aside before anything from elsewhere replaces
 * it. The merge is written not to lose work and the server keeps a history of
 * its own, but neither is a reason to have no local floor: this survives the
 * server being unreachable, the account being signed out, and a bad merge,
 * and it is what Settings → Backups restores from.
 *
 * Identical states aren't stacked, and the ring is trimmed by size as well as
 * by count so a long history can never fill the quota.
 */
export function snapshotPrevious(db: Database): void {
  try {
    const list = readBackups();
    const encoded = JSON.stringify(db);
    if (list[0] && JSON.stringify(list[0].db) === encoded) return;

    const next: LocalBackup[] = [{ savedAt: Date.now(), db }, ...list].slice(0, BACKUP_LIMIT);
    // Drop the oldest until it fits: a backup that costs the app its ability to
    // save is worse than one backup fewer.
    while (next.length > 1) {
      try {
        localStorage.setItem(BACKUPS_KEY, JSON.stringify(next));
        return;
      } catch {
        next.pop();
      }
    }
  } catch {
    /* never let keeping a backup break the thing being backed up */
  }
}

/** Drops untouched days so exports stay small and the graph stays honest. */
export function serialize(db: Database): string {
  return JSON.stringify(db, null, 2);
}
