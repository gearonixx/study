/**
 * App shell: theme application, a tiny hash router (no dependency, and it works
 * on any static host without rewrite rules), and the badge-unlock toast.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { StoreProvider, useStore } from './lib/store';
import { summarize } from './lib/stats';
import { ACHIEVEMENTS } from './lib/achievements';
import { loadAuth } from './lib/auth';
import { resolvePreset } from './lib/types';
import { Today } from './components/Today';
import { Insights } from './components/Insights';
import { Achievements } from './components/Achievements';
import { Journal } from './components/Journal';
import { SettingsPage } from './components/SettingsPage';
import './styles.css';

const ROUTES = [
  { id: 'today', label: 'Today' },
  { id: 'insights', label: 'Insights' },
  { id: 'journal', label: 'Journal' },
  { id: 'achievements', label: 'Achievements' },
  { id: 'settings', label: 'Settings' },
] as const;

type RouteId = (typeof ROUTES)[number]['id'];

function readRoute(): RouteId {
  const id = location.hash.replace(/^#\/?/, '') as RouteId;
  return ROUTES.some((r) => r.id === id) ? id : 'today';
}

function useHashRoute(): [RouteId, (id: string) => void] {
  const [route, setRoute] = useState<RouteId>(readRoute);

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
  const { db, freshBadges, dismissBadges } = useStore();
  const [route, go] = useHashRoute();
  const [auth, setAuth] = useState(loadAuth);
  const summary = useMemo(() => summarize(db), [db]);

  // Resolve the theme preset onto <html> so the CSS variables pick it up.
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      const { skin, theme } = resolvePreset(db.settings.theme, mq.matches);
      root.dataset.skin = skin;
      root.dataset.theme = theme;
      const bar =
        skin === 'claude'
          ? theme === 'dark' ? '#1f1e1d' : '#faf9f5'
          : theme === 'dark' ? '#0d1117' : '#ffffff';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bar);
    };

    apply();
    // Only the presets that defer to the OS need to watch it.
    if (db.settings.theme !== 'system' && db.settings.theme !== 'claude') return;
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
          <a className="brand" href="#/today">
            <span className="brand__mark" aria-hidden>
              ✦
            </span>
            wizzard
          </a>

          <nav className="nav" aria-label="Main">
            {ROUTES.map((r) => (
              <button
                key={r.id}
                className={`nav__item ${route === r.id ? 'nav__item--active' : ''}`}
                onClick={() => go(r.id)}
                aria-current={route === r.id ? 'page' : undefined}
              >
                {r.label}
              </button>
            ))}
          </nav>

          <span className="header__spacer" />

          <div className="header__right">
            {summary.currentStreak > 0 && (
              <span className="streak-pill" title="Consecutive days with at least one hour">
                🔥 {summary.currentStreak}
              </span>
            )}
            <button
              className="level-pill"
              onClick={() => go('achievements')}
              title={`${summary.title} — ${summary.levelInto}/${summary.levelNeed} XP`}
            >
              Lv {summary.level}
            </button>
            {auth.avatarUrl ? (
              <img className="avatar" src={auth.avatarUrl} alt={auth.login ?? 'Signed in'} />
            ) : (
              <button className="nav__item" onClick={() => go('settings')}>
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="shell">
        {route === 'today' && <Today />}
        {route === 'insights' && <Insights go={go} />}
        {route === 'journal' && <Journal go={go} />}
        {route === 'achievements' && <Achievements />}
        {route === 'settings' && <SettingsPage onAuthChange={() => setAuth(loadAuth())} />}
      </main>

      {freshBadges.length > 0 && (
        <div className="toasts">
          {freshBadges.map((id) => {
            const badge = ACHIEVEMENTS.find((a) => a.id === id);
            if (!badge) return null;
            return (
              <button className="toast" key={id} onClick={() => go('achievements')}>
                <span className="toast__icon">{badge.icon}</span>
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
