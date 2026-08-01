/**
 * The app taking the screen at the three moments that decide a day.
 *
 * The rest of TimeForces is a record you keep. This is the part that keeps
 * *you*: it is not dismissible, it covers what is behind it, and it does not
 * offer a "later".
 *
 *   CHECK IN     a block just opened. Prove you are at the desk, or the hour
 *                is taken from you as IDLENESS LIMIT EXCEEDED.
 *   VERDICT DUE  a block just closed. Answer for it. There is no third option
 *                and no way past this screen without one.
 *   BREAK        water, no music, no phone — and somebody who out-works you,
 *                so the ten minutes are not a feed.
 *
 * On honesty: a web page cannot see your other windows, so nothing here claims
 * to. What it can do is make the *claim* explicit and costly — the verdict
 * screen states the standard in words before you answer, so ACCEPTED means you
 * asserted it about an hour you had just finished.
 */

import { useEffect, useState } from 'react';
import { formatClock } from '../lib/timer';
import { standardFor, type Standard } from '../lib/standards';
import { keyToken } from '../lib/keys';
import type { ScheduleNow } from '../lib/schedule';
import type { SlotStatus } from '../lib/types';

/** How long a block waits for you before it takes the hour. */
export const CHECK_IN_MS = 90 * 1000;

export type DemandKind = 'checkin' | 'verdict' | 'break';

export interface DemandState {
  kind: DemandKind;
  /** The block being checked into, or answered for. */
  block: number;
  /** Milliseconds left to comply, for check-in. */
  left: number;
}

/**
 * What the clock is currently demanding, or null when it wants nothing.
 *
 * A break only demands the screen once the block before it has been answered
 * for — the verdict comes first, always.
 */
export function demandAt(
  now: ScheduleNow,
  statuses: SlotStatus[],
  checkedIn: Set<number>,
  breakSeen: Set<string>,
): DemandState | null {
  const t = Date.now();

  if (now.phase === 'block' && now.block) {
    const since = t - now.from;
    if (!checkedIn.has(now.block) && since < CHECK_IN_MS) {
      return { kind: 'checkin', block: now.block, left: CHECK_IN_MS - since };
    }
  }

  // The block that just closed and still says nothing. Only during the break
  // or bridge that follows it, so an old day is never held hostage.
  if ((now.phase === 'break' || now.phase === 'bridge') && now.block) {
    if ((statuses[now.block - 1] ?? 'empty') === 'empty') {
      return { kind: 'verdict', block: now.block, left: now.to - t };
    }
    if (!breakSeen.has(now.key)) {
      return { kind: 'break', block: now.block, left: now.to - t };
    }
  }

  return null;
}

export function Demand({
  state,
  now,
  onCheckIn,
  onVerdict,
  onBreakAck,
  roster,
}: {
  state: DemandState;
  now: ScheduleNow;
  roster: Standard[];
  onCheckIn: () => void;
  onVerdict: (status: SlotStatus) => void;
  onBreakAck: () => void;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = keyToken(e);
      if (state.kind === 'checkin') {
        // Any key at all. The point is that a hand is on the keyboard.
        e.preventDefault();
        onCheckIn();
        return;
      }
      if (state.kind === 'verdict') {
        if (k === 'a') onVerdict('done');
        else if (k === 'd') onVerdict('partial');
        else if (k === 's') onVerdict('skipped');
        else return;
        e.preventDefault();
        return;
      }
      if (state.kind === 'break' && (k === 'enter' || k === ' ')) {
        e.preventDefault();
        onBreakAck();
      }
    };
    // Capture, so nothing behind this screen sees the keystroke first.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [state.kind, onCheckIn, onVerdict, onBreakAck]);

  const standard = standardFor(now.dayKey, state.block, roster);

  if (state.kind === 'checkin') {
    const left = Math.max(0, state.left - (Date.now() - (now.from + (CHECK_IN_MS - state.left))));
    return (
      <div className="demand demand--checkin" role="alertdialog" aria-label="Check in">
        <div className="demand__inner">
          <span className="demand__eyebrow">Block {state.block} is open</span>
          <h1 className="demand__title">ARE YOU AT THE DESK?</h1>
          <p className="demand__body">
            Press any key. Miss it and block {state.block} is recorded
            <strong> IDLENESS LIMIT EXCEEDED</strong> — the hour opened and nobody was here.
          </p>
          <div className="demand__count demand__count--urgent">{formatClock(Math.max(0, left))}</div>
          <p className="demand__foot">One task for the next hour. Nothing else open.</p>
        </div>
      </div>
    );
  }

  if (state.kind === 'verdict') {
    return (
      <div className="demand demand--verdict" role="alertdialog" aria-label="Answer for the block">
        <div className="demand__inner">
          <span className="demand__eyebrow">Block {state.block} is closed</span>
          <h1 className="demand__title">ANSWER FOR IT.</h1>
          <p className="demand__body">
            One task, start to finish, nothing else open — was that this hour?
          </p>
          <div className="demand__keys">
            <button className="demand__key demand__key--a" onClick={() => onVerdict('done')}>
              <kbd>A</kbd>
              <strong>ACCEPTED</strong>
              <span>it was clean</span>
            </button>
            <button className="demand__key demand__key--d" onClick={() => onVerdict('partial')}>
              <kbd>D</kbd>
              <strong>DIRTY</strong>
              <span>you drifted</span>
            </button>
            <button className="demand__key demand__key--s" onClick={() => onVerdict('skipped')}>
              <kbd>S</kbd>
              <strong>SKIPPED</strong>
              <span>you did not sit it</span>
            </button>
          </div>
          <p className="demand__foot">
            There is no way past this screen that is not one of the three.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="demand demand--break" role="alertdialog" aria-label="Break protocol">
      <div className="demand__inner">
        <span className="demand__eyebrow">
          {now.phase === 'bridge' ? 'BRIDGE' : 'Break'} — block {now.nextBlock} at{' '}
          {new Date(now.to).toTimeString().slice(0, 5)}
        </span>
        <h1 className="demand__title">WATER. NOTHING ELSE.</h1>
        <ul className="demand__rules">
          <li>No music.</li>
          <li>No phone, no feed, no video.</li>
          <li>Stand up. Water. Sit back down.</li>
        </ul>
        <div className="demand__count">{formatClock(Math.max(0, now.to - Date.now()))}</div>
        <div className="demand__standard">
          <span className="demand__standard-who">{standard.who}</span>
          <span className="demand__standard-what">{standard.what}</span>
          {/* Where the actual work is. Ten minutes is enough to open a repo. */}
          {(standard.gh || standard.site) && (
            <span className="demand__standard-links">
              {standard.gh && (
                <a href={`https://github.com/${standard.gh}`} target="_blank" rel="noreferrer">
                  github.com/{standard.gh}
                </a>
              )}
              {standard.site && (
                <a href={`https://${standard.site}`} target="_blank" rel="noreferrer">
                  {standard.site}
                </a>
              )}
            </span>
          )}
        </div>
        <button className="btn" onClick={onBreakAck}>
          Understood — <kbd>Enter</kbd>
        </button>
      </div>
    </div>
  );
}
