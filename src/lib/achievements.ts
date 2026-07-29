/**
 * Badges. Each one is a pure predicate over the database, evaluated after every
 * change; newly-satisfied badges get stamped into `db.unlocked` so the unlock
 * date sticks even if the underlying stat later drops.
 */

import { dayHours, type Database } from './types';
import { currentStreak, longestStreak, summarize } from './stats';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Rough ordering for the grid: 1 easy … 4 brutal. */
  tier: 1 | 2 | 3 | 4;
  earned: (db: Database) => boolean;
  /** 0..1 toward earning it, for the progress bar on locked badges. */
  progress?: (db: Database) => number;
}

const ratio = (value: number, target: number) => Math.max(0, Math.min(1, value / target));

/** Doomguy face sprite for a badge; lives in public/doomguy/. */
const face = (n: number) => `/doomguy/${n}.png`;

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-block',
    name: 'FIRST BLOOD',
    description: 'Land your first focus block. It begins.',
    icon: face(1),
    tier: 1,
    earned: (db) => Object.values(db.days).some((d) => dayHours(d) > 0),
  },
  {
    id: 'first-six',
    name: 'HALF DAY IN HELL',
    description: 'Six credited hours in a single day.',
    icon: face(4),
    tier: 1,
    earned: (db) => Object.values(db.days).some((d) => dayHours(d) >= 6),
    progress: (db) => ratio(Math.max(0, ...Object.values(db.days).map(dayHours)), 6),
  },
  {
    id: 'crossed-bridge',
    name: 'BOTH SIDES OF HELL',
    description: 'Finish a block on each side of the BRIDGE in one day.',
    icon: face(12),
    tier: 2,
    earned: (db) =>
      Object.values(db.days).some(
        (d) =>
          d.slots.slice(0, 6).some((s) => s.status === 'done') &&
          d.slots.slice(6).some((s) => s.status === 'done'),
      ),
  },
  {
    id: 'full-twelve',
    name: 'RIP AND TEAR',
    description: 'All twelve blocks in a single day. Until it is done.',
    icon: face(33),
    tier: 4,
    earned: (db) => Object.values(db.days).some((d) => d.slots.every((s) => s.status === 'done')),
    progress: (db) =>
      ratio(
        Math.max(0, ...Object.values(db.days).map((d) => d.slots.filter((s) => s.status === 'done').length)),
        12,
      ),
  },
  {
    id: 'streak-3',
    name: 'THREE DAYS DAMNED',
    description: 'Three consecutive days in the fight.',
    icon: face(3),
    tier: 1,
    earned: (db) => longestStreak(db) >= 3,
    progress: (db) => ratio(Math.max(currentStreak(db), longestStreak(db)), 3),
  },
  {
    id: 'streak-7',
    name: 'A WEEK IN HELL',
    description: 'Seven consecutive days. No mercy.',
    icon: face(10),
    tier: 2,
    earned: (db) => longestStreak(db) >= 7,
    progress: (db) => ratio(Math.max(currentStreak(db), longestStreak(db)), 7),
  },
  {
    id: 'streak-30',
    name: 'THIRTY DAYS IN HELL',
    description: 'Thirty consecutive days. Nightmare made flesh.',
    icon: face(41),
    tier: 4,
    earned: (db) => longestStreak(db) >= 30,
    progress: (db) => ratio(Math.max(currentStreak(db), longestStreak(db)), 30),
  },
  {
    id: 'hours-50',
    name: 'FIFTY DEEP',
    description: 'Bank 50 credited hours in total.',
    icon: face(9),
    tier: 2,
    earned: (db) => summarize(db).totalHours >= 50,
    progress: (db) => ratio(summarize(db).totalHours, 50),
  },
  {
    id: 'hours-200',
    name: 'THE SLAYER',
    description: 'Bank 200 credited hours in total.',
    icon: face(27),
    tier: 3,
    earned: (db) => summarize(db).totalHours >= 200,
    progress: (db) => ratio(summarize(db).totalHours, 200),
  },
  {
    id: 'hours-1000',
    name: 'THE ONE THEY FEAR',
    description: 'Bank 1000 credited hours in total.',
    icon: face(42),
    tier: 4,
    earned: (db) => summarize(db).totalHours >= 1000,
    progress: (db) => ratio(summarize(db).totalHours, 1000),
  },
  {
    id: 'comeback',
    name: 'BACK FROM THE DEAD',
    description: 'Fail a block, then finish the very next one.',
    icon: face(39),
    tier: 2,
    earned: (db) =>
      Object.values(db.days).some((d) =>
        d.slots.some((s, i) => s.status === 'failed' && d.slots[i + 1]?.status === 'done'),
      ),
  },
  {
    id: 'annotator',
    name: 'THE WAR JOURNAL',
    description: 'Leave comments on 25 different blocks.',
    icon: face(14),
    tier: 2,
    earned: (db) => countComments(db) >= 25,
    progress: (db) => ratio(countComments(db), 25),
  },
  {
    id: 'goal-setter',
    name: 'HUNTING ORDERS',
    description: 'Set goals on 10 different days.',
    icon: face(6),
    tier: 1,
    earned: (db) => countGoalDays(db) >= 10,
    progress: (db) => ratio(countGoalDays(db), 10),
  },
  {
    id: 'deep-focus',
    name: 'NO BREAKS, NO MERCY',
    description: 'Six blocks back to back with no gaps.',
    icon: face(26),
    tier: 3,
    earned: (db) => Object.values(db.days).some((d) => longestRun(d.slots.map((s) => s.status)) >= 6),
    progress: (db) =>
      ratio(Math.max(0, ...Object.values(db.days).map((d) => longestRun(d.slots.map((s) => s.status)))), 6),
  },
  {
    id: 'night-owl',
    name: 'THE NIGHT SHIFT',
    description: 'Complete every block after the BRIDGE in one day.',
    icon: face(24),
    tier: 3,
    earned: (db) => Object.values(db.days).some((d) => d.slots.slice(6).every((s) => s.status === 'done')),
  },
];

function countComments(db: Database): number {
  return Object.values(db.days).reduce(
    (n, d) => n + d.slots.filter((s) => s.note.trim() !== '').length,
    0,
  );
}

function countGoalDays(db: Database): number {
  return Object.values(db.days).filter((d) => d.goals.length > 0).length;
}

function longestRun(statuses: string[]): number {
  let best = 0;
  let run = 0;
  for (const s of statuses) {
    run = s === 'done' ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/**
 * Stamps newly-earned badges. Returns the ids that flipped this call so the UI
 * can celebrate them; returns an empty array when nothing changed.
 */
export function reconcile(db: Database): string[] {
  const fresh: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (db.unlocked[a.id]) continue;
    if (a.earned(db)) {
      db.unlocked[a.id] = Date.now();
      fresh.push(a.id);
    }
  }
  return fresh;
}
