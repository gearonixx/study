/**
 * The GitHub contribution calendar, re-pointed at hours studied.
 *
 * Same five-step ramp, but the first step is not one hour — it is a day's work.
 * Anything under DAY_MIN_HOURS reads as empty, because a graph that greens up
 * for a single hour tells you that you turned up, not that you did the day.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { contributionGrid, formatShort, fromKey, monthShort, todayKey } from '../lib/date';
import { dayIntensity, DAY_MIN_HOURS } from '../lib/stats';
import { dayHours, type Database } from '../lib/types';
import { num } from './ui';

const WEEKS = 53;

/** Credited hours per ISO date — the only thing the graph actually needs. */
export type HoursByDate = Record<string, number>;

export function hoursOf(db: Database): HoursByDate {
  const out: HoursByDate = {};
  for (const [date, day] of Object.entries(db.days)) out[date] = dayHours(day);
  return out;
}

export function ContributionGraph({
  hours: hoursByDate,
  onPick,
}: {
  /** A local database's hours, or a public profile's — the graph can't tell. */
  hours: HoursByDate;
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
    () => Object.values(hoursByDate).reduce((sum, h) => sum + h, 0),
    [hoursByDate],
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
                    const hours = hoursByDate[date] ?? 0;
                    return (
                      <button
                        key={date}
                        role="gridcell"
                        className={`cell cell--l${dayIntensity(hours)} ${date === today ? 'cell--today' : ''}`}
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

      {/* Stated plainly, next to the thing it governs: a graph that greens up
          for one hour is flattering you, and the rule has to be visible for the
          empty squares to mean anything. */}
      <p className="graph__rule">
        <strong>{DAY_MIN_HOURS} hours minimum</strong> — if you do less, your day progress is none.
      </p>

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
          {/* An hour worked is still an hour worked; it just didn't make a day. */}
          {hover.hours > 0 && hover.hours < DAY_MIN_HOURS && (
            <span className="graph__tip-note"> — under {DAY_MIN_HOURS}h, no progress</span>
          )}
        </div>
      )}
    </div>
  );
}
