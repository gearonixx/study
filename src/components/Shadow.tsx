/**
 * The shadow, as a racing HUD rather than a scoreboard.
 *
 * A gap on its own is a mood. What a race actually tells you is three things,
 * and this panel is those three:
 *
 *   where you stand   the gap, now, in hours
 *   where you lost it the per-block trace — the gap almost always opened in
 *                     one specific hour, and you can usually name it
 *   what it takes     whether it is still catchable and the exact number of
 *                     clean blocks that does it. "Three of the last four" is
 *                     an instruction; "−1.5 h" is only a feeling.
 */

import type { Chase, Split, Standing } from '../lib/ghost';
import { standingLine } from '../lib/ghost';
import { num } from './ui';

export function Shadow({
  standing,
  trace,
  chase,
  ghosts,
  onPick,
}: {
  standing: Standing;
  trace: Split[];
  chase: Chase;
  ghosts: { id: string; name: string }[];
  onPick: (id: string) => void;
}) {
  const behind = standing.delta < 0;
  const level = standing.delta === 0;

  // Both lanes scale to whichever is further along, so the leader always
  // touches the end of the track and the gap is the thing you read.
  const far = Math.max(standing.yours, standing.theirs, chase.target, 1);

  // The worst block of the day: where the shadow took the most out of you.
  const worst = trace
    .filter((s) => s.run)
    .reduce<Split | null>((w, s) => {
      const drop = s.delta - (trace[s.block - 2]?.delta ?? 0);
      const wDrop = w ? w.delta - (trace[w.block - 2]?.delta ?? 0) : 0;
      return !w || drop < wDrop ? s : w;
    }, null);

  return (
    <div className={`shadow ${behind ? 'shadow--behind' : level ? '' : 'shadow--ahead'}`}>
      <div className="shadow__head">
        <span className="shadow__tag">SHADOW</span>
        <select
          className="shadow__pick"
          value={standing.ghost.id}
          onChange={(e) => onPick(e.target.value)}
          aria-label="Which pace to race"
        >
          {ghosts.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      <div className="shadow__delta">
        {level ? 'LEVEL' : `${behind ? '−' : '+'}${num(Math.abs(standing.delta))} h`}
      </div>
      <div className="shadow__line">{standingLine(standing)}</div>

      {/* The track. Two lanes, same scale. */}
      <div className="shadow__track">
        <span className="shadow__lane">
          <span className="shadow__lane-tag">YOU</span>
          <span className="shadow__rail">
            <span className="shadow__fill shadow__fill--you" style={{ width: `${(standing.yours / far) * 100}%` }} />
          </span>
          <strong>{num(standing.yours)}</strong>
        </span>
        <span className="shadow__lane">
          <span className="shadow__lane-tag">PACE</span>
          <span className="shadow__rail">
            <span className="shadow__fill shadow__fill--them" style={{ width: `${(standing.theirs / far) * 100}%` }} />
          </span>
          <strong>{num(standing.theirs)}</strong>
        </span>
      </div>

      {/* Per-block trace: above the line is ahead, below is behind. */}
      <div className="shadow__trace" aria-label="Gap by block">
        {trace.map((s) => {
          const mag = Math.min(1, Math.abs(s.delta) / 3);
          return (
            <span
              key={s.block}
              className={`shadow__bar ${!s.run ? 'shadow__bar--todo' : s.delta < 0 ? 'shadow__bar--down' : 'shadow__bar--up'}`}
              style={{ height: `${6 + mag * 16}px` }}
              title={`Block ${s.block}: you ${num(s.yours)} h · pace ${num(s.theirs)} h`}
            />
          );
        })}
      </div>
      {worst && behind && (
        <div className="shadow__worst">Block {worst.block} is where it went.</div>
      )}

      {/* What it takes. The only line here that is an instruction. */}
      <div className={`shadow__chase ${chase.catchable ? '' : 'shadow__chase--gone'}`}>
        {chase.remaining === 0 ? (
          <span>
            Day closed at {num(standing.yours)} h against {num(chase.target)} h.
          </span>
        ) : chase.needed < 0 ? (
          <span>
            Already past it. {chase.remaining} block{chase.remaining === 1 ? '' : 's'} left to
            extend the lead.
          </span>
        ) : chase.catchable ? (
          <span>
            <strong>
              {chase.needed} of the last {chase.remaining} clean
            </strong>{' '}
            takes it. Ceiling {num(chase.ceiling)} h.
          </span>
        ) : (
          <span>
            Out of reach — a perfect run ends on {num(chase.ceiling)} h against{' '}
            {num(chase.target)} h. Race the next one down.
          </span>
        )}
      </div>

      <p className="shadow__note">{standing.ghost.note}</p>
      {!standing.ghost.real && (
        // Said plainly, because the whole mechanic depends on it being trusted.
        <p className="shadow__disclaimer">
          A pace, not a live person. Nobody's activity is being invented here.
        </p>
      )}
    </div>
  );
}
