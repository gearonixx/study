/** Badge wall plus the level bar — the ownership loop. */

import { useMemo } from 'react';
import { useStore } from '../lib/store';
import { ACHIEVEMENTS } from '../lib/achievements';
import { summarize } from '../lib/stats';
import { formatShort } from '../lib/date';
import { Card, Meter, num } from './ui';

const TIER_NAME: Record<number, string> = { 1: 'Bronze', 2: 'Silver', 3: 'Gold', 4: 'Legendary' };

export function Achievements() {
  const { db } = useStore();
  const s = useMemo(() => summarize(db), [db]);
  const earned = ACHIEVEMENTS.filter((a) => db.unlocked[a.id]).length;

  return (
    <div className="stack-lg">
      <Card>
        <div className="level">
          <div className="level__badge">{s.level}</div>
          <div className="level__body">
            <div className="level__row">
              <h2>
                Level {s.level} · <span className="level__title">{s.title}</span>
              </h2>
              <span className="muted">
                {s.levelInto} / {s.levelNeed} XP
              </span>
            </div>
            <Meter value={s.levelProgress} label="Progress to next level" />
            <p className="muted small">
              {num(s.xp)} XP total · {num(s.totalHours)} hours · {earned} of {ACHIEVEMENTS.length}{' '}
              badges
            </p>
          </div>
        </div>
      </Card>

      <Card title={`Badges — ${earned}/${ACHIEVEMENTS.length}`}>
        <div className="badges">
          {[...ACHIEVEMENTS]
            .sort((a, b) => {
              const ua = db.unlocked[a.id] ? 0 : 1;
              const ub = db.unlocked[b.id] ? 0 : 1;
              return ua - ub || a.tier - b.tier;
            })
            .map((a) => {
              const at = db.unlocked[a.id];
              const progress = !at && a.progress ? a.progress(db) : 0;
              return (
                <div className={`badge ${at ? 'badge--earned' : ''}`} key={a.id}>
                  <div className="badge__icon">{a.icon}</div>
                  <div className="badge__body">
                    <div className="badge__head">
                      <strong>{a.name}</strong>
                      <span className={`chip chip--tier chip--tier${a.tier}`}>
                        {TIER_NAME[a.tier]}
                      </span>
                    </div>
                    <p className="badge__desc">{a.description}</p>
                    {at ? (
                      <p className="badge__meta">Earned {formatShort(isoOf(at))}</p>
                    ) : a.progress ? (
                      <>
                        <Meter value={progress} />
                        <p className="badge__meta">{Math.round(progress * 100)}%</p>
                      </>
                    ) : (
                      <p className="badge__meta">Locked</p>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </Card>
    </div>
  );
}

function isoOf(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
