/**
 * The schedule's face. There are no controls — the day runs on the clock, and
 * the only honest thing to do with it is watch. Red on purpose: a block that is
 * running is not a neutral state.
 */

import { formatClock, type TimerApi } from '../lib/timer';
import { atClock, blockWindow, stageWindow } from '../lib/schedule';
import { BRIDGE_AFTER, SLOTS_PER_DAY } from '../lib/types';

const RADIUS = 62;
const CIRCUM = 2 * Math.PI * RADIUS;

export function FocusTimer({ timer }: { timer: TimerApi }) {
  const { now } = timer;
  const phase = now.phase;
  const running = phase === 'block';

  const label =
    phase === 'before' ? `Opens ${atClock(now.dayStart)}`
    : phase === 'after' ? 'Day complete'
    : phase === 'bridge' ? 'BRIDGE'
    : phase === 'break' ? 'Break'
    : `Block ${now.block} of ${SLOTS_PER_DAY}`;

  const sub =
    phase === 'before' ? `Block 1 at ${atClock(now.dayStart)}`
    : phase === 'after' ? `Closed at ${atClock(now.dayEnd)}`
    : phase === 'block' && now.block
      ? `${atClock(blockWindow(now.block, Date.now()).from)} – ${atClock(now.to)}`
      : `Block ${now.nextBlock} at ${atClock(now.to)}`;

  const clock = phase === 'after' ? '00:00' : formatClock(now.remaining);

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
        <div className="timer__pips" aria-label={`${now.elapsedBlocks} of ${SLOTS_PER_DAY} blocks elapsed`}>
          {Array.from({ length: SLOTS_PER_DAY }, (_, i) => (
            <span
              key={i}
              className={`pip ${i + 1 <= now.elapsedBlocks ? 'pip--past' : ''} ${
                i + 1 === now.block && running ? 'pip--now' : ''
              } ${i + 1 === BRIDGE_AFTER ? 'pip--bridge' : ''}`}
            />
          ))}
        </div>

        <div className="timer__plan">
          <span>
            <strong>Stage 1</strong> {stageWindow(1, now.dayStart)}
          </span>
          <span>
            <strong>Stage 2</strong> {stageWindow(2, now.dayStart)}
          </span>
        </div>
      </div>
    </div>
  );
}
