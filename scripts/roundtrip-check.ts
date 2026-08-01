/**
 * Round-trip check for the vault: every day written as Markdown must parse back
 * into the same day. If this drifts, folder sync silently corrupts history.
 *
 *   npm run check-roundtrip -- ~/july
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { parseNote, dateFromFilename, toMarkdown } from '../src/lib/mdParse';
import { dayTouched, dayHours, type Day } from '../src/lib/types';
import { toKey } from '../src/lib/date';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/roundtrip-check.ts <notes-dir>');
  process.exit(1);
}

/** Compares everything the app actually persists, ignoring generated ids. */
function shape(day: Day) {
  return {
    slots: day.slots.map((s) => ({ i: s.index, st: s.status, n: s.note })),
    goals: day.goals.map((g) => ({ l: g.label, d: g.detail, s: g.startSlot })),
    notes: day.notes.map((n) => ({ a: n.afterSlot, t: n.text })).sort((a, b) => a.a - b.a || a.t.localeCompare(b.t)),
    top: day.windowTop,
    bottom: day.windowBottom,
  };
}

let checked = 0;
let failed = 0;

for (const file of (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.md')).sort()) {
  const path = join(dir, file);
  const text = await readFile(path, 'utf8');
  if (!text.trim()) continue;

  const date =
    dateFromFilename(basename(file), new Date().getFullYear()) ?? toKey((await stat(path)).mtime);
  const { day } = parseNote(text, date);
  if (!dayTouched(day)) continue;

  // The property under test: parse(render(day)) === day.
  const { day: reparsed } = parseNote(toMarkdown(day), date);
  checked++;

  const a = JSON.stringify(shape(day));
  const b = JSON.stringify(shape(reparsed));
  if (a !== b) {
    failed++;
    console.log(`\n✗ ${file} (${date})  ${dayHours(day)}h → ${dayHours(reparsed)}h`);
    console.log('  before:', a);
    console.log('  after: ', b);
  }
}

console.log(`\n${checked - failed}/${checked} days round-trip cleanly.`);
process.exit(failed ? 1 : 0);
