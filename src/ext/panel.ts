/**
 * Which surface the app is mounted in.
 *
 * The extension serves the same `index.html` three ways: as a popup hanging off
 * the toolbar button, as a sidebar docked beside the page, and as an ordinary
 * full-width tab. They differ only in how much room there is, which is a CSS
 * problem — and in the handful of controls that move between them, which is
 * this file.
 */

import { ext } from './api';

export type Surface = 'popup' | 'sidebar' | 'page';

/**
 * The manifest points the popup and the sidebar at the same page with a marker
 * on the query string; anything else is the full page.
 */
export function surface(): Surface {
  if (typeof location === 'undefined') return 'page';
  const flag = new URLSearchParams(location.search).get('panel');
  return flag === 'popup' || flag === 'sidebar' ? flag : 'page';
}

/** True in the narrow surfaces — the popup and the sidebar. */
export function inPanel(): boolean {
  return surface() !== 'page';
}

/**
 * Stamped on <html> so the stylesheet can lay the app out for the room it has,
 * rather than guessing from a viewport width that would also match a phone.
 */
export function markSurface(): void {
  if (typeof document === 'undefined') return;
  const which = surface();
  if (which !== 'page') document.documentElement.dataset.panel = which;
}

/** The whole app, full width, in a tab of its own. */
export function openInTab(): void {
  if (!ext) return;
  void ext.tabs.create({ url: ext.runtime.getURL('index.html') });
  if (surface() === 'popup') window.close();
}

/**
 * Dock the popup as a sidebar, so it stays put instead of closing the moment
 * you click back into the page. Only reachable from a real click: Firefox
 * requires a user gesture to open the sidebar, which is exactly what this is.
 */
export function dockToSidebar(): void {
  if (!ext?.sidebarAction) return;
  try {
    ext.sidebarAction.open();
  } catch {
    /* not a user gesture after all — leave the popup as it is */
  }
  if (surface() === 'popup') window.close();
}

/** Whether docking is even on offer — Firefox has sidebars, Chrome does not. */
export const CAN_DOCK = Boolean(ext?.sidebarAction);
