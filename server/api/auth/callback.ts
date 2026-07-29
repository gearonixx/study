import type { VercelRequest, VercelResponse } from '@vercel/node';
import { env, baseUrl } from '../../lib/env.js';
import { sign, verify } from '../../lib/jwt.js';
import { upsertUser } from '../../lib/db.js';

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
}

/**
 * GitHub redirects here with `?code&state`. We verify state, exchange the code
 * for a GitHub token server-side (where the client secret lives), read the
 * profile, upsert the user, then hand the browser back to the SPA with a
 * short-lived `wz_code`. The SPA trades that for a real session token via a
 * POST, so the session token itself never rides in a URL.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const code = String(req.query.code ?? '');
    const stateToken = String(req.query.state ?? '');
    if (!code || !stateToken) throw new Error('missing code or state');

    const state = await verify(stateToken);
    if (state.typ !== 'state') throw new Error('bad state');
    const returnUrl = state.avatar || '';

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: env('GITHUB_CLIENT_ID'),
        client_secret: env('GITHUB_CLIENT_SECRET'),
        code,
        redirect_uri: `${baseUrl(req)}/api/auth/callback`,
      }),
    });
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) throw new Error('token exchange failed');

    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        authorization: `Bearer ${token.access_token}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'study-tracker',
      },
    });
    if (!userRes.ok) throw new Error('profile fetch failed');
    const gh = (await userRes.json()) as GitHubUser;

    await upsertUser({
      id: String(gh.id),
      login: gh.login,
      name: gh.name,
      avatarUrl: gh.avatar_url,
    });

    const handoff = await sign(
      { sub: String(gh.id), login: gh.login, name: gh.name, avatar: gh.avatar_url, typ: 'handoff' },
      '2m',
    );

    const back = new URL(returnUrl);
    back.searchParams.set('wz_code', handoff);
    res.redirect(302, back.toString());
  } catch (err) {
    res.status(400).send(`Sign-in failed: ${(err as Error).message}`);
  }
}
