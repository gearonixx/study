/**
 * One focus block: number, checkbox, comment.
 * Clicking the box cycles status the way the notes do it by hand; clicking the
 * comment turns it into an input in place.
 */

import { type Slot, type SlotStatus } from '../lib/types';
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
  label,
  active,
  onCycle,
  onStatus,
  onNote,
}: {
  slot: Slot;
  /**
   * The number shown in the row: the block's position *within its round*. The
   * slot keeps its day-wide index — that is its identity, and what the vault
   * and every merge are keyed on — but a round is the unit the day is lived in,
   * so it is the round's count that goes on screen.
   */
  label: number;
  /** True when the running timer is currently filling this block. */
  active: boolean;
  onCycle: () => void;
  onStatus: (status: SlotStatus) => void;
  onNote: (note: string) => void;
}) {


  return (
    <div className={`slot slot--${slot.status} ${active ? 'slot--active' : ''}`}>
      <span className="slot__index" aria-hidden title={`Block ${slot.index} of the day`}>
        {label}
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

      <InlineEdit
        value={slot.note}
        placeholder={active ? 'running…' : ''}
        onCommit={onNote}
        ariaLabel={`Comment on block ${slot.index}`}
        className="slot__note"
        inputClassName="slot__note-input"
      />

    </div>
  );
}
