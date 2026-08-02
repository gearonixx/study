/**
 * The GitHub contribution calendar, re-pointed at hours studied.
 * 0 → empty, 12 → darkest green, with the same five-step ramp.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { contributionGrid, formatShort, fromKey, monthShort, todayKey } from '../lib/date';
import { intensity, intensityFrom } from '../lib/stats';
import { dayHours, MAX_BLOCKS, type Database } from '../lib/types';
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
  floor = 0,
  tone = 'green',
}: {
  /** A local database's hours, or a public profile's — the graph can't tell. */
  hours: HoursByDate;
  onPick?: (date: string) => void;
  /**
   * Hours a day must clear to register at all. 0 is the ordinary graph, where
   * every hour counts; above 0 the graph answers a narrower question and a day
   * that misses the bar reads exactly like a day with nothing on it.
   */
  floor?: number;
  /**
   * Which ramp the filled cells use. Each floored graph answers a different
   * question, and three identical green calendars stacked down the page read as
   * one graph repeated rather than three.
   */
  tone?: 'green' | 'blue' | 'amber';
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

  // A floored graph is counting days, not hours: "how many times did you clear
  // the bar" is the question it exists to answer.
  const qualifying = useMemo(
    () => Object.values(hoursByDate).filter((h) => h >= floor && h > 0).length,
    [hoursByDate, floor],
  );

  const level = (hours: number) =>
    floor > 0 ? intensityFrom(hours, floor, MAX_BLOCKS) : intensity(hours);

  return (
    <div className={`graph ${tone === 'green' ? '' : `graph--${tone}`}`}>
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

            <div
              className="graph__grid"
              role="grid"
              aria-label={floor > 0 ? `Days of at least ${floor} hours` : 'Hours studied per day'}
            >
              {cols.map((col, ci) => (
                <div className="graph__col" key={ci} role="row">
                  {col.map((date, ri) => {
                    if (!date) return <span className="cell cell--void" key={ri} aria-hidden />;
                    const hours = hoursByDate[date] ?? 0;
                    return (
                      <button
                        key={date}
                        role="gridcell"
                        className={`cell cell--l${level(hours)} ${date === today ? 'cell--today' : ''}`}
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
        <span className="muted">
          {floor > 0 ?
            `${qualifying} days over ${num(floor)} h in the last year`
          : `${num(totalHours)} hours in the last year`}
        </span>
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
          {floor > 0 && hover.hours < floor && <span className="muted"> — under the bar</span>}
        </div>
      )}
    </div>
  );
}
