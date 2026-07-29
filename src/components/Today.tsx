/**
 * The main page: one day, ten blocks in two stages, the BRIDGE between them,
 * goals over ranges of blocks, loose side notes, and the schedule driving it all.
 */

import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { addDays, formatLong, formatRelative, todayKey } from '../lib/date';
import { useFocusTimer } from '../lib/timer';
import { lapsedBlocks, stageWindow } from '../lib/schedule';
import { BRIDGE_AFTER, dayHours, SLOTS_PER_DAY, type Day, type Goal } from '../lib/types';
import { toMarkdown } from '../lib/mdParse';
import { SlotRow } from './SlotRow';
import { InlineEdit } from './InlineEdit';
import { FocusTimer } from './FocusTimer';
import { ContributionGraph } from './ContributionGraph';
import { Button, Card, Meter, num } from './ui';

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

/** The 1-based block each stage opens on. Stage goals anchor here. */
function stageStart(stage: number): number {
  return stage === 1 ? 1 : BRIDGE_AFTER + 1;
}

function stageGoalOf(day: Day, stage: number): Goal | null {
  return day.goals.find((g) => g.startSlot === stageStart(stage)) ?? null;
}

/** True once both stages of a day have been written. */
function planned(day: Day | undefined): boolean {
  return !!day && !!stageGoalOf(day, 1) && !!stageGoalOf(day, 2);
}

/**
 * The goal for a stage, written the day before and frozen after that.
 *
 * The whole point is that you decide what tomorrow is for while tonight is
 * still running — not at 10:00 tomorrow, with the block already open. So the
 * field is live on exactly one day, the day before, and reads as plain text
 * for the rest of time.
 */
function StageGoal({
  stage,
  goal,
  editable,
  onCommit,
}: {
  stage: number;
  goal: Goal | null;
  editable: boolean;
  onCommit: (text: string) => void;
}) {
  const text = goal ? goal.detail || goal.label : '';

  if (!editable) {
    return (
      <div className={`stage-goal stage-goal--locked ${text ? '' : 'stage-goal--unset'}`}>
        <span className="stage-goal__tag">Stage {stage}</span>
        <span className="stage-goal__text" title={text ? 'Locked — set the day before' : undefined}>
          {text || 'no goal set'}
        </span>
      </div>
    );
  }

  return (
    <div className="stage-goal stage-goal--open">
      <span className="stage-goal__tag">Stage {stage}</span>
      <InlineEdit
        value={text}
        placeholder={`what stage ${stage} is for`}
        ariaLabel={`Goal for stage ${stage}`}
        className="stage-goal__text"
        inputClassName="stage-goal__input"
        onCommit={onCommit}
      />
    </div>
  );
}

export function Today() {
  const { db, day, dispatch, activeDate, setActiveDate } = useStore();
  const [copied, setCopied] = useState(false);

  const timer = useFocusTimer({
    notifications: db.settings.notifications,
    sound: db.settings.sound,
  });

  // An hour you never answered for is an hour you lost: an hour after a block
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

  // The timer always speaks for today, even while an older day is on screen.
  const todayStatuses = (db.days[todayKey()] ?? day).slots.map((s) => s.status);

  // Goals are written the day before and locked from then on.
  const tomorrow = addDays(todayKey(), 1);
  const planningOpen = activeDate === tomorrow;
  const setStageGoal = (stage: number, text: string) => {
    const existing = stageGoalOf(day, stage);
    if (!text) {
      if (existing) dispatch({ type: 'removeGoal', date: activeDate, id: existing.id });
      return;
    }
    dispatch({
      type: 'addGoal',
      date: activeDate,
      startSlot: stageStart(stage),
      label: deriveLabel(text),
      detail: text,
    });
  };

  // The window closes at midnight, so the nag runs from block 9 to the end of
  // the day — the last stretch where anything can still be decided.
  const nagging =
    !planned(db.days[tomorrow]) &&
    (timer.now.phase === 'after' ||
      (timer.now.block !== null && timer.now.block >= SLOTS_PER_DAY - 1));

  const copyMarkdown = async () => {
    await navigator.clipboard.writeText(toMarkdown(day));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const renderBlock = (from: number, to: number) => {
    const rows = [];
    for (let i = from; i <= to; i++) {
      const slot = day.slots[i - 1];
      // Stage goals are drawn above their stage; only an imported goal anchored
      // mid-stage still needs a band inside the list.
      const goalHere = day.goals.find(
        (g) => g.startSlot === i && i !== 1 && i !== BRIDGE_AFTER + 1,
      );

      if (goalHere) {
        rows.push(
          <div className="goal-band" key={`goal-${goalHere.id}`}>
            <span className={`chip chip--c${goalHere.color}`}>{goalHere.label}</span>
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
      {nagging && isToday && (
        <div className="plan-nag">
          <div className="plan-nag__text">
            <strong>Tomorrow has no goals.</strong>
            <span>
              Blocks {SLOTS_PER_DAY - 1} and {SLOTS_PER_DAY} are the window — at midnight both
              stages lock empty.
            </span>
          </div>
          <Button size="sm" variant="primary" onClick={() => setActiveDate(tomorrow)}>
            Plan tomorrow
          </Button>
        </div>
      )}

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

          <StageGoal
            stage={1}
            goal={stageGoalOf(day, 1)}
            editable={planningOpen}
            onCommit={(text) => setStageGoal(1, text)}
          />

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

          <StageGoal
            stage={2}
            goal={stageGoalOf(day, 2)}
            editable={planningOpen}
            onCommit={(text) => setStageGoal(2, text)}
          />

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
        <Card>
          <FocusTimer timer={timer} statuses={todayStatuses} />
        </Card>
        </aside>
      </div>

      {/* Same order as a GitHub profile: the day's work first, the year of it
          underneath. */}
      <Card title="Study graph" padded={false}>
        <ContributionGraph db={db} onPick={setActiveDate} />
      </Card>

    </div>
  );
}
