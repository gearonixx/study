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
  /**
   * GitHub handle, where I am sure of it — blank rather than guessed, because
   * a link that 404s is worse than no link on a list whose whole value is that
   * nothing on it was invented.
   */
  gh?: string;
  /** A blog, a lab page, an arXiv paper — wherever the actual work is. */
  site?: string;
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

  // The atlas roster, in the maps' own researched words.
  {
    who: 'Andrej Karpathy',
    what: "founding OpenAI member, ex-Tesla AI director; creator of 'Zero to Hero' and nanochat",
    gh: 'karpathy',
    site: 'karpathy.github.io',
  },
  {
    who: 'Tri Dao',
    what: 'Princeton professor and NVIDIA/Together researcher; author of FlashAttention',
    gh: 'tridao',
    site: 'tridao.me',
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
    gh: 'ylecun',
  },
  {
    who: 'Jim Fan',
    what: "NVIDIA Director of AI; co-leads GEAR lab and Project GR00T; OpenAI's first intern",
  },
  {
    who: 'François Chollet',
    what: 'creator of Keras; author of the ARC-AGI benchmark',
    gh: 'fchollet',
    site: 'arxiv.org/abs/1911.01547',
  },
  {
    who: 'Simon Willison',
    what: 'creator of Datasette; coined much of the working vocabulary for prompt injection',
    gh: 'simonw',
    site: 'simonwillison.net',
  },
  {
    who: 'Jeremy Howard',
    what: 'co-founder of fast.ai and answer.ai; champion of practical, accessible AI education',
    gh: 'jph00',
    site: 'fast.ai',
  },
  {
    who: 'Andrew Ng',
    what: 'founder of DeepLearning.AI and Coursera; the original mass AI educator',
  },
  {
    who: 'GPU MODE',
    what: 'the CUDA/GPU-programming community — lectures, kernel-writing groups, a huge resource repo',
    gh: 'gpu-mode',
  },

  // Named directly. Each line is a role or a record that can be looked up.
  {
    who: 'James Scholz',
    what: 'publishes multi-hour real-time study sessions — the whole grind, unedited, no soundtrack',
  },
  {
    who: 'Jonny Kim',
    what: 'Navy SEAL, then Harvard-trained physician, then NASA astronaut — three careers most people would not finish one of',
  },
  {
    who: 'George Hotz',
    what: 'first to unlock the iPhone and break the PS3; founded comma.ai and tinygrad',
    gh: 'geohot',
    site: 'tinygrad.org',
  },

  // Vulnerability research — the register the work actually happens in.
  {
    who: 'Tavis Ormandy',
    what: 'Google Project Zero; among the most prolific vulnerability researchers alive',
    gh: 'taviso',
    site: 'googleprojectzero.blogspot.com',
  },
  {
    who: 'Natalie Silvanovich',
    what: 'Google Project Zero; zero-click messaging attack surface, including iMessage',
    gh: 'natashenka',
    site: 'googleprojectzero.blogspot.com',
  },
  {
    who: 'Mark Dowd',
    what: 'co-author of The Art of Software Security Assessment; founded Azimuth Security',
  },
  {
    who: 'Thomas Dullien (Halvar Flake)',
    what: 'binary analysis and reverse engineering; founded zynamics, later Google Project Zero',
  },

  {
    who: 'David Goggins',
    what: 'retired Navy SEAL and ultra-endurance athlete; built a career out of refusing to stop when it stops being fun',
  },
  {
    who: 'Alexandr Wang',
    what: 'IMO and IOI competitor before founding Scale AI',
  },
  // --- More of the same bar -------------------------------------------------

  // Competitive programming and mathematics.
  {
    who: 'Benjamin Qi (Benq)',
    what: 'IOI gold medallist; author of the USACO Guide that a generation trains on',
    gh: 'bqi343',
  },
  {
    who: 'Kamil Debowski (Errichto)',
    what: 'ICPC world finalist; teaches the solutions live, at speed',
    gh: 'Errichto',
  },
  {
    who: 'Terence Tao',
    what: 'IMO gold at thirteen; Fields Medal; still posts working notes in public',
    site: 'terrytao.wordpress.com',
  },

  // Systems and AI — where the kernels actually get written.
  {
    who: 'Fabrice Bellard',
    what: 'wrote FFmpeg, QEMU, TCC and QuickJS, largely alone',
    site: 'bellard.org',
  },
  {
    who: 'Chris Lattner',
    what: 'created LLVM and Swift; now building Mojo at Modular',
    gh: 'lattner',
  },
  {
    who: 'Daniel Lemire',
    what: 'performance research in the open — simdjson and a blog of measured claims',
    gh: 'lemire',
    site: 'lemire.me',
  },
  {
    who: 'Horace He',
    what: 'PyTorch compiler internals; writes the posts people cite about GPU performance',
    gh: 'Chillee',
  },
  {
    who: 'Sebastian Raschka',
    what: 'builds LLMs from scratch in public so the internals stop being magic',
    gh: 'rasbt',
  },
  {
    who: 'Lilian Weng',
    what: 'long-form technical surveys that became the field\'s reference notes',
    site: 'lilianweng.github.io',
  },
  {
    who: 'Ilya Sutskever',
    what: 'AlexNet co-author, OpenAI co-founder; now Safe Superintelligence',
  },
  {
    who: 'Geoffrey Hinton',
    what: 'Turing Award and 2024 Nobel laureate; backpropagation and deep learning',
  },
  {
    who: 'Jeff Dean',
    what: 'Google Chief Scientist; MapReduce, Bigtable, Spanner, TensorFlow',
  },

  // Vulnerability research and offensive security.
  {
    who: 'Orange Tsai',
    what: 'DEVCORE; repeat Pwnie winner for web and SSRF chains nobody saw coming',
    gh: 'orangetw',
  },
  {
    who: 'James Kettle',
    what: 'PortSwigger research director; HTTP request smuggling and desync attacks',
    gh: 'albinowax',
  },
  {
    who: 'Ian Beer',
    what: 'Google Project Zero; full iOS exploit chains, published start to finish',
    site: 'googleprojectzero.blogspot.com',
  },
  {
    who: 'Maddie Stone',
    what: 'Google Project Zero; tracks the 0-days actually being used in the wild',
    site: 'googleprojectzero.blogspot.com',
  },
  {
    who: 'samczsun',
    what: 'Paradigm; has quietly saved more of DeFi than most protocols have shipped',
    gh: 'samczsun',
    site: 'samczsun.com',
  },
  {
    who: 'Trail of Bits',
    what: 'publishes its tooling and its findings — the whole method, in the open',
    gh: 'trailofbits',
    site: 'blog.trailofbits.com',
  },

  // Markets.
  {
    who: 'Jim Simons',
    what: 'mathematician who built Renaissance Technologies and the Medallion fund',
  },
  {
    who: 'Ed Thorp',
    what: 'beat blackjack, then beat the market, and wrote down how both times',
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
  return list
    .map((s) => {
      const bits = [s.who, s.what];
      if (s.gh) bits.push(`gh:${s.gh}`);
      if (s.site) bits.push(s.site);
      return bits.join(' — ');
    })
    .join('\n');
}

export function rosterFromText(text: string): Standard[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      // Descriptions carry their own dashes — "the CUDA community — lectures,
      // …" — so the separator cannot simply be split on. Only trailing
      // segments that *look* like links are taken as links; whatever is left in
      // the middle is the description, dashes and all.
      const parts = l.split(/\s+[—–-]\s+/);
      const who = (parts.shift() ?? l).trim();
      const out: Standard = { who, what: '' };
      const isLink = (x: string) =>
        x.startsWith('gh:') || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(x);
      while (parts.length > 1 && isLink(parts[parts.length - 1].trim())) {
        const tail = (parts.pop() ?? '').trim();
        if (tail.startsWith('gh:')) out.gh = tail.slice(3);
        else out.site = tail;
      }
      out.what = parts.join(' — ').trim();
      return out;
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
