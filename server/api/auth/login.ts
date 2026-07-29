import type { VercelRequest, VercelResponse } from '@vercel/node';
import { env, ALLOWED_ORIGIN, baseUrl } from '../../lib/env.js';
import { sign } from '../../lib/jwt.js';

/**
 * Kicks off GitHub OAuth. We stash the SPA return URL in a short-lived signed
 * `state` token (also our CSRF guard), then bounce the browser to GitHub.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const clientId = env('GITHUB_CLIENT_ID');

  const requested = String(req.query.redirect ?? ALLOWED_ORIGIN);
  // Only ever return to our own frontend origin.
  const returnUrl = ALLOWED_ORIGIN && requested.startsWith(ALLOWED_ORIGIN) ? requested : ALLOWED_ORIGIN;

  const state = await sign({ sub: 'anon', login: '', name: null, avatar: returnUrl, typ: 'state' }, '10m');

  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', `${baseUrl(req)}/api/auth/callback`);
  authorize.searchParams.set('scope', 'read:user');
  authorize.searchParams.set('state', state);

  res.redirect(302, authorize.toString());
}
