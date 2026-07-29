# wizzard

**[gearonixx.github.io/wizzard](https://gearonixx.github.io/wizzard/)**

A study tracker built around one rigid shape: **twelve one-hour focus blocks a
day, split by a BRIDGE.** It's a direct port of the plain-text daily notes it
replaces — the same `1 - done ✅` / `4 - FAILED ❌` / `~~3 -~~` vocabulary, the
same mid-day project labels, the same loose side notes — with a GitHub-style
contribution graph on top so the year of work is visible at a glance.

Everything is local. There is no database, no account, no telemetry. The whole
app is a static bundle plus `localStorage`.

## The day

```
MATH                         ← goal, applies from block 1 onward
00:00 - 12:00                ← session window
1 - done ✅
2 - distracted               ← comment on the block
3 -
eat                          ← side note between blocks
…
6 -
── BRIDGE ──
23:00 - 05:00 — raw, no breaks
7 -
…
12 -
```

- **Blocks** cycle `empty → done → partial → failed → skipped` on click
  (right-click steps back). `done` credits a full hour, `partial` a half.
- **Goals** are anchored to a block and stay in force until the next one starts,
  so "MATH for the morning, READING after the BRIDGE" is two goals.
- **Comments** go inline on the block; **moods** (✅✅ 😎 😈 😡 🛏️) go in the
  column beside it.
- **Side notes** pin loose context — `eat`, `train`, `procrastinated there`.

## The timer

Fixed and deliberately not configurable: **60 minutes work, 10 minutes rest,
chained automatically**, session counter walking 1 → 12. It ticks off each block
as its hour completes and fires a desktop notification and chime at every phase
change.

State is stored as timestamps, not a countdown, so closing the tab, reloading or
sleeping the machine all resolve correctly — coming back replays whatever phases
elapsed while you were away.

## Gamification

Streaks, XP and levels (quadratic curve — level *N* costs `100 × N` XP), plus 15
badges from *First block* through *Crossed the bridge* and *Raw, no breaks* to
*The full twelve* and *1000 hours*.

## Graph

The GitHub contribution calendar, re-pointed at hours studied: 53 weeks,
Sunday-first, 10px cells with 3px gaps, GitHub's exact five-step green ramp.
0 hours is empty, 12 is the darkest green. Click any square to open that day.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static bundle in dist/
```

`vite.config.ts` sets `base` to `/wizzard/` for Pages. Serving from a
domain root instead: `BASE_PATH=/ npm run build`.

## Importing existing notes

Settings → *Import .md* takes either a pasted note or a multi-select of `.md`
files, reading the date from each filename (`2026-07-29.md`, `C - 21 july.md`).

For a whole folder at once:

```bash
npm run import-notes -- ~/july --report   # check the parse
npm run import-notes -- ~/july > seed.json
```

Then Settings → *Restore JSON*.

## Keeping the data on disk

`localStorage` is the working copy. For something durable, Settings →
**Folder sync** asks for a directory and then mirrors every day into it as
`YYYY-MM-DD.md`, written as you work.

Point it at an Obsidian vault and the history is plain Markdown you can read,
edit and `git diff`; whatever already syncs that folder now syncs your study
log. Edits made outside the app are picked up on startup and on *Re-read
folder*, and files named the old way — `C - 21 july.md` — are understood too,
so an existing folder of notes loads with no import step.

`npm run check-roundtrip -- <dir>` asserts the property this relies on: a day
rendered to Markdown must parse back identically. CI runs it on every push.

Folder sync needs the File System Access API (Chrome/Edge). Elsewhere, the JSON
export/restore in Settings does the same job manually.

## GitHub sign-in (optional)

Fully usable signed out. Signing in adds your avatar to the header and enables
backup to a secret gist.

Sign-in is a personal access token with the `gist` scope. That's deliberate:
the site is static, and the OAuth code-for-token exchange needs a server
because GitHub's token endpoint sends no CORS headers. A token needs no server,
so the browser only ever talks to `api.github.com`, and the token never leaves
this machine.

## Layout

```
src/lib/        types, storage, stats, achievements, timer, markdown parser, vault
src/components/ pages and UI
scripts/        bulk note importer, Markdown round-trip check
.github/        Pages deploy workflow
```

No backend, no dependencies beyond React.
