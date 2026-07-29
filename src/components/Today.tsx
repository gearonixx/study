/**
 * The main page: one day, ten blocks in two stages, the BRIDGE between them,
 * goals over ranges of blocks, loose side notes, and the schedule driving it all.
 */

import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { addDays, formatLong, formatRelative, todayKey } from '../lib/date';
import { useFocusTimer } from '../lib/timer';
import { lapsedBlocks, stageWindow } from '../lib/schedule';
import { BRIDGE_AFTER, dayHours, SLOTS_PER_DAY } from '../lib/types';
import { toMarkdown } from '../lib/mdParse';
import { SlotRow } from './SlotRow';
import { InlineEdit } from './InlineEdit';
import { FocusTimer } from './FocusTimer';
import { ContributionGraph } from './ContributionGraph';
import { Button, Card, Meter, Modal, TextInput, num } from './ui';

/**
 * Squeezes an arbitrary task into something that fits on a chip: an existing
 * short label passes through untouched, longer prose gets its first couple of
 * words. "revise linear algebra" → "revise linear".
 */
function deriveLabel(task: string): string {
  const clean = task.trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  if (clean.length <= 14) return clean;
  const words = clean.split(' ');
  let out = words[0];
  for (const w of words.slice(1)) {
    if (`${out} ${w}`.length > 14) break;
    out += ` ${w}`;
  }
  return out.length > 14 ? `${out.slice(0, 13)}…` : out;
}

export function Today() {
  const { db, day, dispatch, activeDate, setActiveDate } = useStore();
  const [goalDraft, setGoalDraft] = useState<{ startSlot: number; label: string; detail: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const timer = useFocusTimer({
    notifications: db.settings.notifications,
    sound: db.settings.sound,
  });

  // An hour you never answered for is an hour you lost: two hours after a block
  // closes, an untouched one goes red on its own. Only ever today's blocks —
  // history is never rewritten behind the user's back.
  useEffect(() => {
    const sweep = () => {
      const today = todayKey();
      const current = db.days[today];
      for (const block of lapsedBlocks(Date.now())) {
        if ((current?.slots[block - 1]?.status ?? 'empty') === 'empty') {
          dispatch({ type: 'setStatus', date: today, slot: block, status: 'skipped' });
        }
      }
    };
    sweep();
    const id = setInterval(sweep, 30_000);
    return () => clearInterval(id);
  }, [db.days, dispatch]);

  const hours = dayHours(day);
  const goal = db.settings.dailyGoal || SLOTS_PER_DAY;

  // Every block sat through counts as its full hour in the total, clean or
  // dirty; the rest of the day is simply gone, whether it was claimed as
  // skipped or never answered for at all.
  const tally = (() => {
    const clean = day.slots.filter((s) => s.status === 'done').length;
    const dirty = day.slots.filter((s) => s.status === 'partial').length;
    const total = clean + dirty;
    return { dirty, total, skipped: SLOTS_PER_DAY - total };
  })();
  const isToday = activeDate === todayKey();

  const copyMarkdown = async () => {
    await navigator.clipboard.writeText(toMarkdown(day));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const renderBlock = (from: number, to: number) => {
    const rows = [];
    for (let i = from; i <= to; i++) {
      const slot = day.slots[i - 1];
      const goalHere = day.goals.find((g) => g.startSlot === i);

      if (goalHere) {
        rows.push(
          <div className="goal-band" key={`goal-${goalHere.id}`}>
            <button
              className={`chip chip--c${goalHere.color}`}
              onClick={() =>
                setGoalDraft({
                  startSlot: goalHere.startSlot,
                  label: goalHere.label,
                  detail: goalHere.detail,
                })
              }
            >
              {goalHere.label}
            </button>
            {goalHere.detail && <span className="goal-band__detail">{goalHere.detail}</span>}
            <button
              className="goal-band__x"
              onClick={() => dispatch({ type: 'removeGoal', date: activeDate, id: goalHere.id })}
              aria-label={`Remove goal ${goalHere.label}`}
            >
              ✕
            </button>
          </div>,
        );
      }

      rows.push(
        <SlotRow
          key={i}
          slot={slot}
          active={isToday && timer.now.phase === 'block' && timer.now.block === i}
          onCycle={() => dispatch({ type: 'cycleStatus', date: activeDate, slot: i })}
          onStatus={(status) => dispatch({ type: 'setStatus', date: activeDate, slot: i, status })}
          onNote={(note) => dispatch({ type: 'setNote', date: activeDate, slot: i, note })}
          onMood={(mood) => dispatch({ type: 'setMood', date: activeDate, slot: i, mood })}
        />,
      );

      for (const note of day.notes.filter((n) => n.afterSlot === i)) {
        rows.push(
          <div className="side-note" key={note.id}>
            <InlineEdit
              value={note.text}
              placeholder="note"
              autoEdit={note.text === ''}
              ariaLabel="Side note"
              className="side-note__text"
              inputClassName="side-note__input"
              onCommit={(text) =>
                text
                  ? dispatch({ type: 'updateNote', date: activeDate, id: note.id, text })
                  : dispatch({ type: 'removeNote', date: activeDate, id: note.id })
              }
            />
          </div>,
        );
      }
    }
    return rows;
  };

  return (
    <div className="today-page">
      <div className="today">
        <div className="today__main">
        <Card
          padded={false}
          title={
            <div className="day-head">
              <div className="day-head__nav">
                <button
                  className="icon-btn"
                  onClick={() => setActiveDate(addDays(activeDate, -1))}
                  aria-label="Previous day"
                >
                  ‹
                </button>
                <div>
                  <h2>{formatRelative(activeDate)}</h2>
                  <p className="day-head__date">{formatLong(activeDate)}</p>
                </div>
                <button
                  className="icon-btn"
                  onClick={() => setActiveDate(addDays(activeDate, 1))}
                  aria-label="Next day"
                >
                  ›
                </button>
              </div>
              {!isToday && (
                <Button size="sm" onClick={() => setActiveDate(todayKey())}>
                  Today
                </Button>
              )}
            </div>
          }
          action={
            <div className="day-head__actions">
              <Button size="sm" onClick={() => setGoalDraft({ startSlot: 1, label: '', detail: '' })}>
                Set goal
              </Button>
              <Button size="sm" variant="ghost" onClick={copyMarkdown}>
                {copied ? 'Copied' : 'Copy as .md'}
              </Button>
            </div>
          }
        >
          <div className="day-progress">
            <span className="day-progress__hours">
              <strong>{num(hours)}</strong>
              <span className="muted">/ {goal} h</span>
            </span>
            <Meter value={hours / goal} tone="success" label="Hours today" />
          </div>

          <div className="window-row">
            <InlineEdit
              value={day.windowTop}
              placeholder={stageWindow(1, Date.now())}
              ariaLabel="Stage 1 window"
              className="window"
              inputClassName="window-input"
              onCommit={(value) => dispatch({ type: 'setWindow', date: activeDate, which: 'top', value })}
            />
          </div>

          <div className="slots">{renderBlock(1, BRIDGE_AFTER)}</div>

          <button
            className="add-note"
            onClick={() => dispatch({ type: 'addNote', date: activeDate, afterSlot: BRIDGE_AFTER, text: '' })}
          >
            + note
          </button>

          <div className="bridge">
            <span className="bridge__line" />
            <span className="bridge__label">BRIDGE</span>
            <span className="bridge__line" />
          </div>

          <div className="window-row">
            <InlineEdit
              value={day.windowBottom}
              placeholder={stageWindow(2, Date.now())}
              ariaLabel="Stage 2 window"
              className="window"
              inputClassName="window-input"
              onCommit={(value) =>
                dispatch({ type: 'setWindow', date: activeDate, which: 'bottom', value })
              }
            />
          </div>

          <div className="slots">{renderBlock(BRIDGE_AFTER + 1, SLOTS_PER_DAY)}</div>

          <button
            className="add-note"
            onClick={() =>
              dispatch({ type: 'addNote', date: activeDate, afterSlot: SLOTS_PER_DAY, text: '' })
            }
          >
            + note
          </button>

          {/* The day's arithmetic, closed out. Total counts every hour that was
              actually sat through, clean or dirty; everything else is gone. */}
          <div className="day-total">
            <div className="day-total__row day-total__row--sum">
              <span>Total</span>
              <strong>{tally.total}h</strong>
            </div>
            <div className="day-total__row day-total__row--dirty">
              <span>Dirty</span>
              <strong>{tally.dirty}h</strong>
            </div>
            <div className="day-total__row day-total__row--skipped">
              <span>Skipped</span>
              <strong>{tally.skipped}h</strong>
            </div>
          </div>
        </Card>
      </div>

      <aside className="today__side">
        <Card title={isToday ? 'Focus' : 'Focus (today)'}>
          <FocusTimer timer={timer} />
        </Card>

        <Card title="Goals">
          {day.goals.length > 0 && (
            <ul className="goal-list">
              {day.goals.map((g) => {
                const next = day.goals.find((o) => o.startSlot > g.startSlot);
                const end = next ? next.startSlot - 1 : SLOTS_PER_DAY;
                const covered = day.slots
                  .slice(g.startSlot - 1, end)
                  .filter((s) => s.status === 'done' || s.status === 'partial').length;
                return (
                  <li key={g.id}>
                    <span className={`chip chip--c${g.color}`}>{g.label}</span>
                    <span className="goal-list__range">
                      {g.startSlot}–{end}
                    </span>
                    <span className="goal-list__count">
                      {covered}/{end - g.startSlot + 1}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="quick-tags">
            {db.settings.tags.map((tag) => (
              <button
                key={tag}
                className="chip chip--ghost"
                onClick={() =>
                  setGoalDraft({
                    startSlot: Math.min(Math.max(1, timer.now.nextBlock ?? SLOTS_PER_DAY), SLOTS_PER_DAY),
                    label: tag,
                    detail: '',
                  })
                }
              >
                + {tag}
              </button>
            ))}
          </div>
        </Card>
        </aside>
      </div>

      {/* Same order as a GitHub profile: the day's work first, the year of it
          underneath. */}
      <Card title="Study graph" padded={false}>
        <ContributionGraph db={db} onPick={setActiveDate} />
      </Card>

      <Modal
        open={goalDraft !== null}
        title="Set a goal"
        onClose={() => setGoalDraft(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setGoalDraft(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!goalDraft) return;
                const task = goalDraft.detail.trim();
                const label = goalDraft.label.trim() || deriveLabel(task);
                if (!label) return;
                dispatch({
                  type: 'addGoal',
                  date: activeDate,
                  startSlot: goalDraft.startSlot,
                  label,
                  // Don't repeat the task when the chip already says all of it.
                  detail: task === label ? '' : task,
                });
                setGoalDraft(null);
              }}
            >
              Save goal
            </Button>
          </>
        }
      >
        {goalDraft && (
          <div className="stack">
            <label className="field">
              <span className="field__label">Task</span>
              <TextInput
                autoFocus
                value={goalDraft.detail}
                placeholder="revise linear algebra · read chapter 3 · leetcode graphs · gym"
                onChange={(e) => setGoalDraft({ ...goalDraft, detail: e.target.value })}
              />
              <span className="field__hint">Anything you want these blocks spent on.</span>
            </label>
            <label className="field">
              <span className="field__label">Short label</span>
              <TextInput
                value={goalDraft.label}
                placeholder={deriveLabel(goalDraft.detail) || 'MATH'}
                onChange={(e) => setGoalDraft({ ...goalDraft, label: e.target.value })}
              />
              <span className="field__hint">
                Optional — shown as the chip on each block. Left blank, it's taken from the task.
              </span>
            </label>
            <label className="field">
              <span className="field__label">Applies from block</span>
              <select
                className="input"
                value={goalDraft.startSlot}
                onChange={(e) => setGoalDraft({ ...goalDraft, startSlot: Number(e.target.value) })}
              >
                {Array.from({ length: SLOTS_PER_DAY }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    Block {i + 1}
                    {i + 1 === BRIDGE_AFTER + 1 ? ' (after BRIDGE)' : ''}
                  </option>
                ))}
              </select>
              <span className="field__hint">
                Runs until the next goal starts, or to the end of the day.
              </span>
            </label>
          </div>
        )}
      </Modal>

    </div>
  );
}
