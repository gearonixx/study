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
import {
  blocksOf,
  boundariesOf,
  closedRounds,
  emptyDay,
  reportOf,
  reportsDue,
  SCHEDULES,
  shapeOf,
} from '../src/lib/types';

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

console.log('experimental: the standard day, plus two night rounds');
{
  const line = timelineOf('experimental');
  const blocks = line.filter((s) => s.kind === 'block');
  const bridges = line.filter((s) => s.kind === 'bridge');
  check('eighteen blocks', blocks.length === 18, String(blocks.length));
  check('three bridges', bridges.length === 3, String(bridges.length));
  // Round four's two gaps are worked, so they are not breaks.
  check('eleven breaks', line.filter((s) => s.kind === 'break').length === 11, String(line.filter((s) => s.kind === 'break').length));
  check('three intensive stretches', line.filter((s) => s.kind === 'intensive').length === 3, String(line.filter((s) => s.kind === 'intensive').length));
  check('all of them in round 4', line.filter((s) => s.kind === 'intensive').every((g) => g.block >= 15));
  check('and round 4 has no breaks', !line.some((s) => s.kind === 'break' && s.block >= 15));
  check('every intensive stretch is 10 minutes', line.filter((s) => s.kind === 'intensive').every((g) => mins(g.to - g.from) === 10));
  check('the day is no longer for it', mins(dayLengthOf('experimental')) === 1280, `${mins(dayLengthOf('experimental'))} min`);
  check('the standard day has none', !timelineOf('standard').some((s) => s.kind === 'intensive'));
  check('21h20m long', mins(dayLengthOf('experimental')) === 1280, `${mins(dayLengthOf('experimental'))} min`);
  check('the first bridge is 30 minutes', mins(bridges[0].to - bridges[0].from) === 30);
  check('the second is 20', mins(bridges[1].to - bridges[1].from) === 20);
  check('the third is 10', mins(bridges[2].to - bridges[2].from) === 10);

  const noon = at(31, 12, 0);
  // The first two rounds are the standard day, to the minute.
  check('round 1 is 10:00 – 15:40', roundWindow(1, noon, 'experimental') === '10:00 – 15:40', roundWindow(1, noon, 'experimental'));
  check('round 2 is 16:10 – 21:50', roundWindow(2, noon, 'experimental') === '16:10 – 21:50', roundWindow(2, noon, 'experimental'));
  check('round 3 is 22:10 – 02:40', roundWindow(3, noon, 'experimental') === '22:10 – 02:40', roundWindow(3, noon, 'experimental'));
  check('round 4 is 02:50 – 07:20', roundWindow(4, noon, 'experimental') === '02:50 – 07:20', roundWindow(4, noon, 'experimental'));
  check('blocks 1-10 match the standard day', [1, 5, 6, 10].every(
    (b) => atClock(blockWindow(b, noon, 'experimental').from) === atClock(blockWindow(b, noon, 'standard').from),
  ));
  check('block 11 opens at 22:10', atClock(blockWindow(11, noon, 'experimental').from) === '22:10');
  check('block 14 closes at 02:40', atClock(blockWindow(14, noon, 'experimental').to) === '02:40', atClock(blockWindow(14, noon, 'experimental').to));
  check('block 15 opens at 02:50', atClock(blockWindow(15, noon, 'experimental').from) === '02:50', atClock(blockWindow(15, noon, 'experimental').from));
  check('block 18 closes at 07:20', atClock(blockWindow(18, noon, 'experimental').to) === '07:20', atClock(blockWindow(18, noon, 'experimental').to));
  check('block 18 is the last', blocksOf(SCHEDULES.experimental) === 18);

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

  const end = at(32, 7, 20);
  check('07:20 closes the long day', scheduleAt(end, 'experimental').phase === 'after');
  check('and it is still filed under the day it started', scheduleAt(end, 'experimental').dayKey === '2026-07-31');
  const later = at(32, 8, 30);
  check('08:30 belongs to the new day', runningDayKey(later, 'experimental') === '2026-08-01');
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
  day.slots[17].status = 'done';
  day.slots[9].note = 'past midnight';
  const back = parseNote(toMarkdown(day), '2026-07-31').day;
  check('an eighteen-block day round-trips as eighteen', back.slots.length === 18, String(back.slots.length));
  check('and stays experimental', back.schedule === 'experimental');
  check('with bridges after 5, 10 and 14', JSON.stringify(boundariesOf(shapeOf(back))) === '[5,10,14]');
  check('block 18 survives', back.slots[17].status === 'done');
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

console.log('reports: what a round produced, and what the day did');
{
  const day = emptyDay('2026-07-31', 'experimental');
  const shape = SCHEDULES.experimental;

  // A day nothing was recorded against owes nothing, however long it has been
  // over — otherwise every empty day in the history demands an account.
  check('an untouched day owes nothing', reportsDue(emptyDay('2026-07-30', 'experimental'), 18).length === 0);
  day.slots[0].status = 'done';

  // Nothing is owed before anything has happened, and a round is owed the
  // moment its last block closes — not a block earlier.
  check('nothing due at block 0', reportsDue(day, 0).length === 0);
  check('round 1 not due at block 4', !reportsDue(day, 4).includes(1));
  check('round 1 due at block 5', reportsDue(day, 5).includes(1));
  check('rounds 1-3 due at block 14', JSON.stringify(reportsDue(day, 14)) === '[1,2,3]', JSON.stringify(reportsDue(day, 14)));
  check('closedRounds counts 3 at block 14', closedRounds(shape, 14) === 3, String(closedRounds(shape, 14)));
  check('closedRounds counts 4 at block 18', closedRounds(shape, 18) === 4, String(closedRounds(shape, 18)));

  // The day itself is owed only once every block has closed, and it is last.
  const all = reportsDue(day, 18);
  check('the day is due at block 18', all.includes(0));
  check('and it is owed last', all[all.length - 1] === 0, JSON.stringify(all));

  // Writing one settles it, and only it.
  day.reports[1] = 'parser rewrite landed';
  check('a written round stops being due', !reportsDue(day, 18).includes(1));
  check('the others still are', reportsDue(day, 18).includes(2));

  // Round-trip: reports survive Markdown, on the right rounds.
  day.reports[4] = 'shipped the bar module';
  day.dayReport = 'eighteen blocks, all of them sat';
  const md = toMarkdown(day);
  // The report belongs to the round, so it lands after that round's *last*
  // block and before the BRIDGE into the next one.
  const lines = md.split('\n').filter((l) => l.trim());
  check(
    'round 1 report follows block 5, before the BRIDGE',
    lines[lines.indexOf('ROUND 1 DONE — parser rewrite landed') - 1] === '5 -' &&
      lines[lines.indexOf('ROUND 1 DONE — parser rewrite landed') + 1] === 'BRIDGE',
    lines.slice(0, 8).join(' | '),
  );
  check(
    'round 4 report follows block 18',
    lines[lines.indexOf('ROUND 4 DONE — shipped the bar module') - 1] === '18 -',
    lines.slice(-4).join(' | '),
  );
  check('the day report closes the file', md.trimEnd().endsWith('DAY DONE — eighteen blocks, all of them sat'));

  const back = parseNote(md, '2026-07-31').day;
  check('round 1 round-trips', reportOf(back, 1) === 'parser rewrite landed', reportOf(back, 1));
  check('round 4 round-trips', reportOf(back, 4) === 'shipped the bar module', reportOf(back, 4));
  check('the day report round-trips', back.dayReport === 'eighteen blocks, all of them sat', back.dayReport);
  check('an unwritten round stays unwritten', reportOf(back, 2) === '', reportOf(back, 2));
  check('and the blocks are untouched by it', back.slots[0].status === 'done' && back.slots.length === 18);
  check('re-serialising is identical', toMarkdown(back) === md);

  // A report line must never be mistaken for a block or a side note.
  check('no report line leaked into notes', back.notes.every((n) => !/DONE/.test(n.text)), JSON.stringify(back.notes.map((n) => n.text)));

  // A hyphen instead of an em dash is what actually gets typed.
  const typed = parseNote('1 - done\nROUND 1 DONE - hyphen works\nDAY DONE - so does this', '2026-07-31').day;
  check('a hyphen parses as well as an em dash', reportOf(typed, 1) === 'hyphen works', reportOf(typed, 1));
  check('and for the day', typed.dayReport === 'so does this', typed.dayReport);
}
