/**
 * Guards the sync merge.
 *
 * On 2026-07-30 an afternoon of work was erased: a second device, left open
 * with a copy taken hours earlier, let its lapse sweep auto-skip two blocks,
 * stamped the day, and pushed. The merge took whole days by timestamp, so the
 * laptop's copy — two blocks marked done, a note on a third — was replaced
 * wholesale on its next load.
 *
 * Case 1 below is that exact incident, replayed from the two screenshots. The
 * rest pin down the properties a merge has to have for it not to happen again,
 * including the ones that stop the fix from over-correcting: a later answer
 * must still win, a deliberate clear must still clear, and a day only one side
 * has must survive in both directions.
 */

import { mergeDatabases } from '../src/lib/cloud';
import { emptyDay } from '../src/lib/types';
import type { Database, Day, Slot, SlotStatus } from '../src/lib/types';

const DATE = '2026-07-30';
const at = (h: number, m: number) => new Date(2026, 6, 30, h, m, 0).getTime();

function slot(index: number, status: SlotStatus, note = '', extra: Partial<Slot> = {}): Slot {
  return { index, status, note, mood: '', ...extra };
}

function day(updatedAt: number, slots: Slot[], date = DATE): Day {
  const base = emptyDay(date);
  return {
    ...base,
    slots: base.slots.map((s) => slots.find((x) => x.index === s.index) ?? s),
    updatedAt,
  };
}

function db(...days: Day[]): Database {
  return {
    version: 1,
    days: Object.fromEntries(days.map((d) => [d.date, d])),
    settings: {} as Database['settings'],
    unlocked: {},
  };
}

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${ok || !detail ? '' : `  — ${detail}`}`);
}

const get = (d: Database, i: number, date = DATE) => d.days[date].slots[i - 1];

/* 1. The incident, both sides written by the build that had no slot stamps. */
{
  const laptop = db(
    day(at(18, 5), [
      slot(1, 'skipped'), slot(2, 'skipped'), slot(3, 'skipped', 'overslept'), slot(4, 'skipped'),
      slot(5, 'done'), slot(6, 'done'),
      slot(10, 'empty', "don't forget userver - хотя бы отпиши ему"),
    ]),
  );
  const phone = db(
    day(at(18, 21), [
      slot(1, 'skipped'), slot(2, 'skipped'), slot(3, 'skipped', 'overslept'), slot(4, 'skipped'),
      slot(5, 'skipped'), slot(6, 'skipped'),
    ]),
  );
  console.log('1. the 2026-07-30 incident, replayed');
  for (const [name, m] of [['local=laptop', mergeDatabases(laptop, phone)], ['local=phone', mergeDatabases(phone, laptop)]] as const) {
    check(`${name}: block 5 stays done`, get(m, 5).status === 'done', get(m, 5).status);
    check(`${name}: block 6 stays done`, get(m, 6).status === 'done', get(m, 6).status);
    check(`${name}: note on 10 survives`, get(m, 10).note.includes('userver'));
    check(`${name}: "overslept" survives`, get(m, 3).note === 'overslept');
    check(`${name}: blocks 1-4 stay failed`, [1, 2, 3, 4].every((i) => get(m, i).status === 'skipped'));
  }
}

/* 2. The same shape once both devices run the fixed build. */
{
  const laptop = db(day(at(18, 5), [slot(5, 'done', '', { updatedAt: at(15, 45) })]));
  const phone = db(day(at(18, 21), [slot(5, 'skipped', '', { updatedAt: at(16, 40), auto: true })]));
  console.log('2. an auto-lapse never beats an answer');
  check('answer wins over a later auto-skip', mergeDatabases(laptop, phone).days[DATE].slots[4].status === 'done');
  check('and the other way round', mergeDatabases(phone, laptop).days[DATE].slots[4].status === 'done');
}

/* 3. A real answer made later on another device must still win. */
{
  const a = db(day(at(18, 5), [slot(5, 'done', '', { updatedAt: at(18, 5) })]));
  const b = db(day(at(18, 30), [slot(5, 'skipped', '', { updatedAt: at(18, 30) })]));
  console.log('3. a later answer still wins');
  check('deliberate skip at 18:30 beats done at 18:05', mergeDatabases(a, b).days[DATE].slots[4].status === 'skipped');
  check('symmetric', mergeDatabases(b, a).days[DATE].slots[4].status === 'skipped');
}

/* 4. Clearing and deleting must not be undone by a stale copy. */
{
  const marked = db(day(at(18, 5), [slot(5, 'done', 'first pass', { updatedAt: at(18, 5) })]));
  const cleared = db(day(at(18, 30), [slot(5, 'empty', '', { updatedAt: at(18, 30) })]));
  console.log('4. clears and deletions hold');
  check('clear to empty wins', mergeDatabases(marked, cleared).days[DATE].slots[4].status === 'empty');
  check('note deletion wins', mergeDatabases(marked, cleared).days[DATE].slots[4].note === '');
  check('symmetric', mergeDatabases(cleared, marked).days[DATE].slots[4].note === '');
}

/* 5. Text is never dropped for a side that simply never had it. */
{
  const withNote = db(day(at(18, 5), [slot(7, 'empty', 'ring userver back', { updatedAt: at(18, 5) })]));
  const without = db(day(at(19, 0), [slot(7, 'empty')]));
  console.log('5. an absent note never erases a present one');
  check('kept, though the other side is newer', mergeDatabases(withNote, without).days[DATE].slots[6].note !== '');
  check('symmetric', mergeDatabases(without, withNote).days[DATE].slots[6].note !== '');
}

/* 6. Days, goals and day notes union rather than replace. */
{
  const a = db(day(at(18, 5), [slot(1, 'done')]), day(at(12, 0), [slot(1, 'done')], '2026-07-28'));
  const b = db(day(at(18, 21), [slot(2, 'done')]), day(at(12, 0), [slot(1, 'done')], '2026-07-27'));
  const m = mergeDatabases(a, b);
  console.log('6. nothing is dropped wholesale');
  check('a day only local has survives', !!m.days['2026-07-28']);
  check('a day only remote has survives', !!m.days['2026-07-27']);
  check('both sides of the shared day survive', get(m, 1).status === 'done' && get(m, 2).status === 'done');
}

/* 7. Merging is stable: doing it twice changes nothing further. */
{
  const a = db(day(at(18, 5), [slot(5, 'done', 'x', { updatedAt: at(18, 5) })]));
  const b = db(day(at(18, 21), [slot(5, 'skipped', '', { updatedAt: at(16, 40), auto: true })]));
  const once = mergeDatabases(a, b);
  const twice = mergeDatabases(once, b);
  const both = mergeDatabases(once, mergeDatabases(b, a));
  console.log('7. idempotent and convergent');
  check('merging the result again is a no-op', JSON.stringify(once.days) === JSON.stringify(twice.days));
  check('both devices converge on the same day', JSON.stringify(once.days) === JSON.stringify(both.days));
}

/* 8. A restored copy must be able to overwrite a corrupted one. */
{
  const corrupted = db(day(at(18, 21), [slot(5, 'skipped'), slot(6, 'skipped')]));
  const restored = db(
    day(at(21, 0), [
      slot(5, 'done', '', { updatedAt: at(21, 0) }),
      slot(6, 'done', '', { updatedAt: at(21, 0) }),
      slot(10, 'empty', 'note back', { updatedAt: at(21, 0) }),
    ]),
  );
  console.log('8. a restore lands even against a corrupted local copy');
  const m = mergeDatabases(corrupted, restored);
  check('block 5 restored', get(m, 5).status === 'done');
  check('block 6 restored', get(m, 6).status === 'done');
  check('note restored', get(m, 10).note === 'note back');
}

console.log('');
if (failures) {
  console.error(`${failures} merge check(s) failed`);
  process.exit(1);
}
console.log('all merge checks passed');
