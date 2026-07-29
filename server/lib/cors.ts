import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ALLOWED_ORIGIN } from './env';

/**
 * Applies CORS headers for the single allowed frontend origin and answers the
 * preflight. Returns true if the request was a preflight and is now finished —
 * callers should `return` immediately when it does.
 */
export function applyCors(req: VercelRequest, res: VercelResponse): boolean {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
