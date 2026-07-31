/**
 * The keyboard is the only way to answer for a block.
 *
 * There is no checkbox any more. An hour of your life is not a thing you tick
 * off with a cursor — it gets a verdict, the way a submission does, and you
 * type it. What is borrowed from a judge is the *delivery*: one keystroke, and
 * a result shouted back at you a moment later. The words stay the day's own,
 * because that is what they mean:
 *
 *   A   ACCEPTED   the hour was clean
 *   D   DIRTY      the hour was spoiled
 *
 * `D` for dirty, straightforwardly. It would only be ambiguous if something
 * else here were called "done", and nothing is — the clean verdict is `A`,
 * accepted. Both sit under the left hand, a row apart, so neither is reachable
 * by accident from the other.
 *
 * Everything else exists so the mouse is genuinely unnecessary: a cursor that
 * starts on the block actually waiting for an answer, J/K to move it, U to take
 * a verdict back.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SlotStatus } from './types';

/** What each key does, in the order the legend shows them. */
export const SLOT_KEYS: { key: string; label: string; status?: SlotStatus }[] = [
  { key: 'A', label: 'clean', status: 'done' },
  { key: 'D', label: 'dirty', status: 'partial' },
  { key: 'S', label: 'skipped', status: 'skipped' },
  { key: 'U', label: 'undo', status: 'empty' },
  { key: 'J / K', label: 'move' },
];

/** The verdict just handed down, for the flash that follows it. */
export interface Verdict {
  slot: number;
  status: SlotStatus;
  /** Bumped on every verdict so a repeat of the same one still re-fires. */
  seq: number;
}

/**
 * The block waiting for an answer: the most recent one whose hour is spent and
 * that still has nothing recorded against it. Falling back to the running block
 * means that pressing A the moment a block ends always lands on the right one.
 */
export function awaitingVerdict(
  statuses: SlotStatus[],
  elapsed: number,
  running: number | null,
): number {
  for (let i = Math.min(elapsed, statuses.length); i >= 1; i--) {
    if (statuses[i - 1] === 'empty') return i;
  }
  if (running) return running;
  return Math.max(1, Math.min(elapsed || 1, statuses.length));
}

export function useSlotKeys({
  blocks,
  suggested,
  dayKey,
  onVerdict,
}: {
  blocks: number;
  /** Where the cursor belongs when the user hasn't moved it themselves. */
  suggested: number;
  /** Changing day puts the cursor back under the clock's control. */
  dayKey: string;
  onVerdict: (slot: number, status: SlotStatus) => void;
}): {
  cursor: number;
  verdict: Verdict | null;
  helpOpen: boolean;
  setHelpOpen: (v: boolean) => void;
} {
  const [cursor, setCursor] = useState(suggested);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const seq = useRef(0);

  // Until the user moves it themselves, the cursor follows the clock. Once they
  // have, it stays where they put it — right up until the day changes.
  const moved = useRef(false);
  useEffect(() => {
    moved.current = false;
    setCursor(suggested);
    // Only when the day itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey]);
  useEffect(() => {
    if (!moved.current) setCursor(suggested);
  }, [suggested]);

  const answer = useCallback(
    (slot: number, status: SlotStatus) => {
      onVerdict(slot, status);
      seq.current += 1;
      setVerdict({ slot, status, seq: seq.current });
      // Straight on to the next one, so back-filling a day is A A D A rather
      // than a keypress and a reach between every block.
      if (status !== 'empty' && slot < blocks) {
        moved.current = true;
        setCursor(slot + 1);
      }
    },
    [blocks, onVerdict],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The one chord that works from anywhere, half-typed note included: you
      // reach for it precisely when you have forgotten what the other keys do,
      // and that is not the moment to also require the right thing be focused.
      // `code` as well as `key`, so a layout where / needs a modifier still hits.
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        (e.key === '/' || e.key === '?' || e.code === 'Slash')
      ) {
        setHelpOpen((v) => !v);
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') {
        setHelpOpen(false);
        return;
      }

      // Never fight the browser's own chords, and never eat a keystroke meant
      // for a note the user is in the middle of typing.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
      ) {
        return;
      }

      const move = (to: number) => {
        moved.current = true;
        setCursor(Math.max(1, Math.min(blocks, to)));
      };

      switch (e.key.toLowerCase()) {
        case 'a':
          answer(cursor, 'done');
          break;
        case 'd':
          answer(cursor, 'partial');
          break;
        case 's':
          answer(cursor, 'skipped');
          break;
        case 'u':
        case 'backspace':
          answer(cursor, 'empty');
          break;
        case 'j':
        case 'arrowdown':
          move(cursor + 1);
          break;
        case 'k':
        case 'arrowup':
          move(cursor - 1);
          break;
        case '?':
        case '/':
          setHelpOpen((v) => !v);
          break;
        default:
          return;
      }
      e.preventDefault();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answer, blocks, cursor]);

  // The flash is a moment, not a state.
  useEffect(() => {
    if (!verdict) return;
    const id = setTimeout(() => setVerdict(null), 1100);
    return () => clearTimeout(id);
  }, [verdict]);

  return { cursor, verdict, helpOpen, setHelpOpen };
}
