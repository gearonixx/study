/**
 * Derived numbers: hours, streaks, levels, graph intensities.
 * Everything here is a pure function of the Database so it can be memoised.
 */

import { addDays, todayKey } from './date';
import {
  dayHours,
  dayTouched,
  SLOTS_PER_DAY,
  STATUS_XP,
  type Database,
  type Day,
} from './types';

/** GitHub's graph has 5 buckets; ours maps 0..SLOTS_PER_DAY hours onto the ramp. */
export function intensity(hours: number): 0 | 1 | 2 | 3 | 4 {
  if (hours <= 0) return 0;
  if (hours < SLOTS_PER_DAY * 0.25) return 1;
  if (hours < SLOTS_PER_DAY * 0.5) return 2;
  if (hours < SLOTS_PER_DAY * 0.8) return 3;
  return 4;
}

export function xpForDay(day: Day): number {
  const base = day.slots.reduce((sum, s) => sum + STATUS_XP[s.status], 0);
  // Clearing the whole day is worth more than the same hours scattered.
  const perfect = day.slots.every((s) => s.status === 'done');
  return perfect ? base + 60 : base;
}

export function totalXp(db: Database): number {
  return Object.values(db.days).reduce((sum, d) => sum + xpForDay(d), 0);
}

/**
 * Levels grow quadratically: level N needs 100 * N * (N+1) / 2 XP, so early
 * levels arrive fast and later ones need real weeks behind them.
 */
export function levelFromXp(xp: number): {
  level: number;
  into: number;
  need: number;
  progress: number;
} {
  let level = 1;
  let spent = 0;
  for (;;) {
    const need = 100 * level;
    if (xp - spent < need) {
      const into = xp - spent;
      return { level, into, need, progress: need === 0 ? 0 : into / need };
    }
    spent += need;
    level++;
    if (level > 999) return { level, into: 0, need: 100 * level, progress: 0 };
  }
}

export const LEVEL_TITLES: [number, string][] = [
  [1, 'Getting started'],
  [3, 'Warming up'],
  [6, 'Consistent'],
  [10, 'Locked in'],
  [15, 'Relentless'],
  [22, 'Machine'],
  [30, 'Unreasonable'],
  [45, 'Mythic'],
];

export function levelTitle(level: number): string {
  let title = LEVEL_TITLES[0][1];
  for (const [min, name] of LEVEL_TITLES) if (level >= min) title = name;
  return title;
}

/**
 * A day only counts toward a streak once it clears STREAK_MIN_HOURS. One hour
 * is showing up; six is a day of work, and only days of work keep a streak.
 */
export const STREAK_MIN_HOURS = 6;

export function isStreakDay(db: Database, key: string, min = STREAK_MIN_HOURS): boolean {
  const day = db.days[key];
  return !!day && dayHours(day) >= min;
}

export function currentStreak(db: Database, min = STREAK_MIN_HOURS): number {
  const today = todayKey();
  // Today still being blank shouldn't break yesterday's streak.
  let cursor = isStreakDay(db, today, min) ? today : addDays(today, -1);
  let streak = 0;
  while (isStreakDay(db, cursor, min)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function longestStreak(db: Database, min = STREAK_MIN_HOURS): number {
  const keys = Object.keys(db.days)
    .filter((k) => isStreakDay(db, k, min))
    .sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const k of keys) {
    run = prev && addDays(prev, 1) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}

export interface Summary {
  totalHours: number;
  totalSlots: number;
  daysTracked: number;
  activeDays: number;
  bestDay: { date: string; hours: number } | null;
  currentStreak: number;
  longestStreak: number;
  last7: number;
  last30: number;
  avgActive: number;
  xp: number;
  level: number;
  levelInto: number;
  levelNeed: number;
  levelProgress: number;
  title: string;
  /** Hours per goal label, biggest first. */
  byGoal: { label: string; hours: number }[];
}

export function summarize(db: Database): Summary {
  const days = Object.values(db.days);
  let totalHours = 0;
  let totalSlots = 0;
  let activeDays = 0;
  let bestDay: { date: string; hours: number } | null = null;

  const goalHours = new Map<string, number>();

  for (const day of days) {
    const hours = dayHours(day);
    totalHours += hours;
    totalSlots += day.slots.filter((s) => s.status === 'done' || s.status === 'partial').length;
    if (hours > 0) activeDays++;
    if (!bestDay || hours > bestDay.hours) bestDay = { date: day.date, hours };

    // Attribute each credited block to whichever goal was in force.
    let active = '';
    for (const slot of day.slots) {
      const goal = day.goals.filter((g) => g.startSlot <= slot.index).at(-1);
      if (goal) active = goal.label;
      const credit = slot.status === 'done' ? 1 : slot.status === 'partial' ? 0.5 : 0;
      if (credit && active) goalHours.set(active, (goalHours.get(active) ?? 0) + credit);
    }
  }

  const today = todayKey();
  const window = (n: number) => {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const d = db.days[addDays(today, -i)];
      if (d) sum += dayHours(d);
    }
    return sum;
  };

  const xp = totalXp(db);
  const lvl = levelFromXp(xp);

  return {
    totalHours,
    totalSlots,
    daysTracked: days.filter(dayTouched).length,
    activeDays,
    bestDay: bestDay && bestDay.hours > 0 ? bestDay : null,
    currentStreak: currentStreak(db),
    longestStreak: longestStreak(db),
    last7: window(7),
    last30: window(30),
    avgActive: activeDays ? totalHours / activeDays : 0,
    xp,
    level: lvl.level,
    levelInto: lvl.into,
    levelNeed: lvl.need,
    levelProgress: lvl.progress,
    title: levelTitle(lvl.level),
    byGoal: [...goalHours.entries()]
      .map(([label, hours]) => ({ label, hours }))
      .sort((a, b) => b.hours - a.hours),
  };
}

/** Completion rate per slot position — shows which hours of the day you lose. */
export function slotHeatmap(db: Database): { index: number; done: number; total: number }[] {
  const rows = Array.from({ length: SLOTS_PER_DAY }, (_, i) => ({
    index: i + 1,
    done: 0,
    total: 0,
  }));
  for (const day of Object.values(db.days)) {
    if (!dayTouched(day)) continue;
    for (const slot of day.slots) {
      const row = rows[slot.index - 1];
      // Every block on a day you showed up for counts against you — an untouched
      // block 11 is exactly the drop-off this chart exists to show.
      row.total++;
      if (slot.status === 'done') row.done++;
      else if (slot.status === 'partial') row.done += 0.5;
    }
  }
  return rows;
}
