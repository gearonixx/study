import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from '../lib/cors.js';
import { allUsers } from '../lib/db.js';
import { score } from '../lib/score.js';

/**
 * The public standings. No auth: the whole point is that the hours are visible.
 * Only numbers cross this line — block comments, goals and notes stay private.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  try {
    const today = String(req.query.today ?? '');
    const users = await allUsers();
    const rows = users
      .map((u) => {
        const s = score(u.data, today);
        return {
          login: u.login,
          name: u.name,
          avatarUrl: u.avatarUrl,
          totalHours: s.totalHours,
          activeDays: s.activeDays,
          currentStreak: s.currentStreak,
          longestStreak: s.longestStreak,
          last7: s.last7,
          lastActive: s.lastActive,
          joinedAt: u.joinedAt,
        };
      })
      .filter((r) => r.activeDays > 0)
      .sort((a, b) => b.totalHours - a.totalHours || b.currentStreak - a.currentStreak)
      .slice(0, 100);

    res.setHeader('Cache-Control', 'public, max-age=30');
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: `server error: ${(err as Error).message}` });
  }
}
