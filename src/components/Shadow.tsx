/**
 * The shadow's standing, live.
 *
 * One number that matters — how far ahead or behind the pace you are, right
 * now — and the pace's name under it. Behind is red and says so.
 */

import { standingLine, type Standing } from '../lib/ghost';
import { num } from './ui';

export function Shadow({
  standing,
  ghosts,
  onPick,
}: {
  standing: Standing;
  ghosts: { id: string; name: string }[];
  onPick: (id: string) => void;
}) {
  const behind = standing.delta < 0;
  const level = standing.delta === 0;

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

      <div className="shadow__bars">
        <span className="shadow__bar">
          <span className="shadow__bar-label">you</span>
          <strong>{num(standing.yours)} h</strong>
        </span>
        <span className="shadow__bar">
          <span className="shadow__bar-label">pace</span>
          <strong>{num(standing.theirs)} h</strong>
        </span>
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
