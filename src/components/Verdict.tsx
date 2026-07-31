/**
 * The verdict, the moment it lands.
 *
 * A checkbox going green is not an event. A verdict is — you handed in an hour
 * and it came back one way or the other, and the difference should be felt for
 * a second rather than merely displayed. Accepted is green and over quickly;
 * dirty is red, sits a beat longer, and does not congratulate you.
 */

import type { SlotStatus } from '../lib/types';
import { SLOT_KEYS, type Verdict as VerdictState } from '../lib/useSlotKeys';

/**
 * Deliberately not a matched pair.
 *
 * A clean hour comes back ACCEPTED — the judge's word, because clearing an hour
 * should feel like clearing something. A spoiled one is just DIRTY: the day's
 * own word, plain, with nothing borrowed to dress it up. The reward gets the
 * ceremony; the failure gets called what it is.
 */
const WORDS: Record<SlotStatus, { text: string; sub: string } | null> = {
  done: { text: 'ACCEPTED', sub: 'the hour was clean' },
  partial: { text: 'DIRTY', sub: 'the hour was spoiled' },
  idle: { text: 'IDLENESS LIMIT EXCEEDED', sub: 'the hour opened without you' },
  skipped: { text: 'SKIPPED', sub: 'the hour is gone' },
  empty: null,
};

export function VerdictFlash({ verdict }: { verdict: VerdictState | null }) {
  const words = verdict ? WORDS[verdict.status] : null;
  if (!verdict || !words) return null;
  return (
    <div className={`verdict verdict--${verdict.status}`} key={verdict.seq} role="status">
      <span className="verdict__text">{words.text}</span>
      <span className="verdict__sub">
        block {verdict.slot} — {words.sub}
      </span>
    </div>
  );
}

/** The keys themselves, stated once above the blocks. */
export function VerdictLegend({ onHelp }: { onHelp: () => void }) {
  return (
    <div className="keybar">
      {SLOT_KEYS.map((k) => (
        <span className="keybar__item" key={k.key}>
          <kbd>{k.key}</kbd>
          <span>{k.label}</span>
        </span>
      ))}
      <button
        className="keybar__help"
        onClick={onHelp}
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts (Ctrl + /)"
      >
        ?
      </button>
    </div>
  );
}

export function VerdictHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="kmodal" role="dialog" aria-label="Keyboard shortcuts" onClick={onClose}>
      <div className="kmodal__panel" onClick={(e) => e.stopPropagation()}>
        <h3>Answering for a block</h3>
        <p className="muted small">
          There is no checkbox. The cursor sits on the block waiting for an answer — usually the
          one that just ended — and you type the verdict.
        </p>
        <dl className="kmodal__keys">
          <dt>
            <kbd>A</kbd>
          </dt>
          <dd>
            <strong>Accepted</strong> — the hour was clean
          </dd>
          <dt>
            <kbd>D</kbd>
          </dt>
          <dd>
            <strong>Dirty</strong> — the hour was spoiled
          </dd>
          <dt>
            <kbd>S</kbd>
          </dt>
          <dd>Skipped — you did not sit it</dd>
          <dt>
            <kbd>U</kbd> <kbd>⌫</kbd>
          </dt>
          <dd>Undo — take the verdict back</dd>
          <dt>
            <kbd>J</kbd> <kbd>K</kbd>
          </dt>
          <dd>Move the cursor (or ↓ ↑)</dd>
          <dt>
            <kbd>Ctrl</kbd> <kbd>/</kbd> <kbd>?</kbd>
          </dt>
          <dd>This panel. Ctrl + / reaches it from anywhere, mid-note included.</dd>
        </dl>
        <p className="muted small">
          A verdict moves the cursor on by itself, so a whole day back-fills as
          <kbd>A</kbd> <kbd>A</kbd> <kbd>D</kbd> <kbd>A</kbd> without a reach in between.
        </p>
        <button className="btn btn--sm" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
