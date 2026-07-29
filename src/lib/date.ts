/** Local-time date helpers. Everything keys off `YYYY-MM-DD` in the user's own
 *  timezone — never UTC, or a late-night session lands on the wrong square. */

export function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(): string {
  return toKey(new Date());
}

export function addDays(key: string, delta: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + delta);
  return toKey(d);
}

export function diffDays(a: string, b: string): number {
  const ms = fromKey(a).getTime() - fromKey(b).getTime();
  return Math.round(ms / 86_400_000);
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function monthShort(monthIndex: number): string {
  return MONTHS[monthIndex];
}

/** "Wed, 29 Jul 2026" */
export function formatLong(key: string): string {
  const d = fromKey(key);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "29 Jul 2026" */
export function formatShort(key: string): string {
  const d = fromKey(key);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Today" / "Yesterday" / "3 days ago" / falls back to a short date. */
export function formatRelative(key: string): string {
  const delta = diffDays(todayKey(), key);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Yesterday';
  if (delta === -1) return 'Tomorrow';
  if (delta > 1 && delta < 30) return `${delta} days ago`;
  if (delta < -1 && delta > -30) return `in ${-delta} days`;
  return formatShort(key);
}

/**
 * Calendar grid for a GitHub-style contribution graph: columns of 7 days each,
 * Sunday-first, ending on `endKey` and covering `weeks` columns.
 * Days outside the range come back as `null` so the corners stay empty.
 */
export function contributionGrid(endKey: string, weeks: number): (string | null)[][] {
  const end = fromKey(endKey);
  // Walk forward to the Saturday that closes the final column.
  const lastCol = new Date(end);
  lastCol.setDate(lastCol.getDate() + (6 - lastCol.getDay()));

  const cols: (string | null)[][] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const col: (string | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const cur = new Date(lastCol);
      cur.setDate(cur.getDate() - (w * 7 + (6 - d)));
      col.push(cur > end ? null : toKey(cur));
    }
    cols.push(col);
  }
  return cols;
}
