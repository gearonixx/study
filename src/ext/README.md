# TimeForces as a Firefox extension

The whole app, plus a clock that keeps running when no tab is open.

## Why it exists

The website works, but it is a bad host for a schedule that has to speak on the
minute. Hide the tab and the browser throttles its timers to roughly once a
minute and parks its audio context; announcements then arrive late, silent, or
not at all. Closing the tab stops the day entirely.

A background page has none of those problems. It is woken by alarms the browser
honours, it talks to the OS notification centre directly, and it does not need a
tab at all.

## Where it lives

It is a **panel in the browser, not a tab**. Clicking the toolbar button drops a
400×600 popup under it, the way a VPN extension does — the page you were on
stays where it is.

| Surface | Opened by | Good for |
| --- | --- | --- |
| **Popup** | the toolbar button | a glance; closes when you click away |
| **Sidebar** | the ⇥ button in the popup | keeping it beside you all day |
| **Tab** | the ⤢ button in either panel | Board and Journal, which want width |

All three are the same `index.html`, told apart by a `?panel=` marker that
`ext/panel.ts` stamps onto `<html>` as `data-panel` before first paint. The
stylesheet's "Panel surfaces" section lays the app out for the room it has; the
existing phone rules already do most of that work, since a 400px panel is
narrower than the handsets they were drawn for.

Firefox puts the sidebar on the left by default. To move it: the sidebar's own
"…" menu → **Move sidebar to the right**, or set `sidebar.position_start` to
`false` in `about:config`. An extension cannot choose that for you.

## What you get

- **The entire site.** Today, Profile, Journal, Board, Achievements, Settings —
  the same build, the same code, the same `localStorage`. Nothing is cut down.
- **Announcements without a tab.** Every block, part, tick and BRIDGE, from the
  background page.
- **The day on the toolbar.** The button's badge counts the current stretch down
  in minutes and takes its colour from the phase — red inside a block, green on
  a break, purple on a BRIDGE. Hovering names it.
- **Clicking a notification** opens the sidebar beside the page you are on.

## Build and run

```bash
npm run ext:build      # → dist-ext/
npm run ext:run        # builds, then launches Firefox with it loaded
npm run ext:package    # → dist-ext-artifacts/timeforces-<version>.zip
npm run check-ext      # runs the background script against a simulated day
```

To load it by hand: `about:debugging` → This Firefox → Load Temporary Add-on →
pick `dist-ext/manifest.json`. A temporary add-on is unloaded when Firefox
closes; for a permanent install the zip has to be signed by AMO.

## How it fits together

| File | Role |
| --- | --- |
| `background.ts` | The clock. Alarms, notifications, sound, badge. No React. |
| `bridge.ts` | The app's half. Mirrors settings out, chimes on request. Inert on the web. |
| `panel.ts` | Which of the three surfaces this is, and the buttons between them. |
| `api.ts` | The slice of the WebExtension API this uses, hand-typed. |
| `manifest.json` | Source manifest; the version is stamped in at build time. |

Both halves import `lib/schedule.ts` and `lib/announce.ts`, so the page and the
background page cannot disagree about what the day is doing or how to say it.
That is deliberate: the bug where the BRIDGE announcement claimed "thirty
minutes into round 2" for a bridge that was neither came from exactly that kind
of drift, in a single copy.

### Who speaks

Three things could announce the same block, so each is gated:

- **The background page** owns announcements outright inside the extension. The
  app page passes `notifications: false, sound: false` to its own timer there.
- **Sound** is played by the background page when it can, and handed to an open
  tab when it cannot — a page has user activation that an alarm-woken background
  page may not.
- **Several open copies** of the app elect one speaker between them
  (`lib/leader.ts`, Web Locks with a `localStorage` lease as fallback), so three
  tabs do not mean three chimes.

### Permissions

`storage`, `alarms`, `notifications`. Deliberately not `tabs`: the app page
volunteers its own tab id over `runtime.sendMessage`, which is all the toolbar
button needs to focus it, and avoids "Access browser tabs" in the install
prompt.

### Storage

The app keeps using `localStorage`, which under `moz-extension://` is its own
persistent origin. The background page cannot read that, so `bridge.ts` mirrors
the four fields it needs — schedule, notifications, sound, and the per-day shape
stamps — into `browser.storage.local` whenever they change.

Because the extension is a separate origin from the website, the two do not
share a database. Move history across with Settings → Backups, or sign in and
let the gist sync carry it.
