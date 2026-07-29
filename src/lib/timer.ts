/**
 * The focus engine.
 *
 * Deliberately not a configurable pomodoro: one hour of work, ten minutes of
 * rest, chained automatically, session counter walking 1 → 12. The only
 * controls are start, pause and reset — the rigidity is the point.
 *
 * State is stored as *timestamps*, never as a ticking countdown, so closing the
 * tab, sleeping the laptop or reloading mid-block all resolve correctly: on the
 * way back in we replay however many phases elapsed while we were away.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { SLOTS_PER_DAY } from './types';
import { todayKey } from './date';

export const FOCUS_MS = 60 * 60 * 1000;
export const BREAK_MS = 10 * 60 * 1000;

export type Phase = 'idle' | 'focus' | 'break' | 'done';

export interface TimerState {
  phase: Phase;
  /** 1-based block this focus phase is filling. */
  session: number;
  /** Epoch ms the current phase began. Null while idle or paused. */
  startedAt: number | null;
  /** Ms already banked in this phase before the last pause. */
  elapsedBeforePause: number;
  running: boolean;
  /** Day the counter belongs to, so a new day resets the session. */
  date: string;
}

const KEY = 'wizzard:timer:v1';

export const initialTimer = (): TimerState => ({
  phase: 'idle',
  session: 1,
  startedAt: null,
  elapsedBeforePause: 0,
  running: false,
  date: todayKey(),
});

function loadTimer(): TimerState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initialTimer();
    const state = { ...initialTimer(), ...JSON.parse(raw) } as TimerState;
    // A stale counter from yesterday shouldn't start today on block 9.
    return state.date === todayKey() ? state : initialTimer();
  } catch {
    return initialTimer();
  }
}

function saveTimer(state: TimerState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or disabled — the timer still works for this session */
  }
}

export function phaseLength(phase: Phase): number {
  return phase === 'focus' ? FOCUS_MS : phase === 'break' ? BREAK_MS : 0;
}

/** Ms elapsed in the current phase right now. */
function elapsedOf(state: TimerState, now: number): number {
  return state.elapsedBeforePause + (state.running && state.startedAt ? now - state.startedAt : 0);
}

export interface PhaseChange {
  /** The phase that just finished. */
  from: Phase;
  to: Phase;
  /** Block index that was completed, present only when a focus hour ended. */
  completedSession?: number;
}

/**
 * Advances `state` past any phases that finished while we weren't looking.
 * Returns the settled state plus every transition that occurred, so the caller
 * can fire notifications and tick blocks off even after a long sleep.
 */
export function advance(state: TimerState, now: number): { state: TimerState; changes: PhaseChange[] } {
  const changes: PhaseChange[] = [];
  let next = { ...state };
  // Bounded so a laptop asleep for a week can't spin here.
  for (let guard = 0; guard < 64; guard++) {
    if (!next.running || next.phase === 'idle' || next.phase === 'done') break;
    const length = phaseLength(next.phase);
    const elapsed = elapsedOf(next, now);
    if (elapsed < length) break;

    // Carry the overshoot into the next phase so long chains stay aligned.
    const overshoot = elapsed - length;
    if (next.phase === 'focus') {
      changes.push({ from: 'focus', to: 'break', completedSession: next.session });
      const finished = next.session >= SLOTS_PER_DAY;
      next = {
        ...next,
        phase: finished ? 'done' : 'break',
        running: !finished,
        startedAt: finished ? null : now - overshoot,
        elapsedBeforePause: 0,
      };
      if (finished) changes.push({ from: 'break', to: 'done' });
    } else {
      const session = Math.min(next.session + 1, SLOTS_PER_DAY);
      changes.push({ from: 'break', to: 'focus' });
      next = {
        ...next,
        phase: 'focus',
        session,
        startedAt: now - overshoot,
        elapsedBeforePause: 0,
      };
    }
  }
  return { state: next, changes };
}

/** WebAudio chime — no asset files, so it works offline and under a strict CSP. */
function chime(kind: 'focus' | 'break' | 'done'): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const notes = kind === 'focus' ? [523.25, 659.25, 783.99] : kind === 'break' ? [783.99, 523.25] : [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const at = ctx.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
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
    new Notification(title, { body, icon: `${import.meta.env.BASE_URL}favicon.svg`, tag: 'wizzard' });
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
  state: TimerState;
  /** Ms remaining in the current phase. */
  remaining: number;
  /** 0..1 through the current phase. */
  progress: number;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  /** Abandons the current phase and jumps straight to the next one. */
  skip: () => void;
  /** Points the counter at a specific block, e.g. after manual edits. */
  setSession: (session: number) => void;
}

export interface TimerHooks {
  /** Fired when a focus hour completes, with the 1-based block index. */
  onFocusComplete?: (session: number) => void;
  notifications: boolean;
  sound: boolean;
}

export function useFocusTimer({ onFocusComplete, notifications, sound }: TimerHooks): TimerApi {
  const [state, setState] = useState<TimerState>(loadTimer);
  const [now, setNow] = useState(() => Date.now());

  // Keep the latest hooks in a ref so the ticking effect never re-subscribes.
  const hooks = useRef({ onFocusComplete, notifications, sound });
  hooks.current = { onFocusComplete, notifications, sound };

  const applyChanges = useCallback((changes: PhaseChange[]) => {
    for (const change of changes) {
      const { onFocusComplete: done, notifications: notify_, sound: sound_ } = hooks.current;
      if (change.completedSession !== undefined) done?.(change.completedSession);

      const [title, body, kind] =
        change.to === 'break'
          ? ['Block complete', `Block ${change.completedSession} done. 10 minute break — rest now.`, 'break' as const]
          : change.to === 'focus'
            ? ['Break over', 'Next hour starts now. Back in.', 'focus' as const]
            : ['Twelve for twelve', 'Full day cleared. Nothing left to run.', 'done' as const];

      if (notify_) notify(title, body);
      if (sound_) chime(kind);
    }
  }, []);

  // One shared interval drives both the display and phase transitions.
  useEffect(() => {
    const tick = () => {
      const t = Date.now();
      setNow(t);
      setState((prev) => {
        const { state: next, changes } = advance(prev, t);
        if (changes.length) {
          applyChanges(changes);
          saveTimer(next);
          return next;
        }
        return prev;
      });
    };
    tick();
    const id = setInterval(tick, 250);
    // Coming back to a backgrounded tab must resolve missed phases immediately.
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [applyChanges]);

  const update = useCallback((fn: (prev: TimerState) => TimerState) => {
    setState((prev) => {
      const next = fn(prev);
      saveTimer(next);
      return next;
    });
  }, []);

  const start = useCallback(() => {
    void requestNotificationPermission();
    update((prev) => ({
      ...prev,
      phase: 'focus',
      date: todayKey(),
      startedAt: Date.now(),
      elapsedBeforePause: 0,
      running: true,
    }));
  }, [update]);

  const pause = useCallback(() => {
    update((prev) =>
      prev.running
        ? { ...prev, running: false, elapsedBeforePause: elapsedOf(prev, Date.now()), startedAt: null }
        : prev,
    );
  }, [update]);

  const resume = useCallback(() => {
    update((prev) => (prev.running ? prev : { ...prev, running: true, startedAt: Date.now() }));
  }, [update]);

  const reset = useCallback(() => update(() => initialTimer()), [update]);

  const skip = useCallback(() => {
    update((prev) => {
      if (prev.phase === 'focus') {
        const finished = prev.session >= SLOTS_PER_DAY;
        return {
          ...prev,
          phase: finished ? 'done' : 'break',
          running: !finished,
          startedAt: finished ? null : Date.now(),
          elapsedBeforePause: 0,
        };
      }
      if (prev.phase === 'break') {
        return {
          ...prev,
          phase: 'focus',
          session: Math.min(prev.session + 1, SLOTS_PER_DAY),
          running: true,
          startedAt: Date.now(),
          elapsedBeforePause: 0,
        };
      }
      return prev;
    });
  }, [update]);

  const setSession = useCallback(
    (session: number) =>
      update((prev) => ({ ...prev, session: Math.min(Math.max(session, 1), SLOTS_PER_DAY) })),
    [update],
  );

  const length = phaseLength(state.phase);
  const elapsed = Math.min(elapsedOf(state, now), length);

  return {
    state,
    remaining: Math.max(0, length - elapsed),
    progress: length ? elapsed / length : 0,
    start,
    pause,
    resume,
    reset,
    skip,
    setSession,
  };
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
