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
  stageWindow,
  timelineOf,
} from '../src/lib/schedule';
import { SCHEDULES } from '../src/lib/types';

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
  check('stage 1 is 10:00 – 15:40', stageWindow(1, at(31, 12, 0), 'standard') === '10:00 – 15:40');
  check('stage 2 is 16:10 – 21:50', stageWindow(2, at(31, 12, 0), 'standard') === '16:10 – 21:50');
  const end = at(31, 21, 50);
  check('the day is over at 21:50', scheduleAt(end, 'standard').phase === 'after');
}

console.log('experimental: fourteen blocks to 02:30');
{
  const line = timelineOf('experimental');
  check('fourteen blocks', line.filter((s) => s.kind === 'block').length === 14, String(line.filter((s) => s.kind === 'block').length));
  check('one bridge', line.filter((s) => s.kind === 'bridge').length === 1);
  check('twelve breaks', line.filter((s) => s.kind === 'break').length === 12);
  check('16h30m long', mins(dayLengthOf('experimental')) === 990, `${mins(dayLengthOf('experimental'))} min`);

  const noon = at(31, 12, 0);
  check('stage 1 is 10:00 – 18:00', stageWindow(1, noon, 'experimental') === '10:00 – 18:00', stageWindow(1, noon, 'experimental'));
  check('stage 2 is 18:30 – 02:30', stageWindow(2, noon, 'experimental') === '18:30 – 02:30', stageWindow(2, noon, 'experimental'));
  check('block 7 ends at 18:00', atClock(blockWindow(7, noon, 'experimental').to) === '18:00');
  check('block 8 opens at 18:30', atClock(blockWindow(8, noon, 'experimental').from) === '18:30');
  check('block 14 closes at 02:30', atClock(blockWindow(14, noon, 'experimental').to) === '02:30');

  // Every block is a full hour and every gap is ten minutes, bar the bridge.
  const blocks = line.filter((s) => s.kind === 'block');
  check('every block is 60 minutes', blocks.every((b) => mins(b.to - b.from) === 60));
  const gaps = line.filter((s) => s.kind !== 'block');
  check('every gap is 10 minutes but the bridge', gaps.every((g) => mins(g.to - g.from) === (g.kind === 'bridge' ? 30 : 10)));
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

  const half = at(32, 2, 30);
  check('02:30 closes the experimental day', scheduleAt(half, 'experimental').phase === 'after');
  const later = at(32, 3, 0);
  check('03:00 belongs to the new day', runningDayKey(later, 'experimental') === '2026-08-01');
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
    check(`${shape.id}: block count matches the shape`, line.filter((s) => s.kind === 'block').length === shape.blocks);
    check(`${shape.id}: ends at ${shape.ends}`, atClock(at(31, 10, 0) + dayLengthOf(shape.id)) === shape.ends);
  }
}

console.log('');
if (failures) {
  console.error(`${failures} schedule check(s) failed`);
  process.exit(1);
}
console.log('all schedule checks passed');
