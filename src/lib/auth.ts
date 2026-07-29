/**
 * Optional GitHub sign-in.
 *
 * The app is fully usable signed out — auth only buys you an identity in the
 * header and backup of your local database to a secret gist.
 *
 * Sign-in is a personal access token pasted by hand. That is deliberate: the
 * site is static (GitHub Pages), and the OAuth code-for-token exchange needs a
 * server, because GitHub's token endpoint sends no CORS headers. A token needs
 * no server at all, so the browser only ever talks to api.github.com.
 */

import type { AuthState, Database } from './types';
import { normalize } from './storage';

const AUTH_KEY = 'wizzard:auth:v1';
const GIST_FILENAME = 'wizzard.json';

/** Re-exported so callers can hold auth objects without importing types.ts. */
export type AuthLike = AuthState;

export const emptyAuth: AuthState = {
  token: null,
  login: null,
  name: null,
  avatarUrl: null,
  gistId: null,
  lastSyncedAt: null,
};

export function loadAuth(): AuthState {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? { ...emptyAuth, ...JSON.parse(raw) } : { ...emptyAuth };
  } catch {
    return { ...emptyAuth };
  }
}

export function saveAuth(auth: AuthState): void {
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

export function clearAuth(): void {
  localStorage.removeItem(AUTH_KEY);
}

async function gh<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`GitHub ${path} → ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

/** Verifies a token and builds the auth state from the authenticated user. */
export async function signInWithToken(token: string): Promise<AuthState> {
  const user = await gh<{ login: string; name: string | null; avatar_url: string }>(token, '/user');
  const auth: AuthState = {
    ...loadAuth(),
    token,
    login: user.login,
    name: user.name,
    avatarUrl: user.avatar_url,
  };
  saveAuth(auth);
  return auth;
}

interface GistResponse {
  id: string;
  files: Record<string, { content?: string; truncated?: boolean; raw_url?: string }>;
}

/** Pushes the database to a secret gist, creating it on first use. */
export async function backupToGist(auth: AuthState, db: Database): Promise<AuthState> {
  if (!auth.token) throw new Error('Sign in first.');
  const body = JSON.stringify({
    description: 'wizzard backup',
    public: false,
    files: { [GIST_FILENAME]: { content: JSON.stringify(db, null, 2) } },
  });

  const gist = auth.gistId
    ? await gh<GistResponse>(auth.token, `/gists/${auth.gistId}`, { method: 'PATCH', body })
    : await gh<GistResponse>(auth.token, '/gists', { method: 'POST', body });

  const next = { ...auth, gistId: gist.id, lastSyncedAt: Date.now() };
  saveAuth(next);
  return next;
}

/** Pulls the database back out of the gist. */
export async function restoreFromGist(auth: AuthState): Promise<Database> {
  if (!auth.token) throw new Error('Sign in first.');
  if (!auth.gistId) throw new Error('No backup gist linked yet.');
  const gist = await gh<GistResponse>(auth.token, `/gists/${auth.gistId}`);
  const file = gist.files[GIST_FILENAME];
  if (!file) throw new Error(`Gist has no ${GIST_FILENAME}.`);
  // Gists over 1 MB come back truncated with a raw_url to fetch instead.
  const content = file.truncated && file.raw_url
    ? await fetch(file.raw_url).then((r) => r.text())
    : file.content ?? '';
  return normalize(JSON.parse(content));
}

/** Finds an existing backup gist so a second device can adopt it. */
export async function findBackupGist(auth: AuthState): Promise<string | null> {
  if (!auth.token) return null;
  const gists = await gh<GistResponse[]>(auth.token, '/gists?per_page=100');
  return gists.find((g) => GIST_FILENAME in g.files)?.id ?? null;
}
