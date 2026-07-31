/**
 * The sound the day makes.
 *
 * Its own module because two very different hosts need it: the page, and the
 * extension's background page — which has no React, no DOM to speak of, and
 * often no open tab. Nothing here touches either.
 */

import type { ChimeKind } from './announce';

/**
 * One audio context for the life of the host.
 *
 * Browsers refuse to start audio until the page has been interacted with, and a
 * chime fired by the clock is never a user gesture — a context built inside the
 * tick callback is born suspended and stays that way, silently. So the context
 * is made once here, woken on a real gesture by `primeAudio`, and waited on by
 * `running` before every chime in case the browser parked it meanwhile.
 */
let audio: AudioContext | null = null;

function context(): AudioContext | null {
  try {
    const Ctx =
      globalThis.AudioContext ??
      (globalThis as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audio ??= new Ctx();
    return audio;
  } catch {
    return null;
  }
}

/**
 * The context, awake — and only once it *is* awake.
 *
 * `resume()` is asynchronous, and a suspended context's clock is frozen: its
 * `currentTime` stops advancing until the resume actually lands. Scheduling a
 * chime against that frozen reading puts the whole envelope in the past by the
 * time sound is flowing, so the ramps arrive already finished and the note
 * plays at silence. That is the missing-chime bug — the notification shows, the
 * sound never does. Waiting for the resume is what makes it reliable.
 */
export async function running(): Promise<AudioContext | null> {
  const ctx = context();
  if (!ctx) return null;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return null;
    }
  }
  return ctx.state === 'running' ? ctx : null;
}

/**
 * Wakes the audio context on a click or keypress. Without this the very first
 * chime of a session is swallowed — which is exactly what happens on a page you
 * reload and then only watch. Not `once`: browsers park the context again when
 * the tab is hidden, so every gesture is a chance to have it already running by
 * the time the clock next needs it.
 */
export function primeAudio(): void {
  if (typeof window === 'undefined') return;
  const wake = () => void running();
  const opts = { passive: true } as const;
  window.addEventListener('pointerdown', wake, opts);
  window.addEventListener('keydown', wake, opts);
  window.addEventListener('touchstart', wake, opts);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') wake();
  });
}

/**
 * WebAudio chime — no asset files, so it works offline and under a strict CSP.
 * Resolves false when the host could not produce sound, which is how the
 * background page knows to hand the job to an open tab instead.
 */
export async function chime(kind: ChimeKind): Promise<boolean> {
  try {
    const ctx = await running();
    if (!ctx) return false;
    const notes =
      kind === 'focus' ? [523.25, 659.25, 783.99]
      : kind === 'break' ? [783.99, 523.25]
      : kind === 'mark' ? [659.25]
      : [523.25, 659.25, 783.99, 1046.5];
    // A mark interrupts a block that is already running, so it stays quiet.
    const peak = kind === 'mark' ? 0.1 : 0.25;
    // Read the clock *after* the resume, and leave a hair of lead so the first
    // envelope point is never already behind us.
    const start = ctx.currentTime + 0.02;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const at = start + i * 0.16;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.45);
    });
    return true;
  } catch {
    /* audio blocked until first interaction — not worth surfacing */
    return false;
  }
}
