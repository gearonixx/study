/**
 * What the clock owes you, and when.
 *
 * This is the announcement core on its own, with no opinion about who delivers
 * it. The page runs it against a 250ms sample; the extension's background page
 * runs the same thing against alarms, with no tab open. Both read the same
 * wall clock and produce the same words — the point of it living here is that
 * they cannot drift, which is exactly how the BRIDGE announcement ended up
 * claiming thirty minutes into round 2 for a bridge that was neither.
 */

import { atClock, bridgeIndex, bridgeLabel, type ScheduleNow } from './schedule';

/** How stale an announcement can be and still be worth making. */
export const ANNOUNCE_WINDOW_MS = 90 * 1000;

/**
 * How often a running block says how much of itself is left. An hour divides
 * evenly by this, so the marks land on 10:00, 20:00, 30:00, 40:00 and 50:00 —
 * 50, 40, 30, 20 and 10 minutes still to go.
 */
export const MARK_MS = 10 * 60 * 1000;

/**
 * The tick: the smallest unit the day is measured in, nested inside the part
 * the way the part is nested inside the block. Three to a part, so 3⅓ minutes
 * — and the third tick closes the part itself, which the part announcement
 * already covers, so only the first two of each are ever heard.
 */
export const TICKS_PER_PART = 3;
export const TICK_MS = MARK_MS / TICKS_PER_PART;

export type ChimeKind = 'focus' | 'break' | 'done' | 'mark';

export interface Announcement {
  /** Dedupe key — a stretch, part or tick never speaks twice. */
  key: string;
  title: string;
  body?: string;
  kind: ChimeKind;
  /** When the thing being announced actually happened. */
  at: number;
  /**
   * True for "you are now in X". A listener that has only just started
   * swallows these: opening the app mid-block is not news.
   */
  phase: boolean;
}

/** The message for entering a stretch of the day. */
function stretch(next: ScheduleNow): [string, string, ChimeKind] | null {
  switch (next.phase) {
    case 'block':
      return [
        `Block ${next.block} of ${next.blocks}`,
        `Runs to ${atClock(next.to)}. Back in.`,
        'focus',
      ];
    case 'break':
      return [
        'Block complete',
        `Drink water. Mark it clean or dirty. Block ${next.nextBlock} starts at ${atClock(next.to)}.`,
        'break',
      ];
    case 'bridge': {
      // Read off the running bridge rather than assumed: the experimental day's
      // second one is twenty minutes into round 3, not thirty into round 2.
      const index = bridgeIndex(next);
      const minutes = Math.round((next.to - next.from) / 60_000);
      return [
        bridgeLabel(index),
        `${minutes} minutes. Round ${index + 1} opens at ${atClock(next.to)}.`,
        'break',
      ];
    }
    case 'after':
      return ['Day complete', `All ${next.blocks} blocks are behind you.`, 'done'];
    default:
      return null;
  }
}

/**
 * Everything the clock has to say at `t`. The caller decides what it has
 * already said — this only says what is true.
 */
export function dueAt(state: ScheduleNow, t: number): Announcement[] {
  const out: Announcement[] = [];

  const said = stretch(state);
  if (said) {
    const [title, body, kind] = said;
    out.push({
      key: `phase:${state.key}`,
      title,
      body,
      kind,
      at: state.phase === 'after' ? state.dayEnd : state.from,
      phase: true,
    });
  }

  // Inside a block, tick off its parts as they close, so the hour can be felt
  // without looking at the page. The last part is never announced — closing it
  // is the end of the block, which speaks for itself.
  if (state.phase === 'block') {
    const parts = Math.round((state.to - state.from) / MARK_MS);
    const mark = Math.floor((t - state.from) / MARK_MS);
    if (mark >= 1) {
      const at = state.from + mark * MARK_MS;
      const left = Math.floor((state.to - at) / 60_000);
      out.push({
        key: `${state.key}#mark${mark}`,
        title: `Part ${mark}/${parts}, ${left} minutes left`,
        body: `Block ${state.block} runs to ${atClock(state.to)}.`,
        kind: 'mark',
        at,
        phase: false,
      });
    }

    // And the ticks inside it. Every third one lands exactly on a part
    // boundary, where the part announcement speaks for both.
    const tick = Math.floor((t - state.from) / TICK_MS);
    if (tick >= 1 && tick % TICKS_PER_PART !== 0) {
      out.push({
        key: `${state.key}#tick${tick}`,
        title: `Tick ${tick % TICKS_PER_PART}/${TICKS_PER_PART}`,
        kind: 'mark',
        at: state.from + tick * TICK_MS,
        phase: false,
      });
    }
  }

  return out;
}

/** An announcement you slept through is not worth hearing about. */
export function isFresh(a: Announcement, t: number): boolean {
  return t - a.at < ANNOUNCE_WINDOW_MS;
}

/**
 * The next moment worth waking up for. Used by the extension to set an alarm
 * on the boundary itself rather than polling a sleeping browser.
 */
export function nextEventAt(state: ScheduleNow, t: number): number {
  const candidates = [state.to];
  if (state.phase === 'block') {
    candidates.push(state.from + (Math.floor((t - state.from) / MARK_MS) + 1) * MARK_MS);
    candidates.push(state.from + (Math.floor((t - state.from) / TICK_MS) + 1) * TICK_MS);
  }
  const future = candidates.filter((c) => c > t);
  // A spent day has no next edge of its own; look again in a minute.
  return future.length ? Math.min(...future) : t + 60_000;
}
