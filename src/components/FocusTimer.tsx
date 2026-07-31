/**
 * The schedule's face. There are no controls — the day runs on the clock, and
 * the only honest thing to do with it is watch. Red on purpose: a block that is
 * running is not a neutral state.
 */

import { formatClock, measuresAt, type TimerApi } from '../lib/timer';
import { atClock, blockWindow, bridgeIndex, bridgeLabel, roundWindow } from '../lib/schedule';
import { blocksOf, SCHEDULES, type ScheduleId, type SlotStatus } from '../lib/types';

const RADIUS = 62;
const CIRCUM = 2 * Math.PI * RADIUS;

const PIP_LABEL: Record<SlotStatus, string> = {
  empty: 'unclaimed',
  done: 'clean',
  partial: 'dirty',
  idle: 'absent',
  skipped: 'skipped',
};

/** One measure: what it is, how far through it we are, and what's left of it. */
function Measure({
  tag,
  of,
  at,
  remaining,
}: {
  tag: string;
  of: number;
  at: number;
  remaining: number;
}) {
  return (
    <div className="measure" aria-label={`${tag} ${at} of ${of}, ${formatClock(remaining)} remaining`}>
      <span className="measure__tag">{tag}</span>
      <span className="measure__bar">
        {Array.from({ length: of }, (_, i) => (
          <span
            key={i}
            className={`mpip ${i < at - 1 ? 'mpip--spent' : i === at - 1 ? 'mpip--now' : ''}`}
          />
        ))}
      </span>
      <span className="measure__left">{formatClock(remaining)}</span>
    </div>
  );
}

/** `statuses` is always *today's* day, whatever date the page is showing. */
export function FocusTimer({
  timer,
  statuses,
  schedule,
  onSchedule,
}: {
  timer: TimerApi;
  statuses: SlotStatus[];
  schedule: ScheduleId;
  onSchedule: (id: ScheduleId) => void;
}) {
  const { now } = timer;
  const phase = now.phase;
  const running = phase === 'block';

  const label =
    phase === 'before' ? `Opens ${atClock(now.dayStart)}`
    : phase === 'after' ? 'Day complete'
    : phase === 'bridge' ? bridgeLabel(bridgeIndex(now))
    : phase === 'break' ? 'Break'
    : `Block ${now.block} of ${now.blocks}`;

  const sub =
    phase === 'before' ? `Block 1 at ${atClock(now.dayStart)}`
    : phase === 'after' ? `Closed at ${atClock(now.dayEnd)}`
    : phase === 'block' && now.block
      ? `${atClock(blockWindow(now.block, Date.now(), now.schedule).from)} – ${atClock(now.to)}`
      : `Block ${now.nextBlock} at ${atClock(now.to)}`;

  const clock = phase === 'after' ? '00:00' : formatClock(now.remaining);

  const experimental = schedule === 'experimental';
  const shape = SCHEDULES[schedule] ?? SCHEDULES.standard;

  // The hour is not one measure but three, nested: the block, its six parts,
  // and the three ticks inside whichever part is running.
  const measures = measuresAt(now, Date.now());

  return (
    <div className={`timer timer--${phase}`}>
      <div className="timer__ring">
        <svg viewBox="0 0 140 140" role="img" aria-label={`${label}, ${clock} remaining`}>
          <circle className="timer__track" cx="70" cy="70" r={RADIUS} />
          <circle
            className="timer__progress"
            cx="70"
            cy="70"
            r={RADIUS}
            strokeDasharray={CIRCUM}
            strokeDashoffset={CIRCUM * (1 - (phase === 'before' ? 0 : now.progress))}
          />
        </svg>
        <div className="timer__face">
          <span className="timer__clock">{clock}</span>
          <span className="timer__phase">{label}</span>
          <span className="timer__window">{sub}</span>
        </div>
      </div>

      <div className="timer__meta">
        {/* The strip carries the day's verdict, not just its progress: every
            block wears its own status, and the running one is ringed. */}
        <div className="timer__pips" aria-label={`${now.elapsedBlocks} of ${now.blocks} blocks elapsed`}>
          {Array.from({ length: now.blocks }, (_, i) => {
            const status = statuses[i] ?? 'empty';
            return (
              <span
                key={i}
                title={`Block ${i + 1} — ${PIP_LABEL[status]}`}
                className={`pip pip--${status} ${i + 1 === now.block && running ? 'pip--now' : ''} ${
                  now.boundaries.includes(i + 1) ? 'pip--bridge' : ''
                }`}
              />
            );
          })}
        </div>

        {/* Blocks carry a verdict, so their strip shows status. Parts and ticks
            only ever carry progress — how much of the hour, and of these ten
            minutes, is already spent. */}
        {measures && (
          <div className="measures">
            <Measure
              tag="PART"
              of={measures.parts}
              at={measures.part}
              remaining={measures.partRemaining}
            />
            <Measure
              tag="TICK"
              of={measures.ticks}
              at={measures.tick}
              remaining={measures.tickRemaining}
            />
          </div>
        )}

        <div className="timer__plan">
          {now.rounds.map((_, i) => (
            <span key={i}>
              <strong>Round {i + 1}</strong> {roundWindow(i + 1, now.dayStart, now.schedule)}
            </span>
          ))}
        </div>

        {/* The day's shape, switchable where the day is rather than in a
            settings page: committing to blocks past midnight is a decision
            about the day in front of you. Its own row — fourteen pips already
            fill the width of this card. */}
        <div className="timer__preset">
          <span className="timer__preset-text">
            <strong>Experimental preset</strong>
            <span>
              {blocksOf(shape)} blocks, ends {shape.ends}
            </span>
          </span>
          <button
            className="switch"
            role="switch"
            aria-checked={experimental}
            aria-label="Experimental preset"
            onClick={() => onSchedule(experimental ? 'standard' : 'experimental')}
          />
        </div>
      </div>
    </div>
  );
}
