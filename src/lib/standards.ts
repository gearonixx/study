/**
 * The people the bar is set by.
 *
 * Shown on the break screen and while a block runs, so the thing in front of
 * you between hours is somebody who out-works you rather than a feed.
 *
 * Every line here is a plain, checkable description of what someone did — a
 * medal count, a role, a title. No invented quotes and no invented habits:
 * putting words in a real person's mouth to motivate yourself is a lie you
 * would eventually notice, and it would make the whole panel worthless. If you
 * want someone else on the wall, the roster is editable in Settings.
 */

export interface Standard {
  who: string;
  what: string;
}

export const STANDARDS: Standard[] = [
  { who: 'Gennady Korotkevich', what: 'six-time IOI gold, seven-time ICPC world finalist champion team' },
  { who: 'Scott Wu', what: 'IOI gold medallist; ICPC world finalist' },
  { who: 'Neal Wu', what: 'IOI gold medallist; Codeforces international grandmaster' },
  { who: 'Petr Mitrichev', what: 'IOI and ICPC champion; Google Code Jam winner' },
  { who: 'Makoto Soejima', what: 'IOI, IMO and Topcoder Open champion' },
  { who: 'Jane Street quantitative traders', what: 'hired out of the same olympiad pipeline you are training in' },
  { who: 'Alexandr Wang', what: 'IMO and IOI competitor before founding Scale AI' },
  { who: 'Terence Tao', what: 'IMO gold at thirteen; Fields Medal' },
];

/**
 * A standard chosen by the day and the block rather than at random, so it is
 * stable across a re-render — the panel must not shuffle while you look at it.
 */
export function standardFor(dayKey: string, block: number): Standard {
  let h = 0;
  for (const ch of `${dayKey}#${block}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return STANDARDS[h % STANDARDS.length];
}
