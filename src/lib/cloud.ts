/**
 * Optional cloud sync. When `VITE_API_BASE` is set at build time, the app can
 * "Sign in with GitHub" and keep the canonical database on the server, so the
 * same account sees the same data on any device. localStorage stays the local
 * cache and the JSON export stays the portable copy.
 *
 * When `VITE_API_BASE` is unset, everything here no-ops and the app is exactly
 * the local-first tool it was before.
 */

import { blocksOf, SCHEDULES, type Database, type Day, type Slot, type SlotStatus } from './types';
import { normalize } from './storage';

const API = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '');
export const cloudConfigured = API !== '';

const TOKEN_KEY = 'timeforces:cloud:token:v1';
const USER_KEY = 'timeforces:cloud:user:v1';
/** The names the session lived under before the project was renamed. */
const LEGACY_SESSION: [string, string][] = [['study:cloud:token:v1', 'study:cloud:user:v1']];

/**
 * Adopts a session stored under an older name, once. Without this a rename
 * would silently sign everyone out — and a signed-out device syncs nothing.
 */
function adoptLegacySession(): void {
  // The merge is exercised by a node script in CI, where there is no storage.
  if (typeof localStorage === 'undefined') return;
  try {
    if (localStorage.getItem(TOKEN_KEY)) return;
    for (const [token, user] of LEGACY_SESSION) {
      const t = localStorage.getItem(token);
      if (!t) continue;
      localStorage.setItem(TOKEN_KEY, t);
      const u = localStorage.getItem(user);
      if (u) localStorage.setItem(USER_KEY, u);
      return;
    }
  } catch {
    /* a session that can't be carried over just means signing in again */
  }
}
adoptLegacySession();

export interface CloudUser {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): CloudUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as CloudUser) : null;
  } catch {
    return null;
  }
}

function setSession(token: string, user: CloudUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function signOut(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/** Sends the browser to GitHub to sign in, returning to this exact page after. */
export function signIn(): void {
  if (!cloudConfigured) return;
  location.href = `${API}/api/auth/login?redirect=${encodeURIComponent(location.href)}`;
}

/**
 * If we just came back from GitHub (`?wz_code=...`), trade it for a session
 * token and store it, stripping the param from the URL either way. Returns the
 * signed-in user, or null when not configured / not signed in.
 */
export async function completeSignIn(): Promise<CloudUser | null> {
  if (!cloudConfigured) return null;
  const url = new URL(location.href);
  const code = url.searchParams.get('wz_code');
  if (!code) return getUser();

  url.searchParams.delete('wz_code');
  history.replaceState(null, '', url.toString());

  const res = await fetch(`${API}/api/auth/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error('sign-in failed');
  const { token, user } = (await res.json()) as { token: string; user: CloudUser };
  setSession(token, user);
  return user;
}

async function authed(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  if (!token) throw new Error('not signed in');
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (res.status === 401) {
    signOut();
    throw new Error('session expired — sign in again');
  }
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res;
}

export async function pull(): Promise<{ db: Database | null; updatedAt: number | null }> {
  const res = await authed('/api/data', { method: 'GET' });
  const { db, updatedAt } = (await res.json()) as { db: unknown; updatedAt: string | null };
  return { db: db ? normalize(db) : null, updatedAt: updatedAt ? Date.parse(updatedAt) : null };
}

export async function push(db: Database): Promise<number | null> {
  const res = await authed('/api/data', { method: 'PUT', body: JSON.stringify(db) });
  const { updatedAt } = (await res.json()) as { updatedAt: string | null };
  return updatedAt ? Date.parse(updatedAt) : null;
}

/**
 * Reconciles two copies of the database without losing either side.
 *
 * The rule that matters is that this merges a *slot at a time*, not a day at a
 * time. Taking whole days by timestamp is what erased an afternoon of work on
 * 2026-07-30: a second device, left open with a copy from hours earlier, let
 * its lapse sweep auto-skip two blocks, stamped the day 18:21, and pushed. The
 * laptop — which had those two blocks marked done and a note on a third —
 * pulled, saw a newer day, and replaced its own wholesale.
 *
 * So:
 *  - slots merge individually, and an *answer* always beats an *inference*
 *    (`auto`, written by the lapse sweep) no matter which is newer;
 *  - text is never dropped just because the other side lacks it — only a later,
 *    slot-stamped edit can clear a note;
 *  - days, goals and day notes union rather than replace;
 *  - unlocked badges keep the earliest earn time seen anywhere.
 *
 * Days written before slots carried their own stamps fall back to the day's.
 */
function stampOf(slot: Slot, day: Day): number {
  return slot.updatedAt ?? day.updatedAt ?? 0;
}

/**
 * A status the clock produced rather than the user. Besides the explicit flag,
 * an *unstamped* `skipped` counts: the lapse sweep is the only thing that
 * writes `skipped` without anyone acting, and copies written before this
 * version recorded no way to tell the two apart. Reading those as inferred is
 * what stops a device still running the old build from erasing an answer.
 */
function inferred(slot: Slot): boolean {
  return slot.auto === true || (slot.status === 'skipped' && slot.updatedAt === undefined);
}

/**
 * Silence: a slot nobody has answered. An `empty` that carries its own stamp is
 * not silence — it is a deliberate clear, and it is allowed to win on time.
 */
function silent(slot: Slot): boolean {
  return slot.status === 'empty' && slot.updatedAt === undefined;
}

/** An answer the user actually gave: not silence, and not the clock guessing. */
function answered(slot: Slot): boolean {
  return slot.status !== 'empty' && !inferred(slot);
}

/** Fixed precedence, only ever used to break an exact stamp tie deterministically. */
const RANK: Record<SlotStatus, number> = { done: 3, partial: 2, skipped: 1, empty: 0 };

/**
 * Later text wins, but only a side that carries its own stamp is allowed to
 * clear text the other side still has — otherwise a legacy copy with no slot
 * stamps would silently delete notes.
 */
function mergeText(a: string, b: string, aSlot: Slot, bSlot: Slot, ta: number, tb: number): string {
  if (a === b) return a;
  // Only an explicitly stamped, later edit may clear text. A copy that simply
  // never had it — an older build, or a device that hasn't seen it yet — can't.
  if (!a) return aSlot.updatedAt !== undefined && ta > tb ? a : b;
  if (!b) return bSlot.updatedAt !== undefined && tb > ta ? b : a;
  if (ta !== tb) return ta > tb ? a : b;
  return a > b ? a : b; // identical stamps: deterministic, so both devices agree
}

function mergeSlot(a: Slot, aDay: Day, b: Slot, bDay: Day): Slot {
  const ta = stampOf(a, aDay);
  const tb = stampOf(b, bDay);

  // Neither silence nor an inference may overwrite an answer, however much
  // later it was written. Everything else is decided by time, which keeps a
  // deliberate clear-back-to-empty working.
  const winner =
    answered(a) && (inferred(b) || silent(b)) ? a
    : answered(b) && (inferred(a) || silent(a)) ? b
    : ta !== tb ? (ta > tb ? a : b)
    : RANK[a.status] >= RANK[b.status] ? a
    : b;

  const note = mergeText(a.note, b.note, a, b, ta, tb);
  const mood = mergeText(a.mood, b.mood, a, b, ta, tb);
  const merged: Slot = { index: a.index, status: winner.status, note, mood };

  // The slot is as old as the newest thing that actually survived in it — a
  // losing auto-skip must not lend the slot its own, later timestamp.
  const stamps = [winner === a ? ta : tb];
  if (note) stamps.push(a.note === note ? ta : tb);
  if (mood) stamps.push(a.mood === mood ? ta : tb);
  if (a.updatedAt !== undefined || b.updatedAt !== undefined) merged.updatedAt = Math.max(...stamps);
  if (winner.auto === true) merged.auto = true;
  return merged;
}

/** The shape to carry forward: whichever of the two has room for more blocks. */
function shapeIdOf(a: Day, b: Day): Day['schedule'] {
  const rank = (d: Day) => (d.schedule ? blocksOf(SCHEDULES[d.schedule]) : 0);
  return rank(a) >= rank(b) ? a.schedule : b.schedule;
}

function mergeDay(a: Day, b: Day): Day {
  const ta = a.updatedAt ?? 0;
  const tb = b.updatedAt ?? 0;
  const newer = ta >= tb ? a : b;
  const older = newer === a ? b : a;

  // Goals and day notes union by id: an id present on one side only is kept,
  // and one present on both takes the newer day's copy.
  const byId = <T extends { id: string }>(xs: T[], ys: T[]): T[] => {
    const out = new Map<string, T>();
    for (const y of ys) out.set(y.id, y);
    for (const x of xs) out.set(x.id, x);
    return [...out.values()];
  };

  // Whichever side has more slots decides the length: a fourteen-block day
  // merged against a ten-block copy must not come back as ten.
  const length = Math.max(a.slots.length, b.slots.length);
  const slots = Array.from({ length }, (_, i) => {
    const x = a.slots[i];
    const y = b.slots[i];
    if (!x) return y;
    if (!y) return x;
    return mergeSlot(x, a, y, b);
  });

  return {
    date: a.date,
    // The longer shape wins, for the same reason: it is the one with room for
    // everything either side recorded.
    ...(shapeIdOf(a, b) ? { schedule: shapeIdOf(a, b) } : {}),
    slots,
    goals: byId(newer.goals, older.goals).sort((x, y) => x.startSlot - y.startSlot),
    notes: byId(newer.notes, older.notes),
    windowTop: newer.windowTop || older.windowTop,
    windowBottom: newer.windowBottom || older.windowBottom,
    updatedAt: Math.max(ta, tb),
  };
}

export function mergeDatabases(local: Database, remote: Database): Database {
  const days: Record<string, Day> = { ...remote.days };
  for (const [date, ld] of Object.entries(local.days)) {
    const rd = days[date];
    days[date] = rd ? mergeDay(ld, rd) : ld;
  }

  const unlocked: Record<string, number> = { ...remote.unlocked };
  for (const [id, ts] of Object.entries(local.unlocked)) {
    unlocked[id] = unlocked[id] ? Math.min(unlocked[id], ts) : ts;
  }

  return {
    version: 1,
    days,
    settings: { ...local.settings, ...remote.settings },
    unlocked,
  };
}

/* -- History --------------------------------------------------------------- */

export interface Snapshot {
  id: string;
  createdAt: string;
  days: number;
  hours: number;
}

/** Every version the server still holds, newest first. */
export async function fetchSnapshots(): Promise<Snapshot[]> {
  const res = await authed('/api/snapshots', { method: 'GET' });
  return ((await res.json()) as { snapshots: Snapshot[] }).snapshots;
}

/** One version, ready to be merged in. */
export async function fetchSnapshot(id: string): Promise<Database> {
  const res = await authed(`/api/snapshots?id=${encodeURIComponent(id)}`, { method: 'GET' });
  return normalize(((await res.json()) as { db: unknown }).db);
}

/* -- Public endpoints ------------------------------------------------------ */

export interface LeaderRow {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  totalHours: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  last7: number;
  lastActive: string | null;
  /** ISO timestamp of the first sign-in — the account's start line. */
  joinedAt: string;
}

export interface PublicProfile extends LeaderRow {
  /** Credited hours per ISO date. Notes and goals are never published. */
  hours: Record<string, number>;
}

/** The standings. Public — no token, no sign-in needed to look. */
export async function fetchLeaderboard(today: string): Promise<LeaderRow[]> {
  const res = await fetch(`${API}/api/leaderboard?today=${today}`);
  if (!res.ok) throw new Error(`leaderboard failed: ${res.status}`);
  return ((await res.json()) as { rows: LeaderRow[] }).rows;
}

export async function fetchProfile(login: string, today: string): Promise<PublicProfile> {
  const res = await fetch(`${API}/api/profile?login=${encodeURIComponent(login)}&today=${today}`);
  if (res.status === 404) throw new Error('no such user');
  if (!res.ok) throw new Error(`profile failed: ${res.status}`);
  return (await res.json()) as PublicProfile;
}
