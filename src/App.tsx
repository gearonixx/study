/**
 * App shell: theme application, a tiny hash router (no dependency, and it works
 * on any static host without rewrite rules), and the badge-unlock toast.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { StoreProvider, useStore } from './lib/store';
import { STREAK_MIN_HOURS, summarize } from './lib/stats';
import { resolveTheme } from './lib/types';
import { ACHIEVEMENTS } from './lib/achievements';
import { loadAuth } from './lib/auth';
import { Today } from './components/Today';
import { Insights } from './components/Insights';
import { Achievements } from './components/Achievements';
import { Journal } from './components/Journal';
import { SettingsPage } from './components/SettingsPage';
import { Leaderboard, PublicProfile } from './components/Leaderboard';
import './styles.css';

const ROUTES = [
  { id: 'today', label: 'Today' },
  { id: 'insights', label: 'Insights' },
  { id: 'journal', label: 'Journal' },
  { id: 'board', label: 'Board' },
  { id: 'achievements', label: 'Achievements' },
  { id: 'settings', label: 'Settings' },
] as const;

type RouteId = (typeof ROUTES)[number]['id'];

/**
 * A person's stats live at `#/u/<login>` — yours and anyone else's, so a
 * profile can be linked, bookmarked and shared. Everything else is a flat id.
 */
export interface Route {
  id: RouteId | 'profile';
  login?: string;
}

function readRoute(): Route {
  const raw = location.hash.replace(/^#\/?/, '');
  const user = /^u\/([A-Za-z0-9-]+)$/.exec(raw);
  if (user) return { id: 'profile', login: user[1] };
  const id = raw as RouteId;
  return { id: ROUTES.some((r) => r.id === id) ? id : 'today' };
}

function useHashRoute(): [Route, (id: string) => void] {
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((id: string) => {
    location.hash = `/${id}`;
  }, []);

  return [route, go];
}

function Shell() {
  const { db, freshBadges, dismissBadges, cloud } = useStore();
  const [route, go] = useHashRoute();
  const [auth, setAuth] = useState(loadAuth);
  // Signed in, your own stats are just your profile — same URL shape as anyone
  // else's, so "my page" and "their page" are the same page.
  const me = cloud.user?.login ?? auth.login ?? null;
  const mine = route.id === 'profile' && !!me && route.login?.toLowerCase() === me.toLowerCase();
  const summary = useMemo(() => summarize(db), [db]);

  // Resolve the theme preset onto <html> so the CSS variables pick it up.
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      const theme = resolveTheme(db.settings.theme, mq.matches);
      root.dataset.theme = theme;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', theme === 'dark' ? '#0d1117' : '#ffffff');
    };

    apply();
    // Only System needs to keep watching the OS.
    if (db.settings.theme !== 'system') return;
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [db.settings.theme]);

  // Auto-dismiss the badge toast.
  useEffect(() => {
    if (!freshBadges.length) return;
    const id = setTimeout(dismissBadges, 6000);
    return () => clearTimeout(id);
  }, [freshBadges, dismissBadges]);

  return (
    <div className="app">
      <header className="header">
        <div className="header__bar">
          <nav className="nav" aria-label="Main">
            {ROUTES.map((r) => (
              <button
                key={r.id}
                className={`nav__item ${
                  route.id === r.id || (r.id === 'insights' && mine) ? 'nav__item--active' : ''
                }`}
                onClick={() => go(r.id === 'insights' && me ? `u/${me}` : r.id)}
                aria-current={route.id === r.id ? 'page' : undefined}
              >
                {r.label}
              </button>
            ))}
          </nav>

          <span className="header__spacer" />

          <div className="header__right">
            {summary.currentStreak > 0 && (
              <span
                className="streak-pill"
                title={`Consecutive days of ${STREAK_MIN_HOURS} hours or more`}
              >
                {summary.currentStreak}
              </span>
            )}
            {(cloud.user?.avatarUrl ?? auth.avatarUrl) ? (
              <img
                className="avatar"
                src={(cloud.user?.avatarUrl ?? auth.avatarUrl) as string}
                alt={cloud.user?.login ?? auth.login ?? 'Signed in'}
              />
            ) : (
              <button className="nav__item" onClick={() => go('settings')}>
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="shell">
        {route.id === 'today' && <Today />}
        {(route.id === 'insights' || mine) && <Insights go={go} />}
        {route.id === 'journal' && <Journal go={go} />}
        {route.id === 'board' && <Leaderboard />}
        {route.id === 'profile' && !mine && route.login && (
          <PublicProfile login={route.login} onBack={() => go('board')} />
        )}
        {route.id === 'achievements' && <Achievements />}
        {route.id === 'settings' && <SettingsPage onAuthChange={() => setAuth(loadAuth())} />}
      </main>

      {freshBadges.length > 0 && (
        <div className="toasts">
          {freshBadges.map((id) => {
            const badge = ACHIEVEMENTS.find((a) => a.id === id);
            if (!badge) return null;
            return (
              <button className="toast" key={id} onClick={() => go('achievements')}>
                <span className="toast__icon toast__icon--face">
                  <img src={badge.icon} alt="" draggable={false} />
                </span>
                <span className="toast__body">
                  <strong>Badge unlocked — {badge.name}</strong>
                  <span>{badge.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
