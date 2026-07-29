/**
 * The day's fixed shape, expressed as wall-clock time.
 *
 * There is no start button and no settings screen for any of this: the day runs
 * on the clock, every day, whether the app is open or not.
 *
 *   STAGE 1   10:00 → 15:40   blocks 1–5, ten minutes between them
 *   BRIDGE    15:40 → 16:10   thirty minutes
 *   STAGE 2   16:10 → 21:50   blocks 6–10, ten minutes between them
 *
 * Breaks sit *between* blocks only — five blocks means four breaks — so a stage
 * is 5×60 + 4×10 = 5h40m and the whole day is 11h50m. The stated round hours
 * (16:00 / 16:30 / 22:30) are deliberately not what the arithmetic gives; the
 * arithmetic wins.
 */

import { SLOTS_PER_DAY, BRIDGE_AFTER, LAPSE_MS } from './types';

export const BLOCK_MS = 60 * 60 * 1000;
export const BREAK_MS = 10 * 60 * 1000;
export const BRIDGE_MS = 30 * 60 * 1000;

/** Local wall-clock hour:minute the first block opens on. */
export const DAY_START_HOUR = 10;
export const DAY_START_MINUTE = 0;

export const BLOCKS_PER_STAGE = BRIDGE_AFTER;
export const STAGE_COUNT = SLOTS_PER_DAY / BLOCKS_PER_STAGE;

export type SegmentKind = 'block' | 'break' | 'bridge';

export interface Segment {
  kind: SegmentKind;
  /** 1-based block this segment is, or follows. */
  block: number;
  /** Offset from the day's 10:00 start. */
  from: number;
  to: number;
}

/** The whole day, laid out once at module load. */
export const TIMELINE: Segment[] = (() => {
  const out: Segment[] = [];
  let t = 0;
  for (let stage = 0; stage < STAGE_COUNT; stage++) {
    for (let i = 0; i < BLOCKS_PER_STAGE; i++) {
      const block = stage * BLOCKS_PER_STAGE + i + 1;
      out.push({ kind: 'block', block, from: t, to: t + BLOCK_MS });
      t += BLOCK_MS;
      // No break after the last block of a stage — the BRIDGE or the end of the
      // day takes over there.
      if (i < BLOCKS_PER_STAGE - 1) {
        out.push({ kind: 'break', block, from: t, to: t + BREAK_MS });
        t += BREAK_MS;
      }
    }
    if (stage < STAGE_COUNT - 1) {
      const block = (stage + 1) * BLOCKS_PER_STAGE;
      out.push({ kind: 'bridge', block, from: t, to: t + BRIDGE_MS });
      t += BRIDGE_MS;
    }
  }
  return out;
})();

/** 11h50m, in ms. */
export const DAY_LENGTH_MS = TIMELINE[TIMELINE.length - 1].to;

/** Epoch ms of 10:00 local on the calendar day `now` falls in. */
export function dayStartFor(now: number): number {
  const d = new Date(now);
  d.setHours(DAY_START_HOUR, DAY_START_MINUTE, 0, 0);
  return d.getTime();
}

/** Absolute window of a 1-based block on the day containing `now`. */
export function blockWindow(block: number, now: number): { from: number; to: number } {
  const base = dayStartFor(now);
  const seg = TIMELINE.find((s) => s.kind === 'block' && s.block === block);
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
}

/** Resolves the wall clock into where the day currently stands. */
export function scheduleAt(now: number): ScheduleNow {
  const dayStart = dayStartFor(now);
  const dayEnd = dayStart + DAY_LENGTH_MS;
  const offset = now - dayStart;

  const elapsedBlocks = TIMELINE.filter((s) => s.kind === 'block' && offset >= s.to).length;
  const base = { elapsedBlocks, dayStart, dayEnd };

  if (offset < 0) {
    // Midnight up to 10:00 — the ring counts down to the first block.
    const from = dayStart - 24 * 60 * 60 * 1000;
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

  const seg = TIMELINE.find((s) => offset < s.to);
  if (!seg) {
    return {
      ...base,
      phase: 'after',
      block: SLOTS_PER_DAY,
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
 * Blocks whose grace period has run out: their hour ended more than LAPSE_MS
 * ago, so an unanswered one is no longer waiting for an answer.
 */
export function lapsedBlocks(now: number): number[] {
  const base = dayStartFor(now);
  return TIMELINE.filter((s) => s.kind === 'block' && now - (base + s.to) >= LAPSE_MS).map(
    (s) => s.block,
  );
}

/** `14:40` in the user's own locale-independent 24h form. */
export function atClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** `10:00 – 15:40` for a stage, 1-based and inclusive. */
export function stageWindow(stage: number, now: number): string {
  const first = (stage - 1) * BLOCKS_PER_STAGE + 1;
  const last = stage * BLOCKS_PER_STAGE;
  return `${atClock(blockWindow(first, now).from)} – ${atClock(blockWindow(last, now).to)}`;
}
