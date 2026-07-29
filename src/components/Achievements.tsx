/** Badge wall plus the level bar — the ownership loop, DOOM edition. */

import { useMemo } from 'react';
import { useStore } from '../lib/store';
import { ACHIEVEMENTS } from '../lib/achievements';
import { summarize } from '../lib/stats';
import { formatShort } from '../lib/date';
import { Card, Meter, num } from './ui';

/** DOOM skill levels, mapped onto the four badge tiers. */
const TIER_NAME: Record<number, string> = {
  1: "I'm Too Young to Die",
  2: 'Hurt Me Plenty',
  3: 'Ultra-Violence',
  4: 'Nightmare!',
};

/**
 * The big HUD face reflects how bloodied you are by the grind — a fresh grin at
 * the start, battered in the thick of it, glowing god-mode eyes once you've
 * cleared the wall. Purely cosmetic, driven by the earned ratio.
 */
function hudFace(ratio: number): number {
  if (ratio >= 1) return 42; // all badges — invulnerability / god mode
  if (ratio >= 0.75) return 34;
  if (ratio >= 0.5) return 27;
  if (ratio >= 0.25) return 18;
  if (ratio > 0) return 3;
  return 1;
}

export function Achievements() {
  const { db } = useStore();
  const s = useMemo(() => summarize(db), [db]);
  const earned = ACHIEVEMENTS.filter((a) => db.unlocked[a.id]).length;

  return (
    <div className="stack-lg doom">
      <Card>
        <div className="level">
          <div className="level__badge">
            <img
              className="hud-face"
              src={`/doomguy/${hudFace(earned / ACHIEVEMENTS.length)}.png`}
              alt=""
              draggable={false}
            />
            <span className="level__num">{s.level}</span>
          </div>
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
              kills confirmed
            </p>
          </div>
        </div>
      </Card>

      <Card title={`Kills — ${earned}/${ACHIEVEMENTS.length}`}>
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
                  <div className="badge__icon">
                    <img src={a.icon} alt="" draggable={false} />
                  </div>
                  <div className="badge__body">
                    <div className="badge__head">
                      <strong>{a.name}</strong>
                      <span className={`chip chip--tier chip--tier${a.tier}`}>
                        {TIER_NAME[a.tier]}
                      </span>
                    </div>
                    <p className="badge__desc">{a.description}</p>
                    {at ? (
                      <p className="badge__meta">Confirmed {formatShort(isoOf(at))}</p>
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
