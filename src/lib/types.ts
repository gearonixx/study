/**
 * Core data model for wizzard.
 *
 * The shape mirrors the plain-text daily notes this app replaces:
 *
 *   MATH                      <- goal, anchored at slot 1
 *   10:00 - 15:40
 *   1 - done ✅
 *   2 - distracted            <- comment on the block
 *   3 -
 *   READING                   <- goal, anchored at slot 4, runs to end of day
 *   4 - FAILED ❌
 *   5 - ✅ RESTORED!!
 *   eat                       <- loose side note, sits between blocks
 *   BRIDGE
 *   16:10 - 21:50
 *   6 -
 *   ...
 *   10 -
 *
 * A day is always exactly SLOTS_PER_DAY blocks, split into two rounds of five by
 * the BRIDGE, and those rounds run at fixed wall-clock times (see `schedule.ts`).
 * Everything lives in localStorage; there is no server.
 */

export const SLOTS_PER_DAY = 10;
/** The BRIDGE sits after this slot index (1-based), i.e. between 5 and 6. */
export const BRIDGE_AFTER = 5;

/**
 * The two shapes a day can take.
 *
 * Both start at 10:00 and both keep the 60/10 rhythm — an hour of work, ten
 * minutes between blocks, and a BRIDGE wherever the day changes gear. Only the
 * rounds differ, which is why the timeline generator takes numbers rather than
 * new logic:
 *
 *   standard      5 + 5              340 + 30 + 340            = 710 min → 21:50
 *   experimental  5 + 5 + 4      340 + 30 + 340 + 20 + 270    = 1000 min → 02:40
 *
 * The experimental day is the standard one with a third round bolted on: the
 * first two rounds are unchanged, down to the minute, so a long day and a
 * normal one are the same day until 21:50. A twenty minute BRIDGE separates
 * the last four blocks — long enough to be a gear change rather than a break,
 * which is the whole point of a BRIDGE. Ten minutes there would land the day
 * on 02:30 exactly, but it would also be indistinguishable from the breaks
 * either side of it.
 */
export type ScheduleId = 'standard' | 'experimental';

export interface DayShape {
  id: ScheduleId;
  label: string;
  /** Blocks in each round, in order. */
  rounds: number[];
  /** Minutes of BRIDGE between consecutive rounds; one shorter than `rounds`. */
  bridges: number[];
  /** Where the day ends, for copy — the timeline is the authority. */
  ends: string;
  hint: string;
}

export const SCHEDULES: Record<ScheduleId, DayShape> = {
  standard: {
    id: 'standard',
    label: 'Standard',
    rounds: [5, 5],
    bridges: [30],
    ends: '21:50',
    hint: 'Ten blocks, two rounds of five.',
  },
  experimental: {
    id: 'experimental',
    label: 'Experimental',
    rounds: [5, 5, 4],
    bridges: [30, 20],
    ends: '02:40',
    hint: 'Fourteen blocks: the standard day, then four more past midnight.',
  },
};

/** Blocks in a whole day. */
export function blocksOf(shape: DayShape): number {
  return shape.rounds.reduce((n, s) => n + s, 0);
}

/**
 * The 1-based block each round ends on, bar the last — where the BRIDGEs sit.
 * `[5]` for the standard day, `[5, 10]` for the experimental one.
 */
export function boundariesOf(shape: DayShape): number[] {
  const out: number[] = [];
  let n = 0;
  for (const round of shape.rounds.slice(0, -1)) {
    n += round;
    out.push(n);
  }
  return out;
}

/** The 1-based block a round opens on. */
export function roundStart(shape: DayShape, round: number): number {
  return shape.rounds.slice(0, round - 1).reduce((n, s) => n + s, 0) + 1;
}

/** The largest a day can be, and so the most slots that are ever stored. */
export const MAX_BLOCKS = Math.max(...Object.values(SCHEDULES).map(blocksOf));

/**
 * The shape a day was run under. Days recorded before there was a choice carry
 * nothing, and are read as standard — except the day currently running, which
 * follows the setting until it is first written to and stamped.
 */
export function shapeOf(day: Pick<Day, 'schedule'> | undefined, fallback: ScheduleId = 'standard'): DayShape {
  return SCHEDULES[day?.schedule ?? fallback] ?? SCHEDULES.standard;
}

/**
 * Three states, plus the un-answered one. A block you don't claim within
 * LAPSE_MS of its hour ending claims itself, as `skipped`.
 */
export type SlotStatus =
  | 'empty' // the hour hasn't been answered for yet
  | 'done' // CLEAN — the hour was spent properly (green)
  | 'partial' // DIRTY — spent, but distracted / slow / half-value (yellow)
  | 'skipped'; // the hour is gone, claimed or lapsed (red)

/** Hours credited per status. `partial` counts half. */
export const STATUS_HOURS: Record<SlotStatus, number> = {
  empty: 0,
  done: 1,
  partial: 0.5,
  skipped: 0,
};

/** XP awarded per status, before streak multipliers. */
export const STATUS_XP: Record<SlotStatus, number> = {
  empty: 0,
  done: 10,
  partial: 4,
  skipped: 0,
};

/** How long a finished block waits to be claimed before it goes red. */
export const LAPSE_MS = 60 * 60 * 1000;

export interface Slot {
  /** 1-based position in the day, 1..SLOTS_PER_DAY. */
  index: number;
  status: SlotStatus;
  /** The block's comment, e.g. "slow + distracted", "finish acton review". */
  note: string;
  /**
   * Free mood/quality marker — the ✅✅ / 😡 / 😎 / 🛏️ the notes are full of.
   * Kept as a raw string so any emoji works, not just a fixed enum.
   */
  mood: string;
  /**
   * Epoch ms this slot itself was last touched, so two devices can be merged a
   * slot at a time instead of a day at a time. Absent on days written before
   * slot-level merging existed; the day's own stamp stands in for those.
   */
  updatedAt?: number;
  /**
   * True when the status was *inferred* by the lapse sweep rather than answered
   * by the user. An inference must never overwrite an answer, however much
   * later it was written — that is exactly how a day's work gets erased by a
   * second device that was simply left open.
   */
  auto?: boolean;
}

/** Quick-pick moods, chosen from what actually shows up in the notes. */
export const MOODS: { emoji: string; label: string }[] = [
  { emoji: '✅✅', label: 'Exceptional' },
  { emoji: '😎', label: 'In flow' },
  { emoji: '😈', label: 'Grinding' },
  { emoji: '😂', label: 'Fun' },
  { emoji: '🙂‍↕️', label: 'Distracted' },
  { emoji: '😡', label: 'Dirty' },
  { emoji: '🥱', label: 'Drained' },
  { emoji: '🛏️', label: 'Sleep' },
];

/**
 * A goal claims a run of blocks: it starts at `startSlot` and stays in force
 * until the next goal starts (or the day ends). "MATH for the first six hours"
 * is one goal anchored at slot 1; adding "READING" at slot 7 splits the day.
 */
export interface Goal {
  id: string;
  /** Short project label, e.g. "MATH". */
  label: string;
  /** Optional longer intent, e.g. "revise linear algebra". */
  detail: string;
  /** 1-based slot this goal takes over from. */
  startSlot: number;
  /** Index into GOAL_COLORS, so each project reads distinctly. */
  color: number;
}

export interface DayNote {
  id: string;
  /** Rendered directly beneath this 1-based slot index. 0 = top of day. */
  afterSlot: number;
  text: string;
}

export interface Day {
  /** ISO local date, YYYY-MM-DD. Primary key. */
  date: string;
  /**
   * The shape this day was run under. Absent on every day recorded before there
   * was a choice, which is exactly what `shapeOf` reads as standard. Stored per
   * day so switching the setting never rewrites history.
   */
  schedule?: ScheduleId;
  /** Goal spans covering the day, kept sorted by startSlot. */
  goals: Goal[];
  /** Planned window for round 1, e.g. "10:00 - 15:40". */
  windowTop: string;
  /** Planned window for round 2, e.g. "16:10 - 21:50". */
  windowBottom: string;
  slots: Slot[];
  notes: DayNote[];
  /** Epoch ms of the last edit, used for conflict-free-ish gist merges. */
  updatedAt: number;
}

/** Accent ramp for goal chips; indexes are stable across themes. */
export const GOAL_COLORS = ['blue', 'purple', 'green', 'orange', 'pink', 'gray'] as const;

/** The goal in force at a given 1-based slot, or null if none is set. */
export function goalAt(day: Day, slotIndex: number): Goal | null {
  let current: Goal | null = null;
  for (const g of day.goals) {
    if (g.startSlot <= slotIndex) current = g;
    else break;
  }
  return current;
}

export interface Settings {
  /** Which shape the running day takes. */
  schedule: ScheduleId;
  /** Slots per day the user is aiming for; drives the goal ring. */
  dailyGoal: number;
  /** Desktop notification on every phase change. */
  notifications: boolean;
  /** Audible chime on every phase change. */
  sound: boolean;
  /** Day the graph starts counting from; blank = first recorded day. */
  startDate: string;
}

export interface AuthState {
  /** Present only when the user chose to sign in. Everything works without it. */
  token: string | null;
  login: string | null;
  name: string | null;
  avatarUrl: string | null;
  /** Gist id used for optional backup of the local database. */
  gistId: string | null;
  lastSyncedAt: number | null;
}

export interface Database {
  version: number;
  days: Record<string, Day>;
  settings: Settings;
  /** Achievement id -> epoch ms it was first earned. */
  unlocked: Record<string, number>;
}

export const DEFAULT_SETTINGS: Settings = {
  schedule: 'standard',
  dailyGoal: SLOTS_PER_DAY,
  notifications: true,
  sound: true,
  startDate: '',
};

export function emptySlots(blocks = SLOTS_PER_DAY): Slot[] {
  return Array.from({ length: blocks }, (_, i) => ({
    index: i + 1,
    status: 'empty' as SlotStatus,
    note: '',
    mood: '',
  }));
}

export function emptyDay(date: string, schedule: ScheduleId = 'standard'): Day {
  return {
    date,
    // Only ever stamped when it is not the default, so a standard day looks
    // exactly like every day recorded before shapes existed.
    ...(schedule === 'standard' ? {} : { schedule }),
    goals: [],
    windowTop: '',
    windowBottom: '',
    slots: emptySlots(blocksOf(SCHEDULES[schedule])),
    notes: [],
    updatedAt: Date.now(),
  };
}

export function emptyDatabase(): Database {
  return {
    version: 1,
    days: {},
    settings: { ...DEFAULT_SETTINGS },
    unlocked: {},
  };
}

/** Hours credited for a day. */
export function dayHours(day: Day): number {
  return day.slots.reduce((sum, s) => sum + STATUS_HOURS[s.status], 0);
}

/** True when the user recorded anything at all for this day. */
export function dayTouched(day: Day): boolean {
  return (
    day.slots.some((s) => s.status !== 'empty' || s.note.trim() !== '') ||
    day.notes.some((n) => n.text.trim() !== '') ||
    day.goals.length > 0 ||
    day.windowTop.trim() !== '' ||
    day.windowBottom.trim() !== ''
  );
}
