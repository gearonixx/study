# wizzard

**[gearonixx.github.io/wizzard](https://gearonixx.github.io/wizzard/)**

A study tracker built around one rigid shape: **ten one-hour focus blocks a day,
in two stages of five, split by a BRIDGE — and the clock, not you, decides when
they run.** It's a direct port of the plain-text daily notes it replaces — the
same `1 - done ✅` / `~~3 -~~` vocabulary, the same mid-day project labels, the
same loose side notes — with a GitHub-style contribution graph on top so the
year of work is visible at a glance.

Everything is local. There is no database, no account, no telemetry. The whole
app is a static bundle plus `localStorage`.

## The day

```
STAGE 1   10:00 → 15:40      blocks 1–5, ten minutes between them
BRIDGE    15:40 → 16:10      thirty minutes
STAGE 2   16:10 → 21:50      blocks 6–10, ten minutes between them
```

Breaks sit *between* blocks only — five blocks means four breaks — so a stage is
5×60 + 4×10 = 5h40m and the day is 11h50m end to end. Every day, the same hours.

```
MATH                         ← goal, applies from block 1 onward
10:00 - 15:40                ← stage window
1 - done ✅
2 - distracted               ← comment on the block
3 -
eat                          ← side note between blocks
…
5 -
── BRIDGE ──
16:10 - 21:50
6 -
…
10 -
```

- **Blocks** have three states, cycled by clicking (right-click steps back):
  **clean** (green, a full hour), **dirty** (yellow, half an hour credited) and
  **skipped** (red, nothing). An hour you never answer for answers itself: an
  hour after a block closes, an unclaimed one goes red.
- **The day closes on arithmetic**: `Total = Clean + Dirty`, and
  `Skipped = 10 − Total`. It's printed under the blocks at full size.
- **Goals** are anchored to a block and stay in force until the next one starts,
  so "MATH for the morning, READING after the BRIDGE" is two goals.
- **Comments** go inline on the block; **moods** (✅✅ 😎 😈 😡 🛏️) go in the
  column beside it.
- **Side notes** pin loose context — `eat`, `train`, `procrastinated there`.

## The timer

Not a pomodoro you drive — a schedule that drives you. It starts itself at 10:00
local time and runs the shape above to 21:50. There is **no start, no pause, no
skip, no reset, and no setting that changes any of it.** It fires a desktop
notification and a chime at every phase change, and the ring is red while a
block is running, because a running block is not a neutral state.

Nothing is stored as a countdown — the wall clock *is* the state — so closing
the tab, reloading or sleeping the machine change nothing at all.

## Gamification

Streaks, XP and levels (quadratic curve — level *N* costs `100 × N` XP), plus 15
badges from *First block* through *Crossed the bridge* and *Raw, no breaks* to
*The full ten* and *1000 hours*.

## Graph

The GitHub contribution calendar, re-pointed at hours studied: 53 weeks,
Sunday-first, 10px cells with 3px gaps, GitHub's exact five-step green ramp.
0 hours is empty, 10 is the darkest green. Click any square to open that day.

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
src/lib/        types, schedule, storage, stats, achievements, timer, markdown parser, vault
src/components/ pages and UI
scripts/        bulk note importer, Markdown round-trip check
.github/        Pages deploy workflow
```

No backend, no dependencies beyond React.
