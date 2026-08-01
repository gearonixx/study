/**
 * The shadow running the day beside you.
 *
 * Borrowed from racing games, and borrowed accurately: a ghost car was never
 * the other driver. It is a *recorded lap*, replayed against your clock, and
 * that is the whole reason it works — it never lies about being live, and you
 * still cannot stand being behind it.
 *
 * So a ghost here is a pace, not a person. It says how many hours would be
 * banked by this point in the day, and the app tells you whether you are ahead
 * of it or behind it right now.
 *
 * ## Why there is nobody's name on a live feed
 *
 * The obvious version of this feature is a ticker of real people — Korotkevich
 * finished a problem, a Jane Street desk closed a trade — while you sit there.
 * It would work on anybody. It is also fabricated: those people are not
 * studying with you, and inventing their minute-by-minute activity is inventing
 * facts about real, named, living individuals. The first time you noticed one
 * was made up, every other line on the panel would become noise, and the
 * feature would be worth less than nothing.
 *
 * What is real: your own best day, replayed to the minute. Your recent form.
 * And the flat, checkable paces that the people you are chasing actually
 * sustain — the gaokao year, a twelve-hour camp day — presented as paces
 * rather than as anybody's live telemetry.
 */

import {
  dayHours,
  STATUS_HOURS,
  type Database,
  type DayShape,
  type SlotStatus,
  blocksOf,
} from './types';

export interface Ghost {
  id: string;
  name: string;
  note: string;
  /** Hours the ghost has banked once `elapsed` blocks of the day have run. */
  hoursAt: (elapsed: number) => number;
  /**
   * What the ghost did with a given block, to sit beside your own box in the
   * list. Null where the pace has no opinion about that hour.
   */
  statusAt: (block: number) => SlotStatus | null;
  /** True when the pace is drawn from the user's own recorded days. */
  real: boolean;
}

/**
 * A pace of `target` hours, worked hour for hour from the opening block until
 * the hours are done.
 *
 * This used to spread the target evenly across the day, which quietly made it
 * a different claim: fourteen hours over seventeen blocks became fourteen
 * seventeenths of an hour per block, so the gaokao ghost read 11.5 h at block
 * fourteen and only touched 14 at the very end. Nobody works that way. A
 * fourteen-hour day is fourteen hours done and then stopped, so the ghost
 * banks a full hour per block and goes quiet once it has its target — which
 * also makes it the harder ghost early, where being behind still costs you
 * something.
 *
 * Capped by the day: a fourteen-hour pace against a ten-block day finishes on
 * ten, because ten is all there is. It does not get to claim hours the day
 * cannot contain.
 */
function steadyPace(id: string, name: string, note: string, target: number, blocks: number): Ghost {
  const real = Math.min(target, blocks);
  return {
    id,
    name,
    note,
    real: false,
    hoursAt: (elapsed) => Math.min(real, Math.max(0, elapsed)),
    statusAt: (block) => (block <= real ? 'done' : null),
  };
}

/**
 * Your best day, replayed block by block rather than averaged — so it is
 * ahead exactly where you were ahead that day, and the shape of it is yours.
 */
function replayPace(
  id: string,
  name: string,
  note: string,
  hoursByBlock: number[],
  statuses: SlotStatus[],
): Ghost {
  const cumulative: number[] = [];
  let run = 0;
  for (const h of hoursByBlock) {
    run += h;
    cumulative.push(run);
  }
  return {
    id,
    name,
    note,
    real: true,
    hoursAt: (elapsed) => cumulative[Math.max(0, Math.min(cumulative.length, elapsed) - 1)] ?? 0,
    statusAt: (block) => statuses[block - 1] ?? null,
  };
}

/**
 * Every ghost available today, with the gaokao pace first and therefore
 * selected by default.
 *
 * That is deliberate and it is not the comfortable choice. Defaulting to your
 * own record means the bar moves down whenever you have a bad week — the
 * shadow quietly becomes whatever you happen to be capable of lately. Fourteen
 * hours does not move. You will be behind it most days, which is the point:
 * the standing default should be the standard, not the personal best.
 *
 * Your record is still one selection away, and it is still the only pace on
 * the list you have already proved is possible.
 */
export function ghostsFor(db: Database, shape: DayShape, todayKey: string): Ghost[] {
  const blocks = blocksOf(shape);
  const out: Ghost[] = [
    steadyPace(
      'gaokao',
      'Gaokao pace',
      'fourteen-hour days sustained across an entire final year',
      14,
      blocks,
    ),
  ];

  let best: { date: string; hours: number; day: (typeof db.days)[string] } | null = null;
  for (const [date, day] of Object.entries(db.days)) {
    if (date === todayKey) continue;
    const h = dayHours(day);
    if (h > 0 && (!best || h > best.hours)) best = { date, hours: h, day };
  }

  if (best) {
    const perBlock = Array.from(
      { length: blocks },
      (_, i) => STATUS_HOURS[best.day.slots[i]?.status ?? 'empty'],
    );
    out.push(
      replayPace(
        'record',
        'Your record',
        `${best.hours} h on ${best.date} — you have already done this once`,
        perBlock,
        Array.from(
          { length: blocks },
          (_, i) => best.day.slots[i]?.status ?? 'empty',
        ),
      ),
    );
  }

  out.push(
    steadyPace(
      'camp',
      'Olympiad camp pace',
      'twelve hours a day, for weeks, is what the training camps actually run',
      12,
      blocks,
    ),
  );

  return out;
}

export interface Standing {
  ghost: Ghost;
  yours: number;
  theirs: number;
  /** Positive when you are ahead, in hours. */
  delta: number;
}

export function standingAgainst(ghost: Ghost, yourHours: number, elapsed: number): Standing {
  const theirs = Math.round(ghost.hoursAt(elapsed) * 2) / 2;
  return { ghost, yours: yourHours, theirs, delta: Math.round((yourHours - theirs) * 2) / 2 };
}

/** The line the app says out loud when the shadow moves past you. */
export function standingLine(s: Standing): string {
  if (s.delta > 0) return `${s.delta} h ahead of ${s.ghost.name.toLowerCase()}`;
  if (s.delta < 0) return `${-s.delta} h behind ${s.ghost.name.toLowerCase()}`;
  return `level with ${s.ghost.name.toLowerCase()}`;
}

/** One block's worth of the race, for the trace strip. */
export interface Split {
  block: number;
  yours: number;
  theirs: number;
  delta: number;
  /** False once the block hasn't been run yet. */
  run: boolean;
}

/**
 * The race, block by block. This is where a single "you are behind" number
 * stops being useful: it says *when* the gap opened, which is almost always
 * one specific hour you can name.
 */
export function traceAgainst(
  ghost: Ghost,
  perBlock: number[],
  elapsed: number,
): Split[] {
  const out: Split[] = [];
  let run = 0;
  for (let b = 1; b <= perBlock.length; b++) {
    run += perBlock[b - 1] ?? 0;
    const theirs = Math.round(ghost.hoursAt(b) * 2) / 2;
    out.push({
      block: b,
      yours: run,
      theirs,
      delta: Math.round((run - theirs) * 2) / 2,
      run: b <= elapsed,
    });
  }
  return out;
}

export interface Chase {
  /** Blocks whose hour has not run yet. */
  remaining: number;
  /** Where the pace finishes the day. */
  target: number;
  /** The most you could still finish on, clean every remaining block. */
  ceiling: number;
  /** Clean blocks still needed to end level or better. -1 when already there. */
  needed: number;
  /** False once even a perfect run cannot catch it. */
  catchable: boolean;
}

/**
 * Whether it can still be caught, and exactly what that would take.
 *
 * The useful thing a racing HUD tells you is not the gap — it is whether the
 * gap is still closable and what it costs. "Three of the last four clean" is
 * an instruction. "−1.5 h" is only a mood.
 */
export function chaseAgainst(
  ghost: Ghost,
  yourHours: number,
  elapsed: number,
  blocks: number,
): Chase {
  const remaining = Math.max(0, blocks - elapsed);
  const target = Math.round(ghost.hoursAt(blocks) * 2) / 2;
  const ceiling = yourHours + remaining;
  const short = target - yourHours;
  return {
    remaining,
    target,
    ceiling,
    needed: short <= 0 ? -1 : Math.ceil(short),
    catchable: short <= 0 || short <= remaining,
  };
}
