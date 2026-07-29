import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from '../../lib/cors.js';
import { sign, verify } from '../../lib/jwt.js';

/**
 * Exchanges the short-lived `wz_code` handoff token (from the OAuth callback)
 * for a long-lived session token, returned in the JSON body so it never
 * appears in a URL. Called by the SPA on the redirect back.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  try {
    const code = String((req.body as { code?: string } | undefined)?.code ?? '');
    const handoff = await verify(code);
    if (handoff.typ !== 'handoff') throw new Error('bad code');

    const token = await sign(
      { sub: handoff.sub, login: handoff.login, name: handoff.name, avatar: handoff.avatar, typ: 'session' },
      '90d',
    );

    res.json({
      token,
      user: { id: handoff.sub, login: handoff.login, name: handoff.name, avatarUrl: handoff.avatar },
    });
  } catch {
    res.status(401).json({ error: 'invalid or expired code' });
  }
}
