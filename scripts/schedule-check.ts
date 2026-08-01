/**
 * Guards the day's shapes.
 *
 * Both schedules come out of one generator, so what needs pinning down is the
 * arithmetic — that the experimental day lands exactly on 02:30 with fourteen
 * blocks and the same 60/10 rhythm — and the one piece of genuinely new logic:
 * a day that runs past midnight is still the day it started on. Filing blocks
 * worked at 01:00 under the wrong date would be a quiet, permanent kind of
 * wrong, so it is checked from both directions.
 */

import {
  atClock,
  blockWindow,
  dayLengthOf,
  dayStartFor,
  lapsedBlocks,
  runningDayKey,
  scheduleAt,
  roundWindow,
  runningSchedule,
  timelineOf,
} from '../src/lib/schedule';
import { parseNote, toMarkdown } from '../src/lib/mdParse';
import { blocksOf, boundariesOf, emptyDay, SCHEDULES, shapeOf } from '../src/lib/types';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${ok || !detail ? '' : `  — ${detail}`}`);
}
const at = (day: number, h: number, m: number) => new Date(2026, 6, day, h, m, 0).getTime();
const mins = (ms: number) => ms / 60000;

console.log('standard: unchanged');
{
  const line = timelineOf('standard');
  check('ten blocks', line.filter((s) => s.kind === 'block').length === 10);
  check('11h50m long', mins(dayLengthOf('standard')) === 710, `${mins(dayLengthOf('standard'))} min`);
  check('round 1 is 10:00 – 15:40', roundWindow(1, at(31, 12, 0), 'standard') === '10:00 – 15:40');
  check('round 2 is 16:10 – 21:50', roundWindow(2, at(31, 12, 0), 'standard') === '16:10 – 21:50');
  const end = at(31, 21, 50);
  check('the day is over at 21:50', scheduleAt(end, 'standard').phase === 'after');
}

console.log('experimental: the standard day, plus a third round');
{
  const line = timelineOf('experimental');
  const blocks = line.filter((s) => s.kind === 'block');
  const bridges = line.filter((s) => s.kind === 'bridge');
  check('fourteen blocks', blocks.length === 14, String(blocks.length));
  check('two bridges', bridges.length === 2, String(bridges.length));
  check('eleven breaks', line.filter((s) => s.kind === 'break').length === 11);
  check('16h40m long', mins(dayLengthOf('experimental')) === 1000, `${mins(dayLengthOf('experimental'))} min`);
  check('the first bridge is 30 minutes', mins(bridges[0].to - bridges[0].from) === 30);
  check('the second is 20', mins(bridges[1].to - bridges[1].from) === 20);

  const noon = at(31, 12, 0);
  // The first two rounds are the standard day, to the minute.
  check('round 1 is 10:00 – 15:40', roundWindow(1, noon, 'experimental') === '10:00 – 15:40', roundWindow(1, noon, 'experimental'));
  check('round 2 is 16:10 – 21:50', roundWindow(2, noon, 'experimental') === '16:10 – 21:50', roundWindow(2, noon, 'experimental'));
  check('round 3 is 22:10 – 02:40', roundWindow(3, noon, 'experimental') === '22:10 – 02:40', roundWindow(3, noon, 'experimental'));
  check('blocks 1-10 match the standard day', [1, 5, 6, 10].every(
    (b) => atClock(blockWindow(b, noon, 'experimental').from) === atClock(blockWindow(b, noon, 'standard').from),
  ));
  check('block 11 opens at 22:10', atClock(blockWindow(11, noon, 'experimental').from) === '22:10');
  check('block 14 closes at 02:40', atClock(blockWindow(14, noon, 'experimental').to) === '02:40');

  check('every block is 60 minutes', blocks.every((b) => mins(b.to - b.from) === 60));
  check('every break is 10 minutes', line.filter((s) => s.kind === 'break').every((g) => mins(g.to - g.from) === 10));
}

console.log('past midnight, the day is still the day it started on');
{
  // 01:00 on 1 August, on a day that opened at 10:00 on 31 July.
  const oneAm = at(32, 1, 0); // month-rolling: 6/32 === 1 August
  const exp = scheduleAt(oneAm, 'experimental');
  check('the running day is 2026-07-31', exp.dayKey === '2026-07-31', exp.dayKey);
  check('block 13 is running', exp.phase === 'block' && exp.block === 13, `${exp.phase} ${exp.block}`);
  check('runningDayKey agrees', runningDayKey(oneAm, 'experimental') === '2026-07-31');
  check('dayStartFor points at yesterday 10:00', atClock(dayStartFor(oneAm, 'experimental')) === '10:00');

  const std = scheduleAt(oneAm, 'standard');
  check('standard still reads 01:00 as before the day', std.phase === 'before', std.phase);
  check('standard files it under 2026-08-01', std.dayKey === '2026-08-01', std.dayKey);

  const end = at(32, 2, 40);
  check('02:40 closes the experimental day', scheduleAt(end, 'experimental').phase === 'after');
  check('and it is still filed under the day it started', scheduleAt(end, 'experimental').dayKey === '2026-07-31');
  const later = at(32, 3, 15);
  check('03:15 belongs to the new day', runningDayKey(later, 'experimental') === '2026-08-01');
  check('and reads as before it', scheduleAt(later, 'experimental').phase === 'before');
}

console.log('the sweep follows the same day');
{
  const oneAm = at(32, 1, 0);
  const lapsed = lapsedBlocks(oneAm, 'experimental');
  // Blocks lapse an hour after they close; block 11 closes at 23:10, so 1..11
  // are past their grace by 01:00 — but only up to the ones that have.
  check('blocks 1–11 have lapsed by 01:00', lapsed.length === 11, String(lapsed.length));
  check('block 13, still running, has not', !lapsed.includes(13));
  check('nothing lapses before the day opens', lapsedBlocks(at(31, 9, 0), 'experimental').length === 0);
}

console.log('shapes agree with their own numbers');
{
  for (const shape of Object.values(SCHEDULES)) {
    const line = timelineOf(shape.id);
    check(`${shape.id}: block count matches the shape`, line.filter((s) => s.kind === 'block').length === blocksOf(shape));
    check(`${shape.id}: ends at ${shape.ends}`, atClock(at(31, 10, 0) + dayLengthOf(shape.id)) === shape.ends);
  }
}

console.log('a stamped day outranks the setting');
{
  const oneAm = at(32, 1, 0);
  const days = { '2026-07-31': { schedule: 'experimental' as const } };
  check('the long day keeps running past midnight', runningSchedule(days, 'standard', oneAm) === 'experimental');
  check('even against a setting that says otherwise', runningSchedule(days, 'standard', at(31, 20, 0)) === 'experimental');
  check('an unstamped day follows the setting', runningSchedule({}, 'experimental', at(31, 12, 0)) === 'experimental');
  check('and defaults to standard', runningSchedule({}, 'standard', at(31, 12, 0)) === 'standard');
}

console.log('markdown carries the shape');
{
  const day = emptyDay('2026-07-31', 'experimental');
  day.slots[0].status = 'done';
  day.slots[13].status = 'done';
  day.slots[9].note = 'past midnight';
  const back = parseNote(toMarkdown(day), '2026-07-31').day;
  check('a fourteen-block day round-trips as fourteen', back.slots.length === 14, String(back.slots.length));
  check('and stays experimental', back.schedule === 'experimental');
  check('with bridges after 5 and 10', JSON.stringify(boundariesOf(shapeOf(back))) === '[5,10]');
  check('block 14 survives', back.slots[13].status === 'done');
  check('a note past the standard day survives', back.slots[9].note === 'past midnight');

  // The notes this app grew out of ran to twelve blocks. Those are history, not
  // a longer schedule, and must not be read as one.
  const legacy = [
    'MATH', '10:00 - 15:40',
    ...Array.from({ length: 6 }, (_, i) => `${i + 1} - done ✅`),
    'BRIDGE', '16:10 - 21:50',
    ...Array.from({ length: 6 }, (_, i) => `${i + 7} - done ✅`),
  ].join('\n');
  const old = parseNote(legacy, '2026-01-05');
  check('a twelve-block note stays standard', old.day.schedule === undefined);
  check('trimmed to ten, with the rest reported', old.day.slots.length === 10 && old.ignored.length > 0);
}

console.log('');
if (failures) {
  console.error(`${failures} schedule check(s) failed`);
  process.exit(1);
}
console.log('all schedule checks passed');
