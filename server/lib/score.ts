/**
 * Scoring for the public endpoints.
 *
 * The stored blob is the app's whole database, but the leaderboard and the
 * public profile only ever expose *numbers*: hours per day, streaks, totals.
 * Block comments, goals and side notes never leave this file's input.
 *
 * The status→hours table is duplicated from the frontend rather than imported:
 * the API deploys from `server/` alone and can't reach `src/`. It is three
 * lines and it has never changed.
 */

const STATUS_HOURS: Record<string, number> = {
  empty: 0,
  done: 1,
  partial: 0.5,
  skipped: 0,
  failed: 0, // retired, still present in older blobs
};

/** A day counts toward a streak once it clears this many credited hours. */
export const STREAK_MIN_HOURS = 6;

interface StoredSlot {
  status?: string;
}
interface StoredDay {
  slots?: StoredSlot[];
}
interface StoredDb {
  days?: Record<string, StoredDay>;
}

const DAY_MS = 86_400_000;

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shift(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + delta));
}

export interface Scores {
  /** Credited hours per ISO date, only for days with any. */
  hours: Record<string, number>;
  totalHours: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  last7: number;
  /** Most recent day with credited hours, or null. */
  lastActive: string | null;
}

export function score(data: unknown, todayKey: string): Scores {
  const db = (data ?? {}) as StoredDb;
  const hours: Record<string, number> = {};

  for (const [date, day] of Object.entries(db.days ?? {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const h = (day?.slots ?? []).reduce((sum, s) => sum + (STATUS_HOURS[s?.status ?? 'empty'] ?? 0), 0);
    if (h > 0) hours[date] = h;
  }

  const dates = Object.keys(hours).sort();
  const totalHours = dates.reduce((sum, d) => sum + hours[d], 0);

  // Streaks, counting only days that cleared the bar.
  const strong = new Set(dates.filter((d) => hours[d] >= STREAK_MIN_HOURS));
  let currentStreak = 0;
  let cursor = strong.has(todayKey) ? todayKey : shift(todayKey, -1);
  while (strong.has(cursor)) {
    currentStreak++;
    cursor = shift(cursor, -1);
  }
  let longestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of dates) {
    if (!strong.has(d)) {
      run = 0;
      prev = d;
      continue;
    }
    run = prev && shift(prev, 1) === d && strong.has(prev) ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    prev = d;
  }

  const cutoff = Date.now() - 7 * DAY_MS;
  const last7 = dates
    .filter((d) => {
      const [y, m, day] = d.split('-').map(Number);
      return new Date(y, m - 1, day).getTime() >= cutoff;
    })
    .reduce((sum, d) => sum + hours[d], 0);

  return {
    hours,
    totalHours,
    activeDays: dates.length,
    currentStreak,
    longestStreak,
    last7,
    lastActive: dates.length ? dates[dates.length - 1] : null,
  };
}
