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
import { scheduleAt, type ScheduleNow } from './schedule';
import { dueAt, isFresh, MARK_MS, TICK_MS, TICKS_PER_PART } from './announce';
import { chime, primeAudio } from './chime';
import { electAnnouncer, isAnnouncer, onAnnouncerChange } from './leader';
import type { ScheduleId } from './types';

/** The one still on screen, so a new announcement can retire it. */
let showing: Notification | null = null;

/**
 * Every announcement gets a tag of its own.
 *
 * Sharing one tag across them is what made notifications go missing: a
 * notification whose tag matches one already in the tray *replaces* it, and the
 * replacement is deliberately silent — no banner, no sound, just the text
 * swapped underneath. Since these land every few minutes, the previous one was
 * usually still sitting there, so the chime played and nothing appeared. Unique
 * tags mean each one alerts on its own; closing the last one by hand keeps the
 * tray from stacking up now that nothing replaces anything.
 */
function notify(title: string, body?: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const options: NotificationOptions = {
    body,
    icon: `${import.meta.env.BASE_URL}favicon.svg`,
    tag: `timeforces:${Date.now()}`,
  };
  try {
    showing?.close();
    showing = new Notification(title, options);
  } catch {
    // Chrome on Android forbids the constructor outright and takes
    // notifications only through the service worker registration.
    void navigator.serviceWorker?.ready
      .then((reg) => reg.showNotification(title, options))
      .catch(() => {});
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
  /** The shape the running day takes. */
  schedule: ScheduleId;
}

/**
 * Whether this tab is the one that announces.
 *
 * Every open copy of the app draws its own ring, but only one of them may
 * speak — otherwise three tabs mean three notifications for the same block.
 */
export function useIsAnnouncer(): boolean {
  const [mine, setMine] = useState(isAnnouncer);
  useEffect(() => {
    electAnnouncer();
    setMine(isAnnouncer());
    return onAnnouncerChange(setMine);
  }, []);
  return mine;
}

export function useFocusTimer({ notifications, sound, schedule }: TimerHooks): TimerApi {
  const [now, setNow] = useState<ScheduleNow>(() => scheduleAt(Date.now(), schedule));

  // Keep the latest hooks in a ref so the ticking effect never re-subscribes.
  const hooks = useRef({ notifications, sound, schedule });
  hooks.current = { notifications, sound, schedule };

  /** Everything already said, so nothing is said twice. */
  const said = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  useEffect(() => {
    if (notifications) void requestNotificationPermission();
  }, [notifications]);

  // The clock is not a user gesture, so audio has to be unlocked by the first
  // click or keypress of the session or every chime is silently dropped.
  useEffect(() => primeAudio(), []);

  useEffect(() => {
    const sample = () => {
      const t = Date.now();
      const state = scheduleAt(t, hooks.current.schedule);
      setNow(state);

      // Standing inside a stretch is not the same as arriving at its edge:
      // opening the page mid-block is not news, so the first sample only takes
      // note of where it landed. Everything after that is a real crossing.
      for (const a of dueAt(state, t)) {
        if (said.current.has(a.key)) continue;
        said.current.add(a.key);
        if (a.phase && !primed.current) continue;
        // A stretch you slept through is not worth hearing about either.
        if (!isFresh(a, t)) continue;
        if (hooks.current.notifications) notify(a.title, a.body);
        if (hooks.current.sound) void chime(a.kind);
      }
      primed.current = true;
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
