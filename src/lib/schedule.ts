/**
 * The day's fixed shape, expressed as wall-clock time.
 *
 * There is no start button and no settings screen for any of this: the day runs
 * on the clock, every day, whether the app is open or not.
 *
 *   ROUND 1   10:00 → 15:40   blocks 1–5, ten minutes between them
 *   BRIDGE    15:40 → 16:10   thirty minutes
 *   ROUND 2   16:10 → 21:50   blocks 6–10, ten minutes between them
 *
 * Breaks sit *between* blocks only — five blocks means four breaks — so a round
 * is 5×60 + 4×10 = 5h40m and the whole day is 11h50m. The stated whole hours
 * (16:00 / 16:30 / 22:30) are deliberately not what the arithmetic gives; the
 * arithmetic wins.
 *
 * The experimental shape is the same structure with seven blocks a round, which
 * is what carries the day to 02:30 — and so past midnight, which is the one
 * thing here that needed new logic rather than new numbers. See `dayStartFor`.
 */

import {
  blocksOf,
  boundariesOf,
  LAPSE_MS,
  SCHEDULES,
  roundStart,
  type DayShape,
  type ScheduleId,
} from './types';

export const BLOCK_MS = 60 * 60 * 1000;
export const BREAK_MS = 10 * 60 * 1000;
/** The first BRIDGE. Later ones carry their own length; see `DayShape.bridges`. */
export const BRIDGE_MS = 30 * 60 * 1000;

/** Local wall-clock hour:minute the first block opens on. */
export const DAY_START_HOUR = 10;
export const DAY_START_MINUTE = 0;

export const DAY_MS = 24 * 60 * 60 * 1000;
/** How long a finished day stays the day on screen before the next one opens. */
export const CLOSING_GRACE_MS = 30 * 60 * 1000;

export type SegmentKind = 'block' | 'break' | 'bridge';

export interface Segment {
  kind: SegmentKind;
  /** 1-based block this segment is, or follows. */
  block: number;
  /** Offset from the day's 10:00 start. */
  from: number;
  to: number;
}

/**
 * The whole day, laid out from the shape's two numbers. Same generator for both
 * schedules — a longer day is more blocks per round, not a different structure.
 */
function build(shape: DayShape): Segment[] {
  const out: Segment[] = [];
  let t = 0;
  let block = 0;
  shape.rounds.forEach((count, round) => {
    for (let i = 0; i < count; i++) {
      block++;
      out.push({ kind: 'block', block, from: t, to: t + BLOCK_MS });
      t += BLOCK_MS;
      // No break after the last block of a round — the BRIDGE or the end of the
      // day takes over there.
      if (i < count - 1) {
        out.push({ kind: 'break', block, from: t, to: t + BREAK_MS });
        t += BREAK_MS;
      }
    }
    // Each BRIDGE has its own length: the day changes gear by a different
    // amount at 15:40 than it does at 21:50.
    const bridge = (shape.bridges[round] ?? 0) * 60 * 1000;
    if (round < shape.rounds.length - 1 && bridge > 0) {
      out.push({ kind: 'bridge', block, from: t, to: t + bridge });
      t += bridge;
    }
  });
  return out;
}

const TIMELINES: Record<ScheduleId, Segment[]> = {
  standard: build(SCHEDULES.standard),
  experimental: build(SCHEDULES.experimental),
};

export function timelineOf(id: ScheduleId): Segment[] {
  return TIMELINES[id] ?? TIMELINES.standard;
}

/** The standard day, kept as a named export for everything that predates shapes. */
export const TIMELINE = TIMELINES.standard;

/** 11h50m standard, 16h30m experimental. */
export function dayLengthOf(id: ScheduleId): number {
  const line = timelineOf(id);
  return line[line.length - 1].to;
}
export const DAY_LENGTH_MS = dayLengthOf('standard');

/** Epoch ms of 10:00 local on the calendar day `now` falls in. */
function clockStart(now: number): number {
  const d = new Date(now);
  d.setHours(DAY_START_HOUR, DAY_START_MINUTE, 0, 0);
  return d.getTime();
}

/**
 * Epoch ms the *running* day began at.
 *
 * A standard day is over by 21:50, so this is always today's 10:00. An
 * experimental day runs to 02:30, and at 01:00 the day that is running is the
 * one that started at 10:00 yesterday — not a day that hasn't begun. Getting
 * this wrong would file blocks worked after midnight under the wrong date and
 * make the app announce that the day hasn't started while it is still running.
 */
export function dayStartFor(now: number, id: ScheduleId = 'standard'): number {
  const today = clockStart(now);
  if (now >= today) return today;
  const yesterday = today - DAY_MS;
  // Half an hour past its end the day is still the one on screen, so it can be
  // announced complete and its last block still claimed. Without that an
  // experimental day would flip from its final block straight to counting down
  // to the next one, and 'Day complete' would never fire. A standard day is
  // over by 21:50, so this branch never reaches it.
  return now < yesterday + dayLengthOf(id) + CLOSING_GRACE_MS ? yesterday : today;
}

/** The ISO date the running day is filed under — the date it *started* on. */
export function runningDayKey(now: number = Date.now(), id: ScheduleId = 'standard'): string {
  const d = new Date(dayStartFor(now, id));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The shape actually being run right now.
 *
 * The setting says what a *new* day should be, but a day already stamped
 * outranks it: once blocks have been recorded against a seventeen-block day, the
 * clock keeps running that day whatever the setting says — including when the
 * setting is changed on another device and syncs back mid-afternoon. The longer
 * shape is looked up first, because past midnight it is the only one whose day
 * key still points at the day in progress.
 */
export function runningSchedule(
  days: Record<string, { schedule?: ScheduleId } | undefined>,
  preferred: ScheduleId,
  now: number = Date.now(),
): ScheduleId {
  for (const id of ['experimental', 'standard'] as const) {
    const stamped = days[runningDayKey(now, id)]?.schedule;
    if (stamped) return stamped;
  }
  return preferred;
}

/** Absolute window of a 1-based block on the day containing `now`. */
export function blockWindow(
  block: number,
  now: number,
  id: ScheduleId = 'standard',
): { from: number; to: number } {
  const base = dayStartFor(now, id);
  const seg = timelineOf(id).find((s) => s.kind === 'block' && s.block === block);
  if (!seg) return { from: base, to: base };
  return { from: base + seg.from, to: base + seg.to };
}

export type SchedulePhase = 'before' | 'block' | 'break' | 'bridge' | 'after';

export interface ScheduleNow {
  phase: SchedulePhase;
  /** The running block, or the one just finished during a break/bridge. */
  block: number | null;
  /** The block that starts next, null once the day is spent. */
  nextBlock: number | null;
  /** Epoch ms the current stretch runs between. */
  from: number;
  to: number;
  remaining: number;
  /** 0..1 through the current stretch. */
  progress: number;
  /** Blocks whose full hour has elapsed today. */
  elapsedBlocks: number;
  dayStart: number;
  dayEnd: number;
  /** Stable id for the stretch, so transitions can be detected by inequality. */
  key: string;
  /** The shape this reading was taken under, and what it implies. */
  schedule: ScheduleId;
  blocks: number;
  /** Blocks per round, in order. */
  rounds: number[];
  /** The 1-based blocks a BRIDGE follows. */
  boundaries: number[];
  /** The ISO date the running day is filed under. */
  dayKey: string;
}

/** Resolves the wall clock into where the day currently stands. */
export function scheduleAt(now: number, id: ScheduleId = 'standard'): ScheduleNow {
  const shape = SCHEDULES[id] ?? SCHEDULES.standard;
  const line = timelineOf(id);
  const dayStart = dayStartFor(now, id);
  const dayEnd = dayStart + dayLengthOf(id);
  const offset = now - dayStart;

  const elapsedBlocks = line.filter((s) => s.kind === 'block' && offset >= s.to).length;
  const base = {
    elapsedBlocks,
    dayStart,
    dayEnd,
    schedule: shape.id,
    blocks: blocksOf(shape),
    rounds: shape.rounds,
    boundaries: boundariesOf(shape),
    dayKey: runningDayKey(now, id),
  };

  if (offset < 0) {
    // The gap between one day closing and the next opening: the ring counts
    // down to the first block.
    const from = dayStart - DAY_MS;
    return {
      ...base,
      phase: 'before',
      block: null,
      nextBlock: 1,
      from,
      to: dayStart,
      remaining: dayStart - now,
      progress: 0,
      key: 'before',
    };
  }

  const seg = line.find((s) => offset < s.to);
  if (!seg) {
    return {
      ...base,
      phase: 'after',
      block: blocksOf(shape),
      nextBlock: null,
      from: dayEnd,
      to: dayEnd,
      remaining: 0,
      progress: 1,
      key: 'after',
    };
  }

  const from = dayStart + seg.from;
  const to = dayStart + seg.to;
  const length = seg.to - seg.from;
  return {
    ...base,
    phase: seg.kind,
    block: seg.block,
    nextBlock: seg.kind === 'block' ? seg.block : seg.block + 1,
    from,
    to,
    remaining: to - now,
    progress: length ? (now - from) / length : 0,
    key: `${seg.kind}:${seg.block}`,
  };
}

/**
 * Which BRIDGE is running, 1-based, or 0 outside one.
 *
 * The bridges sit after the blocks in `boundaries`, and during one `block` is
 * the block it follows — so the block names the bridge.
 */
export function bridgeIndex(now: ScheduleNow): number {
  if (now.phase !== 'bridge' || now.block === null) return 0;
  return now.boundaries.indexOf(now.block) + 1;
}

/**
 * A BRIDGE's title. There is only ever one on a standard day, so it is just
 * the BRIDGE; the experimental day's second one has to say which it is.
 */
export function bridgeLabel(index: number): string {
  return index > 1 ? `BRIDGE #${index}` : 'BRIDGE';
}

/**
 * Blocks whose grace period has run out: their hour ended more than LAPSE_MS
 * ago, so an unanswered one is no longer waiting for an answer.
 */
export function lapsedBlocks(now: number, id: ScheduleId = 'standard'): number[] {
  const base = dayStartFor(now, id);
  return timelineOf(id)
    .filter((s) => s.kind === 'block' && now - (base + s.to) >= LAPSE_MS)
    .map((s) => s.block);
}

/** `14:40` in the user's own locale-independent 24h form. */
export function atClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** `10:00 – 15:40` for a round, 1-based and inclusive. */
export function roundWindow(round: number, now: number, id: ScheduleId = 'standard'): string {
  const shape = SCHEDULES[id] ?? SCHEDULES.standard;
  const first = roundStart(shape, round);
  const last = first + (shape.rounds[round - 1] ?? 0) - 1;
  return `${atClock(blockWindow(first, now, id).from)} – ${atClock(blockWindow(last, now, id).to)}`;
}
