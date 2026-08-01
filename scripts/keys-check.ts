/**
 * Guards the keyboard against the layout it is typed on.
 *
 * The 2026-08-01 lock-out, replayed: on a Cyrillic layout every verdict key
 * printed a Cyrillic letter, matched nothing, and did nothing. With no mouse
 * fallback for a status, and a demand screen that listens in capture and will
 * not leave until it is answered, the app was simply shut — five worked hours
 * went unrecordable and four of them lapsed to red on their own.
 *
 * The property is two-sided, which is why this is a check and not a one-liner:
 * a layout that prints a letter we know must keep that letter (Dvorak reads
 * its own keycaps), and a layout that prints one we don't must fall back to
 * where the key sits.
 */

import { keyToken } from '../src/lib/keys';

/** Enough of a KeyboardEvent for `keyToken`; the DOM one can't be built here. */
function press(key: string, code: string): KeyboardEvent {
  return { key, code } as KeyboardEvent;
}

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${ok || !detail ? '' : `  — ${detail}`}`);
}

console.log('a QWERTY layout is read off the letter it prints');
{
  check('A is clean', keyToken(press('a', 'KeyA')) === 'a');
  check('D is dirty', keyToken(press('d', 'KeyD')) === 'd');
  check('S is skipped', keyToken(press('s', 'KeyS')) === 's');
  check('U is undo', keyToken(press('u', 'KeyU')) === 'u');
  check('J moves down', keyToken(press('j', 'KeyJ')) === 'j');
  check('K moves up', keyToken(press('k', 'KeyK')) === 'k');
  check('shift does not change the verdict', keyToken(press('A', 'KeyA')) === 'a');
}

console.log('a Cyrillic layout is read off the key, not the letter');
{
  // What Firefox actually sends on ЙЦУКЕН for the keys the app asks for.
  check('ф is clean', keyToken(press('ф', 'KeyA')) === 'a');
  check('в is dirty', keyToken(press('в', 'KeyD')) === 'd');
  check('ы is skipped', keyToken(press('ы', 'KeyS')) === 's');
  check('г is undo', keyToken(press('г', 'KeyU')) === 'u');
  check('о moves down', keyToken(press('о', 'KeyJ')) === 'j');
  check('л moves up', keyToken(press('л', 'KeyK')) === 'k');
  check('Ф capitalised is still clean', keyToken(press('Ф', 'KeyA')) === 'a');
}

console.log('a layout that moves the letters on purpose keeps its own keycaps');
{
  // Dvorak: the key at QWERTY's S prints O, and O is not a verdict — so this
  // is precisely the case that must NOT be read positionally as 'skipped'.
  check('Dvorak O over QWERTY S is not skipped', keyToken(press('o', 'KeyS')) !== 's');
  // Colemak prints S where QWERTY prints D. The letter the user sees wins.
  check('Colemak S over QWERTY D is skipped', keyToken(press('s', 'KeyD')) === 's');
  // And its A stays where it is, so nothing clever is needed for the common key.
  check('Colemak A is clean', keyToken(press('a', 'KeyA')) === 'a');
}

console.log('the keys that carry no letter are unaffected');
{
  check('Backspace undoes', keyToken(press('Backspace', 'Backspace')) === 'backspace');
  check('ArrowDown moves down', keyToken(press('ArrowDown', 'ArrowDown')) === 'arrowdown');
  check('ArrowUp moves up', keyToken(press('ArrowUp', 'ArrowUp')) === 'arrowup');
  check('Enter acknowledges a break', keyToken(press('Enter', 'Enter')) === 'enter');
  check('Space acknowledges a break', keyToken(press(' ', 'Space')) === ' ');
}

console.log('a key the app does not use stays unclaimed');
{
  check('Z is nothing', !['a', 'd', 's', 'u', 'j', 'k'].includes(keyToken(press('z', 'KeyZ'))));
  check('я is nothing', !['a', 'd', 's', 'u', 'j', 'k'].includes(keyToken(press('я', 'KeyZ'))));
}

console.log('');
if (failures) {
  console.error(`${failures} key check(s) failed`);
  process.exit(1);
}
console.log('all key checks passed');
