/**
 * The people the bar is set by.
 *
 * Shown on the break screen and beside the shadow, so the thing in front of you
 * between hours is somebody who out-works you rather than a feed.
 *
 * ## Where these came from, and what they are not
 *
 * The descriptions below are lifted from the user's own atlas maps — already
 * researched, already checked — plus flat descriptors for the competitive
 * programmers. Every line is a role, a medal count or a title: a thing that is
 * either true or false and can be looked up.
 *
 * What is deliberately absent is any claim about what these people are doing
 * *right now*. The tempting version of this feature is a live ticker —
 * "Korotkevich just finished a problem while you sat there" — and it would
 * work on anybody. It would also be fabricated: these are real, named, living
 * people who are not studying alongside you, and inventing their minute-by-
 * minute activity is inventing facts about them. The first time you noticed one
 * was made up, every other line would become noise.
 *
 * The live, ahead-or-behind mechanic you actually want is in `ghost.ts`, where
 * it runs against a *pace* — including your own record day, replayed. A racing
 * ghost was never the other driver either.
 */

export interface Standard {
  who: string;
  what: string;
}

export const STANDARDS: Standard[] = [
  // Competitive programming — the pipeline this app's day is shaped for.
  {
    who: 'Gennady Korotkevich',
    what: 'six IOI golds and multiple ICPC world championships; the most decorated competitive programmer alive',
  },
  { who: 'Scott Wu', what: 'IOI gold medallist and ICPC world finalist; co-founder of Cognition' },
  { who: 'Neal Wu', what: 'IOI gold medallist; Codeforces international grandmaster' },
  { who: 'Petr Mitrichev', what: 'IOI and ICPC champion; Google Code Jam winner' },

  // The atlas roster, in the user's own researched words.
  {
    who: 'Andrej Karpathy',
    what: "founding OpenAI member, ex-Tesla AI director; creator of 'Zero to Hero' and nanochat",
  },
  {
    who: 'Tri Dao',
    what: 'Princeton professor and NVIDIA/Together researcher; author of FlashAttention',
  },
  {
    who: 'John Carmack',
    what: 'wrote Doom and Quake; now at Keen Technologies working on AGI',
  },
  {
    who: 'Demis Hassabis',
    what: 'co-founder and CEO of Google DeepMind; 2024 Nobel laureate for AlphaFold',
  },
  {
    who: 'Yann LeCun',
    what: 'Meta Chief AI Scientist and Turing Award laureate; pioneer of convolutional nets',
  },
  {
    who: 'Jim Fan',
    what: "NVIDIA Director of AI; co-leads GEAR lab and Project GR00T; OpenAI's first intern",
  },
  {
    who: 'François Chollet',
    what: 'creator of Keras; author of the ARC-AGI benchmark',
  },
  {
    who: 'Simon Willison',
    what: 'creator of Datasette; coined much of the working vocabulary for prompt injection',
  },
  {
    who: 'Andrew Ng',
    what: 'founder of DeepLearning.AI and Coursera; the original mass AI educator',
  },
  {
    who: 'GPU MODE',
    what: 'the CUDA/GPU-programming community — lectures, kernel-writing groups, a huge resource repo',
  },
  {
    who: 'David Goggins',
    what: 'retired Navy SEAL and ultra-endurance athlete; built a career out of refusing to stop when it stops being fun',
  },
  {
    who: 'Alexandr Wang',
    what: 'IMO and IOI competitor before founding Scale AI',
  },
  {
    who: 'Jane Street quantitative traders',
    what: 'recruited out of the same olympiad pipeline you are training in',
  },
  {
    who: 'Gaokao candidates',
    what: 'fourteen-hour study days sustained across an entire final year',
  },
];

/**
 * The roster as text, one per line, `Name — what they did`.
 *
 * Editable because the list should be *yours*. Anyone whose record I cannot
 * state accurately does not get a line I made up — you write it, in words you
 * can stand behind.
 */
export function rosterToText(list: Standard[]): string {
  return list.map((s) => `${s.who} — ${s.what}`).join('\n');
}

export function rosterFromText(text: string): Standard[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = /^(.+?)\s+[—-]\s+(.+)$/.exec(l);
      return m ? { who: m[1].trim(), what: m[2].trim() } : { who: l, what: '' };
    });
}

/**
 * A standard chosen by the day and the block rather than at random, so it is
 * stable across a re-render — the panel must not shuffle while you look at it.
 */
export function standardFor(dayKey: string, block: number, roster: Standard[] = STANDARDS): Standard {
  const list = roster.length ? roster : STANDARDS;
  let h = 0;
  for (const ch of `${dayKey}#${block}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}
