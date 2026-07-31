/**
 * The keyboard is the only way to answer for a block.
 *
 * There is no checkbox any more. An hour of your life is not a thing you tick
 * off with a cursor — it gets a verdict, the way a submission does, and you
 * type it. The two that matter are the two Codeforces has:
 *
 *   A   ACCEPTED       the block was clean
 *   W   WRONG ANSWER   the block was dirty
 *
 * Those letters rather than the obvious ones on purpose. `D` for dirty reads as
 * "done", which makes the two keys that matter most ambiguous at the exact
 * moment you are typing fast; and `T` on Codeforces is TLE, a failure, so it
 * cannot mean success here without inverting the whole metaphor. `A` and `W`
 * are the verdicts themselves, both under the left hand, neither reachable by
 * accident from the other.
 *
 * Everything else exists so the mouse is genuinely unnecessary: a cursor that
 * starts on the block actually waiting for an answer, J/K to move it, U to take
 * a verdict back.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SlotStatus } from './types';

/** What each key does, in the order the legend shows them. */
export const SLOT_KEYS: { key: string; label: string; status?: SlotStatus }[] = [
  { key: 'A', label: 'accepted', status: 'done' },
  { key: 'W', label: 'wrong answer', status: 'partial' },
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
      // Straight on to the next one, so back-filling a day is A A W A rather
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
        case 'w':
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
        case 'escape':
          setHelpOpen(false);
          return;
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
