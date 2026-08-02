/**
 * The one piece of the export with a decision in it: how a report is broken to
 * fit its column, and what happens to the part that does not.
 *
 * The canvas is stubbed with a fixed-width font — six pixels a character — so
 * the arithmetic is exact and the check needs no browser.
 */

import { wrap } from '../src/lib/shot';

const CH = 6;
const c = {
  measureText: (t: string) => ({ width: t.length * CH }),
} as unknown as CanvasRenderingContext2D;

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${ok || !detail ? '' : `  — ${detail}`}`);
}

console.log('a report is broken to fit, and its tail is marked');
{
  const w = (text: string, cols: number) => wrap(c, text, cols * CH);

  check('short text is one line, untouched',
    JSON.stringify(w('understood the crate', 40)) === '["understood the crate"]',
    JSON.stringify(w('understood the crate', 40)));

  // Wide enough for the whole thing across two lines: nothing may be marked.
  const two = w('understood the uzu-backend crate better', 25);
  check('long text wraps to two', two.length === 2, JSON.stringify(two));
  check('and every line fits', two.every((l) => l.length <= 25), JSON.stringify(two));
  check('nothing is lost when it fits in two',
    two.join(' ') === 'understood the uzu-backend crate better', JSON.stringify(two));

  // One column narrower than it needs: the tail is marked, not dropped.
  const tight = w('understood the uzu-backend crate better', 20);
  check('a hair too narrow ellipsises', tight[1].endsWith('…'), JSON.stringify(tight));
  check('and does not silently lose a word', tight.length === 2, JSON.stringify(tight));

  // Past two lines the tail is marked rather than silently dropped.
  const long = w('one two three four five six seven eight nine ten eleven twelve', 12);
  check('never more than two lines', long.length === 2, JSON.stringify(long));
  check('the overflow is ellipsised', long[1].endsWith('…'), JSON.stringify(long));
  check('the ellipsised line still fits', long[1].length <= 12, `${long[1].length}: ${long[1]}`);

  // A word longer than the column cannot be broken, but must not be doubled.
  const huge = w('supercalifragilistic x', 10);
  check('an oversized word is not drawn twice',
    huge.filter((l) => l.startsWith('supercalifragilistic')).length === 1, JSON.stringify(huge));
  check('and the rest still follows', huge.length <= 2, JSON.stringify(huge));

  check('exactly-fitting text is not ellipsised',
    w('abc def', 7).join(' ') === 'abc def' && !w('abc def', 7)[0].includes('…'),
    JSON.stringify(w('abc def', 7)));
  check('collapsed whitespace does not read as loss',
    !w('a   b', 20)[0].includes('…'), JSON.stringify(w('a   b', 20)));
  check('empty text is no lines', w('', 20).length === 0, JSON.stringify(w('', 20)));
}

console.log(failures ? `\n${failures} shot check(s) failed` : '\nall shot checks passed');
if (failures) process.exit(1);
