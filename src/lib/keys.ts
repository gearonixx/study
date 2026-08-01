/**
 * What a keystroke means, whatever the layout printed on it.
 *
 * `e.key` is the character the layout produced, and that is the wrong thing to
 * judge a verdict by. On a Cyrillic layout the key under the left hand sends
 * `ф`, not `a` — so every A matched nothing, fell through the switch, and was
 * dropped on the floor. Silently: there is no checkbox to fall back on, so the
 * whole app reads as frozen. The verdict demand screen was worse still, since
 * it listens in capture and will not leave until it is answered.
 *
 * So the letter is tried first and the key's *position* second — but position
 * only ever gets a say when the layout printed no Latin letter at all. That
 * qualification is the whole design. Rearranged Latin layouts are reading
 * their own keycaps: Dvorak prints O where QWERTY keeps S, and falling back to
 * position there would fire SKIPPED at someone who typed an O. A verdict
 * arriving unasked is worse than one that has to be typed twice. Cyrillic,
 * Greek, Hebrew, Arabic — the layouts where no keycap here says anything at
 * all — are the only ones that need the key's position, and they get it.
 */

/** Every token the app's key handlers actually act on. */
const KNOWN = new Set([
  'a',
  'd',
  's',
  'u',
  'j',
  'k',
  'backspace',
  'arrowup',
  'arrowdown',
  'enter',
  ' ',
  '?',
  '/',
]);

export function keyToken(e: KeyboardEvent): string {
  const printed = e.key.toLowerCase();
  if (KNOWN.has(printed)) return printed;
  // A Latin letter this app has no use for is still a deliberate Latin letter.
  // Leave it alone: the user can see what is on the key they pressed.
  if (/^[a-z]$/.test(printed)) return printed;
  // `KeyA` is the key where QWERTY keeps A, whatever this layout prints there.
  const code = e.code;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  const positional = code.toLowerCase();
  if (KNOWN.has(positional)) return positional;
  return printed;
}
