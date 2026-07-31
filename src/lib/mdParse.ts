/**
 * Parser for the hand-written daily notes this app grew out of.
 *
 * It has to survive a lot of drift, because the real files drifted a lot:
 *
 *   1 - done                      *S1 - done* ✅          **1** - distracted 🙂‍↕
 *   4 - FAILED ❌                 *S6 -* skipped ❌       ~~3 -   (finish review)~~
 *
 * Structural lines it recognises: BRIDGE, time windows ("00:00 - 12:00"),
 * horizontal rules, bare project labels (MATH / READING) which become goals, and
 * anything else loose, which becomes a side note pinned to the last block seen.
 */

import {
  BRIDGE_AFTER,
  emptyDay,
  MAX_BLOCKS,
  shapeOf,
  SLOTS_PER_DAY,
  type Day,
  type SlotStatus,
} from './types';

/** `1 -`, `*S1 -`, `**1** -`, `~~3 -`, tolerating stray markdown emphasis. */
const SLOT_RE = /^[*_~\s]*(?:S|s)?(\d{1,2})[*_~\s]*[-–—:]\s*(.*)$/;
/** `00:00 - 12:00`, `23:00 - 05:00 - raw, no breaks`, or a lone `06:00`. */
const TIME_RE = /^[*_~\s]*(\d{1,2}:\d{2})(?:\s*[-–—]\s*(\d{1,2}:\d{2}))?\b(.*)$/;
const RULE_RE = /^[*_~\s]*-{3,}[*_~\s]*$/;
const BRIDGE_RE = /^[*_~\s]*bridge\b/i;
/** A short all-caps token on its own line — how projects are written. */
const LABEL_RE = /^[*_~\s]*([A-Z][A-Z0-9._+/-]{1,15})[*_~\s]*$/;

/** Words the notes use to mark a block that happened but went badly. */
/** `distr` rather than `distract` so the notes' "distrcd" shorthand matches. */
const DEGRADED = /distr|slow|dirty|hard|super|barely|weak|\bmeh\b|partial|half|procrastinat/;

/** How much a status is "worth" when two passes disagree about a block. */
const RANK: Record<SlotStatus, number> = {
  done: 3,
  partial: 2,
  skipped: 1,
  empty: 0,
};

export function classifyStatus(text: string): SlotStatus {
  const t = text.toLowerCase();
  if (/✅|☑|✔/.test(text) || /\bdone+\b|\brestored\b|\bfinished\b|\bcomplete/.test(t)) {
    // "done (distracted)" / "done (hard)" is a half-credit block, not a clean one.
    return DEGRADED.test(t) ? 'partial' : 'done';
  }
  // Lost, dropped, slept through — all the same red mark now.
  if (/❌|✗|✘/.test(text) || /\bfail(ed)?\b|\blost\b|\bmissed\b/.test(t)) return 'skipped';
  if (/\bskip(ped)?\b|\bsleep\b|🛏/.test(t)) return 'skipped';
  // A bare qualifier with no "done" still means the block was worked, badly.
  if (DEGRADED.test(t) || /😡/.test(text)) return 'partial';
  return 'empty';
}

/** Pulls trailing emoji off a block line — the notes use them as a mood column. */
const EMOJI_RE =
  /(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|[←-⇿])*)+/gu;

export function extractMood(text: string): string {
  const found = text.match(EMOJI_RE) ?? [];
  // ✅/❌ carry status, not mood; everything else is how the block felt.
  const mood = found.map((m) => m.replace(/✅|☑|✔|❌|✗|✘/g, '')).filter(Boolean);
  // "✅✅" repeated is itself a signal — keep it when it's the only marker.
  if (mood.length === 0 && /✅\s*✅/.test(text)) return '✅✅';
  return mood.join('').slice(0, 8);
}

/** Strips status words and emoji so the leftover reads as a human comment. */
function commentFrom(text: string): string {
  let out = text
    .replace(/[*_~]+/g, ' ')
    .replace(EMOJI_RE, ' ')
    .replace(/\((\s*)\)/g, ' ')
    .trim();
  // Stripping emoji can orphan a bracket — "skipped ❌ (sleep 🛏️)" would
  // otherwise leave "skipped (sleep". Drop brackets that lost their partner.
  const opens = (out.match(/\(/g) ?? []).length;
  const closes = (out.match(/\)/g) ?? []).length;
  if (opens !== closes) out = out.replace(/[()]/g, ' ');
  // Bare status words carry no extra information; qualifiers do, so they stay.
  if (/^(done+|failed|skipped|complete[d]?|\?)[.!]*$/i.test(out)) out = '';
  // "done (distracted)" → "distracted"; keep the qualifier, drop the verb.
  // Only unwrap when the whole thing is that shape, so "skipped (sleep)" — which
  // has no leading verb to drop — keeps both of its brackets.
  const wrapped = /^(?:done+|skipped|failed)\s*!*\s*\((.+)\)\s*$/i.exec(out);
  if (wrapped) out = wrapped[1];
  else out = out.replace(/^(?:done+|skipped|failed)\s*!*\s+/i, '');
  // A comment we rendered as "(…)" comes back wrapped; unwrap it so a value
  // that already had brackets, like "[EAT]", doesn't accumulate more each save.
  const bare = /^\((.*)\)$/.exec(out.trim());
  if (bare && !bare[1].includes('(') && !bare[1].includes(')')) out = bare[1];
  out = out
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // "done !!!" leaves bare punctuation behind — emphasis, not a comment.
  return /^[!?.…\-–—]+$/.test(out) ? '' : out;
}

export interface ParseResult {
  day: Day;
  /** Lines the parser could not place, surfaced in the import preview. */
  ignored: string[];
}

export function parseNote(text: string, date: string): ParseResult {
  const day = emptyDay(date);
  const ignored: string[] = [];

  let lastSlot = 0;
  let pastBridge = false;
  /** Which block the BRIDGE line followed — the shape's own signature. */
  let bridgeAfter = 0;
  let goalSeq = 0;
  let noteSeq = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    // Fence markers are formatting; the prose between them is still a note.
    if (/^```/.test(line) || !line || RULE_RE.test(line)) continue;

    if (BRIDGE_RE.test(line)) {
      pastBridge = true;
      bridgeAfter = lastSlot;
      // Everything after BRIDGE belongs to the second half regardless of what
      // slot numbers the file used.
      lastSlot = Math.max(lastSlot, 6);
      continue;
    }

    const slot = SLOT_RE.exec(line);
    if (slot) {
      const index = Number(slot[1]);
      if (index >= 1 && index <= MAX_BLOCKS) {
        const body = slot[2];
        const struck = /~~/.test(rawLine);
        const status = struck && classifyStatus(body) === 'empty' ? 'skipped' : classifyStatus(body);
        // Notes that restart numbering mid-file are a second session on the same
        // day. Keep whichever pass recorded the better outcome, so a later
        // "failed the rest" block can't erase an hour already banked.
        // A file may carry more blocks than the day was created with — grow to
        // fit rather than dropping the tail on the floor.
        while (day.slots.length < index) {
          day.slots.push({ index: day.slots.length + 1, status: 'empty', note: '', mood: '' });
        }
        const prev = day.slots[index - 1];
        const next = { index, status, note: commentFrom(body), mood: extractMood(body) };
        day.slots[index - 1] = RANK[status] >= RANK[prev.status] ? next : prev;
        lastSlot = index;
        if (index > BRIDGE_AFTER) pastBridge = true;
        continue;
      }
      // A stray "13 -" (some notes overran) is noise, not a side note.
      ignored.push(line);
      continue;
    }

    const time = TIME_RE.exec(line);
    if (time) {
      const window = line.replace(/[*_~]+/g, '').trim();
      if (pastBridge || lastSlot >= 6) day.windowBottom = window;
      else day.windowTop = window;
      continue;
    }

    const label = LABEL_RE.exec(line);
    if (label) {
      // A goal takes effect from the *next* block, which is how the notes read.
      const startSlot = Math.min(lastSlot + 1, MAX_BLOCKS);
      const existing = day.goals.find((g) => g.startSlot === startSlot);
      if (existing) existing.label = label[1];
      else
        day.goals.push({
          id: `g${goalSeq++}-${date}`,
          label: label[1],
          detail: '',
          startSlot,
          color: goalSeq % 6,
        });
      continue;
    }

    // Loose prose: "eat", "rng drink", "at home", "FAILED THE REST".
    const clean = line.replace(/[*_~]+/g, '').trim();
    if (clean.length > 60) {
      ignored.push(clean);
      continue;
    }
    day.notes.push({ id: `n${noteSeq++}-${date}`, afterSlot: lastSlot, text: clean });
  }

  day.goals.sort((a, b) => a.startSlot - b.startSlot);

  /*
   * Which shape wrote this file. The BRIDGE's position is the signature: the
   * experimental day divides after block seven, and nothing else does. Block
   * count alone would be wrong — the notes this app grew out of ran to twelve
   * blocks, and those are history, not a longer schedule.
   */
  const shape = shapeOf({ schedule: 'experimental' });
  if (bridgeAfter === shape.perStage || day.slots.length > 12) {
    day.schedule = 'experimental';
  } else if (day.slots.length > SLOTS_PER_DAY) {
    // Blocks past the standard day in a standard file are the old twelve-block
    // notes. They are kept out of the day, and reported rather than dropped.
    for (const slot of day.slots.slice(SLOTS_PER_DAY)) {
      if (slot.status !== 'empty' || slot.note) {
        ignored.push(`${slot.index} — ${[slot.status, slot.note].filter(Boolean).join(' ').trim()}`);
      }
    }
    day.slots = day.slots.slice(0, SLOTS_PER_DAY);
  }
  return { day, ignored };
}

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/**
 * Best-effort date from a note filename. Handles `2026-07-29.md`,
 * `C - 21 july.md`, `F - july 17.md`. Returns null when there's nothing to go on
 * (`A.md`), leaving the caller to fall back to file mtime or ask the user.
 */
export function dateFromFilename(name: string, fallbackYear: number): string | null {
  const base = name.replace(/\.md$/i, '');

  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(base);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const lower = base.toLowerCase();
  const monthIndex = MONTH_NAMES.findIndex((m) => lower.includes(m));
  if (monthIndex >= 0) {
    // The day number is whichever 1-2 digit run sits next to the month name.
    const dayMatch = /(\d{1,2})/.exec(lower.replace(MONTH_NAMES[monthIndex], ' '));
    if (dayMatch) {
      const d = Number(dayMatch[1]);
      if (d >= 1 && d <= 31) {
        return `${fallbackYear}-${String(monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
  }
  return null;
}

/** Renders a Day back into the plain-text format, for export / clipboard. */
export function toMarkdown(day: Day): string {
  const out: string[] = [];
  const emit = (slotIndex: number) => {
    for (const g of day.goals.filter((x) => x.startSlot === slotIndex)) {
      out.push(g.detail ? `${g.label} — ${g.detail}` : g.label);
    }
    if (slotIndex === 1 && day.windowTop) out.push(day.windowTop);
  };

  // Notes anchored above the first block, written before any slot line.
  for (const n of day.notes.filter((x) => x.afterSlot <= 0)) out.push(n.text, '');

  // A day is written out at the length it was run, so a fourteen-block day
  // round-trips through Markdown as fourteen lines with the BRIDGE where its
  // own stages divide.
  const shape = shapeOf(day);
  const blocks = Math.max(shape.blocks, day.slots.length);
  const perStage = shape.perStage;
  const slotOf = (i: number) => day.slots[i - 1] ?? { index: i, status: 'empty' as const, note: '', mood: '' };
  for (let i = 1; i <= blocks; i++) {
    if (i === perStage + 1) {
      out.push('', 'BRIDGE', '');
      if (day.windowBottom) out.push(day.windowBottom);
    }
    emit(i);
    const slot = slotOf(i);
    const mark =
      slot.status === 'done' ? ' done ✅'
      : slot.status === 'partial' ? ` ${slot.note || 'partial'}`
      : slot.status === 'skipped' ? ' skipped ❌'
      : '';
    const comment = slot.status === 'partial' ? '' : slot.note ? ` (${slot.note})` : '';
    const mood = slot.mood ? ` ${slot.mood}` : '';
    out.push(`${i} -${mark}${comment}${mood}`);

    for (const n of day.notes.filter((x) => x.afterSlot === i)) out.push('', n.text, '');
  }
  return out.join('\n');
}
