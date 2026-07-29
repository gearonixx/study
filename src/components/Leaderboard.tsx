/**
 * The standings, and one person's public record.
 *
 * Everything here comes from the server's public endpoints, so it works signed
 * out and shows the same numbers to everyone. What is public is *hours* —
 * totals, streaks, the graph. Block comments, goals and side notes never leave
 * the owner's device.
 */

import { useEffect, useState } from 'react';
import {
  cloudConfigured,
  fetchLeaderboard,
  fetchProfile,
  getUser,
  type LeaderRow,
  type PublicProfile,
} from '../lib/cloud';
import { formatShort, todayKey, toKey } from '../lib/date';
import { ContributionGraph } from './ContributionGraph';
import { Button, Card, num } from './ui';

export function Leaderboard() {
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const me = getUser()?.login ?? null;

  useEffect(() => {
    if (!cloudConfigured) return;
    let cancelled = false;
    fetchLeaderboard(todayKey())
      .then((r) => !cancelled && setRows(r))
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!cloudConfigured) {
    return (
      <Card title="Leaderboard">
        <p className="muted small">
          This build has no server, so there is nobody to rank. Sign-in and the standings appear
          once the app is built against an API.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Leaderboard" padded={false}>
      {error && <p className="pad muted small">Couldn't load the standings: {error}</p>}
      {!error && rows === null && <p className="pad muted small">Loading…</p>}
      {rows?.length === 0 && (
        <p className="pad muted small">
          Nobody has banked an hour yet. Be the first — the standings fill as people sign in.
        </p>
      )}

      {rows && rows.length > 0 && (
        <ol className="board">
          {rows.map((r, i) => (
            <li key={r.login} className={`board__row ${r.login === me ? 'board__row--me' : ''}`}>
              {/* A real link: a profile is a URL you can share, not a mode. */}
              <a className="board__hit" href={`#/u/${r.login}`}>
                <span className="board__rank">{i + 1}</span>
                {r.avatarUrl ? (
                  <img className="avatar board__avatar" src={r.avatarUrl} alt="" />
                ) : (
                  <span className="avatar board__avatar board__avatar--blank" />
                )}
                <span className="board__who">
                  <strong>{r.login}</strong>
                  {r.name && <span className="muted">{r.name}</span>}
                </span>
                <span className="board__stat">
                  <strong>{num(r.totalHours)}</strong>
                  <span className="muted">h</span>
                </span>
                <span className="board__stat board__stat--streak">
                  <strong>{r.currentStreak}</strong>
                  <span className="muted">streak</span>
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export function PublicProfile({ login, onBack }: { login: string; onBack: () => void }) {
  const [p, setP] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setP(null);
    setError(null);
    fetchProfile(login, todayKey())
      .then((next) => !cancelled && setP(next))
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [login]);

  return (
    <div className="stack-lg">
      <Card
        title={
          <div className="profile__head">
            {p?.avatarUrl && <img className="avatar profile__avatar" src={p.avatarUrl} alt="" />}
            <div>
              <h2>{login}</h2>
              {p?.name && <p className="day-head__date">{p.name}</p>}
            </div>
          </div>
        }
        action={
          <Button size="sm" onClick={onBack}>
            Back
          </Button>
        }
        padded={false}
      >
        {error && <p className="pad muted small">{error}</p>}
        {!error && !p && <p className="pad muted small">Loading…</p>}
        {p && (
          <>
            {/* The lifetime counter: every hour ever marked clean or dirty,
                and the day the account started counting. */}
            <div className="tally">
              <span className="tally__badge">
                <span className="tally__badge-l">study</span>
                <span className="tally__badge-r">{num(p.totalHours)} hrs completed</span>
              </span>
              <span className="tally__joined">Joined {formatShort(toKey(new Date(p.joinedAt)))}</span>
            </div>
            <ContributionGraph hours={p.hours} />
          </>
        )}
      </Card>

      {p && (
        <div className="stat-grid">
          <Stat label="Total hours" value={num(p.totalHours)} unit="h" tone="accent" />
          <Stat label="Current streak" value={`${p.currentStreak}`} unit="days" />
          <Stat label="Longest streak" value={`${p.longestStreak}`} unit="days" />
          <Stat label="Active days" value={`${p.activeDays}`} unit="days" />
          <Stat label="Last 7 days" value={num(p.last7)} unit="h" />
          <Stat
            label="Last active"
            value={p.lastActive ? formatShort(p.lastActive) : '—'}
          />
        </div>
      )}
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
