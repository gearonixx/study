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
 * The tick: the smallest unit the day is measured in, nested inside the part
 * the way the part is nested inside the block. Three to a part, so 3⅓ minutes
 * — and the third tick closes the part itself, which the part announcement
 * already covers, so only the first two of each are ever heard.
 *
 * A tick says where in the part it is and nothing else. The minutes are the
 * part's job; this is only a pulse.
 */
const TICKS_PER_PART = 3;
const TICK_MS = MARK_MS / TICKS_PER_PART;

/**
 * One audio context for the life of the page.
 *
 * Browsers refuse to start audio until the page has been interacted with, and a
 * chime fired by the clock is never a user gesture — a context built inside the
 * tick callback is born suspended and stays that way, silently. So the context
 * is made once, resumed on the first real gesture, and nudged awake again
 * before every chime in case the browser parked it while the tab was hidden.
 */
let audio: AudioContext | null = null;

function context(): AudioContext | null {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audio ??= new Ctx();
    if (audio.state === 'suspended') void audio.resume();
    return audio;
  } catch {
    return null;
  }
}

/**
 * Wakes the audio context on the first click or keypress. Without this the very
 * first chime of a session is swallowed — which is exactly what happens on a
 * page you reload and then only watch.
 */
export function primeAudio(): void {
  const wake = () => void context();
  const opts = { once: true, passive: true } as const;
  window.addEventListener('pointerdown', wake, opts);
  window.addEventListener('keydown', wake, opts);
  window.addEventListener('touchstart', wake, opts);
}

/** WebAudio chime — no asset files, so it works offline and under a strict CSP. */
function chime(kind: 'focus' | 'break' | 'done' | 'mark'): void {
  try {
    const ctx = context();
    if (!ctx) return;
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
  } catch {
    /* audio blocked until first interaction — not worth surfacing */
  }
}

function notify(title: string, body?: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: `${import.meta.env.BASE_URL}favicon.svg`, tag: 'timeforces' });
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

/** An hour's worth of nesting: which part and tick are running, and for how long. */
export interface Measures {
  parts: number;
  /** 1-based part in progress. */
  part: number;
  partRemaining: number;
  ticks: number;
  /** 1-based tick in progress, inside the part. */
  tick: number;
  tickRemaining: number;
}

/**
 * The block's own subdivisions, read off the same wall clock as everything else.
 * Null outside a block: a break has no parts, and neither does the BRIDGE.
 */
export function measuresAt(now: ScheduleNow, at: number): Measures | null {
  if (now.phase !== 'block') return null;
  const elapsed = at - now.from;
  const parts = Math.round((now.to - now.from) / MARK_MS);
  const part = Math.min(parts, Math.floor(elapsed / MARK_MS) + 1);
  const ticked = Math.floor(elapsed / TICK_MS);
  return {
    parts,
    part,
    partRemaining: now.from + part * MARK_MS - at,
    ticks: TICKS_PER_PART,
    tick: (ticked % TICKS_PER_PART) + 1,
    tickRemaining: now.from + (ticked + 1) * TICK_MS - at,
  };
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
  const lastTick = useRef<string | null>(null);

  useEffect(() => {
    if (notifications) void requestNotificationPermission();
  }, [notifications]);

  // The clock is not a user gesture, so audio has to be unlocked by the first
  // click or keypress of the session or every chime is silently dropped.
  useEffect(() => primeAudio(), []);

  useEffect(() => {
    const sample = () => {
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

        // And the ticks inside it. Every third one lands exactly on a part
        // boundary, where the part announcement speaks for both.
        const tick = Math.floor((t - state.from) / TICK_MS);
        const tickKey = `${state.key}#${tick}`;
        if (tick >= 1 && tick % TICKS_PER_PART !== 0 && lastTick.current !== tickKey) {
          const fresh = state.from + tick * TICK_MS;
          lastTick.current = tickKey;
          if (t - fresh < ANNOUNCE_WINDOW_MS) {
            // Its position in the part and nothing else. A tick is a glance.
            if (hooks.current.notifications) {
              notify(`Tick ${tick % TICKS_PER_PART}/${TICKS_PER_PART}`);
            }
            if (hooks.current.sound) chime('mark');
          }
        }
      }
    };

    sample();
    const id = setInterval(sample, 250);
    // Coming back to a backgrounded tab must resolve missed blocks immediately.
    const onVisible = () => document.visibilityState === 'visible' && sample();
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
