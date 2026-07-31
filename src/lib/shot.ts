/**
 * The day, as an image you can hand to someone.
 *
 * Drawn onto a canvas by hand rather than rasterised from the DOM. Two reasons:
 * the extension runs under `script-src 'self'`, which rules out the usual
 * screenshot libraries, and — more importantly — rendering the page would
 * render *everything on it*, which is exactly the mistake this feature must not
 * make.
 *
 * ## What is deliberately not in here
 *
 * Every word the user wrote. Block comments, side notes, round goals: none of
 * it is drawn, and none of it is even read. What leaves the machine is the
 * shape of the day — how many hours, which blocks were clean, which were not —
 * and nothing about what the hours were spent on. A screenshot you have to
 * proof-read before sending is a screenshot nobody sends.
 */

import {
  roundStart,
  blocksOf,
  dayHours,
  type Day,
  type DayShape,
  type ScheduleId,
  type SlotStatus,
} from './types';
import { atClock, blockWindow } from './schedule';
import { formatLong } from './date';

/** Logical width of the image; height is whatever the day needs. */
const W = 660;
const PAD = 22;

interface Ink {
  fg: string;
  muted: string;
  subtle: string;
  rule: string;
  strong: string;
  surface: string;
  panel: string;
  accent: string;
  done: string;
  partial: string;
  skipped: string;
  idle: string;
  empty: string;
  mono: string;
  sans: string;
}

/**
 * Colours come from the live stylesheet rather than a second copy of the
 * palette, so the image cannot drift from the app it is a picture of.
 */
function ink(): Ink {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    fg: v('--fg', '#000'),
    muted: v('--fg-muted', '#666'),
    subtle: v('--fg-subtle', '#888'),
    rule: v('--border', '#e1e1e1'),
    strong: v('--border-strong', '#b9b9b9'),
    surface: v('--surface', '#fff'),
    panel: v('--surface-3', '#f5f5f5'),
    accent: v('--accent', '#3b5998'),
    done: v('--grid-3', '#30a14e'),
    partial: v('--warn', '#ff8c00'),
    skipped: v('--danger', '#f00'),
    idle: v('--idle', '#6f42c1'),
    empty: v('--border', '#e1e1e1'),
    mono: v('--font-mono', 'monospace'),
    sans: v('--font-sans', 'verdana, arial, sans-serif'),
  };
}

function colourOf(status: SlotStatus, k: Ink): string {
  return status === 'done' ? k.done
    : status === 'partial' ? k.partial
    : status === 'skipped' ? k.skipped
    : status === 'idle' ? k.idle
    : k.empty;
}

const MARK: Record<SlotStatus, string> = {
  done: '✓',
  partial: '◐',
  idle: '⊘',
  skipped: '✕',
  empty: '',
};

function rounded(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export interface ShotInput {
  day: Day;
  shape: DayShape;
  schedule: ScheduleId;
  /** Blocks per row of the strip; the whole day if it fits. */
  dailyGoal: number;
}

/**
 * Renders the day and hands back a canvas at `scale`× for a crisp export.
 * Height is measured first so the image is never padded with dead space.
 */
export function drawDay({ day, shape, schedule, dailyGoal }: ShotInput, scale = 2): HTMLCanvasElement {
  const k = ink();
  const blocks = blocksOf(shape);
  const statuses: SlotStatus[] = Array.from(
    { length: blocks },
    (_, i) => day.slots[i]?.status ?? 'empty',
  );

  const clean = statuses.filter((s) => s === 'done').length;
  const dirty = statuses.filter((s) => s === 'partial').length;
  const total = clean + dirty;
  const failed = blocks - total;
  const goal = Math.min(dailyGoal || blocks, blocks);

  // Measured with the very same increments the drawing below walks, so the
  // image ends where the content ends rather than on a guess with slack in it.
  const ROW = 21;
  const FOOT = 58;
  let H = PAD + 26 + 16 + 34 + 30;
  shape.rounds.forEach((count, i) => {
    if (i > 0) H += 11;
    H += 24 + count * ROW + 11;
  });
  H += FOOT;

  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const c = canvas.getContext('2d');
  if (!c) return canvas;
  c.scale(scale, scale);
  c.textBaseline = 'top';

  // Panel.
  c.fillStyle = k.surface;
  c.fillRect(0, 0, W, H);
  c.strokeStyle = k.strong;
  c.lineWidth = 1;
  c.strokeRect(0.5, 0.5, W - 1, H - 1);

  let y = PAD;

  // -- Header ---------------------------------------------------------------
  c.fillStyle = k.accent;
  c.font = `bold 17px ${k.sans}`;
  c.fillText('TimeForces', PAD, y);
  c.fillStyle = k.muted;
  c.font = `12px ${k.sans}`;
  const date = formatLong(day.date);
  c.fillText(date, W - PAD - c.measureText(date).width, y + 4);
  y += 26;

  c.strokeStyle = k.rule;
  c.beginPath();
  c.moveTo(PAD, y + 0.5);
  c.lineTo(W - PAD, y + 0.5);
  c.stroke();
  y += 16;

  // -- Hours ----------------------------------------------------------------
  const hours = dayHours(day);
  c.fillStyle = k.fg;
  c.font = `bold 22px ${k.mono}`;
  c.fillText(String(hours), PAD, y);
  const numW = c.measureText(String(hours)).width;
  c.fillStyle = k.muted;
  c.font = `12px ${k.sans}`;
  c.fillText(`/ ${goal} h`, PAD + numW + 6, y + 9);

  const barX = PAD + numW + 66;
  const barW = W - PAD - barX;
  c.fillStyle = k.rule;
  rounded(c, barX, y + 8, barW, 8, 4);
  c.fill();
  if (hours > 0) {
    c.fillStyle = k.done;
    rounded(c, barX, y + 8, Math.max(4, barW * Math.min(1, hours / goal)), 8, 4);
    c.fill();
  }
  y += 34;

  // -- The strip ------------------------------------------------------------
  // The same row of pips the timer shows, which is the day at a glance: one
  // pill per block, and a gap wherever a BRIDGE falls.
  const bridgeAfter = new Set<number>();
  {
    let n = 0;
    for (const count of shape.rounds.slice(0, -1)) {
      n += count;
      bridgeAfter.add(n);
    }
  }
  const gaps = bridgeAfter.size;
  const pipGap = 4;
  const bridgeGap = 14;
  const stripW = W - PAD * 2;
  const pipW = (stripW - (blocks - 1) * pipGap - gaps * (bridgeGap - pipGap)) / blocks;
  let px = PAD;
  statuses.forEach((status, i) => {
    c.fillStyle = colourOf(status, k);
    rounded(c, px, y, pipW, 9, 4.5);
    c.fill();
    px += pipW + (bridgeAfter.has(i + 1) ? bridgeGap : pipGap);
  });
  y += 30;

  // -- Rounds ---------------------------------------------------------------
  shape.rounds.forEach((count, i) => {
    const round = i + 1;
    const first = roundStart(shape, round);
    const last = first + count - 1;

    if (i > 0) {
      // The BRIDGE, drawn as the app draws it: a rule with the word in it.
      const midY = y - 11;
      c.fillStyle = k.subtle;
      c.font = `bold 9px ${k.mono}`;
      const label = 'BRIDGE';
      const lw = c.measureText(label).width + 16;
      c.strokeStyle = k.rule;
      c.beginPath();
      c.moveTo(PAD, midY + 0.5);
      c.lineTo((W - lw) / 2, midY + 0.5);
      c.moveTo((W + lw) / 2, midY + 0.5);
      c.lineTo(W - PAD, midY + 0.5);
      c.stroke();
      c.fillText(label, (W - c.measureText(label).width) / 2, midY - 5);
      y += 11;
    }

    // Round label and its wall-clock window. No goal text: that is the user's
    // own words about what the round was for, and words do not travel.
    c.fillStyle = k.muted;
    c.font = `bold 10px ${k.mono}`;
    c.fillText(`ROUND ${round}`, PAD, y + 2);
    const from = blockWindow(first, Date.now(), schedule);
    const to = blockWindow(last, Date.now(), schedule);
    const win = `${atClock(from.from)} – ${atClock(to.to)}`;
    c.font = `11px ${k.mono}`;
    c.fillStyle = k.subtle;
    c.fillText(win, PAD + 74, y + 2);
    y += 24;

    for (let b = first; b <= last; b++) {
      const status = statuses[b - 1] ?? 'empty';
      c.fillStyle = k.subtle;
      c.font = `11px ${k.mono}`;
      const n = String(b);
      c.fillText(n, PAD + 16 - c.measureText(n).width, y + 3);

      const bx = PAD + 24;
      const size = 15;
      if (status === 'empty') {
        c.strokeStyle = k.strong;
        rounded(c, bx + 0.5, y + 0.5, size, size, 2);
        c.stroke();
      } else {
        c.fillStyle = colourOf(status, k);
        rounded(c, bx, y, size, size, 2);
        c.fill();
        c.fillStyle = '#fff';
        c.font = `10px ${k.sans}`;
        const m = MARK[status];
        c.fillText(m, bx + (size - c.measureText(m).width) / 2, y + 3);
      }

      c.strokeStyle = k.rule;
      c.beginPath();
      c.moveTo(PAD, y + ROW - 3.5);
      c.lineTo(W - PAD, y + ROW - 3.5);
      c.stroke();
      y += ROW;
    }
    y += 11;
  });

  // -- Totals ---------------------------------------------------------------
  y = H - FOOT;
  c.fillStyle = k.panel;
  c.fillRect(1, y, W - 2, H - y - 1);
  c.strokeStyle = k.strong;
  c.beginPath();
  c.moveTo(0, y + 0.5);
  c.lineTo(W, y + 0.5);
  c.stroke();

  const cells: [string, string, string][] = [
    ['TOTAL', `${total}h`, k.fg],
    ['DIRTY', `${dirty}h`, k.partial],
    ['FAILED', `${failed}h`, k.skipped],
  ];
  const cellW = (W - PAD * 2) / 3;
  cells.forEach(([label, value, colour], i) => {
    const x = PAD + i * cellW;
    c.fillStyle = k.muted;
    c.font = `bold 9px ${k.mono}`;
    c.fillText(label, x, y + 12);
    c.fillStyle = colour;
    c.font = `bold 22px ${k.mono}`;
    c.fillText(value, x, y + 24);
  });

  return canvas;
}

/** A PNG blob of the canvas, for both saving and the clipboard. */
export function toPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
