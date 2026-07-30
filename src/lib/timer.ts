/**
 * The focus engine.
 *
 * Not a pomodoro you drive — a schedule that drives you. The day's shape lives
 * in `schedule.ts` and is read off the wall clock: blocks open and close at
 * fixed local times, every day, with no start, pause, skip or reset. The only
 * thing this module owns is *reacting* to the clock: chimes, notifications, and
 * ticking blocks off as their hour closes.
 *
 * Nothing is stored as a countdown, so a reload or a sleeping laptop changes
 * nothing — the clock is the state.
 */

import { useEffect, useRef, useState } from 'react';
import { scheduleAt, atClock, type ScheduleNow } from './schedule';
import { SLOTS_PER_DAY } from './types';

/** How stale a transition can be and still be worth announcing. */
const ANNOUNCE_WINDOW_MS = 90 * 1000;

/**
 * How often a running block says how much of itself is left. An hour divides
 * evenly by this, so the marks land on 10:00, 20:00, 30:00, 40:00 and 50:00 —
 * 50, 40, 30, 20 and 10 minutes still to go.
 */
const MARK_MS = 10 * 60 * 1000;

/**
 * How often a running block tells you to get back to it. Its own cadence, on
 * purpose: 3.5 and 10 only line up again at 70 minutes, so inside an hour a nag
 * never lands on the same second as a part. Seventeen of them per block.
 */
const NAG_MS = 3.5 * 60 * 1000;

/** WebAudio chime — no asset files, so it works offline and under a strict CSP. */
function chime(kind: 'focus' | 'break' | 'done' | 'mark'): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const notes =
      kind === 'focus' ? [523.25, 659.25, 783.99]
      : kind === 'break' ? [783.99, 523.25]
      : kind === 'mark' ? [659.25]
      : [523.25, 659.25, 783.99, 1046.5];
    // A mark interrupts a block that is already running, so it stays quiet.
    const peak = kind === 'mark' ? 0.1 : 0.25;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const at = ctx.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.45);
    });
    setTimeout(() => void ctx.close(), 1600);
  } catch {
    /* audio blocked until first interaction — not worth surfacing */
  }
}

function notify(title: string, body: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: `${import.meta.env.BASE_URL}favicon.svg`, tag: 'study' });
  } catch {
    /* some browsers require a service worker; the in-app banner still shows */
  }
}

export function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return Promise.resolve('denied');
  if (Notification.permission !== 'default') return Promise.resolve(Notification.permission);
  return Notification.requestPermission();
}

export interface TimerApi {
  /** Where the wall clock says the day currently stands. */
  now: ScheduleNow;
}

export interface TimerHooks {
  notifications: boolean;
  sound: boolean;
}

/** The message for entering a stretch of the day. */
function announcement(next: ScheduleNow): [string, string, 'focus' | 'break' | 'done'] | null {
  switch (next.phase) {
    case 'block':
      return [
        `Block ${next.block} of ${SLOTS_PER_DAY}`,
        `Runs to ${atClock(next.to)}. Back in.`,
        'focus',
      ];
    case 'break':
      return [
        'Block complete',
        `Drink water. Mark it clean or dirty. Block ${next.nextBlock} starts at ${atClock(next.to)}.`,
        'break',
      ];
    case 'bridge':
      return [
        'BRIDGE',
        `Thirty minutes. Stage 2 opens at ${atClock(next.to)}.`,
        'break',
      ];
    case 'after':
      return ['Day complete', `All ${SLOTS_PER_DAY} blocks are behind you.`, 'done'];
    default:
      return null;
  }
}

export function useFocusTimer({ notifications, sound }: TimerHooks): TimerApi {
  const [now, setNow] = useState<ScheduleNow>(() => scheduleAt(Date.now()));

  // Keep the latest hooks in a ref so the ticking effect never re-subscribes.
  const hooks = useRef({ notifications, sound });
  hooks.current = { notifications, sound };

  const lastKey = useRef<string | null>(null);
  const lastMark = useRef<string | null>(null);
  const lastNag = useRef<string | null>(null);

  useEffect(() => {
    if (notifications) void requestNotificationPermission();
  }, [notifications]);

  useEffect(() => {
    const tick = () => {
      const t = Date.now();
      const state = scheduleAt(t);
      setNow(state);

      // Announce a stretch only if we're actually standing at its edge; coming
      // back after two hours away shouldn't fire a queue of stale chimes.
      if (lastKey.current === null) {
        lastKey.current = state.key;
      } else if (lastKey.current !== state.key) {
        lastKey.current = state.key;
        const fresh = state.phase === 'after' ? state.dayEnd : state.from;
        if (t - fresh < ANNOUNCE_WINDOW_MS) {
          const said = announcement(state);
          if (said) {
            const [title, body, kind] = said;
            if (hooks.current.notifications) notify(title, body);
            if (hooks.current.sound) chime(kind);
          }
        }
      }

      // Inside a block, tick off its parts as they close, so the hour can be
      // felt without looking at the page. The sixth part is never announced —
      // closing it is the end of the block, which speaks for itself. Same
      // freshness rule as the transitions: a part you slept through is not
      // worth hearing about.
      if (state.phase === 'block') {
        const parts = Math.round((state.to - state.from) / MARK_MS);
        const mark = Math.floor((t - state.from) / MARK_MS);
        const markKey = `${state.key}#${mark}`;
        if (mark >= 1 && lastMark.current !== markKey) {
          const fresh = state.from + mark * MARK_MS;
          lastMark.current = markKey;
          if (t - fresh < ANNOUNCE_WINDOW_MS) {
            const left = Math.floor((state.to - fresh) / 60_000);
            if (hooks.current.notifications) {
              notify(
                `Part ${mark}/${parts}, ${left} minutes left`,
                `Block ${state.block} runs to ${atClock(state.to)}.`,
              );
            }
            if (hooks.current.sound) chime('mark');
          }
        }

        // And the nag, on its own clock: no numbers, no progress, just the
        // reminder that the hour is running whether you are working or not.
        const nag = Math.floor((t - state.from) / NAG_MS);
        const nagKey = `${state.key}#${nag}`;
        if (nag >= 1 && lastNag.current !== nagKey) {
          const fresh = state.from + nag * NAG_MS;
          lastNag.current = nagKey;
          if (t - fresh < ANNOUNCE_WINDOW_MS) {
            if (hooks.current.notifications) {
              notify('FOCUS, BITCH.', `Block ${state.block} runs to ${atClock(state.to)}.`);
            }
            if (hooks.current.sound) chime('mark');
          }
        }
      }
    };

    tick();
    const id = setInterval(tick, 250);
    // Coming back to a backgrounded tab must resolve missed blocks immediately.
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return { now };
}

/** `48:12` inside an hour, `2:20:05` for the long wait before 10:00. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  if (total > 3600) {
    return `${Math.floor(total / 3600)}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  }
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}
