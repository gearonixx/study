import { neon } from '@neondatabase/serverless';
import { databaseUrl } from './env.js';

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

export async function putData(githubId: string, data: unknown): Promise<string | null> {
  await ensure();
  const rows = (await sql`
    update users set data = ${JSON.stringify(data)}::jsonb, updated_at = now()
    where github_id = ${githubId}
    returning updated_at
  `) as Array<{ updated_at: string }>;
  return rows[0]?.updated_at ?? null;
}
