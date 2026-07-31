/**
 * The main page: one day, ten blocks in two rounds, the BRIDGE between them,
 * goals over ranges of blocks, loose side notes, and the schedule driving it all.
 */

import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { addDays, formatLong, formatRelative } from '../lib/date';
import { useFocusTimer, useIsAnnouncer } from '../lib/timer';
import { awaitingVerdict, useSlotKeys } from '../lib/useSlotKeys';
import { IN_EXTENSION } from '../ext/bridge';
import { bridgeLabel, lapsedBlocks, runningSchedule, roundWindow } from '../lib/schedule';
import { blocksOf, dayHours, shapeOf, roundStart, type Day, type Goal } from '../lib/types';
import { SlotRow } from './SlotRow';
import { VerdictFlash, VerdictHelp, VerdictLegend } from './Verdict';
import { DayShot } from './DayShot';
import { InlineEdit } from './InlineEdit';
import { FocusTimer } from './FocusTimer';
import { ContributionGraph, hoursOf } from './ContributionGraph';
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

function roundGoalOf(day: Day, round: number): Goal | null {
  return day.goals.find((g) => g.startSlot === roundStart(shapeOf(day), round)) ?? null;
}

/** True once the first two rounds of a day have been written. */
function planned(day: Day | undefined): boolean {
  return !!day && !!roundGoalOf(day, 1) && !!roundGoalOf(day, 2);
}

/**
 * The goal for a round, written the day before and frozen after that.
 *
 * The whole point is that you decide what tomorrow is for while tonight is
 * still running — not at 10:00 tomorrow, with the block already open. So the
 * field is live on exactly one day, the day before, and reads as plain text
 * for the rest of time.
 */
function RoundGoal({
  round,
  goal,
  editable,
  onCommit,
}: {
  round: number;
  goal: Goal | null;
  editable: boolean;
  onCommit: (text: string) => void;
}) {
  const text = goal ? goal.detail || goal.label : '';

  if (!editable) {
    return (
      <div className={`round-goal round-goal--locked ${text ? '' : 'round-goal--unset'}`}>
        <span className="round-goal__tag">Round {round}</span>
        <span className="round-goal__text" title={text ? 'Locked — set the day before' : undefined}>
          {text || '[empty]'}
        </span>
      </div>
    );
  }

  return (
    <div className="round-goal round-goal--open">
      <span className="round-goal__tag">Round {round}</span>
      <InlineEdit
        value={text}
        placeholder={`what round ${round} is for`}
        ariaLabel={`Goal for round ${round}`}
        className="round-goal__text"
        inputClassName="round-goal__input"
        onCommit={onCommit}
      />
    </div>
  );
}

export function Today() {
  const { db, day, dispatch, activeDate, setActiveDate } = useStore();
  const [shotOpen, setShotOpen] = useState(false);

  // A day already stamped outranks the setting, so a shape change syncing in
  // from another device can't switch the clock out from under a day in progress.
  const schedule = runningSchedule(db.days, db.settings.schedule);

  // Two gates on speaking, for two different ways of ending up with the same
  // announcement twice. Inside the extension the background page owns them
  // outright — it reaches you with no tab open. On the web, every open copy of
  // the app runs its own clock, so they elect one to do the talking. The ring
  // is drawn either way.
  const announcer = useIsAnnouncer();
  const speaks = announcer && !IN_EXTENSION;
  const timer = useFocusTimer({
    notifications: db.settings.notifications && speaks,
    sound: db.settings.sound && speaks,
    schedule,
  });

  // The day on screen is shaped by what it was recorded under; the one running
  // right now follows the setting until it is first written to.
  const isToday = activeDate === timer.now.dayKey;
  const shape = shapeOf(day, isToday ? schedule : 'standard');

  // An hour you never answered for is an hour you lost: an hour after a block
  // closes, an untouched one goes red on its own. Only ever today's blocks —
  // history is never rewritten behind the user's back.
  useEffect(() => {
    const sweep = () => {
      const today = timer.now.dayKey;
      const current = db.days[today];
      for (const block of lapsedBlocks(Date.now(), schedule)) {
        if ((current?.slots[block - 1]?.status ?? 'empty') === 'empty') {
          // `auto` — this is the clock's inference, not the user's answer, and
          // a merge must never let it overwrite what another device recorded.
          dispatch({ type: 'setStatus', date: today, slot: block, status: 'skipped', auto: true });
        }
      }
    };
    sweep();
    const id = setInterval(sweep, 30_000);
    return () => clearInterval(id);
  }, [db.days, schedule, dispatch, timer.now.dayKey]);

  const hours = dayHours(day);
  const goal = Math.min(db.settings.dailyGoal || blocksOf(shape), blocksOf(shape));

  // Every block sat through counts as its full hour in the total, clean or
  // dirty; the rest of the day is simply gone, whether it was claimed as
  // skipped or never answered for at all.
  const tally = (() => {
    const clean = day.slots.filter((s) => s.status === 'done').length;
    const dirty = day.slots.filter((s) => s.status === 'partial').length;
    const total = clean + dirty;
    return { dirty, total, skipped: blocksOf(shape) - total };
  })();

  // The timer always speaks for today, even while an older day is on screen.
  const todayStatuses = (db.days[timer.now.dayKey] ?? day).slots.map((s) => s.status);

  // Blocks are answered for from the keyboard and nowhere else. The cursor
  // starts on the block that is actually waiting — normally the one that just
  // ended — so the common case is a single keypress with no aiming.
  const statuses = day.slots.map((s) => s.status);
  const keys = useSlotKeys({
    blocks: blocksOf(shape),
    dayKey: activeDate,
    suggested: awaitingVerdict(
      statuses,
      isToday ? timer.now.elapsedBlocks : blocksOf(shape),
      isToday ? timer.now.block : null,
    ),
    onVerdict: (slot, status) =>
      dispatch({ type: 'setStatus', date: activeDate, slot, status }),
  });

  // Goals are written the day before and locked from then on.
  const tomorrow = addDays(timer.now.dayKey, 1);
  const planningOpen = activeDate === tomorrow;
  const setRoundGoal = (round: number, text: string) => {
    const existing = roundGoalOf(day, round);
    if (!text) {
      if (existing) dispatch({ type: 'removeGoal', date: activeDate, id: existing.id });
      return;
    }
    dispatch({
      type: 'addGoal',
      date: activeDate,
      startSlot: roundStart(shape, round),
      label: deriveLabel(text),
      detail: text,
    });
  };

  // The window closes at midnight, so the nag runs from block 9 to the end of
  // the day — the last stretch where anything can still be decided.
  const nagging =
    !planned(db.days[tomorrow]) &&
    (timer.now.phase === 'after' ||
      (timer.now.block !== null && timer.now.block >= blocksOf(shape) - 1));

  const renderBlock = (from: number, to: number) => {
    const rows = [];
    for (let i = from; i <= to; i++) {
      // A day that predates the shape it is now being run under is shorter than
      // the loop: the missing blocks read as unanswered until one is written to.
      const slot = day.slots[i - 1] ?? { index: i, status: 'empty' as const, note: '', mood: '' };
      // Round goals are drawn above their round; only an imported goal anchored
      // mid-round still needs a band inside the list.
      const goalHere = day.goals.find(
        (g) => g.startSlot === i && !shape.rounds.some((_, n) => roundStart(shape, n + 1) === i),
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
          cursor={keys.cursor === i}
          flash={keys.verdict?.slot === i ? keys.verdict.status : null}
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
              Blocks {blocksOf(shape) - 1} and {blocksOf(shape)} are the window. At midnight both
              rounds lock empty.
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
              <span className="day-head__actions">
                {/* The day is worth handing to someone once it is over — or
                    mid-way, if you want to show where you are. */}
                <Button size="sm" onClick={() => setShotOpen(true)}>
                  Screenshot
                </Button>
                {!isToday && (
                  <Button size="sm" onClick={() => setActiveDate(timer.now.dayKey)}>
                    Today
                  </Button>
                )}
              </span>
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

          {/* Stated above the blocks, because there is nothing to click and no
              way to discover the keys by poking at the row. */}
          <VerdictLegend onHelp={() => keys.setHelpOpen(true)} />

          {shape.rounds.map((count, i) => {
            const round = i + 1;
            const first = roundStart(shape, round);
            const editableWindow = round <= 2;
            return (
              <div key={round}>
                {/* Every round after the first opens with the BRIDGE that led
                    into it — the day changing gear, not just another break. The
                    nth round opens on the (n-1)th bridge. */}
                {round > 1 && (
                  <div className="bridge">
                    <span className="bridge__line" />
                    <span className="bridge__label">{bridgeLabel(round - 1)}</span>
                    <span className="bridge__line" />
                  </div>
                )}

                <RoundGoal
                  round={round}
                  goal={roundGoalOf(day, round)}
                  editable={planningOpen}
                  onCommit={(text) => setRoundGoal(round, text)}
                />

                <div className="window-row">
                  {editableWindow ? (
                    <InlineEdit
                      value={round === 1 ? day.windowTop : day.windowBottom}
                      placeholder={roundWindow(round, Date.now(), shape.id)}
                      ariaLabel={`Round ${round} window`}
                      className="window"
                      inputClassName="window-input"
                      onCommit={(value) =>
                        dispatch({
                          type: 'setWindow',
                          date: activeDate,
                          which: round === 1 ? 'top' : 'bottom',
                          value,
                        })
                      }
                    />
                  ) : (
                    // Rounds past the second have no stored window; they simply
                    // run on the clock.
                    <span className="window">{roundWindow(round, Date.now(), shape.id)}</span>
                  )}
                </div>

                <div className="slots">{renderBlock(first, first + count - 1)}</div>
              </div>
            );
          })}

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
              {/* An hour that is gone is a failure, whether it was claimed as
                  one or simply never answered for. */}
              <span>Failed</span>
              <strong>{tally.skipped}h</strong>
            </div>
          </div>
        </Card>
      </div>

      <aside className="today__side">
        <Card>
          <FocusTimer
            timer={timer}
            statuses={todayStatuses}
            schedule={schedule}
            onSchedule={(id) => dispatch({ type: 'setSettings', patch: { schedule: id } })}
          />
        </Card>
        </aside>
      </div>

      {/* Same order as a GitHub profile: the day's work first, the year of it
          underneath. */}
      <Card title="Overview" padded={false}>
        <ContributionGraph hours={hoursOf(db)} onPick={setActiveDate} />
      </Card>

      {shotOpen && (
        <DayShot
          day={day}
          shape={shape}
          schedule={schedule}
          dailyGoal={db.settings.dailyGoal}
          onClose={() => setShotOpen(false)}
        />
      )}

      <VerdictFlash verdict={keys.verdict} />
      {keys.helpOpen && <VerdictHelp onClose={() => keys.setHelpOpen(false)} />}
    </div>
  );
}
