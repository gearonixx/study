/**
 * The app's routes, and a router the size of the problem.
 *
 * Real paths on the web, the hash inside the extension — see `PATH_ROUTING`.
 * This lives apart from the shell so that a component wanting a route's href
 * does not have to import the shell that renders it.
 */

import { useCallback, useEffect, useState } from 'react';

export const ROUTES = [
  { id: 'today', label: 'Today' },
  // Next to Today on purpose: the day is what you do, this is what it is for.
  { id: 'goals', label: 'Goals' },
  // The tab is 'Profile' because that is what it is when signed in — your own
  // page, the same one /@login shows a stranger. The route id stays `insights`
  // so older links keep resolving.
  { id: 'insights', label: 'Profile' },
  { id: 'journal', label: 'Journal' },
  { id: 'board', label: 'Board' },
  { id: 'achievements', label: 'Achievements' },
  { id: 'settings', label: 'Settings' },
] as const;

type RouteId = (typeof ROUTES)[number]['id'];

/**
 * A person's stats live at `/<login>` — bare, the way GitHub does it, so a
 * profile can be linked, bookmarked and shared. Page names win the namespace:
 * anything that isn't a known route is read as a handle. `@login` and
 * `u/login` still resolve, for links handed out earlier.
 */
export interface Route {
  id: RouteId | 'profile';
  login?: string;
}

/**
 * Real paths on the web, the hash inside the extension.
 *
 * `moz-extension://<uuid>/journal` is not a file and there is no server behind
 * it to say otherwise, so the extension keeps the hash — it is the only scheme
 * that works with no rewrite rule at all. On the web the host rewrites unknown
 * paths to index.html (see `public/vercel.json`) and the URL can be honest.
 */
const PATH_ROUTING =
  typeof location !== 'undefined' &&
  (location.protocol === 'http:' || location.protocol === 'https:');

/** Where the app is mounted: `/` on its own domain, `/timeforces/` under Pages. */
const BASE = import.meta.env.BASE_URL || '/';

/** Today is the app's front door, so it is the bare base rather than `/today`. */
export function pathFor(id: string): string {
  return id === 'today' ? BASE : `${BASE}${id}`;
}

function parse(raw: string): Route {
  const slug = raw.replace(/^\/+/, '').replace(/\/+$/, '');
  if (ROUTES.some((r) => r.id === slug)) return { id: slug as RouteId };
  const user = /^(?:@|u\/)?([A-Za-z0-9][A-Za-z0-9-]*)$/.exec(slug);
  if (user) return { id: 'profile', login: user[1] };
  return { id: 'today' };
}

export function readRoute(): Route {
  if (!PATH_ROUTING) return parse(location.hash.replace(/^#/, ''));
  const path = decodeURIComponent(location.pathname);
  return parse(path.startsWith(BASE) ? path.slice(BASE.length) : path);
}

/**
 * Links handed out while the app was on `#/journal` still arrive. Rewriting
 * them in place — once, without a history entry — means an old bookmark lands
 * on the right page and then looks like every other URL.
 */
export function migrateHash(): void {
  if (!PATH_ROUTING || !location.hash.startsWith('#/')) return;
  const target = parse(location.hash.replace(/^#/, ''));
  const id = target.id === 'profile' ? (target.login ?? 'today') : target.id;
  history.replaceState(null, '', pathFor(id) + location.search);
}

export function useRoute(): [Route, (id: string) => void] {
  const [route, setRoute] = useState<Route>(() => {
    migrateHash();
    return readRoute();
  });

  useEffect(() => {
    const onNav = () => setRoute(readRoute());
    const event = PATH_ROUTING ? 'popstate' : 'hashchange';
    window.addEventListener(event, onNav);
    return () => window.removeEventListener(event, onNav);
  }, []);

  // `pushState` fires no event of its own, so the route is set by hand here.
  const go = useCallback((id: string) => {
    if (!PATH_ROUTING) {
      location.hash = `/${id}`;
      return;
    }
    history.pushState(null, '', pathFor(id));
    setRoute(readRoute());
  }, []);

  return [route, go];
}

/** The href a route should carry, so a link is copyable and middle-clickable. */
export function hrefFor(id: string): string {
  return PATH_ROUTING ? pathFor(id) : `#/${id}`;
}
