/**
 * One focus block: number, verdict, comment, mood.
 *
 * The verdict is not a control. It used to be a checkbox you cycled with the
 * mouse, and that was the wrong shape for what it records — an hour of your
 * life is answered for, not ticked. It is typed now (see `useSlotKeys`), and
 * what sits here is the standing of the block, the way a submissions table
 * shows a verdict rather than offering you one.
 */

import { useEffect, useRef, useState } from 'react';
import { MOODS, type Slot, type SlotStatus } from '../lib/types';
import { InlineEdit } from './InlineEdit';

const STATUS_LABEL: Record<SlotStatus, string> = {
  empty: 'Unclaimed',
  done: 'Clean',
  partial: 'Dirty',
  idle: 'Idleness limit exceeded — you were not here',
  skipped: 'Skipped',
};

const STATUS_MARK: Record<SlotStatus, string> = {
  empty: '',
  done: '✓',
  partial: '◐',
  idle: '⊘',
  skipped: '✕',
};

export function SlotRow({
  slot,
  active,
  cursor,
  flash,
  onNote,
  onMood,
}: {
  slot: Slot;
  /** True when the running timer is currently filling this block. */
  active: boolean;
  /** True when this is the block the keyboard is pointed at. */
  cursor: boolean;
  /** Set for a moment after a verdict lands on this block. */
  flash: SlotStatus | null;
  onNote: (note: string) => void;
  onMood: (mood: string) => void;
}) {
  const [moodOpen, setMoodOpen] = useState(false);
  const moodRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moodOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!moodRef.current?.contains(e.target as Node)) setMoodOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [moodOpen]);

  return (
    <div
      className={`slot slot--${slot.status} ${active ? 'slot--active' : ''} ${
        cursor ? 'slot--cursor' : ''
      } ${flash ? `slot--flash slot--flash-${flash}` : ''}`}
      aria-current={cursor ? 'true' : undefined}
    >
      <span className="slot__index" aria-hidden>
        {slot.index}
      </span>

      <span
        className="slot__box"
        role="img"
        aria-label={`Block ${slot.index}: ${STATUS_LABEL[slot.status]}`}
        title={STATUS_LABEL[slot.status]}
      >
        {STATUS_MARK[slot.status]}
      </span>

      <InlineEdit
        value={slot.note}
        placeholder={active ? 'running…' : ''}
        onCommit={onNote}
        ariaLabel={`Comment on block ${slot.index}`}
        className="slot__note"
        inputClassName="slot__note-input"
      />

      <div className="slot__mood" ref={moodRef}>
        <button
          className={`mood-btn ${slot.mood ? 'mood-btn--set' : ''}`}
          onClick={() => setMoodOpen((v) => !v)}
          aria-label={`Mood for block ${slot.index}`}
        >
          {slot.mood || '·'}
        </button>
        {moodOpen && (
          <div className="mood-pop" role="menu">
            {MOODS.map((m) => (
              <button
                key={m.emoji}
                className="mood-pop__item"
                title={m.label}
                onClick={() => {
                  onMood(slot.mood === m.emoji ? '' : m.emoji);
                  setMoodOpen(false);
                }}
              >
                {m.emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
