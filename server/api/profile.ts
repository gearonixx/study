import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from '../lib/cors.js';
import { userByLogin } from '../lib/db.js';
import { score } from '../lib/score.js';

/**
 * One user's public record: the hours behind their graph and the numbers that
 * summarise them. Never their notes.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const login = String(req.query.login ?? '').trim();
  if (!login) {
    res.status(400).json({ error: 'login required' });
    return;
  }

  try {
    const user = await userByLogin(login);
    if (!user) {
      res.status(404).json({ error: 'no such user' });
      return;
    }
    const s = score(user.data, String(req.query.today ?? ''));
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.json({
      login: user.login,
      name: user.name,
      avatarUrl: user.avatarUrl,
      hours: s.hours,
      totalHours: s.totalHours,
      activeDays: s.activeDays,
      currentStreak: s.currentStreak,
      longestStreak: s.longestStreak,
      last7: s.last7,
      lastActive: s.lastActive,
      joinedAt: user.joinedAt,
    });
  } catch (err) {
    res.status(500).json({ error: `server error: ${(err as Error).message}` });
  }
}
