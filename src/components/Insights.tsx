/** Stats page: the graph, the headline numbers, and where the hours go. */

import { useMemo } from 'react';
import { useStore } from '../lib/store';
import { loadAuth } from '../lib/auth';
import { summarize, slotHeatmap, intensity } from '../lib/stats';
import { formatShort, addDays, todayKey } from '../lib/date';
import { dayHours, BRIDGE_AFTER, SLOTS_PER_DAY } from '../lib/types';
import { ContributionGraph, hoursOf } from './ContributionGraph';
import { Card, Meter, num } from './ui';

export function Insights({ go }: { go: (route: string) => void }) {
  const { db, setActiveDate, cloud } = useStore();
  // Signed in, the graph is yours by name — the same way a GitHub profile
  // titles its own contributions. Signed out, it's just the graph.
  const auth = loadAuth();
  const handle = cloud.user?.login ?? auth.login ?? 'Study graph';
  const avatar = cloud.user?.avatarUrl ?? auth.avatarUrl ?? null;
  const fullName = cloud.user?.name ?? auth.name ?? null;
  const s = useMemo(() => summarize(db), [db]);
  const heat = useMemo(() => slotHeatmap(db), [db]);

  // Last 30 days as a small bar chart, oldest first.
  const trend = useMemo(() => {
    const today = todayKey();
    return Array.from({ length: 30 }, (_, i) => {
      const date = addDays(today, -(29 - i));
      return { date, hours: db.days[date] ? dayHours(db.days[date]) : 0 };
    });
  }, [db.days]);

  const maxTrend = Math.max(SLOTS_PER_DAY, ...trend.map((t) => t.hours));

  return (
    <div className="stack-lg">
      <Card
        title={
          <div className="profile__head">
            {avatar && <img className="avatar profile__avatar" src={avatar} alt="" />}
            <div>
              <h2>{handle}</h2>
              {fullName && <p className="day-head__date">{fullName}</p>}
            </div>
          </div>
        }
        padded={false}
      >
        <ContributionGraph
          hours={hoursOf(db)}
          onPick={(date) => {
            setActiveDate(date);
            go('today');
          }}
        />
      </Card>

      <div className="stat-grid">
        <Stat label="Current streak" value={`${s.currentStreak}`} unit="days" tone="accent" />
        <Stat label="Longest streak" value={`${s.longestStreak}`} unit="days" />
        <Stat label="Total hours" value={num(s.totalHours)} unit="h" />
        <Stat label="Active days" value={`${s.activeDays}`} unit="days" />
        <Stat label="Last 7 days" value={num(s.last7)} unit="h" />
        <Stat label="Last 30 days" value={num(s.last30)} unit="h" />
        <Stat label="Average, active day" value={num(s.avgActive)} unit="h" />
        <Stat
          label="Best day"
          value={s.bestDay ? num(s.bestDay.hours) : '—'}
          unit={s.bestDay ? formatShort(s.bestDay.date) : ''}
        />
      </div>

      <div className="two-col">
        <Card title="Last 30 days">
          <div className="trend">
            {trend.map((t) => (
              <div
                className="trend__bar"
                key={t.date}
                title={`${formatShort(t.date)}: ${num(t.hours)} h`}
              >
                <span
                  className={`trend__fill trend__fill--l${intensity(t.hours)}`}
                  style={{ height: `${(t.hours / maxTrend) * 100}%` }}
                />
              </div>
            ))}
          </div>
        </Card>

        <Card title="Where the hours go">
          {s.byGoal.length === 0 ? (
            <p className="muted small">No goals set yet.</p>
          ) : (
            <ul className="bars">
              {s.byGoal.slice(0, 8).map((g, i) => (
                <li key={g.label}>
                  <span className="bars__label">
                    <span className={`chip chip--goal chip--c${i % 6}`}>{g.label}</span>
                    <span className="muted">{num(g.hours)} h</span>
                  </span>
                  <Meter value={g.hours / (s.byGoal[0].hours || 1)} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Completion by block">
        <div className="heat">
          {heat.map((row) => {
            const rate = row.total ? row.done / row.total : 0;
            return (
              <div className="heat__col" key={row.index}>
                <span
                  className={`heat__bar heat__bar--l${row.total ? intensity(rate * SLOTS_PER_DAY) : 0}`}
                  style={{ height: `${Math.max(rate * 100, row.total ? 6 : 2)}%` }}
                  title={`Block ${row.index}: ${Math.round(rate * 100)}% completed across ${row.total} attempts`}
                />
                <span className={`heat__idx ${row.index === BRIDGE_AFTER ? 'heat__idx--bridge' : ''}`}>
                  {row.index}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: 'accent';
}) {
  return (
    <div className={`stat ${tone ? `stat--${tone}` : ''}`}>
      <span className="stat__label">{label}</span>
      <span className="stat__value">
        {value}
        {unit && <span className="stat__unit">{unit}</span>}
      </span>
    </div>
  );
}
