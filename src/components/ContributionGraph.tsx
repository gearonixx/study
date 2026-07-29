/**
 * The GitHub contribution calendar, re-pointed at hours studied.
 * 0 → empty, 12 → darkest green, with the same five-step ramp.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { contributionGrid, formatShort, fromKey, monthShort, todayKey } from '../lib/date';
import { intensity } from '../lib/stats';
import { dayHours, type Database } from '../lib/types';
import { num } from './ui';

const WEEKS = 53;

export function ContributionGraph({
  db,
  onPick,
}: {
  db: Database;
  onPick?: (date: string) => void;
}) {
  const [hover, setHover] = useState<{ date: string; hours: number; x: number; y: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const today = todayKey();

  // A year doesn't fit a phone, and the interesting end is the right-hand one:
  // open on today rather than on last July.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  const cols = useMemo(() => contributionGrid(today, WEEKS), [today]);

  // A month label sits above the first column that starts a new month.
  const monthLabels = useMemo(() => {
    const out: { col: number; label: string }[] = [];
    let last = -1;
    cols.forEach((col, i) => {
      const first = col.find(Boolean);
      if (!first) return;
      const m = fromKey(first).getMonth();
      if (m !== last) {
        // Skip a label that would collide with the previous one.
        if (out.length === 0 || i - out[out.length - 1].col >= 3) {
          out.push({ col: i, label: monthShort(m) });
        }
        last = m;
      }
    });
    return out;
  }, [cols]);

  const totalHours = useMemo(
    () => Object.values(db.days).reduce((sum, d) => sum + dayHours(d), 0),
    [db.days],
  );

  return (
    <div className="graph">
      <div className="graph__scroll" ref={scroller}>
        <div className="graph__inner">
          <div className="graph__months">
            {monthLabels.map((m) => (
              <span key={`${m.col}-${m.label}`} style={{ gridColumnStart: m.col + 1 }}>
                {m.label}
              </span>
            ))}
          </div>

          <div className="graph__body">
            <div className="graph__days">
              <span>Mon</span>
              <span>Wed</span>
              <span>Fri</span>
            </div>

            <div className="graph__grid" role="grid" aria-label="Hours studied per day">
              {cols.map((col, ci) => (
                <div className="graph__col" key={ci} role="row">
                  {col.map((date, ri) => {
                    if (!date) return <span className="cell cell--void" key={ri} aria-hidden />;
                    const day = db.days[date];
                    const hours = day ? dayHours(day) : 0;
                    return (
                      <button
                        key={date}
                        role="gridcell"
                        className={`cell cell--l${intensity(hours)} ${date === today ? 'cell--today' : ''}`}
                        aria-label={`${formatShort(date)}: ${num(hours)} hours`}
                        onClick={() => onPick?.(date)}
                        onMouseEnter={(e) => {
                          const r = e.currentTarget.getBoundingClientRect();
                          setHover({ date, hours, x: r.left + r.width / 2, y: r.top });
                        }}
                        onMouseLeave={() => setHover(null)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="graph__legend">
        <span className="muted">{num(totalHours)} hours in the last year</span>
        <div className="graph__scale">
          <span className="muted">Less</span>
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className={`cell cell--l${l}`} aria-hidden />
          ))}
          <span className="muted">More</span>
        </div>
      </div>

      {hover && (
        <div className="graph__tip" style={{ left: hover.x, top: hover.y }}>
          <strong>{num(hover.hours)} h</strong> on {formatShort(hover.date)}
        </div>
      )}
    </div>
  );
}
