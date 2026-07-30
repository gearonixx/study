import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from '../lib/cors.js';
import { verify } from '../lib/jwt.js';
import { appendSnapshot, getData, putData } from '../lib/db.js';
import { summarize, wouldDestroy } from '../lib/guard.js';

/** Reads the bearer session token and returns the GitHub user id, or null. */
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
 * The user's whole study database, keyed by GitHub id.
 *   GET -> { db, updatedAt }   (db is null if nothing stored yet)
 *   PUT -> { updatedAt }       (body is the full database JSON)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  const githubId = await userIdFrom(req);
  if (!githubId) {
    res.status(401).json({ error: 'sign in required' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const { data, updatedAt } = await getData(githubId);
      res.json({ db: data, updatedAt });
      return;
    }
    if (req.method === 'PUT') {
      const db = req.body;
      if (!db || typeof db !== 'object' || Array.isArray(db)) {
        res.status(400).json({ error: 'body must be a database object' });
        return;
      }

      const { data: before } = await getData(githubId);
      if (req.query.force !== '1') {
        const refusal = wouldDestroy(before, db);
        if (refusal) {
          // 409, not 500: the client's copy is behind, not broken. It should
          // pull, merge and try again — which is exactly what it now does.
          res.status(409).json({ error: refusal, ...summarize(before) });
          return;
        }
      }

      const updatedAt = await putData(githubId, db);
      // History is best-effort: a snapshot failing must never cost the write.
      try {
        await appendSnapshot(githubId, db);
      } catch (err) {
        console.error('snapshot failed', err);
      }
      res.json({ updatedAt });
      return;
    }
    res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    res.status(500).json({ error: `server error: ${(err as Error).message}` });
  }
}
