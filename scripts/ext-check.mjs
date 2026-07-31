/**
 * Runs the built background script against a simulated browser and a simulated
 * day.
 *
 * The point of the extension is that it announces the day with no tab open, so
 * the thing worth testing is the background script exactly as it ships —
 * `dist-ext/background.js`, not the TypeScript it came from. It is loaded into
 * a VM whose `browser`, `AudioContext`, `Date` and timers are all under this
 * script's control, so a whole day can be played out in milliseconds and every
 * notification it produces inspected.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'dist-ext/background.js'), 'utf8');

/** Local-time epoch for a given h:m:s today. */
function at(h, m, s = 0) {
  const d = new Date();
  d.setHours(h, m, s, 0);
  return d.getTime();
}

function harness({ start, mirror }) {
  let now = start;
  let seq = 1;
  const timers = new Map();
  const alarms = new Map();
  const alarmListeners = [];
  const notifications = [];
  const chimes = [];
  const badges = [];
  const storage = { local: { mirror }, session: {} };

  const area = (name) => ({
    get: async (keys) => {
      const bag = storage[name];
      if (keys == null) return { ...bag };
      const list = Array.isArray(keys) ? keys : [keys];
      const out = {};
      for (const k of list) if (k in bag) out[k] = bag[k];
      return out;
    },
    set: async (items) => {
      Object.assign(storage[name], items);
    },
  });

  const browser = {
    runtime: {
      id: 'timeforces@test',
      getURL: (p) => `moz-extension://test/${p}`,
      onMessage: { addListener() {} },
      sendMessage: async () => {
        throw new Error('no receiving end');
      },
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
    },
    storage: { local: area('local'), session: area('session') },
    alarms: {
      create: (name, info) => {
        alarms.set(name, {
          when: info.when ?? now + (info.periodInMinutes ?? 1) * 60_000,
          period: info.periodInMinutes ? info.periodInMinutes * 60_000 : null,
        });
      },
      onAlarm: { addListener: (fn) => alarmListeners.push(fn) },
    },
    notifications: {
      create: async (id, options) => {
        notifications.push({ id, ...options, at: now });
        return id;
      },
      onClicked: { addListener() {} },
    },
    action: {
      setBadgeText: ({ text }) => badges.push({ text, at: now }),
      setBadgeBackgroundColor() {},
      setTitle() {},
      onClicked: { addListener() {} },
    },
    tabs: { create: async () => ({ id: 1 }), update: async () => ({ id: 1 }) },
    windows: { update: async () => ({}) },
  };

  // A context that always reports the simulated instant.
  class FakeDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }
    static now() {
      return now;
    }
  }

  const sandbox = {
    browser,
    Date: FakeDate,
    // The background falls back to messaging a tab when it cannot play sound
    // itself; with no AudioContext here it always takes that path, which is
    // exactly the "no tab open" case worth exercising.
    AudioContext: undefined,
    setTimeout: (fn, ms) => {
      const id = seq++;
      timers.set(id, { at: now + Math.max(0, ms | 0), fn });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    Promise,
    console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  const flush = async () => {
    for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
  };

  const nextDue = () => {
    let soonest = Infinity;
    for (const t of timers.values()) soonest = Math.min(soonest, t.at);
    for (const a of alarms.values()) soonest = Math.min(soonest, a.when);
    return soonest;
  };

  const fireDue = () => {
    for (const [id, t] of [...timers]) {
      if (t.at <= now) {
        timers.delete(id);
        t.fn();
      }
    }
    for (const [name, a] of [...alarms]) {
      if (a.when <= now) {
        if (a.period) a.when = now + a.period;
        else alarms.delete(name);
        for (const fn of alarmListeners) fn({ name });
      }
    }
  };

  return {
    notifications,
    chimes,
    badges,
    async advanceTo(target) {
      await flush();
      for (let guard = 0; guard < 100_000; guard++) {
        const due = nextDue();
        if (!Number.isFinite(due) || due > target) break;
        now = Math.max(now, due);
        fireDue();
        await flush();
      }
      now = target;
      fireDue();
      await flush();
    },
  };
}

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};

// --- The experimental day's second BRIDGE, with no tab open -----------------
{
  console.log('the background clock announces the experimental day');
  const h = harness({
    start: at(21, 49, 30),
    mirror: { schedule: 'experimental', notifications: true, sound: true, stamps: {} },
  });
  await h.advanceTo(at(21, 51, 0));

  const titles = h.notifications.map((n) => n.title);
  check('BRIDGE #2 is announced', titles.includes('BRIDGE #2'), titles.join(', '));
  const bridge = h.notifications.find((n) => n.title === 'BRIDGE #2');
  check(
    'and carries its own length and round',
    bridge?.message === '20 minutes. Round 3 opens at 22:10.',
    bridge?.message,
  );
  check(
    'exactly once',
    h.notifications.filter((n) => n.title === 'BRIDGE #2').length === 1,
    String(h.notifications.length),
  );
  check(
    'landing within a second of 21:50',
    bridge != null && Math.abs(bridge.at - at(21, 50, 0)) < 1000,
    bridge ? `${bridge.at - at(21, 50, 0)}ms late` : 'never fired',
  );
}

// --- The standard day ends where the experimental one changes gear ----------
{
  console.log('\nthe standard day ends where the experimental one carries on');
  const h = harness({
    start: at(21, 49, 30),
    mirror: { schedule: 'standard', notifications: true, sound: true, stamps: {} },
  });
  await h.advanceTo(at(21, 51, 0));
  const titles = h.notifications.map((n) => n.title);
  check('the day completes', titles.includes('Day complete'), titles.join(', '));
  check('and no BRIDGE #2 is invented', !titles.includes('BRIDGE #2'), titles.join(', '));
}

// --- A stamped day outranks the setting, same as in the app -----------------
{
  console.log('\na stamped day outranks the setting');
  const dayKey = new Date(at(12, 0)).toISOString().slice(0, 10);
  const h = harness({
    start: at(21, 49, 30),
    mirror: {
      schedule: 'standard',
      notifications: true,
      sound: true,
      stamps: { [dayKey]: 'experimental' },
    },
  });
  await h.advanceTo(at(21, 51, 0));
  const titles = h.notifications.map((n) => n.title);
  check('the stamped shape wins', titles.includes('BRIDGE #2'), titles.join(', '));
}

// --- A whole round, to see parts and ticks in order -------------------------
{
  console.log('\nan hour of a block, part by part');
  // Two minutes in, so the block's own start is already stale and only the
  // marks inside it are still to come.
  const h = harness({
    start: at(16, 12, 0),
    mirror: { schedule: 'standard', notifications: true, sound: true, stamps: {} },
  });
  await h.advanceTo(at(16, 31, 0));
  const titles = h.notifications.map((n) => n.title);
  check(
    'the ticks and parts arrive in order, once each',
    titles.join(' | ') ===
      [
        'Tick 1/3',
        'Tick 2/3',
        'Part 1/6, 50 minutes left',
        'Tick 1/3',
        'Tick 2/3',
        'Part 2/6, 40 minutes left',
      ].join(' | '),
    titles.join(' | '),
  );
  check('the badge counts the block down', h.badges.some((b) => b.text === '50'), '');
}

// --- Settings are obeyed ----------------------------------------------------
{
  console.log('\nthe settings are the settings');
  const h = harness({
    start: at(21, 49, 30),
    mirror: { schedule: 'experimental', notifications: false, sound: true, stamps: {} },
  });
  await h.advanceTo(at(21, 51, 0));
  check('notifications off means silence', h.notifications.length === 0, String(h.notifications.length));
  check('but the badge keeps working', h.badges.length > 0, '');
}

// --- Nothing stale is replayed ---------------------------------------------
{
  console.log('\na boundary slept through is not replayed');
  const h = harness({
    start: at(21, 55, 0),
    mirror: { schedule: 'experimental', notifications: true, sound: true, stamps: {} },
  });
  await h.advanceTo(at(21, 56, 0));
  check(
    'standing inside the BRIDGE says nothing',
    h.notifications.length === 0,
    h.notifications.map((n) => n.title).join(', '),
  );
}

console.log(failures ? `\n${failures} extension check(s) failed` : '\nall extension checks passed');
process.exit(failures ? 1 : 0);
