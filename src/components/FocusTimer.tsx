/**
 * The fixed 60/10 engine's face: a progress ring, the session counter, and the
 * three controls that exist. Duration is not adjustable by design.
 */

import { FOCUS_MS, formatClock, type TimerApi } from '../lib/timer';
import { SLOTS_PER_DAY } from '../lib/types';
import { Button } from './ui';

const RADIUS = 62;
const CIRCUM = 2 * Math.PI * RADIUS;

export function FocusTimer({ timer }: { timer: TimerApi }) {
  const { state, remaining, progress } = timer;
  const phase = state.phase;
  const idle = phase === 'idle';
  const finished = phase === 'done';

  const label =
    idle ? 'Ready'
    : finished ? 'Day complete'
    : phase === 'focus' ? `Block ${state.session} of ${SLOTS_PER_DAY}`
    : 'Break';

  const clock =
    idle ? formatClock(FOCUS_MS)
    : finished ? '00:00'
    : formatClock(remaining);

  return (
    <div className={`timer timer--${phase} ${state.running ? '' : 'timer--paused'}`}>
      <div className="timer__ring">
        <svg viewBox="0 0 140 140" role="img" aria-label={`${label}, ${clock} remaining`}>
          <circle className="timer__track" cx="70" cy="70" r={RADIUS} />
          <circle
            className="timer__progress"
            cx="70"
            cy="70"
            r={RADIUS}
            strokeDasharray={CIRCUM}
            strokeDashoffset={CIRCUM * (1 - (idle || finished ? 0 : progress))}
          />
        </svg>
        <div className="timer__face">
          <span className="timer__clock">{clock}</span>
          <span className="timer__phase">{label}</span>
        </div>
      </div>

      <div className="timer__meta">
        <div className="timer__pips" aria-label={`${state.session - 1} blocks elapsed`}>
          {Array.from({ length: SLOTS_PER_DAY }, (_, i) => (
            <span
              key={i}
              className={`pip ${i + 1 < state.session ? 'pip--past' : ''} ${
                i + 1 === state.session && !idle && !finished ? 'pip--now' : ''
              }`}
            />
          ))}
        </div>

        <div className="timer__controls">
          {idle && (
            <Button variant="primary" onClick={timer.start}>
              Start block {state.session}
            </Button>
          )}
          {!idle && !finished && state.running && (
            <Button onClick={timer.pause}>Pause</Button>
          )}
          {!idle && !finished && !state.running && (
            <Button variant="primary" onClick={timer.resume}>
              Resume
            </Button>
          )}
          {!idle && !finished && (
            <Button variant="ghost" onClick={timer.skip} title="Jump to the next phase">
              Skip {phase === 'focus' ? 'to break' : 'to next block'}
            </Button>
          )}
          {(finished || !idle) && (
            <Button variant="ghost" onClick={timer.reset}>
              Reset
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
