/**
 * One focus block: number, checkbox, comment, mood.
 * Clicking the box cycles status the way the notes do it by hand; clicking the
 * comment turns it into an input in place.
 */

import { useEffect, useRef, useState } from 'react';
import { MOODS, type Slot, type SlotStatus } from '../lib/types';
import { InlineEdit } from './InlineEdit';

const ORDER: SlotStatus[] = ['empty', 'done', 'partial', 'skipped'];

const STATUS_LABEL: Record<SlotStatus, string> = {
  empty: 'Unclaimed',
  done: 'Clean',
  partial: 'Dirty',
  skipped: 'Skipped',
};

const STATUS_MARK: Record<SlotStatus, string> = {
  empty: '',
  done: '✓',
  partial: '◐',
  skipped: '✕',
};

export function SlotRow({
  slot,
  active,
  onCycle,
  onStatus,
  ghost,
  onNote,
  onMood,
}: {
  slot: Slot;
  /** True when the running timer is currently filling this block. */
  active: boolean;
  onCycle: () => void;
  onStatus: (status: SlotStatus) => void;
  /**
   * What the shadow did with this same hour. Sits beside your own box so the
   * comparison is where the decision is, not in a panel across the page.
   */
  ghost?: { status: SlotStatus | null; name: string } | null;
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
    <div className={`slot slot--${slot.status} ${active ? 'slot--active' : ''}`}>
      <span className="slot__index" aria-hidden>
        {slot.index}
      </span>

      <button
        className="slot__box"
        onClick={onCycle}
        onContextMenu={(e) => {
          // Right-click steps backwards, so an overshoot is one click to fix.
          e.preventDefault();
          onStatus(ORDER[(ORDER.indexOf(slot.status) + ORDER.length - 1) % ORDER.length]);
        }}
        aria-label={`Block ${slot.index}: ${STATUS_LABEL[slot.status]}`}
        title={STATUS_LABEL[slot.status]}
      >
        {STATUS_MARK[slot.status]}
      </button>

      {/* The shadow's own answer for this hour, hollow so it never reads as
          yours. Blank where the pace has no opinion about the block. */}
      <span
        className={`slot__ghost slot__ghost--${ghost?.status ?? 'none'} ${
          ghost?.status && ghost.status !== slot.status ? 'slot__ghost--differs' : ''
        }`}
        title={ghost?.status ? `${ghost.name}: ${STATUS_LABEL[ghost.status]}` : undefined}
        aria-hidden
      >
        {ghost?.status ? STATUS_MARK[ghost.status] : ''}
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
