/**
 * Converts a folder of hand-written daily notes into a wizzard export
 * that Settings → "Restore JSON" can load.
 *
 *   node scripts/import-notes.ts ~/july > seed.json
 *   node scripts/import-notes.ts ~/july --report   # inspect the parse first
 *
 * Dates come from the filename (`2026-07-29.md`, `C - 21 july.md`); files with
 * no date in the name fall back to their modification time, so `A.md` still
 * lands somewhere sensible rather than being dropped.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { parseNote, dateFromFilename } from '../src/lib/mdParse';
import { emptyDatabase, dayHours, dayTouched, type Day } from '../src/lib/types';
import { toKey } from '../src/lib/date';

const [, , dir, ...flags] = process.argv;
if (!dir) {
  console.error('usage: node scripts/import-notes.ts <notes-dir> [--report]');
  process.exit(1);
}

const report = flags.includes('--report');
const db = emptyDatabase();
const rows: { file: string; date: string; hours: number; blocks: number; goals: string }[] = [];

const entries = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.md')).sort();

for (const file of entries) {
  const path = join(dir, file);
  const text = await readFile(path, 'utf8');
  if (!text.trim()) continue;

  const info = await stat(path);
  const date = dateFromFilename(basename(file), new Date().getFullYear()) ?? toKey(info.mtime);

  const { day } = parseNote(text, date);
  if (!dayTouched(day)) continue;

  // Two files can land on the same date (an undated note next to a dated one);
  // keep whichever recorded more, rather than letting the later file win.
  const existing: Day | undefined = db.days[date];
  if (existing && dayHours(existing) >= dayHours(day)) continue;

  db.days[date] = day;
  rows.push({
    file,
    date,
    hours: dayHours(day),
    blocks: day.slots.filter((s) => s.status !== 'empty').length,
    goals: day.goals.map((g) => g.label).join(',') || '—',
  });
}

if (report) {
  const width = Math.max(...rows.map((r) => r.file.length), 4);
  console.log('file'.padEnd(width), 'date'.padEnd(10), 'blocks', 'hours', 'goals');
  for (const r of rows) {
    console.log(
      r.file.padEnd(width),
      r.date.padEnd(10),
      String(r.blocks).padStart(6),
      String(r.hours).padStart(5),
      ' ',
      r.goals,
    );
  }
  const total = rows.reduce((n, r) => n + r.hours, 0);
  console.log(`\n${rows.length} days, ${total} credited hours.`);
} else {
  console.log(JSON.stringify(db, null, 2));
}
