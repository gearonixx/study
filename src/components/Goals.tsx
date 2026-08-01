/**
 * The long game.
 *
 * Everything else in this app is about one day — an hour that opens at a fixed
 * time, a verdict owed by tonight, a graph of what you actually put in. This
 * page is the only one measured in years, and it exists so the day cannot
 * quietly become the point. "Become top 1%" is not a block you can sit; it is
 * the reason for sitting several thousand of them.
 *
 * There is no progress bar and no percentage, deliberately. A multi-year aim
 * has no honest completion figure, and inventing one would be the same lie as
 * a made-up leaderboard: it would feel like information and be nothing of the
 * sort. An aim is either still ahead of you or it is reached, and the date it
 * was reached on is the only number worth keeping.
 */

import { useState } from 'react';
import { useStore } from '../lib/store';
import { formatLong } from '../lib/date';
import { InlineEdit } from './InlineEdit';
import { Button, Card, Empty, TextInput } from './ui';

export function Goals() {
  const { db, dispatch } = useStore();
  const [text, setText] = useState('');
  const [by, setBy] = useState('');

  const open = db.ambitions.filter((a) => !a.reachedAt);
  const reached = db.ambitions.filter((a) => a.reachedAt);

  const add = () => {
    if (!text.trim()) return;
    dispatch({ type: 'addAmbition', text, by });
    setText('');
    setBy('');
  };

  return (
    <div className="stack-lg">
      <Card title="The long game">
        <p className="muted small aims__preamble">
          What the hours are for. Years, not days — nothing here opens at 10:00, goes red at
          midnight or asks you for a verdict. Write them plainly: “become top 1%”, “ICPC finals”,
          “fluent enough to work in it”.
        </p>

        <div className="aim-new">
          <TextInput
            value={text}
            placeholder="become top 1%"
            aria-label="The aim"
            className="aim-new__text"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add();
            }}
          />
          <TextInput
            value={by}
            placeholder="by when — 2028, optional"
            aria-label="Horizon"
            className="aim-new__by"
            onChange={(e) => setBy(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add();
            }}
          />
          <Button variant="primary" onClick={add} disabled={!text.trim()}>
            Set it
          </Button>
        </div>
      </Card>

      <Card title={`Ahead of you${open.length ? ` — ${open.length}` : ''}`}>
        {open.length === 0 ? (
          <Empty
            icon="★"
            title="Nothing set yet."
            hint="One line is enough. It does not have to be reasonable."
          />
        ) : (
          <ul className="aims">
            {open.map((a) => (
              <li key={a.id} className="aim">
                <button
                  className="aim__mark"
                  title="Mark it reached"
                  aria-label={`Mark reached: ${a.text}`}
                  onClick={() => dispatch({ type: 'reachAmbition', id: a.id, reached: true })}
                />
                <div className="aim__body">
                  <InlineEdit
                    value={a.text}
                    placeholder="the aim"
                    ariaLabel="The aim"
                    className="aim__text"
                    onCommit={(v) => {
                      // Blanking an aim is not how you drop one — that is what
                      // the × is for, and it does not happen by a stray Enter.
                      if (v.trim()) dispatch({ type: 'editAmbition', id: a.id, patch: { text: v } });
                    }}
                  />
                  <InlineEdit
                    value={a.by}
                    placeholder="by when"
                    ariaLabel="Horizon"
                    className="aim__by"
                    onCommit={(v) => dispatch({ type: 'editAmbition', id: a.id, patch: { by: v } })}
                  />
                </div>
                <span className="aim__set">set {formatLong(isoOf(a.createdAt))}</span>
                <button
                  className="aim__drop"
                  title="Remove"
                  aria-label={`Remove: ${a.text}`}
                  onClick={() => dispatch({ type: 'removeAmbition', id: a.id })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {reached.length > 0 && (
        <Card title={`Reached — ${reached.length}`}>
          <ul className="aims">
            {reached.map((a) => (
              <li key={a.id} className="aim aim--reached">
                <button
                  className="aim__mark aim__mark--on"
                  title="Put it back"
                  aria-label={`Un-reach: ${a.text}`}
                  onClick={() => dispatch({ type: 'reachAmbition', id: a.id, reached: false })}
                >
                  ★
                </button>
                <div className="aim__body">
                  <span className="aim__text">{a.text}</span>
                </div>
                <span className="aim__set">
                  reached {formatLong(isoOf(a.reachedAt as number))}
                </span>
                <button
                  className="aim__drop"
                  title="Remove"
                  aria-label={`Remove: ${a.text}`}
                  onClick={() => dispatch({ type: 'removeAmbition', id: a.id })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** `formatLong` speaks in date keys, and these are stamped in epoch ms. */
function isoOf(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
