/**
 * Guards the write guard: what the server will and won't accept over the top
 * of an existing database.
 *
 * The point is asymmetry. Ordinary editing — clearing a day, un-marking an
 * hour, a fresh device with nothing on it yet — has to go through untouched.
 * A client that has somehow lost the record must not be able to take a year of
 * blocks down with it.
 */

import { summarize, wouldDestroy } from '../server/lib/guard';

type Status = 'done' | 'partial' | 'skipped' | 'empty';

function db(days: Record<string, Status[]>): unknown {
  return {
    version: 1,
    days: Object.fromEntries(
      Object.entries(days).map(([date, statuses]) => [
        date,
        { date, slots: statuses.map((status, i) => ({ index: i + 1, status, note: '', mood: '' })) },
      ]),
    ),
  };
}

/** A year of ten-block days, every one of them fully done. */
const year = db(
  Object.fromEntries(
    Array.from({ length: 365 }, (_, i) => {
      const d = new Date(2026, 0, 1 + i).toISOString().slice(0, 10);
      return [d, Array.from({ length: 10 }, () => 'done' as Status)];
    }),
  ),
);

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${ok || !detail ? '' : `  — ${detail}`}`);
}

console.log('summary');
{
  const s = summarize(db({ '2026-07-30': ['done', 'partial', 'skipped', 'empty'] }));
  check('a dirty hour counts as half', s.hours === 1.5, String(s.hours));
  check('days are counted', s.days === 1);
  check('an empty database summarises to nothing', summarize(null).days === 0);
}

console.log('the guard lets ordinary work through');
{
  const before = db({ '2026-07-29': ['done', 'done'], '2026-07-30': ['done', 'done'] });
  check('an unchanged push', wouldDestroy(before, before) === null);
  check('adding a day', wouldDestroy(before, db({ ...{ '2026-07-29': ['done', 'done'], '2026-07-30': ['done', 'done'], '2026-07-31': ['done'] } })) === null);
  check('un-marking an hour', wouldDestroy(before, db({ '2026-07-29': ['done', 'empty'], '2026-07-30': ['done', 'done'] })) === null);
  check('clearing one whole day of a short history', wouldDestroy(before, db({ '2026-07-30': ['done', 'done'] })) === null);
  check('the very first push, against nothing', wouldDestroy(null, before) === null);
  check('a signed-in device with an empty local copy, against nothing', wouldDestroy(db({}), before) === null);
}

console.log('the guard refuses a collapse');
{
  check('wiping a year outright', wouldDestroy(year, db({})) !== null);
  check('a year down to a single day', wouldDestroy(year, db({ '2026-07-30': ['done'] })) !== null);
  const half = db(
    Object.fromEntries(
      Array.from({ length: 180 }, (_, i) => [
        new Date(2026, 0, 1 + i).toISOString().slice(0, 10),
        Array.from({ length: 10 }, () => 'done' as Status),
      ]),
    ),
  );
  check('half a year disappearing', wouldDestroy(year, half) !== null);
  check('and it says what it refused', (wouldDestroy(year, db({})) ?? '').includes('days'));
}

console.log('the guard stays out of the way of real editing on a long history');
{
  const days = Object.fromEntries(
    Array.from({ length: 365 }, (_, i) => [
      new Date(2026, 0, 1 + i).toISOString().slice(0, 10),
      Array.from({ length: 10 }, () => 'done' as Status),
    ]),
  ) as Record<string, Status[]>;
  const minusTwoDays = { ...days };
  delete minusTwoDays['2026-01-01'];
  delete minusTwoDays['2026-01-02'];
  check('deleting two days out of a year', wouldDestroy(year, db(minusTwoDays)) === null);

  const dirtied = { ...days, '2026-01-01': Array.from({ length: 10 }, () => 'partial' as Status) };
  check('downgrading a day to dirty', wouldDestroy(year, db(dirtied)) === null);
}

console.log('');
if (failures) {
  console.error(`${failures} guard check(s) failed`);
  process.exit(1);
}
console.log('all guard checks passed');
