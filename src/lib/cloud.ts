/**
 * Optional cloud sync. When `VITE_API_BASE` is set at build time, the app can
 * "Sign in with GitHub" and keep the canonical database on the server, so the
 * same account sees the same data on any device. localStorage stays the local
 * cache and the JSON export stays the portable copy.
 *
 * When `VITE_API_BASE` is unset, everything here no-ops and the app is exactly
 * the local-first tool it was before.
 */

import type { Database, Day } from './types';
import { normalize } from './storage';

const API = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '');
export const cloudConfigured = API !== '';

const TOKEN_KEY = 'study:cloud:token:v1';
const USER_KEY = 'study:cloud:user:v1';

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
 * Reconciles a local and a remote database without losing either side:
 *  - days: the more recently edited copy of each date wins;
 *  - unlocked badges: keep the earliest earn time seen anywhere;
 *  - settings: the remote (canonical once signed in) wins per key.
 */
export function mergeDatabases(local: Database, remote: Database): Database {
  const days: Record<string, Day> = { ...remote.days };
  for (const [date, ld] of Object.entries(local.days)) {
    const rd = days[date];
    if (!rd || (ld.updatedAt ?? 0) >= (rd.updatedAt ?? 0)) days[date] = ld;
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
