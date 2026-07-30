import { neon } from '@neondatabase/serverless';
import { databaseUrl } from './env.js';
import { summarize } from './guard.js';

const sql = neon(databaseUrl());

// The schema is one row per GitHub user holding the whole study database as a
// single jsonb blob — the same unified shape the app exports and stores in
// localStorage. Created lazily on first use so there is no separate migration.
let ready = false;
async function ensure(): Promise<void> {
  if (ready) return;
  await sql`
    create table if not exists users (
      github_id  text primary key,
      login      text,
      name       text,
      avatar_url text,
      data       jsonb,
      updated_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    )
  `;
  ready = true;
}

export interface Profile {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

/** Creates or refreshes the user's profile row without touching their data. */
export async function upsertUser(p: Profile): Promise<void> {
  await ensure();
  await sql`
    insert into users (github_id, login, name, avatar_url)
    values (${p.id}, ${p.login}, ${p.name}, ${p.avatarUrl})
    on conflict (github_id) do update
      set login = excluded.login,
          name = excluded.name,
          avatar_url = excluded.avatar_url
  `;
}

export async function getData(githubId: string): Promise<{ data: unknown; updatedAt: string | null }> {
  await ensure();
  const rows = (await sql`select data, updated_at from users where github_id = ${githubId}`) as Array<{
    data: unknown;
    updated_at: string;
  }>;
  return rows[0] ? { data: rows[0].data, updatedAt: rows[0].updated_at } : { data: null, updatedAt: null };
}

/** Every user with anything stored, for the public leaderboard. */
export async function allUsers(): Promise<
  Array<{ login: string; name: string | null; avatarUrl: string | null; data: unknown; joinedAt: string }>
> {
  await ensure();
  const rows = (await sql`
    select login, name, avatar_url, data, created_at from users where data is not null
  `) as Array<{
    login: string;
    name: string | null;
    avatar_url: string | null;
    data: unknown;
    created_at: string;
  }>;
  return rows.map((r) => ({
    login: r.login,
    name: r.name,
    avatarUrl: r.avatar_url,
    data: r.data,
    joinedAt: r.created_at,
  }));
}

/** One user by handle, for the public profile. */
export async function userByLogin(login: string): Promise<{
  login: string;
  name: string | null;
  avatarUrl: string | null;
  data: unknown;
  joinedAt: string;
} | null> {
  await ensure();
  const rows = (await sql`
    select login, name, avatar_url, data, created_at
    from users where lower(login) = lower(${login}) limit 1
  `) as Array<{
    login: string;
    name: string | null;
    avatar_url: string | null;
    data: unknown;
    created_at: string;
  }>;
  const r = rows[0];
  return r
    ? { login: r.login, name: r.name, avatarUrl: r.avatar_url, data: r.data, joinedAt: r.created_at }
    : null;
}

export async function putData(githubId: string, data: unknown): Promise<string | null> {
  await ensure();
  const rows = (await sql`
    update users set data = ${JSON.stringify(data)}::jsonb, updated_at = now()
    where github_id = ${githubId}
    returning updated_at
  `) as Array<{ updated_at: string }>;
  return rows[0]?.updated_at ?? null;
}

/* -- History ---------------------------------------------------------------
 * `users.data` is one row that every push overwrites, so a bad write used to
 * be the end of it: on 2026-07-30 an afternoon was lost and there was nothing
 * to roll back to. Every version pushed is now also appended here, and old
 * ones thin out with age rather than disappearing — the first push of each day
 * is kept indefinitely, so a year of blocks always has a floor under it.
 */

let historyReady = false;
async function ensureHistory(): Promise<void> {
  if (historyReady) return;
  await sql`
    create table if not exists snapshots (
      id         bigserial primary key,
      github_id  text not null,
      data       jsonb not null,
      days       int  not null default 0,
      hours      real not null default 0,
      created_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists snapshots_user_time on snapshots (github_id, created_at desc)`;
  historyReady = true;
}

export async function appendSnapshot(githubId: string, data: unknown): Promise<void> {
  await ensureHistory();
  const { days, hours } = summarize(data);
  const json = JSON.stringify(data);
  // A tab that is merely open re-converges on a timer, so most pushes carry
  // nothing new. Only a version that differs from the one before it is worth
  // keeping.
  await sql`
    insert into snapshots (github_id, data, days, hours)
    select ${githubId}, ${json}::jsonb, ${days}, ${hours}
    where not exists (
      select 1 from (
        select data from snapshots where github_id = ${githubId} order by id desc limit 1
      ) latest where latest.data = ${json}::jsonb
    )
  `;
  // Thin the recent churn: a push lands every couple of seconds while the user
  // is working, and keeping every one of those forever is pointless. Anything
  // from the last two days survives untouched; past that only the first push of
  // each day is kept, which is what makes the history cheap to hold onto.
  await sql`
    delete from snapshots
    where github_id = ${githubId}
      and created_at < now() - interval '2 days'
      and id not in (
        select min(id) from snapshots
        where github_id = ${githubId}
        group by date_trunc('day', created_at)
      )
  `;
}

export interface SnapshotRow {
  id: string;
  createdAt: string;
  days: number;
  hours: number;
}

export async function listSnapshots(githubId: string, limit = 60): Promise<SnapshotRow[]> {
  await ensureHistory();
  const rows = (await sql`
    select id, created_at, days, hours from snapshots
    where github_id = ${githubId} order by created_at desc limit ${limit}
  `) as Array<{ id: string; created_at: string; days: number; hours: number }>;
  return rows.map((r) => ({ id: String(r.id), createdAt: r.created_at, days: r.days, hours: r.hours }));
}

export async function getSnapshot(githubId: string, id: string): Promise<unknown | null> {
  await ensureHistory();
  const rows = (await sql`
    select data from snapshots where github_id = ${githubId} and id = ${id} limit 1
  `) as Array<{ data: unknown }>;
  return rows[0]?.data ?? null;
}
