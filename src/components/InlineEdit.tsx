/**
 * Click-to-edit text. Renders as plain text until you click it, then swaps to
 * an input in place, commits on blur or Enter, and reverts on Escape.
 *
 * The point is that a day full of blocks reads as *text*, not as a form full of
 * boxes — the chrome only appears where you're actually typing.
 */

import { useEffect, useRef, useState } from 'react';

export function InlineEdit({
  value,
  placeholder,
  onCommit,
  className = '',
  inputClassName = '',
  ariaLabel,
  multilineHint,
  /** Renders the resting text through this, e.g. to strike out a skipped block. */
  display,
  /** Opens in edit mode immediately — used for freshly added notes. */
  autoEdit = false,
}: {
  value: string;
  placeholder: string;
  onCommit: (next: string) => void;
  className?: string;
  inputClassName?: string;
  ariaLabel: string;
  multilineHint?: boolean;
  display?: (value: string) => React.ReactNode;
  autoEdit?: boolean;
}) {
  const [editing, setEditing] = useState(autoEdit);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Adopt external changes (day switch, import) while not mid-edit.
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next !== value) onCommit(next);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={`inline-edit__input ${inputClassName}`}
        value={draft}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={`inline-edit ${value ? '' : 'inline-edit--empty'} ${className}`}
      onClick={() => setEditing(true)}
      aria-label={`${ariaLabel}${value ? `: ${value}` : ' (empty)'} — click to edit`}
      title={multilineHint ? value : undefined}
    >
      {value ? (display ? display(value) : value) : <span className="inline-edit__ph">{placeholder}</span>}
    </button>
  );
}
