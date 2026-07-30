import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from '../lib/cors.js';
import { verify } from '../lib/jwt.js';
import { getSnapshot, listSnapshots } from '../lib/db.js';

async function userIdFrom(req: VercelRequest): Promise<string | null> {
  const header = req.headers.authorization ?? '';
  const match = /^Bearer (.+)$/i.exec(header);
  if (!match) return null;
  try {
    const claims = await verify(match[1]);
    return claims.typ === 'session' ? String(claims.sub) : null;
  } catch {
    return null;
  }
}

/**
 * The user's own history — every version of the database that was ever pushed,
 * thinned to one a day past the first 48 hours.
 *
 *   GET /api/snapshots        -> { snapshots: [{ id, createdAt, days, hours }] }
 *   GET /api/snapshots?id=42  -> { db }
 *
 * Restoring is deliberately not a server operation: the client fetches the
 * version it wants and merges it in, so nothing is overwritten sight unseen.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  const githubId = await userIdFrom(req);
  if (!githubId) {
    res.status(401).json({ error: 'sign in required' });
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  try {
    const id = typeof req.query.id === 'string' ? req.query.id : null;
    if (id) {
      if (!/^\d+$/.test(id)) {
        res.status(400).json({ error: 'id must be numeric' });
        return;
      }
      const db = await getSnapshot(githubId, id);
      if (!db) {
        res.status(404).json({ error: 'no such snapshot' });
        return;
      }
      res.json({ db });
      return;
    }
    res.json({ snapshots: await listSnapshots(githubId) });
  } catch (err) {
    res.status(500).json({ error: `server error: ${(err as Error).message}` });
  }
}
