/**
 * App shell: theme application, a tiny router (no dependency), and the
 * badge-unlock toast.
 */

import { useEffect, useMemo, useState } from 'react';
import { StoreProvider, useStore } from './lib/store';
import { ROUTES, useRoute } from './lib/route';
import { STREAK_MIN_HOURS, summarize } from './lib/stats';
import { resolveTheme } from './lib/types';
import { ACHIEVEMENTS } from './lib/achievements';
import { loadAuth } from './lib/auth';
import { Today } from './components/Today';
import { Goals } from './components/Goals';
import { Insights } from './components/Insights';
import { Achievements } from './components/Achievements';
import { Journal } from './components/Journal';
import { SettingsPage } from './components/SettingsPage';
import { Leaderboard, PublicProfile } from './components/Leaderboard';
import { mirror, serveChimes } from './ext/bridge';
import { CAN_DOCK, dockToSidebar, inPanel, openInTab, surface } from './ext/panel';
import './styles.css';

function Shell() {
  const { db, freshBadges, dismissBadges, cloud } = useStore();
  const [route, go] = useRoute();
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

  // Both no-ops on the web. Inside the extension the background page runs the
  // clock, so it needs the settings mirrored to it — and it hands chimes back
  // here, where a real page is the more reliable speaker.
  useEffect(() => serveChimes(), []);
  useEffect(() => mirror(db), [db.settings, db.days, db]);

  return (
    <div className="app">
      <header className="header">
        <div className="header__bar">
          {/* A wordmark, not a logo: the header carries no imagery. */}
          <button className="brand" onClick={() => go('today')}>
            TimeForces
          </button>

          <nav className="nav" aria-label="Main">
            {ROUTES.map((r) => (
              <button
                key={r.id}
                className={`nav__item ${
                  route.id === r.id || (r.id === 'insights' && mine) ? 'nav__item--active' : ''
                }`}
                onClick={() => go(r.id === 'insights' && me ? me : r.id)}
                aria-current={route.id === r.id ? 'page' : undefined}
              >
                {/* Two labels: the full one everywhere, a compact one that the
                    bottom tab bar swaps in so seven tabs fit a phone's width. */}
                <span className="nav__label nav__label--full">{r.label}</span>
                <span className="nav__label nav__label--compact">
                  {'short' in r ? r.short : r.label}
                </span>
              </button>
            ))}
          </nav>

          <span className="header__spacer" />

          <div className="header__right">
            {/* In the popup and the sidebar, the two ways out: dock it so it
                stops closing on every outside click, or open the whole thing
                full width in a tab. */}
            {inPanel() && (
              <span className="panel-tools">
                {CAN_DOCK && surface() === 'popup' && (
                  <button
                    className="panel-tool"
                    onClick={dockToSidebar}
                    title="Keep open in the sidebar"
                    aria-label="Keep open in the sidebar"
                  >
                    ⇥
                  </button>
                )}
                <button
                  className="panel-tool"
                  onClick={openInTab}
                  title="Open full width in a tab"
                  aria-label="Open full width in a tab"
                >
                  ⤢
                </button>
              </span>
            )}
            {summary.currentStreak > 0 && (
              <span
                className="streak-pill"
                title={`Consecutive days of ${STREAK_MIN_HOURS} hours or more`}
              >
                {summary.currentStreak}
              </span>
            )}
            {/* Gist's own escape hatch, in the same corner it sits in there:
                out of the app and back to the profile the account belongs to.
                Only exists once we know whose account it is. */}
            {me && (
              <a className="header__out" href={`https://github.com/${me}`}>
                Back to GitHub
              </a>
            )}
            {(cloud.user?.avatarUrl ?? auth.avatarUrl) ? (
              <img
                className="avatar"
                src={(cloud.user?.avatarUrl ?? auth.avatarUrl) as string}
                alt={cloud.user?.login ?? auth.login ?? 'Signed in'}
              />
            ) : (
              /* Straight to GitHub. Settings is where you manage an account,
                 not where you go to start one. */
              <button
                className="nav__item"
                onClick={() => (cloud.configured ? cloud.signIn() : go('settings'))}
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="shell">
        {route.id === 'today' && <Today />}
        {route.id === 'goals' && <Goals />}
        {(route.id === 'insights' || mine) && <Insights go={go} />}
        {route.id === 'journal' && <Journal go={go} />}
        {route.id === 'board' && <Leaderboard go={go} />}
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
