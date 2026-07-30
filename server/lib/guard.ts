/**
 * The write guard: pure functions, no database, so they can be tested directly.
 *
 * `users.data` is one row that every push overwrites. On 2026-07-30 a stale
 * device overwrote an afternoon of work and there was no history to roll back
 * to; history now exists (see db.ts), but the cheaper protection is simply not
 * accepting a write that throws a lot away in the first place.
 */

export interface Summary {
  days: number;
  hours: number;
}

/** Credited hours and day count. A dirty hour still counts as half. */
export function summarize(data: unknown): Summary {
  const days = (data as { days?: Record<string, { slots?: Array<{ status?: string }> }> })?.days ?? {};
  let hours = 0;
  for (const day of Object.values(days)) {
    for (const slot of day?.slots ?? []) {
      if (slot?.status === 'done') hours += 1;
      else if (slot?.status === 'partial') hours += 0.5;
    }
  }
  return { days: Object.keys(days).length, hours };
}

/**
 * Why this write should be refused, or null to let it through.
 *
 * Small losses are ordinary — clearing a day, un-marking an hour — so only a
 * wholesale collapse is blocked: a quarter of the record gone *and* enough of
 * it in absolute terms that it cannot be a normal edit. Both conditions have to
 * hold, which keeps the guard silent for someone with a handful of days and
 * meaningful for someone with a year.
 */
export function wouldDestroy(before: unknown, after: unknown): string | null {
  const a = summarize(before);
  const b = summarize(after);
  if (a.days === 0) return null;

  const daysLost = a.days - b.days;
  if (daysLost >= 3 && daysLost >= a.days * 0.25) {
    return `refusing to drop ${daysLost} of ${a.days} days`;
  }
  const hoursLost = a.hours - b.hours;
  if (hoursLost >= 5 && hoursLost >= a.hours * 0.25) {
    return `refusing to drop ${hoursLost} of ${a.hours} recorded hours`;
  }
  return null;
}
