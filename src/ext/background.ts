/**
 * The extension's clock.
 *
 * This is the whole reason the extension exists. A web page is a bad host for a
 * schedule that has to speak on the minute: hide the tab and the browser
 * throttles its timers to about once a minute and parks its audio context, so
 * announcements arrive late, silent, or not at all. A background page is woken
 * by alarms the browser honours, talks to the OS notification centre directly,
 * and does not need a tab to be open at all.
 *
 * It runs the same `schedule.ts` and `announce.ts` as the page, so the two can
 * never disagree about what the day is doing or how to say it.
 */

import { runningSchedule, scheduleAt, type ScheduleNow } from '../lib/schedule';
import { dueAt, isFresh, nextEventAt, type Announcement } from '../lib/announce';
import { chime } from '../lib/chime';
import type { ScheduleId } from '../lib/types';
import { ext, type Alarm } from './api';
import type { Mirror } from './bridge';

if (!ext) throw new Error('background page loaded outside an extension');
const api = ext;

const APP_PAGE = api.runtime.getURL('index.html');
const ICON = api.runtime.getURL('icon-192.png');

/** Wakes the page even when it has been unloaded between boundaries. */
const HEARTBEAT = 'timeforces:heartbeat';
/** Aimed at the next boundary exactly, so nothing waits for the heartbeat. */
const BOUNDARY = 'timeforces:boundary';

const DEFAULTS: Mirror = {
  schedule: 'standard',
  notifications: true,
  sound: true,
  stamps: {},
};

async function settings(): Promise<Mirror> {
  try {
    const got = await api.storage.local.get('mirror');
    return { ...DEFAULTS, ...((got.mirror as Mirror | undefined) ?? {}) };
  } catch {
    return DEFAULTS;
  }
}

/**
 * What has already been said.
 *
 * Persisted, because an event page is torn down between alarms: a set held only
 * in memory would forget the last announcement every time the browser reclaimed
 * the page, and the next wake would repeat it. Session storage is the right
 * lifetime — a browser restart may safely forget, since the freshness window
 * already refuses anything stale.
 */
const SAID_KEY = 'said';
const SAID_MAX = 60;

function store() {
  return api.storage.session ?? api.storage.local;
}

async function alreadySaid(): Promise<string[]> {
  try {
    const got = await store().get(SAID_KEY);
    return (got[SAID_KEY] as string[] | undefined) ?? [];
  } catch {
    return [];
  }
}

async function remember(keys: string[]): Promise<void> {
  try {
    await store().set({ [SAID_KEY]: keys.slice(-SAID_MAX) });
  } catch {
    /* storage is best-effort; the freshness window is the real guard */
  }
}

/**
 * Sound, with a fallback.
 *
 * The background page usually can play audio, but it is woken by an alarm
 * rather than by the user, so a stricter autoplay policy can leave its context
 * suspended. An open app tab has been clicked at some point and has not, so it
 * is asked to speak whenever this page cannot.
 */
async function speak(a: Announcement): Promise<void> {
  if (await chime(a.kind)) return;
  try {
    await api.runtime.sendMessage({ type: 'chime', kind: a.kind });
  } catch {
    /* no page listening — the notification still carries the announcement */
  }
}

async function announce(a: Announcement, prefs: Mirror): Promise<void> {
  if (prefs.notifications) {
    try {
      // A fresh id every time: a notification that reuses one replaces the
      // notification already on screen, and replacement is silent.
      await api.notifications.create(`timeforces:${a.key}:${Date.now()}`, {
        type: 'basic',
        iconUrl: ICON,
        title: a.title,
        message: a.body ?? '',
      });
    } catch {
      /* notifications can be off at the OS level; sound still lands */
    }
  }
  if (prefs.sound) await speak(a);
}

/** Minutes left, on the toolbar button, so the day is legible without opening it. */
const TINT: Record<ScheduleNow['phase'], string> = {
  block: '#d73a49',
  break: '#2da44e',
  bridge: '#8250df',
  before: '#57606a',
  after: '#57606a',
};

function badge(state: ScheduleNow): void {
  const mins = Math.max(0, Math.ceil(state.remaining / 60_000));
  const text =
    state.phase === 'after' ? ''
    : state.phase === 'before' ? '·'
    : mins >= 60 ? `${Math.floor(mins / 60)}h`
    : `${mins}`;
  const title =
    state.phase === 'block' ? `Block ${state.block} of ${state.blocks} — ${mins} min left`
    : state.phase === 'break' ? `Break — block ${state.nextBlock} in ${mins} min`
    : state.phase === 'bridge' ? `BRIDGE — ${mins} min left`
    : state.phase === 'before' ? `Opens in ${mins} min`
    : 'Day complete';
  try {
    api.action.setBadgeText({ text });
    api.action.setBadgeBackgroundColor({ color: TINT[state.phase] });
    api.action.setTitle({ title: `TimeForces — ${title}` });
  } catch {
    /* the button is cosmetic; never let it break the clock */
  }
}

let alive: ReturnType<typeof setTimeout> | null = null;

/**
 * One sample at a time.
 *
 * Three things can wake this page — the boundary alarm, the heartbeat, and the
 * timer it keeps while alive — and on a boundary they tend to arrive together.
 * Chaining them means the second waits for the first to have claimed what it
 * said rather than racing it.
 */
let queue: Promise<void> = Promise.resolve();
function tick(): Promise<void> {
  queue = queue.then(sample, sample);
  return queue;
}

/**
 * Read the clock, say what it owes, and arm the next wake.
 *
 * Deliberately has no notion of "the first sample". The page can swallow the
 * stretch it opened inside because opening it is not news; this cannot, because
 * being torn down and woken up *is* how it reaches a boundary. The persisted
 * said-set and the freshness window do that job instead.
 */
async function sample(): Promise<void> {
  const t = Date.now();
  const prefs = await settings();
  // A stamped day outranks the setting, the same way it does in the app.
  const days: Record<string, { schedule?: ScheduleId }> = {};
  for (const [key, schedule] of Object.entries(prefs.stamps)) days[key] = { schedule };
  const state = scheduleAt(t, runningSchedule(days, prefs.schedule, t));

  badge(state);

  const said = new Set(await alreadySaid());
  const speaking: Announcement[] = [];
  let added = false;
  for (const a of dueAt(state, t)) {
    if (said.has(a.key)) continue;
    said.add(a.key);
    added = true;
    if (isFresh(a, t)) speaking.push(a);
  }
  // Claim them *before* saying them. Announcing is slow — a notification and a
  // chime — and a boundary alarm, the heartbeat and the live timer can all come
  // due on the same instant; anything that reads the set while this one is
  // still talking has to see the keys already taken, or the announcement lands
  // twice.
  if (added) await remember([...said]);
  for (const a of speaking) await announce(a, prefs);

  const next = nextEventAt(state, t);
  api.alarms.create(BOUNDARY, { when: next });
  // While this page is still alive, hit the boundary on the nose rather than
  // waiting on an alarm the browser is free to round off.
  if (alive) clearTimeout(alive);
  alive = setTimeout(() => void tick(), Math.max(250, Math.min(next - Date.now() + 40, 30_000)));
}

/**
 * Where the app is already open.
 *
 * Learned from the page itself rather than looked up, because finding a tab by
 * URL needs the `tabs` permission — "Access browser tabs" in the install
 * prompt — for something the page can simply volunteer. Kept in session storage
 * so it survives this page being unloaded between alarms.
 */
async function knownTab(): Promise<{ id: number; windowId?: number } | null> {
  try {
    const got = await store().get('appTab');
    return (got.appTab as { id: number; windowId?: number } | undefined) ?? null;
  } catch {
    return null;
  }
}

/** The app is one page; clicking the button should never open a second copy. */
async function openApp(): Promise<void> {
  const known = await knownTab();
  if (known) {
    try {
      await api.tabs.update(known.id, { active: true });
      if (known.windowId != null) await api.windows.update(known.windowId, { focused: true });
      return;
    } catch {
      /* that tab is gone; open a fresh one */
    }
  }
  const tab = await api.tabs.create({ url: APP_PAGE });
  if (tab.id != null) {
    await store().set({ appTab: { id: tab.id, windowId: tab.windowId } });
  }
}

api.runtime.onMessage.addListener((msg, sender) => {
  const m = msg as { type?: string } | null;
  if (m?.type === 'hello' && sender.tab?.id != null) {
    void store().set({ appTab: { id: sender.tab.id, windowId: sender.tab.windowId } });
  }
  return undefined;
});

/**
 * Clicking a notification brings the app up beside the page rather than
 * yanking you to another tab — the sidebar is the same panel the toolbar button
 * opens, just pinned. A tab is the fallback where there is no sidebar to open.
 */
api.notifications.onClicked.addListener(() => {
  try {
    if (api.sidebarAction) {
      api.sidebarAction.open();
      return;
    }
  } catch {
    /* not treated as a user gesture here; fall back to a tab */
  }
  void openApp();
});

// Only reachable when no popup is configured; harmless to keep either way.
api.action.onClicked.addListener(() => void openApp());

api.alarms.onAlarm.addListener((alarm: Alarm) => {
  if (alarm.name === HEARTBEAT || alarm.name === BOUNDARY) void tick();
});

api.runtime.onInstalled.addListener(() => void start());
api.runtime.onStartup.addListener(() => void start());

function start(): Promise<void> {
  // The heartbeat is the safety net: if an exact-boundary alarm is rounded off
  // or the page dies mid-flight, this still brings it back inside the freshness
  // window, so an announcement is late at worst rather than lost.
  api.alarms.create(HEARTBEAT, { periodInMinutes: 1 });
  return tick();
}

void start();
