/**
 * Persistence. The whole database is a single JSON blob in localStorage, which
 * keeps the app genuinely offline-first: no server, no IndexedDB migrations,
 * and the user can export/import the exact bytes at any time.
 */

import {
  DEFAULT_SETTINGS,
  emptyDatabase,
  emptySlots,
  SLOTS_PER_DAY,
  type Database,
  type Day,
  type Goal,
  type SlotStatus,
} from './types';

const KEY = 'study:db:v2';
/** Names this database has lived under before, newest first. */
const LEGACY_KEYS = [
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

    const slots = emptySlots();
    // Days written when a day was twelve blocks long carry slots past the end of
    // the current shape. Rather than dropping that history on the floor, the
    // ones with anything in them are folded into a side note below the day.
    const overflow: string[] = [];
    for (const s of d.slots ?? []) {
      const i = Number(s?.index);
      if (!Number.isInteger(i) || i < 1) continue;
      const note = typeof s.note === 'string' ? s.note : '';
      const mood = typeof s.mood === 'string' ? s.mood : '';
      // 'failed' was retired when the day went to three states: a lost hour and
      // a dropped hour are the same red mark.
      const raw = (s.status ?? 'empty') as SlotStatus | 'failed';
      const status: SlotStatus = raw === 'failed' ? 'skipped' : raw;
      if (i > SLOTS_PER_DAY) {
        if (status !== 'empty' || note.trim() || mood.trim()) {
          overflow.push(`${i} — ${[status, note, mood].filter(Boolean).join(' ').trim()}`);
        }
        continue;
      }
      slots[i - 1] = { index: i, status, note, mood };
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

    days[key] = {
      date: key,
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
  // Themes are gone: one light skin, no picker, and any `theme` an older blob
  // carried is simply dropped by the spread above.
  // A goal of twelve outlived the twelve-block day.
  settings.dailyGoal = Math.min(Math.max(Number(settings.dailyGoal) || SLOTS_PER_DAY, 1), SLOTS_PER_DAY);

  return {
    version: 1,
    days,
    settings,
    unlocked: input.unlocked && typeof input.unlocked === 'object' ? input.unlocked : {},
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

/** Drops untouched days so exports stay small and the graph stays honest. */
export function serialize(db: Database): string {
  return JSON.stringify(db, null, 2);
}
